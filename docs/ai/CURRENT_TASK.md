# Current Task — V2-G4 Nutrition Gemini Durable Cost Safety

Status: ready_for_implementation

Baseline commit:

80cd7642fb7a5ebd8683f81f6d4e97f1768a846b

Expected baseline:

- V2-F complete
- V2-G1 ongoing Apple workout ingestion complete
- V2-G2 Body Inbox + Shortcut Capture complete
- V2-G3 Theme Packs + Appearance complete
- 927 tests passing across 108 files
- typecheck, lint, and production build passing
- schema head 0032_body_capture_inbox.sql
- Design manual 1.0.40
- package 1.0.0

Follow AGENTS.md and the persistent files under docs/ai/.

## Objective

Bring every paid Nutrition Gemini network attempt under the same durable ai_usage budget and provider-rate authority already used by Ask Health, Weekly Coach, Experiment Suggestions, and Literature Synthesis.

This closes the explicitly documented architecture gap:

Nutrition Gemini is currently outside the durable ai_usage ledger.

After G4:

- Nutrition description interpretation
- Nutrition meal-photo interpretation
- Nutrition label-photo interpretation

all share the same durable monthly AI ceiling and global Gemini rate gate.

Home-AI remains separate and is not billed through ai_usage.

## Core invariant

No Gemini network request may leave the Health server without first obtaining a durable ai_usage reservation.

If a Gemini attempt starts, that attempt must be finalized conservatively:

- returned response -> completed
- provider/network outcome uncertain -> uncertain
- provider never called -> released or no reservation

Retries are separate provider attempts and therefore require separate reservations.

## Scope

This task changes cost/rate governance only.

Do not change:

- Nutrition candidate schemas
- label extraction semantics
- meal estimation semantics
- food-description semantics
- review/commit behavior
- Home-AI behavior
- model prompts except where mechanically necessary to carry request metadata
- canonical Nutrition persistence
- provider selection UX
- photo storage
- job lifecycle beyond adding accurate failure codes for budget/rate denial

No new Nutrition feature is being added.

## Schema

No migration.

The existing ai_usage table from 0030 already supports arbitrary request_type values.

Expected schema head remains:

0032_body_capture_inbox.sql

Do not add a nutrition-ai usage table.

Do not add request text, images, prompts, or model output to ai_usage.

## Shared budget authority

Nutrition Gemini must reuse:

- AI_MONTHLY_BUDGET_USD
- the existing ai_usage advisory-lock reservation path
- the existing global min-interval gate
- the existing global max-per-minute gate
- UTC billing-month semantics
- reserved / completed / uncertain / released states

Nutrition calls must therefore compete for the same monthly ceiling and provider-call rate capacity as:

- ask_health
- weekly_coach
- experiment_suggestion
- literature_synthesis

Do not create a second Nutrition monthly wallet.

AI_WARNING_BUDGET_USD remains informational only.

## Nutrition request types

Add explicit stable request types:

- nutrition_description
- nutrition_meal_photo
- nutrition_label

Keep these as bounded machine constants, preferably near the Nutrition interpretation contract.

Do not derive request_type from arbitrary route names or user text.

## Per-request reservation ceilings

Add bounded config for the three Nutrition Gemini attempt types.

Suggested environment variables:

AI_NUTRITION_DESCRIPTION_MAX_REQUEST_COST_USD
AI_NUTRITION_MEAL_MAX_REQUEST_COST_USD
AI_NUTRITION_LABEL_MAX_REQUEST_COST_USD

Use the existing AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD as the default unless repository evidence justifies a narrower established default.

Update readAiUsageConfig with explicit fields.

Do not overload the Ask Health max-request variable.

Add blank/documented examples to .env.example.

## Where the gate belongs

The durable reservation belongs at the Gemini network-attempt layer, not only at an HTTP route or UI action.

Current Nutrition architecture can call Gemini through:

- synchronous food-description preview
- queued meal-photo jobs
- queued label-photo jobs
- reanalysis
- automatic Gemini retry

All of those must be covered.

A caller must not be able to accidentally bypass the ledger by invoking createGeminiNutritionInterpreter directly.

Preferred architecture:

create a Nutrition Gemini usage wrapper/gate used by generateWithGemini / generateOnce so every actual Gemini provider attempt is protected.

The interpreter should explicitly identify which request type it is making.

Conceptually extend the internal generate request with a bounded usage kind:

