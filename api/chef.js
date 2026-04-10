// Vercel Serverless Function — SmartChef AI Sous Chef
// Proxies user messages to OpenAI with full pantry/plan context

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY not configured' });

  try {
    const { messages, context } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array required' });
    }

    const latestUserText = getLatestUserMessage(messages);
    const ctx = context || {};

    // Fast path: generate a full week plan from DB titles without an LLM call.
    // This removes model latency for common "plan my week" requests.
    if (shouldFastPlanWeek(latestUserText, ctx)) {
      const fast = buildFastWeekPlanResponse(ctx, latestUserText);
      if (fast) return res.status(200).json(fast);
    }

    // ── Build the system prompt with full user context ──
    const systemPrompt = buildSystemPrompt(ctx);

    // ── Call OpenAI ──
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-8), // Keep context compact for lower latency
        ],
        temperature: 0.2,
        max_tokens: 1000,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('OpenAI error:', err);
      return res.status(502).json({ error: 'LLM request failed', details: err });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ error: 'Empty LLM response' });
    }

    // Parse JSON response from the LLM
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      // If the LLM didn't return valid JSON, wrap the text
      parsed = { message: content, actions: [] };
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Chef API error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}

function buildSystemPrompt(ctx) {
  const pantryList = (ctx.pantry || []).map(p => typeof p === 'string' ? p : p.name || '').filter(Boolean);
  const mealPlanStr = ctx.mealPlan ? formatMealPlan(ctx.mealPlan) : 'No meals planned yet.';
  const shoppingStr = (ctx.shopping || []).map(s => `${s.name}${s.owned ? ' (have)' : ''}`).join(', ') || 'Empty';
  const savedStr = ctx.savedTitles ? ctx.savedTitles.join(', ') : 'None';
  const availableRecipesStr = compactRecipeList(ctx.availableRecipes);

  const prefs = ctx.prefs || {};
  const prefParts = [];
  if (prefs.dietary && prefs.dietary.length) prefParts.push(`Diet: ${prefs.dietary.join(', ')}`);
  if (prefs.household) prefParts.push(`Household size: ${prefs.household}`);
  if (prefs.skill) prefParts.push(`Cooking skill: ${prefs.skill}`);
  if (prefs.maxTime || prefs.time) prefParts.push(`Available cooking time: ${prefs.maxTime || prefs.time} minutes`);
  if (prefs.budget) prefParts.push(`Budget: ${prefs.budget}`);
  if (prefs.cuisines && prefs.cuisines.length) prefParts.push(`Preferred cuisines: ${prefs.cuisines.join(', ')}`);
  if (prefs.dislikes && prefs.dislikes.length) prefParts.push(`Dislikes: ${prefs.dislikes.join(', ')}`);
  if (prefs.allergies && prefs.allergies.length) prefParts.push(`Allergies: ${prefs.allergies.join(', ')}`);
  const prefsStr = prefParts.length > 0 ? prefParts.join('\n') : 'No preferences set.';

  return `You are SmartChef, a cooking and weekly meal-planning assistant.

Return ONLY a JSON object:
{
  "message": "Required conversational response",
  "recipes": [],
  "actions": []
}

Core rules:
1. "message" is required every time.
2. If the user asks for a full weekly plan, include a "plan_week" action with exactly 7 days x 3 meals.
3. If the user asks to change/add/remove/swap plan items, include corresponding action(s). Text alone does not update UI.
4. Prefer recipes from AVAILABLE_DB_RECIPES. For DB meals, use compact objects:
   { "title": "exact title", "emoji": "🍳" }
5. Only invent new recipes when the DB list is not a good fit.
6. Respect dietary restrictions, allergies, and time constraints.
7. Keep responses concise and practical.

Action formats:
- set_meal:
  { "type": "set_meal", "day": 0, "slot": 0, "recipe": { "title": "...", "emoji": "..." } }
- plan_week:
  { "type": "plan_week", "plan": [ { "meals": [recipe, recipe, recipe] }, ... ] }
- add_shopping:
  { "type": "add_shopping", "items": [{ "name": "...", "amount": "..." }] }
- save_recipe:
  { "type": "save_recipe", "recipe": { "title": "..." } }

If you invent a recipe (not in DB), include full details:
"meal", "time", "difficulty", "cuisine", "servings", "ingredients", "steps".

User state:
- Pantry (${pantryList.length} items): ${pantryList.length > 0 ? pantryList.join(', ') : 'Empty'}
- Preferences:
${prefsStr}
- Current week plan:
${mealPlanStr}
- Shopping list: ${shoppingStr}
- Saved favorites: ${savedStr}
- AVAILABLE_DB_RECIPES:
${availableRecipesStr || 'None loaded'}`;
}

