# Dev state

Snapshot recorded 2026-09-27 after the V2-F4 acceptance correction. Goal suggestions fail closed. This commit is the current health application.

## Git

- Branch: `main`
- Baseline the correction was measured against: `749c4a3f937f37c710f5cd82898b4848d8257328` (“Add experiment suggestions the owner must explicitly accept.”)
- Parent of this snapshot: `49233fa` (“docs: add F4 acceptance correction task”)
- This commit corrects Goal-derived experiment suggestions so they are not emitted. It does not add a migration
- Finished tasks are committed and pushed
- Local annotated tag `v1.0.0` points at `7124ca513efa6c833457303ee6ff79d78344fce6`. Whether that tag exists on the remote is unknown

## Schema

- Migration head in the working tree: `0031_experiment_origins.sql`
- No migration was applied for this correction. `0030_ai_usage.sql` and `0031_experiment_origins.sql` were already applied during the original F4 task
- Design manual version in the working tree: 1.0.35
- Package version: 1.0.0
- The live blueprint header names `0031_experiment_origins.sql` as the schema head. Historical amendments and manual ledger rows that name an older head, or that describe Goal suggestions as supported, stay as history

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

`experiment_goals` stays. Surfaced candidates do not write it today. `goal_observation` remains a legal `origin_trigger` value and is not produced by the registry.

## Candidate registry

Calculation version `experiment-suggestions-v1`. The registry is explicit. It does not discover types and it does not ask Gemini to search history.

Surfaced families, in product rank order, then stable candidate id. The list shows at most 3.

1. `benchmark_retest_due` only when B3 status is `due`. The candidate pins that protocol version and anchor result. `available`, `waiting_minimum`, `unconfigured`, and `no_baseline` do not create a due candidate. A newer protocol version is not substituted for the due version.
2. `benchmark_missing_baseline` for the current protocol version of an active benchmark with no valid comparable result.

`goal_observation` stays in `SUGGESTION_KINDS` as dormant vocabulary. `compileGoalToExperimentCandidate` always returns `supported: false`. `buildExperimentSuggestions` therefore never emits a Goal candidate. B4 was not expanded, and F4 did not add a second Goal evaluator.

`targetState = unknown` fails closed with a reason that missing current evidence is not an unmet target. Every other current Goal kind, including unmet `body_metric`, `activity_steps`, `nutrition_protein`, `sleep_duration`, and `supplement_adherence`, fails closed because Body, Activity, Nutrition, and Sleep requirements do not evaluate the Goal threshold, and supplement adherence does not lock `evaluationWindowDays` into Experiment scheduling.

An open experiment (`proposed`, `accepted`, `scheduled`, `active`) linked to the same benchmark suppresses that benchmark candidate.

Candidate ids that can be emitted:

- `benchmark-retest:<benchmarkId>:<protocolVersionId>:<anchorResultId>`
- `benchmark-missing-baseline:<benchmarkId>:<protocolVersionId>`

The `goal-observation:<goalId>:<goalVersionId>` id format remains in the type vocabulary and is not emitted.

The fingerprint covers kind, canonical ids, versions, eligibility, protocol definition, and evidence refs. It excludes time and AI wording.

## AI

Packet `experiment-suggestion-evidence-v1`. Prompt `experiment-suggestion-v1`. Request type `experiment_suggestion`.

`AI_EXPERIMENT_SUGGESTION_MODEL` falls back to `AI_ASK_HEALTH_MODEL`, then `GEMINI_NUTRITION_MODEL`. `AI_EXPERIMENT_SUGGESTION_MAX_REQUEST_COST_USD` defaults to $0.05. Drafts use the shared `ai_usage` budget, reservation lock, and global rate gate.

`GET /api/lab/experiment-suggestions` and `GET /api/lab/experiment-suggestions/:candidateId` do not call Gemini and do not reserve `ai_usage`. `POST .../draft` is the only generation path. The model may return `candidate_ref`, `title`, `rationale`, and `evidence_refs`. Extra protocol, dose, supplement, or literature fields are rejected. Invalid refs, digits, and prohibited treatment language are rejected. Budget, provider, and invalid-output failures leave the deterministic template in place.

## Review and accept

Personal Lab shows Suggested experiments. It is not a primary tab. A benchmark suggestion may be labeled Challenge. Challenge is not a table.

