# Current Task — V2-G7 Recipe Text Draft Assistant

Status: ready_for_implementation

Baseline commit:

a8cd860cfeb07cdf69ada7368468ea45c3aaf16b

Expected baseline:

- V2-F complete
- V2-G1 through V2-G6 complete
- 947 tests passing across 111 files
- typecheck, lint, and production build passing
- schema head 0033_nutrition_capture_images.sql
- Design manual 1.0.43
- package 1.0.0

Follow AGENTS.md and the persistent files under docs/ai/.

## Objective

Implement the next bounded “Richer meal estimation / recipe assistance” slice:

Let the owner paste recipe text into New Recipe, explicitly ask Gemini to turn that text into a structured recipe draft, then resolve every proposed ingredient through the existing canonical Nutrition food workflows before the recipe can be saved.

Core flow:

owner-provided recipe text
→ deterministic bounded source lines
→ explicit Gemini draft request
→ validated source-grounded ingredient suggestions
→ owner resolves each ingredient to an existing/new canonical NutritionFood
→ existing deterministic composeRecipe calculation
→ existing Create Recipe action

AI may reduce typing.

AI must not calculate recipe nutrition, create foods, or create a Recipe by itself.

## Scope

G7 applies to:

- /nutrition/recipes/new

G7 does not automatically rewrite an existing Recipe Version.

Existing RecipeEditPage remains manual/versioned in this phase.

Do not add AI editing of an already-saved recipe.

## No migration

Expected schema head remains:

0033_nutrition_capture_images.sql

Do not add:

- recipe draft tables
- AI transcript tables
- staging recipe tables
- ingredient-match tables

The generated draft is transient browser/server response state.

No draft belongs in backup or portable export.

## Existing V2-C authority remains unchanged

The existing recipe system remains authoritative:

- recipes
- immutable recipe_versions
- recipe_version_ingredients
- canonical nutrition_foods
- deterministic composeRecipe
- deterministic supportedDisplayUnits
- existing createRecipe server validation
- existing historical snapshot semantics
- existing Recipe Ingredient picker
- USDA food creation
- barcode / nutrition-label food creation
- manual food creation
- existing single-food AI-assisted creation

G7 must feed that architecture.

It must not create a second recipe/nutrition calculation path.

## Product behavior

On New Recipe, add a secondary action such as:

Draft from recipe text

It opens a bounded assistant panel/sheet with:

- textarea for pasted/typed recipe text
- explicit Draft ingredients button
- concise privacy/cost copy
- generated draft review

No Gemini call occurs:

- on page load
- while typing
- when opening the panel
- when applying/editing a generated draft

Only the explicit Draft ingredients action calls Gemini.

## Input

Version the request:

recipe-assist-v1

Suggested JSON:

{
  "version": "recipe-assist-v1",
  "text": "..."
}

Maximum text length:

6000 characters

Reject blank input.

Do not accept:

- URL-only recipe fetching
- arbitrary remote URLs
- HTML documents
- image uploads
- Health history/context
- current Nutrition logs
- Goals
- supplements
- personal notes from another domain

The only model input is the recipe text the owner explicitly submits plus deterministic prompt instructions.

## No URL fetching

Do not fetch recipe websites in G7.

If the owner pastes a URL, treat it as ordinary text and make clear that Health does not fetch the page.

Do not add:

- browser scraping
- server-side URL retrieval
- recipe-site connectors
- SSRF-prone fetch behavior

The owner can paste the recipe text itself.

## Deterministic source lines

Before Gemini is called, normalize the submitted text into a bounded line packet.

Use deterministic code.

Suggested rules:

- normalize CRLF/CR to LF
- trim outer whitespace
- keep nonblank lines
- preserve line order
- cap line count to a safe bound such as 80
- cap each line to a bounded length
- assign refs L1, L2, L3, ...

Example:

L1: Turkey chili
L2: Serves 6
L3: 1 lb ground turkey
L4: 1 can black beans, drained
L5: 2 tbsp olive oil

The model receives those refs.

Do not send an unbounded raw document independently of the packet.

Keep the original text only in browser request state; do not persist it.

## Gemini output contract

Use a strict narrow JSON schema.

Suggested semantic shape:

{
  "title": "Turkey chili" | null,
  "yieldServings": 6 | null,
  "ingredients": [
    {
      "sourceRefs": ["L3"],
      "name": "ground turkey",
      "quantity": 1,
      "unit": "lb"
    }
  ]
}