- description
- meal_photo
- nutrition_label

or the corresponding exact request_type.

Do not infer task type from prompt content.

## Automatic retry

Current Nutrition Gemini behavior may automatically retry selected transient failures.

Preserve that user-facing retry behavior unless implementation evidence requires otherwise.

But each actual retry is another provider call.

Therefore:

attempt 1
-> reservation 1
-> provider call 1
-> finalize reservation 1

retry attempt 2
-> reservation 2
-> provider call 2
-> finalize reservation 2

Do not reserve once and then make two paid provider attempts behind that single row.

Do not bypass the shared 1.5-second / 8-per-minute provider gate for automatic retry.

If the first attempt becomes uncertain and the retry is then blocked by budget/rate, keep the first attempt uncertain and surface the second denial accurately.

## Request hash

ai_usage may store a privacy-safe request hash.

It must not store:

- description text
- user context
- image bytes/base64
- filenames
- generated output

Use a deterministic SHA-256 hash over bounded semantic/request material such as:

- request type
- model
- prompt bytes/text
- image digest when present

Only the digest goes into ai_usage.

Do not put the raw material into database metadata.

A null hash is acceptable only if the current implementation cannot safely provide one; prefer a digest.

## Provider-not-configured behavior

If GEMINI_API_KEY/config is missing and no provider call begins:

- no charged Nutrition usage
- ideally no reservation is created

If architecture makes reservation happen immediately before provider construction and config failure can still occur after reservation:

- release it

Do not mark an unconfigured provider uncertain.

Existing Nutrition user-facing GEMINI_NOT_CONFIGURED semantics remain compatible.

## Budget/rate denial codes

Add explicit Nutrition interpretation failure codes for local gate denial.

Preferred stable codes:

- AI_BUDGET_REACHED
- AI_RATE_LIMITED

Do not mislabel the Health monthly budget as GEMINI_QUOTA.

Do not mislabel the durable Health rate gate as provider quota.

These codes are local Health policy decisions.

### HTTP behavior

For synchronous food-description preview:

- budget/rate denial should be a retryable 429-class response
- keep a concise owner-facing message
- do not call Gemini

For queued meal/label jobs:

- the claimed job may finish as failed with the explicit local code
- no provider call occurs for the denied attempt
- the image remains available for later reanalysis
- reanalysis may be attempted later
- do not commit canonical Nutrition data

Update retry classification so the UI can retry these local denial codes.

Do not silently fall back to Home-AI.

Home-AI remains an explicit provider choice.

## Reservation timing

For an actual Gemini attempt:

1. resolve valid server Gemini configuration/model
2. construct bounded request metadata/hash
3. reserve ai_usage
4. if denied, return/throw local budget/rate code with zero provider call
5. start provider call
6. finalize according to outcome

Keep database reservation transactions short.

The network call must remain outside the ai_usage reservation transaction.

## Successful provider response

Once Gemini returns a response, the provider attempt is chargeable even if later parsing/semantic validation rejects the response.

Therefore:

- finalize ai_usage as completed before or regardless of later schema/semantic rejection
- record available input/output token counts
- compute bounded actual cost with the existing ai_usage cost helper
- if token metadata is unavailable, completion may conservatively keep the reserved maximum under existing ledger semantics

Examples that must still count as completed:

- empty/invalid JSON returned by Gemini
- schema-invalid Nutrition response
- semantically unusable returned candidate

The provider returned; the call was made.

## Provider/network failure

If a Gemini network/provider attempt began but no trustworthy completed response is available:

mark that reservation uncertain.

Examples:

- timeout
- transport failure
- provider 5xx
- quota/rate error returned in a path where billing certainty is unknown
- process/provider exception after call begins

Preserve the conservative existing ai_usage policy.

Do not release merely because the Nutrition feature surfaces an error.

## Retry + returned invalid response

Do not automatically retry schema/semantic failures unless the current code already does.

Current retry eligibility remains authoritative.

A returned invalid response is completed, not uncertain.

If no retry is currently performed for that code, do not add one in G4.

## Token/cost calculation

Reuse boundedProviderCostUsd and the existing project cost-accounting contract.

Do not redesign provider pricing in this task.

Do not let actual_cost_usd exceed reserved_cost_usd.

Keep current token metadata in Nutrition interpretation metadata as well; ai_usage is additional operational accounting, not a replacement for job interpretation metadata.

## Home-AI boundary

