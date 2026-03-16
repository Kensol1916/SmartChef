# SmartChef — Manual Image Priority Queue

Use this list to add verified images to the most visible recipes.
Current system: emoji fallback for all recipes below until a verified image is manually assigned.

## How to add an image

1. Search Unsplash using the **Search Phrase** column
2. Find a static photo URL: `https://images.unsplash.com/photo-XXXXXXXXXX?auto=format&fit=crop&w=800&q=80`
3. Add the entry to `IMAGE_MAP` in `smartchef.jsx`: `{ID}: '{URL}', // {Recipe Name}`
4. Extract the photo ID prefix (digits after `photo-`, before any `-`)
5. Add to `PHOTO_CATS`: `'{prefix}': '{PHOTO_CATS Label}',`
6. Add a matching rule to `imgAllowedForRecipe` for the new category
7. Rebuild: `esbuild smartchef.jsx --bundle --platform=browser --global-name=SmartChef --outfile=smartchef.bundle.js --minify --external:react --external:react-dom`

## Rules

- ONE unique photo per recipe — never reuse the same photo across unrelated dishes
- Wrong image is worse than emoji fallback
- Verify the photo actually shows the dish before adding
- Items marked "reuse existing photo category" can share a PHOTO_CATS label but MUST use a different photo URL

---

## Priority Queue (top 30)

| # | ID | Recipe | Meal | Cuisine | Dish Type | Unsplash Search Phrase | PHOTO_CATS Label | Fallback Until Verified? |
|---|-----|--------|------|---------|-----------|----------------------|-----------------|--------------------------|
| 1 | 12 | Veggie Frittata | breakfast | Italian | frittata | `vegetable frittata eggs pan` | `frittata` | YES |
| 2 | 22 | Spinach Mushroom Omelette | breakfast | Mediterranean | omelette | `spinach mushroom omelette plate` | `omelette` | YES |
| 3 | 23 | Avocado Toast with Lemon | breakfast | Modern | avocado toast | `avocado toast sourdough plate` | `avocado_toast` | NO — find a 2nd avocado toast photo |
| 4 | 25 | Banana Oat Pancakes | breakfast | American | pancakes | `banana oat pancakes stack plate` | `pancakes` | NO — find a 2nd pancakes photo |
| 5 | 26 | Shakshuka | breakfast | Middle Eastern | shakshuka | `shakshuka eggs tomato pan` | `shakshuka` | YES |
| 6 | 27 | Cottage Cheese Berry Bowl | breakfast | Modern | cottage cheese bowl | `cottage cheese berry bowl breakfast` | `cottage_cheese_bowl` | YES |
| 7 | 28 | Tomato Basil Toast | breakfast | Italian | bruschetta toast | `tomato basil bruschetta toast` | `tomato_toast` | YES |
| 8 | 30 | Veggie Breakfast Wrap | breakfast | Mexican | breakfast wrap | `veggie breakfast burrito wrap` | `breakfast_wrap` | YES |
| 9 | 31 | Chia Almond Pudding | breakfast | Modern | chia pudding | `chia seed pudding almond jar` | `chia_pudding` | YES |
| 10 | 32 | Zucchini Frittata | breakfast | Italian | frittata | `zucchini frittata slice plate` | `frittata` | YES |
| 11 | 2 | Mediterranean Chickpea Bowl | lunch | Mediterranean | grain bowl | `mediterranean chickpea bowl feta` | `grain_bowl` | YES |
| 12 | 3 | Quick Miso Ramen | lunch | Japanese | ramen | `miso ramen noodle bowl egg` | `ramen` | YES |
| 13 | 9 | Lentil Soup | lunch | Mediterranean | lentil soup | `red lentil soup bowl` | `lentil_soup` | YES |
| 14 | 11 | Chicken Shawarma Wrap | lunch | Middle Eastern | shawarma wrap | `chicken shawarma wrap pita` | `shawarma` | YES |
| 15 | 13 | Pad Thai | lunch | Thai | pad thai | `pad thai noodles shrimp plate` | `pad_thai` | YES |
| 16 | 16 | Burrito Bowl | lunch | Mexican | burrito bowl | `burrito bowl rice beans` | `burrito_bowl` | YES |
| 17 | 18 | Tom Yum Soup | lunch | Thai | tom yum | `tom yum soup shrimp thai` | `tom_yum` | YES |
| 18 | 53 | Lentil Soup | lunch | Mediterranean | lentil soup | `lentil soup bread bowl` | `lentil_soup` | YES |
| 19 | 56 | Falafel Wrap | lunch | Middle Eastern | falafel wrap | `falafel wrap pita hummus` | `falafel` | YES |
| 20 | 59 | Black Bean Tacos | lunch | Mexican | tacos | `black bean tacos corn tortilla` | `tacos` | NO — find a 2nd tacos photo |
| 21 | 62 | Minestrone Soup | lunch | Italian | minestrone | `minestrone soup italian vegetables` | `minestrone` | YES |
| 22 | 1 | Spaghetti Aglio e Olio | dinner | Italian | spaghetti | `spaghetti aglio e olio garlic plate` | `spaghetti` | YES |
| 23 | 7 | Chickpea Curry | dinner | Indian | curry | `chickpea curry indian bowl` | `curry` | YES |
| 24 | 14 | Beef Stir-Fry | dinner | Chinese | stir-fry | `beef stir fry wok vegetables` | `stir_fry` | YES |
| 25 | 15 | Creamy Mushroom Pasta | dinner | Italian | mushroom pasta | `creamy mushroom pasta plate` | `mushroom_pasta` | YES |
| 26 | 17 | Ratatouille | dinner | French | ratatouille | `ratatouille vegetable dish` | `ratatouille` | YES |
| 27 | 21 | Carbonara | dinner | Italian | carbonara | `spaghetti carbonara egg bacon` | `carbonara` | YES |
| 28 | 54 | Margherita Pizza | dinner | Italian | pizza | `margherita pizza fresh basil` | `pizza` | NO — find a 2nd pizza photo |
| 29 | 55 | Chickpea Curry | dinner | Indian | curry | `chickpea chana masala curry bowl` | `curry` | YES |
| 30 | 57 | Pad Thai | dinner | Thai | pad thai | `pad thai noodles lime peanut` | `pad_thai` | YES |

