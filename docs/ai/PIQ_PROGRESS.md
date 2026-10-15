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

- **50 / 50 master-aligned** synthetic-only question/evidence scenario *specifications*: `tests/fixtures/piq/golden-cases.ts`. This is not 50 passing scenarios.
- Registry integrity and master-sync tests: `tests/piq0-evaluation-registry.test.ts`. These validate **case specifications only**, not that Health AI/Coach behavior is fixed.
- Owner-triggered questions and 50 required golden scenarios remain authoritative in the master plan §17. All 50 scenarios are specified. Only selected cases have automated behavior/baseline fixtures; the rest remain unproven until implemented and evaluated.
- All cases have a prompt or owner-trigger, expected retrieved domains, must/must-not constraints, and evaluation owner. General questions must be answered even with no personal data; high-stakes personal advice must remain scoped.
- Rubric dimensions (0–4 each, or N/A): direct answer; retrieval relevance and coverage; factual/physiological correctness; personal context; evidence attribution; uncertainty; safety; actionability; contradiction handling; brevity; latency/cost. Score each case with transcript + evidence manifest and record *why* it failed.
- **Critical failure overrides average score**: fabricated owner health fact, dangerous advice, undetected emergency, incorrect owner/account data, unreconciled training completion, false calorie reduction based on incomplete days.
- Do not compare two prompts on an unversioned random selection of data; pin fixture version, as-of date, expected evidence and model version. Synthetic QA precedes authorized real owner QA.

### PIQ-0.2 acceptance still outstanding

- Fixture records representing all top failure scenarios, including historical/as-known-at-time, ambiguous sources, and cross-domain confounding.
- A deterministic/provider-stub evaluation runner checking evidence refs, unsupported claims, hard fail conditions and classified response reason.
- Owner-approved **private** sample-question evaluation without storing PHI or raw questions in GitHub.

## PIQ-0.3 — diagnostics (PARTIALLY IMPLEMENTED; owner QA pending)

As of this PIQ-0 continuation, `src/domain/ask-health/diagnostics.ts` calculates privacy-safe *response-path* metadata, included in Ask Health API response `meta.diagnostic`. Counts and enum path only—no question text, clinical values or owner identity. Paths: `packet_no_substantive_evidence`, `clarification_required`, `model_answer`, `cache_hit`.

**Known interpretation limit:** `packet_no_substantive_evidence` means the *packet* was empty, not proof that the owner's database lacks evidence. Diagnostics for provider exceptions remain existing `HttpError` codes; end-to-end timing, cost, retrieval/truncation and durable troubleshooting are still outstanding.

Required metrics: request ID, task intent, evidence packet/omitted domain counts, source freshness, route, data completeness, early exit vs provider/error path, cache hit, latency, tokens and cost; no raw medical data or full questions in routine logs. First code change in this slice must include retention and user-visible vs developer-only boundary.

## PIQ-0.4 — regression infrastructure (CODE CI GREEN; evaluation coverage incomplete)

Registry/master alignment tests, four Ask Health service-level baseline tests, four synthetic source-trust tests, and four service failure-path tests added. Both commits `8450428` and `df18aae` have passed branch CI. Behavior gaps T01, T03 and T36 are intentionally characterized, not resolved. Further scenario fixtures, real-owner QA and production verification are outstanding. No clinical reasoning or health target behavior changed.

## Executable baseline checkpoint — PIQ-0.2 / PIQ-0.3

- `tests/piq0-ask-health-baseline.test.ts` exercises synthetic/no-owner Ask Health service behavior with a fake provider and in-memory budget gate.
- **T01 KNOWN PRODUCT FAILURE (expected baseline):** A general creatine question with no personal evidence exits before the model. The test records the observed failure; it must be upgraded to a desired-behavior test when PIQ-3 fixes the route. A green baseline test is **not** an assertion that T01 passes.
- A missing exact personal measurement currently takes the same fallback, proving the pipeline does not yet distinguish question types.
- A canonical synthetic Goal can produce a correctly cited answer through the provider stub, and repeat requests hit the cache.
- An enum/count-only `meta.diagnostic` distinguishes no-evidence packet, clarification, model answer and cache hit. No raw health data and no production provider spend.
- **Remaining PIQ-0 gates:** all 50 core scenarios, executable evidence retrieval fixtures, actual response quality scoring, bounded provider diagnostics, owner QA and verified production deployment/schema/usage baseline.
- **Branch code validation PASSED** for implementation commit `845042835997ddf465dcdc6e5d9847f3fc17e2fe` in GitHub Actions run `38677127236` (npm ci, TypeScript, ESLint, Vitest, build); link: https://github.com/daurham/daurham-health/actions/runs/38677127236. This validates the new instrumentation and synthetic baseline tests, **not** the missing product behavior they document.

