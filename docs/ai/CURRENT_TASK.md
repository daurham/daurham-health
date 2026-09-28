# Current Task — V2-G8 Meal Clarification Refinement

Status: ready_for_implementation

Baseline commit:

00da26ce7304d65260dde6e86decd05d80b9dda3

Expected baseline:

- V2-F complete
- V2-G1 through V2-G7 complete
- 956 tests passing across 112 files
- typecheck, lint, and production build passing
- schema head 0033_nutrition_capture_images.sql
- Design manual 1.0.44
- package 1.0.0

Follow AGENTS.md and the persistent files under docs/ai/.

## Objective

Implement the remaining bounded “richer contextual meal estimation” slice:

After a Gemini meal-photo estimate, Health may show up to three small clarification questions when the image/context leaves a material ambiguity that the owner could answer.

The owner may ignore them and save/edit the estimate as today.

If the owner answers one or more questions and explicitly chooses Refine estimate, Health reuses the same stored photo set and performs one normal Gemini meal-photo reanalysis with the added owner answers.

Core flow:

existing meal photo(s)
→ Gemini estimate
→ optional bounded clarifications
→ owner answers zero or more
→ explicit Refine estimate
→ same stored photos + deterministic owner clarification context
→ new Gemini meal-photo attempt
→ replacement review candidate
→ owner edits/saves through the existing canonical Nutrition path

The clarification loop is optional interpretation help.

It is not a second Nutrition authority.

## Non-negotiable boundaries

1. No automatic refinement call.
2. No Gemini call when the owner merely views questions or types answers.
3. Refine estimate is explicit.
4. Each refinement is a normal new provider attempt and receives its own G4 ai_usage reservation.
5. request_type remains nutrition_meal_photo.
6. The same stored image set is reused.
7. Multi-angle behavior from G6 remains unchanged.
8. Home-AI does not participate in clarification refinement in G8.
9. Clarification questions are operational/model output, not canonical Nutrition.
10. Clarification answers are owner-provided context, not measurements invented by AI.
11. The owner may save the original estimate without answering anything.
12. Canonical commit remains the existing reviewed meal-estimate commit.
13. No health goals, diagnosis, treatment, supplements, weight, sleep, Activity, or other Health history enters the clarification prompt.
14. No accuracy guarantee or confidence score.

## Schema

No migration.

Expected schema head remains:

0033_nutrition_capture_images.sql

Do not add:

- clarification table
- meal-refinement table
- transcript table
- confidence table
- question history table

Current nutrition_capture_jobs.candidate_json and user_context are operational and already full-backup-only.

A current generated candidate may contain bounded clarification fields inside candidate_json.

That is sufficient.

Do not change portable-export inventory.

## Prompt version

Bump the Gemini meal-photo prompt version:

meal-photo-v3

The base estimate instructions from meal-photo-v2 remain.

Add clarification instructions without weakening:

- same-meal treatment for multiple views;
- no double counting across views;
- no invented unseen food;
- hidden oil/sauce uncertainty;
- whole-meal Nutrition estimate;
- owner review requirement.

## Candidate contract

Extend MealEstimateCandidate additively with:

clarifications: MealClarification[]

Every sanitized candidate must expose an array, default [].

A clarification should contain only bounded interpretive fields:

- id
- kind
- answerKind
- question

Recommended exact enums:

kind:
- preparation
- hidden_fat
- sauce
- portion
- ingredient_identity
- other

answerKind:
- yes_no
- short_text

The model must NOT supply id.

Health assigns ids deterministically by accepted order:

c1
c2
c3

These ids are transient candidate-local ids.

They are not database identifiers.

## Model output shape

The raw Gemini JSON may add:

"clarifications": [
  {
    "kind": "hidden_fat",
    "answerKind": "yes_no",
    "question": "Was oil or butter added after cooking?"
  }
]

The raw model must not be asked to emit:

- clarification id
- confidence
- probability
- calorie impact
- macro impact
- expected answer
- recommended answer
- numeric correction
- health advice
- diagnosis
- treatment

Existing meal output fields stay:

- name
- foodsSeen
- assumptions
- calories
- proteinGrams
- carbsGrams
- fatGrams
- fiberGrams

Do not create per-question nutrient adjustments.

## Clarification sanitizer

Do not let malformed optional clarifications invalidate an otherwise usable meal estimate.