Server assigns any UI/draft ids.

The model must not output ids that become canonical identifiers.

### Allowed output

Only:

- title nullable
- yieldServings nullable
- ingredient sourceRefs
- ingredient name
- ingredient quantity nullable
- ingredient unit nullable

No directions are needed in G7.

No model-generated notes are needed.

### Forbidden output

The response schema must reject extra fields including:

- calories
- protein
- carbs
- fat
- fiber
- servingGrams
- foodId
- USDA ids
- barcode
- brand
- canonical recipe id
- canonical version id
- confidence score
- health claims

Use strict object parsing so model-added Nutrition values are not silently accepted.

## Source grounding

Every proposed ingredient must cite at least one valid L# source ref from the submitted packet.

Reject a generated ingredient when:

- sourceRefs is empty
- a ref does not exist
- name is blank
- quantity is nonfinite
- quantity is zero or negative when present
- unit exceeds the bounded string limit

If the entire returned draft is invalid, fail the draft request.

Do not partially accept ungrounded model ingredients without telling the owner.

The model may split one source line into several ingredients if that line clearly contains several ingredients.

The model may use the same source line for multiple ingredients.

## Hallucination boundary

Prompt instructions must say:

- include only ingredients supported by the supplied source lines
- do not invent pantry items
- do not add oil, salt, water, spices, toppings, or sauces unless the source text supports them
- if quantity is not stated, use null
- if unit is not stated, use null
- do not infer Nutrition values
- do not convert quantities into grams
- do not calculate calories/macros
- do not rewrite the recipe into a diet/health recommendation

The server still treats model output as a draft, not a fact.

Owner review is mandatory.

## Title and yield

Title:

- may be suggested from explicit recipe text
- must be bounded
- is never automatically written to the form until the owner applies the draft

Yield:

- may be suggested only when the recipe text appears to state it
- nullable
- positive finite value only when present

The owner can edit either after applying.

No AI-generated finishedWeightG in G7.

Finished weight stays manual.

## Request type / prompt version

Add stable versions:

- prompt version: recipe-assist-v1
- ai_usage request_type: nutrition_recipe_assist

Add Nutrition usage kind:

recipe_assist

Do not reuse nutrition_description as the stored request_type.

## Gemini model configuration

Use the existing Gemini integration.

Add an optional server config field/env:

GEMINI_NUTRITION_RECIPE_MODEL

Fallback order:

GEMINI_NUTRITION_RECIPE_MODEL
→ GEMINI_NUTRITION_DESCRIPTION_MODEL
→ GEMINI_NUTRITION_MODEL
→ existing project default

Do not add another provider.

Home-AI recipe drafting is not part of G7.

Do not silently fall back to Home-AI when Gemini fails.

## Durable AI cost safety

G4 remains authoritative.

Recipe assistance must use the same durable:

- ai_usage table
- AI_MONTHLY_BUDGET_USD
- global min-interval gate
- global per-minute gate
- reserved/completed/uncertain/released semantics

Add:

AI_NUTRITION_RECIPE_ASSIST_MAX_REQUEST_COST_USD

Fallback safely through AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD.

One explicit Draft ingredients action:

- one Gemini provider attempt
- one ai_usage reservation

An automatic Gemini retry:

- a second provider attempt
- a second reservation

Do not reserve on:

- opening assistant
- typing
- applying draft
- resolving foods
- saving Recipe

## Request hash

Use the existing Nutrition Gemini privacy-safe request hash behavior.

Hash:

- request type
- model
- deterministic prompt/packet

No raw recipe text is stored in ai_usage.

No title/ingredients/model response is stored in ai_usage.

No owner identity is stored there.

## Provider accounting

Preserve G4 rules:

- valid returned response counts completed even if schema validation later rejects it
- timeout/network/provider uncertainty stays uncertain
- provider not configured and never called is not charged
- local budget/rate denial makes zero Gemini call
- local budget/rate denial uses AI_BUDGET_REACHED / AI_RATE_LIMITED

Synchronous assist budget/rate denial returns a retryable 429-class response.

## API

Use the existing single Vercel function.

Add owner route:

POST /api/nutrition/recipes/assist

Prefer routing it through the existing nutrition-recipes handler/service architecture.

Wrong method:

405

Anonymous:

401

Authenticated non-owner:

403

Machine ingest tokens:

no authority

Request body is only the bounded version/text object.

Response is only the validated transient draft.