## PIQ-0 checkpoint 3 — 50 specifications + executable source/error baseline

**Verified on branch `piq/00-baseline-20261014`** (2026-10-14 owner-local):

- Master-plan IDs **T01–T50** now exist in the checked-in registry; title, input/trigger, mandatory outcomes, and prohibitions are automatically checked against §17 of the master contract.
- **Corrected source-of-truth mismatch:** earlier registry T45 described negated chest pain and T50 described logging effects. The canonical master defines T45 simultaneous/confounded interventions, T50 midnight and DST handling. Related cases remain covered under T41 and T44, respectively.
- `tests/piq0-source-trust.test.ts` covers T03 (currently a high-quality *entry* can represent an incomplete day), T14 (missing bowel entry != recorded zero), T36 (past training days preceding observed tracking currently become synthetic zero), and T28 (invented personal citation rejected).
- `tests/piq0-service-failures.test.ts` covers T20 budget/rate/cached branching and T28 bounded JSON repair, plus provider exception sanitization with a fake model and in-memory usage ledger.
- Ask Health 429 responses now include stable, privacy-safe codes `ASK_HEALTH_BUDGET_EXCEEDED` and `ASK_HEALTH_RATE_LIMIT`. Their behavior and provider allowance limits are unchanged; this does **not** fix the early-insufficiency branch.
- **Full branch CI passed:** GitHub Actions [38677784305](https://github.com/daurham/daurham-health/actions/runs/38677784305), commit `df18aae517664e683fdd2d4d02d594b29eac129e`, including `npm ci`, TypeScript, ESLint, Vitest, and build.
- This checkpoint is an **evaluation/instrumentation milestone**. **0 / 9 PIQ phases complete**; PIQ-0 is still in progress. Green CI is not 50 behavior passes, user-specific useful answers, or clinical safety validation.
- No production merge, owner-data access, migration or AI provider spend. Vercel deployment 403 and inaccessible Neon project list remain unresolved.

### Explicitly remaining before PIQ-0 exit

1. Evaluate the 50 cases in priority cohorts with realistic synthetic *canonical records*, full retrieval manifests, falsifiable expected outcomes, and independent quality scoring. Do not falsely claim all 50 tested from their presence in a registry.
2. Add evidence-load/retrieval/truncation diagnostics (the pipeline currently identifies a zero-substantive **packet**, not whether the underlying database truly lacks observations), with limited/redacted retention.
3. Confirm configured live deployment commit, production schema head, and owner-authorized token/cost/latency baseline; do not use production medical records as GitHub fixtures.
4. Owner mobile acceptance: baseline questions and the actual Today/Coach behavior with privacy-preserving notes, then mark exit requirements one at a time.

### Next bounded task

**PIQ-0.2/0.3:** add a deterministic evidence fixture runner proving useful citation/coverage behavior and distinguishing failure to retrieve from genuinely absent personal records, without increasing ordinary Gemini consumption. Introduce a small evaluated cohort before PIQ-1; preserve the master plan and green regression suite. No production promotion until authorized and safety/data gates pass.

## Release state / constraints

- Branch-only preparation: **no production deployments, database migrations, schema changes, AI API calls, or owner data writes performed by this PIQ work**.
- The Vercel connector's project discovery succeeding does not imply deployment inspection permission.
- A future phase may use read-only owner-authorized database/project access; never apply migrations merely to satisfy a baseline document.
- Branch CI for newest code changes: **success** — Actions run `38677784305` on `df18aae`, all standard checks passed. Documentation-only updates may trigger additional runs; only claim verified checks by their SHA.

## Continuation packet — NEXT SESSION

**Task:** PIQ-0.2/0.3: add a small synthetic canonical-evidence retrieval evaluation cohort, separate source absences from routing/truncation and strengthen sanitized failure diagnostics; do not jump into PIQ-1 before verifying its evidence gates.

**First steps:** Read master §§0–6 + PIQ-0 + §§17–21; inspect this file; verify current main/feature branch, production status, CI and schema. Try authorized Vercel project scope and Neon lookup only if access exists. Reconcile `CURRENT_TASK.md` drift once the verified production state is available. Confirm the baseline contract is still aligned with owner's purpose.

**Definition of next small done:** synthetic fixture runner distinguishes no-data general question from a genuine absent personal measurement; explicit diagnostics differentiate early exit, retrieval failure, model failure; no extra Gemini calls on routine Today render; tests and mobile workflow validation documented.

**Blocking safety:** Do not claim the current product is improved until an actual health question, source-specific evidence and owner acceptance substantiate it.