Sanitize them independently and fail soft.

Rules:

- max 3 accepted questions;
- kind must be an accepted enum;
- answerKind must be yes_no or short_text;
- question must be a trimmed nonempty string;
- question max 180 characters;
- duplicate normalized questions are removed;
- model-supplied extra fields are ignored only within the optional clarification object if current sanitizer conventions favor sanitizing; do not carry them forward;
- no numeric-only question;
- no question containing a model-supplied calorie/macro estimate;
- no health/medical question.

If a clarification is invalid, drop that clarification.

If all are invalid, clarifications=[].

Do not fail a valid meal estimate solely because optional clarification output is bad.

## Clarification prompt policy

Tell Gemini to return clarifications only when all are true:

- a material ambiguity remains after considering every supplied image and owner context;
- the owner is likely to know the answer;
- the answer could help interpret the same photographed meal;
- the question is concise.

Examples of allowed ambiguity:

- cooking method not visible;
- whether a visible sauce/dressing was consumed;
- whether oil/butter was added;
- identity of two visually similar foods;
- portion/count information not visually resolvable.

Do not ask:

- “What is your calorie goal?”
- “Are you trying to lose weight?”
- “What do you usually eat?”
- “What did you weigh today?”
- “What does Apple Health say?”
- anything from another Health domain;
- a question whose answer is already explicit in owner context;
- questions solely to create engagement.

At most three.

Zero is valid and common.

## Question wording

Questions should not contain claimed quantitative consequences.

Allowed:

- “Was the chicken breaded or unbreaded?”
- “Did you eat the visible dressing?”
- “Was oil or butter added after cooking?”
- “What type of noodles are these?”

Not allowed:

- “Was 200 calories of oil added?”
- “Is this about 4 oz?”
- “Was there enough dressing to add 150 calories?”
- “Are you cutting carbs?”

The model may ask for owner-known quantity in a short-text answer:

- “About how many dumplings did you eat?”

It must not prefill the quantity.

## yes_no UI

For answerKind=yes_no, render deterministic Health-owned choices:

- Yes
- No
- Not sure

The model does not generate these choices.

The owner may leave the question unanswered.

## short_text UI

For answerKind=short_text:

- text input or compact textarea;
- trim;
- max 160 characters;
- blank means unanswered.

Do not prepopulate a model guess.

No speech, external lookup, or another provider call is required.

## Clarification answer request

Extend POST:

/api/nutrition/meal/jobs/:id/reanalyze

additively.

Existing body remains valid:

{
  "userContext": "...",
  "provider": "gemini" | "home_ai"
}

Add optional:

"clarificationAnswers": [
  {
    "id": "c1",
    "answer": "yes"
  }
]

Boundaries:

- max 3;
- ids unique;
- answer max 160 characters;
- trim answers;
- blank answers are omitted/rejected as appropriate;
- unknown ids reject;
- duplicate ids reject.

For answerKind=yes_no accepted normalized answers are only:

- yes
- no
- not_sure

The client may display “Not sure” and send not_sure.

For short_text, any bounded owner text is allowed except blank.

## Server-side validation against current candidate

Clarification ids must be validated against the job’s currently stored candidate_json.

Do not trust a client-provided question or kind.

The client sends only id + owner answer.

Before requeue:

1. load the current meal job;
2. require meal_photo capture;
3. require noncommitted state;
4. if clarificationAnswers are present, require the stored current candidate to have matching clarifications;
5. validate the answer according to that stored clarification’s answerKind;
6. compile deterministic clarification context;
7. update/requeue through the existing path.

If the current candidate no longer has that id, return 409:

stale_clarification

with concise refresh/review copy.

Do not accept answers against stale questions.

## Context compilation

Create one deterministic function.

Conceptual output:

OWNER CONTEXT:
<existing user context if present>

OWNER CLARIFICATIONS:
- Was oil or butter added after cooking? Answer: yes
- What type of noodles are these? Answer: udon

The exact labels may follow repository style.

Rules:

- question comes from the validated current candidate;
- answer comes from the owner;
- only answered questions are included;
- preserve existing owner context;
- total compiled user context must still obey the existing 2000-character Nutrition context ceiling;
- if it would exceed the ceiling, reject before requeue and make no Gemini call;
- do not include question ids in the model-facing prose unless useful internally;
- do not include calories/macros computed from answers.