No database write from this endpoint.

## Draft domain type

Add a deterministic domain contract for the validated assistant result.

Suggested fields:

RecipeAssistDraft
- version
- title
- yieldServings
- ingredients[]

RecipeAssistIngredient
- draftId generated by server/domain code
- sourceRefs
- sourceText derived server-side from referenced lines
- name
- quantity
- unit

Do not trust model-provided sourceText.

The server derives sourceText from the original numbered packet.

This gives the owner visible evidence for each suggestion.

draftId is ephemeral only.

It is not a database id.

## Apply draft to New Recipe

Applying a draft is an explicit owner UI action.

Do not mutate the recipe builder merely because Gemini returned.

The assistant review should show:

- suggested title
- suggested servings
- ingredient list
- each ingredient’s source line(s)
- unresolved status

Button:

Apply draft

### Existing builder content

G7 is an initializer, not a merge engine.

Enable Draft from recipe text only while NewRecipePage has no ingredient lines.

Name/notes fields may already contain text.

When applying:

- fill recipe Name only if the Name field is blank
- fill Servings only if Servings is blank
- do not alter Notes
- do not alter Finished weight
- do not remove any owner-entered value

If ingredient lines already exist by the time Apply is clicked, fail closed in UI:

This recipe already has ingredients. Clear them before applying an AI draft.

Do not silently merge or duplicate.

## Unresolved ingredient lines

Applying the assistant draft creates unresolved recipe-builder lines.

An unresolved line is not a NutritionFood.

It must visibly show:

- suggested ingredient name
- suggested quantity/unit
- source line
- Resolve food action
- Remove action

A Recipe cannot be saved while any ingredient is unresolved.

The deterministic recipe preview must not run unresolved ingredients through composeRecipe.

No placeholder calories/macros.

Missing Nutrition remains missing, not zero.

## Resolving a suggested ingredient

Reuse RecipeIngredientSheet.

Extend it narrowly to accept an optional:

initialQuery

and, if useful:

initialStep

For an assisted line, Resolve food should open the existing source chooser/search flow with the suggested ingredient name available as the initial search text.

The owner can still choose:

- My Foods
- USDA
- barcode
- nutrition label
- manual food
- existing single-food AI flow

G7 itself does not create that food.

When a NutritionFood is returned, replace only that unresolved line with a normal resolved recipe line.

## Quantity/unit transfer

After resolving a line to a NutritionFood:

- preserve the suggested positive quantity when present
- otherwise default to the existing normal recipe amount, typically 1

For unit:

- use the suggested unit only if existing deterministic unit support for that chosen food accepts it
- reuse supportedDisplayUnits / existing unit normalization
- do not add a new unit-conversion catalog
- do not invent grams
- if suggested unit is unsupported, choose the current normal safe default and keep the original source/suggestion visible until owner review

Do not silently reinterpret:

- medium
- large
- handful
- package
- can
- bunch

into grams unless the chosen canonical food already has a deterministic compatible serving/unit basis.

## Source text after resolution

Once resolved, the builder may keep a small “Suggested from: …” helper line until the recipe is saved.

This helper is transient UI state.

Do not persist the recipe source text or source refs into canonical recipe tables in G7.

Canonical provenance remains the existing manual Health recipe source because the owner explicitly resolved every food and saved the recipe.

Do not add an ai_assisted recipe origin column in G7.

## Deterministic preview

After every assisted ingredient is resolved, use existing composeRecipe exactly as manual New Recipe does.

Nutrition comes only from the selected canonical NutritionFood definitions and the reviewed amount/unit.

Gemini-proposed ingredient names/quantities are not themselves a Nutrition calculation.

No model call occurs during preview.

## Save

Save recipe uses the existing createRecipe API unchanged.

The server revalidates:

- food ids
- amount
- unit
- deterministic composition

G7 must not add an alternate “AI recipe commit” endpoint.

The final canonical recipe is an ordinary V2-C Recipe v1.

Historical Recipe Version semantics remain unchanged.

## Failure behavior

If recipe assistance fails because of:

- Gemini unavailable
- budget
- rate
- timeout
- invalid JSON
- invalid refs
- invalid schema

the normal New Recipe builder remains fully usable.

Show a concise error and allow:

- Retry draft
- Continue manually

Do not wipe owner-entered Name/Notes/Yield/Finished weight.

Do not create any recipe/food rows.

## Privacy

Gemini receives only:

