# Dev state

Snapshot recorded 2026-09-27 after V2-G8 Meal Clarification Refinement. This commit is the current health application.

## Git

- Branch: `main`
- Baseline the task named: `00da26ce7304d65260dde6e86decd05d80b9dda3` (“Keep a recipe draft from becoming a saved recipe.”)
- Parent of this snapshot: `3af9650` (“docs: define V2-G8 meal clarification refinement”)
- This commit treats a meal clarification as an optional owner answer, not a saved meal
- Finished tasks are committed and pushed
- Local annotated tag `v1.0.0` points at `7124ca513efa6c833457303ee6ff79d78344fce6`. Whether that tag exists on the remote is unknown

## Schema

- Migration head: `0033_nutrition_capture_images.sql`
- No migration was added or applied
- Design manual version: 1.0.45
- Package version: 1.0.0
- No new runtime dependency
- V2-F remains complete. V2-G1 through V2-G7 remain implemented. Goal-observation suggestions remain deferred. Overnight vital metrics remain disabled until a payload is verified

## Meal prompt

- Prompt version: `meal-photo-v3`
- Request type stays `nutrition_meal_photo`
- Multi-angle instructions remain: one meal, no double counting, no invented unseen food
- Clarifications are requested only for a material same-meal ambiguity the owner can answer
- At most three. Zero is valid
- The prompt forbids Health-goal and history questions, and calorie or macro impact questions
- The model is not asked for an id, confidence, probability, or a recommended answer

## Clarification candidate

- `MealEstimateCandidate.clarifications` is always an array. Missing input becomes `[]`
- Each item has only `id`, `kind`, `answerKind`, and `question`
- Kinds: `preparation`, `hidden_fat`, `sauce`, `portion`, `ingredient_identity`, `other`
- Answer kinds: `yes_no`, `short_text`
- Health assigns `c1`, `c2`, and `c3` by accepted order. A model-supplied id is ignored
- Question max 180 characters. Answer max 160 characters. At most three questions and three answers

## Sanitizer

- Optional clarification output is sanitized independently of the meal nutrients
- A bad question is dropped. If every question is bad, `clarifications` is `[]`
- Dropped: blank, longer than 180 characters, unknown kind, unknown answer kind, duplicate normalized question, numeric-only text, a prefilled quantity with a unit, a numbered calorie or macro claim, and a health or medical question
- “About how many dumplings did you eat?” is kept. “Is this about 4 oz?” and “Was 200 calories of oil added?” are dropped
- Extra model fields are not copied forward
- Existing calorie and gram rounding is unchanged

## Answers

- `POST /api/nutrition/meal/jobs/:id/reanalyze` still accepts `{ userContext, provider }`
- Optional `clarificationAnswers` is `{ id, answer }`, at most three, unique ids
- Blank answers are omitted
- `yes_no` accepts `yes`, `no`, and `not_sure`. The client shows “Not sure”
- `short_text` accepts bounded owner text
- Question text comes from the stored candidate, not the client
- An unknown id is HTTP 409 `stale_clarification`
- `provider=home_ai` with any answer is HTTP 400 `CLARIFICATION_PROVIDER_UNSUPPORTED`, before a Home-AI request
- One-photo Home-AI reanalysis without answers remains. Multi-photo Home-AI remains rejected

## Context and reanalysis

- One compiler writes `OWNER CONTEXT` and `OWNER CLARIFICATIONS`
- Only answered questions are included. `not_sure` is shown as “not sure”
- The compiled note becomes that job’s `user_context`
- The existing 2000-character ceiling still applies. Overflow is rejected before requeue and makes no Gemini call
- Requeue uses the same job id, clears `candidate_json`, and does not rewrite `nutrition_capture_images`
- The next Gemini poll loads the stored photo set in position order and reserves `nutrition_meal_photo`
- Requeue itself creates no `ai_usage` row
- An automatic Gemini retry is still a separate reservation

## Review UI

- “Help refine this estimate” appears only for a Gemini job that has an active job id and at least one clarification
- Manual build and a candidate with zero clarifications do not show it
- Copy: “Answer only what you know. You can save or edit the estimate without refining it.” and “Answering can give the estimate more context.”
- Refine estimate stays disabled until one answer is present
- Selecting or typing an answer does not call the provider
- The request sends only answered ids, with `provider=gemini`, and then uses the existing working state
- A new candidate replaces the previous question set
- If the name or nutrients differ from the loaded estimate, Refine estimate first says: “Refining will replace this unsaved estimate with a new AI estimate. Your current edits are not saved.”
- Save stays available. Clarifications are not required
- The freeform Add/Edit context flow remains

## Canonical commit, privacy, backup, and demo

- `commitNutritionMealEstimateRequestSchema` has no clarification fields
- `nutrition_entries` still store the reviewed meal. Source kind stays `photo_ai`
- Gemini receives the stored photos, the bounded owner context, and the `meal-photo-v3` prompt
- It does not receive goals, Body, sleep, Activity, Training, supplements, saved foods, other recipes, or Ask Health chats
- Answers and images are not logged. They stay on the existing capture job
- Backup inventory is unchanged. `nutrition_capture_jobs` stays operational and nonportable
- The demo stays provider-free and does not render the refinement control

## Validation

- Tests: 968 passing across 113 files
- `npx tsc -b` passed
- `npx eslint .` passed
- `npm run build` passed. The existing Vite chunk-size warning remains
- No migration command

## Manual QA

- `/demo` rendered the fictional Today page at desktop and at 390px. It does not call a provider
- `/sign-in` rendered the email and password form at both widths
- `/nutrition` showed the lock screen: “Private Health data”
- Live Gemini, answering a clarification, Refine estimate, and saving a meal were not clicked. The owner lock screen blocks that path without a session
- Injected sanitizer, answer, context, and source tests cover the refinement state machine

## Deviations

- None

## Remaining V2-G work

- Native iOS share-sheet targeting is deferred
- Route geometry and nested Health Auto Export workout telemetry stay deferred
- No correction or deletion lifecycle for Health Auto Export workouts
- Goal-observation experiment suggestions and overnight vital metrics remain deferred from earlier slices
- AI editing of an already-saved recipe is not part of V2-G7 or V2-G8