The resulting compiled owner context becomes the new job user_context for that reanalysis.

This is operational evidence for the capture.

## Reanalysis semantics

Clarification refinement reuses existing reanalysis infrastructure.

It must:

- reuse all G6 stored meal images in position order;
- not rewrite nutrition_capture_images;
- not create a new capture job;
- requeue the same job;
- produce a fresh candidate_json;
- get a new ai_usage reservation when Gemini later runs;
- use request_type nutrition_meal_photo;
- share AI_MONTHLY_BUDGET_USD and the global Gemini rate gate.

A refinement is not a free continuation of the prior call.

## No Home-AI refinement

When clarificationAnswers are supplied:

provider must resolve to gemini.

If provider=home_ai with clarificationAnswers:

return 400 CLARIFICATION_PROVIDER_UNSUPPORTED

before any Home-AI request.

Do not silently discard clarification answers.

For ordinary one-photo reanalysis without clarificationAnswers, existing Home-AI behavior remains.

For multi-photo, the G6 Home-AI prohibition remains.

## G4 accounting

G4 rules remain unchanged.

The clarification questions are returned by the same meal-photo response, so the original estimate is still one nutrition_meal_photo attempt.

Pressing Refine estimate:

- requeues only;
- creates no ai_usage row itself;
- the next GET/poll that advances Gemini obtains the new reservation exactly as current reanalysis does.

Automatic retry remains another separate reservation.

Returned invalid candidate/clarification output is accounted according to existing G4 response semantics.

## UI placement

In MealEstimateSheet/review, when:

- provider result is Gemini;
- candidate.clarifications.length > 0;
- capture has activeJobId;

show a secondary section:

Help refine this estimate

Copy should make optionality explicit:

“Answer only what you know. You can save or edit the estimate without refining it.”

Do not show the section for:

- manual build with no job;
- Home-AI candidate when clarification contract is absent;
- candidates with zero clarifications.

## UI behavior

For each clarification:

- show question;
- render yes/no/not-sure buttons for yes_no;
- render bounded text input for short_text;
- keep unanswered state visually distinct.

Button:

Refine estimate

Enabled only when at least one answer is present.

On click:

- send only answered ids/answers;
- provider=gemini;
- preserve the current editable owner context appropriately;
- enter the existing working/polling state;
- no artificial delay;
- on new result, replace the review candidate and question set.

Do not automatically preserve old answer controls once the new candidate arrives.

The new estimate may:

- ask different questions;
- ask none;
- repeat a still-relevant ambiguity.

## Owner-edited nutrition before refinement

Important fail-safe:

If the owner has manually edited candidate nutrition/name fields in the review UI after the current estimate loaded, do not silently discard those edits by starting a refinement.

Preferred UX:

- when Refine estimate is pressed and current review differs from the candidate baseline, show an explicit confirmation:
  “Refining will replace this unsaved estimate with a new AI estimate. Your current edits are not saved.”

No Gemini call until confirmed.

If implementing a confirmation adds disproportionate complexity, disable Refine estimate while review values differ and explain that the owner must save or reset first.

Do not silently overwrite owner edits.

## Existing freeform context

Keep the existing Add/Edit context flow.

The clarification feature supplements it.

It does not replace the textarea.

When the owner edits freeform context and reanalyzes normally:

- current behavior remains;
- Gemini may return a new clarification set.

When refining answers:

- server combines them with the current stored user_context;
- no client-generated hidden context concatenation is authoritative.

## Saving without refinement

The owner can ignore clarifications.

Save remains available exactly as current review validation permits.

Clarifications do not block commit.

They are not required fields.

Do not turn missing clarification answers into missing canonical Nutrition.

## Canonical commit

Do not change commitNutritionMealEstimateRequestSchema.

Do not add:

- clarification ids
- answers
- question text
- refinement count

to nutrition_entries.

The existing commit writes only the owner-reviewed meal result and established provenance.

Clarifications remain capture-job operational evidence only.

## Provenance

Existing meal-photo source provenance remains.

Do not add a new data source for clarification.

Do not label refined nutrition as verified.

Existing source kind remains photo_ai / current established semantics.

If existing operational source_payload records AI estimate vs reviewed values, preserve that behavior.

No new causal or confidence semantics.