- the explicitly submitted recipe text packet
- system prompt instructions

Gemini does not receive:

- Health history
- body weight
- goals
- activity
- sleep
- supplements
- existing food library
- existing recipe library

Do not log raw recipe text or Gemini output to server logs.

Do not persist raw text in PostgreSQL.

No transcript/localStorage persistence.

## Copyright / external content boundary

The assistant transforms text supplied by the owner.

Do not fetch or reproduce recipe webpages automatically.

Do not add “Paste URL” language.

The UI can say:

Paste the ingredient list or recipe text.

## Demo

Demo remains provider-free/read-only.

A compiled fictional Recipe Assist preview may be shown only if it helps demonstrate the feature.

If shown:

- label it Example draft
- no Gemini call
- no save
- no owner API

It is acceptable for demo Recipes to remain unchanged if adding a demo assist surface would expand scope.

## Backup / portable export

No inventory change.

There is no persisted recipe-assist draft.

Canonical recipes/foods remain backed/exported under existing V2-C rules.

ai_usage remains full-backup operational data and excluded from portable export.

## Tests required

Add focused tests covering at least:

1. recipe-assist-v1 request accepted.
2. unknown request version rejected.
3. blank text rejected.
4. >6000 chars rejected.
5. deterministic source line normalization.
6. source line order stable.
7. source packet bounded.
8. valid title parses.
9. valid nullable title parses.
10. valid positive yield parses.
11. absent yield stays null.
12. invalid/negative/nonfinite yield rejected.
13. valid ingredient with source ref parses.
14. ingredient with no source ref rejected.
15. unknown L# ref rejected.
16. server-derived sourceText comes from the referenced packet, not model text.
17. blank ingredient name rejected.
18. nullable quantity/unit accepted.
19. negative/zero/nonfinite quantity rejected.
20. output calories field is rejected by strict schema.
21. output macro fields are rejected.
22. output foodId is rejected.
23. output confidence score is rejected.
24. ingredient count is bounded.
25. title/name/unit string lengths are bounded.
26. prompt explicitly forbids invented ingredients.
27. prompt explicitly forbids Nutrition calculation.
28. prompt says quantity/unit null when absent.
29. request_type is nutrition_recipe_assist.
30. prompt version is recipe-assist-v1.
31. recipe assist uses shared AI_MONTHLY_BUDGET_USD.
32. recipe assist uses global provider rate gate.
33. recipe assist has explicit max-request-cost config.
34. recipe model env falls back through description/general model.
35. budget denial makes zero Gemini calls.
36. rate denial makes zero Gemini calls.
37. budget/rate denial maps to 429.
38. returned invalid JSON/schema is accounted as completed.
39. network/provider uncertainty is accounted uncertain.
40. missing Gemini config is not charged.
41. retry gets a second reservation.
42. raw recipe text is not stored in ai_usage.
43. no draft database write occurs.
44. GET/load/opening assistant makes zero Gemini calls.
45. typing makes zero Gemini calls.
46. only explicit Draft ingredients action calls the API/provider.
47. Apply draft is a separate owner action.
48. Apply does not overwrite a nonblank recipe name.
49. Apply does not overwrite nonblank servings.
50. Apply does not change Notes.
51. Apply does not change Finished weight.
52. Apply refuses when ingredient lines already exist.
53. unresolved ingredient prevents deterministic recipe preview/save.
54. unresolved ingredient does not become a fake NutritionFood.
55. Resolve food reuses RecipeIngredientSheet.
56. initialQuery is bounded and does not automatically search/call providers on mount unless explicitly designed/tested.
57. resolved canonical food replaces only the targeted line.
58. supported suggested unit can transfer.
59. unsupported suggested unit is not silently converted.
60. missing suggested quantity uses existing safe default.
61. composeRecipe remains the only new-recipe nutrition calculator.
62. createRecipe endpoint/schema remains canonical commit.
63. saving after assist creates an ordinary Recipe v1.
64. no assist fields are persisted in recipe tables.
65. existing RecipeEditPage/versioning remains unchanged.
66. existing USDA/barcode/label/manual/single-food AI ingredient flows remain green.
67. no URL fetching code is introduced.
68. no new migration.
69. no backup/export inventory change.
70. demo remains provider-free/read-only.
71. G4 durable cost safety remains green.
72. G6 multi-angle meal tests remain green.
73. G5 reduced-motion tests remain green.
74. full F1–F5 / G1–G6 regressions remain green.

