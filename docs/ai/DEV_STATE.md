# Dev state

Snapshot recorded 2026-09-27 after V2-G7 Recipe Text Draft Assistant. This commit is the current health application.

## Git

- Branch: `main`
- Baseline the task named: `a8cd860cfeb07cdf69ada7368468ea45c3aaf16b` (“Keep several meal photos as one reviewed estimate.”)
- Parent of this snapshot: `bd71c4a` (“docs: define V2-G7 recipe text draft assistant”)
- This commit keeps a recipe draft from becoming a saved recipe
- Finished tasks are committed and pushed
- Local annotated tag `v1.0.0` points at `7124ca513efa6c833457303ee6ff79d78344fce6`. Whether that tag exists on the remote is unknown

## Schema

- Migration head: `0033_nutrition_capture_images.sql`
- No migration was added or applied
- Design manual version: 1.0.44
- Package version: 1.0.0
- No new runtime dependency
- V2-F remains complete. V2-G1 through V2-G6 remain implemented. Goal-observation suggestions remain deferred. Overnight vital metrics remain disabled until a payload is verified

## Request and prompt versions

- Request body version: `recipe-assist-v1`
- Prompt version: `recipe-assist-v1`
- `ai_usage` request type: `nutrition_recipe_assist`
- Usage kind: `recipe_assist`
- Home-AI does not draft recipes

## Source-line packet

- Newlines become LF
- Outer whitespace is trimmed
- Blank lines are dropped
- Order is preserved
- At most 80 nonblank lines
- Each line is capped at 240 characters
- Refs are L1, L2, L3, and so on
- Gemini receives the packet, not a second copy of an unbounded document
- The original text stays in the browser request and is not stored

## Model output

- Allowed fields are title, yieldServings, and ingredients
- Each ingredient allows sourceRefs, name, quantity, and unit
- Extra fields, including calories, macros, foodId, and confidence, reject the whole draft
- Title and yield may be null
- A present yield must be a positive finite number
- A present quantity must be a positive finite number
- At most 40 ingredients
- Title max 200 characters, name max 120, unit max 40
- Request text max 6000 characters
- Blank text is rejected
- Unknown request versions are rejected

## Source refs

- Every ingredient needs at least one ref that exists in the packet
- An unknown ref rejects the draft
- sourceText is built from the packet lines, in packet order
- Model-supplied source text is not accepted

## Model config

- `GEMINI_NUTRITION_RECIPE_MODEL`
- then `GEMINI_NUTRITION_DESCRIPTION_MODEL`
- then `GEMINI_NUTRITION_MODEL`
- then the description-model default
- Timeout 20 seconds, max output tokens 2048

## Cost ledger

- Shares `AI_MONTHLY_BUDGET_USD`, the 1.5-second interval, and the 8-per-minute gate
- `AI_NUTRITION_RECIPE_ASSIST_MAX_REQUEST_COST_USD` falls back to the default max request cost
- One Draft ingredients action is one reservation
- An automatic Gemini retry is a second reservation
- Opening the assistant, typing, applying, resolving foods, and saving do not reserve
- Budget and rate denials are HTTP 429, codes `AI_BUDGET_REACHED` and `AI_RATE_LIMITED`, and make no Gemini call
- A returned invalid draft is completed
- A provider or network failure after the call starts stays uncertain
- A missing Gemini configuration is not charged
- The stored hash is SHA-256 of the request type, model, and prompt packet
- Raw recipe text and model output are not stored on `ai_usage`

## API and auth

- `POST /api/nutrition/recipes/assist`
- Other methods return 405 before owner auth
- Anonymous POST returns 401
- A signed-in non-owner returns 403
- Machine ingest tokens have no authority on this route
- The response is the transient draft
- The endpoint does not write the database

## New Recipe assistant

- Secondary action: Draft from recipe text
- Shown only while the new recipe has no ingredient lines
- Sheet contains a textarea, Draft ingredients, and the review
- Copy says to paste the ingredient list and that Health does not fetch webpages
- Copy says the action uses Gemini and the monthly AI budget
- Failure offers Retry draft and Continue manually
- Continue manually leaves Name, Notes, Servings, and Finished weight as they were

## Apply draft

- Apply draft is a separate button
- It does not call Gemini
- A blank Name takes the suggested title
- A blank Servings field takes the suggested yield
- A nonblank Name or Servings value stays
- Notes stay
- Finished weight stays
- If any ingredient line already exists, apply shows: “This recipe already has ingredients. Clear them before applying an AI draft.”
- Lines are not merged

## Unresolved ingredients

- An applied line shows the suggested name, quantity, unit, and source line
- It has Resolve food and Remove
- It is not a NutritionFood
- Save stays disabled
- `composeRecipe` does not run
- No placeholder calories are shown

## Ingredient sheet

- Resolve food opens the existing `RecipeIngredientSheet`
- The suggested name is the initial search text, capped at 120 characters
- Search does not run on mount
- My Foods, USDA, barcode, nutrition label, manual food, and the existing single-food AI flow remain
- Choosing a food replaces only that unresolved line

## Quantity and unit

- A positive suggested quantity is kept
- A missing quantity becomes 1
- The suggested unit is used only when `supportedDisplayUnits` for the chosen food already includes it
- Otherwise the line uses serving
- can, bunch, handful, medium, large, and package are not converted into grams
- The source line stays visible as “Suggested from: …” until save
- That helper is not written to the recipe tables

## Canonical commit

- After every line is resolved, preview uses `composeRecipe`
- Save uses the existing `createRecipe` API
- The payload is food id, amount, and unit
- The saved recipe is an ordinary Recipe v1
- Recipe edit and version history are unchanged

## Privacy, URLs, backup, and demo

- Gemini receives the numbered source packet and the prompt
- It does not receive Health history, the food library, or other recipes
- Raw text is not logged and not stored in PostgreSQL or localStorage
- No recipe URL is fetched
- Backup and portable-export inventories are unchanged
- `ai_usage` stays operational and out of the portable export
- The demo stays provider-free and does not call the assist route

## Validation

- Tests: 956 passing across 112 files
- `npx tsc -b` passed
- `npx eslint .` passed
- `npm run build` passed. The existing Vite chunk-size warning remains
- No migration command

## Manual QA

- `/nutrition/recipes/new` showed the lock screen: “Private Health data”
- Sign-in rendered the email and password form
- Live Gemini, applying a draft, resolving foods, and saving a recipe were not clicked. The owner lock screen blocks that path without a session
- Injected provider and ledger tests cover the draft, the reservation, and the apply rules

## Deviations

- None

## Remaining V2-G work

- Native iOS share-sheet targeting is deferred
- Route geometry and nested Health Auto Export workout telemetry stay deferred
- No correction or deletion lifecycle for Health Auto Export workouts
- Goal-observation experiment suggestions and overnight vital metrics remain deferred from earlier slices
- Richer contextual meal estimation, beyond multi-angle photos and recipe text drafts, remains an idea
- AI editing of an already-saved recipe is not part of this slice
