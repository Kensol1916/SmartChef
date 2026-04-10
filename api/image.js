// Vercel Serverless Function — SmartChef Recipe Image Resolver
// Policy:
// - Prefer correctness over coverage.
// - Return null (emoji fallback in UI) instead of a likely wrong photo.
// - Use curated overrides for high-visibility recipes.

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { recipes } = req.body
    if (!recipes || !Array.isArray(recipes)) {
      return res.status(400).json({ error: 'recipes array required' })
    }

    const results = await Promise.all(recipes.map(r => resolveImage(r)))
    return res.status(200).json({ images: results })
  } catch (err) {
    console.error('Image API error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}

const CURATED_IMAGE_OVERRIDES = {
  [normalizeTitle('Spaghetti Aglio e Olio')]: 'https://images.unsplash.com/photo-1551183053-bf91a1d81141?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Mediterranean Chickpea Bowl')]: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Quick Miso Ramen')]: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Lemon Herb Roast Chicken')]: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('One-Pan Shakshuka')]: 'https://images.unsplash.com/photo-1590412200988-a436970781fa?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Fluffy Buttermilk Pancakes')]: 'https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Chickpea Curry')]: 'https://images.unsplash.com/photo-1585937421612-70a008356fbe?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Fish Tacos')]: 'https://images.unsplash.com/photo-1551504734-5ee1c4a1479b?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Lentil Soup')]: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Margherita Pizza')]: 'https://images.unsplash.com/photo-1598103442097-8b74394b95c3?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Chicken Shawarma Wrap')]: 'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Veggie Frittata')]: 'https://images.unsplash.com/photo-1510693206972-df098062cb71?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Pad Thai')]: 'https://images.unsplash.com/photo-1559314809-0d155014e29e?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Beef Stir-Fry')]: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Creamy Mushroom Pasta')]: 'https://images.unsplash.com/photo-1555949258-eb67b1ef0ceb?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Burrito Bowl')]: 'https://images.unsplash.com/photo-1543352634-a1c51d613f26?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Ratatouille')]: 'https://images.unsplash.com/photo-1572453800999-e8d2d1589b7c?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Tom Yum Soup')]: 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Greek Salad')]: 'https://images.unsplash.com/photo-1540189549519-8bf0c5e5d0e3?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Avocado Toast')]: 'https://images.unsplash.com/photo-1588566565463-180a5a8f1ac1?auto=format&fit=crop&w=800&q=80',
  [normalizeTitle('Avocado Toast with Lemon')]: 'https://images.unsplash.com/photo-1588566565463-180a5a8f1ac1?auto=format&fit=crop&w=800&q=80',
}

const NOISE_WORDS = new Set([
  'a', 'an', 'and', 'the', 'of', 'for', 'with', 'from', 'style', 'easy', 'quick', 'simple', 'best',
  'fresh', 'warm', 'cold', 'hot', 'sweet', 'savory', 'light', 'hearty', 'one', 'pan',
])

const KEY_FOOD_WORDS = new Set([
  'chicken', 'beef', 'fish', 'salmon', 'shrimp', 'taco', 'tacos', 'pizza', 'pasta', 'spaghetti',
  'ramen', 'soup', 'curry', 'salad', 'wrap', 'sandwich', 'bowl', 'omelette', 'omelet', 'frittata',
  'shakshuka', 'pancake', 'pancakes', 'lentil', 'chickpea', 'mushroom', 'burrito', 'toast', 'yogurt',
])

async function resolveImage({ id, title, cuisine, meal }) {
  if (!title) return { id, image: null }

  const normalized = normalizeTitle(title)
  const curated = CURATED_IMAGE_OVERRIDES[normalized]
  if (curated) return { id, image: curated }

  const terms = extractSearchTerms(title)
  let best = null

  for (const term of terms) {
    const data = await fetchMealDbSearch(term)
    if (!data?.meals?.length) continue
    const candidate = pickBestMatch(data.meals, title, cuisine)
    if (!candidate) continue
    if (!best || candidate.score > best.score) best = candidate
  }

  if (best && isHighConfidenceMatch(best)) {
    return { id, image: best.meal.strMealThumb }
  }

  if (best && isMediumConfidenceMatch(best)) {
    return { id, image: best.meal.strMealThumb }
  }

  // Fallback A: cuisine area list (text-scored, not random).
  const area = mapCuisineToArea(cuisine)
  if (area) {
    const list = await fetchMealDbFilter('a', area)
    const candidate = pickBestFromFilterList(list?.meals || [], title)
    if (candidate && isUsableFallback(candidate)) {
      return { id, image: candidate.meal.strMealThumb }
    }
  }

  // Fallback B: meal category list (text-scored, not random).
  const category = mapMealToCategory(meal, title)
  if (category) {
    const list = await fetchMealDbFilter('c', category)
    const candidate = pickBestFromFilterList(list?.meals || [], title)
    if (candidate && isUsableFallback(candidate)) {
      return { id, image: candidate.meal.strMealThumb }
    }
  }

  // No decent match: fall back to emoji in UI.
  return { id, image: null }
}