Run:

- npm test
- npx tsc -b
- npx eslint .
- npm run build

No migration command.

## Manual QA

When owner/Gemini runtime is available:

1. Open New Recipe.
2. Open Draft from recipe text.
3. Paste a recipe with title, servings, and 5–8 ingredient lines.
4. Verify no call occurs until Draft ingredients.
5. Generate.
6. Verify each suggestion shows its source line.
7. Verify no calories/macros are present in the AI draft.
8. Apply.
9. Verify Name/Servings fill only when previously blank.
10. Verify unresolved ingredients block Save.
11. Resolve one ingredient from My Foods.
12. Resolve another through USDA.
13. Resolve another manually or by nutrition label.
14. Verify supported quantity/unit suggestions transfer.
15. Verify an unsupported unit is not silently converted.
16. Resolve every line.
17. Verify deterministic recipe nutrition appears.
18. Edit an amount and verify deterministic totals update.
19. Save.
20. Verify an ordinary Recipe v1 exists.
21. Verify no recipe-assist draft/history row exists.
22. Verify the recipe text is not stored in canonical recipe data.
23. Test budget/rate failure and continue manually.
24. Test invalid/ambiguous pasted text.
25. Check 390px assistant and unresolved-line layout.
26. Verify existing Recipe Edit/version history remains unchanged.
27. Run full automated validation.

If live Gemini QA is unavailable, use injected provider/ledger tests and report that limitation accurately.

## Documentation

On completion:

- update HEALTH-PLATFORM-DESIGN-MANUAL.md
- expected Design Manual version 1.0.44
- append a historical ledger row; do not rewrite older rows
- update HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md with V2-G7 Recipe Text Draft Assistant
- update docs/ai/PROJECT.md
- update docs/ai/DEV_STATE.md
- update docs/ai/DECISIONS.md
- update docs/ai/ROADMAP.md
- update docs/V2-ROADMAP.md to mark recipe assistance implemented
- update .env.example for recipe model / max-request-cost variables
- document that recipe assistance is transient and owner-resolved
- document no URL fetching
- document that AI does not calculate recipe nutrition
- keep richer contextual meal estimation beyond this slice as an idea

Expected schema head:

0033_nutrition_capture_images.sql

Package remains:

1.0.0

## Acceptance criteria

V2-G7 is complete only when:

- the owner can explicitly submit pasted recipe text for a transient structured draft;
- every proposed ingredient is source-ref grounded;
- model output cannot contain accepted Nutrition/calorie/macro fields;
- Gemini cannot create NutritionFood rows;
- Gemini cannot create a Recipe;
- applying the draft is a separate explicit owner action;
- applying does not overwrite existing owner metadata;
- unresolved ingredient lines are visibly noncanonical and block save;
- every ingredient must be resolved through the existing canonical food flows;
- deterministic composeRecipe remains the recipe nutrition authority;
- existing createRecipe remains the only canonical new-recipe commit;
- recipe assist uses the shared durable Gemini budget/rate ledger;
- raw recipe text/model output are not persisted;
- no URL fetching is added;
- no migration is added;
- backup/export inventories remain unchanged;
- existing Recipe Version/history semantics stay intact;
- tests pass;
- typecheck passes;
- lint passes;
- production build passes;
- docs updated.

## Required completion report

Update docs/ai/DEV_STATE.md with:

- baseline commit
- resulting commit / working-tree state
- schema/migration status
- request/prompt versions
- source-line packet behavior
- strict model output schema
- source-ref validation
- model/config fallback
- ai_usage request type and max cost
- reservation/retry accounting
- API/auth behavior
- New Recipe assistant UI
- Apply-draft behavior
- unresolved ingredient behavior
- RecipeIngredientSheet reuse
- quantity/unit transfer rules
- deterministic composeRecipe boundary
- createRecipe canonical commit boundary
- privacy/persistence behavior
- URL-fetch boundary
- backup/export
- demo
- tests/count
- typecheck/lint/build
- manual QA
- docs version
- deviations
- remaining V2-G work

When finished, reset CURRENT_TASK.md to the standard no-active-task template, commit, and push according to AGENTS.md.

## Final invariant

Gemini may turn owner-provided recipe text into a draft of what the owner might mean.

Only canonical NutritionFood selections plus the owner-reviewed amount/unit may enter deterministic recipe nutrition.

The model never gets to turn recipe prose directly into canonical calories.