Home-AI requests must not create ai_usage rows in G4.

Reason:

- ai_usage is currently the durable paid Gemini budget/rate authority
- Home-AI is the private external/local service path
- there is no accepted monetary accounting contract for Home-AI

Preserve:

- explicit provider choice
- current Home-AI auth
- current job polling
- current error classification

Do not make Home-AI consume the Gemini global rate gate.

## Job claim semantics

Current meal/label Gemini job advancement claims a queued/stale-processing job before interpretation.

Preserve the single-worker claim protection.

Integrating ai_usage must not cause polling to create repeated paid calls for the same already-processing job.

If budget/rate denial happens after a job is claimed:

- record a failed/retryable job state with the local denial code
- do not leave it indefinitely processing
- preserve image/user context for reanalysis

If reservation infrastructure itself throws before provider call:

fail closed with no Gemini call and a retryable local failure state.

## Description preview

Food-description interpretation is synchronous and currently directly constructs a Gemini interpreter.

After G4 it must use the same protected Gemini network layer as photo interpretation.

Do not create a second description-only budget implementation.

Commit of a reviewed description estimate remains deterministic and creates no new Gemini call.

## Reanalysis

Gemini reanalysis of an existing meal/label image is a new provider attempt and must be budgeted/rate-limited normally.

Requeueing the job itself creates no ai_usage row.

Only the later Gemini attempt creates a reservation.

Home-AI reanalysis creates no ai_usage row.

## No cache authority change

Nutrition currently does not use the F1 process response-cache pattern as budget authority.

Do not add persistent AI response caching merely for G4.

If an existing Nutrition workflow avoids a provider call because it already has a completed candidate, it naturally creates no new ai_usage row.

No-provider-call means no reservation.

## Security/privacy

ai_usage remains operational metadata only.

Nutrition ai_usage rows may contain:

- request_type
- provider = gemini
- model
- request hash
- reservation/actual cost
- token counts
- timestamps/status

They must not contain:

- photo bytes
- photo hashes reversible to content beyond SHA-256 digest
- description text
- user context
- candidate JSON
- food names
- notes
- filenames
- owner identity

No new client-readable ai_usage API is required.

## Backup/export

No inventory change.

ai_usage is already:

- included in full DR backup
- excluded from portable owner export

Nutrition usage rows follow that existing policy.

Do not export Nutrition prompts/images through backup changes.

## Settings/documentation wording

Update .env.example and docs that currently say:

Nutrition Gemini is not on this ledger.

That statement must no longer remain as current/live documentation after G4.

Historical manual ledger rows should not be rewritten.

Add a new amendment stating that Nutrition Gemini joined the shared durable ledger in G4.

## Tests required

Add focused tests covering at least:

1. nutrition_description has an explicit request type.
2. nutrition_meal_photo has an explicit request type.
3. nutrition_label has an explicit request type.
4. all three use the shared AI_MONTHLY_BUDGET_USD.
5. all three use the same global min-interval/max-per-minute ledger authority.
6. all three have explicit max-request-cost config fields.
7. absent/invalid max-cost env falls back safely.
8. Gemini description attempt reserves before provider call.
9. Gemini meal-photo attempt reserves before provider call.
10. Gemini label attempt reserves before provider call.
11. budget denial causes zero Gemini network calls.
12. rate denial causes zero Gemini network calls.
13. synchronous description budget denial maps to 429.
14. synchronous description rate denial maps to 429.
15. queued meal budget denial reaches a retryable failed state rather than staying processing.
16. queued label rate denial reaches a retryable failed state rather than staying processing.
17. local denial code is not GEMINI_QUOTA.
18. Home-AI description creates no ai_usage reservation.
19. Home-AI meal/label paths create no ai_usage reservation.
20. missing Gemini config causes no charged usage.
21. a successful returned Gemini response completes usage.
22. returned invalid JSON/schema still completes usage.
23. returned semantically invalid candidate still completes usage.
24. timeout/network failure after call begins marks usage uncertain.
25. provider error after call begins marks usage uncertain under existing conservative policy.
26. completion records available input/output token counts.
27. actual cost is bounded by the reservation.
28. request_hash stores a digest, not raw description text.
29. request_hash does not contain filename/user context.
30. image request hash changes when image bytes change.
31. retryable attempt 1 and attempt 2 require separate reservations.
32. retry attempt respects the global rate gate.
33. retry cannot bypass a newly reached monthly budget.
34. no automatic retry is newly introduced for schema/semantic errors.
35. an already-completed job poll creates no new reservation.
36. requeue alone creates no reservation.
37. later Gemini reanalysis creates a new reservation.
38. Home-AI reanalysis creates no reservation.
39. Nutrition interpretation metadata still records provider/model/token metadata.
40. canonical Nutrition commit semantics are unchanged.
41. ai_usage remains full-backup only and portable export excludes it.
42. no new migration is added.
43. existing Ask Health/Coach/F4/F5 ledger tests remain green.
44. full Nutrition regressions remain green.
45. G1/G2/G3 regressions remain green.