## Candidate persistence

candidate_json may contain the current sanitized clarification list.

When a new reanalysis finishes, it replaces the prior candidate as today.

No separate history of prior candidate questions.

Do not append model transcript history.

The current capture job is sufficient.

## Backup / portable export

No inventory change.

nutrition_capture_jobs is already full-backup operational data and nonportable.

Its current candidate_json/user_context naturally include the current question/compiled owner clarification context.

Do not create a separate portable representation.

Do not put clarification questions/answers into portable Nutrition entries.

## Privacy

Gemini receives:

- same stored photo set;
- current bounded owner context, including owner clarification answers;
- deterministic meal-photo-v3 prompt.

Gemini does NOT receive:

- goals;
- Body history;
- sleep;
- Activity;
- Training;
- supplements;
- saved food history;
- other recipes;
- prior Ask Health chats.

Do not log raw owner clarification answers or images.

Operational database storage remains the existing capture job user_context/candidate_json behavior.

## Demo

Demo remains provider-free/read-only.

A compiled fictional clarification example is optional.

If shown:

- no API call;
- no provider;
- no save;
- clearly part of the fictional demo meal.

It is acceptable not to add clarification UI to demo in G8 if doing so would require a separate state machine.

## No accuracy claims

Do not write:

- “more accurate”
- “improves accuracy by X”
- “confidence”
- probability/score language

Allowed copy:

- “Answering can give the estimate more context.”
- “Answer only what you know.”

The result remains an estimate requiring review.

## Tests required

Add focused tests covering at least:

1. meal-photo prompt version is meal-photo-v3.
2. meal prompt requests at most three clarifications.
3. prompt limits clarifications to same-meal ambiguity.
4. prompt forbids Health-goal/history questions.
5. prompt forbids calorie/macro impact questions.
6. candidate defaults clarifications to [].
7. valid preparation clarification sanitizes.
8. valid hidden_fat clarification sanitizes.
9. valid sauce clarification sanitizes.
10. valid portion clarification sanitizes.
11. valid ingredient_identity clarification sanitizes.
12. valid other clarification sanitizes.
13. yes_no accepted.
14. short_text accepted.
15. Health assigns c1/c2/c3 ids.
16. model-provided id is not carried forward.
17. fourth clarification is ignored/dropped.
18. blank question is dropped.
19. overlong question is dropped.
20. invalid kind is dropped.
21. invalid answerKind is dropped.
22. duplicate normalized question is dropped.
23. malformed optional clarification does not invalidate an otherwise valid meal candidate.
24. candidate with no clarification field remains backward compatible.
25. existing meal candidate nutrition sanitation is unchanged.
26. reanalysis accepts old body with no clarificationAnswers.
27. max three answers.
28. duplicate answer ids reject.
29. unknown answer id rejects stale/fails closed.
30. stale clarification returns 409 stale_clarification.
31. yes_no accepts yes.
32. yes_no accepts no.
33. yes_no accepts not_sure.
34. yes_no rejects arbitrary text.
35. short_text accepts bounded owner text.
36. blank short_text is not treated as an answer.
37. >160 answer rejects.
38. server derives question text from stored candidate, not client.
39. deterministic compiled context preserves existing user context.
40. compiled context contains only answered clarifications.
41. compiled context stays <= existing Nutrition context ceiling.
42. overflow rejects before requeue/provider call.
43. clarification reanalysis requeues the same job id.
44. clarification reanalysis does not rewrite stored images.
45. next Gemini attempt loads the full stored G6 image set.
46. refinement uses nutrition_meal_photo request_type.
47. refinement gets a new ai_usage reservation on the next provider attempt.
48. requeue action itself creates no ai_usage row.
49. automatic retry still gets another reservation.
50. provider=home_ai plus clarificationAnswers rejects before Home-AI call.
51. ordinary single-photo Home-AI reanalysis without clarificationAnswers still works.
52. multi-photo Home-AI remains rejected.
53. zero clarifications do not show refinement UI.
54. unanswered questions do not enable Refine estimate.
55. only answered questions are sent.
56. no call occurs while typing/selecting an answer.
57. explicit Refine estimate triggers reanalysis.
58. questions do not block normal Save.
59. owner-edited review values are not silently discarded by refinement.
60. new candidate replaces the old clarification set.
61. commit request schema contains no clarification fields.
62. nutrition_entries receive no clarification fields.
63. no migration is added.
64. backup/export inventory unchanged.
65. candidate/user_context operational backup behavior remains.
66. demo remains provider-free/read-only.
67. G4 budget/rate tests remain green.
68. G6 multi-angle tests remain green.
69. G7 recipe-assist tests remain green.
70. G5 reduced-motion tests remain green.
71. full F1–F5 / G1–G7 regressions remain green.

