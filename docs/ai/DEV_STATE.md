# Dev state

Snapshot recorded 2026-09-27 after V2-F4 Experiment Suggestions. This commit is the current health application.

## Git

- Branch: `main`
- Parent: `bedc9eaf0941775405f214349a6ce4a0e242739f` (“chore: establish health app AI development baseline”)
- This commit adds V2-F4 Experiment Suggestions and migration `0031_experiment_origins.sql`
- Finished tasks are committed and pushed. This commit is pushed to `origin/main` with its parent, which had not been pushed before
- Local annotated tag `v1.0.0` points at `7124ca513efa6c833457303ee6ff79d78344fce6`. Whether that tag exists on the remote is unknown. No remote was contacted

## Schema

- Migration head in the working tree: `0031_experiment_origins.sql`
- `npm run migrate` applied `0030_ai_usage.sql` and `0031_experiment_origins.sql` to the configured database. `0030` had not been applied there yet
- Design manual version in the working tree: 1.0.34
- Package version: 1.0.0
- The live blueprint header names `0031_experiment_origins.sql` as the schema head. Historical amendments and manual ledger rows that name an older head stay as history

## Experiment origin

`experiments.origin` remains the older single label. It cannot store a trigger and an AI-assisted kind together, so F4 did not reuse it as the provenance record.

`0031_experiment_origins.sql` adds:

- `origin_kind`: `owner_created`, `deterministic_candidate`, `ai_assisted`, `external_research`
- `origin_trigger`: `benchmark_missing_baseline`, `benchmark_retest_due`, `goal_observation`, or null
- `origin_fingerprint`: SHA-256 hex, or null
- `origin_evidence`: JSON, or null
- `experiment_goals`: one pinned goal and goal version per experiment

Existing rows become `owner_created` unless `origin` was already `ai_assisted` or `external_research`. Historical labels such as `stale_benchmark` were not inferred as deterministic origins. The legacy column is left as stored.

An open unique index on `origin_fingerprint` covers `proposed`, `accepted`, `scheduled`, and `active`. Acceptance also takes `pg_advisory_xact_lock(hashtext(fingerprint))`.

## Candidate registry

Calculation version `experiment-suggestions-v1`. The registry is explicit. It does not discover types and it does not ask Gemini to search history.

Implemented families, in product rank order, then stable candidate id. The list shows at most 3.

1. `benchmark_retest_due` only when B3 status is `due`. The candidate pins that protocol version and anchor result. `available`, `waiting_minimum`, `unconfigured`, and `no_baseline` do not create a due candidate. A newer protocol version is not substituted for the due version.
2. `benchmark_missing_baseline` for the current protocol version of an active benchmark with no valid comparable result.
3. `goal_observation` from `compileGoalToExperimentCandidate`.

Supported goal kinds: `body_metric`, `activity_steps`, `nutrition_protein`, `sleep_duration`, and `supplement_adherence` when the selector and unit match an existing Lab requirement. Supplement adherence copies an `at_least` percent into the existing `minimumAdherencePercent` criterion.

Unsupported, fail closed: `strength_e1rm`, `training_frequency`, `benchmark_result`, and anything else. F2 `repeated_pattern` is not a candidate family. Satisfied goals are omitted. An open experiment (`proposed`, `accepted`, `scheduled`, `active`) linked to the same benchmark or goal suppresses the candidate.

Windowed goal thresholds stay on the pinned goal version. Lab requirement criteria do not store those numeric targets, so F4 does not add a second evaluator. Accepted experiments start with null windows, matching manual creation. The review screen shows the duration as text.

Candidate ids:

- `benchmark-retest:<benchmarkId>:<protocolVersionId>:<anchorResultId>`
- `benchmark-missing-baseline:<benchmarkId>:<protocolVersionId>`
- `goal-observation:<goalId>:<goalVersionId>`

The fingerprint covers kind, canonical ids, versions, eligibility, protocol definition, and evidence refs. It excludes time and AI wording.

## AI

Packet `experiment-suggestion-evidence-v1`. Prompt `experiment-suggestion-v1`. Request type `experiment_suggestion`.

`AI_EXPERIMENT_SUGGESTION_MODEL` falls back to `AI_ASK_HEALTH_MODEL`, then `GEMINI_NUTRITION_MODEL`. `AI_EXPERIMENT_SUGGESTION_MAX_REQUEST_COST_USD` defaults to $0.05. Drafts use the shared `ai_usage` budget, reservation lock, and global rate gate.

