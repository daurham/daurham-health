# PIQ Progress — durable implementation log

> Started: 2026-10-14 (America/Phoenix) · Last updated: 2026-10-14  
> Source of objective: [HEALTH_INTELLIGENCE_QUALITY_MASTER_PLAN.md](./HEALTH_INTELLIGENCE_QUALITY_MASTER_PLAN.md)  
> Work branch: `piq/00-baseline-20261014` · Phase: **PIQ-0 (baseline + evaluation)**  
> This file is the *status ledger*, not a replacement for the master plan. Never infer production status from a Git branch.

## The North Star (do not redefine)

Daurham Health must become an evidence-aware personal analyst and coach: answer questions usefully, connect verified cross-domain facts without inventing causes, recommend proportionate actions when warranted, and learn from observed outcomes while protecting the owner’s health, privacy and budget.

**No new treatment recommendation, automatic goal change, migration, owner-data write, or production promotion is authorized by establishing this baseline.**

## Phase scorecard — evidence, not estimates of time

| Phase | State | Notes / exit requirement |
| --- | --- | --- |
| PIQ-0 baseline/evaluation | IN PROGRESS | Repository truth and initial case registry recorded; owner runtime/DB and measured model baseline still unknown |
| PIQ-1 data/decision integrity | NOT STARTED | Requires PIQ-0 critical golden cases and source audit |
| PIQ-2 physiological owner context | NOT STARTED | Verify profile fields and historical behavior first |
| PIQ-3 Ask Health answer quality | NOT STARTED | Classify early exits versus retrieval versus model errors |
| PIQ-4 cross-domain reasoning | NOT STARTED | Realistic GI, weight, recovery and contradiction cases |
| PIQ-5 meaningful Coach | NOT STARTED | No repetitive/obsolete recommendations; clear action lifecycle |
| PIQ-6 evaluation/learning loop | NOT STARTED | Verified intervention and outcome semantics |
| PIQ-7 safety/cost/release | NOT STARTED | Rollout/QA/telemetry gates |
| PIQ-8 finishing polish | DEFERRED | Only after PIQ core quality milestones; not a core gate |

Completion is based on user-visible acceptance evidence, never number of commits or a forecast.

## PIQ-0.1 — verified code and runtime baseline

### Verified via read-only GitHub API (2026-10-14)

- Repository: `daurham/daurham-health`, default branch `main`. Branch head before PIQ work: `dbc3fcb68324d75d30a96132b725456ec7e45d49` (master-plan adversarial preflight update).
- Current source tree contains migrations `0001` through `0052_hydration_daily_goal.sql`. **This is a repository fact, not proof that production DB applied 0052.**
- Test/build scripts in `package.json`: `npm ci`, `npx tsc -b`, `npx eslint .`, `npm test`, `npm run build`.
- `.github/workflows/validation.yml` validates pushes to branches other than `main`. Full branch checks: install, TypeScript, lint, Vitest, build.
- Existing tests already cover portions of I5 intelligence, I7 maintenance, I9 Coach, Ask Health. They are *not* a substitute for new outcome-oriented golden evaluations.
- `docs/ai/CURRENT_TASK.md` still says I0–I10 are on validation branch and migration head is `0049` with `main` unpromoted; this statement is stale relative to `main` code at `0052`. **Do not overwrite the old history until deployed state is reconciled.**
- Prior GitHub Actions branch run `38322008535` on 2026-10-12 succeeded for commit `6c733ec...` in `fix/coach-stretch-independent-side-20261012`; this does **not** validate the newly created PIQ branch.
- Read-only Vercel `list_projects` found the `daurham-health` project; `list_deployments` with its actual team/project scope returned HTTP 403. Production commit/deploy status not verified; CLI fallback executable was absent from the available container environment.
- Read-only Neon `list_projects` returned an empty list; production Neon project/branch and applied `schema_migrations` cannot be verified through that connection. No DB access claimed.
- No owner physiological data, AI request logs, symptoms, or provider secrets were inspected or copied into the repository.

### Baseline source-to-decision map (code-path inventory; do not equate with production truth)

| Data / concern | Canonical source / builder | Shared intelligence / consumers | Observed gap or verification |
| --- | --- | --- | --- |
| Nutrition intake + reliability | `nutrition_entries`; `src/domain/nutrition/quality.ts` | `server/intelligence/snapshot.ts` -> `src/domain/maintenance.ts`; Goal Control; Ask Health | Source provenance ≠ complete day; absent meals can still yield `high_confidence` entry-quality days |
| Weight and body measurements | Body measurements, `server/intelligence/snapshot.ts` | Maintenance + Goal Control, Progress, Ask Health | Need source comparability, slope alignment, as-of dates |
| Hydration | `hydration_events` | Snapshot `hydration.ml`, shared relationships, Ask Health | Logged water is not total fluid intake or diagnosed dehydration |
| Bowel symptoms | `bowel_events`, `bowel_day_states` | Snapshot `bowel.count`, shared relationships | Bristol consistency and symptom qualifiers are not included in shared signal registry |
| Training performance / plan | Workout sessions, sets, versioned Training Plan | `server/training/plan-service.ts`, Goal Control, I8 training progression, Coach, Weekly Coach | Distinguish completed sessions/days/scheduled future training days; stale state after same-day mutations |
| Sleep / wellness / activity | Sleep and Activity observations; `daily_signals` | Shared snapshot, Ask Health, Weekly Coach | Source completeness/eligibility; past `training.sessions` missing data synthesized as zero without tracking-start coverage |
| Stable clinical profile | `server/profile/service.ts` + `src/domain/health-profile.ts` | `src/domain/ask-health/clinical-profile.ts` | No structured sex; DOB/height omitted from Ask Health profile input; entire clinical profile omitted for historical `asOf` |
| Supplements/medications | Canonical schedule/status + clinical profile | Ask Health packet and clinical context | Historical effective dates and owner-reported versus verified distinctions must be checked |
| Goals and interventions | Goal versions, Change Ledger, Personal Lab | Goal Control, maintenance, Coach, experiments | Review and implementation cannot share the same state |
| Coach recommendations | `src/domain/coach-intelligence.ts` + server companion | CoachCard, Goal Overview | Static priority, orphaned alternatives, seven-day follow-ups; same-day intelligence fetch keyed by `state?.date` |
| Ask Health retrieval / synthesis | `server/ask-health/load.ts`; packet and validator | `server/ask-health/service.ts` Gemini gate | Early insufficiency exit; lens/keyword-selected fixed bounded evidence; no provider call for empty substantive evidence |
| Research | Europe PMC / literature service | Optional explicit external research | Not automatic; not a personal observation or clinical diagnosis |
| Provider cost | `ai_usage`, Ask Health / weekly / nutrition gates | Budget controls + Settings usage view | Production request counts/cache/latency/cost unverified |