Run:

- npm test
- npx tsc -b
- npx eslint .
- npm run build

No migration command.

## Manual QA

When owner/Gemini runtime is available:

1. Capture a one-photo meal with Gemini.
2. Verify a usable estimate can render with zero clarifications.
3. Capture a deliberately ambiguous meal.
4. If Gemini returns clarifications, verify at most three.
5. Verify the questions contain no calorie/macro impact claims.
6. Leave all unanswered and verify Save/Edit still work.
7. Answer one yes/no question.
8. Verify no request occurs merely by selecting the answer.
9. Press Refine estimate.
10. Verify the same job enters working state.
11. Verify the same stored photo is reused.
12. Verify a new ai_usage row appears only when the Gemini attempt advances.
13. Verify the new estimate replaces the old candidate/questions.
14. Repeat with a short-text answer.
15. Test a two/three-photo G6 capture and verify all views are reused.
16. Verify multi-photo still cannot use Home-AI.
17. Verify clarification refinement cannot choose Home-AI.
18. Edit calories/name manually, then attempt refinement and verify the UI does not silently destroy those edits.
19. Test a 2000-character existing context and verify clarification overflow fails before provider call.
20. Save an estimate without refinement and verify canonical Nutrition is unchanged.
21. Save a refined estimate and verify clarification fields are absent from the Nutrition entry.
22. Check 390px question controls.
23. Check reduced-motion behavior.
24. Run full automated validation.

If live Gemini QA is unavailable, cover the provider/reanalysis state machine with injected provider/ledger tests and report the limitation accurately.

## Documentation

On completion:

- update HEALTH-PLATFORM-DESIGN-MANUAL.md
- expected Design Manual version 1.0.45
- append a historical ledger row; do not rewrite older rows
- update HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md with V2-G8 Meal Clarification Refinement
- update docs/ai/PROJECT.md
- update docs/ai/DEV_STATE.md
- update docs/ai/DECISIONS.md
- update docs/ai/ROADMAP.md
- update docs/V2-ROADMAP.md to mark richer contextual meal estimation implemented for the bounded clarification loop
- document meal-photo-v3
- document optional/nonblocking clarification behavior
- document same-job/same-image reanalysis
- document no Home-AI clarification support
- document no schema/backup inventory change

Expected schema head:

0033_nutrition_capture_images.sql

Package remains:

1.0.0

## Acceptance criteria

V2-G8 is complete only when:

- Gemini meal estimates may return zero to three bounded clarification questions;
- malformed optional clarification output cannot invalidate an otherwise usable meal estimate;
- questions stay about owner-known ambiguity in the same meal;
- questions contain no confidence/calorie-impact claims;
- owner answers are optional;
- merely viewing/answering questions makes no provider call;
- Refine estimate is explicit;
- answers are revalidated against the current stored candidate;
- stale question ids fail closed;
- server compiles bounded owner clarification context;
- the same job and stored photo set are reused;
- each refinement provider attempt receives its own existing nutrition_meal_photo ai_usage reservation;
- Home-AI never silently receives/discards clarification answers;
- owner edits are not silently overwritten;
- clarifications never block ordinary review/save;
- canonical Nutrition commit schema and entry semantics remain unchanged;
- no migration is added;
- backup/export inventory remains unchanged;
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
- meal prompt version
- clarification candidate schema
- sanitizer/drop rules
- question enums and bounds
- answer contract
- stale validation
- deterministic context compilation
- existing 2000-character boundary
- reanalysis behavior
- image reuse
- ai_usage behavior
- Home-AI boundary
- UI placement/optional behavior
- owner-edit protection
- canonical commit boundary
- privacy/persistence
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

Gemini may ask what it cannot confidently interpret from the photographed meal.

Only the owner can answer.

Only an explicit refinement request triggers another estimate.

The canonical Nutrition record remains the reviewed value the owner chooses to save.