`GET /api/lab/experiment-suggestions` and `GET /api/lab/experiment-suggestions/:candidateId` do not call Gemini and do not reserve `ai_usage`. `POST .../draft` is the only generation path. The model may return `candidate_ref`, `title`, `rationale`, and `evidence_refs`. Extra protocol, dose, supplement, or literature fields are rejected. Invalid refs, digits, and prohibited treatment language are rejected. Budget, provider, and invalid-output failures leave the deterministic template in place.

## Review and accept

Personal Lab shows Suggested experiments. It is not a primary tab. A benchmark suggestion may be labeled Challenge. Challenge is not a table.

`POST /api/lab/experiment-suggestions/:candidateId/accept` accepts a fingerprint, an optional title, optional notes, and `usedAiDraft`. It ignores protocol JSON from the browser. The server rederives the candidate. A missing candidate or fingerprint mismatch returns `409` with code `stale_candidate`. The insert creates an experiment protocol version, requirements, the benchmark or goal link, and an experiment in status `accepted`.

Without a used draft, `origin_kind` is `deterministic_candidate`. With one, it is `ai_assisted`. `origin_trigger` stays the registry kind either way. The legacy `origin` value is `evidence_gap`, `stale_benchmark`, `goal_plateau`, or `ai_assisted`.

## Backup and demo

Unaccepted suggestions are not stored. Accepted origin columns and `experiment_goals` are in the full archive and the portable export. Portable experiment rows add `origin_label` and `origin_trigger_label`.

`/demo/lab` shows one compiled due Push-up Capacity retest, the empty-state sentence, and the label “Example proposal — not generated live”. It does not call Gemini or create an experiment.

Anonymous suggestion routes return 401. A non-owner returns 403. A wrong method returns 405 before auth. The Apple ingest token is not consulted.

## Implemented

V2-A through V2-E, plus V2-F1 Ask Health, V2-F2 Proactive Insights, V2-F3 Weekly Coach Brief, and V2-F4 Experiment Suggestions. V2-F5 literature retrieval is not implemented.

Weekly facts, coach prose, insight cards, and unaccepted suggestions are derived. Ask Health transcripts are session-only.

## Partial

- Overnight vital storage exists (`0029_sleep_vital_samples.sql`). Every production vital metric is `enabled: false` until a payload is verified.
- Nutrition Gemini capture works and is not charged to `ai_usage`.
- Weekly Coach has no scheduler, notification, or persisted prose.
- Signed-in browser QA of owner Lab routes was not available. `/demo/lab` was exercised.

## Validation

Recorded 2026-09-27 against this tree. There is no separate typecheck script. `npm run build` runs `tsc -b` and then `vite build`.

- `npx eslint .`: exit 0. No findings.
- `npm test`: exit 0. 103 files passed, 872 tests passed. Duration 25.51s.
- `npm run build`: exit 0. `tsc -b` completed, then Vite reported `built in 9.94s`. Vite warned that some chunks are larger than 500 kB. The warning did not fail the build.
- `npm run migrate`: exit 0. Applied `0030_ai_usage.sql` and `0031_experiment_origins.sql`.

## Manual QA

`/demo/lab` on the running dev server showed the fictional Challenge “Push-up Capacity retest”, the due reason, “67 reps · 2026-06-18”, “Push-up Capacity · v2”, the compiled example label, and “No evidence-grounded experiment suggestions right now.” Demo navigation stayed on the public tabs. No create control is on that page.

## Debt relevant to the next task

- The production client bundle still has a large chunk. That warning is known and is not a failed build.
- Server imports use `.js` specifiers. New server files need the same.
- ESLint does not treat a leading underscore as an unused-variable exception.
- Domain code is shared with the client. New client code should not rely on `Array.prototype.at` unless the existing client target is confirmed.
- Do not point tests at the owner's `DATABASE_URL`. Ledger tests use ephemeral Postgres.

## Deviations

- Goal observation does not invent an evaluator for e1RM, training frequency, or benchmark-result goals.
- Accepted suggestion experiments do not write `window_start` / `window_end`. The owner schedules later through the existing Lab action.
- F1, F2, and F3 request behavior was left in place. The shared AI config gained `experimentSuggestionMaxRequestCostUsd` with the same $0.05 default.

## Handoff

No implementation task is active. V2-F5 remains unimplemented. Read `AGENTS.md`, then `PROJECT.md`, `DECISIONS.md`, this file, and `CURRENT_TASK.md`.
