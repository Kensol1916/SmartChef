// Vercel Serverless Function — SmartChef AI Sous Chef
// Proxies user messages to OpenAI with full pantry/plan context

export default async function handler(req, res) {
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
          ...messages.slice(-20), // Keep last 20 messages for context window
        ],
        temperature: 0.7,
        max_tokens: 2000,
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
  const prefsStr = ctx.prefs ? JSON.stringify(ctx.prefs) : '{}';
  const mealPlanStr = ctx.mealPlan ? formatMealPlan(ctx.mealPlan) : 'Empty — no meals planned yet.';
  const shoppingStr = (ctx.shopping || []).map(s => `${s.name}${s.owned ? ' (have)' : ''}`).join(', ') || 'Empty';
  const savedStr = ctx.savedTitles ? ctx.savedTitles.join(', ') : 'None';
  const recipeDbSummary = ctx.recipeCount ? `${ctx.recipeCount} recipes available` : 'Recipe database loaded';

  return `You are SmartChef, an intelligent cooking and meal planning assistant built into a meal planning app.

## YOUR CAPABILITIES
- Help users plan weekly meals (7 days × 3 meals: breakfast, lunch, dinner)
- Suggest recipes based on what's in their pantry
- Modify existing meal plans based on user requests
- Answer any cooking or food-related question
- Generate complete recipes with ingredients and steps
- Adapt to dietary restrictions, preferences, and goals

## USER'S CURRENT CONTEXT

### Pantry (${pantryList.length} items):
${pantryList.length > 0 ? pantryList.join(', ') : 'Empty — suggest they add items'}

### Preferences:
${prefsStr}

### Current Week Plan:
${mealPlanStr}

### Shopping List:
${shoppingStr}

### Saved Favorites:
${savedStr}

### Recipe Database:
${recipeDbSummary}

## HOW TO RESPOND
You MUST respond with a JSON object containing:
{
  "message": "Your conversational response to the user (use **bold** for emphasis, keep it warm and helpful)",
  "recipes": [...],   // Optional: array of recipe suggestions
  "actions": [...]     // Optional: array of actions to perform in the app
}

### Recipe format (when suggesting recipes):
{
  "title": "Recipe Name",
  "emoji": "🥗",
  "meal": "breakfast|lunch|dinner|snack|dessert",
  "time": 25,
  "difficulty": "Easy|Intermediate|Hard",
  "cuisine": "Italian",
  "servings": 2,
  "ingredients": [{"name": "Chicken breast", "amount": "2 pieces", "inPantry": true}],
  "steps": ["Step 1...", "Step 2..."],
  "reason": "Why this recipe is a good match"
}

Mark each ingredient's "inPantry" as true/false based on the user's pantry above.

### Action format (when making changes):
{
  "type": "set_meal",       // Set a specific meal slot
  "day": 0-6,               // 0=Mon, 1=Tue, ... 6=Sun
  "slot": 0-2,              // 0=breakfast, 1=lunch, 2=dinner
  "recipe": { "title": "...", "emoji": "..." }
}
{
  "type": "plan_week",      // Replace entire week plan
  "plan": [                  // Array of 7 days
    { "meals": [breakfast_recipe, lunch_recipe, dinner_recipe] },
    ...
  ]
}
{
  "type": "add_shopping",   // Add items to shopping list
  "items": [{"name": "...", "amount": "..."}]
}
{
  "type": "save_recipe",    // Save a recipe to favorites
  "recipe": { "title": "...", ... }
}

## BEHAVIORAL GUIDELINES
- Prioritize ingredients the user already has in their pantry
- When suggesting multiple recipes, aim for variety (different cuisines, proteins, cooking methods)
- If the user asks to change the meal plan, return the appropriate action(s)
- If a request is vague, suggest 3 options and ask which they prefer
- Be concise but warm — you're a friendly chef, not a textbook
- When planning a full week, ensure no recipe repeats and meals are balanced
- If the user has dietary preferences (${ctx.prefs?.dietary?.join(', ') || 'none set'}), always respect them
- For "plan my week" type requests, ALWAYS return a plan_week action with all 21 meals
- For specific meal changes, return set_meal actions
- Always explain WHY you chose each recipe (pantry match, nutrition, variety, etc.)`;
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