---

## New PHOTO_CATS categories needed

These categories don't exist yet in the codebase. Each needs a new entry in `PHOTO_CATS` and a new rule in `imgAllowedForRecipe`:

| Category Label | Dishes it covers | imgAllowedForRecipe regex |
|---|---|---|
| `frittata` | frittata, egg bake | `/\bfrittata\b\|egg\s*bake/` |
| `omelette` | omelette, omelet | `/\bomelette?\b\|omelet/` |
| `shakshuka` | shakshuka, menemen | `/\bshakshuka\b\|menemen/` |
| `cottage_cheese_bowl` | cottage cheese bowl | `/cottage\s*cheese.*bowl/` |
| `tomato_toast` | tomato toast, bruschetta | `/tomato.*toast\|bruschetta/` |
| `breakfast_wrap` | breakfast wrap, breakfast burrito | `/breakfast.*wrap\|breakfast.*burrito/` |
| `chia_pudding` | chia pudding | `/chia.*pud/` |
| `grain_bowl` | chickpea bowl, grain bowl, buddha bowl | `/chickpea.*bowl\|grain.*bowl\|buddha.*bowl/` |
| `ramen` | ramen, miso ramen | `/\bramen\b/` |
| `lentil_soup` | lentil soup, dal soup | `/lentil.*soup\|dal\b/` |
| `shawarma` | shawarma, chicken wrap | `/\bshawarma\b/` |
| `pad_thai` | pad thai | `/pad\s*thai/` |
| `burrito_bowl` | burrito bowl | `/burrito.*bowl/` |
| `tom_yum` | tom yum, tom kha | `/tom\s*yum\|tom\s*kha/` |
| `falafel` | falafel | `/\bfalafel\b/` |
| `minestrone` | minestrone | `/\bminestrone\b/` |
| `spaghetti` | spaghetti, aglio e olio | `/\bspaghetti\b\|aglio/` |
| `curry` | curry, masala, dal | `/\bcurry\b\|masala\b\|\bdal\b/` |
| `stir_fry` | stir-fry, stir fry | `/stir.?fry/` |
| `mushroom_pasta` | mushroom pasta, creamy pasta | `/mushroom.*pasta\|creamy.*pasta/` |
| `ratatouille` | ratatouille | `/\bratatouille\b/` |
| `carbonara` | carbonara | `/\bcarbonara\b/` |
| `paella` | paella | `/\bpaella\b/` |
| `penne` | penne, arrabbiata | `/\bpenne\b\|arrabbiata/` |
| `thai_curry` | thai curry, green curry, red curry | `/thai.*curry\|green.*curry\|red.*curry/` |
| `fettuccine` | fettuccine, alfredo | `/\bfettuccine\b\|alfredo/` |
| `quesadilla` | quesadilla | `/\bquesadillas?\b/` |
| `breakfast_burrito` | breakfast burrito | `/breakfast.*burrito/` |

---

## Current verified images (already working, do not change)

| ID | Recipe | Photo Category |
|---|---|---|
| 4 | Lemon Herb Roast Chicken | chicken |
| 5 | One-Pan Shakshuka | eggs |
| 6 | Fluffy Buttermilk Pancakes | pancakes |
| 8 | Fish Tacos | tacos |
| 10 | Margherita Pizza | pizza |
| 19 | Greek Salad | salad |
| 20 | Avocado Toast | avocado_toast |
| 24 | Greek Yogurt Honey Bowl | yogurt |
| 29 | Apple Cinnamon Oatmeal | oatmeal |