function compactRecipeList(listStr) {
  const items = String(listStr || '').split(',').map(s => s.trim()).filter(Boolean);
  if (items.length === 0) return '';
  const maxItems = 40;
  if (items.length <= maxItems) return items.join(', ');
  return `${items.slice(0, maxItems).join(', ')}, ...`;
}

function getLatestUserMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === 'user' && typeof m.content === 'string') return m.content;
  }
  return '';
}

function shouldFastPlanWeek(userText, ctx) {
  const txt = String(userText || '').toLowerCase();
  if (!txt) return false;

  const asksWeekPlan =
    /(plan|build|create|make|generate).{0,25}(week|weekly)/i.test(txt) ||
    /week plan|plan my week|meal plan|weekly meals/i.test(txt);
  if (!asksWeekPlan) return false;

  // Let LLM handle nuanced edit requests.
  const editIntent = /(replace|swap|change|update|edit|remove|instead|regenerate|healthier|higher protein|lower carb)/i.test(txt);
  if (editIntent) return false;

  // Fast path is best when planning from scratch or mostly empty weeks.
  const filledMeals = ((ctx.mealPlan || []).reduce((acc, d) => {
    const meals = (d?.meals || []).filter(Boolean).length;
    return acc + meals;
  }, 0));
  return filledMeals <= 4;
}

function buildFastWeekPlanResponse(ctx, userText) {
  const pool = parseAvailableRecipes(ctx.availableRecipes || '');
  if (pool.length < 18) return null;

  const byMeal = { breakfast: [], lunch: [], dinner: [] };
  for (const r of pool) {
    if (r.meal === 'breakfast') byMeal.breakfast.push(r);
    else if (r.meal === 'lunch' || r.meal === 'salad' || r.meal === 'snack') byMeal.lunch.push(r);
    else byMeal.dinner.push(r);
  }

  const all = pool.map(r => ({ title: r.title, emoji: '🍽️' }));
  const seed = simpleHash(`${userText}|${(ctx.pantry || []).length}|${(ctx.savedTitles || []).length}`);

  const pick = (arr, idx) => {
    if (!arr || arr.length === 0) return all[idx % all.length];
    return arr[idx % arr.length];
  };

  const breakfasts = rotate(byMeal.breakfast.length ? byMeal.breakfast : all, seed % 17);
  const lunches = rotate(byMeal.lunch.length ? byMeal.lunch : all, seed % 23);
  const dinners = rotate(byMeal.dinner.length ? byMeal.dinner : all, seed % 29);

  const plan = Array.from({ length: 7 }, (_, i) => ({
    meals: [
      { title: pick(breakfasts, i).title, emoji: pick(breakfasts, i).emoji || '🍽️' },
      { title: pick(lunches, i).title, emoji: pick(lunches, i).emoji || '🍽️' },
      { title: pick(dinners, i).title, emoji: pick(dinners, i).emoji || '🍽️' },
    ],
  }));

  return {
    message: 'Built a full week plan from your recipe library. You can ask me to swap any meal.',
    actions: [{ type: 'plan_week', plan }],
  };
}

function parseAvailableRecipes(listStr) {
  return String(listStr || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .map(entry => {
      const m = entry.match(/^(.*)\[(.*?)\]\s*$/);
      if (m) {
        const title = m[1].trim();
        const meal = m[2].trim().toLowerCase();
        return title ? { title, meal, emoji: '🍽️' } : null;
      }
      return { title: entry, meal: 'any', emoji: '🍽️' };
    })
    .filter(Boolean);
}

function rotate(arr, offset) {
  if (!arr || arr.length === 0) return [];
  const o = Math.abs(offset || 0) % arr.length;
  return [...arr.slice(o), ...arr.slice(0, o)];
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function formatMealPlan(plan) {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const slots = ['Breakfast', 'Lunch', 'Dinner'];
  return plan.map((d, i) => {
    const meals = (d.meals || []).map((m, j) => {
      if (!m) return `  ${slots[j]}: empty`;
      return `  ${slots[j]}: ${m.emoji || ''} ${m.title || 'Unknown'}`;
    }).join('\n');
    return `${days[i]}:\n${meals}`;
  }).join('\n');
}