### Explicit unknowns (do not turn into conclusions)

1. Which exact commit is currently deployed to owner's phone, including any cached app shell and current serverless function.
2. Actual production `schema_migrations` head and whether any pending migration exists.
3. Relative frequency of insufficient evidence early-exit vs retrieval failures vs provider errors vs genuinely absent personal information.
4. Real usage budget, provider billable tokens, error-rate and latency baseline.
5. Real history quality: which nutrition days are genuinely complete; whether hydration is logged consistently; whether Bristol details exist; whether multiple workout sources conflict.
6. Whether current coach stale behavior reproduces after mobile refresh and exact training reconciliation.

**Access discipline:** A missing permission is recorded as a blocker for the affected validation, not permission to guess. Do not ask for API keys in chat or commit personal health records.

## PIQ-0.2 — question evaluation inventory and rubric

- Initial **synthetic-only** question/evidence registry: `tests/fixtures/piq/golden-cases.ts`.
- Registry integrity tests: `tests/piq0-evaluation-registry.test.ts`. These validate **case specifications only**, not that the Health AI/Coach responses are fixed.
- Owner-triggered questions and 50 required golden scenarios remain authoritative in the master plan §17. The initial executable registry is deliberately narrower and must be expanded before PIQ-0.2 exits.
- All cases have a prompt or owner-trigger, expected retrieved domains, must/must-not constraints, and evaluation owner. General questions must be answered even with no personal data; high-stakes personal advice must remain scoped.
- Rubric dimensions (0–4 each, or N/A): direct answer; retrieval relevance and coverage; factual/physiological correctness; personal context; evidence attribution; uncertainty; safety; actionability; contradiction handling; brevity; latency/cost. Score each case with transcript + evidence manifest and record *why* it failed.
- **Critical failure overrides average score**: fabricated owner health fact, dangerous advice, undetected emergency, incorrect owner/account data, unreconciled training completion, false calorie reduction based on incomplete days.
- Do not compare two prompts on an unversioned random selection of data; pin fixture version, as-of date, expected evidence and model version. Synthetic QA precedes authorized real owner QA.

### PIQ-0.2 acceptance still outstanding

- Fixture records representing all top failure scenarios, including historical/as-known-at-time, ambiguous sources, and cross-domain confounding.
- A deterministic/provider-stub evaluation runner checking evidence refs, unsupported claims, hard fail conditions and classified response reason.
- Owner-approved **private** sample-question evaluation without storing PHI or raw questions in GitHub.

## PIQ-0.3 — diagnostics (NOT STARTED)

Required metrics: request ID, task intent, evidence packet/omitted domain counts, source freshness, route, data completeness, early exit vs provider/error path, cache hit, latency, tokens and cost; no raw medical data or full questions in routine logs. First code change in this slice must include retention and user-visible vs developer-only boundary.

## PIQ-0.4 — regression infrastructure (STARTED / NOT VALIDATED)

Registry shape/integrity Vitest added on development branch; awaits branch CI and full synthetic test fixtures. No clinical logic or model responses changed.

## Release state / constraints

- Branch-only preparation: **no production deployments, database migrations, schema changes, AI API calls, or owner data writes performed by this PIQ work**.
- The Vercel connector's project discovery succeeding does not imply deployment inspection permission.
- A future phase may use read-only owner-authorized database/project access; never apply migrations merely to satisfy a baseline document.
- Branch CI state for this work: **not yet verified when this record was drafted**. Update by citing actual workflow ID/result.

## Continuation packet — NEXT SESSION

**Task:** PIQ-0.2 and PIQ-0.3: finish the baseline, expand synthetic cases and start redacted request reason-code instrumentation, beginning with Ask Health's insufficiency gate. Do not implement a generic “better prompt” or lower-calorie change yet.

**First steps:** Read master §§0–6 + PIQ-0 + §§17–21; inspect this file; verify current main/feature branch, production status, CI and schema. Try authorized Vercel project scope and Neon lookup only if access exists. Reconcile `CURRENT_TASK.md` drift once the verified production state is available. Confirm the baseline contract is still aligned with owner's purpose.

**Definition of next small done:** synthetic fixture runner distinguishes no-data general question from a genuine absent personal measurement; explicit diagnostics differentiate early exit, retrieval failure, model failure; no extra Gemini calls on routine Today render; tests and mobile workflow validation documented.

**Blocking safety:** Do not claim the current product is improved until an actual health question, source-specific evidence and owner acceptance substantiate it.