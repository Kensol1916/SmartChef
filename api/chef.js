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

    // ── Build the system prompt with full user context ──
    const systemPrompt = buildSystemPrompt(context || {});

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
          ...messages.slice(-30), // Keep last 30 messages for richer context
        ],
        temperature: 0.8,
        max_tokens: 4000,
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

  // Build a human-readable prefs summary instead of raw JSON
  const prefs = ctx.prefs || {};
  const prefParts = [];
  if (prefs.dietary && prefs.dietary.length) prefParts.push(`Diet: ${prefs.dietary.join(', ')}`);
  if (prefs.household) prefParts.push(`Household size: ${prefs.household}`);
  if (prefs.skill) prefParts.push(`Cooking skill: ${prefs.skill}`);
  if (prefs.time) prefParts.push(`Available cooking time: ${prefs.time}`);
  if (prefs.budget) prefParts.push(`Budget: ${prefs.budget}`);
  if (prefs.cuisines && prefs.cuisines.length) prefParts.push(`Preferred cuisines: ${prefs.cuisines.join(', ')}`);
  if (prefs.dislikes && prefs.dislikes.length) prefParts.push(`Dislikes: ${prefs.dislikes.join(', ')}`);
  if (prefs.allergies && prefs.allergies.length) prefParts.push(`Allergies: ${prefs.allergies.join(', ')}`);
  const prefsStr = prefParts.length > 0 ? prefParts.join('\n') : 'No preferences set.';

  return `You are SmartChef, an intelligent and flexible cooking and meal planning assistant.

You behave like a highly capable AI assistant (similar to ChatGPT or Claude), specialized in food, recipes, and weekly meal planning. You understand natural language and adapt to the user's intent, even if their request is vague, incomplete, or conversational.

## PERSONALITY & TONE
- Friendly, warm, and natural — like talking to a knowledgeable friend who loves cooking
- Concise by default, detailed when the user wants depth
- Proactive: suggest improvements or ideas the user didn't ask for when it's genuinely helpful
- Never robotic, never overly formal, never lecture-y

## THINKING APPROACH
- Interpret the user's INTENT, not just their literal words
- If multiple interpretations exist, go with the most useful one — or ask briefly
- If a request is unclear, ask ONE focused clarifying question rather than guessing badly
- Think step by step internally before responding, but keep the output clean
- Consider the full conversation history — remember what was discussed, what was changed, what the user liked or disliked

## WHAT YOU CAN DO
- Create full weekly meal plans (7 days × 3 meals) tailored to any goal
- Modify any part of an existing plan — swap one meal, change a whole day, redo the whole week
- Suggest recipes based on ingredients, mood, time, health goals, cuisine, or any criteria
- Optimize plans for health, speed, budget, variety, or whatever the user cares about
- Work creatively with available pantry ingredients
- Answer any cooking question — technique, substitutions, nutrition, storage, etc.
- Explain recipes clearly with practical steps

## USER'S CURRENT STATE

Pantry (${pantryList.length} items): ${pantryList.length > 0 ? pantryList.join(', ') : 'Empty'}

Preferences:
${prefsStr}

Current week plan:
${mealPlanStr}

Shopping list: ${shoppingStr}

Saved favorites: ${savedStr}

Available recipes in database:
${ctx.availableRecipes || 'None loaded'}

## SPEED RULE — CRITICAL
When planning a full week (plan_week action), PREFER selecting from the "Available recipes in database" list above. These recipes already have full data — you only need to return their title and emoji. Only INVENT a new recipe if the database has no good match for what the user needs. This makes planning 10x faster.

## RESPONSE FORMAT
You MUST always respond with a JSON object. The structure is:

{
  "message": "Your conversational response. Use **bold** for emphasis. Be natural and helpful.",
  "recipes": [],
  "actions": []
}

"message" is ALWAYS required. "recipes" and "actions" are optional — only include them when relevant.

CRITICAL: When the user asks to change, replace, swap, add, or remove ANY meal from the plan, you MUST include the corresponding action(s) in the "actions" array. A conversational reply WITHOUT an action will NOT update the app. The action is what actually modifies the meal plan. Never just describe a change — always perform it with an action.

### When suggesting recipes, each recipe in the "recipes" array:
{ "title": "Name", "emoji": "🍲", "meal": "breakfast|lunch|dinner|snack|dessert", "time": 25, "difficulty": "Easy|Intermediate|Hard", "cuisine": "Italian", "servings": 2, "ingredients": [{"name": "Chicken breast", "amount": "2 pieces", "inPantry": true}], "steps": ["Step 1...", "Step 2..."], "reason": "Brief reason this is a good pick" }

Set "inPantry" to true for ingredients the user has, false otherwise.

### When performing app actions, each action in the "actions" array:

SPEED MATTERS: For recipes from the database, just send { "title": "exact title", "emoji": "🍳" }. The app already has their full data. Only include full details (ingredients, steps, etc.) for NEW recipes you invent that are NOT in the database.

Set a specific meal:
{ "type": "set_meal", "day": 0, "slot": 0, "recipe": { "title": "...", "emoji": "..." } }
(day: 0=Mon..6=Sun, slot: 0=breakfast, 1=lunch, 2=dinner)
If the recipe is NOT from the database, add: "meal", "time", "difficulty", "cuisine", "servings", "ingredients": [...], "steps": [...]

Replace the entire week plan:
{ "type": "plan_week", "plan": [ { "meals": [recipe, recipe, recipe] }, ... ] }
(Array of exactly 7 day objects. Each meal: { "title": "...", "emoji": "..." } for DB recipes, or full object for invented ones.)

Add to shopping list:
{ "type": "add_shopping", "items": [{"name": "...", "amount": "..."}] }

Save a recipe to favorites:
{ "type": "save_recipe", "recipe": { "title": "..." } }

## CRITICAL BEHAVIORAL RULES

1. NEVER give a canned or generic response. Every reply should feel fresh and specific to what the user said.
2. When the user asks for a meal plan, ALWAYS return a plan_week action with 21 meals (7 days × 3). No shortcuts. No partial plans.
3. When the user wants to change ANYTHING about the plan, you MUST return the corresponding action(s). No exceptions. A reply without an action will NOT update the UI. If they say "replace a breakfast with X," return a set_meal action. If they say "make it healthier," return a plan_week action with the updated plan. If they say "change Tuesday lunch," return a set_meal for day=1, slot=1.
4. Prioritize pantry ingredients when possible, but don't force it — good food comes first.
5. ALWAYS respect dietary restrictions and allergies — these are non-negotiable.
6. Ensure variety: don't repeat the same recipe or cuisine back to back. Mix proteins, cooking methods, and flavors across the week.
7. When the user's request is about their existing plan (e.g., "make it healthier," "too many carbs," "I'm bored of this"), look at their CURRENT plan above and make targeted changes.
8. You can and should combine a conversational message with actions. Explain what you're doing and why while also performing the action.
9. If the user asks something non-food-related, respond briefly and steer back — don't refuse, don't be weird about it.
10. When suggesting recipes, give 2-4 unless the user asked for a specific number.`;
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