async function fetchMealDbSearch(term) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3500)
  try {
    const url = `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(term)}`
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchMealDbFilter(param, value) {
  if (!param || !value) return null
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 3500)
  try {
    const url = `https://www.themealdb.com/api/json/v1/1/filter.php?${param}=${encodeURIComponent(value)}`
    const resp = await fetch(url, { signal: controller.signal })
    if (!resp.ok) return null
    return await resp.json()
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function extractSearchTerms(title) {
  const tokens = tokenize(title).filter(t => !NOISE_WORDS.has(t))
  const terms = [title.trim()]

  // Phrase term often helps for multi-word dishes.
  if (tokens.length >= 2) terms.push(tokens.slice(0, 2).join(' '))

  // Add important single-word dish/protein hints.
  for (const t of tokens) {
    if (KEY_FOOD_WORDS.has(t)) terms.push(t)
  }

  return [...new Set(terms)].filter(Boolean).slice(0, 5)
}

function pickBestMatch(meals, title, cuisine) {
  const titleNorm = normalizeTitle(title)
  const titleTokens = tokenize(titleNorm)
  const titleTokenSet = new Set(titleTokens)
  const titleKeywords = titleTokens.filter(t => KEY_FOOD_WORDS.has(t))
  const cuisineNorm = normalizeTitle(cuisine || '')

  let best = null

  for (const meal of meals) {
    const mealName = meal?.strMeal || ''
    const mealNorm = normalizeTitle(mealName)
    const mealTokens = tokenize(mealNorm)
    const mealTokenSet = new Set(mealTokens)

    let overlap = 0
    for (const t of titleTokenSet) if (mealTokenSet.has(t)) overlap++

    let keywordOverlap = 0
    for (const t of titleKeywords) if (mealTokenSet.has(t)) keywordOverlap++

    const exact = mealNorm === titleNorm
    const prefixMatch = mealNorm.startsWith(titleNorm) || titleNorm.startsWith(mealNorm)
    const cuisineBonus = cuisineNorm && normalizeTitle(meal.strArea || '').includes(cuisineNorm) ? 2 : 0
    const score = (exact ? 12 : 0) + (prefixMatch ? 4 : 0) + (overlap * 2) + (keywordOverlap * 3) + cuisineBonus

    if (!meal.strMealThumb) continue
    if (!best || score > best.score) {
      best = { meal, score, overlap, keywordOverlap, exact, prefixMatch }
    }
  }

  return best
}

function pickBestFromFilterList(meals, title) {
  if (!Array.isArray(meals) || meals.length === 0) return null
  const titleNorm = normalizeTitle(title)
  const titleTokens = tokenize(titleNorm)
  const titleTokenSet = new Set(titleTokens)
  const titleKeywords = titleTokens.filter(t => KEY_FOOD_WORDS.has(t))

  let best = null
  for (const meal of meals) {
    if (!meal?.strMealThumb) continue
    const mealTokens = tokenize(meal.strMeal || '')
    const mealTokenSet = new Set(mealTokens)

    let overlap = 0
    for (const t of titleTokenSet) if (mealTokenSet.has(t)) overlap++

    let keywordOverlap = 0
    for (const t of titleKeywords) if (mealTokenSet.has(t)) keywordOverlap++

    const exact = normalizeTitle(meal.strMeal || '') === titleNorm
    const score = (exact ? 8 : 0) + (overlap * 2) + (keywordOverlap * 3)

    if (!best || score > best.score) {
      best = { meal, score, overlap, keywordOverlap, exact, prefixMatch: false }
    }
  }
  return best
}

function isHighConfidenceMatch(candidate) {
  if (!candidate?.meal?.strMealThumb) return false
  if (candidate.exact) return true
  if (candidate.keywordOverlap >= 2 && candidate.overlap >= 2) return true
  if (candidate.keywordOverlap >= 1 && candidate.overlap >= 1 && candidate.score >= 8) return true
  if (candidate.prefixMatch && candidate.overlap >= 1 && candidate.score >= 8) return true
  if (candidate.overlap >= 3 && candidate.score >= 8) return true
  return false
}

function isMediumConfidenceMatch(candidate) {
  if (!candidate?.meal?.strMealThumb) return false
  if (candidate.score >= 7 && candidate.overlap >= 1) return true
  if (candidate.keywordOverlap >= 1 && candidate.score >= 6) return true
  return false
}

function isUsableFallback(candidate) {
  if (!candidate?.meal?.strMealThumb) return false
  if (candidate.exact) return true
  if (candidate.keywordOverlap >= 1 && candidate.score >= 5) return true
  if (candidate.overlap >= 2 && candidate.score >= 4) return true
  return false
}

function mapCuisineToArea(cuisine) {
  const c = normalizeTitle(cuisine || '')
  if (!c) return null
  const map = {
    italian: 'Italian',
    mexican: 'Mexican',
    chinese: 'Chinese',
    japanese: 'Japanese',
    indian: 'Indian',
    thai: 'Thai',
    french: 'French',
    greek: 'Greek',
    spanish: 'Spanish',
    moroccan: 'Moroccan',
    turkish: 'Turkish',
    vietnamese: 'Vietnamese',
    korean: 'Korean',
    british: 'British',
    american: 'American',
    mediterranean: 'Italian',
    'middle eastern': 'Egyptian',
    lebanese: 'Egyptian',
    syrian: 'Egyptian',
  }
  return map[c] || null
}

function mapMealToCategory(meal, title) {
  const m = normalizeTitle(meal || '')
  const t = normalizeTitle(title || '')
  if (m === 'breakfast') return 'Breakfast'
  if (m === 'dessert' || t.includes('cake') || t.includes('pudding') || t.includes('cookie')) return 'Dessert'
  if (t.includes('pizza')) return 'Miscellaneous'
  if (t.includes('pasta') || t.includes('spaghetti')) return 'Pasta'
  if (t.includes('chicken')) return 'Chicken'
  if (t.includes('beef') || t.includes('steak')) return 'Beef'
  if (t.includes('fish') || t.includes('salmon') || t.includes('cod') || t.includes('shrimp')) return 'Seafood'
  if (t.includes('lamb')) return 'Lamb'
  return null
}

function normalizeTitle(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function tokenize(input) {
  const norm = normalizeTitle(input)
  return norm ? norm.split(/\s+/).filter(Boolean) : []
}