Run:

- npm test
- npx tsc -b
- npx eslint .
- npm run build

No migration command.

## Manual QA

When owner runtime/provider config is available:

1. Set a very small shared AI monthly budget in a non-production test environment.
2. Run a Gemini food-description estimate.
3. Verify an ai_usage row with request_type nutrition_description.
4. Run a Gemini meal-photo analysis.
5. Verify nutrition_meal_photo usage.
6. Run a Gemini label analysis.
7. Verify nutrition_label usage.
8. Confirm token/cost metadata finalizes.
9. Exhaust the test budget.
10. Verify another description request returns the local budget message with no Gemini call.
11. Verify a queued meal/label analysis fails retryably rather than hanging in processing.
12. Raise/reset the test budget and reanalyze.
13. Verify a new usage row is created and the saved image is reused.
14. Select Home-AI explicitly and verify no ai_usage row is created.
15. Verify reviewed Nutrition commits still behave exactly as before.
16. Restore normal budget config.
17. Run full automated validation.

If owner/provider QA cannot be run, document that accurately and cover the attempt/finalization state machine with injected test providers/ledgers.

## Documentation

On completion:

- update HEALTH-PLATFORM-DESIGN-MANUAL.md
- expected Design Manual version 1.0.41
- append a historical ledger row; do not rewrite older rows
- update HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md with V2-G4 Nutrition Gemini durable cost safety
- update docs/ai/PROJECT.md
- update docs/ai/DEV_STATE.md
- update docs/ai/DECISIONS.md
- update docs/ai/ROADMAP.md
- update docs/V2-ROADMAP.md live status if appropriate
- update .env.example
- remove current/live statements that Nutrition Gemini is outside ai_usage
- document request types
- document retry-per-attempt reservations
- document Home-AI exclusion
- keep Motion / micro-interactions deferred

Expected schema head:

0032_body_capture_inbox.sql

Package remains:

1.0.0

## Acceptance criteria

V2-G4 is complete only when:

- every Nutrition Gemini provider attempt obtains a durable reservation first
- all Nutrition Gemini attempts share AI_MONTHLY_BUDGET_USD
- all Nutrition Gemini attempts share the established global provider rate gate
- description, meal photo, and label have distinct stable request types
- automatic retry cannot make an untracked second provider call
- each retry attempt has its own reservation
- local budget/rate denial makes zero provider calls
- local budget/rate denial is distinguishable from Gemini quota
- returned invalid model output is still charged as completed
- uncertain network/provider outcomes remain conservatively charged
- missing configuration is not charged
- Home-AI remains outside ai_usage
- no Nutrition prompts/images/text are stored in ai_usage
- existing Nutrition review and canonical commit semantics are unchanged
- no migration is added
- backup/export policy remains unchanged
- tests pass
- typecheck passes
- lint passes
- production build passes
- docs updated

## Required completion report

Update docs/ai/DEV_STATE.md with:

- baseline commit
- resulting commit / working-tree state
- schema/migration status
- request-type constants
- max-request-cost config
- reservation placement
- request-hash behavior
- description path
- meal-photo path
- label path
- retry-per-attempt behavior
- budget/rate denial behavior
- returned-invalid-response accounting
- uncertain failure accounting
- missing-config accounting
- Home-AI boundary
- job claim/reanalysis behavior
- canonical Nutrition regression status
- backup/export status
- tests/count
- typecheck/lint/build
- manual QA
- docs version
- deviations
- remaining V2-G work

When finished, reset CURRENT_TASK.md to the standard no-active-task template, commit, and push according to AGENTS.md.

## Final invariant

If Daurham Health sends a Nutrition request to Gemini, that provider attempt must already have a durable budget reservation.

No Nutrition Gemini call gets to exist outside the same cost-safety system that protects the rest of Health AI.
