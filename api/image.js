// Vercel Serverless Function — SmartChef Recipe Image Resolver
// Finds a real food photo for a recipe by searching TheMealDB API
// Returns a persistent image URL that gets saved to recipe.image

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { recipes } = req.body; // Array of { id, title, cuisine, meal }
    if (!recipes || !Array.isArray(recipes)) {
      return res.status(400).json({ error: 'recipes array required' });
    }

    // Process in batches — resolve images for each recipe
    const results = await Promise.all(
      recipes.map(r => resolveImage(r))
    );

    return res.status(200).json({ images: results });
  } catch (err) {
    console.error('Image API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

async function resolveImage({ id, title, cuisine, meal }) {
  if (!title) return { id, image: null };

  // Strategy 1: Search TheMealDB by the main keyword from the title
  const keywords = extractSearchTerms(title);
  for (const term of keywords) {
    const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(term)}`;
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data.meals && data.meals.length > 0) {
          // Pick the best match based on title similarity
          const best = pickBestMatch(data.meals, title, cuisine);
          if (best && best.strMealThumb) {
            return { id, image: best.strMealThumb };
          }
        }
      }
    } catch { /* continue to next term */ }
  }

  // Strategy 2: Search by cuisine category
  if (cuisine) {
    try {
      const url = `https://www.themealdb.com/api/json/v1/1/filter.php?a=${encodeURIComponent(mapCuisineToArea(cuisine))}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data.meals && data.meals.length > 0) {
          // Pick a random-ish one based on title hash for consistency
          const hash = simpleHash(title);
          const picked = data.meals[hash % data.meals.length];
          if (picked.strMealThumb) {
            return { id, image: picked.strMealThumb };
          }
        }
      }
    } catch { /* continue */ }
  }

  // Strategy 3: Search by meal category (breakfast, dessert, etc.)
  const category = mapMealToCategory(meal, title);
  if (category) {
    try {
      const url = `https://www.themealdb.com/api/json/v1/1/filter.php?c=${encodeURIComponent(category)}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        if (data.meals && data.meals.length > 0) {
          const hash = simpleHash(title);
          const picked = data.meals[hash % data.meals.length];
          if (picked.strMealThumb) {
            return { id, image: picked.strMealThumb };
          }
        }
      }
    } catch { /* continue */ }
  }

  // No image found
  return { id, image: null };
}

function extractSearchTerms(title) {
  // Extract meaningful food keywords from recipe titles
  const lower = title.toLowerCase();
  const words = lower.split(/[\s,&\-–—]+/).filter(w => w.length > 2);

  // Remove generic words
  const skip = new Set(['with', 'and', 'the', 'for', 'from', 'style', 'homemade', 'easy', 'quick', 'simple', 'best', 'classic', 'fresh', 'warm', 'cold', 'hot', 'spicy', 'sweet', 'savory', 'crispy', 'creamy', 'light', 'hearty', 'bowl', 'plate', 'baked', 'grilled', 'roasted', 'fried', 'steamed', 'sauteed']);
  const foodWords = words.filter(w => !skip.has(w));

  // Build search terms: full title first, then key food words
  const terms = [title];

  // Add the main protein/ingredient (usually the first noun)
  const proteins = ['chicken', 'salmon', 'beef', 'fish', 'shrimp', 'lamb', 'pork', 'turkey', 'tuna', 'cod', 'tofu', 'egg', 'eggs', 'lentil', 'lentils', 'chickpea', 'bean', 'beans'];
  const dishes = ['pasta', 'pizza', 'soup', 'salad', 'stew', 'curry', 'rice', 'sandwich', 'wrap', 'taco', 'burrito', 'burger', 'pancake', 'omelette', 'frittata', 'risotto', 'couscous', 'quinoa', 'noodle', 'noodles', 'bread', 'cake', 'pie', 'pudding', 'smoothie', 'oatmeal', 'porridge', 'yogurt'];

  for (const word of foodWords) {
    if (proteins.includes(word) || dishes.includes(word)) {
      terms.push(word);
    }
  }

  // Add 2-word combos
  if (foodWords.length >= 2) {
    terms.push(foodWords.slice(0, 2).join(' '));
  }

  return [...new Set(terms)].slice(0, 4); // Max 4 search attempts
}

function pickBestMatch(meals, title, cuisine) {
  const titleLower = title.toLowerCase();
  const titleWords = new Set(titleLower.split(/\s+/));

  let best = null;
  let bestScore = -1;

  for (const meal of meals) {
    const mealLower = (meal.strMeal || '').toLowerCase();
    const mealWords = mealLower.split(/\s+/);

    // Score: count how many words overlap
    let score = 0;
    for (const w of mealWords) {
      if (titleWords.has(w)) score += 2;
    }

    // Bonus for matching cuisine area
    if (cuisine && meal.strArea && meal.strArea.toLowerCase().includes(cuisine.toLowerCase())) {
      score += 3;
    }

    // Bonus for matching category
    if (meal.strCategory) {
      const cat = meal.strCategory.toLowerCase();
      if (titleLower.includes(cat)) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      best = meal;
    }
  }

  return best;
}

function mapCuisineToArea(cuisine) {
  const map = {
    'italian': 'Italian', 'mexican': 'Mexican', 'chinese': 'Chinese',
    'japanese': 'Japanese', 'indian': 'Indian', 'thai': 'Thai',
    'french': 'French', 'greek': 'Greek', 'spanish': 'Spanish',
    'moroccan': 'Moroccan', 'turkish': 'Turkish', 'vietnamese': 'Vietnamese',
    'korean': 'Korean', 'british': 'British', 'american': 'American',
    'mediterranean': 'Italian', 'middle eastern': 'Egyptian',
    'lebanese': 'Egyptian', 'egyptian': 'Egyptian', 'syrian': 'Egyptian',
  };
  return map[(cuisine || '').toLowerCase()] || cuisine || 'American';
}

function mapMealToCategory(meal, title) {
  const lower = (meal || '').toLowerCase();
  const titleLower = (title || '').toLowerCase();
  if (lower === 'breakfast') return 'Breakfast';
  if (lower === 'dessert' || titleLower.includes('cake') || titleLower.includes('pudding')) return 'Dessert';
  if (titleLower.includes('pasta') || titleLower.includes('spaghetti')) return 'Pasta';
  if (titleLower.includes('chicken')) return 'Chicken';
  if (titleLower.includes('beef') || titleLower.includes('steak')) return 'Beef';
  if (titleLower.includes('lamb')) return 'Lamb';
  if (titleLower.includes('fish') || titleLower.includes('salmon') || titleLower.includes('cod')) return 'Seafood';
  if (titleLower.includes('vegetable') || titleLower.includes('vegan')) return 'Vegetarian';
  return lower === 'dinner' ? 'Miscellaneous' : null;
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
