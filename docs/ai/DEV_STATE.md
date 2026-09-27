# Dev state

Snapshot recorded 2026-09-27 after V2-F5 Literature-Backed Evidence Drawer. This commit is the current health application.

## Git

- Branch: `main`
- Baseline the task named: `30c91b20230f5db05025b608588442f13bfd812b` (“Stop suggesting Goal experiments Lab cannot evaluate.”)
- Parent of this snapshot: `520d602` (“docs: define V2-F5 literature evidence task”)
- This commit adds explicit Europe PMC literature search on Ask Health. It does not add a migration
- Finished tasks are committed and pushed
- Local annotated tag `v1.0.0` points at `7124ca513efa6c833457303ee6ff79d78344fce6`. Whether that tag exists on the remote is unknown

## Schema

- Migration head in the working tree: `0031_experiment_origins.sql`
- No migration was applied for F5. `0030_ai_usage.sql` and `0031_experiment_origins.sql` were already applied
- Design manual version in the working tree: 1.0.36
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

## Literature

Retrieval version `literature-retrieval-v1`. Prompt `literature-synthesis-v1`. Request type `literature_synthesis`.

`POST /api/ask-health/literature` is the only literature call. Ask Health submit and opening External research do not call Europe PMC or reserve `ai_usage`. The owner edits the visible query. Europe PMC receives that query plus `SRC:MED` and `HAS_ABSTRACT:Y` at `https://www.ebi.ac.uk/europepmc/webservices/rest/search` (`format=json`, `resultType=core`, page size 8). The browser does not call Europe PMC.

The adapter keeps at most five PubMed-indexed records with a PMID, nonempty title, and nonempty abstract, in provider order. Dedup is by PMID, then by DOI. Refs are `pubmed:<PMID>`. Missing DOI, journal, year, or authors stay missing. Study type comes from publication-type metadata, with this precedence: meta-analysis, systematic review, randomized trial, clinical trial, observational, review, other. There is no quality score.

Abstracts are server-only, capped at 3000 characters each. The synthesis packet is capped at 18000 characters by shortening the lowest-ranked abstracts first. The browser response has source cards and no abstract text. Links are `https://pubmed.ncbi.nlm.nih.gov/<PMID>/` and `https://doi.org/<DOI>` when the DOI is a DOI.

Gemini paraphrases only that packet. Output is at most four blocks, each citing a retrieved ref. Extra citation fields, unknown refs, and any digit reject the whole synthesis. Budget, rate, timeout, missing configuration, and invalid prose still return the source cards. Timeout marks the reservation uncertain. Missing configuration releases it. Invalid prose still completes the reservation at provider cost. Zero sources skip Gemini and skip the reservation. A process-local cache may skip a repeat Gemini call. It is not budget authority.

`AI_LITERATURE_MODEL` falls back to `AI_ASK_HEALTH_MODEL`, then `GEMINI_NUTRITION_MODEL`. `AI_LITERATURE_MAX_REQUEST_COST_USD` defaults to $0.05. Synthesis shares `AI_MONTHLY_BUDGET_USD` and the global rate gate. The Europe PMC request is not a Gemini call.

Personal evidence stays in “Your Health evidence” with numbered markers. External sources use `[R1]`, `[R2]`, and so on. The limitation sentence is product copy. Literature does not rewrite the Ask Health answer and does not create an Experiment, Goal, insight, coach brief, or Timeline row. Queries, results, abstracts, and synthesis are not stored, backed up, or put in `localStorage`.

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

V2-A through V2-E, plus V2-F1 Ask Health, V2-F2 Proactive Insights, V2-F3 Weekly Coach Brief, V2-F4 Experiment Suggestions for due Benchmark retests and missing Benchmark baselines, and V2-F5 Literature-Backed Evidence Drawer. Goal-observation suggestions remain deferred. V2-F is complete.

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
- `npm test`: exit 0. 105 files passed, 884 tests passed. Duration 23.47s. F1, F2, F3, and F4 suites stayed green.
- `npm run build`: exit 0. Vite reported `built in 9.90s`. Vite warned that some chunks are larger than 500 kB. The warning did not fail the build.
- No migration command was run.

## Manual QA

`/demo/ask-health` on the running dev server showed the fictional answer with markers `[1]`, `[2]`, and `[3]` under “Your Health evidence”, then External research. Opening that drawer showed “Example research drawer — not retrieved live”, the query “sleep athletic performance”, `[R1]` Watson 2017 and `[R2]` Mah 2011, PubMed links `https://pubmed.ncbi.nlm.nih.gov/29135639/` and `https://pubmed.ncbi.nlm.nih.gov/21731144/`, the matching DOI links, and the targeted-search limitation. No Europe PMC or Gemini request was recorded. `localStorage` stayed empty. At 390px the page did not overflow horizontally. Signed-in owner Ask Health was not exercised because the owner lock screen blocks it.

## Debt relevant to the next task

- The production client bundle still has a large chunk. That warning is known and is not a failed build.
- Server imports use `.js` specifiers. New server files need the same.
- ESLint does not treat a leading underscore as an unused-variable exception.
- Domain code is shared with the client. New client code should not rely on `Array.prototype.at` unless the existing client target is confirmed.
- Do not point tests at the owner's `DATABASE_URL`. Ledger tests use ephemeral Postgres.

## Deviations

- None. F5 does not extend B4, does not add a literature table, and does not create Experiments from papers. `external_research` stays unused origin vocabulary. Goal-observation suggestions remain deferred.

## Handoff

No implementation task is active. V2-F is complete. Goal-observation experiment suggestions and overnight vital metrics remain deferred. Read `AGENTS.md`, then `PROJECT.md`, `DECISIONS.md`, this file, and `CURRENT_TASK.md`.