`POST /api/lab/experiment-suggestions/:candidateId/accept` accepts a fingerprint, an optional title, optional notes, and `usedAiDraft`. It ignores protocol JSON from the browser. The server rederives the candidate. A missing candidate or fingerprint mismatch returns `409` with code `stale_candidate`. The insert creates an experiment protocol version, requirements, the benchmark link, and an experiment in status `accepted`.

Without a used draft, `origin_kind` is `deterministic_candidate`. With one, it is `ai_assisted`. `origin_trigger` stays the registry kind either way. The legacy `origin` value is `evidence_gap`, `stale_benchmark`, or `ai_assisted` for the families that can still be accepted.

## Backup and demo

Unaccepted suggestions are not stored. Accepted origin columns and `experiment_goals` are in the full archive and the portable export. Portable experiment rows add `origin_label` and `origin_trigger_label`. Backup and export tests for those fields still pass. Schema-head assertions still expect `0031_experiment_origins.sql`.

`/demo/lab` shows one compiled due Push-up Capacity retest, the empty-state sentence, and the label “Example proposal — not generated live”. It does not call Gemini, create an experiment, or invent a Goal suggestion.

Anonymous suggestion routes return 401. A non-owner returns 403. A wrong method returns 405 before auth. The Apple ingest token is not consulted.

## Implemented

V2-A through V2-E, plus V2-F1 Ask Health, V2-F2 Proactive Insights, V2-F3 Weekly Coach Brief, and V2-F4 Experiment Suggestions for due Benchmark retests and missing Benchmark baselines. Goal-observation suggestions are deferred. V2-F5 literature retrieval is not implemented.

Weekly facts, coach prose, insight cards, and unaccepted suggestions are derived. Ask Health transcripts are session-only.

## Partial

- Overnight vital storage exists (`0029_sleep_vital_samples.sql`). Every production vital metric is `enabled: false` until a payload is verified.
- Nutrition Gemini capture works and is not charged to `ai_usage`.
- Weekly Coach has no scheduler, notification, or persisted prose.
- Signed-in browser QA of owner Lab routes was not available. `/demo/lab` was exercised.

## Validation

Recorded 2026-09-27 against this tree. There is no separate typecheck script. `npm run build` runs `tsc -b` and then `vite build`. `npx tsc -b` was also run on its own before the test suite.

- `npx eslint .`: exit 0. No findings.
- `npx tsc -b`: exit 0.
- `npm test`: exit 0. 103 files passed, 872 tests passed. Duration 27.52s. Benchmark due-retest, missing-baseline, ranking, stale-candidate, and duplicate-accept tests stayed green. F1, F2, and F3 suites stayed green.
- `npm run build`: exit 0. Vite reported `built in 9.86s`. Vite warned that some chunks are larger than 500 kB. The warning did not fail the build.
- No migration command was run.

## Manual QA

`/demo/lab` on the running dev server at `http://127.0.0.1:5173/demo/lab` showed the fictional Challenge “Push-up Capacity retest”, “Push-up Capacity retest is due.”, “67 reps · 2026-06-18”, “Push-up Capacity · v2”, “Example proposal — not generated live”, and “No evidence-grounded experiment suggestions right now.” The page copy says nothing there creates an experiment. No Goal suggestion was shown. Demo navigation stayed on the public tabs. Owner Lab remains behind sign-in, so that path was not exercised.

## Debt relevant to the next task

- The production client bundle still has a large chunk. That warning is known and is not a failed build.
- Server imports use `.js` specifiers. New server files need the same.
- ESLint does not treat a leading underscore as an unused-variable exception.
- Domain code is shared with the client. New client code should not rely on `Array.prototype.at` unless the existing client target is confirmed.
- Do not point tests at the owner's `DATABASE_URL`. Ledger tests use ephemeral Postgres.

## Deviations

- None. The correction fails closed instead of extending B4. `experiment_goals` and the `goal_observation` enum stay unused by the surfaced registry. Accepted suggestion experiments still do not write `window_start` / `window_end`.

## Handoff

No implementation task is active. V2-F5 remains unimplemented. Read `AGENTS.md`, then `PROJECT.md`, `DECISIONS.md`, this file, and `CURRENT_TASK.md`.
