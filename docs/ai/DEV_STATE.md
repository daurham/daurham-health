# Dev state

Snapshot recorded 2026-09-27 after V2-G4 Nutrition Gemini durable cost safety. This commit is the current health application.

## Git

- Branch: `main`
- Baseline the task named: `80cd7642fb7a5ebd8683f81f6d4e97f1768a846b` (“Keep Appearance in the browser so palettes do not change Health data.”)
- Parent of this snapshot: `d7a644e` (“docs: define V2-G4 nutrition AI cost safety”)
- This commit puts Nutrition Gemini attempts on the shared `ai_usage` ledger
- Finished tasks are committed and pushed
- Local annotated tag `v1.0.0` points at `7124ca513efa6c833457303ee6ff79d78344fce6`. Whether that tag exists on the remote is unknown

## Schema

- Migration head: `0032_body_capture_inbox.sql`
- No migration was added or applied
- Design manual version: 1.0.41
- Package version: 1.0.0
- V2-F remains complete. V2-G1, V2-G2, and V2-G3 remain implemented. Goal-observation suggestions remain deferred. Overnight vital metrics remain disabled until a payload is verified

## Request types

- `nutrition_description`
- `nutrition_meal_photo`
- `nutrition_label`
- Constants live in `NUTRITION_GEMINI_REQUEST_TYPES` in `src/domain/nutrition/interpret.ts`
- The interpreter sets `usageKind` to `description`, `meal_photo`, or `nutrition_label`. The kind is not inferred from the prompt

## Max-request cost

- `AI_NUTRITION_DESCRIPTION_MAX_REQUEST_COST_USD`
- `AI_NUTRITION_MEAL_MAX_REQUEST_COST_USD`
- `AI_NUTRITION_LABEL_MAX_REQUEST_COST_USD`
- Blank or invalid values fall back to `AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD` (0.05)
- All three use `AI_MONTHLY_BUDGET_USD`, `minIntervalMs`, and `maxPerMinute` from `readAiUsageConfig`
- There is no second Nutrition wallet. `AI_WARNING_BUDGET_USD` is still not a gate

## Reservation placement

- `createGeminiNutritionInterpreter` resolves Gemini config first, then each `generateOnce` attempt goes through `runNutritionGeminiAttempt`
- Order for an attempt: hash, reserve, provider call, finalize
- The network call is outside the reservation transaction
- Ask Health, Weekly Coach, Experiment Suggestions, and literature synthesis still reserve in their own gates and then call `generateWithGemini`. They are not double-reserved
- `server/integrations/gemini/client.ts` does not name `ai_usage`

## Request hash

- SHA-256 of request type, model, prompt, and a SHA-256 digest of the image bytes when an image is present
- The stored value is the hex digest
- Description text, user context, filenames, and image bytes are not columns

## Description, meal photo, and label

- Synchronous food-description preview uses the same gated generate path
- Queued meal and label jobs claim a row, then interpret through that path
- A reviewed commit does not call Gemini and does not reserve
- Interpretation metadata still records provider, model, and token counts on the job

## Retry

- `GEMINI_UNAVAILABLE` and `GEMINI_QUOTA` still auto-retry once
- Each of those attempts has its own reservation
- The retry uses the same rate gate and monthly budget
- `GEMINI_SCHEMA` and `GEMINI_SEMANTIC` are not newly retried
- If the first attempt is uncertain and the retry is denied, the first row stays uncertain and the denial code is the surfaced error

## Budget and rate denial

- Codes: `AI_BUDGET_REACHED` and `AI_RATE_LIMITED`
- Zero provider calls
- Description preview maps both to HTTP 429
- A claimed meal or label job finishes `failed` with that code. It does not stay `processing`
- Both codes are retryable in the meal and label UI
- They are not `GEMINI_QUOTA`

## Returned invalid output

- A Gemini response that fails JSON, schema, or semantic checks completes the reservation
- Empty provider text thrown as `GEMINI_SCHEMA` inside the attempt is completed
- Actual cost uses `boundedProviderCostUsd` and cannot exceed the reservation
- Missing token counts keep the reserved maximum

## Uncertain and missing config

- Timeout, transport failure, and provider 5xx after the call begins mark the reservation uncertain
- `getGeminiConfig` runs before any reservation. A missing key throws `GEMINI_NOT_CONFIGURED` and creates no row
- If a reserved attempt then reports `GEMINI_NOT_CONFIGURED`, that reservation is released
- A reservation infrastructure throw before the provider call becomes `GEMINI_UNAVAILABLE` and does not call Gemini

## Home-AI

- Description, meal, label, and Home-AI reanalysis do not create `ai_usage` rows
- Home-AI does not use the Gemini rate gate

## Jobs and reanalysis

- A completed, failed, committed, or freshly processing job poll does not start another Gemini attempt
- `requeueCaptureJob` only sets the job back to `queued`. It does not reserve
- The next Gemini poll of that job reserves
- A budget or rate denial after claim records the failed code and leaves the image for a later reanalysis

## Backup

- `ai_usage` stays operational, `portable: false`, in the full backup only
- No inventory change

## Validation

- Tests: 936 passing across 109 files
- `npx tsc -b` passed as part of `npm run build`
- `npx eslint .` passed
- `npm run build` passed. The existing Vite chunk-size warning remains
- Owner and live Gemini budget QA was not run. Attempt, denial, completion, and uncertain states were covered with an injected ledger and provider

## Deviations

- A failure inside `ledger.reserve` is reported as `GEMINI_UNAVAILABLE`. That code was already auto-retried once and is already retryable in the photo UI. No usage row is written
- `advanceGeminiCapture` accepts optional ports so tests can simulate claim and finish without a database. Production callers omit them

## Remaining V2-G work

- Native iOS share-sheet targeting is deferred
- Route geometry and nested Health Auto Export workout telemetry stay deferred
- No correction or deletion lifecycle for Health Auto Export workouts
- Goal-observation experiment suggestions and overnight vital metrics remain deferred from earlier slices
- Motion and micro-interactions remain deferred
