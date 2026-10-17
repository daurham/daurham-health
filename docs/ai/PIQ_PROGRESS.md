# PIQ Progress — durable implementation log

> Started: 2026-10-14 (America/Phoenix) · Last updated: 2026-10-16  
> Source of objective: [HEALTH_INTELLIGENCE_QUALITY_MASTER_PLAN.md](./HEALTH_INTELLIGENCE_QUALITY_MASTER_PLAN.md)  
> Work branch: `piq/00-baseline-20261014` · Phase: **PIQ-4.2 (development; formal owner acceptance 0/9)**  
> This file is the *status ledger*, not a replacement for the master plan. Never infer production status from a Git branch.

## The North Star (do not redefine)

Daurham Health must become an evidence-aware personal analyst and coach: answer questions usefully, connect verified cross-domain facts without inventing causes, recommend proportionate actions when warranted, and learn from observed outcomes while protecting the owner’s health, privacy and budget.

**No new treatment recommendation, automatic goal change, migration, owner-data write, or production promotion is authorized by establishing this baseline.**

## Initial 2026-10-14 phase scorecard (historical baseline, NOT live status)

The entries below record the original baseline. For current implementation status use the newest timestamped checkpoints at the end of this ledger. No phase is owner-accepted solely because engineering tests pass.

| Phase | State | Notes / exit requirement |
| --- | --- | --- |
| PIQ-0 baseline/evaluation | IN PROGRESS | Repository truth and initial case registry recorded; owner runtime/DB and measured model baseline still unknown |
| PIQ-1 data/decision integrity | BRANCH PREPARATION | PIQ-1.1 day-completeness pure domain and persisted owner API code validated; migration/UI/consumer wiring and owner runtime QA missing |
| PIQ-2 physiological owner context | NOT STARTED | Verify profile fields and historical behavior first |
| PIQ-3 Ask Health answer quality | BRANCH IMPLEMENTATION | General educational routing, insufficient-evidence fix, narrow current-emergency safety; owner QA and later PIQ-3 slices outstanding |
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

## PIQ-0 checkpoint 4 — evidence selection and source coverage audit (validated)

**Implementation:** `90bcdde64c098cf92bbd8cd46f908b5428e09649` on `piq/00-baseline-20261014`  
**CI:** [GitHub Actions 38678265999](https://github.com/daurham/daurham-health/actions/runs/38678265999) — **PASSED** (`npm ci`, TypeScript, ESLint, full Vitest, production build).

### What was proven with synthetic fixtures

- In `src/domain/ask-health/packet.ts`, the existing packet selection algorithm now produces **count-only audit metadata**: draft candidate count, kept count, dropped count, dropped substantive count, configured character limit, selected evidence length and whether the selected items still exceed the limit.
- This audits **what the packet builder attempted and discarded**, without changing existing evidence priority, serialization for the model, prompt, or the Ask Health insufficient-evidence gate.
- In `src/domain/ask-health/diagnostics.ts`, `auditAskHealthSharedCoverage` compares **non-derived observed shared signals** from the full intelligence snapshot to the subset selected by `routeHealthIntelligence`. Output is three *counts only*; no source names, values, IDs, raw question, provider output or clinical profile.
- The server loader passes the source audit into the packet; Ask Health response `meta.diagnostic` includes the source-coverage audit and builder-selection audit. Both are nullable, so **uninspected is not equivalent to observed zero**. Client types updated accordingly.
- `tests/piq0-evidence-selection.test.ts` adds **five** synthetic tests: no observed shared data, observed-but-unselected signals, size-trimmed substantive evidence, impossible tiny cap, and absent source audit. Existing `tests/piq0-ask-health-baseline.test.ts` was updated for the expanded count-only diagnostic shape.
- Important uncovered confounder: `src/domain/intelligence/shared.ts` synthesizes training zeroes on completed days. This is **not** proof a source recorded a session. The audit deliberately excludes purely derived observations when counting available source signals.
- No canonical DB access, model call, migration, health target change or production promotion.

### Strict interpretation boundaries

1. **`unselectedObservedSignalCount > 0` is not a failed answer by itself.** Unselected signals may be irrelevant. It means there is source material outside the routing selection worth checking against question intent.
2. **`observedSignalCount === 0` is not proof there are no owner records.** It only describes non-derived observations in the *loaded shared-signal snapshot*, within its date/range.
3. **`removedSubstantiveCount > 0` identifies potentially material packet loss, not necessarily that the removed facts were relevant.** T21 still needs question-focused evidence-priority evaluation.
4. Some health facts bypass this shared-signal snapshot (profile, Goals, individual exercises, medications, etc.). A full cross-source retrieval audit remains outstanding.
5. Packet overflow after removing all priority-positive candidates is now explicitly detectable. No automatic truncation/silent reshaping was added in this baseline phase.
6. Raw owner questions, health facts, or provider payloads must never be placed in shared CI reports, routine diagnostics or repository fixtures.

### Remaining PIQ-0 blockers

- Broaden question-intent versus source-selection evaluation beyond the shared signal registry. Demonstrate true relevance with realistic synthetic canonical inputs and a graded evidence manifest.
- Distinguish source-loading failure from missing records, and evaluate stale/historical evidence and corrected records in the end-to-end Ask Health path.
- Verify production Git deployment, database migrations, AI costs/latency, and owner mobile acceptance when authorized access is available. Existing Vercel 403 and no Neon projects returned are still barriers.
- **PIQ-0 remains IN PROGRESS. PIQ-1 through PIQ-7 are NOT STARTED; PIQ-8 deferred.** Green CI validates instrumentation and synthetic tests, not health-answer correctness.

### Next bounded task

Build **question-focused evidence relevance fixtures** for T01/T12/T18/T21 using real domain builders and synthetic source records. Score whether required evidence was eligible, selected, truncated or unavailable. Prefer pure deterministic evaluation. Do not modify prompts, increase routine Gemini usage or call private owner data without approval.

## PIQ-0 checkpoint 5 — question-intent evidence relevance (validated)

**Code commit:** `b44b6455cded0d319348043c7238b42841c001a9` · **CI:** [GitHub Actions 38678922849](https://github.com/daurham/daurham-health/actions/runs/38678922849) — passed installation, TypeScript, ESLint, full Vitest suite and production build.

### Executable synthetic evidence-path cohort

- New `tests/fixtures/piq/evidence-relevance.ts` implements a **test-only** requirement manifest. Each test explicitly proves its fixture's source and routing assumptions with existing domain functions, then classifies required evidence as `no_source_record`, `not_modelled`, `historically_ineligible`, `excluded_by_router`, `missing_from_builder`, `removed_by_packet_cap`, or `selected`. It counts mandatory facts, selected mandatory facts, and missing mandatory facts.
- New `tests/piq0-intent-evidence.test.ts`: **six** executable tests for the T01/T12/T18/T21 cohort and classification edge cases. They use real Ask Health packet builder, shared snapshot/router and clinical-profile date gate with **fictional inputs**, never private owner data or Gemini calls.
- **T01 known product gap remains:** a general education question has no mandatory owner evidence, yet the existing Ask Health gate still refuses when its packet lacks substantive owner facts. The regression fixing the answer belongs in PIQ-3.
- **T12 partial retrieval / not-modelled fact:** bowel count, logged water, and fiber are routed, but recorded *stool consistency/Bristol type* is not represented in the shared-signal evidence model. In the synthetic manifest **3/4 mandatory facts selected**. A Bristol value supplied as fixture scenario context is **not** automatically a canonical DB fixture or a diagnosed condition.
- **T18 safe historical limitation:** the current Health Profile medication list is intentionally omitted for an earlier as-of date; the system cannot infer historical medication status from today. The manifest calls this `historically_ineligible`; it is **not** license to silently reuse today's facts. Historical effective-date provenance must be implemented or the answer clearly scoped.
- **T21 actual size-trim gap:** 16 synthetic profile medications with the last one relevant to the question, passed through the real packet builder at default vs restricted `maxChars=1700`. The last medication is available in the unrestricted packet and absent in the bounded packet. This proves material evidence may be discarded without intent-aware preservation.
- **T21 appropriate router exclusion:** a sleep-only question routes out unrelated recorded hydration; the test classifies it but does not count it as a mandatory failure.
- The helper distinguishes an actually unavailable source record from a selected-source builder omission; it **does not automatically determine relevance**, which remains the fixture author's explicit, reviewable assertion.

### Scope / limitations

- This is an **evidence-route and fixture acceptance baseline**, not proof Gemini answers are correct, evidence is clinically sufficient, or all 50 scenarios pass.
- Previously validated PIQ-0 evidence-count diagnostics remain unchanged. The code added in this checkpoint is **test-only**.
- No profile/medication history was fabricated, no schema or data writes were made, no provider calls occurred, and no production code was deployed.

### Next bounded work

Expand question-intent checks to distinguish a true **data-load failure** from a valid but empty source, add privacy-safe classification at the server evidence-load boundary and relevant evidence-revision/truncation cases. Then review PIQ-0 exit gates explicitly; production deployment and DB migration state remain unverified due to access scope.

**Phase truth:** PIQ-0 **IN PROGRESS**; PIQ-1..PIQ-7 **NOT STARTED**; PIQ-8 **DEFERRED**. 0 / 9 phases owner accepted.

## PIQ-0 checkpoint 6 — failed reads vs empty evidence; cache corrections (CI validated)

**Validated code commit:** `2eb657c9a0f2f65a27f8a474bbdb8436b3cd2ca5`  
**GitHub Actions:** [38679378153](https://github.com/daurham/daurham-health/actions/runs/38679378153) — **PASSED**: installation, TypeScript, lint, full Vitest suite, production build.

### Synthetic boundary tests and protected behaviors

- `tests/piq0-retrieval-revision.test.ts`: **seven** tests that exercise the actual Ask Health service or its canonical packet/fingerprint helpers with a mocked data loader and a provider stub (no real Neon credentials or Gemini calls).
- **Valid read with no substantive records** returns the established `packet_no_substantive_evidence` path. This describes only the loaded packet; it does **not** prove the owner database is empty or that a safe general-knowledge question should be refused.
- **Unexpected database/loader failure** results in sanitized **503 `ASK_HEALTH_EVIDENCE_LOAD`**, with no provider request and no raw failure/health-record content in routine error logs.
- **Internal HttpError 5xx hardening:** Previously such errors were rethrown verbatim by the load boundary, potentially exposing an internal SQL/medical error message. The server now normalizes internal 5xx errors to the same sanitized 503 while retaining known 4xx client/owner authorization errors. No changes to database queries, authentication, model cost limits or clinical guidance.
- **T27 selected-fact correction:** Editing a fixture goal changes the serialized evidence fingerprint and causes a new mocked model answer rather than reusing the cached answer; unchanged evidence continues to hit cache. Historical `asOf` periods also have distinct fingerprints.
- **T48 KNOWN INTEGRITY LIMITATION:** When a clinical medication fact was omitted by packet trimming, correcting that omitted fact **did not change the packet fingerprint**. This is a real source-revision/cache-freshness hole, NOT an approved product behavior. PIQ-3 should add source revision/freshness or query-relevant preservation and a regression that expects cache invalidation after correction/deletion.
- These tests establish what current code can and cannot do. They do not demonstrate live owner question correctness or the full source-load fanout's specific failure origin.

### Observability boundaries and next step

- Server already distinguishes a successful but insufficient packet from an exception, now independently covered by regression tests.
- Packet diagnostics identify selected/unselected/truncated shared signals, but a fully empty *loaded* evidence view still cannot prove absence in the underlying database.
- **Open PIQ-0 gates:** production Vercel commit and applied Neon schema, actual provider spend/latency baseline, additional owner-driven response-quality/clinical-safety scoring, timestamp/correction integration beyond the selected Goal fixture, and mobile acceptance. Access to Vercel deployment listing was 403 and the available Neon project list was empty at prior read-only check; do not substitute assumptions.
- **No production merge/deploy, migration, owner-data read/write or live Gemini billing by PIQ work.**
- **Phase truth:** PIQ-0 IN PROGRESS, PIQ-1–PIQ-7 NOT STARTED, PIQ-8 DEFERRED. **0/9 phases completed**, despite checkpoint 6 code CI passing.

### Handoff

Next bounded work: strengthen synthetic owner-question outcome assessments and triage the remaining PIQ-0 exit gates against what is technically testable without production access. If runtime scope remains blocked, preserve the blocker and the verified CI state rather than inventing deploy/schema facts. When PIQ-1 begins, prioritize source-completeness and training missing-vs-zero semantics; never automatically cut calories based on partial food days.

## PIQ-0 checkpoint 7 — answer quality, grounding and critical-safety reviews (CI validated)

**Validated implementation:** 11bf5e0a66100d89d2425e77964b7b22fa420e5e · **CI:** [GitHub Actions 38680233032](https://github.com/daurham/daurham-health/actions/runs/38680233032) — passed npm ci, TypeScript, lint, Vitest and production build, 2026-10-14 local.

### Delivered
- **tests/fixtures/piq/answer-quality.ts**: synthetic test-only evaluation adapter implementing the 12-axis 0–4/N-A review rubric, reviewed claims and evidence IDs, explicit safety-review state and a hard-failure veto. No automatic diagnosis or semantic safety detection is claimed.
- **tests/piq0-answer-quality.test.ts**: 11 executable synthetic tests, including actual T01 insufficient-evidence service output, evidence-free useful general education, an uncited fabricated personal measurement, a cited source supporting the opposite conclusion, unsafe advice overriding a perfect score, negated symptom misunderstanding, unsafe calorie change, grounded synthetic personal Goal and missing/invalid reviews.
- **docs/ai/PIQ_EVALUATION_GUIDE.md**: reviewed quality/scoring protocol and privacy rules. All tests use fictional records and provider stubs; no production owner questions or Gemini calls.
- Current JSON validation does **not** establish factual or clinical trust: an owner-specific invented measurement without any citation can be structurally accepted; a valid evidence ref may contradict the prose claim. Human-reviewed grounding detects these in synthetic fixtures. PIQ-3 must prevent unsupported owner claims more robustly.
- T01's actual insufficient-general-question behavior remains a **known product failure**. T40 deterministic pre-provider safety fallback is **not implemented**. A green scoring harness is not a clinically reviewed safety system.
- Missing review of safety, an axis, or a response block cannot pass. Critical issues (unsafe advice, invented owner fact, missed emergency, unsafe calorie cut, etc.) override mean score. Fixture-level pass does NOT mean owner acceptance or production release.

### PIQ-0 exit readiness and remaining blockers

| Exit aspect | Status | Evidence / limitation |
| --- | --- | --- |
| Repository/test baseline and 50 scenario specifications | VERIFIED | GitHub CI and master-plan synchronized case registry |
| Code-level dataflow/retrieval/trim and cache evaluations | VERIFIED for synthetic paths | Packet, source, response and retrieval fixture suites |
| Privacy-safe diagnostics and error handling | VERIFIED on branch | Count-only diagnostics, stable reason codes, sanitized internal read errors |
| Answer-quality scoring and critical-failure overrides | VERIFIED as test machinery | 11 fixture tests and reviewer instructions |
| Owner-reviewed real Health AI useful-answer baseline | NOT VERIFIED | No owner live answer/evidence transcript scored |
| Actual mobile/Coach owner acceptance | NOT VERIFIED | No current owner-device QA session |
| Live Vercel production commit/deployment | UNKNOWN | Vercel deployment listing returned 403; GitHub main has successful Vercel commit status, which alone cannot prove active production |
| Applied Neon production migration head | UNKNOWN | Connected Neon project list empty; repo contains source migrations through 0052, not evidence they were applied |
| Real AI usage, token cost and latency baseline | UNKNOWN | Live ledger/provider data inaccessible |
| Clinical safety handling of urgent questions | NOT VERIFIED | Reviewer veto tested; actual deterministic safety fallback remains later PIQ-3 work |

**0/9 phases completed. PIQ-0 is ACTIVE, not accepted.** This is a real engineering milestone, not product-quality certification.

### Scoped next steps

Stop expanding test counts for their own sake. Next, pursue runtime verification using authorized read-only deployment and schema access, gather limited owner-approved real-question scoring in a private process, and **prepare PIQ-1.1's nutrition day-completeness implementation contract in parallel**. Do not deploy changes, alter calorie targets, or mark PIQ-0 exited while the runtime and acceptance gates remain unknown. PIQ-8 stays deferred.

## PIQ-1.1 preparation checkpoint — separated nutrition source quality from whole-day completeness (CI validated)

**Implementation commit:** `f5abecc69c7ca8c10af84cb5db148e1729769089`  
**Validation:** [GitHub Actions 38681257864](https://github.com/daurham/daurham-health/actions/runs/38681257864) — **PASSED** npm ci, TypeScript, ESLint, full Vitest and production build.

**Scope:** PIQ-0 remains ACTIVE, with runtime/owner acceptance unverified. PIQ-1.1 has begun as **branch-only safe domain preparation**, not a completed PIQ-1 phase. No production deployment, migration, data mutation, AI charge or live calorie-target change.

### Verified problem and code delivered

- `src/domain/nutrition/quality.ts` previously labeled precise entries high confidence. `server/intelligence/snapshot.ts` propagated this to daily calorie signals, and `src/domain/maintenance.ts` did not distinguish whole-day completeness.
- New pure `src/domain/nutrition/day-completeness.ts` separates owner-reported `confirmed_complete | partial | unknown` (with future `probably_complete` reserved but **never automatically inferred**) from existing source accuracy. Confirmation is bound to an opaque canonical entry revision; changed/missing revision makes it stale. Same local-day and future records stay provisional. Excluded/AI-heavy/unknown-source/zero-intake-fast days cannot silently feed a high-reliability maintenance-calorie estimate. No old day is auto-confirmed.
- New `tests/piq1-nutrition-day-completeness.test.ts`: **15** synthetic cases for one-meal and multiple-meal logs, explicit confirmation/partial/unknown, edits, current day, fast, unknown source, exclusions, stale revision, and distinct coverage counters.
- New `tests/piq1-maintenance-eligibility-baseline.test.ts`: **3** tests using the actual existing maintenance engine plus a **test-only strict filtering simulation**. Verified: 28 precise one-meal 600-kcal days may produce an observed maintenance estimate; flat-weight one-meal 1400-kcal days can trigger a recommended calorie-cut review. Supplying a strict owner-completeness gate in the fixture withholds these unsupported estimates and recommendation. This is a **confirmed current product risk**, not a deployed fix.
- CI caught a distinction bug: legacy `unknown` source calories were initially flagged as zero intake. Corrected to classify using **total logged calories** before source-quality checks; final green CI verifies this.
- New durable [PIQ-1.1 implementation contract](./PIQ_1_1_NUTRITION_COMPLETENESS_CONTRACT.md) specifies proposed owner-scoped day records, atomic revision checks, explicit fast reporting, historical unknown defaults, UI changes, and maintenance/Coach/Goal Control integration gates.

### Still required for PIQ-1.1 implementation

1. Verify production Neon schema and deployed version (PIQ-0 runtime blockers remain); test any migration with a safe branch before production.
2. Implement persisted per-day owner confirmation, deterministic revision across nutrition CRUD plus analysis exclusions, authenticated API with stale-update 409, and a low-friction owner correction/undo UI.
3. Wire the gate into the **actual** maintenance and downstream Coach/Goal Control computation only when canonical confirmation is read reliably. Test that no prior day silently counts as confirmed and a one-meal day can no longer cause unsupported calorie adjustment.
4. Validate current-day/local timezone rollover, late imports, fast days, partial source coverage, edits, medical safety constraints, owner mobile QA and release gate.
5. Do not change target calories automatically or deploy/merge to main while production readiness is unknown.

**Phase scoreboard:** PIQ-0 ACTIVE / not exited. PIQ-1 PREPARATION STARTED / not implemented end-to-end. PIQ-2..7 not started. PIQ-8 deferred. **0 / 9 completed**.

## PIQ-1.1 storage checkpoint — owner-confirmed nutrition days (branch CI green)

**Verified code commit:** `de8f5275692859d177d1eca4bbaa812cd0554b6b`  
**GitHub Actions:** [38684238616](https://github.com/daurham/daurham-health/actions/runs/38684238616) — **PASSED** npm ci, TypeScript, ESLint, full Vitest suite, and production build.

### New implementation

- **Branch-only migration `0053_nutrition_day_completeness.sql`** creates a one-row-per-instance-day owner report with `health_date`, `owner_report` (`complete|partial|unknown`), explicit `zero_intake_fast`, canonical `entry_revision`, monotonic `version`, and confirmation/update timestamps. No historical row backfill or auto-confirmation.
- **`server/nutrition/day-completeness.ts`** supplies current-day GET and version-checked PUT domain service. Revision is SHA-256 of sorted canonical food rows plus relevant analysis-review rows, computed in PostgreSQL and exposed only as an opaque digest. Source edits/removed entries, retroactive corrections, imported entries, and analysis exclusion changes invalidate a prior confirmation. Atomic SQL checks `expectedRevision` and `expectedVersion`; a mismatch gives sanitized 409.
- **`server/handlers/nutrition-day-completeness.ts`** is protected by the existing owner auth middleware and routed at `GET/PUT /api/nutrition/day/completeness`. Future-date and malformed writes are rejected; empty days require explicit fasting; unavailable DB state becomes sanitized 503, never "complete".
- Backup inventory includes the new canonical day-confirmation table and source schema head `0053`; existing migration-head tests were advanced accordingly.
- **10 synthetic mocked-DB contract tests** plus the earlier 18 PIQ-1.1 completeness and maintenance tests cover unknown historical days, explicit confirmation, version conflicts, edits, fasted days, future requests, 503 fallback, SQL compare-and-swap structure, and routing.
- Full suite initially found old `0052` schema head assertions plus a fasting mock mistake. Both were corrected. Final code CI is fully green.
- **Crucial qualification:** CI exercises mocked DB behavior and query structure, **not a real Postgres/Neon transaction**; before any deployment, run migration and GET/PUT against a disposable Neon branch and test concurrent food mutation/exclusion, backup+restore, correctness of SQL digest, and authenticated API on local/preview. Also note separate source/read queries can race; a single atomic write guards stale submission but consumers must independently require a matching read revision.
- **No production schema migration, merge, medical-record access, UI change, actual maintenance wiring, model spending or calorie-target modification.**

### Remaining integration

1. Verify live Neon migration head and Vercel serving commit (existing PIQ-0 access blockers), branch-test migration `0053` and reconcile schema before applying anything live.
2. Run real DB integration/restore tests to verify SHA-256 query, review exclusion coverage and optimistic writes. Investigate revisions across live nutrition ingestion/legacy variants; ensure a change to the source cannot leave a positive stale eligibility decision.
3. Add low-friction Nutrition confirmation control and ensure authentic owner report/date/revision/version handling, clear stale status after edits and explicit fast.
4. Only then connect verified completeness to the **actual** maintenance/Coach/Goal Control calculations, and prove T03 prevents calorie changes for 28 precise one-meal days, plus appropriate behavior for reliably completed periods.

**Scoreboard: 0/9 phases accepted. PIQ-0 remains open; PIQ-1.1 storage implementation is code-validated but NOT database-validated or user-live.**

## PIQ-1.1 persistence hardening checkpoint — verified branch CI (2026-10-14)

**Validated implementation:** `1b47aaff62cfaf5f1ddff8969ce3bbf29d27aa3f`  
**GitHub Actions:** [38684874814](https://github.com/daurham/daurham-health/actions/runs/38684874814) — **PASSED** npm ci, TypeScript, ESLint, full Vitest suite, production build.

### Implemented and checked

- Retains unapplied `0053_nutrition_day_completeness.sql`, owner-authenticated `GET/PUT /api/nutrition/day/completeness`, version-bound source digest and compare-and-swap confirmation write, migration backup inventory. No historical data is automatically marked complete.
- **Six new authenticated handler cases** in `tests/piq1-nutrition-completeness-handler.test.ts` exercise refused unauthenticated GET/PUT, authorized read/update routing, 409 stale-write responses, and 400/405 errors.
- **Two additional repository cases** in `tests/piq1-nutrition-completeness-storage.test.ts` exercise a food-record change between source reads and an individually excluded food. The service now refuses mixed-revision reads with sanitized 409 and excludes any day containing an analysis-excluded entry from maintenance eligibility even when other entries have high source quality.
- SQL source fingerprint aggregation now has deterministic tie-breaking by review fingerprint; compare-and-swap SQL independently enforces an explicit fasting flag for an empty complete day, including a concurrent food deletion between initial validation and the write.
- First CI iteration caught an unused new test import in ESLint; fixed and revalidated. A green CI run verifies TypeScript/lint/tests/build; mock database fixtures and static SQL assertions still **cannot prove SQL executes or serializes correctly on Neon**.

### What is *not* implemented or validated

- **No migration applied** (even to a staging DB), no real SQL execution or transaction/concurrency verification; Vercel live serving SHA and Neon applied schema remain unknown under existing connector access limitations.
- No user-facing Nutrition confirmation control, no use of persisted confirmations by `src/domain/maintenance.ts`, Goal Control or Coach. The original one-meal-day unsafe maintenance recommendation is **still a live product risk** until the actual consumer gate is wired and deployed safely.
- No Gemini calls, clinical records accessed, new production deployments, calorie target mutations or `main` merges.

### Next bounded action

1. Gain authorized **temporary** Neon branch access; run `0053` there, execute real food insert/edit/delete, exclusion and concurrent confirmation queries, verify backup/restore + deterministic digest and no implicit old-day completion. Do **not** point the migration at production by default.
2. Build a lightweight owner Nutrition UI that displays `unknown/partial/confirmed/stale` and sends `expectedRevision`/`expectedVersion`, with explicit fast and easy correction. Test mobile interactions.
3. Connect the real maintenance/Coach/Goal-Control food-calorie eligibility gate to **stored** owner confirmations, only when the DB read path is verified. Re-run T03: 28 single-meal days cannot authorize intake reduction.
4. Continue PIQ-0 owner-approved live answer quality and production status audit independently.

**Phase scoreboard:** PIQ-0 active/open. PIQ-1.1 persistence backend implemented on branch with green code CI, **not end-to-end complete**. PIQ-1 full phase unaccepted; PIQ-2–7 pending and PIQ-8 deferred. **0/9 phases complete**.

## PIQ-1.1 Nutrition owner review UI — branch code validated

**Code:** `9b1686a1882c98343101b46f3f441ae0f2a66c8e` — **CI:** [GitHub Actions 38685607348](https://github.com/daurham/daurham-health/actions/runs/38685607348) **SUCCESS** (npm ci, TS, ESLint, full Vitest, production build).

- `src/features/nutrition/api.ts`: typed, same-origin, owner-authenticated client GET/PUT for revision/version-bound daily completeness; no Gemini usage.
- `src/features/nutrition/DayCompletenessCard.tsx`: optional compact inline Nutrition review card, low-friction sheet for **everything logged / some missing / unsure**; empty days require an explicit whole-day fasting acknowledgment to mark complete. Clear provisional-today, partial, unknown, fast, data-ineligible and **needs re-confirmation** states.
- `src/features/nutrition/NutritionPage.tsx`: card below Nutrition summary without changing existing Add Food/Quick Add interactions; source row edits cause a fresh GET. Abort stale requests and guard against in-flight save completing after the food log changes; saving state resets on canonical reload.
- Graceful **unavailable** messaging and retry rather than blocking or falsely marking a day complete if migration 0053 has not been deployed. A stale/conflicting save prompts an authoritative refresh; no automatic owner assertion.
- `tests/piq1-nutrition-completeness-ui.test.ts`: **7 synthetic presentational state checks**. **No real mobile tap-through or database-backed GET/PUT** was performed. User device and live API QA remain unverified.
- **No production merge, migration, deploy, owner-data access, AI billing, maintenance recommendation/goal or calorie target mutation.** This UI is **feature-branch-only**; the existing maintenance/Coach path does not consume confirmations.

### PIQ-1.1 outstanding acceptance gates

1. **Real SQL/transaction verification** on disposable Neon/Postgres; migration `0053` is committed but unapplied. Verify extension availability, digest behavior, exclusion joins, concurrent food updates and atomic 409, history/default unknown, and backup/restore.
2. Verify live production migration head and deployed commit using authorized read-only access; do not infer from GitHub source or build status.
3. Run owner mobile preview QA (day navigation, food edits while sheet open, fasting choices, 409/503, retry and undo) when isolated DB is available.
4. Only then wire verified complete-and-source-reliable days to real maintenance/Coach/Goal Control. Preserve all logs and T03 no-auto-calorie-cut invariant. Require adequate confirmed-calendar coverage; mark insufficient otherwise.
5. Continue PIQ-0 real model quality/cost/latency and owner acceptance gates independently.

**Phase truth: 0/9 completed. PIQ-0 remains open. PIQ-1.1 backend/domain/UI code is CI-validated on branch, not database-validated or end-to-end accepted.**

## PIQ-1.1 UI edit-freshness hardening — verified (2026-10-14)

**Validated code commit:** `041f6d885c69beb5d8d43713cb346390ec4c5bf2` · **CI:** [GitHub Actions 38689289994](https://github.com/daurham/daurham-health/actions/runs/38689289994) — **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest, production build).

- Followed the already-verified `9b1686a` optional Nutrition day-completeness card and `1b47aaf` versioned storage/API code; no overlapping source edits or main-branch merge.
- Corrected a subtle React render race in `src/features/nutrition/DayCompletenessCard.tsx`: a *previously fetched* day confirmation could remain displayed for one render when food entries changed, before the effect cleared and refetched it. Stored confirmation now includes the local food-list snapshot key it belongs to, and render gates status/review availability on an **exact key match**. Old confirmation is hidden immediately until a canonical server refresh.
- Strengthened the client-only food snapshot key to include macros, sodium/fiber, portion/grams, source quality, notes, meal identity, food identity and timestamps, rather than relying only on calories, quantity and timestamp. It is never sent or logged as the canonical digest. Server SHA-256 revision remains the authority for 409/revalidation.
- Three more deterministic tests cover a nutrient-only edit (with unchanged calories/timestamps), multiple other source edits, and order-independent comparisons. They test client invalidation logic, **not** a full browser touch session.
- Connected Neon project listing rechecked and still returns `[]`; **no accessible database** for isolated Postgres SQL execution or migration 0053 validation. This remains an explicit acceptance blocker, not a source of assumed schema truth.

**PIQ status: 0/9 phases accepted.** PIQ-0 live-state/owner-quality gates still open; PIQ-1.1's code-level persistence + UI checks are green but **migration 0053 is unapplied**, no real Postgres transactional/concurrent integration was run, maintenance and Coach do **not** consume owner day-confirmation yet. No production deployment, migration, health-record change, target change or paid model call.

**Next bounded work:** Obtain owner-authorized isolated Postgres/Neon branch access; validate SQL SHA-256 revisions, optimistic version conflict, food edit/exclusion races, auth, backup/restore; then connect verified read-time completeness to maintenance/Goal Control/Coach with the T03 single-meal regression. Do not silently treat unknown historical days as complete or ship calorie adjustment changes before these gates.

## PIQ-1.1 checkpoint — isolated PostgreSQL SQL and concurrency validation (2026-10-14 owner-local)

**Feature-branch implementation:** `2e0d2b3bed925b90b126c0fdf4de056949290876`  
**Real PostgreSQL integration:** [GitHub Actions 38690105448](https://github.com/daurham/daurham-health/actions/runs/38690105448) — **SUCCESS**, **6/6** real-database tests.  
**Full application validation:** [GitHub Actions 38690105524](https://github.com/daurham/daurham-health/actions/runs/38690105524) — **SUCCESS**, TypeScript, lint, Vitest, production build.

### Exactly what was verified

- Introduced an isolated, branch-scoped GitHub Actions workflow `.github/workflows/piq1-postgres.yml` with temporary **PostgreSQL 16**, fixture-only credentials and **no production DATABASE_URL/Neon connection**.
- Integration script `tests/piq1-nutrition-postgres.integration.test.ts` creates canonical nutrition tables using actual migration `0008`, selects the nutrition-evidence column and data-quality-review schema from migration `0046`, then **executes migration `0053`**. This is **representative schema replay**, **NOT complete migrations 0001–0053** or a Neon project migration.
- Executed real SHA-256 source revision reads (including deterministic empty day); stored owner confirmation and incremented version; corrected an entry then verified stale reported state and 409; excluded an entry then re-confirmed to show it cannot calibrate maintenance; required an explicit fast for genuinely empty days; verified one success and one 409 from two independent concurrent PostgreSQL connections; verified food deletion invalidates the confirmation.
- First real SQL run found a **genuine data-integrity defect**: a log containing only **analysis-excluded** entries looked like a zero-entry day and incorrectly required reporting a fast. This was corrected in `src/domain/nutrition/day-completeness.ts` and `server/nutrition/day-completeness.ts` by separating `recordedEntryCount` (all diary rows) from qualified `quality.entryCount` (analysis-included rows). Added a domain regression and updated mock storage tests. The fixed Postgres integration test and full app CI both passed.
- `recordedEntryCount` is informational; it never proves a day has all food logged. A complete report with excluded records remains **ineligible for maintenance**, without inventing a fast or deleting records.
- No schema migration has been applied to live Neon; no user health records read, no Vercel production promotion, no merge to `main`, no paid Gemini requests and no calorie-target changes by this work.

### Strict remaining gates

1. **Production Neon and Vercel identity still unverified:** connected Neon list_projects returned `[]`, previous Vercel scope blocked deployed-version inspection. Branch SQL correctness cannot identify the active app or applied production migration head.
2. The test covers relevant tables from migrations 0008/0046 plus 0053. **Full sequential migration replay, backup/restore and realistic Neon concurrency/latency remain unverified.** Source-write races after an individual SQL statement's MVCC snapshot are not prevented by a client confirmation hash alone; final read-time revision verification must remain fail-closed.
3. The optional Nutrition UI and owner-authenticated GET/PUT are **branch implementation**, not live owner mobile acceptance. Food edits must continue to invalidate confirmation, especially late imports and exclusion review changes.
4. **Existing Maintenance, Coach and Goal Control still use food source quality without actual stored day-completeness gating.** The unsafe 28-day single-meal estimator reproduction remains a known product defect in the deployed path; no auto calorie-cut is authorized.
5. The next bounded PIQ-1.1 work should add a **set-based, read-time, fail-closed calendar-day eligibility manifest** using stored owner confirmations + current source revisions, then connect it to Maintenance/Coach/Goal Control on the branch with T03 regression. Avoid one SQL round trip per day or pretending that the 0053 table already exists in production.

**Phase truth: 0/9 completed; PIQ-0 runtime/quality acceptance open; PIQ-1.1 code + representative real PostgreSQL SQL path validated, but not end-to-end production accepted.**

## PIQ-1.1 — verified read-time maintenance eligibility (2026-10-14 owner local)

**Validated implementation:** `ef4fbca5cc5c06fcb91e9ddb163230e9e0996e01` on `piq/00-baseline-20261014`.
**GitHub Actions:** [isolated PostgreSQL 38691337101](https://github.com/daurham/daurham-health/actions/runs/38691337101) **SUCCESS** and [full application CI 38691336913](https://github.com/daurham/daurham-health/actions/runs/38691336913) **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest, production build). The first full CI attempt used a mistaken test-only `observedDays` field; this was corrected to the actual `reliableDays` contract and both workflows passed.

### Code integration delivered

- `server/nutrition/maintenance-eligibility.ts`: **one set-based SQL read** of candidate confirmed nutrition days in the 30-day window. It recomputes each day's canonical SHA-256 source fingerprint from the same source-revision expression used by the confirmation API, and requires `owner_report = complete`, a matching stored revision, no fast, no analysis exclusion and only acceptable source evidence (measured reference or owner entered). Empty/missing confirmations cannot qualify.
- The eligibility loader **cross-checks each candidate's calories and exact sorted source entry IDs against the preloaded intelligence snapshot**. If that snapshot disagrees with the current DB rows, the day is rejected instead of silently counted. The query returns internal data only; it does not add owner records or medical values to routine logs.
- `server/intelligence/maintenance.ts` **always supplies** a verified-date Set to the actual Maintenance engine. An unavailable/missing table, query exception or other failed eligibility read falls back to an **empty Set**, never legacy source-quality-only estimates. Existing maintenance consumers in Goal Control and the related Coach intelligence path derive decisions from this gated result.
- `src/domain/maintenance.ts` filters calorie observations for eligibility **before building the window estimate, body-response comparison, observed-day counts and recommendations**. The optional Set argument preserves older direct unit-fixture behavior; it is **not optional in the production server loader**.
- The real-engine T03 regression proves 28 days of single accurately logged meals with no owner completion cannot produce an observed maintenance estimate or calorie-adjustment recommendation. A sufficient number of individually verified days can still support the existing estimator. Source quality alone no longer authorizes inclusion in the loader path.
- Added **three real PostgreSQL integration cases**, covering unconfirmed-to-confirmed status, calorie correction / previously loaded stale snapshot, individual analysis exclusions, AI-estimated source disqualification, current day, and zero-intake fast. They ran against ephemeral PostgreSQL 16 and representative source schema + migration 0053, not the actual production Neon project.

### Strict non-claims and remaining gates

- **0/9 PIQ phases fully accepted.** PIQ-0's deployed-version/real-owner question-quality gates remain open. PIQ-1.1's branch implementation is materially advanced but **not live**.
- No migration 0053 was applied to production; no merge to main, Vercel release, real owner record access, target calorie write or Gemini call. The new server query is **branch-only**.
- An isolated PostgreSQL schema fixture does **not** certify the full migration chain, backup restore, live Neon performance, or concurrency with every existing food writer. SQL's MVCC read and a cross-checked snapshot reduce risk but cannot provide an impossible guarantee against later writes.
- **Other nutrition-facing Coach/Weekly Coach and Health AI reasoning may still conflate logged totals with consumed totals.** Only the actual Maintenance-derived Goal Control/Coach path is newly gated. These downstream trust paths require separate PIQ checks.
- Owner mobile confirmation QA, true Vercel serving SHA, Neon applied schema head and production cost/latency remain unverified.

**Next bounded implementation:** audit direct weekly nutrition/Coach decisions for complete-day assumptions; propagate a conservative completeness coverage label where needed, not a guessed confirmation. Then run isolated full-migration and backup/restore checks before any promotion. Never automatically lower calorie targets from unknown/partial days.


## PIQ-1.1 Weekly Coach confirmed-day intake comparisons (branch code validated, 2026-10-14)

**Implementation:** 4bde2e70a7f7e03290d430e91fac79c096aab2b2.
**Full application CI:** https://github.com/daurham/daurham-health/actions/runs/38692728349 — SUCCESS (npm ci, TypeScript, lint, full Vitest, production build).
**Isolated PostgreSQL 16:** https://github.com/daurham/daurham-health/actions/runs/38692728356 — SUCCESS (representative migration replay and real SQL including new Weekly Coach correction scenario).

### Verified improvements

- Previously Weekly Coach compared calorie averages on *logged days* without knowing whether all food was recorded. Even 14 one-meal days could look like a real full-day intake trend.
- Weekly Coach now labels the average as **logged intake, not necessarily all intake**, and only compares weeks when BOTH periods have enough **owner-confirmed, source-reliable, current-revision complete days**. Comparison values are recomputed solely from those dates; no adjustment to calories is recommended from the comparison itself.
- The weekly loader reuses a single set-based verified-day SQL query and cross-checks exact sorted food IDs and calorie totals against the already loaded canonical Nutrition entries. Food edits, extra or missing entries, stale confirmations, missing schema, DB errors and missing owner-local today fail closed (no verified days; no intake comparison). This does not add AI calls or per-day database round trips.
- The weekly input schema accepts optional verified day dates; absent input means unverified, preserving demo/test usage without promoting older partial logs.
- Six synthetic tests in tests/piq1-weekly-completeness.test.ts cover unconfirmed one-meal weeks, one confirmed week only, two sufficiently confirmed weeks, insufficient confirmed days, mismatched calories/IDs and new or duplicate food entries.
- A real PostgreSQL regression in tests/piq1-nutrition-postgres.integration.test.ts verifies an unconfirmed day is excluded, confirmation admits the date, edits invalidate it, reconfirmation does not validate stale preloaded logs, and today remains excluded.
- Initial integration test failed due to a test-only split TypeScript assertion; repaired and the above two final workflows passed completely. No product source or SQL expectations were relaxed.

### Remaining strict boundaries

- An owner report does not independently prove actual total intake; the comparison is grounded in the reported and source-revision-verified logs, not measured energy consumption.
- Weekly Coach now has explicit incomplete-intake semantics; independent Health AI, proactive insights and other non-Maintenance nutrition claims need separate audits.
- **No main merge, live Vercel deployment, production Neon migration 0053, owner health data use, provider spend or calorie-target mutation by this work.** Branch-only.
- Only representative isolated PostgreSQL migrations were replayed. Full migration-chain/backup-restore and Neon production identity/performance remain unverified.
- **0/9 PIQ phases accepted.** PIQ-0 still open (production and real owner acceptance); PIQ-1.1 domain, owner-auth API/UI, Maintenance-derived Goal Control and Weekly Coach protection are code-validated on feature branch, not owner-live accepted.

**Next bounded task:** verify full migration compatibility and backup/restore on isolated PostgreSQL, then preview mobile owner-confirmation flow when runtime access is authorized; audit independent Health AI/insight food-inference claims. Do not promote to main before actual production schema and release gates are confirmed.

## PIQ-1.1 isolated FULL migration-chain and confirmation backup round trip — validated

**Implementation:** `de858ce5a71f9aec7ee20817992aca6ba86448b4`  
**Full application CI:** [38693650286](https://github.com/daurham/daurham-health/actions/runs/38693650286) — **SUCCESS**, npm ci, TypeScript, ESLint, full Vitest suite, production build.  
**Isolated PostgreSQL 16 CI:** [38693650304](https://github.com/daurham/daurham-health/actions/runs/38693650304) — **SUCCESS**, representative nutrition integration and **complete 0001–0053 migration replay**.

### What this independently validates

- Added `tests/piq1-full-migration-postgres.integration.test.ts`, enabled in `.github/workflows/piq1-postgres.yml`. It uses **only** `PIQ_POSTGRES_URL` on GitHub's disposable PostgreSQL 16 service, creates a separate schema, and executes all **53 migration files in numeric order** through the same `inspectMigrations()` / `splitSqlStatements()` path as the repository migrator. Each migration is committed atomically in its own SQL transaction, with a checked migration ledger.
- Migration `0053` succeeds after all earlier migrations, leaves zero historical owner-complete rows, and new days remain **unknown** absent explicit owner confirmation.
- Inserts a fictional logged meal, saves a revision-bound explicit complete-day report using the *real* PostgreSQL query, packages that confirmation in the application's **full-format backup archive**, verifies its checksums and restore plan, deletes that one row, executes the corresponding restore SQL and re-reads its eligible owner report.
- A subsequent calorie correction changes the source revision and makes the restored report **stale/unknown/ineligible**. A restored owner report cannot freeze the food log or override real edits.
- The older isolated SQL tests additionally cover conflicting writes, excludes, fasting, verified-date Maintenance and Weekly Coach eligibility. The full-suite run and isolated database run now both pass on the same commit.
- First CI attempt found a test-only unused constant in lint; removed and reran. No clinical decision logic changed in this checkpoint.

### Boundary of the claim

- This establishes **fresh full migration-chain compatibility** and a **targeted confirmation-row backup/restore**, not a restoration of every seeded and unseeded table or a recreation of an existing owner database. The full backup format was verified for the synthetic row, but the full multi-table database restore was *not* executed here.
- It does **not** verify production Neon schema history, migration state, performance, Vercel serving commit, owner authentication on an actual device, or hidden historical drift. **No production Neon branch or database was touched.**
- The post-0053 intake protection is still code- and disposable-Postgres-tested on a development branch; not released to production. No automatic calorie target updates or Gemini calls.

### Remaining release gates / next bounded scope

1. Verify owner-authorized production read-only migration head, deployed Vercel serving SHA, and real runtime health-data pathways; current Neon connector project list does not show the owner project.
2. Validate complete multi-table backup/restore and migration on a realistic **production-schema clone**, not production itself, to account for accumulated source history, default/nullable differences and owner-specific data.
3. Mobile owner QA of the Nutrition confirmation card, staleness after editing, full-day fasting, daily check-in UX, auth, and conflict/error handling on a deployed isolated preview with matching migration.
4. Audit additional Health AI and other non-Maintenance nutrition interpretations; never use unknown/partial food days to authorize a calorie reduction.
5. Continue PIQ-0 owner-reviewed real response-quality gates before declaring program phase acceptance.

**Phase truth: 0/9 accepted. PIQ-0 active and PIQ-1.1 implementation underway; other phases unchanged.** No production merge, live migration, owner-data mutation, provider cost, or calorie target change by this checkpoint.

## Release state / constraints

- Branch-only preparation: **no production deployments, database migrations, schema changes, AI API calls, or owner data writes performed by this PIQ work**.
- The Vercel connector's project discovery succeeding does not imply deployment inspection permission.
- A future phase may use read-only owner-authorized database/project access; never apply migrations merely to satisfy a baseline document.
- Latest implementation checks: isolated PostgreSQL full 53-migration replay and confirmation restore run `38693650304` SUCCESS; full branch validation run `38693650286` SUCCESS on `de858ce`. Documentation-only commits do not imply new code validation.

## Continuation packet — NEXT SESSION

**Task:** PIQ-1.1: full migration chain and targeted confirmation restore are now code/isolated-Postgres validated. Next prioritize an isolated owner preview/mobile confirmation flow, production-schema clone verification with full multi-table backup/restore, and remaining Health AI/insight nutrition inference audits. Maintenance/Goal Control and Weekly Coach already have branch-tested fail-closed intake gates; do not merge or apply migration 0053 until production schema and owner release gates are verified.

**First steps:** Read master §§0–6 + PIQ-0 + §§17–21; inspect this file; verify current main/feature branch, production status, CI and schema. Try authorized Vercel project scope and Neon lookup only if access exists. Reconcile `CURRENT_TASK.md` drift once the verified production state is available. Confirm the baseline contract is still aligned with owner's purpose.

**Definition of next small done:** synthetic fixture runner distinguishes no-data general question from a genuine absent personal measurement; explicit diagnostics differentiate early exit, retrieval failure, model failure; no extra Gemini calls on routine Today render; tests and mobile workflow validation documented.

**Blocking safety:** Do not claim the current product is improved until an actual health question, source-specific evidence and owner acceptance substantiate it.

## PIQ-1.1 — Health AI logged-vs-verified nutrition integrity (2026-10-15)

**State:** Branch-validated; **not deployed or owner-accepted**. PIQ-0 remains open, and none of PIQ-0–8 is fully owner-accepted.

**Why:** T03/T12/T45: nutrition entry quality and count alone do not establish complete days. The shared intelligence engine could previously report a high-confidence calorie baseline, fiber/bowel correlation, or intervention comparison from accurately entered but incomplete meals, even after Maintenance and Weekly Coach had been protected.

**Implementation:** `src/domain/intelligence/shared.ts`, `server/intelligence/snapshot.ts`, `server/nutrition/maintenance-eligibility.ts`, `src/domain/ask-health/packet.ts`, `tests/piq1-shared-nutrition-completeness.test.ts`.
- A single revision-checked, owner-confirmed/source-reliable candidate SQL read is matched against the original intelligence frame and reused over the selected range. The working server loader always supplies an explicit verified-date Set; query/migration failure fails closed with a count-only, sanitized warning.
- Raw canonical food observations and their source-quality labels remain available for *logged* value questions. Derived nutrition baselines, confidence, curated relationships and before/after intervention comparisons now require verified dates; other domains remain untouched.
- Health AI coverage identifies *logged* days separately from *confirmed/reliable* days. A verification outage is labeled *unavailable*, not incorrectly described as the owner having zero confirmations. Empty/historical unverified days are never automatically promoted.
- No AI calls, auto calorie-target modifications, health-record mutations, migration changes or production branch promotions. Existing migration `0053_nutrition_day_completeness.sql` still requires a gated release.

**Validation:** Branch code commit `643106718cb7bfb50d2cf76605433126ba3bd4f9`, [GitHub Actions 38697995939](https://github.com/daurham/daurham-health/actions/runs/38697995939) **SUCCESS**: npm ci, TypeScript, ESLint, full Vitest suite, production build. Seven new synthetic tests exercise T03 unconfirmed precise one-meal records, T12 fiber/bowel pairs, only-verified before/after comparisons, partial coverage, current-day provisional filtering, Ask Health evidence/correct outage wording, and source-ID/calorie crosschecks. Previous full 0001–0053 migration replay and backup confirmation round-trip remain green (run 38693650304); this checkpoint introduced no migration.

**Decisions:** Distinguish *logged raw nutrition* from *sufficiently verified for full-day inferences*, without discarding logs or pretending failed reads imply absence. Preserve direct synthetic-build backward compatibility; **server** is authoritative and fail-closed. Verification is one deterministic SQL query per loaded intelligence snapshot; no provider model call.

**Outstanding:** No production Neon project in the available connector (list returned []), serving Vercel deployment SHA not verified, no production 0053 migration applied, no actual owner preview/mobile acceptance, no full production-schema clone with all-table restore, and other Health AI overview aggregates still describe *logged* intake only. Real question/safety/outcome scoring remains PIQ-0/PIQ-3 work. Do not claim production is improved yet.

**Next bounded task:** Audit independent Ask Health nutrition trend/target evidence for ambiguous full-day interpretations and health-decision use; preserve exact logged values and avoid treating them as actual intake. Then, with authorized project access, validate production-schema clone and mobile Nutrition completeness preview before considering release. Keep PIQ-8 polish deferred.

**Continuation:** Repo `daurham/daurham-health`, branch `piq/00-baseline-20261014`, schema repo head `0053`, production applied head **unknown**, `main` unchanged. Recheck branch CI and source, read this entry plus master plan before further implementation. **0/9 phases accepted.**

## PIQ-1.1 — Ask Health nutrition summary / target integrity (2026-10-15)

**State:** **Validated on PIQ development branch; not deployed, not owner-accepted.** Depends on PIQ-1.1 canonical confirmation and shared intelligence gates. **0/9 full PIQ phases owner-accepted.**

**Why:** T03: independent `addNutrition()` previously put a numeric average calorie-vs-target difference from *all logged days*, even if precisely logged entries only captured one meal per day. A prose warning alone did not remove that attractive but potentially misleading number from Gemini evidence.

**Source of truth / contract:** `src/domain/ask-health/nutrition-integrity.ts` projects proof from the already loaded revision-checked `HealthIntelligenceSnapshot` into independent `ProgressOverview.nutrition`; matches date, source IDs, non-provisional time boundary, calorie sum and high-confidence source status, crosschecking any between-reads edits. Absent confirmation status is *unavailable*, not zero. No new DB query/paid provider call in the Ask Health loader: reuses prior shared intelligence verification. Input is `nutritionIntegrity?: AskNutritionIntegrity` (older synthetic callers fail closed).

**Behavior / UX:** `src/domain/ask-health/packet.ts` retains raw logged calorie and macro averages, explicitly marks them as recorded amounts rather than proven intake/adequacy, and reports logged-vs-confirmed day counts. A **multi-day target gap** (`nutrition.calories_vs_target`) is emitted only with **at least four source-matched owner-confirmed complete days with configured targets**; it is labeled descriptive rather than physiological deficit or automatic target-adjustment guidance. Otherwise the numeric gap is omitted and an explicit non-substantive `nutrition.calories_target_ineligible` evidence item and limitation explain why. Changed food source/amount or current day never silently qualifies. Bumps `ASK_HEALTH_PROMPT_VERSION` from v4 to v5 to invalidate older prompt cache and forbid model reconstruction of the withheld gap. Doesn't touch canonical logged totals, nutrition targets, or other Progress renderers.

**Evidence:** `tests/piq1-ask-nutrition-integrity.test.ts` adds eight synthetic regressions (unknown but accurately logged one-meal days; four verified days; partial confirmations; amount/source-ID edits; cross-loader mismatches; failed confirmation reads; provisional current day; prompt restriction). `tests/ask-health.test.ts` updates existing two-meal cross-domain expectation; `tests/i5-ask-health-context.test.ts` updates version assertion. The first run `38700370471` exposed that stale v4 assertion, not a behavioral failure (1666 passed, one failed). Fixed on code head `d03b1aaeae0b127dd4995c53f3e63a2c368affb0`. [Branch validation run 38700781100](https://github.com/daurham/daurham-health/actions/runs/38700781100) **SUCCESS**: npm ci, TypeScript, ESLint, full Vitest (1667 passed, 13 skipped), production build.

**Release / costs:** No production merge, migration, Neon owner-data update, Vercel deployment, health-provider/model call or target change performed. Reuses existing migration 0053; production applied schema/serving SHA, owner mobile acceptance and complete migration backup-restore on a production-schema clone remain **unknown/not done**.

**Risks / next:** This correction protects Ask Health's specific calorie gap and shared intelligence inference. It does not by itself qualify other nutrition analytics/goal recommendation surfaces, clinical language, or the complete program. Remaining PIQ-1.1 release gates: confirm serving app/schema with authorized access; do controlled production-schema clone/full backup-restore, then inspect owner mobile Nutrition completeness and ask actual T03 questions; if those pass, decide release. Meanwhile continue PIQ-1.2 source-quality/freshness hard gates on branch, starting with remaining independent inference paths. Do not claim prod success, migrate 0053, or merge before explicit release gate.

**Continuation:** Repo `daurham/daurham-health`; branch `piq/00-baseline-20261014`; code validated head `d03b1aa`; `main` unchanged; migration repo head 0053, applied production head unknown. Read this entry and master plan, then inspect CI/branch before the next bounded task.

## PIQ-1.2 — Goal Control recent-intake hard gate + Coach dependent alternatives (2026-10-15)

**State:** Branch-validated bounded task, **not deployed or owner-accepted**. PIQ-1.2 broader maintenance/plateau validation remains **in progress**, and **0/9 complete PIQ phases accepted**.

**Depends:** PIQ-1.1 canonical nutrition owner confirmation, migration `0053` (branch only), shared intelligence read-time source/revision verification.

**Why:** T03 and original 150-kcal-cut complaint. `src/domain/goal-control.ts:nutritionQuality()` counted days with reliable food *entries* as reliable intake days, even when the shared intelligence snapshot explicitly marked their whole-day completeness as unverified. This could produce `state: met` despite incomplete recent nutrition, while Maintenance had stricter source-complete gates. The Coach draft path could re-offer a prior intake action or show an orphan "Or change activity instead…" alternative after parent suppression.

**Implementation:**
- `src/domain/goal-control.ts`: `reliableDays` now counts only `dayCompleteness === 'verified_complete'` plus `quality === 'high_confidence'` and known provenance. Logged days still count as **logged** and are never silently zeroed or thrown away. If the verifier is unavailable, detail says verification is unavailable and **does not** assert the owner confirmed zero days. Intake adjustment in `maintenanceOpportunity()` is hard-gated on the last-seven-completed-days nutrition floor, even if a 28-day empirical estimate exists.
- `src/domain/coach-intelligence.ts`: defense-in-depth prevents stale `review_intake_adjustment` opportunities from becoming Coach draft action cards when recent-day nutrition floor fails. An `review_activity_adjustment` alternate requires its actual intake-review parent and current adequate evidence. Pure `keepVisibleCoachDependencies()` removes the activity alternate *after* owner memory filters suppress/dismiss its parent.
- `server/intelligence/coach-intelligence.ts`: applies dependency pruning after suppression, before writing/surfacing recommendations. Does not change recommendation responses, acceptance state, or training plan/targets.
- `tests/i6-goal-control.test.ts` updated legacy source-quality fixtures to provide explicit verified dates. `tests/piq1-goal-control-completeness.test.ts` adds **eight** synthetic tests: high-quality but incomplete one-meal logs; 21 verified old + 7 unverified current days with otherwise plausible plateau; fully verified viable recommendation; only three current-week verified days and provisional today; estimate-heavy entry disqualification; verifier outage wording; stale direct Coach calorie action; and alternate suppressed by owner memory.

**Validation evidence:** Code head `3e53e96cbd3b859b807ccbbbd4526d7f3f4acd87`, [GitHub Actions run 38701791481](https://github.com/daurham/daurham-health/actions/runs/38701791481) **SUCCESS**: npm ci, `npx tsc -b`, `npx eslint .`, `npm test -- --maxWorkers=2` (**1675 passed, 13 skipped**), `npm run build`. Earlier development-branch CI attempts were auto-cancelled by later pushes under branch concurrency, not treated as successful tests.

**Contract / cost / release:** No new provider requests; no production data access or mutations; no calorie target changes; no schema migration change; `main` remains `dbc3fcb68324d75d30a96132b725456ec7e45d49`. Existing `0053` is not known applied in production; owner QA still pending. Deterministic tests use synthetic records, not owner health history.

**Outstanding / next:** PIQ-1.2 still needs aligned-window maintenance intake/weight calculations, low-target/recovery/active-experiment safeguards, incomplete sodium/carb context for scale noise, confidence-specific explanations, and owner-realistic screening. A related but separate PIQ-1.5 lifecycle issue remains: viewing a Coach recommendation currently uses the `do_this` response and may schedule inappropriate follow-ups; do not mark the overall recommendation-state task complete from this alternate-suppression fix. Verify production schema/serving SHA, preview/mobile flow, and owner acceptance before any migration or production promotion.

**Continuation:** Repo `daurham/daurham-health`, branch `piq/00-baseline-20261014`, code head `3e53e96`; record this as *validated on branch only*. Next bounded task recommended: `PIQ-1.2` safeguard inferred sodium/carb scale-noise signals from incomplete nutrition logs, including T03 and T19 synthetic evidence. Preserve raw logged food facts and do not assume complete intake.

## PIQ-1.2 — Sodium and carbohydrate short-window scale-context integrity (2026-10-15)

**State:** Branch-validated, **not deployed or owner-accepted**. PIQ-1.2 overall still open. **0/9 full PIQ phases accepted.**

**Why / scenarios:** T03 partial precisely logged meals and T19 contradictory/confounded scale changes. `src/domain/maintenance.ts:noiseFactors()` used to compare logged sodium and carbohydrate values as "recent intake increased" without verifying that dates were whole-day complete, source-reliable, or sufficiently sampled. Full-day confirmations are independent of whether recorded entries contain a known nutrient value; a lone high-sodium meal can yield a false apparent trend.

**Implementation:** `src/domain/maintenance.ts` adds `verifiedNutritionSignal()` to gate only sodium/carbohydrate scale-noise comparisons. Require the explicitly provided, revision/source-checked `eligibleNutritionDates` whitelist from existing `loadVerifiedNutritionDays()`, positive high-confidence calorie total, finite/nonnegative high-confidence nutrient total, known provenance, **same nonempty unique food entry IDs** across calorie and nutrient aggregates, and **at least two eligible dates in the recent three completed days plus four eligible dates in the preceding seven**. Undefined/empty whitelist fails closed even for direct builder callers. Date range respects already established provisional-today exclusion. Label changes as **logged** nutrient amounts on **owner-confirmed** complete days rather than proving physiological intake/cause. Do not conflate nutrition data filtering with hydration, bowel, or Daily Context observations; those remain available as separate non-causal context.

**Tests:** `tests/piq1-maintenance-scale-noise-completeness.test.ts` adds ten synthetic scenarios: no owner confirmations despite precise meals, missing verifier whitelist, matched/confirmed comparison, incomplete recent spike, no confirmed baseline, one recent or three baseline observations, missing/estimate-heavy nutrient sources, mismatched/duplicate source IDs, provisional today, and independent hydration preservation. Existing `tests/i7-maintenance.test.ts` scale-context fixture now supplies actual verified dates and matching synthetic source IDs; relevant old scale-noise expectations remain valid only for confirmed records.

**Validation evidence:** Code head `246c508caeed280beab08bddd01adc5bd818395e`, [GitHub Actions 38702721048](https://github.com/daurham/daurham-health/actions/runs/38702721048) **SUCCESS**: npm ci, TypeScript, ESLint, Vitest **1,685 passed, 13 skipped**, and production build. No live owner or model-quality question testing in this slice.

**Cost / schema / release:** No Gemini calls, new DB query, migration, environment variables, production deploy, owner-record writes, or target edits. Uses existing branch-side 0053/verified-day contract; production applied schema remains unverified; `main` remains `dbc3fcb68324d75d30a96132b725456ec7e45d49`.

**Open risks / next:** Owner-reported completeness is not proof of physiologically total intake; even selected confirmed days can be unrepresentative. Sodium and carbs can coincide with fluid shifts, not prove them. Other PIQ-1.2 tasks still open: align intake and weight samples over representative windows; distinguish maintenance/plateau confidence; constrain intake changes given current calorie targets, recovery/hunger/performance/active experiments and conflicting goals. Recommended **next bounded task**: audit window alignment and severe sampling bias in `buildEstimate()` with synthetic clustered-completeness vs weight observations; fail closed rather than manufacture a maintenance estimate. Also retain migration 0053 production-schema-clone, owner mobile/day-confirmation and actual T03 question QA gates.

**Continuation:** Repo `daurham/daurham-health`; PIQ branch `piq/00-baseline-20261014`; code validated at `246c508c`; `main` unchanged; branch migration head 0053; production applied head unknown. Progress for the overall program remains **0/9 phases owner-accepted**.

## PIQ-1.2 — Aligned intake/weight maintenance sampling (2026-10-15)

**State:** Code fully branch-validated, **not deployed, not owner-accepted**. The PIQ-1.2 broader calorie-change/recovery safeguards remain open. **0/9 PIQ phases fully accepted.**

**Problem / scenarios:** T03/T19 plus clustered sampling. Maintenance previously accepted 19/28 verified food days and five weigh-ins spanning 12 days, even when food logs covered the first 19 dates only and weights included later weeks. The robust calorie mean and Theil–Sen weight slope could thus describe different intervals, manufacturing an apparent maintenance or plateau inference.

**Change:** `src/domain/maintenance.ts` now enforces temporal alignment in `windowEvidence()`/ `usableWindow()` for 28, 21, and 14 trailing completed-day candidates:
- Retain original aggregate evidence floors (at least 65% and 10 verified reliable calorie days, plus 5 comparable weigh-ins spanning at least 12 days); require **at least three verified calorie days in *each* seven-day block** of the candidate.
- Require the first and last qualifying calorie dates to be **within four days of the respective first/last used weigh-in**; require **at least two used weigh-ins in each half** of the candidate.
- If a candidate fails, try the next shorter **trailing** window; never assume that a 28-day gap invalidates a fully populated and aligned 14-day window. If all fail and aggregate counts were otherwise enough, return explicit insufficiency explaining uneven logging, endpoint misalignment, or clustered weights instead of an energy estimate.
- High confidence requires stronger representativeness: >=4 verified intake days in each seven-day block and first/last aligned within one day. Otherwise qualified evidence can still get moderate confidence. Old, valid complete daily samples retain their prior high-confidence estimate. This is a conservative screening rule, not proof that owner-confirmed intake is unbiased.
- Preserve the raw logged observations and original owner confirmations. No inferred missing-day intake, targets changed, health records mutated, or Gemini calls.

**Tests:** `tests/piq1-maintenance-aligned-windows.test.ts` adds **nine synthetic cases**: genuinely aligned 28 days, only the first 19 days verified, an entirely missing middle week with valid shorter fallback, stale/early-only weight dates, heavily clustered weights with a distant last anchor, aligned 21-day fallback, uneven recent three-day confirmations with moderate confidence, excluded provisional current day, and source-accurate but unverified last-week food entries. `tests/piq1-goal-control-completeness.test.ts` keeps the earlier Coach defensive gate test with 21+3 temporally aligned verified dates; a stale calorie recommendation remains suppressed despite an otherwise plausible longer plateau.

**CI:** The first run failed TypeScript solely because `Array.at()` was unsupported by the repository's current target (not a math failure); corrected to compatible indexing. Code head `91e27d916a6f366038d9c671fc7ed19f6198b3b7`; [GitHub Actions 38703714646](https://github.com/daurham/daurham-health/actions/runs/38703714646) **SUCCESS**: npm ci, `npx tsc -b`, `npx eslint .`, full Vitest suite **1694 passed / 13 skipped**, and `npm run build`.

**Release gates / outstanding:** Production serving SHA unknown; applied migration `0053` unknown and not applied through this PIQ work; Neon project access not established. No owner mobile/preview quality acceptance; no verified production-schema clone and full backup/restore. Sampling uniformity is only a proxy for representativeness, and explicit confirmation is not objective proof that every meal was captured. Nutrition/body quality labels and Coach UI may need improved alignment-specific explanations. **PIQ-1.2 remains open:** verify proposed calorie cuts against existing calorie target, plausible energy needs, recovery/performance, hunger, concurrent experiments, goal conflicts; show distinct plateau/estimate confidence. Next bounded task should be that **nonautomatic calorie-adjustment safety gate**, with owner-realistic synthetic tests. Never auto-change targets.

**Continuation:** Repo `daurham/daurham-health`, branch `piq/00-baseline-20261014`, validated code SHA `91e27d9`; schema repo head `0053`; `main` `dbc3fcb68324d75d30a96132b725456ec7e45d49` unchanged. **0/9 whole phases accepted**.

## PIQ-1.2 — Conservative calorie-adjustment decision-safety gate (2026-10-15)

**State:** Branch-validated bounded subtask; **not production-deployed or owner-accepted**. PIQ-1.2 broad physiologic and decision-quality review remains open. **0/9 PIQ phases fully accepted.**

**Problem:** `src/domain/maintenance.ts:interventionsFor()` offered a specific 100–250 kcal/day change from `plateau_likely` and an empirical maintenance estimate without consulting the actual configured calorie target, owner hunger/recovery context, or whether an experiment is already underway. Count/quality and aligned-window safety gates from prior PIQ slices were necessary but not sufficient.

**Implementation:**
- `src/domain/maintenance.ts` adds typed `MaintenanceAdjustmentContext` and `CalorieAdjustmentSafety` surfaced on `MaintenanceState.calorieAdjustmentSafety`. The descriptive empirical estimate and plateau classification are **retained**, but `review_intake_adjustment` and dependent `review_activity_adjustment` are emitted only when the safety gate permits a *review*. Otherwise produce a non-numeric, non-automated `review_goal_plan` action explaining the specific blockers.
- For downward suggestions, require a **read-time current calorie target**, known **active/imminent experiment status**, at least 3 days of recent recorded hunger/energy/soreness ratings, absence of repeated high hunger (>=4/5), low energy (<=2/5), or high soreness (>=4/5), and no recorded recent illness, pain, or poor sleep opportunity. Proposed target must stay above a **conservative screening threshold of max(1500 kcal, 80% of the empirical observed-maintenance estimate)**. This heuristic is not a clinical energy minimum, BMR estimate, or certification that the target is safe for an individual.
- `server/intelligence/maintenance.ts` loads target + active/imminent experiments via **one read-only SQL statement** alongside existing data reads, with fail-closed status if the lookup fails or yields unusable values. Scheduled experiments within the next 14 days or active experiments block modifying conditions mid-protocol. Unknown does **not** mean zero active experiments. No new paid-model call or database mutation.
- Existing `tests/i7-maintenance.test.ts` and `tests/piq1-goal-control-completeness.test.ts` success-path fixtures now explicitly provide a current target and recent wellness evidence. `tests/piq1-maintenance-adjustment-safety.test.ts` adds **10 synthetic tests** for eligible review, low target, missing target, failed context verification, active experiment, absent wellness, repeated hunger/energy/soreness concerns, illness/pain/sleep disruptions, maintenance goal, and Coach not resurfacing blocked cuts. Historic `tests/piq1-maintenance-eligibility-baseline.test.ts` expectation is corrected: precise one-meal logs may still illustrate a *legacy raw estimator hazard*, but cannot authorize a cut with unknown target/recovery. Existing derived-only route test source comment adjusted without changing rule.

**CI evidence:** First validation run `38704543303` flagged two now-fixed *existing-test assertions* (source-text "update" in a comment and old desired unsafe behavior), with all new synthetic safety tests passing. Final code SHA **`5976b19991de59a69d6cac28bf6a9693b8909c46`**:
- [Branch validation 38704843521](https://github.com/daurham/daurham-health/actions/runs/38704843521) **SUCCESS**: `npm ci`, `npx tsc -b`, `npx eslint .`, full Vitest (**1704 passed, 13 skipped**), `npm run build`.
- [Isolated PostgreSQL 38704843585](https://github.com/daurham/daurham-health/actions/runs/38704843585) **SUCCESS**: fresh isolated test PostgreSQL, PIQ-1.1 nutrition confirmation and all-migration replay integration. Not a production data/schema clone.

**Release and safety boundaries:** `main` remains `dbc3fcb68324d75d30a96132b725456ec7e45d49`. No production deployment, schema migration, stored food/goal edits, owner-data change, Gemini spend, or automated target adjustment. Existing migration `0053` not known applied to serving production. The screen is intentionally conservative and may withhold suggestions that the owner would later decide are appropriate; it's a conditional advice gate, not a treatment protocol.

**Remaining PIQ-1.2:** Tie verified training progression/performance decline and actual owner goals into decision gating, detect target changes/stale snapshot races, consider individualized physiological profile before offering numerical reductions, validate thresholds and suggestion quality on real owner-supported cases, distinguish maintenance-estimate confidence from plateau-specific confidence, and review selective confirmation bias. The heuristic 1500/80% must not be marketed as universally safe or individualized medical advice. Production-schema clone/backup/restore, owner mobile Nutrition confirmation preview, and real T03 question evaluations still gate PIQ-1.1 release.

**Next bounded task:** PIQ-1.2 performance/goals and competing-plan suppression for calorie recommendations using owner-relevant synthetic training/recovery scenarios, before considering PIQ-1.2 acceptance or PIQ-1.3. Keep all unaccepted work on `piq/00-baseline-20261014`.

**Continuation:** Repo `daurham/daurham-health`, branch `piq/00-baseline-20261014`, validated code `5976b199`, `main` unchanged, schema repo head 0053, production applied head unknown. **Overall: 0/9 full phases accepted.**

## PIQ-1.2 — Strength-performance and urgent-goal conflict gate (2026-10-15)

**State:** Fully branch-validated bounded implementation; **not deployed, not owner-accepted**. PIQ-1.2 and PIQ-1.1 release QA remain open. **0/9 whole PIQ phases accepted.**

**Why:** Previous PIQ-1.2 safety checks covered complete intake, aligned weight evidence, configured calorie target, hunger/recovery self-reports, illness and active experiments, but did not consult reliable **recorded strength performance** or **competing owner goals**. A plateau could still lead to a 100–250 kcal/day downward-review suggestion when exact-exercise strength was declining, or an active performance goal was overdue/urgently off track.

**Implementation / invariants:**
- `src/domain/training-progression.ts` now reports `latestDate` of the last comparable exercise exposure as part of each canonical exercise trend. Existing >=4 comparable exposure and RIR/RPE limitation classification remain unchanged.
- Pure `src/domain/maintenance-performance.ts` projects `MaintenancePerformanceSafety` from canonical `TrainingProgressionState` plus actually active goal views (no extra estimator, paid model, or guessed exercise equivalence). Blocks descending-calorie review on **fresh completed-day** exact exercise e1RM/reps decline or confounded lower performance, with >=4 exposures and moderate/high evidence, latest exposure within prior 14 days; does **not** infer a new problem from stale trends or provisional today. Blocks separately on urgent, unsatisfied active strength/training performance goals (`due_today`, `passed_unmet`, `projected_after_deadline`, `projected_overlaps_deadline`); on-track, satisfied, paused, and unrelated goals do not create categorical conflicts.
- `src/domain/maintenance.ts` calorie-adjustment safety *fails closed* if training/goal verification is unavailable or stale, adds concrete declining-exercise / conflicting-goal review reasons, retains empirical maintenance and plateau findings and offers nonnumeric `review_goal_plan` rather than calorie and dependent activity adjustments. No caloric targets are changed.
- `server/intelligence/maintenance.ts` resolves current owner goal list and canonical training progression read-only alongside existing reads and injects their deterministic safety projection; read failures yield unknown/blocked, not assumed normal training. `server/intelligence/goal-control.ts` shares one in-flight training-progress snapshot Promise with Maintenance and Coach, avoiding duplicate SQL reads from the main Coach path. No schema or endpoint changes.
- Existing successful numerical-review fixtures are made explicit about confirmed performance checks (instead of silently allowing absent performance data). New `tests/piq1-maintenance-performance-goals.test.ts` adds **11** synthetic tests: recent strength decline, stale trend, confounded increased-effort decline, improved/stable evidence, urgent unmet strength goal, on-track/met/paused/nonperformance goals, missing/stale goal/training evidence, insufficient exercise exposures, Coach review only, permitted review when progressing, and provisional today.

**CI:** Validated code head `ff8b3671eaf208d953763dc3ffcf466f4f5cab38` on [GitHub Actions 38705931908](https://github.com/daurham/daurham-health/actions/runs/38705931908), **SUCCESS**: npm ci, TypeScript, ESLint, **1715 tests passed / 13 skipped**, production build. No actual owner-data/clinical result is claimed.

**Non-claims / release boundary:** This is a cautious **review-screening** rule, not a diagnosis of underfueling or personalized medical energy guidance. No new Gemini spend, goal/food/weight edits, production DB queries, deployment, or migration. `main` remains `dbc3fcb68324d75d30a96132b725456ec7e45d49`; production schema head and applied `0053` still unverified; dedicated PIQ-1.1 test-PostgreSQL checks passed previously but do not replace production-schema clone and owner mobile QA.

**Remaining work:** PIQ-1.2 still needs reliable current target/version snapshot reconciliation, physiological personalization/appropriate lower-intake decisions, potential multiple-day performance freshness sensitivity, confidence separation, owner-realistic real-world case evaluation, and systematic recommendation-state/goal-control crosschecking. PIQ-1.3..1.6 trust and lifecycle stages remain. **Next bounded task suggested:** audit and gate *stale calorie targets or goal-version changes across concurrent reads* before a numerical adjustment review, with synthetic race tests; alternatively begin PIQ-1.3 once this risk is deliberately deferred. Do not merge, migrate or promise release before owner approval.

**Continuation:** Repo `daurham/daurham-health`; work branch `piq/00-baseline-20261014`; code validated `ff8b3671`; production / `main` unchanged; no PIQ phase fully accepted (**0/9**).

## PIQ-1.2 — Optimistic target/goal version consistency across concurrent reads (2026-10-15)

**State:** Fully branch-validated bounded task; **not deployed or owner-accepted**. PIQ-1.2 broader confidence/personalization work and PIQ-1.1 QA remain open. **0/9 whole PIQ phases accepted.**

**Problem / TOCTOU:** Coach uses weekly goal snapshots, canonical nutrition and weight records, independent Maintenance target and goal reads, and then persists recommendation cards. A calorie target, active goal version/status or imminent experiment can change while those reads are underway, or after Goal Control has drafted a numerical calorie review. An individually valid query does not prove all settings came from the same decision revision.

**Implementation:**
- `server/intelligence/maintenance-revision.ts`: read-only, single-statement PostgreSQL snapshot of effective calorie target **ID, value, effective date and updated_at**, ordered **active goal IDs/status/version IDs and relevant target definitions**, and **active / within-14-days scheduled experiment IDs, statuses, protocol versions and windows**. Produces a compact deterministic revision hash for change detection (not authentication) and exposes `readMaintenanceDecisionSnapshot()` and a fail-closed `isMaintenanceDecisionRevisionCurrent()` check.
- `src/domain/maintenance-revision.ts`: pure tri-state comparison `consistent | changed | unavailable`. A failed query, missing fingerprint, nonsensical target/count or changed fingerprint can never be interpreted as unchanged.
- `server/intelligence/maintenance.ts`: bracket the independent context, goals, training and verified-nutrition reads: capture the revision **before**, fetch data, then recheck **after**. Only consistent read-time settings flow into `BuildMaintenanceInput`; otherwise maintain the descriptive estimate but disallow numerical calorie and activity-alternative interventions.
- `src/domain/maintenance.ts`: `CalorieAdjustmentSafety` explicitly blocks when `revisionStatus !== 'consistent'` or the decision revision is absent. `MaintenanceState.decisionRevision` exists only for a consistent capture. No changes to calculated maintenance or logged food/weight records.
- `src/domain/coach-intelligence.ts` and `server/intelligence/coach-intelligence.ts`: shortly before surfacing/persisting a `review_intake_adjustment` and its alternative, validate the same revision again; a changed/missing revision strips both **without suppressing unrelated training/coach recommendations**. This is an optimistic read barrier, **not atomic with persistence** and not a substitute for a repeat verification when an owner finally chooses to edit a goal. No automatic calorie goal mutation.
- Eligible historical tests updated to supply explicit synthetic consistent revisions. `tests/piq1-maintenance-decision-revision.test.ts` adds **eight** deterministic test cases for one-statement source contract, numeric target/revision parsing, target/goal/experiment changed fingerprints, stable and unavailable reads, invalid results, descriptive plateau with race, missing revision, and just-in-time Coach filtering. `tests/piq1-full-migration-postgres.integration.test.ts` also checks **real PostgreSQL** revision query after all 53 isolated schema migrations: insert a synthetic target, edit it, detect distinct revisions, and verify transaction rollback restores the original fingerprint. No production rows accessed.

**Validation:** Code SHA `32b745a9cb86f86da928199ceb3f97bad99d5587`. [Branch validation 38707092651](https://github.com/daurham/daurham-health/actions/runs/38707092651) **SUCCESS**: npm ci, TypeScript, ESLint, **1723 tests passed / 14 skipped**, production build. [Isolated PostgreSQL 38707092687](https://github.com/daurham/daurham-health/actions/runs/38707092687) **SUCCESS**, including actual revision SQL on the disposable migration-chain schema. New fingerprint comparison tests are synthetic, while inserted/edited target integration is real PostgreSQL.

**Limitations / risk honesty:** Reads and recommendation persistence are not in one atomic serializable transaction, leaving a narrow last-check-to-persist race; cached previously surfaced cards and follow-up state are a separate PIQ-1.5 lifecycle concern. Changed goals during the *earlier weekly input load*, before the first maintenance fingerprint, may still affect nonnumeric coaching summaries. Hash is for optimistic coherence, not authorization/security. Goal-version and experiment variation within the SQL statement are source-covered and synthetically modeled; only target mutation was exercised against the disposable PostgreSQL test database in this slice. Do not claim complete concurrency proof or verified live owner behavior.

**No owner/prod changes:** `main` remains `dbc3fcb68324d75d30a96132b725456ec7e45d49`. No migrations added or applied to production, no new Gemini calls, no live app deployment, no target/weight/goal writes, no credentials requested. The existing unshipped 0053 day-completeness migration, production-schema-clone and owner/mobile T03 question QA remain release gates.

**Next bounded direction:** Finish PIQ-1.2 owner-realistic calibration of cut screening and visible confidence, plus race-aware recommendation lifecycle (withdraw stale stored cards and verify again at owner action), and then PIQ-1.3 source-quality/freshness. Do not prematurely mark PIQ-1.2/PIQ-1.1 owner accepted without those release validations.

**Continuation:** Repo `daurham/daurham-health`, branch `piq/00-baseline-20261014`, validated code `32b745a9`; `main` unchanged; schema repo latest 0053; production applied head unknown; **0/9 entire PIQ phases owner-accepted**.

## PIQ-1.2 — Stored Coach calorie recommendation and follow-up lifecycle safety (2026-10-15)

**State:** Branch-validated bounded task; **not deployed or owner-accepted**. Wider PIQ-1.2 evidence-confidence and individualized cut screening remain open. **0/9 PIQ phases fully accepted.**

**Problem / regression risk:** The preceding settings revision guard verified only newly drafted/surfaced calorie advice. `coach_recommendations` persisted an already accepted `do_this` card and later queried due follow-ups directly from the saved table, while the /respond endpoint accepted a historical row ID without rerunning the current nutrition/recovery/goal decision. Thus old calorie suggestions could outlive changed targets, goal versions, source evidence or new performance concerns.

**Implementation:**
- `src/domain/coach-intelligence.ts` adds explicit `isCalorieDecisionKind()`, `storedCoachRecommendationIsCurrent()`, and `keepCurrentCoachFollowUps()` pure policies. Only the two actionable kinds `review_intake_adjustment` and its `review_activity_adjustment` alternative are revision-sensitive. Current eligibility requires (a) an original valid 32-hex settings revision stored on the row, (b) exact match to current maintenance revision, and (c) the same fingerprint remaining present in freshly built quality/safety-filtered Coach drafts. Rows from earlier builds missing revision metadata fail closed. Unrelated training/other Coach follow-ups remain eligible.
- `server/intelligence/coach-intelligence.ts:surfaceDraft()` now persists `metadata.decisionRevision` with newly qualified calorie/alternative cards (no migration; existing JSONB metadata). Owner response memory and historical outcomes are **not deleted or rewritten** when a card becomes stale.
- `dueFollowUps()` fetches up to 24 due rows rather than the visible 3; on GET, a fresh settings-revision check and fresh draft eligibility filter any accepted stale numerical cards *before* selecting three visible follow-ups. A row accepted when conditions were favorable cannot become a live calorie follow-up merely because its old `do_this` response still exists.
- `respondCoachRecommendation()` now re-evaluates goal control and current Coach evidence for calorie-sensitive IDs and verifies the original revision against current settings immediately before allowing a response. Stale/legacy/no-longer-qualified calorie IDs return HTTP 409 and ask the owner to reopen Coach. Non-calorie responses are unchanged. Recording a historical outcome for an already accepted action remains permitted for audit; such a stale action is not presented as a current due follow-up. An invalid settings revision at final surface also avoids falling back to a stale numerical coaching summary when no other action remains.
- `tests/piq1-coach-stale-lifecycle.test.ts` adds **11 synthetic regression tests**: qualifying saved revision/evidence; changed-target revision; superseded goal/recovery evidence; legacy rows without revision; failed current check; orphan activity alternative; unrelated training follow-up; pre-display-limit filtering; no deletion of response memory; precise kind selection; owner response suppression independent of fresh safety. No new real owner/health data, provider calls or migrations.

**Validation:** Code head `f285d06f79fb185112e946b2d56b831e68d6f9d3`; [GitHub Actions 38755852474](https://github.com/daurham/daurham-health/actions/runs/38755852474) **SUCCESS**: npm ci, TypeScript, ESLint, Vitest **1734 passed / 14 skipped** across **226 passed / 2 skipped files**, production build. Previous disposable PostgreSQL decision revision test [38707092687](https://github.com/daurham/daurham-health/actions/runs/38707092687) passed, but this new stored-card lifecycle policy was not separately exercised end-to-end with a real current-owner database.

**Risk boundaries / next:** Optimistic pre-action revisions remain non-atomic with the subsequent response/persistence SQL. History is deliberately retained; outcome tracking may refer to work accepted under old conditions, not fresh permission. Fetching only 24 due rows could still starve a later valid follow-up if more than 24 old due rows precede it; track pagination/query qualification for PIQ lifecycle completion. Numeric card fingerprints are stable per intervention, so changed settings should require reconfirmation and not silently revive previously suppressed owner response states. A genuine end-to-end stale-ID API/database test and owner UI status review are still needed. Recommendation explanation quality/confidence should distinguish source completeness, weight trend, safety checks and unresolved issues.

**Release:** No changes to `main` (`dbc3fcb68324d75d30a96132b725456ec7e45d49`), no production writes, no new migration, no Gemini expenditure, and no deployment. Production applied schema 0053 unknown. Keep roadmap **0/9 fully accepted** until owner acceptance/release checks.

**Next bounded task:** Improve *user-facing* evidence/confidence explanations for maintenance, plateau, and calorie-review gating, and/or qualify saved recommendation lifecycle through isolated database/API tests before PIQ-1.2 acceptance. Preserve distinct uncertainty and avoid presenting heuristic calorie floors as clinical approval.

**Continuation:** Repo `daurham/daurham-health`; branch `piq/00-baseline-20261014`; validated code `f285d06`; `main` unchanged. Owner QA, production-schema-clone, day-completeness migration 0053 production status all unresolved. **0/9 full PIQ phases accepted**.

## PIQ-1.2 — Separate Nutrition, weight, plateau and decision confidence explanations in Coach (2026-10-15)

**Status:** Bounded implementation fully **branch-validated**, but **not deployed or owner-accepted**. PIQ-1.2 still needs physiological-personalization/owner-realistic review; **0/9 complete PIQ phases accepted**.

**Problem:** Before this slice, `MaintenanceEstimate.confidence` summarized combined sampling, while `GoalControlState.confidence` broadly summarized cross-domain coverage. Maintenance had objective sample counts and a separate calorie safety gate, but Coach recommendation cards showed a narrative and action without making their distinct evidence/decision strengths visible. This could mislead an owner into treating a plausible observed-maintenance estimate as confidence in the cause of a plateau or authorization for another calorie reduction.

**Implementation:**
- `src/domain/maintenance.ts`: new `MaintenanceEvidenceExplanation` with four independent labeled/statused fields, returned on every `MaintenanceState`:
  1. `nutrition`: eligible completed-day calorie observations **N of days**, high-source-quality, estimated/unknown counts, and owner-confirmed full-day report caveat. If no verified-day whitelist is provided, never describe source-only evidence as verified `well_sampled`.
  2. `weightTrend`: comparable weigh-ins, span, measurement-condition quality, and remaining scale/noise limitations.
  3. `plateau`: empirical window dates, percent-per-week robust weight trend, classifier result, possible confounders and explicit no-causality note. `likely` is a deterministic classification, not a calculated medical probability.
  4. `calorieDecision`: `review_only`, `withheld`, or `not_applicable`, with concrete blocked reasons and no clinical clearance; a passing 1500/80% heuristic threshold is not personalized medical safety evidence. No targets are updated.
- `src/domain/coach-intelligence.ts` and `server/intelligence/coach-intelligence.ts`: carry the breakdown on **only Maintenance-derived** fresh recommendation drafts/views; unrelated training and broad Coach evidence retain their existing semantics. The broad `confidence` field remains intact and is not mislabeled as clinical safety.
- `src/features/coach/CoachCard.tsx`: a compact collapsed `<details>` element named **How this was assessed**, with four explicitly separate disclosure entries (Food-log evidence, Weight-trend evidence, Plateau assessment, Calorie-change decision). Other cards remain compact; no new navigation/UX burden.
- `tests/piq1-maintenance-confidence-explanations.test.ts` adds **eight synthetic regressions**: fully verified 28-day data, a plausible high-confidence estimate with unsafe existing target, repeated low energy despite good scale data, sparse verified days retaining weight signal while hiding estimate, legacy no-whitelist not claiming complete days, weight moving toward goal, blocked review propagated into Coach, and optional eligible review with no automatic action.
- `tests/piq1-coach-confidence-ui.test.tsx` adds **two server-render checks** confirming four disclosure labels when Maintenance evidence is attached and no spurious disclosure for unrelated cards. UI component exported for deterministic SSR. Existing route response types remain backward compatible via optional view field.

**Validation / QA:** First CI for partial code surfaced a TypeScript compatibility error due to `String.replaceAll()` in the new UI; corrected to supported `.replace(/_/g, ' ')`. Final validated code SHA **`8dcfe6c0d4b2f432cd9fffc7b26342cf20a5b526`**: [GitHub Actions run 38758823374](https://github.com/daurham/daurham-health/actions/runs/38758823374) **SUCCESS** (npm ci, `npx tsc -b`, `npx eslint .`, **1744 tests passed / 14 skipped** across 228 passed files / 2 skipped, and `npm run build`). All fixture records are synthetic; owner mobile/browser QA remains outstanding. No new paid-model calls or migrations.

**Scope / still needed:** Explanations are deterministic and cannot establish actual full-day logging or an individualized safe calorie floor. Numerical observations are estimates of energy balance, not measured metabolism; no probability or causal attribution is asserted. Need real-owner acceptance and review of understandable copy on mobile; expert/owner assessment of a physiological lower-intake screen and strength/goal tradeoffs; e2e saved Coach stale-ID/API lifecycle coverage; comparison of confidence source-version freshness; future PIQ-1.3 source reliability and later PIQ-3/4 answer quality. The app's production schema head and whether 0053 is applied remain unverified.

**Release:** `piq/00-baseline-20261014` only; **`main` `dbc3fcb68324d75d30a96132b725456ec7e45d49` unchanged**, no deployment, production migration, target edits, owner-data writes, or Gemini spending. PIQ-1.1 and PIQ-1.2 remain branch-prepared, not owner accepted.

**Next bounded direction:** Exercise stale recommendation lifecycle via a disposable PostgreSQL/API integration fixture, particularly older accepted IDs and >24 due follow-ups. Then undertake remaining PIQ-1.2 owner-relevant physiological screening and live mobile validation; do not release before explicit signoff.

**Continuation:** Repo `daurham/daurham-health`, dev branch `piq/00-baseline-20261014`, validated code `8dcfe6c0`, 0/9 phases accepted.

## PIQ-1.2 — Disposable PostgreSQL saved-ID and long-due-queue lifecycle validation (2026-10-15)

**State:** Bounded implementation fully **branch-validated**, **not deployed or owner-accepted**. Overall **0/9 PIQ phases fully accepted**. PIQ-1.2 safety/calibration and PIQ-1.1 owner release QA remain open.

**Confirmed gaps (not just theoretical):**
- The GET path queried due `do_this` rows with `LIMIT 24` *before* current recommendation evidence/revision eligibility. More than 24 obsolete calorie follow-ups could starve a later valid training follow-up and produce an empty or incomplete displayed queue even when valid owner tasks exist.
- The `surfaceDraft()` `ON CONFLICT (fingerprint)` upsert overwrote `metadata.decisionRevision` on an already accepted calorie recommendation when a same-fingerprint draft appeared under changed target/goal settings. This could silently treat an old accepted record as a current revision, undermining the stored-card lifecycle guard.
- Saved-ID response logic needed disposable-PostgreSQL exercising of its *real write boundary*, not only synthetic pure in-memory eligibility tests.

**Changes (no schema migration):**
- `server/intelligence/coach-intelligence.ts:dueFollowUps()`: filter the two calorie-sensitive recommendation kinds in the PostgreSQL `WHERE` clause by original stored `metadata.decisionRevision` and exact currently eligible draft fingerprints **before `ORDER BY ... LIMIT 3`**. Unrelated recommendation kinds stay eligible. This replaces the 24-row prefilter cap, does not need unbounded pagination, and avoids stale rows hiding otherwise valid follow-ups. The just-in-time revision is still checked after the read; if it changed, requery only non-calorie follow-ups to fill the three display slots.
- `surfaceDraft()`: on conflict, a stored `do_this` calorie or dependent activity alternative **retains its original decision-revision metadata** instead of stamping the new revision. Owner response/outcome state and chronology are retained. This does not assert all historical presentation fields are immutable; the nonrevision title/detail/evidence fields can still be updated by the existing upsert path and should be addressed if immutable historic snapshots are needed.
- `writeCoachRecommendationResponse()`: isolated the **same guarded SQL response-mutation path used by the API** into a testable service function, receiving an explicit safety assertion callback; the production route supplies `requireCurrentCalorieRecommendation()` and remains unchanged. An invalid, legacy, changed, or unqualified saved calorie ID fails with HTTP 409 before any response/update query. `requireCurrentCalorieRecommendation()` now supports an optional synthetic current-control snapshot and read-only revision verifier only for safe integration tests; normal application path continues to fetch fresh canonical state.
- `tests/piq1-full-migration-postgres.integration.test.ts` adds **three real disposable PostgreSQL service/SQL integration regressions** on the full 0001–0053 migration-chain schema: (1) **32 stale accepted calorie follow-ups** preceding four valid training follow-ups cannot starve the three-visible queue, including failed/absent revision; (2) accepted calorie card `do_this` metadata stays on original revision after same-fingerprint upsert; (3) a freshly eligible saved ID can be accepted through the real SQL write boundary, but a calorie-target edit, changed goal-control revision, and legacy missing row revision cannot replay that ID or overwrite stored owner response memory. Tests rollback inserted/modified fixture rows; no live data is involved.

**Verification:**
- Code commit **`f8edd9b270472cc78f3a46aaa35f1e5af2afa379`**; [GitHub Actions full branch validation 38760221494](https://github.com/daurham/daurham-health/actions/runs/38760221494) **SUCCESS**, npm ci, TypeScript, ESLint, **1744 tests passed / 17 skipped**, production build.
- [Isolated PostgreSQL 38760221752](https://github.com/daurham/daurham-health/actions/runs/38760221752) **SUCCESS**, 16 passed, includes actual revision hashes, stored-card lifecycle, long queue and service-level persisted-response tests.
- `main` stays at **`dbc3fcb68324d75d30a96132b725456ec7e45d49`**. No production migration, owner health-record update, deployment, Gemini call or automatic target edit.

**Remaining honest limits / next work:** Tests cover the *shared service mutation path*, not an end-to-end browser/mobile HTTP handler using owner authentication, nor a true multi-client commit-at-the-same-instant race. Revision checks remain optimistic, not atomic with subsequent persistence. An unchanged fingerprint can represent a revised narrative; accepted historical title/details may still be rewritten on a concurrent/same-fingerprint upsert (revision metadata is protected). `buildCoachRecommendationDrafts()` remains limited to the top three and so may exclude a due accepted follow-up that is presently eligible but no longer in the top three. Clinical/owner-specific calorie energy screening is a provisional heuristic, not individualized safety clearance. Need owner preview/mobile and production-schema audit, including unconfirmed production migration 0053, before any PIQ-1.1/1.2 release.

**Next bounded task:** Prioritize the owner-realistic physiological calorie-screening evaluation and guard against misleading numerical precision (no need to guess private physiological profile), or address the remaining historical-card state machine / authenticated E2E separately in PIQ-1.5. Keep release gates closed.

**Continuation:** Repo `daurham/daurham-health`, work branch `piq/00-baseline-20261014`, validated code `f8edd9b`, `main` unchanged; **0/9 full phases accepted**.

## PIQ-1.2 — Physiology-aware conservative cut screen and target–intake coherence (2026-10-15)

**State:** Bounded subtask implemented and **branch-validated**, not production deployed or owner accepted. **0/9 complete PIQ phases accepted**. Still pending wider PIQ-1.2 individualized case evaluation and PIQ-1.1 live owner/mobile/schema acceptance.

**Confirmed decision risk:** The earlier plateau/energy-balance estimator could offer a numerical calorie-reduction review whenever full-day intake + weight-trend sampling and generic `max(1500 kcal, 80% observed maintenance)` screen passed. It did **not** compare the new target against (a) the **already reported intake**, (b) the low end of the estimator's uncertainty range, or (c) the available owner physiological profile. For example, targeting ~2425 while already logging ~2400 could be presented as a new reduction; a lower target could also be unsupported by the model's own uncertainty. A generic floor is not an individualized energy need.

**Implementation and safety invariants:**
- `src/domain/maintenance.ts`: new structured `MaintenancePhysiologyScreen` passed through existing `MaintenanceAdjustmentContext`, consulted only when goal direction is **lose**. A proposed downward numerical review is withheld when current age/height are unknown, historical/stale, or invalid; for owners under 18 or 65+ (generic automated numeric cut screen not suitable); where calculated adult height/weight BMI is below 18.5 or weight is unknown; or when the Health Profile reports unresolved (active/unknown) clinical conditions. These are **conservative triage boundaries** rather than diagnoses, guarantees of adequacy, or contraindication claims. They never use assumed sex, pregnancy state, energy expenditure, FFM or unrecorded clinical history.
- Compare the proposed lower target against empirical `MaintenanceEstimate.rangeLowKcal`: withhold an extra cut below the *lower edge of this estimator's own uncertainty range*. That is not a measured RMR/energy availability threshold. Also withhold when the proposed target is still at/above recent average logged intake (the supposed cut may not change actual behavior), or recent intake exceeds current target by >5% (review goal adherence and intake completeness first). These thresholds are deliberately cautionary heuristics, not medical prescriptions.
- Existing safety gates for full-day verified food, aligned weigh-ins, hunger/energy/soreness, active experiments, training decline, urgent goals, and optimistic settings versions remain intact. If blocked, Coach receives a **nonnumeric plan/context review** and a detailed evidence explanation, while the descriptive estimate and plateau state remain unchanged. The code never writes or auto-accepts calorie targets.
- `server/intelligence/maintenance.ts`: reuse current canonical `getHealthProfile()` (no provider call or new schema); derive age via canonical date function and count *owner-reported* active/uncertain conditions. A failed profile read, null DOB/height or retrospective `asOf` fails closed because the profile is a current singleton and does not prove historical facts. No owner profile data copied into the repository.
- `server/intelligence/maintenance-revision.ts`: include the `health_profile` row in the read-only PostgreSQL decision-revision fingerprint, so profile creation/correction invalidates old persisted calorie advice and can be detected before/after independent evidence loads and during later saved-card responses.
- Positive synthetic legacy fixtures now supply **explicit adult physiology context** and targets that would represent a meaningful change from logged intake; historical negative tests remain blocked. New `tests/piq1-maintenance-physiology-screen.test.ts` adds **10 synthetic regressions** covering eligible manual review, missing/current-vs-historical profile, minors/older adults, low BMI, active conditions, logged target mismatch in both directions, range-low cutoff, non-measured source caveat, and Goal Control/Coach no-numeric propagation. Existing revision SQL test asserts profile inclusion. Full migration chain disposable PostgreSQL test adds a profile insert/update/rollback scenario proving revision changes.
- Screening caveat: even in a `review_possible` state, ordinary BMI does **not** rule out low energy availability, pregnancy/lactation, disordered eating, significant clinical factors or medication effects. Those are not derived from these inputs. Do not interpret screened adult range as clinical clearance; no new mandatory questionnaire was added.

**CI evidence:** Code SHA **`6ce7741d5dba39671a474342c6fd13cedb43f33a`**:
- [Branch validation 38761884294](https://github.com/daurham/daurham-health/actions/runs/38761884294) **SUCCESS**: `npm ci`, TS, ESLint, full Vitest **1754 passed / 18 skipped**, and production build. 229 test files passed, two skipped.
- [Isolated PostgreSQL verification 38761884309](https://github.com/daurham/daurham-health/actions/runs/38761884309) **SUCCESS**, **17 tests passed**, includes profile-correction invalidation against isolated full schema migration chain.
- No production owner data accessed or written; `main` remains **`dbc3fcb68324d75d30a96132b725456ec7e45d49`**. No provider/Gemini spending, migrations added or applied to production, automatic target updates or deployment.

**Remaining owner and release gates:** PIQ-1.2's proposed heuristic thresholds need owner-realistic and ideally qualified clinical review (including high training load/lean athletes, low energy availability, recovery, persistent plateaus with incomplete logs, and special populations). A simple BMI/age screen plus empirical maintenance uncertainty is NOT a sufficient energy-availability model. Account for physiological sex and other sensitive history through versioned/optional owner-owned context in PIQ-2 rather than guessing from account identity. UI wording should not market `review_possible` as `safe`. Complete authenticated mobile/API acceptance, production schema head and migration 0053 verification, and remaining PIQ-0/1 acceptance checks before any `main` promotion.

**Next bounded implementation:** Strengthen the PIQ-0 golden decision-question suite with multi-signal, contradictory realistic intake/plateau/recovery and target-change scenarios; then continue PIQ-1.3 source freshness/coverage or PIQ-2 structured owner physiological context with explicit owner signoff. Never introduce a generalized treatment recommendation or unapproved profile inference.

**Continuation:** Repo `daurham/daurham-health`, dev branch `piq/00-baseline-20261014`, validated code `6ce7741d`, `main` unchanged, 0/9 full PIQ phases accepted.

## PIQ-0.2 / PIQ-1.2 — Multi-domain deterministic golden Coach decision suite (2026-10-15)

**State:** Bounded, fully **branch-validated** implementation and scenario registry; **not deployed, owner-accepted or human-scored**. The overall PIQ program remains **0/9 fully accepted phases**.

**Objective:** Earlier PIQ-1.2 subchecks independently validated food-day completeness, aligned maintenance, weight goals, recovery, performance declines, experiments, profile, current calorie target, source revisions and saved Coach follow-ups, but no single golden suite tested whether these sometimes contradictory inputs produced a **coherent final user-visible action** after Goal Control prioritization and Coach presentation.

**New golden registry:**
- `tests/piq0-golden-coach-decisions.test.ts`: **22 numbered, non-identifying deterministic synthetic histories** G01–G22 plus registry-integrity and injected-stale-opportunity defense tests. A reproducible 28-completed-day America/Phoenix frame composes food, source IDs, owner-reported full-day verification, comparable weight slope, check-ins, context, target/settings revision, active experiments, physiological screen, training performance/goal conflicts and optional weekly-focus candidate.
- Each case traverses the actual pure `buildHealthIntelligenceSnapshot()` → `buildMaintenanceState()` → `buildGoalControlState()` → `buildCoachRecommendationDrafts()` → `keepVisibleCoachDependencies()` pipeline. Asserts estimate availability, plateau classification where relevant, independent calorie safety, latest-seven-days verification floor, goal-control primary action, eligible final Coach kinds and specific withheld reasons. Always asserts no calorie/alternate cards when cut decision blocked, no orphan activity alternative, completed-day window excludes provisional today, and no card implies automatic target implementation.
- Case coverage: legitimate optional manual review G01; high-source-quality but unconfirmed day G02; older history versus recent incomplete day G03; verified falling weight G04; weight-maintenance goal G05; low energy/hunger/poor sleep G06–G08; actual strength decline and competing performance goal G09/G21; active experiment G10; logged intake/target mismatch and maintenance uncertainty G11/G12; missing/clinical/low-BMI profile G13–G15; target/revision race G16; stale weekly calorie focus and orphan activity focus G17/G18; same-day food outlier G19; absent wellness G20; failed verification read G22.
- `docs/ai/PIQ_DECISION_GOLDEN_CASES.md` records the exact 22 scenario IDs, premises, desired action outcomes, reproducible harness, audit constraints, and evaluation scope. Values are artificial and do **not** represent actual owner history.

**Safety bypass found and fixed (source-backed):**
- `src/domain/goal-control.ts` originally prioritized `opportunity(input.brief.focus)` ahead of current Maintenance evidence. A stale numeric intake cut from a weekly packet could therefore bypass current calorie-cut safety decisions. Now a weekly `review_intake_adjustment` may win only with current Maintenance `review_possible`, matching intervention ID/kind, and latest-week Nutrition quality `met`; a weekly `review_activity_adjustment` can never become an orphan primary recommendation. Disqualified weekly focus falls back to canonical Maintenance/Training decisions instead of removing all guidance.
- `src/domain/coach-intelligence.ts` independently validates matching current Maintenance intervention, `review_possible` and full-day nutrition quality for **any** intake-adjustment primary draft, including a directly injected Goal Control object. The activity alternative additionally requires the canonical current safety decision and its visible parent, so a second entry point cannot reverse the guard.

**CI and test correction:** First complete CI [38763492286](https://github.com/daurham/daurham-health/actions/runs/38763492286) had **one golden-only assertion mismatch**: G04 recorded steady weight loss and returned `blocked` instead of `review_possible` because the candidate cut is below the estimator's uncertainty range. Both results prohibited changing intake, and the conservative `blocked` result is right; the golden expectation was corrected, not the safety gate weakened. Remaining **21 goldens and all other unit tests passed on that run**. Latest code commit **`a101ffac082714d7157fb215753a9841fec56d7f`**, [GitHub Actions 38764136862](https://github.com/daurham/daurham-health/actions/runs/38764136862) **SUCCESS**: `npm ci`, TypeScript, ESLint, **1778 tests passed / 18 skipped**, 230 test files passed / 2 skipped, and `npm run build`. All 22 goldens now pass.

**What the metric does *not* mean:** This is an output-decision correctness regression set, **not** an Ask Health/provider evaluation, a qualified clinical assessment, a personal medical recommendation, an authenticated browser/mobile E2E, or a human-rated usefulness score. It does not fulfill the 0–4 directness/physiology/evidence/proportionality/human-brevity rubric across user questions; future human scoring and general/unsafe/historical/retrieval question cases remain PIQ-0.2 acceptance work. Do not infer all Phase PIQ-0 is accepted.

**Safety/release constraints:** No Gemini/API spend, no new tables/migrations, no automatic goal edits, production data accesses or deployments. `main` remains **`dbc3fcb68324d75d30a96132b725456ec7e45d49`**; production applied migration `0053` and mobile runtime remain unverified. The golden set is wholly synthetic, without owner identifiers, medical history or secrets.

**Next bounded task:** Begin PIQ-1.3 *training-event semantics* verification with a shared qualification-vs-programmed-session truth table and conflicting-day fixtures (2/3 qualified vs 1 programmed, two ad hoc logs same day, planned rest/reschedules/backfills). Also continue PIQ-0.2 human-scored Ask Health questions when owner-safe snapshots and approved budget are available. Reconcile outstanding PIQ-1.1/1.2 owner release gates before merging.

**Continuation:** Repo `daurham/daurham-health`, work branch `piq/00-baseline-20261014`; validated code `a101ffac`; **0/9 entire PIQ phases owner accepted**.

## PIQ-1.3 — Canonical qualified-strength-days vs programmed-session truth, first slice (2026-10-15)

**Status:** Code/UX **branch-validated**; **not deployed, owner-mobile accepted, or full PIQ-1.3 phase accepted**. **0/9 entire PIQ phases fully accepted.**

**Cause:** Training Plan card correctly uses `buildTrainingWeekQualification` from actual saved performed sets (three different qualified strength exercises per Health-local day, counting ad-hoc sessions and pre-plan history). But the separately loaded Weekly Coach snapshot supplied only `completedProgrammedSessions`—a legacy COUNT of programmed session rows—and Goal Control / Weekly Coach incorrectly subtracted it from the *qualified-day* weekly frequency target. Thus 2/3 qualified days with 1 programmed row could be described as **two programmed sessions remaining**, contradicting Training's one day remaining; optional preferred/rest dates were sometimes treated as scheduling deficits.

**Implementation:**
- New pure `src/domain/training-progress-summary.ts`: `buildTrainingProgressSummary()` computes an authoritative structured view of **qualifiedTrainingDays**, weeklyTargetDays, **remainingQualifiedDays**, today already qualified, and preferred-day advisory status, independently of recorded programmed session rows. Does not infer missing performed exercise evidence is zero. Distinguishes `unconfigured`, `unavailable`, `met`, `preferred_today`, `open_day`, `flexible_week` and issues only opt-in preferred-day suggestions; no guilt state for unscheduled/open/rest/moved-away dates.
- `src/domain/weekly-coach/types.ts` adds optional, backwards-compatible `qualifiedTrainingDays` and `todayQualified` to the snapshot type alongside legacy `completedProgrammedSessions`. `server/weekly-coach/load.ts` supplies the authoritative `trainingPlan.weekTraining.completedDays` and today qualification from the same `getTrainingPlan()` used by the Training Plan card; preferred **future** date calculation excludes the current date.
- `src/domain/goal-control.ts`: `trainingAdherence` calls the shared summary. Its `detail` reports qualified days **and** separate programmed session-row counts, never equates them. Retains `remainingSessions` as legacy diagnostic for compatibility, but adds `qualifiedTrainingDays`, `remainingQualifiedDays` and reports the latter in user-facing coaching. Missing qualified-day evidence yields `unavailable`, not fabricated 0. No mandatory rest/preferred-day enforcement.
- `src/domain/weekly-coach/build.ts`: the training-plan focus uses the same shared summary; only a **currently unqualified optional preferred day** may generate the advisory training focus. Achieved weekly target or already-qualified today suppresses second-session prompting; an open/rest or moved-away day never becomes a deadline or guilt-inducing focus. The training facts distinguish **recorded session rows in the previous seven completed days** from **qualified strength days in the current Monday-week through as-of** and explicitly label both windows.
- `src/features/goal-control/GoalControlCard.tsx` shows concise qualified-days progress with details. `server/training/plan-service.ts` clamps the legacy programmed-row diagnostic to requested `asOf` rather than reading through that calendar week's future Sunday.
- Tests: `tests/piq1-training-progress-summary.test.ts` adds **12 deterministic truth-table tests** for 2 qualified/1 programmed, two ad-hoc logs together qualifying one day, duplicate workout logs on same date, retroactive save/edit/delete evidence, empty-programmed-row non-qualification, unavailable read, 3/3 met, today already done, open/rest day without enough preferred dates, moved preferred day, moved-away day, and historical future-evidence exclusion. Existing I6, I9, weekly Coach and SSR fixtures aligned with the new semantics. Existing qualification and routine-credit tests still pass.
- Verified on code SHA **`769166d742875ab124854d7df728780c8a3b57b7`**, [GitHub Actions branch validation 38768447457](https://github.com/daurham/daurham-health/actions/runs/38768447457) **SUCCESS**: `npm ci`, TypeScript, ESLint, **1790 tests passed / 18 skipped** across 231 passed / 2 skipped files, and production build. Disposable PostgreSQL [run 38767835411](https://github.com/daurham/daurham-health/actions/runs/38767835411) **SUCCESS** on preceding code commit `6eac7857` for the saved-Coach regression path; note it did **not** run on the exact final documentation/legacy-wording-only revision.
- First combined test run uncovered two legacy assertions expecting `0/1 canonical Training session` phrase rather than new `0/1 recorded Training session`; corrected the test strings, preserving the distinct factual counts. Previous concurrent regression run also showed an older synthetic saved-calorie-ID control lacking a new safety object; a null-safe Coach guard now fails closed instead of throwing, and the disposable PostgreSQL fixture explicitly supplies a genuinely eligible Maintenance control state. No behavior weakened to satisfy tests.

**Semantic truth:** qualified strength days = distinct Health-calendar dates with >=3 different performed strength exercises across saved eligible workouts. Same-day multiple sessions yield at most one qualified day; programmed-session rows are not the weekly goal and do not automatically imply full exercise qualification; per-routine rotation has separate attribution and may differ. Preferred dates express *intent*, not obligatory attendance. Same-week historical `asOf` excludes future workouts; current day can qualify once performed work is saved.

**Release/remaining:** No production deployment or DB write, no migration, no Gemini use, `main` remains `dbc3fcb68324d75d30a96132b725456ec7e45d49`. Production schema applied-head and 0053 status still unverified, as are real authenticated mobile and multi-tab refresh. PIQ-1.3 remains pending end-to-end reconciliation of performed-set SQL with one-day/multi-log, midweek plan activation, moved/rescheduled sessions, wrong routine sequence, retroactive set deletes, same-day edits, routine credit vs day credit, and live UI revalidation after mutation (PIQ-1.4). The legacy `completedProgrammedSessions` counter can include empty programmed session rows; deliberately expose it only as recorded rows, not as evidence of full session completion or day qualification. PIQ-0 owner scored answers and release QA remain open.

**Next bounded task:** Add disposable-PostgreSQL training qualification/plan snapshot regression for **two ad-hoc logs together qualifying one day**, distinct routine credits, future as-of, and midweek owner-plan activation; then tackle shared mutation invalidation PIQ-1.4 without paid provider calls. Do not accept PIQ-1.3 prematurely.

**Continuation:** Repo `daurham/daurham-health`; branch `piq/00-baseline-20261014`; validated code `769166d`; `main` unchanged; **0/9 accepted phases**.

## PIQ-1.3 — Disposable PostgreSQL performed-strength-set qualification and routine reconciliation (2026-10-15)

**State:** Bounded database-test slice **fully branch-validated**; **not deployed, owner-accepted, or phase-complete**. **0/9 overall PIQ phases accepted**. The existing shared qualified-day vs programmed-session implementation, last validated at `769166d`, remains unchanged.

**Why this slice:** Previous `PIQ-1.3` qualification truth-table tests used synthetic in-memory `PerformedExerciseEvidence` rows. They did not prove the real database select (`PERFORMED_STRENGTH_EXERCISES_SQL`) correctly includes performed strength exercises across separate saved sessions, excludes warmup-only and future evidence, and feeds both weekly-day and routine-rotation calculations consistently.

**Implementation:** No production/service changes, no migrations. `tests/piq1-full-migration-postgres.integration.test.ts` now imports the actual exported SQL from `server/training/plan-service.ts` and the actual `buildTrainingWeekQualification`, `buildTrainingRoutineCredits`, and `buildTrainingProgressSummary` domain builders. Within **rollback-only transactions** on the disposable full `0001–0053` migration-chain schema, the tests create fictitious `workout_sessions`, `workout_session_exercises`, `workout_sets`, a Wednesday-effective versioned Training Plan, and canonical seeded exercise IDs. The test helper uses full foreign-key-valid PostgreSQL inserts and real SELECT results, not fabricated result arrays.

**Two additional isolated-Postgres integration cases:**
1. **Two Monday ad-hoc logs** (2 distinct strength exercises + 1 distinct performed exercise, plus one warmup-only exercise) combine into **one** qualified day. On Tuesday, one programmed routine A with three performed exercises and one programmed routine B with three different performed exercises earn **two routine-specific credits** but only **one additional calendar-day** qualification. As-of Thursday, the result is **2/3 qualified days** despite **two programmed session rows**, hence **one day remaining**. A fictional plan becomes effective Wednesday; pre-plan Monday evidence still counts for the current week because qualification query has no plan-created cutoff. A Friday future session does not contaminate Thursday counts. Deleting Monday's third performed set drops weekly credit 2→1, preserving actual workout session rows and both Tuesday routine credits.
2. An all-warmup programmed workout does **not** qualify Monday. A saved Wednesday ad-hoc workout with three performed exercises qualifies **one** day as of Wednesday, but not as of Monday. Deleting one of its performed sets removes Wednesday's qualification. Future Friday workouts are excluded. Thus query semantics agree with the calendar-day reducer over backfills, rest-day intent independence, and observed-set deletions.

**Execution / verification:** Initial code `b7b4e1a` failed ESLint/parser and isolated test compilation due to a broken multiline TypeScript cast in the new test helper (no application failure). Corrected code SHA **`1c19a5daa00f1861646c4311c09b990f37c78ca1`**.
- [Branch validation 38770932816](https://github.com/daurham/daurham-health/actions/runs/38770932816) **SUCCESS**: npm ci, `npx tsc -b`, `npx eslint .`, full Vitest **1790 passed / 20 skipped** across 231 passed / 2 skipped test files, and `npm run build`.
- [Disposable PostgreSQL 38770932709](https://github.com/daurham/daurham-health/actions/runs/38770932709) **SUCCESS**, **19 passed** across both `PIQ-1.1` isolated DB test files, includes the two newly real-SQL training scenarios.
- Production `main` remains `dbc3fcb68324d75d30a96132b725456ec7e45d49`; no production writes, schema changes, API/model calls, user medical data or migration execution outside disposable CI.

**Important limits:** This tests the **shared SELECT and pure state builders with actual saved rows**, not an authenticated `getTrainingPlan()` API response assembled through `getSql()` nor a browser render after edit/delete. Inserting a midweek plan validates existence of a correctly shaped plan row, but does not exercise plan-service's entire joined fetch path. The completed programmed-session count is intentionally a raw record counter, not proof each session qualifies, and the routine's rotation pointer can change differently from day counts. Date/intents/reschedules were covered synthetically in the prior truth table; real SQL with rescheduled overrides and partial session mutations needs separate coverage. The isolated migrations are **not** evidence that the owner's live DB has applied migration 0053. CI success does not mean owner acceptance.

**Next bounded work:** PIQ-1.3 authenticated training-plan read/invalidation on real endpoint/SQL scenario and PIQ-1.4 UI freshness after logging/editing/deleting a workout, with source revision and background/multitab revalidation. Keep full-phase release hold until owner mobile QA and deployed schema reconciliation; do not merge to `main` without explicit release authorization.

**Continuation:** Repo `daurham/daurham-health`, branch `piq/00-baseline-20261014`, validated code `1c19a5d`; **0/9 phases accepted**.

## PIQ-1.3 — Training and Coach rest-aware follow-up, final combined validation (2026-10-15)

**State:** Branch-validated follow-up to the qualified-strength-day vs programmed-session checkpoints; **not deployed or owner-accepted**. Overall **0/9 PIQ phases fully accepted**.

**Fixes after initial training reconciliation:**
- The original `tests/weekly-coach.test.ts` had two failures from assertions coupled to now-renamed session-count copy. Replaced those assertions with checks against the stable `fact:training:sessions` ID, retaining the historical-`asOf` exclusion and demo-data semantics.
- `src/domain/coach-intelligence.ts:restAware()` previously treated `rest_day_on_track` as *necessarily* a planned non-Training day. Under the shared qualification model, this state can also mean a **preferred day already qualified**. Such a day is now described as **already counted** with no second-workout requirement. A `flexible_week`/rest day gets optional-date wording, not an attendance penalty. Unrelated Training recommendations are preserved.
- `tests/i9-coach-intelligence.test.ts` now verifies (1) rest is not a missed-session penalty, (2) an already-qualified preferred day is not mislabeled rest and does not prompt extra work, and (3) sparse preferences/flexible week remain nonpunitive. These tests complement the existing twelve synthetic truth-table cases for distinct qualified days, ad-hoc aggregation, routine/session separation, rest/reschedule, backfill and future-evidence rejection.
- The earlier branch development commits (already documented) also validated canonical performed-exercise day qualification and routine credit via disposable PostgreSQL, with tests excluding future rows from historical `asOf` counts. The previous PIQ-1.3 docs and SQL integration remain intact.

**Final combined validation:** Code SHA **`647c0d0a5b2489743039c24695778c32918baa54`**. [GitHub Actions branch validation 38774301680](https://github.com/daurham/daurham-health/actions/runs/38774301680) **SUCCESS**: npm ci; TypeScript; ESLint; full Vitest **1,792 passed, 20 skipped** (231 test files passed, 2 skipped); production build. [Earlier isolated PostgreSQL training/schema integration 38770932709](https://github.com/daurham/daurham-health/actions/runs/38770932709) **SUCCESS** on previous integration code head; the final code only changes Coach copy/tests, and this latest branch run validates those together.

**Boundary/remaining work:** The test suite does **not** prove current multi-device/client UI invalidation after a workout is logged, edited or deleted. Training plan and Goal Control snapshots may remain cached until explicit refetch; this is PIQ-1.4 freshness. Owner mobile acceptance and authenticated live endpoint cases remain. “Qualified strength day” is a product rule of >=3 distinct performed strength exercises, not a clinical exercise-dose measure. Programmed session-row counts are not interchangeable with qualified calendar days. Do not turn preferred weekdays or rest into compulsory attendance or claim phase acceptance.

**Release:** `main` remains **`dbc3fcb68324d75d30a96132b725456ec7e45d49`**, no production deploy, migration, owner workout modification, or paid-model use. Next PIQ bounded task: PIQ-1.4 source/cache invalidation after logging, editing, deleting or backdating Training evidence and screen navigation/re-focus; favor deterministic cache keys, revalidation, and stale-result guards, preserving read-only owner production scope.

**Continuation:** Repo `daurham/daurham-health`, branch `piq/00-baseline-20261014`, validated code `647c0d0`; **0/9 full phases accepted**.

## PIQ-1.4 — Training and Coach client data freshness after mutations, tab changes and refocus (2026-10-15)

**Status:** Bounded implementation fully **branch-validated**, but **not deployed/owner-accepted or entire PIQ-1.4 completed**. Overall **0/9 PIQ phases accepted**. Previous PIQ-1.3 qualified-strength-day, rotation attribution and rest-aware checkpoints remain intact.

**Observed gap:** While successful canonical workout mutations already fired a generic same-tab `health:data-changed` event (used by Today/Coach), Training’s recent session list and plan card only fetched on mount. The Plan editor and Weekly Coach were also one-shot reads. A completed workout, edited/backdated set, deleted session, or changed Training Plan could therefore leave mounted Training/Goal/Coach surfaces disagreeing until a route reload. Coach intelligence fetched only when `state.date` changed, so same-day newer Goal/Coach evidence could still leave its recommendation card stale.

**Changes (client-side only; no schema or provider):**
- `src/lib/health-changes.ts`: extend the existing successful-mutation classifier to `/api/training/plan` (baseline/version, override, move, anchor and rotation mutations). Reuse the canonical local `health:data-changed` event; optional `revalidateOnFocus` also listens for browser focus, pageshow and visible-document restoration, with coalescing and cleanup. Add an **ephemeral same-origin BroadcastChannel** carrying *only the literal invalidation signal*, never dates, identifiers, calories, health records or session content. Receiving an event refreshes local UI but does not rebroadcast, avoiding echo loops. Unsupported/private browsers fail gracefully to local events + focus. No localStorage, timers polling or new subscription service.
- `src/features/training/TrainingPage.tsx`: re-fetch latest session history on successful owner mutations and focus with per-request generation checks, so slow older responses cannot overwrite the newest list; clean up on unmount.
- `src/features/training/TrainingPlanCard.tsx`: same generation-safe re-fetch for the canonical day-qualification, week target and routine preview.
- `src/features/training/TrainingPlanPage.tsx`: refresh canonical plan evidence and visible counts on mutation/focus without replacing **unsaved owner edits** to frequency, routine order or note; coalesce initial template loading and invalidate stale plan reads. Successful local saves still explicitly apply the saved plan.
- `src/features/training/WorkoutDetailPage.tsx`: when a saved workout changes in another tab or the user returns, increment its existing reload key and refetch the detail while **retaining an in-progress manual edit draft**. No automatic overwrite of the draft or implicit owner save.
- `src/features/today/TodayPage.tsx`: include focus restoration in the existing atomic Today + generation-guarded Coach/Goal Control refetch, so updates from a separate device become visible when returning to the app.
- `src/features/coach/CoachCard.tsx`: re-fetch read-only Coach intelligence when the containing same-date Coach state itself changes, not just when its date changes; cancel stale outstanding reads on cleanup.
- `src/features/weekly-coach/WeeklyCoachPage.tsx`: re-fetch the existing read-only weekly decision/brief after relevant canonical changes and focus. Abort older GETs and use request generations so an old GET or an older optional **user-initiated** POST generation cannot overwrite newer evidence. **Mutation-triggered refresh does not call the Weekly Coach Gemini generation endpoint.**
- `tests/health-changes.test.ts` adds Training Plan mutation classification and deterministic browser-event regressions for focus/pageshow coalescing, unsubscribe cleanup, privacy-only message payload, and no BroadcastChannel echo. Existing successful-vs-failed mutation tests continue passing. Source generation guards and the React lifecycle are tested by the full branch TypeScript/lint/build suite, **not a real mounted multi-tab browser**.

**Validation:** Code SHA **`9eba2fbef537619c92d50cdb19d24d83e9c2ae44`**. [GitHub Actions branch validation 38776998651](https://github.com/daurham/daurham-health/actions/runs/38776998651) **SUCCESS**: npm ci, TypeScript, ESLint, **1,799 passed / 20 skipped** across 231 passed/2 skipped test files, and production build. Last separate disposable-Postgres PIQ-1.3 integration [38770932709](https://github.com/daurham/daurham-health/actions/runs/38770932709) passed earlier and was not rerun for this purely client-side slice.

**Risk and limits:** This is a client **invalidation/refetch** contract, not end-to-end source revision proof. Same-origin same-browser tabs receive BroadcastChannel hints; other devices/locations need a re-focus/page restore or manual route reload, **not live push**. Request generation prevents older client responses from winning; a server concurrent write after a read or editing stale unsaved data is not made atomic. On focus Today still calls the existing `/api/coach/ensure` path (no new model-generation route); verify its network/DB rate and visible UX with real device before broadening. Refetching an edited workout during an unsaved draft preserves the draft but does not yet provide a server-version conflict prompt if another editor changed the source. Failed refreshes are surfaced as errors; there is no last-success timestamp/explicit stale pill yet. Owner auth, mobile Safari background restore, second-tab isolation, multi-device behavior, delayed-response race and real workout edit/save/delete navigation all require human/browser E2E. No automatic training-target modification, no existing data migration and no owner production data access.

**Release:** `main` still **`dbc3fcb68324d75d30a96132b725456ec7e45d49`**; no prod deployment, migrations, owner training records changed, Gemini spend, paid service, or automatic edits. Production applied migration 0053/schema head remain unknown. PIQ-1.4 and full PIQ-1.3 not accepted.

**Next bounded target:** Add authenticated owner-safe browser/API revalidation acceptance harness for actual Training edit/delete/backdate and current-Plan/Today/WeeklyCoach views, plus a source-version conflict/stale-draft warning or verified reload behavior on concurrent editing. Keep it in PIQ branch, no production writes or background model generation. If owner browser harness remains unavailable, keep as explicit release gate rather than claiming it tested.

**Continuation:** Repo `daurham/daurham-health`, branch `piq/00-baseline-20261014`, validated code **`9eba2fbe`**, **0/9 full PIQ phases accepted**.

## PIQ-1.4 — Owner-visible stale workout draft warning and safe explicit reload (2026-10-15)

**State:** Bounded implementation **fully branch-validated**, **not deployed, browser/mobile owner-accepted, or entire PIQ-1.4 accepted**. Overall **0/9 full PIQ phases accepted**.

**Starting point:** Previous PIQ-1.3/1.4 Training/Goal/Coach day-qualification and focus/tab invalidation checkpoints were already completed and validated at branch head `1b6f5718caead35ee83a3ee9aa75b6c0cafec3c9`, [CI 38777793256](https://github.com/daurham/daurham-health/actions/runs/38777793256) **SUCCESS**. The older pending Weekly Coach `0/1 recorded session` phrase expectations had already been corrected there; do **not** duplicate that code.

**Observed risk:** `src/features/training/WorkoutDetailPage.tsx` re-fetched a saved session upon mutation/focus and preserved an in-progress `WorkoutDraft`, but gave no indication when the underlying canonical saved workout changed. The owner could unknowingly overwrite another tab/device edit. In-flight older fetches could also return after an explicit owner reload. The server `PATCH /api/training/sessions/:id` has **no atomic version precondition** at present.

**Implementation:**
- `src/features/training/workout-draft-freshness.ts`: pure `workoutEditRevision()` builds an **in-memory, deterministic serialized content fingerprint** of editable canonical workout identity, date, type, name, routine/template link, owner-entered metrics/notes/limitations, exercises, and every saved set including numbers, types, loads, repetitions, unilateral/time/distance/completion and effort/failure/notes. Derived performance-bests and library display strings are excluded to avoid falsely reporting conflicts when the logged workout itself did not change. `workoutDraftIsStale()` fails closed when original source or latest read is missing/changed. The serialized revision is never persisted, logged or sent to a provider.
- `src/features/training/WorkoutDetailPage.tsx`: capture the saved content revision when Edit begins. On focus or successful cross-tab change, compare refreshed canonical content to the original draft source. If changed, preserve the owner's **entire unsaved draft**, surface an accessible **Saved workout changed while you were editing** alert, and disable the Save commit. No data is auto-overwritten. Provide one explicit owner choice **Discard my draft and load latest saved workout**, which fetches fresh canonical session/template data and replaces the editor only on intentional activation, resetting field errors and the baseline fingerprint.
- Saving a currently uncontested draft now makes one read-only `fetchSession()` immediately before the existing PATCH; any changed/deleted/unavailable latest source prevents that blind save. A separate request generation guard rejects outdated background fetches after another read/reload/save, so earlier replies cannot erase a newly chosen source state.
- `tests/piq1-workout-draft-conflict.test.tsx`: **five** synthetic regressions for unchanged copies and derived PR changes, actual set/date/notes/exercise modification, null/deleted baseline fail-closed behavior, accessible alert and explicit user-discard semantics, and busy reload state.
- The new on-save GET increases only local owner read traffic on intentional saves; no background model calls, forced workout saves, new paid services or schema migration.

**Validation:** Validated code SHA **`3f069c81dab409acff0dee739f0a8577604111c2`**, [GitHub Actions branch validation 38778605229](https://github.com/daurham/daurham-health/actions/runs/38778605229) **SUCCESS**: npm ci, TypeScript, ESLint, full Vitest **1,804 tests passed / 20 skipped** (232 files passed / two skipped), production build. This includes the new deterministic fingerprint/SSR warning tests. The earlier isolated PostgreSQL [38770932709](https://github.com/daurham/daurham-health/actions/runs/38770932709) tested canonical Training SQL, **not** the new concurrent edit UI. No authenticated browser or Safari two-tab scenario was run.

**Honest limits:** This is an optimistic client conflict detection/last-moment re-read, **not transactional compare-and-swap**; a concurrent update between read and PATCH can still be lost. The server does not expose a versioned workout update precondition and cannot by itself distinguish intentional override from stale drafts. Full-device focus/visibility, two-tab Safari, deleted-session error, in-flight cancellation, no-drip data loss, offline/error states, and user comprehension still require browser/mobile owner acceptance. The explicit reload **discards** unsaved edits only when chosen; it does not merge drafts or provide an export/undo history.

**Release/next bounded task:** Implement a server-owned **atomic saved-workout edit precondition** or documented version comparison within the same transaction before the destructive session/exercise replacement, with disposable PostgreSQL concurrent-update tests and HTTP 409 mapped to a non-destructive editor refresh. Validate against Neon HTTP transaction semantics (no unsupported lock assumptions) without touching production. Then complete authenticated browser / owner mobile multi-tab QA and production schema/migration 0053 read-only reconciliation. Do not merge/release without owner approval.

**Release state:** `piq/00-baseline-20261014` only. `main` remains **`dbc3fcb68324d75d30a96132b725456ec7e45d49`**. No production deployment, migration, data mutation, Gemini spending or workout schema change. **0/9 phases fully accepted**.

**Continuation:** Repo `daurham/daurham-health`, branch `piq/00-baseline-20261014`, validated code `3f069c81`. Next implement server-side atomic workout edit version guard and transactional integration; preserve disabled Save behavior and never auto-overwrite owner drafts.

## PIQ-1.4 — Server-owned atomic saved-workout edit precondition and safe UI conflict (2026-10-15)

**Status:** Bounded subtask **branch-validated**, **not deployed/owner-accepted**, **0/9 PIQ phases fully accepted**. Previous PIQ-1.3 tests and PIQ-1.4 focus/tab/draft-warning safeguards remain intact.

**Risk closed:** The earlier `WorkoutDetailPage` re-read of a saved workout immediately before `PATCH /api/training/sessions/:id` was only optimistic client-side freshness. A different tab/client could still commit after that read but before the server's unconditional update and `DELETE FROM workout_session_exercises` + recreation; unsaved owner changes could be overwritten even though the UI checked the source.

**Implementation (zero new migrations):**
- `server/training/service.ts:getSession()` now includes `workout_sessions.xmin::text AS edit_revision` on the saved detail response. `src/domain/training.ts` parses this opaque PostgreSQL row-version token as optional `WorkoutSession.editRevision` for backward-tolerant reads (not personally identifying, not a promise of an eternal content hash).
- `updateManualSession()` requires the caller to present numeric `expectedEditRevision` in the PATCH body; missing/malformed tokens return **HTTP 428** before any database access/write. The canonical validation/preparation and existing session/template constraints still apply. The first statement in its Neon HTTP `sql.transaction` performs `UPDATE ... WHERE id=$1 AND xmin::text=$16 RETURNING id`. PostgreSQL row-update locking and rechecking decide whether the saved source version can be edited. The update stamps an unpredictable short-lived server `_piq_edit_nonce` in workout metadata.
- All subsequent **delete and insert statements** in the same transaction are gated by that successful edit nonce on the saved parent row. If the CAS UPDATE returns no row, deleting old exercises and inserting new exercises/sets are all no-ops; the server returns **HTTP 409** with explicit fresh-workout instructions. The nonce is cleaned out of saved metadata in the final guarded statement, and the successful GET gets a new `xmin` token. The previous unconditional UPDATE / DELETE path is no longer used by manual workout editing. No inferred workout evidence or automatic saves.
- `src/features/training/api.ts:updateSession()` includes the server token on PATCH, and maps HTTP 409/428 to a dedicated `WorkoutEditConflictError`. `WorkoutDetailPage` preserves the full unsaved edit draft, marks it stale and surfaces the existing accessible conflict notice, disabling Save until the owner intentionally chooses **Discard my draft and load latest saved workout**. The earlier client fingerprint/recheck remains as an additional early warning; the database decides final authorization.
- `tests/piq1-workout-server-cas.test.ts`: three synthetic service/schema checks for missing/malformed tokens, guarded SQL `xmin` predicate, and canonical opaque token parsing.
- `tests/piq1-full-migration-postgres.integration.test.ts`: adds one genuine PostgreSQL SQL-sequence regression in a rollback-only fixture on disposable full 0001–0053 schema. It creates an artificial saved workout, obtains its live `xmin`, executes the *actual guarded update/child replacement SQL in one parent transaction*, verifies updated workout date/notes + new exercise/set and removed old exercise, confirms the nonce did not persist, and then replays the old token to verify **zero updated rows and exactly unchanged new exercise/set and source version**. The test's artificial set initially violated the existing mutually exclusive RIR/RPE constraint; adjusted to a single valid effort scale before final pass. No change to medical or production data.

**Evidence:** Code SHA **`2790c34919607039ad1cbc90ccdbda07b29e7737`**.
- [GitHub Actions branch run 38780521965](https://github.com/daurham/daurham-health/actions/runs/38780521965) **SUCCESS**, `npm ci`, TypeScript, ESLint, **1807 tests passed / 21 skipped** across 233 passed/2 skipped files, production build.
- [Disposable PostgreSQL run 38780521984](https://github.com/daurham/daurham-health/actions/runs/38780521984) **SUCCESS**, **20 integration tests passed** including new real database CAS and no-overwrite test.
- `main` remains **`dbc3fcb68324d75d30a96132b725456ec7e45d49`**; no Vercel deployment, new schema migration, Gemini calls, owner health/workout writes, Neon production read/write or paid service.

**Honest scope and follow-up:** The PG test mirrors the ordered Neon HTTP `sql.transaction` queries inside a rollback-only PostgreSQL transaction; it does not execute a live Neon serverless HTTP transaction or simulate two actual concurrently connected clients. The version is the session row's Postgres tuple revision; a separate pathway modifying child sets *without also bumping their parent session row* would need its own invalidation/audit. Live authenticated PATCH/GET and Safari/two-tab UI conflict handling need actual owner/browser E2E; delete uses separate semantics. No migration was added; the older 0053 production-applied state remains unverified. Fail-closed HTTP 428 intentionally requires stale older clients to refresh rather than silently saving without a token.

**Next bounded target:** authenticated owner-safe end-to-end workout-edit/version conflict acceptance with two concurrently editing clients or isolated read-only route harness; verify Neon HTTP transaction semantics and owner-visible reload on iOS/mobile. Audit any direct child-write path for parent-version invalidation, and separately decide whether DELETE also needs CAS. Complete schema head and owner QA before promotion. Do not treat automated PostgreSQL as owner acceptance or merge `main` without explicit authorization.

**Continuation:** Repo `daurham/daurham-health`, branch `piq/00-baseline-20261014`, validated code `2790c349`; **0/9 full PIQ phases accepted**.

## PIQ-1.4 — Version-guarded workout deletion, preserving newer edits (2026-10-15)

**Status:** Implementation and synthetic/disposable-PostgreSQL tests **branch-validated**, not owner/browser accepted or released. **PIQ phase acceptance remains 0/9**.

**Problem:** Workout PATCH had PostgreSQL revision compare-and-swap, but DELETE still detached associated transcription jobs and removed sessions unconditionally, even if another tab or device edited the saved workout after the owner loaded it. A stale delete could erase newer sets.

**Changes at code commit `c5b440c68b17c0899ae88821def38a73aa7e08db`:**
- DELETE handler requires the same server-issued numeric `expectedEditRevision` as PATCH; missing or malformed tokens fail with 428 before database access.
- Within one Neon HTTP transaction, a parent UPDATE checks `xmin`, writes an ephemeral per-delete nonce, and only that claimed row authorizes transcription detachment and session deletion. On an old revision all statements are no-ops and the owner receives 409; no other tab's newer workout or exercises are silently removed. A successful delete consumes the row and nonce. Ordinary FK cascade behavior still applies.
- Workout detail client sends the visible saved token, or the edit draft's original token, and does not navigate away on 409/428. The draft remains, warning/error prompts explicit owner review/reload. A successful user-confirmed deletion still navigates back to Training.
- Added no-token service unit and SQL guard assertions, plus rollback-only PostgreSQL stale/current DELETE sequence covering preservation and removal of parent and child exercise data. No migration, AI/provider calls, automatic owner writes or paid services added.

**Validation evidence:** [GitHub Actions branch validation 38782039599](https://github.com/daurham/daurham-health/actions/runs/38782039599), attempt 2, **SUCCESS**: npm ci, TypeScript, ESLint, **1,809 Vitest passed / 22 skipped** (233 passed/2 skipped files), production build. Attempt 1 failed only because a legacy `tests/goal-training-units-db.test.ts` ephemeral PostgreSQL process did not start; the same commit passed on retry without a code change. [Isolated PostgreSQL run 38782039764](https://github.com/daurham/daurham-health/actions/runs/38782039764) **SUCCESS** for real disposable schema and stale delete regression.

**Remaining release gates:** Real Neon HTTP transaction semantics and authenticated PATCH/DELETE GET flows; iOS Safari/background restoration and two-tab/conflict navigation owner QA; client cache freshness across Nutrition, Body, profile, goals, check-in and quality decisions; explicit stale/read-error signaling; production applied migration 0053 and owner-schema readiness. This does not prove an old client can delete: versionless DELETE now intentionally fails closed. Direct child-table mutations outside parent-controlled Training services must be audited before declaring full revision coverage.

**Release state:** Work branch `piq/00-baseline-20261014` only. `main` remains unchanged, and no owner production data, deployment, migration, or Gemini usage was affected. **Next bounded target:** PIQ-1.4 remaining cross-domain revalidation, especially profile/quality-state and same-day Nutrition/Body/Goal source changes, with synthetic race/consumer tests before authenticated owner QA. PIQ-1.5 recommendation lifecycle remains next major subsystem.


## PIQ-1.4 — Version-bound workout Delete confirmation (2026-10-15)

**Status:** Branch fix staged for GitHub Actions; not yet mobile/browser owner-accepted or deployed. **0/9 PIQ phases fully accepted.**

**Remaining UX race after `c5b440c`:** On a read-only saved-workout screen, opening Delete confirmation and then receiving a background same-page refetch could silently upgrade the version being submitted. The server CAS then legitimately deletes the *newer* version the owner never reviewed. An active edit draft also needs its original source identity to remain authoritative.

**Bounded change:** Capture workout ID, opaque server `editRevision`, and editable-content fingerprint once when the owner first opens confirmation. Never update these authorization fields on a background refetch. Disable Delete and display a review-required warning if the canonical version/content changes while the modal is open. Fail closed when the saved version is missing, mismatched, or already stale; preserve the edit draft. Add deterministic no-provider, no-database regressions for changed notes/sets, newer server token, wrong ID, stale draft and missing version. No schema change or owner data mutation.

**Evidence boundary:** Prior database DELETE CAS work passed full and disposable-PostgreSQL CI (recorded immediately above). This new owner-confirmation snapshot still requires its own branch validation, browser/mobile acceptance and live authenticated two-client/Neon HTTP QA. `main`, owner DB, production schema, Gemini spend and actual owner workout data remain untouched. Next: broader PIQ-1.4 revalidation/quality-state invalidation, then PIQ-1.5 lifecycle; owner QA and schema-readiness are release gates, not optional.


## PIQ-1.4 — Clinical/context and nutrition quality change invalidation (2026-10-15)

**State:** Prepared on the PIQ work branch; full CI and owner/browser QA are pending for this checkpoint. No complete PIQ phase has been accepted.

**Observed semantic gap:** `src/lib/health-changes.ts:isCoachRelevantMutation` notified mounted Today/Goal Control/Coach/Weekly Coach after Training, food-entry, Body, Goals and other owner writes, but omitted three existing mutations that can directly change the legitimacy of recommendations: `PUT /api/profile` (age, height and owner-authored clinical context), `POST /api/data-quality/reviews` (validation/exclusion of questionable source evidence), and `PUT /api/nutrition/day/completeness` (whether the owner reports a day as complete, partial, or unknown). This could retain same-day numerical calorie-advice eligibility or quality explanations after the evidence standard changed.

**Small bounded fix:** Recognize only those three **successful** write routes in the existing no-PII same-origin event classifier, retaining the coalesced event, focus/pageshow revalidation and request-generation guards. No new provider calls, polling, scores, schema tables, model budget usage or user-facing fields. Do not mark preview/draft/GET or failed writes as source changes. Expanded deterministic classifier and `healthFetch` event tests cover the three paths, unsuccessful write and unchanged read. This change invalidates mounted consumers; it does **not** prove every component uses a globally atomic shared snapshot or guarantee freshness across devices while idle.

**Remaining:** CI for this checkpoint, browser/mobile owner QA and read-only production schema readiness before main; subsequent PIQ-1.4 broader stale-read/source-revision validation and PIQ-1.5 recommendation lifecycle. Zero owner data or production schema touched.


## PIQ-1.4 — Mounted Nutrition and Body freshness (2026-10-15)

**Scope:** Branch-only follow-up to the workout Delete confirmation and profile/quality/day-completeness invalidation; no production release.

**Validated prerequisite:** Full CI for `0852e16477609cf6840361b887c036c677a569df` passed [run 38784304136](https://github.com/daurham/daurham-health/actions/runs/38784304136). This fixes the legacy saved-workout deletion copy assertion and validates the preceding `ac015df` Delete-confirmation and `378ac727` profile/evidence-quality invalidation changes. A prior run `38783288450` failed because that older assertion expected the superseded confirmation sentence; no failed TypeScript or lint assertion was reported.

**New observed gap:** Nutrition's atomic day view preserved an adjacent-day cache but did not listen for canonical mutations or browser re-focus. A date fetched before another tab's food/completeness changes could be returned from prefetch cache without server revalidation. Body's combined sessions/cadence/inbox read fetched only on initial mount; ad-hoc refresh calls could race, letting older slow responses replace fresher data.

**Bounded fix:** Nutrition subscribes to existing private no-data mutation/focus/pageshow signals, evicts the committed day and cached neighboring days, and invokes its established generation/AbortController-safe atomic retry. Open input panels are not reset. Body uses a latest-read generation across its three read endpoints, refreshes on the same signals, preserves open edit/import forms, and reports a failed refresh while retaining last loaded values. Cadence writes refresh the full canonical history instead of issuing an independent unguarded cadence read. A new pure atomic-resource regression rejects a late success or late error from an older same-date refresh. These are read-only background GETs, never Gemini generations or automatic owner mutations.

**Limitations:** Event notifications are generic, may add several owner GETs after successful writes and are not a cross-device push service. Changes in another browser/device are visible on focus or page restoration, not instantaneously. No authenticated mobile UI or realistic concurrent-body-editor acceptance is claimed; Body's saved-measurement edit remains a separate potential stale-write concern. Continue with owner QA and production-schema read-only reconciliation before promotion. **0/9 PIQ phases fully accepted.**


## PIQ-1.4 — Data Quality review screen freshness (2026-10-15)

**State:** Bounded branch follow-up; no owner/browser acceptance or production release. Keep full PIQ phase acceptance at **0/9** until release gates pass.

The existing Data Quality reviewer loaded only once on mount. After a canonical mutation or a confirmation/exclusion made in another tab, the mounted review list could continue showing obsolete issue state. The reviewer now subscribes to the same privacy-safe mutation/focus/pageshow signal, re-reads the canonical issue list, and uses request generations so a slow older response does not overwrite a later owner decision. Starting a review invalidates earlier in-flight GETs; the review response only replaces state if still current. An errored refetch retains the last readable list with an alert. No new polling, model call, score, migration, or automatic review decision. The in-browser two-tab review behavior remains an explicit QA gate, not an automated proof.

**Prior batch verified:** Nutrition and Body mounted-view freshness commit `b35e36d` passed [GitHub Actions full validation run 38784733886](https://github.com/daurham/daurham-health/actions/runs/38784733886): npm ci, TypeScript, ESLint, Vitest and production build. The separate follow-up fixes a late older Body refresh **error** appearing after newer successful evidence. Continue PIQ-1.4 with owner-mobile, profile/Body edit conflicts, Neon HTTP and production schema readiness; leave `main` unchanged.


## PIQ-1.5 — Read-only Coach review and explicit started acknowledgement (2026-10-15)

**State:** Branch implementation submitted for validation; owner/mobile QA and the full recommendation lifecycle remain open. **0/9 core PIQ phases fully accepted.**

**Why:** The Coach recommendation primary button looked like a navigation-only "Review" action but called `do_this`, storing an accepted intervention and scheduling a seven-day outcome prompt without owner action. Similarly, tapping "Experiment" saved an experiment-conversion response *before* an experiment existed. Both could create false memory and suppress advice.

**Bounded contract:** The existing action text is now a plain internal navigation link; "Explore experiment" opens the existing Lab handoff without posting a response or claiming an experiment exists. Only a separate, explicitly labeled **"I started this"** button on actionable/experiment-eligible recommendations posts the legacy `do_this` response. It no longer auto-navigates; Coach explains that this acknowledgement schedules a seven-day check-in. Evidence-only cards cannot be marked started in the UI, and direct API calls attempting `do_this` on `improve_evidence` fail closed with HTTP 409. Explicit not-now/not-relevant owner actions still record suppression. No schema, new provider calls, sensitive owner payloads or production writes.

**Evidence:** SSR button/link tests and isolated SQL-service tests enforce review navigation, non-mutating experiment exploration, evidence-only rejection, and follow-up scheduling only for the actual started response. Full CI and human mobile/two-tab acceptance are separate gates. Legacy stored accepted rows are **not** silently relabeled as implemented; they remain pending provenance reconciliation.

**Outstanding PIQ-1.5:** Formal recommendation state machine separating viewed/accepted/implemented, persisted dependency groups and supersession reasons, revisit idempotency/context fingerprints, historical follow-up copy and explicit owner outcome readiness; live state and owner QA. **Next:** green CI gate on this commit, then implement the next bounded persisted recommendation-lifecycle safeguard without moving `main`.


## PIQ-1.5 — Explicit started provenance for follow-ups (2026-10-15)

**State:** Implemented on dedicated work branch; full CI and owner QA pending. **0/9 PIQ phases owner-accepted.**

**Problem:** Earlier "Review" button sent legacy `do_this`, scheduling a seven-day outcome question when the owner may have merely inspected advice. Changing the button alone would not fix already-saved rows or older cached clients.

**Guard:** New owner action "I started this" sends explicit `ownerStarted: true`. The owner-authenticated service refuses unmarked `do_this` (400, no mutation). A successful marked start persists `metadata.ownerStarted=true` using the existing JSONB column; other responses clear that flag. The SQL due queue and outcome endpoint require the stored provenance; old `do_this` review-only records are *not* rewritten, do not qualify for follow-ups, and remain unverified. The follow-up says the owner **marked** action started, not that Health measured adherence. No migration, provider call, auto-edit, or production data touch.

**Tests and evidence:** Added server mutation rejection, stored-marker SQL, due queue filter, and client/handler contract regressions in `tests/piq1-coach-review-only.test.tsx`. The preceding review/navigation fix is verified green in [CI 38787118162](https://github.com/daurham/daurham-health/actions/runs/38787118162). This provenance follow-up is in commit `ca1d6e707f50cd83f3c189b09f0c09fbe3d3e4e6` and requires independent CI and authenticated owner QA.

**Still open:** Historical suppression rows might hide an otherwise-current recommendation even though provenance is unverified. Need a controlled reconciliation after deciding which past responses represent real starts, plus explicit accepted vs implemented semantics, versioned evidence context, dependency/supersession groups, idempotency/race checks, and real mobile/Neon release QA. Do not infer or fabricate old owner actions. **Next:** verify this commit's CI; assess read-only legacy suppression path and design a safe correction if tests support it.


## PIQ-1.5 — Read-only legacy response suppression reconciliation (2026-10-15)

**State:** Bounded PIQ work-branch implementation, full CI and owner mobile/browser QA required. This is a *read-time* semantic correction; **no legacy DB rows are edited or inferred as owner-started**. PIQ phases owner-accepted: **0/9**.

**Why:** Former "Review" and "Experiment" preview buttons wrote `do_this` and `turn_into_experiment` into recommendation response memory. After the new explicit-start provenance gate, stale review-only memory could still suppress a current appropriate Coach card indefinitely.

**Change:** `recordMemory` reads `metadata.ownerStarted === true`; only marked `do_this` responses suppress current drafts. Unmarked historical `do_this` and old `turn_into_experiment` preview rows may be shown again **if live safety, quality, revision and dependency gates still qualify**. Explicit owner `not_relevant` remains suppressed; `not_now` still respects its seven-day expiry. Direct legacy API attempts to persist `turn_into_experiment` now fail without mutation; real experiment creation remains managed by the actual Lab workflow. Pure lifecycle tests cover historical review, true start, preview, not-relevant, not-now, and the legacy API guard. No past owner response erased, no schema migration, provider call, or automatic owner action.

**Trade-off:** A historical `do_this` click might have represented genuine owner action, but this cannot be verified from legacy rows; a currently qualified card can resurface for deliberate classification. We prefer transparent, owner-controlled re-acknowledgement to fabricated adherence. Outstanding: per-card context fingerprint evolution, metadata-preserving response CAS/idempotency, implemented-versus-intended state, dependency/supersession lifecycle, authenticated two-tab/iOS QA, and production applied-schema verification. Next: green CI and constrained concurrency review.


## PIQ-1.5 — Version-checked Coach responses and provenance-preserving reads (2026-10-15)

**State:** Branch implementation awaiting automated CI and owner device QA. **0/9 PIQ phases owner-accepted.**

**Failure:** Two tabs could read the same recommendation, submit different decisions, and the later unconditional `UPDATE` could silently replace the first decision and reset its follow-up. Separately, `surfaceDraft` overwrote metadata during GET/upsert, erasing `ownerStarted=true` for non-calorie recommendations and making a legitimately started task disappear from future outcome prompts.

**Contract:** The owner-facing recommendation includes its exact opaque server response timestamp (`responseAt`, null before first decision). The response POST carries `expectedResponseAt`; missing/malformed preconditions return HTTP 428 without reading data, and the SQL `UPDATE ... WHERE response_at::text IS NOT DISTINCT FROM $5::text RETURNING id` rejects stale conflicting writes with 409. The UI fetches the newer Coach view on conflict without claiming success. The surfacing UPSERT carries forward the prior `ownerStarted` marker on non-calorie rows while retaining existing stricter historical calorie-decision revision protection. The accepted timestamp is stored in PostgreSQL, not rounded through JavaScript Date in transit. No schema migration or provider calls.

**Tests:** Deterministic mutation/route/SQL regression and isolated full-migration PostgreSQL test for two stale responses, a legitimate refresh, marker preservation and owner dismissal. The disposable PostgreSQL test runs only under `PIQ_POSTGRES_URL` and rolls back its fictional rows. **Release gate:** authenticated two-tab/iOS Safari scenario, true concurrent Neon HTTP behavior and owner production schema readiness; outcome writes are not yet under the same CAS and are a next bounded task. No `main` promotion or production owner writes.


## PIQ-1.5 — Owner outcome response-version CAS (2026-10-15)

**State:** Dedicated work-branch implementation, requiring full CI, disposable PostgreSQL and authenticated owner QA before release. **0/9 phases owner-accepted.**

**Failure:** `POST /api/intelligence/coach/recommendations/:id/outcome` checked an owner-started `do_this` row and then unconditionally updated `outcome_state`. Concurrent newer recommendation decisions, a second tab submitting different feedback, or feedback before the seven-day review date could overwrite or falsely record an outcome.

**Contract:** The due Coach follow-up contains the original opaque SQL `responseAt` revision (not its human-readable JS date). Outcome POST includes `expectedResponseAt`. Missing/invalid token fails with HTTP 428 before DB access; a **single conditional PostgreSQL UPDATE** requires matching response revision, `do_this`, `metadata.ownerStarted=true`, no saved outcome, and a non-null due date at or before the current configured Health date. If no row is updated, return HTTP 409 without replacing any owner decision. The client re-reads Coach and asks the owner to review the changed state, instead of reporting false success. A due row without saved `response_at` no longer qualifies. Old response/outcome history is not migrated or rewritten; no Gemini calls, new schema, or production writes.

**Verification:** Pure SQL mutation tests cover missing tokens, exact predicates, duplicate/stale conflicts and client/handler propagation. Disposable migration-chain PostgreSQL regression checks premature feedback, a newer response revision, exactly one final outcome and rollback of fictional rows. Existing full CI for the prior response-CAS checkpoint: [run 38789824530](https://github.com/daurham/daurham-health/actions/runs/38789824530); isolated PG run 38789824536 was separately started for that checkpoint. This *outcome* follow-up needs independent CI before the claim becomes validated.

**Outstanding:** True parallel HTTP Neon clients, mobile focus/restoration, ambiguous completion semantics, dependent/competing interventions, superseded context fingerprints and production schema readiness. No `main` promotion, migration or owner-data mutation. **Next:** verify both CI lanes for this commit and evaluate the next bounded recommendation dependency constraint.


## PIQ-1.5 — Plateau-response alternatives and active-intervention guard (2026-10-15)

**State:** Bounded work-branch change awaiting CI, disposable-PostgreSQL and authenticated owner QA. **0/9 phases owner-accepted.**

**Bug:** When Coach recorded a genuine owner-started activity alternative, the intake recommendation could still appear as a separate actionable recommendation from the same plateau decision. The existing dependency filter caught the inverse case (missing intake parent) but not this one. Two separate saved recommendation IDs also allowed sequential starts from the same current plateau decision.

**Contract:** The intake and activity alternatives explicitly share `possible_plateau_response`. A read-only query recognizes *only* an active, explicitly owner-started and not-yet-evaluated choice for the **same verified 32-hex maintenance decision revision**; old-revision starts, historical Review clicks, and completed outcome rows do not block new choices. While one option is active, Coach hides both competing alternatives, but keeps unrelated Training/evidence cards and preserves the original follow-up and owner history. The guarded recommendation UPDATE rejects another option's start when a competing current-revision started row exists (409), while response CAS remains in place. No implicit starts, DB migration, production writes, or provider calls.

**Tests:** Synthetic domain tests for grouped alternatives, isolated PostgreSQL test for actual started activity -> blocked intake -> no mutation -> outcome recorded -> intake allowed, and the earlier conflict and historical-suppression suites. The PostgreSQL test uses fictional rows in a rolled-back transaction.

**Known remaining concurrency gap:** The `NOT EXISTS` constraint protects sequential conflicting writes but is **not a hard cross-row uniqueness guarantee** if two different option IDs start in truly concurrent PostgreSQL transactions. A database-enforced group-level invariant or serialized decision-lock implementation is still required before claiming strict simultaneous-start prevention. Owner iOS/two-tab and Neon HTTP validation remain pending, as do broader decision-context fingerprints and supersession across unrelated domains. This phase is not release-ready and should not be promoted to `main`.


## PIQ-1.5 — Database-enforced simultaneous plateau option exclusion (2026-10-15)

**State:** Work branch implementation; full TypeScript/lint/Vitest/build and disposable PostgreSQL migration/concurrency validation required. **0/9 PIQ phases owner-accepted.**

**Race being closed:** A `NOT EXISTS` subquery on the Coach response update prevented sequentially starting a second option, but two distinct row updates from simultaneous connections could both pass before either committed. An HTTP-level optimistic token protects only each individual row, not competing rows.

**DB hard rule:** New unapplied `0054_coach_plateau_active_unique.sql` creates partial unique index `coach_recommendations_one_active_plateau_revision_idx` over the persisted maintenance decision revision, for calorie/activity alternatives when `response_state='do_this'`, `metadata.ownerStarted=true`, `outcome_state IS NULL`, and the revision exists. PostgreSQL conflict resolution serializes simultaneous writes across distinct IDs. An evaluated outcome releases the active-revision slot; a changed decision revision is independent. Historical preview-only rows and unrelated training/evidence decisions are untouched. The API maps *only this index's* PostgreSQL 23505 violation to an owner-friendly HTTP 409; other SQL failures are never silently reclassified.

**Validation additions:** Migration-chain test count and schema inventory now expect migration 0054; the isolated PG workflow includes the new migration path. A two-connection PG regression starts two different plateau IDs with the same revision and verifies exactly one can be active, then cleans up fictional fixtures in the disposable schema. Unit tests verify precise unique-constraint error translation and distinguish unrelated database faults. Existing response- and outcome-CAS tests remain intact.

**Mandatory release gate:** Do **not** apply migration 0054 or promote the code to production without owner approval, applied schema inventory review, current verified backup and a read-only duplicate preflight. Any existing duplicate active starts must stop migration and receive explicit owner reconciliation; do not silently discard, merge, or relabel recorded action. Suggested read-only preflight:

```sql
SELECT metadata ->> 'decisionRevision' AS decision_revision, COUNT(*) AS active_choices
FROM coach_recommendations
WHERE recommendation_kind IN ('review_intake_adjustment', 'review_activity_adjustment')
  AND response_state = 'do_this'
  AND metadata ->> 'ownerStarted' = 'true'
  AND outcome_state IS NULL
  AND metadata ->> 'decisionRevision' IS NOT NULL
GROUP BY metadata ->> 'decisionRevision'
HAVING COUNT(*) > 1;
```

**Outstanding:** Owner authentic two-device/iOS testing, production migration approval, case where evidence changes within a non-calorie recommendation fingerprint, supersession text, broader same-domain intervention dependencies, and accepted-versus-implemented proof. No production writes, provider calls, or merge to `main`.


## PIQ-1.5 — Non-calorie saved-ID eligibility and historical follow-up context (2026-10-15)

**State:** Work branch only, pending full CI and owner device QA. **0/9 owner-accepted PIQ phases.**

**Failure:** The saved recommendation response API guarded numerical calorie proposals against stale goal/evidence revisions, but let historical non-calorie recommendation IDs accept owner decisions unconditionally after a Training/Goals signal disappeared. At the same time, a real owner-started Training action could still need a seven-day outcome review even after the current Coach stopped recommending it; the UI did not make that historical status clear.

**Bounded contract:** At response time, all non-calorie saved IDs must still be present by **both exact fingerprint and kind** in the newly computed current `buildCoachRecommendationDrafts(loadGoalControlState(asOf))`; otherwise return 409 without writing owner memory. Calorie decisions retain their existing stronger live-revision guard. Historical `do_this` acknowledgments are never erased; a due non-calorie follow-up whose saved fingerprint no longer appears in today's drafts is marked `historical`. The UI clearly says the earlier suggestion is no longer in the current recommendations, and asks only about what actually happened—not to restart it. Current follow-ups remain unchanged. No schema migration, provider call, inferred adherence or production mutation.

**Boundary:** An unchanged recommendation fingerprint does not currently identify every semantic change in source evidence; future context-versioned fingerprints and richer supersession are outstanding. A live eligibility check immediately before a saved-ID write is an optimistic guard, not a serializable lock on independent evidence imports. Owner mobile/Neon authenticated tests are mandatory before release.


## PIQ-1.5 — Non-calorie evidence-context response revision (2026-10-15)

**State:** Bounded PIQ work-branch implementation awaiting independent full CI and owner authenticated testing. **PIQ phases owner-accepted: 0/9.**

**Failure covered:** An unchanged recommendation kind/fingerprint could survive new Training or Goal Control evidence even when its rationale or underlying progression changed. The previous saved-ID eligibility check verified the same *recommendation*, but an old open browser tab could still record "I started this" against a materially different evidence context.

**Change:** Every displayed **non-calorie** Coach recommendation now carries opaque SHA-256 `contextRevision` derived from the current Health day/period, the exact owner-facing draft and a bounded, domain-relevant Goal Control evidence snapshot (Training progression/adherence, nutrition quality and matching evidence gap, relevant goals, or relationships). All non-calorie response POSTs send `expectedContextRevision`. The server recomputes fresh Goal Control, still verifies saved kind+fingerprint, then returns 428 for missing/malformed context or 409 for changed evidence **before the response SQL UPDATE**. The current client already handles 409/428 by re-reading Coach without claiming owner acknowledgement. Existing calorie advice keeps its stronger maintenance safety/evidence revision gate and its independent PostgreSQL response-time CAS. No DB migration, provider calls or live data mutation.

**Tests:** Pure revision determinism; changed progression under identical recommendation ID/title; stale day; unrelated nutrition change not invalidating Training; exact kind/fingerprint qualification; client/server propagation. CI and authenticated two-tab/iOS behavior remain release gates.

**Caveats:** This is a deterministic fingerprint of *currently derived Goal Control evidence*, **not** a canonical revision of every raw Training/Nutrition/Goal record. An underlying raw edit that does not change any included derived value may leave the token unchanged. Re-reading Goal Control before the update is optimistic rather than a lock over simultaneous external imports. Do not claim fully general evidence versioning or an implemented/adhered intervention. Next: assess owner-effectiveness and real canonical source invalidation evidence before closing PIQ-1.5.

**No production changes:** Branch-only; migration `0054` remains unapplied and requires owner-approved preflight; no merge to `main`.


## PIQ-1.6 — Scoped confidence on Goal Overview and Coach (2026-10-15)

**State:** PIQ work branch implementation; independent CI and owner mobile acceptance required. **Owner-accepted PIQ phases remain 0/9.**

**Problem:** The Goal Overview badge said only `high confidence` for cross-domain Goal Control, next to a Maintenance estimate independently classified as `moderate`. A Maintenance-sourced primary Coach opportunity inherited the broad Goal Control confidence rather than the Maintenance estimate's own confidence. Together these could imply unjustifiably high certainty in a calorie-related recommendation.

**Bounded UI and domain correction:** Goal Overview explicitly labels `Goal evidence · [level] confidence`, while numeric Maintenance is separately labeled `Maintenance estimate confidence: [own level]`, alongside its calculated kcal/day and estimated range where present. A small expand-on-demand section shows the Maintenance evidence window, reliable nutrition-day count, comparable weigh-in count and the estimator's existing explanation; these counts are not represented as proof of complete intake. A primary Maintenance-backed Coach draft now uses `maintenance.estimate.confidence`; unrelated Training opportunities keep cross-domain confidence. The Coach explanation disclosure labels its confidence explicitly as estimate confidence, not approval/safety certainty. If Maintenance evidence is insufficient, no observed numeric estimate is displayed.

**Regression:** Synthetic disagreement (overall high vs estimate moderate), confidence attribution for Maintenance-vs-Training drafts, a missing-estimate fail-closed view, and Coach evidence disclosure with distinct calorie decision status. This slice changes neither recommendation eligibility/safety nor canonical health facts; no schema migration, owner-data write, Gemini call, `main` promotion, or deployment.

**Still open:** Explain each domain evidence source with specific time/sample/provenance and confounding detail; formal calibration for confidence and uncertainty range; full PIQ-1.6 coverage in Ask Health, Training and comparative claims; authenticated browser and owner mobile review; release preflight for unapplied migration 0054.


## PIQ-1.6 — Exact-exercise Training confidence and explanation (2026-10-15)

**State:** Bounded work-branch implementation requiring TypeScript, ESLint, Vitest, production build, and authenticated owner mobile QA. **Owner-accepted PIQ phases: 0/9.**

**Issue:** A primary `training_progression` Coach recommendation could inherit cross-domain Goal Control confidence, even when the underlying exact-exercise series supported a lower confidence. The secondary Training card also used an ambiguous `endsWith(exerciseId)` lookup. Coach did not explain the number/date of comparable exercise exposures or recorded limitations behind its displayed strength trend.

**Contract:** Match progression evidence only when the current primary Training opportunity ID exactly equals `training-progression:<exerciseId>` for its specific series. Both primary and secondary Training progression drafts use that series' own confidence; absent exact evidence becomes **unknown**, never inherited high cross-domain confidence or fabricated samples. Coach recommendation views carry an optional bounded Training evidence explanation (exercise, trend state, exposure count, latest date, evidence window, percent change if known, recorded limitations, existing analyst rationale). Coach renders it behind an accessible disclosure, explicitly noting unrecorded recovery, equipment and technique confounders. Goal Overview independently labels exact-exercise Training trend confidence when its primary item is Training, leaving broad Goal confidence and Maintenance estimate confidence scoped separately. The non-calorie context hash includes Training evidence content to invalidate obsolete owner-visible decision explanations.

**Regression:** Synthetic high Goal / moderate Maintenance / limited Training confidence disagreement, independent Training trend explanation, unavailable exact-match evidence => unknown, nonmatching similar suffix, no invented exposure/adherence; existing calorie-safety and owner-response guards unaffected. No new schema, provider/model call, owner data write, deployment or `main` promotion.

**Still required for PIQ-1.6:** Calibration of confidence levels, provenance and source-range completeness for other domains and comparative assertions, explicit uncertainty on estimates, and mobile/owner QA. Migration `0054` remains unapplied in production and separately gated.


## PIQ-1.6 — Owner-confirmed Nutrition coverage explanation in Coach (2026-10-15)

**State:** Bounded PIQ work-branch implementation; requires independent full CI and authenticated mobile QA. **PIQ phases owner-accepted: 0/9.**

**Problem:** When broad Goal Control confidence was high, Coach's advice to improve incomplete food evidence inherited that unrelated high confidence. A reader could see logged days without seeing how few whole days were truly owner-confirmed complete/source-reliable, or incorrectly interpret missing logging as a known zero-calorie day. Even valid calorie-review options had no quick explanation of the seven most recent completed days' distinct safety floor (as opposed to the longer maintenance-estimation window).

**Contract:** Attach the existing Goal Control `nutritionQuality` evidence snapshot, without new inference, to `nutrition_quality_floor` recommendations and eligible calorie/activity plateau options. The Coach disclosure shows the last seven *completed* calendar dates, recorded-calorie-entry days, verified complete/source-reliable days, estimate-heavy days, unknown-source/quality days, and separate minimums. It expressly states that an entry is not whole-day confirmation and an unverified/missing day is not zero intake. The `improve_evidence` card uses confidence `limited` or `unknown` based on that evidence, never borrowing cross-domain `high`. Maintenance and Training confidence remain independently scoped. This is informational only: the preexisting numeric calorie-adjustment safety and verification gates are unchanged.

**Staleness:** Non-calorie Coach context revisions include the exact owner-visible nutrition breakdown in addition to the already present Goal Control evidence fingerprint. A changed verification count with an otherwise identical card invalidates a saved stale-tab response rather than silently recording an action.

**Tests:** Synthetic high overall confidence vs limited/unknown nutrition, exact counts and no zero/complete inference in server-rendered Coach UI, presence on both qualified plateau levers without bypassing their safety floor, and context token invalidation as quality evidence changes. No migration, new owner medical facts, provider/model calls, edits to actual owner data, or main/prod changes.

**Still open:** Clinical/statistical calibration of confidence, general source provenance and missingness explanation across other signals and Ask Health, canonical/raw-event revision guarantees, authenticated owner QA, and the owner-approved production preflight and unapplied migration `0054`.


## PIQ-1.6 — Missing Recovery and Goal evidence is unknown, not high-confidence (2026-10-15)

**State:** Bounded PIQ work-branch patch, awaiting full CI and authenticated owner/mobile acceptance. **0/9 phases owner-accepted.**

**Failure:** Coach's `improve_evidence` cards were correctly scoped for missing nutrition but could still display globally high confidence for missing sleep, wellness/recovery and unresolved active goals. That misleadingly implied a well-supported finding from absent measurements.

**Contract:** The absence of an eligible sleep or wellness signal, or the inability to evaluate a goal, now gives that evidence-gap card `unknown` confidence instead of borrowing aggregate Goal Control confidence. A generic limited cross-domain evidence warning is `limited`. Existing nutrition-specific reliable-day thresholds and display stay unchanged. Non-nutrition cards carry a bounded reason code, Goal Control assessment period and explicit data-absence explanation, shown behind a disclosure. Missing measurements do **not** imply worsened sleep, failed goals, completed actions, or a need to change targets. The evidence-gap explanation participates in non-calorie context revision hashing, so a materially changed explanation invalidates a stale owner response. No canon health profile change or invented source count.

**Tests:** Synthetic high global confidence with missing sleep; unresolved goal not characterized as failed; generic limited cross-domain evidence; precise assessment period; no fabricated nutrition coverage; saved response context changes with evidence detail. No migration, Gemini call, owner-data modification, `main` merge or deployment.

**Remaining PIQ-1.6:** Demonstrate calibration of confidence grades and source-window provenance for recovery and other comparative insights; attach real source event metadata when present rather than inventing it; authenticated mobile UX; canonical revision guarantee for raw edits. Existing migration `0054` remains unapplied and owner-gated.


## PIQ-1.6 — Recovery signal observation coverage and provenance (2026-10-15)

**State:** PIQ work-branch implementation; CI and authenticated mobile/owner review are gates. **Owner-accepted phases: 0/9.**

**Problem:** Coach asked for missing sleep/wellness signals with correctly downgraded confidence but no actual observation count, source window or provenance. A generic seven-day Goal Control assessment window could be mistaken for the longer Health Intelligence source window, and absent observation counts could be misconstrued as zero recorded activity or verified complete tracking.

**Contract:** Goal Control's missing-signal limitations now carry the existing Health Intelligence coverage snapshot **only when a matching coverage record is available**, including source period, observed/eligible date counts, excluded observations, provenance by source and source-specific confidence. Coach shows those numbers in a small expandable explanation, explicitly separating its own Goal Control assessment dates from the underlying source observation dates and explaining that recording coverage is not proof of sleep quality, recovery, full-day completeness or a health change. If there is no source coverage, it says counts are unavailable instead of inventing a zero. Evidence-gap recommendation confidence remains **unknown** when the signal is missing, regardless of unrelated high Goal Control confidence.

**Stale decision guard:** The already existing non-calorie evidence context revision hashes the owner-visible evidence gap, so a change in underlying source observations, exclusions, provenance or source window rejects an outdated owner response without creating a false acknowledgement.

**Regression:** Synthetic Coach disclosure/unknown-source tests, deterministic context-token change on new source observations with stable recommendation ID, and a complete Goal Control derivation from fictional Health Intelligence coverage that verifies the true longer source window. No new schema, provider calls, owner records, `main` merge or deployment.

**Remaining:** Confidence calibration against real evaluation outcomes; raw-event-level causal and invalidation guarantees; confounding/quality metadata for comparisons; owner-authenticated iOS QA. Migration 0054 remains unapplied and strictly owner-gated.


## PIQ-1.6 — Paired relationship evidence and non-causal disclosure (2026-10-15)

**State:** Bounded work-branch implementation; requires full CI and authenticated mobile/owner acceptance. **0/9 PIQ phases owner-accepted.**

**Gap:** Health Intelligence already computes paired observational correlations (sleep/energy, sleep/steps, hydration/bowel and other registered pairs), and Goal Control selects a few relevant high/moderate-confidence associations. Goal Overview previously never displayed these selected insights, let alone their sample-window and provenance. A high relationship confidence could be mistaken for causal or complete-source confidence.

**Contract:** Goal Control retains each selected registered relationship's exact source observation window, matched date range, matched-pair count, screening minimum, lag and *independent* signal coverage/provenance when available. These are derived solely from the existing snapshot's `evidenceDates` and `coverage`; missing source coverage stays unavailable, not zero or complete. Goal Overview adds a collapsed, bounded `Observed relationships` panel showing at most the three already-filtered associations, linked evidence routes, matched sample confidence separately from each signal's coverage confidence, source counts and observational/confounding caveats. Weekly Goal Control assessment dates are not substituted for longer observation dates. No new correlation, intervention recommendation, confidence calibration, data mutation, model call, or schema change. Absence of a statistically eligible relationship does not create a card.

**Verification:** Synthetic 16-paired-day, mismatched high pair/moderate source confidence test; sparse eight-pair exclusion; missing coverage explicitly unavailable; React SSR disclosure and source links. CI, owner mobile layout and real-data reliability remain required. The older migration `0054` remains unapplied in production and separately approval-gated; no `main` merge or production write.

**Remaining PIQ-1.6:** statistically calibrated uncertainty on relationships and effects, raw source-event invalidation, trial/outcome confounding controls, owner-verified UX and production schema readiness.


## PIQ-1.6 — Correlation magnitude distinct from evidence quantity (2026-10-15)

**State:** Bounded PIQ work-branch implementation. Full CI and owner-authenticated mobile acceptance required. **0/9 phases owner-accepted.**

**Problem:** Goal Overview called 16+ paired observations a high-confidence relationship without exposing the rank-association coefficient. A count-based grade could be mistaken for a test of statistical significance, confidence in causation, or strength of co-movement. The underlying Health Intelligence already computed Spearman's rank coefficient and a separate magnitude category.

**Contract:** For the already-screened, goal-relevant observed associations, preserve their original Spearman `rho` and categorical `strength` without recalculation. The Goal Overview evidence disclosure now labels the existing grade **matched-pair count grade**, independently shows the signed correlation coefficient and strength, and states that neither statistical significance, confounder adjustment nor a causal effect has been established. Null, nonfinite or out-of-range source coefficients remain unavailable rather than becoming false zeros or invented statistics. Source windows, matched dates, coverage/provenance, relevance eligibility, order and the three-card cap remain unchanged.

**Verification:** Derived synthetic 16-pair evidence matches the original snapshot's coefficient/strength exactly; server-rendered UI shows the distinct count grade, signed rank coefficient and non-causality; missing coefficient renders unavailable; previously tested eight-pair nonqualification and missing provenance remain guarded. No new correlation algorithm, threshold/claim, health-record modification, Gemini/provider call, migration, `main` merge or production deployment.

**Still open:** Formal statistical calibration and sensitivity to longitudinal trends, multiple comparisons/autocorrelation and incomplete observation, direct raw-source revision guarantees, owner iOS/mobile QA and release preflights. Migration `0054` remains unapplied and owner-gated.


## PIQ-1.6 — Observed relationship date clustering and independence caveat (2026-10-15)

**State:** Bounded, branch-only quality improvement; full GitHub CI and owner-authenticated mobile QA required. **0/9 phases owner-accepted.**

**Gap:** An observational relationship with 16 daily paired records displayed a high matched-pair-count grade and a Spearman coefficient, but there was no indication that 16 adjacent days are part of one serially observed time series, not 16 independent experiments. A long contiguous sequence can share time trends or other correlated confounders.

**Contract:** Keep the registered correlation calculation, selection thresholds, coefficient, strength, recorded source windows and confidence grade unchanged. Derive only a transparent date-spacing description from the original matched **X-side anchor dates**: count distinct dates, contiguous calendar-day runs and the longest run. Lagged Y-side dates do not create additional independent observations; repeated anchors count only once. No matched evidence or malformed dates return an unavailable pattern, not fabricated zero or a claim of independence. Goal Overview surfaces these numbers under the existing observational disclosure and states that serially recorded dates may be related, the pairs are not independent trials, and pair counts alone establish no statistical significance. This is not a p-value, effective sample size adjustment, trial result, causal analysis or evidence calibration.

**Tests:** Derived 16-consecutive-date example preserves the original rho/strength and yields one contiguous run; synthetic gapped, duplicated and lagged anchor dates yield distinct run counts; malformed/missing date information is shown as unavailable. Rendering asserts the independent-trial caveat. No new schema, provider/Gemini calls, production writes, historical alterations or main merge.

**Remaining:** Actually quantify temporal trend sensitivity/autocorrelation under a pre-reviewed statistical design; multiple-comparison selection bias, missingness-dependent observation selection, observed confounders and formal evidence calibration. Owner iOS QA and production schema/migration 0054 approval remain separate mandatory release gates.


## PIQ-1.6 — Adjacent-day relationship sensitivity (2026-10-15)

**State:** Bounded PIQ work-branch implementation awaiting full CI, authenticated iOS review and owner acceptance. **0/9 PIQ phases owner-accepted.**

**Risk addressed:** A strong Spearman rank relationship over 16+ paired dates can reflect two time-trending signals rather than day-to-day co-movement, especially when measurements are clustered. The existing matched-date run/count disclosure is useful but cannot show whether the *direction of day-to-day changes* resembles the overall rank association.

**Scope:** For the same already-screened, goal-relevant relationships, derive a **secondary, descriptive first-difference Spearman** on *consecutive X anchor dates only*, preserving the original paired Y lag. Use only original eligible `evidenceDates` and their original `frame` observations: no invented zeroes, gap bridging, resampling, new source facts, extra model calls, or recalculated primary coefficient. Duplicate, invalid, missing or non-finite match evidence makes the sensitivity unavailable; fewer than six consecutive transitions or unvarying deltas produces a null coefficient, never artificial zero. Display exact transition count, signed change coefficient when valid, and explicit warnings that this is not a significance test, a time-trend or autocorrelation correction, a reliable effect estimate or causal evidence. Original relationship selection, strength, count-based grade and three-card cap remain **unchanged**.

**Verification:** Synthetic co-trending signals with raw Spearman ρ near +1 but consecutive changes ρ near −1, gapped dates, small samples, constant increments, duplicate/malformed pairs, lagged Y dates and SSR explanation. No DB migration or writes to owner records, no Gemini/provider budget, `main` untouched. Previous schema migration `0054` remains **unapplied** and subject to separate owner-approved backup/duplicate preflight.

**Still open:** Formal time-series uncertainty, changes driven by confounders/recording selection, multiple-testing correction, clinical calibration, canonical event-level freshness, authenticated owner review and PIQ phase acceptance. The optional sensitivity is a *qualitative warning*, not sufficient evidence to act or revise an intervention.


## PIQ-1.6 — Selected-correlation screening denominator and selection-bias disclosure (2026-10-15)

**State:** Bounded work-branch improvement pending CI and owner-authenticated mobile acceptance. **0/9 PIQ phases owner-accepted.**

**Problem:** Even a clearly labeled non-causal, sample-grade observational association can mislead if the app shows only selected associations. There are multiple registered pair definitions, but the owner previously could not see how many were screened before the top-three goal-relevant shortlist appeared. An apparently strong correlation chosen from many candidate definitions is not independent replication or evidence of statistical significance.

**Change:** Use the existing Health Intelligence relationship results *without running new searches, correlations, significance tests, or adjusting selection thresholds*. Record the actual number of definitions present in the snapshot, how many satisfied the pre-existing `available` plus moderate/high matched-pair-grade display filters, how many also related to active goal signal keys, and how many were actually shown after the three-card cap. Surface one concise disclosure in the Goal Overview's already-collapsed Observed Relationships panel; explain that sorting is by matched-pair grade and count (not correlation magnitude), selecting from several candidates can make patterns appear more convincing than they are, and these counts do not constitute multiple-comparisons correction, significance, independent replication or predictive validation. A missing panel or goal does not manufacture relationships. Original rho, day-to-day sensitivity, relationship summaries, confidence grades and source coverage remain unchanged.

**Tests:** The 10-definition fictional snapshot with one qualifying goal-relevant relationship reports 10/1/1/1. A synthetic five-qualified/four-goal-relevant case displays three and discloses 10/5/4/3, while existing weak/evidence-insufficient relationship tests remain guarded. No migrations, AI/Gemini/provider calls, owner-record modifications, production deployment or merge to `main`.

**Remaining:** Proper pre-reviewed statistical multiple-comparison uncertainty design, autocorrelation and trend controls, confounder-aware modeling and independent validation; source freshness and owner-mobile QA. Migration `0054` remains unapplied and requires separate owner-approved production preflight.


## PIQ-1.6 — Descriptive direction contrast and impossible-date guard (2026-10-15)

**State:** Work-branch change requiring full CI and authenticated owner mobile acceptance. **0/9 PIQ phases owner-accepted.**

**Interpretation gap:** The existing Goal Overview evidence details displayed the original Spearman rank coefficient beside its descriptive consecutive-day first-difference coefficient. When an apparently strong overall association reverses sign day-to-day, the owner had to infer that discrepancy from the two numbers; the product did not explicitly warn about it. Meanwhile matched-date clustering accepted a syntactically shaped but impossible date such as February 30.

**Bounded contract:** Add a *display-only direction comparison* for already-selected observed relationships. Valid, finite, nonzero Spearman coefficients within [-1, 1] with at least six existing eligible day-to-day transitions are labeled as **opposite signed directions** or **matching signed directions**. Zero, null, out-of-range and sparse comparisons are unavailable—not a claim of no relationship. The panel explicitly warns that near-zero signs are unstable, opposite/same signs do not establish significance or causal effect, and neither justifies changing a health target. Date clustering now validates actual calendar dates before calculating its consecutive-day runs. No new correlation, evidence thresholds, ranking, clinical inference, automatic action, provider/Gemini calls, DB migration or owner record mutation.

**Verification:** Pure cases for reversed/matching/null/zero/out-of-range/too-few comparisons; UI SSR for the opposite-sign warning and unavailable fallback; calendar cases for impossible February dates and valid month-boundary runs. Existing observational, provenance, sampling and selection-bias tests remain in force.

**Remaining:** Formal trend/autocorrelation uncertainty and multiple comparisons require separately reviewed statistical design; canonical event-level freshness, owner real-data/device review and the 0054 production migration remain release gates. Work branch only; do not merge to `main` without approval.


## PIQ-1.6 — Paired-date availability and observation-selection caveat (2026-10-15)

**State:** Bounded PIQ branch work, full CI and owner mobile QA required. **0/9 phases owner-accepted.**

**Gap:** Even after disclosing the number of matched dates, rank coefficient, coverage, date clustering and selection count, Goal Overview still did not state how many dates in the *source observation window* could have formed an X-to-Y pair at the registered lag. Thus 16 observed pairs could be misread as complete coverage or representative sampling.

**Contract:** For already-selected, observational relationship explanations, derive calendar-alignment opportunity: count X anchor calendar dates for which the lagged Y date also lies within the source observation window, report actual matched pair count and the remaining calendar slots. Name unmatched slots **unpaired dates**, not confirmed missing logs, skipped days, zeros, symptoms or owner nonadherence. Explicitly warn that a paired subset can be selected by which dates are recorded and can differ from unmatched days. A lag of one day has one fewer calendar-alignment slot than a same-day pairing over the same finite window. Require actual calendar dates, valid lag alignment and range, unique X anchors and agreement with the measured pair count. Inconsistent provenance shows unavailable window, clustering, daily sensitivity and pairing opportunity, instead of presenting fabricated precise date metadata. Original correlation, pair-count grade, eligible relationship shortlist, screening order and Coach advice remain unchanged.

**Regression:** Derive 16/28 same-day pairs and 16/27 lagged pairs from fictional dated observations; verify distinct unpaired counts, SSR non-zero/causality language, and failure-closed cases for mismatched counts, duplicates, impossible/future dates, incompatible lags and source windows. Does not query owner sources, change real logs, run a new statistic, invent complete days, consume Gemini/provider budget, add schema migration or deploy/merge to main.

**Next:** CI and authenticated owner evidence-drilldown QA; PIQ-1 release still gated by owner acceptance and production schema 0054's backup/preflight. Broader longitudinal selection-bias correction, source event revisions, confounding and formal statistical inference require separately reviewed designs.


## PIQ-1.6 — Verify paired dates against original observations (2026-10-15)

**State:** Work-branch PIQ-1.6 bounded correction, awaiting automated CI and owner authenticated device review. **0/9 owner-accepted phases.**

**Why:** Goal Overview's observational relationship evidence already verified date syntax, source-window alignment, lag, uniqueness and reported matched count, but could show an apparently verified pairing window even when a cited X or Y reading had disappeared, was misdated, duplicated or was nonfinite in the exact underlying Health Intelligence daily frame.

**Change:** Before exposing pairing opportunity, matched window, date clustering or adjacent-day sensitivity, verify every cited pair against *both actual finite source signal observations* at their reported dates and exact keys. Reject malformed or duplicate frame dates. Unverifiable readings fail closed to unavailable observational date diagnostics; do not replace with zeros, assert skipped logs, invent complete days, or rerun correlations. Keep the original registered relationship, source coverage, count grade, screening order, coefficient and three-card limit unchanged, but visibly state the pairing provenance could not be verified.

**Tests:** Canonical fictional observed pairs retain existing 16/28 availability. Missing Y value, a signal whose internal date conflicts with its frame date, nonfinite value, repeated frame date, empty/forged pair metadata all withhold precise pair diagnostics. Unrelated non-relationship evidence is unchanged. No owner records, migrations, main promotion or Gemini/provider calls. The separate unapplied migration `0054` still requires owner approval and live duplicate preflight.

**Remaining:** Canonical event-revision validation for retrospective source changes, formal clinical/statistical calibration and owner device validation. This is a provenance check, not a statistical significance or causal inference upgrade.


## PIQ-1.6 — Association coefficient reproducibility from cited paired readings (2026-10-15)

**State:** Bounded work-branch change pending full CI and owner-authenticated device review. **0/9 phases owner-accepted.**

**Integrity gap:** Earlier paired-date provenance checks verified that matching finite X/Y readings exist at every cited date. A source reading could nevertheless be edited to a different finite value, leaving the old aggregate Spearman coefficient and categorical strength apparently verified against those readings. Date existence alone does not establish coefficient provenance.

**Contract:** Independently reproduce Spearman rho from the exact cited paired X/Y frame observations, with the registered tie-aware rank method. Require a finite, bounded original rho and agreement to 1e-10 numeric tolerance. This is a *verification check*, not a new candidate computation, re-ranking, substitute coefficient, effect-size estimate or change to selection criteria. If the originally reported rho cannot be reproduced, preserve its original snapshot history and candidate screening counts but withhold the current numeric coefficient, association strength, precise paired dates, calendar opportunity, clustering and adjacent-day sensitivity; mark the displayed count-grade unknown and label the relationship historical/unverified. Never infer missing logging, zero physiology, causal effect, trial independence or a reason to modify a health target. Source detail links remain available for inspection.

**Tests:** Synthetic 16-pair valid readings, tolerance, falsified/out-of-range/nonfinite reported coefficient and a finite changed reading that retains all cited dates but invalidates the old rho, with server-rendered safe unavailable explanation. Existing source date, lag, missingness and selection-bias regressions remain in force. No additional provider/Gemini calls, DB migration, raw owner data mutations, production promotion or `main` merge.

**Still open:** Canonical event-level freshness outside the loaded source snapshot, formal statistical uncertainty/confounding/multiple-testing correction, owner mobile review, and the production backup/duplicate preflight for unapplied migration `0054`. A reproduced observational coefficient still does not establish causal, clinical or statistical validity.


## PIQ-1.6 — Consistent observational relationship labels (2026-10-15)

**State:** Bounded work-branch implementation; independent CI and authenticated device QA required. **0/9 phases owner-accepted.**

**Integrity gap:** A reported Spearman coefficient could be exactly reproducible from all cited readings, yet its precomputed strength or positive/negative label might disagree. Goal Overview previously displayed the inconsistent labels as verified, potentially changing the owner's interpretation even when the numeric source matched.

**Contract:** Check the *reported* strength category against the existing canonical association-strength thresholds and the *reported* direction against the original Health Intelligence small-coefficient neutral convention. This check is coupled to source-date, pair-count and tie-aware Spearman reproducibility: if any fail, withhold numeric rho, strength and precise pair/date diagnostics; label the association unverified, retaining the historical source and screening counts for context. Do not silently replace a label, reinterpret medical meaning, select a different coefficient or re-rank a relationship. Verification requires no additional query, Gemini calls, canonical writes, schema changes or production deployment.

**Regression:** Valid synthetic observational relationship retains verified labels; metadata-forged strength or sign with an otherwise reproducible rho is withheld, SSR discloses the inconsistency, and invalid original coefficients fail closed. Existing changes to physical readings, dates, missingness, trend sensitivity and selection screening remain guarded.

**Still open:** Upstream source-revision atomicity, empirical uncertainty / multiple testing / confounding, authenticated owner mobile QA, and separate release authorization for unapplied migration 0054. No `main` merge or production change.


## PIQ-1.6 — Revalidate confirmed nutrition days before interpreting recorded relationships (2026-10-15)

**State:** Bounded PIQ-1.6 work-branch correction, pending full CI and owner-authenticated QA. **0/9 phases owner-accepted.**

**Failure:** An already-computed protein/fiber relationship could pass date and exact coefficient verification when an owner revoked whole-day nutrition completeness for one cited date, since the numerical reading and its timestamp were unchanged. A reproduced observational rho alone cannot requalify that day's inclusion.

**Contract:** Before displaying any selected observational relationship's precise coefficient, strength, pairing window or sensitivity, verify every cited nutrition X/Y observation in the loaded frame still has `dayCompleteness='verified_complete'`. Missing or `unverified` confirmation invalidates only that relationship's present interpretation, not the original numeric snapshot or canonical food entries. Preserve its historical measured pair count and source links while marking present confidence unknown and withholding precision. No nutrition restrictions added to unrelated sleep, wellness, activity or Training pairs. Never convert an absent confirmation into zero intake, fabricate observations or infer cause.

**Regression:** Synthetic 16-pair next-day protein/soreness association remains eligible with complete owner confirmations. Revoking a single source date's confirmation while leaving finite readings, timestamps, and the tie-aware Spearman rho unchanged withholds source-derived precision and clearly explains the eligibility failure. Unrelated non-nutrition pairs remain unaffected. No schema migration, owner record mutation, Gemini/provider request, or production merge. Next: green CI, then further work on source revision atomicity and confidence-calibration thresholds.


## PIQ-1.6 — Source-reliable nutrition evidence in observational explanations (2026-10-15)

**State:** Bounded work-branch implementation, requires full CI and authenticated owner device QA; **0/9 PIQ phases owner-accepted**.

**Gap:** A protein/fiber relationship could retain its exact source date, value and reproducible Spearman rho after a nutrition log was reclassified as estimate-heavy or of unknown evidence quality. The day remained explicitly marked complete, so a completeness-only check still portrayed the recorded association as verified; whole-day completeness is not the same as source reliability.

**Contract:** At Goal Overview read time, every cited nutrition X or Y must still have both `dayCompleteness='verified_complete'` and `quality='high_confidence'` with owner/reference/mixed trusted-source provenance. Missing, mixed-quality, estimate-heavy, unknown/legacy and AI-derived nutrition observations fail closed. Withhold the presently interpreted coefficient, association strength and precise matched-date diagnostics; label the relationship unverified, without altering historical numeric snapshot, recorded foods, screening/ranking/selection or recommendations. Unrelated sleep, activity and wellness pairings are unaffected. The existing canonical `nutritionDayQuality` determines reliability; no extra model call or new inference is made.

**Tests:** Fictional 16-pair protein/soreness source retains precise interpretation when complete and reliable; revoked day, estimate-heavy, mixed-quality, unknown provenance and missing quality metadata with unchanged observed dates/values all withhold numeric rho and provide a transparent UI explanation; a nutrition Y-endpoint is checked too. No owner-data reads or writes, migration, Gemini usage, or production/main promotion.

**Open:** Event-level source revision atomicity, CI, authenticated device review, uncertainty/confounding design, and the owner-gated production migration 0054 backup and duplicate preflight. Source trust rechecks do not establish causality or treatment efficacy.


## PIQ-1.6 — Exact loaded-snapshot as-of consistency for observed relationships (2026-10-15)

**State:** Bounded work-branch implementation requiring full CI and authenticated owner device validation. **0/9 PIQ phases owner-accepted.**

**Gap:** Exact source pairs, coefficient, labels, nutrition completeness and reliability could all verify within a previously loaded Health Intelligence snapshot, even when Goal Overview was being built for a later health date or malformed/future-dated observation window. Reproducing a historical association is not evidence that the current Health date's reading is valid.

**Contract:** Before treating a selected observational association as currently reproducible, verify that the snapshot's `asOf` exactly matches Goal Overview's requested `asOf`, both dates of the source window are real calendar dates, the window is ordered, and its end is not after the requested date. A previously reported relationship remains available for historical inspection, but source-date mismatch or invalid window withholds current rho, strength, precise pair coverage, clustered dates and adjacent-day sensitivity. A distinct disclosure says the source snapshot belongs to another date or has an invalid window; it does not accuse the owner of logging failure or infer a changed clinical effect. Other Goal Control state, existing relationship ranking and screening counts, and canonical observations are unchanged.

**Regression:** A verified fictional 16-pair protein/recovery relationship survives a matching as-of snapshot. An older as-of snapshot with identical finite observations and the same computed correlation is labeled historical with all precision withheld; impossible February, reversed and future-ending windows fail closed. Separate observational, numeric, quality, and statistical-caveat tests remain intact.

**Limit:** This is an *in-memory loaded snapshot context* guard, NOT proof that underlying SQL source events could not change during or immediately after multi-query reads. Canonical event revision atomicity, multiple-comparison calibration, owner mobile QA and unapplied migration 0054's owner approval remain open. No Gemini requests, schema changes, production actions, real health record writes, or `main` merge.


## PIQ-1.6 — Calendar frame consistency for observed relationships (2026-10-15)

**State:** Bounded PIQ work-branch change; full CI and authenticated owner review pending. Owner-accepted phases: **0/9**.

A reproducible correlation based on cited X/Y readings is insufficient if the loaded Health Intelligence frame itself omits, duplicates or reorders a day outside those citations. Goal Control now checks the expected 30-day range, the declared integer day count, and that every row advances exactly one valid calendar date from the source period start through end. If the frame is inconsistent, retain the historical relationship and its source links but withhold present rho, strength, pairing opportunities, clustering and sensitivity. No source values are fabricated or changed.

Synthetic 16-pair regressions mutate the frame and day count while preserving the exact coefficient and prove the display fails closed. This is an in-memory consistency check, not proof of atomic SQL reads. No migration, Gemini, production writes or `main` merge. Outstanding: CI, mobile QA, canonical DB source-revision atomicity, statistical uncertainty, and owner-gated migration 0054.


## PIQ-1.6 — Single-pair influence on observed relationships (2026-10-15)

**State:** Bounded work-branch implementation awaiting full CI and owner-authenticated mobile QA; **0/9 phases owner-accepted**.

**Failure mode:** A small, selected observed correlation could display an impressive original Spearman coefficient without indicating whether one unusually influential matched date pair determined the reported direction. The existing first-difference and date-clustering disclaimers do not answer this distinct sensitivity question.

**Contract:** For a *fully source-verified* 30-day association with 10–31 original matched pairs, calculate the same tie-aware Spearman rank coefficient after deleting each matched date pair once (leave-one-pair-out). Display the resulting minimum/maximum rho and flag whether any deletion changes positive/negative/near-zero direction under the existing descriptive 0.05 neutral threshold. If a deletion leaves an undefined coefficient (including a constant series), report the influence result **unavailable**, not falsely stable. The original coefficient, selection, evidence-coverage grade, source rows, recommendations and matching dates remain unchanged. If upstream snapshot, coefficient, nutrition quality, or source-date verification fails, do not display the removal range.

**Meaning:** This is an exploratory influence disclosure **not** a confidence interval, statistical significance test, adjustment for ten screened candidate definitions, independent sample estimate, causal proof, or permission to change an intervention. A stable leave-one-out range does not rule out serial dependence, missing-not-at-random logs, shared confounders, or trends.

**Tests:** Synthetic matched-date data where the leave-one-out descriptive sign changes; strictly ranked data with no sign change; a series that becomes constant after omission; and UI integration that withholds numeric influence after a stale source snapshot. No migration, Gemini/provider call, production owner-data write or `main` promotion.

**Still open:** Source-revision atomicity across SQL reads, uncertainty under serial dependence, multiple-testing correction or abstention, verification of current owner data on a real device, and separately gated production migration 0054.


## PIQ-1.6 — Progressive disclosure for observational relationship evidence (2026-10-15)

**State:** Bounded work-branch UI change requiring green CI and authenticated owner device QA. **0/9 PIQ phases owner-accepted.**

**Problem:** PIQ-1.6 provenance and statistical integrity checks accumulated a dense wall of technical explanations for each observed relationship. That defeated Coach/Goal Overview's intended at-a-glance usefulness and could make evidence grade, observational rho, and intervention guidance appear interchangeable.

**Contract:** Keep Goal Overview's top-level `Observed relationships` disclosure closed as before, and inside it display each relationship's *observed summary*, loaded-source verified-versus-historical status, matched/date-pair count, and a specifically named non-statistical count grade. Preserve the visible fail-closed warning if the source isn't verified. Move screening-selection diagnostics and each relationship's long-form coverage, original Spearman coefficient, clustering, time-difference comparison, single-pair sensitivity, window, and per-source provenance into independent **closed-by-default native `<details>`** panels. Keep source review links directly reachable from each card. No science/safety information removed; no change to upstream evidence eligibility, coefficient, model prompts, ranking, interventions or stored historical owner data.

**Regression:** Existing factual synthetic 12-pair SSR validates verified and invalid historical associations; add assertions that the compact default status remains visible, both in-card technical detail and selection rationale use closed native disclosures, the unverified warning stays outside the technical panel, and the original sensitivity calculations and links remain in SSR output. No new schema, provider call, prod data write or `main` merge.

**Still open:** Actual owner iOS readability/accessibility acceptance, source-event revision atomicity between SQL reads, formal temporal-dependence/multiple-testing interpretation, and approved production migration 0054 preflight. Next: finish CI for this branch-only UI slice before advancing PIQ program phases.


## PIQ-1.6 — Registered relationship screening metadata verification (2026-10-15)

**State:** Bounded PIQ work-branch change awaiting full CI and owner-authenticated device QA. **0/9 phases owner-accepted.**

**Failure:** Goal Overview could faithfully reproduce a reported Spearman coefficient and cited dates while its accompanying definition had drifted: the stated X/Y signal pair, lag, original minimum matched pairs, display threshold, `available` status or count-derived grade might no longer match the canonical registered relationship. A reproducible historical number alone must not certify the present interpretation.

**Contract:** Before exposing present-tense observational rho, strength or precision, verify the saved relationship ID still identifies the current canonical X/Y signal pair, lag, required minimum count, minimum observed pairs, 0.2 absolute-rho display floor, `available` state and source count-based grade. Reuse the same in-memory registry and count-grade function that create the source association, rather than reimplementing threshold magic numbers in Goal Control. The existing exact pair coefficient, source quality, nutrition completeness, source-window, label and calendar-frame checks remain mandatory. If screening metadata no longer qualifies, retain its old summary and links as historical/unverified, but withhold the numeric coefficient, grade, pair opportunity and sensitivity diagnostics. The UI explains that the screening definition/grade did not verify; no owner input or canonical evidence is changed.

**Regression:** Synthetic 16-pair association matches the registry and remains verified. Mutate only the required-pair threshold or grade with identical source values and rho: numerical interpretation must be withheld in domain output and SSR. Pure negative checks cover stale relationship ID, X/Y keys, lag, non-integer pair count, below-minimum count, display state and insufficient rho. This is a read-time defensive consistency check, not independently valid uncertainty estimation or atomic source-revision evidence.

**Outstanding:** Canonical SQL source-event revision atomicity, adjustment for serial dependence and multiple screened candidate relationships, authenticated mobile QA, and owner-gated production migration 0054. No Gemini calls, new migration, production writes or main promotion in this task.


## PIQ-1.6 — Cited source-coverage and provenance reconciliation (2026-10-15)

**State:** Bounded PIQ work-branch change; full CI and authenticated owner-mobile QA required. **Owner-accepted PIQ phases: 0/9.**

**Gap:** The Goal Overview relationship checks already verify each cited date pair, exact Spearman coefficient, registered screening definition, nutrition source quality and loaded frame context. However, its displayed X/Y source coverage could still have an inconsistent total, count-grade, label or provenance breakdown while the original rho remained reproducible. This creates false evidence precision without changing observations.

**Contract:** For each cited X/Y signal, independently reconcile the current loaded frame with exactly one source-coverage row. Verify the canonical signal label, eligible and observed day counts, available coverage percentage, source-confidence count grade, and exact counts by provenance. When available, separately recheck logged nutrition days against the frame, using explicitly verified-complete dates for the eligible subset. Externally supplied excluded-observation counts are checked for nonnegative integer shape but **cannot** be independently proven from the loaded frame. A missing, duplicated or mismatched cited coverage record withholds present-tense observational rho, strength, pair opportunities, sensitivity and source statistics, with a clear unverified message. Preserve the historical summary, direct source review links and unrelated Goal Overview content. Unrelated source coverage metadata cannot disqualify a valid X/Y association.

**Regression:** Synthetic source frames for 16 matched sleep/energy and verified protein/soreness pairs; mutate a count, eligible days, percentage, provenance, source-confidence grade, label, invalid excluded count, missing/duplicate row and nutrition logged-day count while leaving the original rho untouched. The UI must avoid presenting any of those as verified numeric evidence and retain source links. Separate SQL source-event revision atomicity is **not** established, and this is not statistical inference, causal evidence, or provider-based evaluation.

**Still open:** Global multi-query source event revision consistency, temporal dependence and multiple comparisons, authenticated mobile QA, separately owner-gated production migration 0054 backup and duplicate preflight. No schema migration, Gemini calls, real health data writes or production/`main` promotion in this task. Next: verify TypeScript/lint/Vitest/build and update the ledger with the exact CI run.


## PIQ-2.1 — Structured owner-selected physiological reference sex (2026-10-15)

**State:** Bounded work-branch implementation awaiting both complete CI lanes and authenticated owner QA. **0/9 PIQ phases owner-accepted.** This can be built in parallel with PIQ-1.6 research quality; it does not bypass earlier release gates.

**Goal:** Sex-dependent formula and reference context must come from an explicit owner-editable field, rather than AI guessing from language, name or freeform history. Migration `0055_profile_physio_sex.sql` adds nullable `health_profile.sex_for_physiology` with permitted values `male`, `female`, `other`. Every instance starts NULL; **no account is automatically marked male**. Settings Health Profile shows a clearly separate reference-sex selector with unset and individual-review options; this is not gender identity. PUT preserves the stored value if a caller omits it, accepts an explicit NULL to clear, and validates unknown values before SQL. The schema and portable/full backup inventory include the new column.

**Ask Health boundary:** Only current-date Ask Health packets include this explicitly saved fact, linked to Settings and labeled owner-entered physiological-reference context. An unset value yields no sex-based evidence; `other` directs individual review rather than fabricating a binary formula input. Existing numerical calculations are **not silently changed** and do not infer sex. New tests cover schema defaults/constraints and read/clear semantics, preservation of omitted fields, Ask Health evidence, and historical-date non-leakage.

**Release and privacy gate:** Migration 0055 depends on prior unapplied 0053/0054 in the verified schema chain; owner production backup/preflight and explicit release approval are still required. This commit contains no owner-health-profile changes or provider calls. After a reviewed deployment the owner can select the correct value in Settings. Cross-domain sex-specific calculations and clinical reference handling need separate explicit formula audits; simply storing this field does not validate an equation. PIQ-1.6 source-event atomicity and owner-mobile review remain open.


## PIQ-2.2 — As-of age and current-height Ask Health evidence (2026-10-15)

**State:** Bounded PIQ work-branch implementation requiring TypeScript/lint/Vitest/build and authenticated owner QA. **0/9 phases owner-accepted.**

**Gap:** The owner already saves date of birth and height in canonical Health Profile, but Ask Health's clinical packet omitted both. Explanations requiring age, reference ranges, BMR or height could unnecessarily claim missing data, ask repeated questions or infer profile facts.

**Contract:** Read the existing owner profile once. For questions that actually mention age/birth, height, BMI/BMR, metabolism, calories, reference ranges or profile, provide the stored DOB as explicitly owner-entered evidence, plus age **derived only for the selected calendar as-of date**, with distinct evidence ids and provenance. Supply stored height in centimeters **only for today's as-of date**, because the current singleton profile provides no historical measurement timeline. Historical queries may backcast DOB to compute age with explicit text that today's profile is not proof the value was stored at the time; they do not inherit current height, sex-reference selection, medications, conditions or allergies. Before-birth and future requests do not get backcast demographic evidence. Unset values remain absent; unrelated education queries do not unnecessarily include this demographic context. No extra database read, schema migration or AI request is required. The packet's existing evidence fingerprint includes these additions and invalidates equivalent cached answers when the saved DOB/height changes.

**Scope intentionally left open:** A compact user-facing “What Health knows about me” listing fields, sources, date and edit link; formally effective-dated clinical/height history; source-event transactional consistency across multiple SQL reads; and audit of which clinical formulas should consume sex/age/height. Existing Ask Health clinical profile behavior from PIQ-2.1 is preserved. Tests use synthetic owner profiles and selected historical/current dates. No production, provider or real owner-data write; no `main` merge. **Next:** validate CI for this bounded slice, then add profile visibility/edit links without broadening history claims.


## PIQ-2.2 — Collapsed "What Health knows about me" in Ask Health (2026-10-15)

**State:** Owner-facing work-branch UI slice; full CI and authenticated mobile owner QA required. **0/9 PIQ phases owner-accepted.**

**Contract:** Ask Health now offers a compact, closed-by-default "What Health knows about me" panel. Only after an explicit user expansion does it load the authenticated owner Health Profile. It lists saved DOB, derived current age, current height, owner-selected physiological reference field (including "individual review"), dietary/training/persistent context, protocol, and counts of saved conditions, allergies and medications. Unset fields visibly say "Not set"/"Not recorded" rather than being inferred. The panel labels **the entire source** as the saved owner-controlled Health Profile, shows its actual updated timestamp if known, links directly to Settings > Health Profile for correction, and warns that today's clinical context is not historical evidence. Reopening fetches anew; failure offers retry rather than displaying a guessed profile. It neither collects nor saves any new health fact.

**Tests:** Server-rendered collapsed state must expose no personal profile details, synthetic known-data and unset-data summaries must retain source values/derived-age distinctions. No schema/provider call in test, no automatic profile read on initial render, no production mutation or `main` merge.

**Still open:** On-device interaction, validation of the owner's actual profile selection after approved production migration 0055, source-event revision atomicity, audit of clinically appropriate formulas and effective-dated medical history. PIQ-2.2 full owner acceptance remains gated.


## PIQ-2.3 — Owner-selected primary recorded goal, effective-dated v1 (2026-10-15)

**State:** Bounded PIQ work-branch implementation; full CI, disposable PostgreSQL and owner device acceptance required. **0/9 PIQ phases owner-accepted.**

**Gap:** Previously Goal Control and Coach could promote a weekly focus from coalesced signals without knowing which of the owner's *recorded active goals* was primary. The app lacked any affirmative, date-scoped priority record. An inferred weight or workout goal must never masquerade as owner intent.

**Contract:** New migration `0056_primary_goal_intent_events.sql` creates an append-only owner-source priority history with a unique integer revision, optional UUID of a saved active goal, effective Health date and recording timestamp. No rows are seeded, so every new and existing owner has an explicit **unset** default. Goals shows a small primary-goal selector over currently active, unarchived goals; saving requires an expected revision and creates one event. Explicitly clearing the priority creates an event with a null choice. The single-statement insert checks the latest revision and active goal identity; a concurrent revision uniqueness collision becomes a safe 409. Past records retain their goal UUID even if a goal is later archived or deleted; historical as-of reads use only effective-on-or-before owner choices. A stored preference is portable in the full and portable backup inventories. PUT/GET is owner-authenticated at `/api/goals/priority`.

**Deliberate limit:** This stores and shows the owner's chosen **existing measurable goal**; it does not yet encode a complete lifestyle mission such as “lose fat while preserving strength,” non-negotiable restrictions, secondary objectives, planned phase, or acceptable trade-offs. It does **not** automatically re-rank Coach or modify health targets. Those require explicit evidence-aware integration and owner acceptance in later PIQ-2.3 slices. The UI discloses this. No background writes, Gemini calls or inferred primary objective.

**Verification:** Domain tests cover unset, future/history leakage, multiple same-day owner choices, clear, invalid selection and optimistic-write protection. Disposable PostgreSQL migration-chain tests verify real active-goal selection, stale-tab denial and as-of history with transaction rollback. Full TypeScript/lint/Vitest/build, backup round-trip and authenticated phone QA remain the current commit's gates.

**Release gate:** Migration 0056 follows unapplied PIQ migration 0053–0055. No production migration or main promotion without explicit owner approval, schema and backup review, and acknowledgement that the new priority is a deliberate fresh owner selection, never a backfilled assumption.


## PIQ-2.3 — Explicit primary goal breaks ties between already-qualified reviews (2026-10-15)

**State:** Bounded branch-only implementation; full CI, authenticated iOS QA and owner acceptance required. **0/9 PIQ phases owner-accepted.**

**Gap:** Saving a primary measurable goal did not influence Goal Control at all; Coach could focus on another due goal without acknowledging the owner's explicitly recorded preference. Conversely, blindly promoting a priority risks fabricating advice, overriding a safety-dependent Maintenance decision, and resurrecting a completed/archived goal.

**Contract:** Goal Control reads the as-of owner priority event from the canonical append-only primary-goal history. Only when Weekly Coach's existing top focus is **already a qualified goal review**, the owner-selected goal is still active/unmet/due and its own exact, unique focus candidate is cited to that goal, the selected goal wins among those goal reviews. No candidate is invented or newly promoted from a mere goal label. A non-goal first action, missing source, stale/future owner selection, archived, satisfied, not-due or duplicate/mismatched evidence does not reorder Coach. Calorie, rest/recovery, completeness and experiment safety gates remain unchanged. Goal Overview identifies the owner's saved active primary goal and explicitly labels when it broke the ranking tie.

**Tests:** Synthetic baseline/cleared preference, two competing due goals, completed/archived/not-due/historical choices, non-goal focus, missing/duplicate/wrong citation and wired read/UI provenance assertions. No database migration, Gemini call, production read/write or `main` merge in this slice. The earlier owner-choice schema migration 0056 remains unapplied to production. Follow-up PIQ-2.3 work may model larger owner missions and constraint hierarchies, but must not infer these from a single measurable priority.


## PIQ-2.4 — Ask Health named supplement plans vs observed adherence (2026-10-15)

**State:** Branch-only bounded implementation awaiting full CI and authenticated owner-device QA. **0/9 PIQ phases owner-accepted.**

**Gap:** Ask Health exposed aggregate supplement adherence without distinguishing an individual recorded supplement's name, current lifecycle, planned amount/cadence, or actual saved taken/skipped/unknown occurrences. Questions like "What creatine dose have I recorded?" could receive unsupported guesses or an unhelpful group-level number.

**Contract:** Question-matched supplement names and explicit requests for the owner's saved supplement inventory now add at most four source-backed per-supplement evidence entries using the existing already-loaded, effective-dated supplement schedules, lifecycle events, and adherence records. Each states owner-recorded name, current-as-of active/paused/discontinued/unrecorded status, effective as-of planned dose/weekday cadence, and observed taken/skipped/unknown/paused occurrences within the selected range **clamped to asOf**. No scheduled or unknown dose is presented as taken; a logged taken occurrence is explicitly a self-report, not proof of ingestion or physiological effect. Irrelevant questions do not automatically receive itemized supplement lists. A matching named supplement can be retrieved even with the Training lens; no new SQL read, provider call, inferred owner fact, or schema migration. Historical status and future entries are never borrowed to justify past use.

**Regression:** Synthetic packet tests exercise a named creatine-like plan through Training with a future taken entry excluded, the no-question no-detail boundary, a paused vitamin with zero reported use, inventory wording, exact evidence IDs, dose and provenance. Existing aggregate adherence handling remains. CI and owner browser QA are mandatory before release; no `main` merge or production owner-data write.

**Still open PIQ-2.4:** Source-truth revalidation when schedule/status edits overlap asynchronous packet reads, generic ingredient alias matching, medication and supplement combined-effect cautions, proof of actual dose adherence beyond owner self-report, and explicit owner-promoted durable conversation facts (never auto-promote a past chat statement).


## PIQ-2.4 — Conservative named-supplement ingredient aliases (2026-10-15)

**State:** Bounded PIQ branch implementation, full CI and authenticated owner QA required. **0/9 phases owner-accepted.**

**Gap:** A question about "my creatine dose" failed to find the owner-saved product `Creatine monohydrate`, because itemized Ask Health evidence required the question to repeat the entire supplement display name.

**Contract:** Use one deterministic, token-boundary matcher for both cross-lens evidence routing and itemized evidence selection. Match the saved full name or the first sufficiently specific, non-generic ingredient token (at least six alphanumeric characters), rather than fuzzy substring matching of arbitrary product words. `creatine` can find both `Creatine monohydrate` and `Creatine HCl`; Ask Health must preserve both separate owner records instead of guessing which dose was meant. A generic "vitamin" or unrelated "creatinine" must not trigger a saved creatine regimen. The existing four-item maximum, recorded plan-versus-self-reported-taken separation, as-of range clamp and provenance remain unchanged. No extra SQL, provider call, schema migration, canonical data edits or `main` promotion.

**Verification:** Synthetic question-packet regressions cover principal ingredient, multiple formulations, the full Vitamin C name, a generic vitamin request, false substring match and unrelated queries. No claimed support for brand-name aliases, synonyms or medicine interaction screening; these still require explicit sourced terminology and safety review. Owner iOS QA and full CI remain required.


## PIQ-2.4 — Question-scoped saved medication context in Ask Health (2026-10-15)

**State:** Bounded branch-only change, full CI and authenticated owner-browser acceptance required. **0/9 phases owner-accepted.**

**Gap:** The current-day Ask Health evidence builder previously attached up to sixteen **all** owner-entered medications to every question regardless of topic. This needlessly exposed sensitive treatment details in unrelated general or Training questions while still providing no guarantee that a saved status meant actual ingestion.

**Contract:** Keep the existing current-day-only owner profile gate. Route medication evidence only when the question specifically mentions a saved medication by full name or conservative principal name, explicitly asks about *the owner's* medicines/prescriptions/interactions, or describes an owner-specific GI/recovery symptom where **active** medication background may matter. Named inactive records remain available but correctly labeled paused/discontinued; symptom-only questions do not pull old/inactive records. Preserve stable source indices and cap at eight names/symptom context or sixteen for an explicit medication inventory. Each selected item says "current owner-entered record", saved status and recorded dose/frequency only when present; it states that this is **not verified medication use** or evidence of causality. No medicine is diagnosed as a cause or inferred to be taken. Unrelated general explanations transmit no per-medication facts.

**Tests:** Synthetic Ask Health packet tests cover an unrelated bench-press question, general pharmacology, a named medication across lenses, explicit personal interaction/inventory question, current active personal constipation/bloating context, inactive history, false ingredient-like name and no causal/taken implication. No additional database read, schema migration, Gemini call, medical-profile edit, owner-data mutation or main promotion.

**Not in scope:** Interaction screening by a validated clinical database, prescription verification, medication start/stop dating beyond today's saved profile, and clinical confirmation of actual adherence. Separate owner iOS QA and provider evidence selection remain release gates.


## PIQ-2.4 — Question-scoped saved allergy context (2026-10-15)

**State:** Bounded branch-only packet selection slice; full CI and authenticated owner-device QA are release gates. **0/9 PIQ phases owner-accepted.**

**Gap:** Ask Health added every recorded allergy and reaction to every question, even unrelated general or Training questions. That over-shared private clinical context and could be misread as a verified allergy diagnosis.

**Contract:** Current-day owner-saved allergies are now selected only for a question that explicitly asks about the owner's allergy/reaction history, names an exact saved substance in a personalized question, or requests personal food, medicine or supplement guidance where exposure might matter. Broad general science and unrelated Training/recovery prompts receive no itemized allergy entries. Stable original record indices, saved severity/reaction (including unknown/null), owner-entered provenance and a Health Profile correction link are preserved. Each source explicitly says it is a current owner-entered record, **not** a verified diagnosis or proof of exposure. A personal meal or medication decision can receive relevant saved allergy context without requiring the owner to remember to mention allergies first.

**Tests:** New synthetic Ask Health evidence regression covers generic and unrelated privacy exclusion, exact name resolution without fuzzy allergy inference, explicit saved-inventory requests, personal food/medicine/supplement decisions, unknown severity and provenance, empty records and source index stability. No new SQL, external provider call, schema change, owner record mutation or main promotion.

**Remaining:** Conditions and undated persistent clinical text still need independently justified question-level minimization; validated allergen synonyms, interaction screening, time-versioned owner allergy updates and owner-verified clinical provenance are out of scope. PIQ-2.4 and earlier PIQ phases still require owner acceptance.


## PIQ-2.4 — Question-scoped saved conditions and profile notes (2026-10-15)

**State:** Branch-only implementation, full CI and authenticated owner iOS QA required. **0/9 phases owner-accepted.**

**Gap:** Ask Health transmitted all saved diagnoses and three undated free-text health contexts on unrelated questions, risking unnecessary private-data disclosure and unwarranted diagnosis or history assumptions.

**Contract:** Only a personal exact-name match or an explicitly personal condition/history inventory selects saved conditions, retaining original indexed IDs, active/resolved/unknown statuses, provenance, and profile correction links. Symptoms alone never imply a condition or retrieve unrelated diagnoses. Persistent general medical narrative is limited to explicit saved-profile/history questions; owner training/injury/recovery questions may receive training limitations; owner diet/GI questions may receive dietary context. Selection occurs in the existing current-date owner profile gate. Labels disclose owner-reported, nonverified and undated status; no causal inference is made. No additional SQL read, provider call, schema migration or source data mutation.

**Regression:** Six synthetic packet scenarios: unrelated privacy exclusion; exact named status and stable ID; owner condition inventory; no symptom-based diagnosis inference; category-specific narrative context; source provenance and no historical certainty. Full CI, owner device QA, PIQ source-revision atomicity, and already queued migrations 0053–0056 remain release gates. No production promotion or main merge.


## PIQ-2.4 — Owner-authored note review from Ask Health (2026-10-15)

**State:** Work branch only; CI and authenticated mobile QA pending. **0/9 PIQ phases owner-accepted.**

**Contract:** An opt-in action after Ask Health answers opens a blank, owner-authored 500-character field. Neither AI answers nor user questions are promoted automatically. The owner-authored text transfers via router state (never a URL parameter or provider call), and Settings shows an unsaved editable review with a required owner-confirmation checkbox. Stage into the existing 2,000-character persistent context without destroying previous notes, then independently press Save profile to actually write. Blank, duplicate and overflow notes fail. No auto clinical diagnoses, effective-dated history, or historical adherence invented. A client pre-save refresh detects common stale-tab conflict, but is not server-side atomic compare-and-swap; future PIQ-2.5 work must address this.

**Tests:** New unit cases validate private transfer, forged state, length, duplicate and overflow, with legacy I10 test now explicitly asking for owner-saved inventory. CI/owner device QA and the existing unapplied migrations are rollout gates. No new schema, model token, owner production write or main merge.


## PIQ-2.5 — Atomic Health Profile correction guard (2026-10-15)

**State:** Work branch only. Full CI, owner iOS acceptance, and migration rollout gates required. **0/9 PIQ phases owner-accepted.**

**Gap:** Previous profile PUT could overwrite a newer saved profile and its client-side check covered only the special Ask Health note-review workflow, leaving a race between checking and saving.

**Contract:** Every owner-authenticated profile PUT requires expectedUpdatedAt (GET updatedAt or explicit null for an absent singleton). A missing field yields 428 PROFILE_VERSION_REQUIRED; malformed values yield 400. Initial creation uses INSERT ON CONFLICT DO NOTHING; existing rows use atomic conditional UPDATE with version comparison, a minimum one-millisecond version advance and a 409 PROFILE_STALE_WRITE on conflict. Supplied-field masks distinguish untouched values from deliberate clears. Settings passes its originally loaded version, retains unsaved edits on conflict and offers an explicitly destructive reload. The old note-specific preflight is removed. No migration or Gemini call.

**Synthetic tests:** Eight new cases cover missing/bad version, first-time create, simultaneous initialization failure, conditional SQL update, stale-edit rejection, explicit clears versus omitted fields, and future birth date validation.

**Open:** Full CI validation, authenticated iPhone and concurrent-tab QA, PostgreSQL integration-level concurrency test, granular canonical source correction flow, and minimal, question-efficient logging prompts. The earlier migrations 0053–0056 remain unapplied. No production record, main branch, or owner profile was changed.


## PIQ-2.5 — Question-efficient nutrition completeness clarification (2026-10-15)

**State:** Bounded work-branch implementation. **0/9 phases owner-accepted.** Full CI and owner iOS QA required.

**Decision relevance:** Rather than asking for health demographics or logging details on every prompt, Ask Health may display **one optional, deterministic, non-AI question** after an answer only when (1) the owner's question is personal, (2) it asks a nutritional/weight trend or consequential decision, (3) routed missing evidence specifically reports *logged calorie days but zero verified complete, source-reliable days*, and (4) source verification is available. No question appears for general educational, unrelated, pure event, no-log, under-sampled, or unavailable-verification cases. The prompt asks if past compared days were fully logged, explains why that changes the interpretation, and directs the owner to the existing Nutrition **Day log completeness** card. Marking complete or partial happens only through the existing canonical Nutrition workflow, **never** by asking/chatting. Confirmation does not independently verify nutrients.

**Respect consent and attention:** One surfaced item maximum, with Skip (this answer only), Ask later (until next local Health date), and Never ask again (browser-local until explicitly re-enabled). Preference storage contains only a generic rule identifier/next-day string, never health details, question prose or answers; demo surface preference is scoped separately. The UI transparently identifies browser-local scope and offers re-enable. No new DB columns, model calls, logging mutations or migration.

**Validation gates:** Deterministic pure tests for allowed and blocked question categories, source-data uncertainty, false-positive controls, skip/later/never semantics and storage scoping; full CI and authenticated mobile navigation / no-double-prompt QA remain pending. Other missing-context domains (hydration completeness, weigh-in protocol) and cross-device opt-outs are **not implemented**; do not imply PIQ-2.5 is fully accepted. Canonical correction workflows beyond existing Nutrition/Profile editing remain open.


## PIQ-2.5 — Owner correction through canonical source editors (2026-10-15)

**State:** Work branch only, full CI and authenticated owner QA pending. **0/9 PIQ phases owner-accepted.**

Ask Health now exposes a user-initiated, collapsed “Something wrong?” action for cited evidence. Only exact, supported owner Profile and Nutrition evidence IDs with known canonical paths produce an edit handoff. Derived, imported, generic intelligence signals and arbitrary server-supplied URLs do not become trusted write destinations. Health Profile routes to Settings with corrected #health-profile scroll behavior; Nutrition routes to the existing day entries and completeness review. Both source pages can display a save-first return banner. Only the canonical editor is allowed to persist a change; no AI statement, critique or profile fact is silently written.

The return uses validated React Router location.state (the original owner question plus selected lens/range), without putting the question into URL query params, localStorage, analytics or a new backend record. Returning to Ask Health restores an **unsent draft** and explains that a new Ask call is necessary to recompute using current canonical evidence. No automatic model request or asserted correction occurs. A separate “Draft a follow-up about the interpretation” action raises a question about AI reasoning but does not assert or store an owner fact. This is a narrow canonical workflow, not a universal record editor.

Regression suite covers exact profile/nutrition allowlists, unsafe/unknown path rejection, malformed and oversized route state, and no verified medical assertion in the follow-up draft. Full CI, authenticated navigation/mobile UX, source-save/re-answer end to end, live PostgreSQL multitab concurrency and broader canonical editor support remain release gates.


## PIQ-2.5 — Real PostgreSQL profile CAS and release-readiness checkpoint (2026-10-15)

**Status:** Work branch code validated; **0/9 PIQ phases owner accepted**. Last tested code commit d115aa820075af6d1f2383d9a8fdbd28424242ff. No production migration or main merge.

**Real SQL verification, not just mocked queries:**
- [Isolated PostgreSQL 16 workflow 38850472289](https://github.com/daurham/daurham-health/actions/runs/38850472289): **SUCCESS** at d115aa820. Replayed migrations 0001 through 0056 into a disposable schema. A new test calls actual server Health Profile read/write functions with two independent PostgreSQL clients, checking one-winner concurrent singleton insertion and same-version updates, stale HTTP 409 without overwrites, preservation of omitted fields, explicit null and array clearing, and increasing millisecond-visible timestamps. An optional SQL adapter injection exists only for this isolated test path; existing production calls still use getSql().
- [Full app validation workflow 38850472327](https://github.com/daurham/daurham-health/actions/runs/38850472327): **SUCCESS** at d115aa820 (TypeScript, ESLint, full Vitest suite, build).
- Neither workflow accessed owner records, production Neon/Vercel services, Gemini usage, or production calorie targets.

**Production identity still blocked, not inferred:** Connected Vercel listed the Health project, but deployment inspection returned HTTP 403 for its actual team scope, and no authenticated CLI fallback was available. Connected Neon project listing returned an empty array. The live deployment SHA, active database identity and applied schema_migrations filenames therefore remain UNKNOWN.

**Remaining release gates, ordered:** (1) Authorized read-only deployment SHA and production migration-head reconciliation. (2) Verified schema clone / migration and restore rehearsal with the actual target identified; no live migration without explicit owner approval. (3) Authenticated iPhone tests for Health Profile competing tabs, Nutrition corrections/day completeness, cited-fact source editor and save-then-reask behavior, primary goal and Coach safety. (4) Owner-scored true-answer quality, clinical-safety and cost baseline for PIQ-0/2 acceptance. Do not migrate, merge, change targets, or mark any phase accepted based solely on green CI.


## PIQ release readiness — fail-closed migration-history preflight (2026-10-15)

**State:** Branch-only release safeguard. **0/9 phases accepted.** Tested code commit f77f27837e0a0261069e99fe7098dc59188ace67.

The new command **npm run migration:preflight** uses read-only SELECT statements against PostgreSQL catalog metadata and schema_migrations filenames only; never samples personal health records, calls Gemini, changes tables, stores secrets, or applies migrations. It reports CURRENT, PENDING (including exact unapplied filenames), or BLOCKED (including the reason). Exit status: 0 current; 2 pending (review required); 1 blocked/unreadable. A pending prefix is **not** permission to migrate. Driver errors are not printed because they could expose connection strings.

**Production migrator defense:** The existing npm run migrate now checks the same report **before issuing CREATE TABLE or any migration writes**. It refuses out-of-sequence histories, missing-middle migrations, unknown/future entries, duplicate or nonconsecutive repository numbering, backup inventory head mismatch, and a populated schema lacking credible migration history. An entirely empty schema can still bootstrap; an exact tracked prefix can still continue. This is a safety check, not a concurrent-migrator lock or substitute for backup/rollback.

**Verified:** [Isolated PostgreSQL CI 38851338365](https://github.com/daurham/daurham-health/actions/runs/38851338365) **SUCCESS**. The full 0001–0056 migration-chain test validates read-only catalog inspection and intentionally deletes 0054 from its fixture history to prove fail-closed gap detection; transaction rollback restores test state. Pure regression tests cover a valid exact prefix, unexpected migration, missing-middle history, untracked occupied schema, empty bootstrap, numbering/head divergence, and SELECT-only behavior. [Full application CI 38851338346](https://github.com/daurham/daurham-health/actions/runs/38851338346) **SUCCESS** (tsc, ESLint, Vitest, build).

**Still blocked:** Live Vercel target inspection is forbidden under the available scope; connected Neon project list remains empty. The production migration head, Git serving SHA, DB identity, backups, and authenticated owner mobile QA remain unknown. Do not run migrations, promote main, declare PIQ phase acceptance, or trust branch fixtures as owner runtime verification. Before asking the owner to run this command, verify that it points to the intended target with read-only credentials, and do not request that DB URLs or passwords be pasted into chat.


## PIQ-2.5 correction re-ask cache + controlled mobile acceptance runbook (2026-10-15)

**State:** Work branch; 0/9 program phases owner-accepted; not deployed. New synthetic-only tests drive the real Ask Health evidence packet through the explanation/cache path, proving that changing the saved height changes the evidence fingerprint and forces a fresh explanation; an unrelated profile note edit reuses the valid cache instead of spending another model call; and clearing the last saved personal fact does not replay a cached height claim. Provider responses are deterministic stubs, not real Gemini requests. These tests cannot prove network loader freshness, genuine prose quality, owner iPhone behavior or the actual production schema.

The owner test script lives in [PIQ_OWNER_ACCEPTANCE_RUNBOOK.md](./PIQ_OWNER_ACCEPTANCE_RUNBOOK.md). It distinguishes code/isolated-DB validation from six production identity/backup/preview gates, ten explicit iPhone acceptance scenarios and a small owner-approved private answer-quality sample. No real owner actions are marked complete and no migrations or main promotion are authorized. The connected Vercel deployment-scope 403 and empty Neon project listing are unresolved. Exact-commit CI validation for this new test still must be checked; no preemptive acceptance claim.


## 2026-10-15 — PIQ-3 first answer-quality and immediate safety work

**Status: branch implementation, not accepted. 0 of 9 program phases owner-accepted.** No main merge, live migrations, production Health data access or Gemini calls in CI.

PIQ-3.1/3.2: Added deterministic conservative question routing. Standalone educational questions (e.g. what creatine does) now bypass private owner evidence loading and previous conversation when answering, with a truly empty personal-evidence packet. Separate general prompt, cache version and metadata prevent general answers being represented as verified owner measurements. The usual rate/budget and AI usage ledger still apply; suspected invented owner-log assertions trigger bounded validation repair or a failure, not silent acceptance. Owner-specific goals/plans, symptoms, historical questions and ambiguous references stay in the owner path. T01's previously documented negative baseline is now a positive synthetic direct-answer regression. This is not complete semantic classification or live clinical validation.

PIQ-3.2 immediate safety: Narrow unambiguous first-person, present-tense emergency and self-harm assertions now receive deterministic local-emergency/support guidance before database reads or model calls. The UI and privacy-safe diagnostic mark it explicitly as immediate safety guidance; no user diagnosis or private evidence is asserted. Tests include urgent statements, negated/hypothetical/historical phrases, cost independence, no personal data reads and direct-call packet sanitization. This is a deliberately limited safety floor, not comprehensive medical triage and not suitable as the only emergency classifier.

New regression tests: piq3-general-routing and piq3-immediate-safety. Earlier CI found and prompted fixes for test lint, saved goal or training plan references crossing into the education lane, and plural headache symptom classification. The previously green baseline tests for known bad behavior were rewritten as positive fixed-behavior expectations. Exact-head CI is still required before calling this code validated.

Remaining: owner-facing authenticated phone QA, clinical expert review of emergency paths, evidence relevance, historical time windows, better personal explanations with missing facts, independent claim-source validity, research intent integration, and direct-answer quality review on approved real questions. Production Vercel/Neon access restrictions and no formal phase acceptance still apply.


## PIQ-3.3 — Question-matched canonical strength working sets (2026-10-15)

**Implementation checkpoint, not owner acceptance.** New pure selector in src/domain/ask-health/focused-training.ts reuses the already-loaded canonical training rows, and the Ask Health packet includes specific per-session comparable working-set data only for a uniquely identified owner-saved loaded-rep exercise. Full-name and conservative aliases have deterministic matching; ambiguous barbell/dumbbell bench names do not silently select one. Canonical analytics sessionStrengthPoint returns the best high-confidence Epley-estimable set per eligible session. Explicit selected range and asOf exclude earlier/later sessions, warmups, non-external load and incomplete bilateral data. At most six most recent eligible session appearances are included, with coverage of all eligible appearances, dates, owner-entered load/reps, source set ID, route to strength detail, and truthful derived-from-owner provenance. No new SQL query, schema migration, AI call or historical extrapolation. Packet freshness fingerprint changes with corrected set values. Tests: tests/piq3-focused-training.test.ts, targeting ambiguity, date bounds, source eligibility, set grouping, max packet sample and altered reps. This is a *bounded selection from existing in-memory canonical rows*, NOT on-demand typed DB query optimization; GI/fiber relevance and broader PIQ-3.3 retrieval remain future work. Validate current exact branch head in full CI before declaring code validated. Live source/API/iPhone and any clinical claims remain owner QA gates. 0 of 9 phases formally owner accepted.


## PIQ-3 — Explicit Context Mode control (2026-10-15)

**Status: implemented on the work branch, final exact-SHA CI and owner acceptance still required. 0/9 PIQ phases formally accepted.** Adds user-selectable modes **Smart**, **Personalized (default)**, **Deep Dive**, and **General Only** in Ask Health, with request-level validation, server-enforced routing, cache-key separation and explicit answer metadata. Smart retains automatic education-versus-owner evidence selection. Personalized always fetches owner context even for vague or standalone-education questions, including selected active owner-entered clinical context and broad evidence lens for general-looking requests. Deep Dive deliberately broadens cross-domain snapshot signals, health profile context and general evidence lens while retaining the selected calendar range, 24,000-character evidence limit, normal AI usage gate and explicit truncation visibility; it **does not send the entire database** or claim every saved record was considered. General Only never queries the owner packet or forwards personal conversation, even if direct callers provide a private packet. The urgent-safety deterministic path still overrides all modes.

The expandable “What Health AI considered” UI displays evidence domains, included item count and omitted candidate count. Model context itself now receives the evidence scope/truncation audit, preventing an impression of complete records when trimmed. Early deterministic missing-data and exercise-ambiguity paths preserve the selected mode in metadata. Correction-to-source-and-back navigation retains the original mode, including Deep Dive, without writing the question into a URL/storage. Changing mode clears conversation and displayed answer; mode cannot change while asking. Existing cost and caching protections are preserved; tests cover parsing rejection, privacy, deep versus personal profile scope, route override, cache isolation, general explanation with no owner evidence, no invented individual metrics, evidence truncation and correction-mode continuity.

**Open gates:** Full exact-branch-head CI, manual iPhone verification, owner-reviewed answer-quality sample, correct Vercel/Neon identity and controlled release approval. No migration, production edit, Gemini calls in tests or main merge. “All my data” continues to mean broad *available context within fixed limits*, not an unlimited dump. Next improvements should emphasize history-window correctness, selective source completeness, privacy tests and user acceptance.


## PIQ-3 Context Mode transparency and no-record safety follow-up (2026-10-15)

Work branch only; all nine formal owner acceptance gates remain unchecked. In addition to Smart, default Personalized, Deep Dive and General Only route enforcement, the authenticated Ask Health response now provides a **bounded manifest of at most 24 substantive facts actually supplied to Gemini**, with source domain, label, dates, source type and canonical in-app detail route. The expandable UI distinguishes evidence **cited by the answer** from evidence **provided as context only**; unlisted supplied-fact count and packet-trim count remain separate (a short evidence packet is not the full database). A deterministic missing-data, clarification or urgent-safety response does **not** claim those facts were transmitted to an AI: the UI labels that no AI request occurred and does not display them as model input. User-visible manifest does not duplicate raw numerical medical values; the owner already has cited evidence and authorized source links. It is returned only to the owner-authenticated API client.

General Only for a descriptive personal metric or trend now fails safe without even calling Gemini or querying personal data: it explains that this mode cannot verify the owner's records, and asks the owner to choose Personalized or Deep Dive. Explicit emergency messaging remains deterministic and higher priority. Tests on synthetic goal/profile fixtures cover request mode parsing, privacy and history scrubbing, no-record guidance, separate cache keys, budget enforcement, bounded manifest, provider scope, deep profile breadth, truncation disclosures and corrections preserving the original mode.

**Limits / gates:** Deep Dive currently means broader *available selected-range context*, not unrestricted history or full-database transmission. The 24,000-character context cap, source verifiability, current-versus-historical clinical profile caveats and AI budget controls still apply. The metadata counts supplied facts, not independently verified clinical findings or proof each supplied fact influenced generated prose. Final exact-commit application CI, real iPhone acceptance, quality/safety review, Vercel/Neon production identity and explicit owner release authorization remain necessary. No production migration, main merge, personal record update or Gemini call was performed by this development step.


## 2026-10-15 — Deep Dive opted-in recent digestive details for vague questions

**State: branch-only code slice; no formal PIQ phase acceptance (0/9).** As a continuation of the explicit Ask Health Context Mode work, Deep Dive now requests a bounded three-most-recent-observations sample for logged water, explicitly recorded bowel events and verified complete-day reliable fiber even when the question has no GI keywords. Smart and Personalized still require a relevant term to select these details, and their packet builder excludes unrelated digestive observation types for single-topic questions. General Only bypasses owner evidence loading entirely through the existing server-enforced guard.

Implementation reuses the canonical already-loaded intelligence snapshot, has no new SQL, migration, production write or model call from tests, and retains the 24,000-character packet cap plus truthful truncation/considered-facts manifest. Unverified food days remain excluded from measured whole-day fiber values; water event totals are not equated to all fluid consumption; missing bowel days are unknown rather than zero. The detail expansion is explicit owner opt-in, not a promise to send the full database.

Regression tests: tests/piq3-deep-context-evidence.test.ts covers a vague question selected with Deep Dive versus Smart/Personalized; no unrelated single-topic GI detail; and verified food coverage/limitations. Full exact-head CI and owner iPhone/real-model answer review must precede acceptance. Clinical answer correctness and total history coverage remain unproven.


## 2026-10-15 — Deep Dive selected-history disclosure and all-history shortcut

**State:** Development branch only. Owner acceptance remains **0/9 formal phases**; `main` and production unchanged.

Deep Dive is a broad *context mode*, not an automatic unlimited historical query. Previously the default 30-day range could silently limit a user's desired comprehensive analysis. Ask Health now explicitly warns about the selected 30d / 90d / 6m / 1y window when Deep Dive is chosen and offers a one-tap **Use all available history for Deep Dive** action. If All is already selected, it states that all available recorded history is in scope but **only a bounded packet** reaches AI, so some records can still be omitted. The ordinary range control remains available in every mode. Range changes clear old answer, conversation and error state; while a question is pending, window controls cannot change the in-flight request. Changing the range does not automatically invoke the model. Pure tests in `tests/piq3-deep-dive-history-window.test.ts` cover the finite-window labels, explicit All state, and absence of the shortcut outside Deep Dive.

This feature does not loosen the evidence-packet limit or AI monthly budget, make a new SQL query, change clinical records or migrations, or imply every record was analyzed. Full exact-head CI and owner iPhone check are required before code and UX acceptance. Production identity/backup gates remain unresolved.

## 2026-10-16 — PIQ-3.3 owner-entered stool-type evidence and topic-specific filtering

**State: validated engineering slice on the PIQ work branch only; 0/9 phases owner-accepted.** Application validation run [38864674408](https://github.com/daurham/daurham-health/actions/runs/38864674408) passed on code commit `095111ad732be6559dd1c9da1fefd7cb597344c2`: npm ci, TypeScript, ESLint, full Vitest suite, production build. A Vercel status separately reports an account build-rate limit; this GitHub Actions success does not represent a successful Vercel preview or production release.

Ask Health now retrieves recorded Bristol stool types (1–7) only for up to 60 canonical bowel-event IDs already referenced by the three most recently sampled bowel-observation days within the selected Health range. It joins IDs and dates before disclosing values; unrelated records, free-form notes and unsupported inferences are excluded. Partial types are labeled by available/selected source counts; explicit no-bowel entries remain zero with no fabricated stool type, while missing dates remain unknown. This adds one read-only query when a relevant bowel question or owner-selected Deep Dive has logged bowel events. It uses existing `0044_daily_signals.sql` columns; **no new migration**.

A single deterministic digestive-topic selector now drives both retrieval and packet inclusion. Personal/Smart water questions such as “Am I drinking enough?” receive water details without unrelated bowel/fiber detail; “poop” queries receive the recorded bowel evidence without unwanted water/fiber detail. Explicit constipation/diarrhea symptom requests may include the relevant cross-domain trio, with no causal or diagnostic conclusion. Deep Dive still intentionally broadens context under the existing 24,000-character packet and AI-budget limits.

Regression file `tests/piq3-focused-digestive-bristol.test.ts` covers narrow-topic privacy, recognized wordings, cross-domain symptom context, source/date matching, invalid and missing source type handling, explicitly recorded no-movement days and non-diagnostic provenance. The new tests are synthetic, not an authenticated owner iPhone QA or a live Gemini answer-quality review. Keep `main` untouched, do not apply migrations or mark formal acceptance. Next: owner-safe iPhone/context-mode QA, true-answer/relevance review, and controlled production scope/backup verification before any release.

## 2026-10-16 — PIQ-3.3 historical-day digestive evidence (validated code, release gated)

**State:** Work-branch engineering slice only; **0/9 formal PIQ phases owner-accepted**. Exact code commit `ad7d52ff8147c15c70c0f78ae97b3df88ea62bf1` passed [GitHub Actions run 38866092961](https://github.com/daurham/daurham-health/actions/runs/38866092961): `npm ci`, TypeScript, ESLint, full Vitest suite and production build. No production migration, production deployment, live owner-data query, Gemini smoke call, or `main` promotion was performed.

**Problem:** The bounded digestive sampler previously always selected the three newest available observations, including when the owner asked about a single older day. Answering with newer unrelated values could imply an incorrect historical answer.

**Implemented:** `digestDateSelection` recognizes one unambiguous `YYYY-MM-DD`, `today` or `yesterday` anchored to the instance-local Health date. The existing source- and whole-day-quality-gated observations are filtered to that requested date *within the selected range and as-of*, rather than silently substituted with recent dates. Explicit no-bowel observations remain true zero; unrecorded bowel/hydration and unverified fiber days remain unknown. A requested date outside the packet range produces an out-of-scope disclosure and no unrelated daily samples. Unresolvable formats, multiple dates, and unsupported multi-day phrases (such as last week) suppress the latest-three fallback and disclose the limitation. Undated questions retain the existing three-day bound and Deep Dive broader opt-in. The provenance-safe Bristol event retrieval from the preceding slice reuses whichever bounded dated bowel IDs are selected. No additional SQL query, schema change, provider call or budget increase was introduced in this slice.

**Automated regression:** `tests/piq3-historical-digestive.test.ts` covers older-record retrieval under newer entries; local-calendar yesterday; explicitly reported zero; missing date/unknown vs zero; selected-window mismatch; reliable complete-day versus unverified fiber; invalid, ambiguous, alternate-format, and multi-day references; undated Deep Dive fallback. These are synthetic tests, not model-answer-quality or authenticated iPhone acceptance.

**Remaining:** This implements *single-day* retrieval only for focused digestive signals, not all historical domains; natural-language month/date formats and aggregate historical ranges are not yet resolved. Historical reconstructed-event truth must not be conflated with "what Health knew at that time"; review this separately. A real owner question may still require a broader selected window and existing 24,000-character packet limit means even All is bounded. Owner mobile QA, answer relevance/source review, production target/schema verification, backup/restore gate and explicit release approval remain open. Do not merge or migrate on the basis of CI alone. **Next bounded task:** verified multi-day historical-window selection/relevance, with truthful partial-coverage reporting.

## 2026-10-16 — PIQ-3.3 multi-day digestive calendar windows — validated engineering slice

**State:** Branch-only code, **0/9 formal PIQ phases owner-accepted**, production and `main` unchanged. Exact tested implementation commit `8cdc4d839e118adc61194729f1230a04d9a80d09` passed [GitHub Actions 38867446111](https://github.com/daurham/daurham-health/actions/runs/38867446111) for `npm ci`, `npx tsc -b`, `npx eslint .`, `npm test -- --maxWorkers=2`, and `npm run build`. An initial run caught a stale test expectation for intentional Ask Health prompt v5→v6; the test was updated and the final exact-commit run passed. This is application/fixture validation, **not a verified production deploy, live provider answer or authenticated owner QA**.

**New bounded selection:** `digestDateSelection` retains unambiguous single-day `YYYY-MM-DD`, today and yesterday while additionally resolving **last/previous complete Monday–Sunday week**, **this week through selected as-of**, **last/previous complete calendar month**, **this month through as-of**, and **last/past/previous N calendar days, N=1…90**, inclusive of selected as-of. Range labels distinguish previous complete week/month from trailing day counts. Calendar arithmetic uses ISO Health dates rather than local JavaScript browser timezone; the selected `asOf` date anchors windows. Invalid, conflicting, unsupported years/multi-month spans, non-ISO written dates, named months and `since/from` comparisons fail closed without falling back to unrelated recent values. Fully out-of-scope windows are not silently clipped: the owner must widen the selected evidence range.

**Truthful, fixed-window summaries:** Existing quality-gated intelligence observations are filtered to the complete requested window. Aggregate counts and sums use **all qualifying observed dates** in scope, while the packet contains **at most three example dates per digestive metric** and the previous 24,000-character packet and provider-budget ceilings remain in force. Hydration measures only sums of owner-logged *water events* and a conditional average per event-logged date; it does not claim actual total fluids. Bowel totals count only explicit bowel-event or explicit zero-day observations; missing dates remain unknown. Fiber totals/conditional means use only owner-verified complete days with high-confidence source rows; unverified fragments are withheld. Each metric reports window calendar days, observed/verified days, missing or unverified dates, summed recorded value or `null`, and provisional observations from today. The model prompt explicitly prohibits presenting wider-range or undated facts as evidence for the requested week/month. Cache prompt version bumped to `ask-health-v6`.

**Implementation scope:** `src/domain/ask-health/focused-digestive.ts`, `src/domain/ask-health/packet.ts`, `src/domain/ask-health/prompt.ts`, `src/domain/ask-health/config.ts`, tests `piq3-digestive-windows`, `piq3-historical-digestive`, and `i5-ask-health-context`. The source snapshot, source eligibility/quality gates and previously bounded Bristol event query remain unchanged. **No schema migration, new historical SQL query, background provider call, production mutation or `main` merge.**

**Remaining:** The calendar-window aggregation is restricted to *focused digestive signals*, not other owner domains, and still depends on canonical source quality and existing history loads. Live answer-quality/citation relevance, mobile UI, model interpretation of sparse records, cross-domain historical comparisons, production DB/serving identity, backup/restore and owner release authorization remain unverified. No phase should be accepted from synthetic CI alone. **Next bounded PIQ-3 step:** ensure answer-level citation/source relevance and historical-scope consistency across other relevant domains without allowing unverified inferred calendar-day totals; follow with owner-controlled live quality QA.

## 2026-10-16 — PIQ-3 historical named-lift relevance and citations

**State:** Validated bounded engineering slice on `piq/00-baseline-20261014` only; **0/9 formal PIQ phase owner acceptances**. Exact implementation/test commit `1d12c327d8414cbedc828999423f8f1fe91e4c67` passed [GitHub Actions run 38868448154](https://github.com/daurham/daurham-health/actions/runs/38868448154): `npm ci`, TypeScript, ESLint, full Vitest suite, and production build. An initial exact-commit run [38868115160](https://github.com/daurham/daurham-health/actions/runs/38868115160) failed only because the new **synthetic test fixture** omitted the normal `training.consistency` property for the undated baseline; the fixture was corrected and the full validation reran successfully. No owner medical records were used in these tests.

**Problem corrected:** Named-exercise Ask Health retrieval previously always supplied the latest six eligible comparable sets from the selected overall range, even when the question explicitly asked about a specific earlier date, preceding week/month, or trailing window. Broader range-wide Training session totals, frequency and strength-trend evidence also appeared alongside that dated exercise question; a model could cite these as if they measured the requested period.

**Implemented:** The existing conservative date/window selector is reused for **named, unambiguously matched eligible loaded-repetition exercises**; it respects the actual instance-local Health date, selected historical `asOf`, and overall selected start/end. An explicit day or supported complete calendar/trailing window selects only canonical high-confidence comparable working-set appearances in that interval. The returned eligible-appearance count uses the full matching interval; up to six most recent **matching** representative sets carry individual calendar-date evidence and exact single-day evidence periods. Unrecorded days/unsupported reps do **not** mean zero strength, and estimated 1RM is never represented as a tested maximum. Unsupported/ambiguous dates and windows outside the selected scope fail closed without substituting recent sets. For these dated **named-lift** questions only, generic range-wide training session counts/frequency and per-exercise trend cards are withheld to avoid confusing a whole-range metric with a named week/day. Undated named-lift behavior is preserved.

**Tests:** `tests/piq3-strength-historical-scope.test.ts` uses wholly synthetic sets for older dates buried behind recent sessions, prior-week inclusion and exclusions, selected-as-of anchoring, invalid dates and unsupported phrases, no-data/zero distinctions, out-of-window no-clipping, bounded samples and suppression of unscoped training summaries. Existing focused-training exercise ambiguity/strength eligibility tests stay in force. `server/ask-health/load.ts` now passes Health-local `today` and selected `asOf` to the focused training selector. No migrations, new SQL query, background Gemini calls, provider budget change, `main` promotion or production deployment.

**Remaining:** This addresses source period selection for *named exercise working sets*, not all historical training logs or cross-domain time-scoping. Broader intelligence relationships, progress summaries and other domains may still coexist in the packet and require answer-level citation relevance evaluation; prompting alone is not proof of answer truth. Owner-authenticated iPhone flow, live model citation/answer-quality sample, correct Vercel/Neon serving identity, database backup and explicit release authorization remain open. **Next bounded task:** evaluate answer-level citation appropriateness for temporal questions and limit misleading unscoped evidence across other domains using synthetic provider-response tests; do not mark PIQ-3 formally accepted yet.

## 2026-10-16 — PIQ-3 post-generation historical citation grounding

**Engineering validation only:** Exact implementation/test commit `7390ccd3b70a0149d8a645f7a3f08fe958d23612` passed [GitHub Actions run 38873214223](https://github.com/daurham/daurham-health/actions/runs/38873214223): `npm ci`, `npx tsc -b`, `npx eslint .`, full Vitest suite, and `npm run build`. A previous run [38872809727](https://github.com/daurham/daurham-health/actions/runs/38872809727) identified two failing synthetic fixtures that accidentally classified the water coverage source as the training domain; the fixture provenance was corrected and the full exact-head suite passed. No production deployments, schema migrations, authenticated real-owner data checks or provider calls were performed. `main` remains unchanged and **formal owner acceptance remains 0/9 phases**.

**Problem:** Ask Health previously checked only whether a cited `evidence_refs` ID existed. A well-formed answer could still cite a source from the wrong date, an unrelated metric recorded on the correct date, or a whole-range average as proof of a specific requested week. This is a source-grounding failure even though the reference ID is valid.

**Implemented:** `src/domain/ask-health/temporal-citations.ts` performs a conservative, deterministic *post-provider* evidence citation audit on clearly affirmative personal historical measurements or trends. For unambiguous explicit ISO dates and supported week/month/trailing-day requests, positive numerical or reported personal claims require substantive source evidence with actual evidence dates within the requested period or explicit in-scope request-specific coverage; generic range metadata does not qualify. An explicitly claimed metric (e.g. strength vs hydration, or water *and* bowel) needs date-compatible evidence from the matching metric domain(s). Claims about a window total or average require whole-request-window coverage, not an individual date taken out of context. An absent or unverified source does not support an affirmative zero. General physiology explanations, cautious limitations and conditional advice are preserved.

**Cost/safety:** Unsupported affirmative statement blocks are withheld and a concise uncertainty limitation is added; the request does **not** trigger an extra provider retry or spend more AI tokens. When all blocks are unsupported, the response returns a deterministic evidence-insufficiency message. The same audit is applied on cached model answers; only the sanitized answer and its cited evidence are stored. Ask Health prompt/cache version was bumped to `ask-health-v7` and its fixed-version regression test was updated so previously cached answers cannot silently bypass the revised policy. The standard malformed-JSON / invalid-ID validator and existing clinical safety route are unchanged.

**Regressions:** `tests/piq3-temporal-citations.test.ts` uses synthetic facts and stub providers to verify: prior-day vs newer working sets; correct day but wrong evidence domain; per-week water aggregate vs one-day sample; two-domain claims that need each domain; unobserved vs explicit zero; ambiguous/relative-date conservative skip; helpful uncited general knowledge; no added provider call; safe cache re-use. The narrow heuristic is **not universal truth verification** and does not prove the text's numerical value equals its citation's numerical value.

**Limits/next:** The answer-level guard deliberately skips natural-language `today/yesterday` until it can consume the exact Health-local date already resolved by the retrieval layer, rather than guessing from historical `asOf`. Ambiguous comparisons and unsupported date styles require separate interpretation. Multi-clause or subtly phrased subjective personal claims may escape the high-precision wording detector; a same-domain/same-date reference may still be insufficient for the exact numeric assertion. PIQ-3 next work should refine source-qualified **claim-value matching**, explicit Health-local relative-date provenance, and targeted owner-controlled provider-stub / live-answer evaluation. Formal acceptance, mobile QA, serving identity, production backup/migration and owner release approval are still required.

## 2026-10-16 — PIQ-3 historical numeric-claim matching and Health-local relative dates

**State:** Engineering implementation validated on the isolated PIQ development branch only; formal owner acceptance remains **0/9**. Exact code/test commit `4fb22ecad520896ed1f01ea111e8c0306f7bae21` passed [GitHub Actions run 38873970967](https://github.com/daurham/daurham-health/actions/runs/38873970967): `npm ci`, `npx tsc -b`, `npx eslint .`, full Vitest suite and `npm run build`. This is synthetic CI validation, **not** authenticated owner QA, live Gemini accuracy, a verified production deployment, or phase acceptance.

**Number grounding:** The previous temporal/domain citation gate now also compares **literal, affirmative historical measurement quantities** to structured recorded numeric source values. Supported unit phrases include kg/lb, grams, ml, kcal, reps, steps, movements and sessions. Multiple quantities stated together must each be supported by a relevant cited source; a different same-domain/day numeric value is insufficient. For canonical named loaded-rep working sets, owner-logged lifting load and repetitions remain separate from derived estimated 1RM, despite sharing kg units. Requested-window hydration/fiber/bowel summaries distinguish explicitly recorded sums from conditional means per observed day; sample days cannot substantiate week totals. The check conservatively withholds a mismatched owner claim and adds an explicit limitation **without a new provider retry or extra AI budget consumption**.

**Relative dates:** The real instance-local Health date (`healthToday`) now travels from `server/ask-health/load.ts` through `AskHealthPacketInput`, evidence packet and packet fingerprint, distinct from the historically selected `asOf`. The post-generation citation checker resolves `today`/`yesterday` against that date. Direct/legacy packets without the real local date still skip relative-date checking rather than substituting `asOf`. The user prompt exposes the actual Health date when present so an AI response can distinguish it from the selected historical end. Prompt/cache revision is now `ask-health-v8`, with matching fixed-version tests, preventing old cached interpretations from bypassing the safeguard and day-change cache confusion.

**Synthetic regression:** `tests/piq3-temporal-citations.test.ts` now checks same-date/same-domain numeric mismatch, canonical weight vs estimated 1RM, reps, two numeric values in one block, logged weekly sum vs average, wrong units/domains, and Health-local yesterday with historical as-of, alongside the earlier negative-source, safe-general-context, no-cost-redaction and cache tests. All existing app tests passed.

**Boundaries:** This is a conservative literal-number check, not a semantic verifier or clinical safety clearance. The current number parser does **not** claim to handle every rendering (such as grouped thousands separators, percentage calculations, conversions and all date formats), nor does it independently verify subjective interpretations, causal claims or text that lacks an affirmative supported-unit quantity. A correct value on the right date is still not proof of complete real-world hydration/nutrition. Future bounded work should address standardized numeric presentation, more metric-specific source identities, and real-owner/provider answer quality. No new migrations, SQL queries, private data mutations, background jobs, `main` merge, provider spending or production release.

## 2026-10-16 — PIQ-3 grouped numeric formats and nutrient-specific evidence

**State:** Isolated branch-only engineering checkpoint; **0/9 formal PIQ phases owner accepted**. Exact code-and-fixture commit `7cbb03d245a644307290a86ac480d4e4260994a8` passed [GitHub Actions run 38875883838](https://github.com/daurham/daurham-health/actions/runs/38875883838) (`npm ci`, `npx tsc -b`, `npx eslint .`, full Vitest suite and production build). An earlier exact-commit run `38875681308` failed TypeScript because new helpers used `Array.at` and `String.replaceAll` unsupported by this project's compile target; these were replaced by compatible indexed access and regex replacement, and the full latest run passed. This validation is synthetic CI, not production deployment or real owner QA.

**Problem addressed:** Even when citation dates and broad domains matched, the previous historical-answer audit could treat `46 g fiber` and `46 g protein` as interchangeable because both belong to the nutrition domain. It also parsed common comma-grouped numbers inconsistently (e.g. `1,800 ml`) and applied a single block-wide average-versus-total / lifted-versus-estimated qualifier when a block stated multiple different measurements.

**Implementation:** `src/domain/ask-health/temporal-citations.ts` parses literal supported-unit measurement quantities with U.S. comma grouping and decimals, keeping conservative unit handling (no inferred conversions). Each number now gets its own nearby nutrient, aggregation (recorded sum vs conditional observed-day mean), and training load vs derived estimated 1RM qualifier. Nutrient-qualified gram quantities are checked against matching source identities: existing high-confidence focused fiber evidence cannot be used as a protein, carbs, fat or sodium source merely because units, values and dates match. For a combined sentence, all parsed quantities still must be supported by corresponding dated/window-scoped citations. Source grounding remains deterministic, does not make extra model calls and withholds unsupported affirmative blocks with a limitation.

**Synthetic regressions:** `tests/piq3-temporal-citations.test.ts` adds explicit scenarios for `1,800 ml` and `12,345.5 steps`; valid and invalid logged weekly totals; a window total and conditional mean in the same sentence; same-value fiber/protein/carbohydrate misattribution; combined fiber-and-protein claims needing both named sources; and mixed working-set recorded load vs estimated 1RM. The existing relative-day, canonical numeric accuracy, citation scope, negative/unknown and safe-cache tests remain green. No database queries, schema changes, provider spending, `main` merge or production updates.

**Known limits / next:** Metric-specific identity matching currently applies only to explicitly named nutrients for which the emitted evidence source has a trustworthy canonical identity. This does not implement protein/carbs/fat/sodium historical-day reconstruction, validate unrelated domains' historical aggregates, parse locale-dependent number separators or guarantee multi-claim semantic truthfulness. Future work: conservative coverage for unsupported or ambiguous numerical formats, cross-domain answer quality fixtures using realistic response shapes, and owner-controlled live question/citation QA. Production target verification, backup/restore, authenticated mobile testing and explicit owner acceptance are still required.

## 2026-10-16 — PIQ-3 realistic response matrix and unsupported number safeguards

**Validation:** Exact code-and-test commit `8e19be93418b84a240d907ff33ce852fe4ff4c08` passed [GitHub Actions run 38876758198](https://github.com/daurham/daurham-health/actions/runs/38876758198) with `npm ci`, `npx tsc -b`, `npx eslint .`, full Vitest suite, and `npm run build`. All work remains on `piq/00-baseline-20261014`; `main`, production, schema, database records and external provider budgets are unchanged. **0/9 formal PIQ phases owner accepted**.

**Problem addressed:** A personal historical claim with an unsupported or ambiguously formatted unit (e.g. `1,5 g`, `1 800 ml`, `1.5 L`, `900 mg`, `35%`, or a signed amount) could bypass the literal quantity validator or be partially parsed as a smaller supported number (`1,5 g` becoming `5 g`). Another failure mode was treating an entire sentence as hypothetical merely because a factual logged measurement was followed by a separate speculative explanation.

**Implementation:** `src/domain/ask-health/temporal-citations.ts` now conservatively recognizes ambiguous numeric formats and units, declines to certify those personal historical claims, and retains the existing deterministic evidence-insufficiency fallback without any extra Gemini call or retry. In particular, the guard refuses malformed comma grouping, space-grouped thousands, leading/trailing decimal shorthand, negative/signed values, unsupported L/liters, mg, ounces, and percentages. Supported U.S. grouped numbers (e.g. `1,800 ml`) remain valid and must still match canonical source values. A clearly affirmative logged statement followed by `which might ...` is audited, while a purely hypothetical `you might have logged ...` remains conditional. The rule does **not** perform unverified unit conversions.

**Provider-shaped regression matrix:** New `tests/piq3-historical-answer-quality.test.ts` uses entirely synthetic date-qualified water-event, verified-fiber and bowel coverage with realistic provider JSON via `explainAskHealth`; confirms each asserted domain needs its own scoped evidence, mixed source misattributions fail, unsupported formats fail closed, independent safe explanation blocks survive with transparent limitations, and cached responses retain sanitized text and source refs without a second paid model request. A preliminary implementation run was superseded by the final exact-commit green run.

**Boundaries and next:** This remains a high-precision historical audit, not universal answer truth verification or clinical data validation. It intentionally withholds some genuinely equivalent but unverified unit presentations, does not determine whether personal log coverage proves actual intake, and cannot verify subjective cause/relationship claims from citations. Broader model-answer fidelity, question-scope ambiguity and source-completeness need owner-approved live tests. Do not promote to `main`, migrate, deploy, or mark phase acceptance without serving-identity/backup/mobile QA and explicit release decision.

## 2026-10-16 — PIQ-3 historical ambiguity and observational relationship claim gate

**Engineering validation:** exact code/test commit `72257b3700500458f4a14af88c5ff152739a9b88` passed [GitHub Actions run 38907662411](https://github.com/daurham/daurham-health/actions/runs/38907662411) (`npm ci`, `npx tsc -b`, `npx eslint .`, full Vitest suite, `npm run build`). Development branch `piq/00-baseline-20261014` only. **Formal owner phase acceptance remains 0/9**; no `main` merge, production deployment, database migration, owner records read/write, or live Gemini spend.

**Historical question ambiguity:** `src/domain/ask-health/temporal-citations.ts` uses the same deterministic `digestDateSelection` contract already applied by source loading. For clear invalid/ambiguous or unsupported periods (e.g., `10/06/2026`, an impossible ISO day, `last year`, multiple dates, named months, unsupported `since`/`from` comparisons, or simultaneous conflicting windows), affirmative historical owner measurement/trend blocks are withheld rather than borrowing an unrelated latest day or a whole-range number. General education, cautious statements and clarifying information remain visible. With no true Health-local today in a direct/legacy packet, relative-day checks do not substitute historical `asOf`.

**Observational meaning:** New `definitiveOwnerCause` rejects direct, unqualified owner-specific causal claims (such as declaring logged fiber *caused* bowel symptoms), even if the response cites legitimate independent metrics or a personal relationship statistic: association is not causation. New `affirmativeOwnerAssociation` requires a substantive, matched-temporal-scope `intelligence.relationship.*` evidence source when a model asserts a personal correlation/association; two independently recorded totals are insufficient. A cited relationship calculation without numerical assertions can support a suitably scoped descriptive association without requiring unrelated raw metric citations. Pure general physiology explanations and explicitly qualified hypotheses remain available. This is a high-precision phrase-level guard, not full natural-language inference verification.

**Model instructions and cost:** Ask Health system prompt now explicitly separates observed associations from personal causation and warns against unsupported date interpretation. Prompt/cache version is `ask-health-v9` with updated fixed-version regression. Source/claim checks execute deterministically after the existing evidence-ID JSON validator, including on cached responses. Unsupported blocks are withheld with a clear limitation; no second AI call is made to repair semantically unsupported claims. General Only and immediate safety routes remain unchanged.

**Synthetic regressions:** `tests/piq3-historical-interpretations.test.ts` verifies ambiguous/unsupported date styles and comparisons; safe guidance preserved; direct causal claims withheld with and without correlation refs; cautious interpretations retained; no association asserted without available date-aligned `intelligence.relationship` support; source quality gating; and complete provider-JSON-shaped response/cached answer behavior that preserves independently supported water/bowel facts. The exact run also covered all prior historical-digestive, strength, numeric-value and malformed-number regressions. One earlier run failed a prompt syntax comma, and another failed two expected text-compatibility assertions; both were corrected before the final full green run.

**Known bounds / next:** A relationship ID and time-matching dates alone do **not** prove that the *specific pair of signals* claimed in prose is what that relationship modeled, nor do they establish causation, lag equivalence or completed-day recording. Future PIQ-3 work should conservatively bind source relationship signal identities / time lags to affirmative association claims, prevent inference of causality from observational data in more phrasing variants, and add owner-approved realistic provider QA. Engineering tests are not production acceptance; preserve serving identity, privacy, backup, mobile and owner release gates.

## 2026-10-16 — PIQ-3 canonical relationship signal identity and lag attribution

**Status:** Engineering checkpoint validated on `piq/00-baseline-20261014`, NOT an accepted or released phase. Exact code/test commit `ff4da8d0ce03f8e0682145a96da053c8dbed9a76` passed [Actions run 38918637975](https://github.com/daurham/daurham-health/actions/runs/38918637975), including `npm ci`, `npx tsc -b`, `npx eslint .`, full Vitest suite, and `npm run build`. **Formal owner acceptance remains 0/9**. No production/main change, migration, new DB query, owner-data inspection, or live paid provider call.

**Identity fix:** Previously an affirmative personal relationship statement could cite *any* substantive `intelligence.relationship.*` item in the requested time window, including a fiber–bowel correlation while claiming water–bowel, or a next-day coefficient while claiming same-day. Registered relationship recipes already store canonical xKey, yKey, lagDays. A new `registeredRelationshipSpec(id)` getter in `src/domain/intelligence/shared.ts` provides the exact registered identity; Ask Health evidence in `src/domain/ask-health/packet.ts` now exposes xKey/yKey plus the already-present lagDays and sample counts. The model is explicitly asked to name the matched pair and describe lag conservatively.

**Deterministic post-generation audit:** `src/domain/ask-health/temporal-citations.ts` now extracts two *named*, specific health signal keys from a correlation claim and checks both against the single cited, registered relationship's canonical xKey/yKey. It requires consistent source-coverage identity/lag, substantive source with finite Spearman rho, adequate paired observation metadata and existing date scope. Unnamed/overly broad or three-signal claims are withheld rather than certified by an unrelated statistic. When the claim specifies same-day versus next-day, it must match lagDays. For explicit following-day wording, named signals must appear in x→y order; reversing the order is not automatically treated as an equivalent directional claim. Stated rho or positive/negative sign cannot contradict the evidence. No broad semantic paraphrase inference, conversion, extra provider retry or AI tokens. Cached legacy packets that do not supply these keys fail closed for affirmative associations.

**Tests:** New `tests/piq3-relationship-identity.test.ts` covers correct/wrong source identity, water–bowel vs fiber–bowel vs sleep–energy, unknown registered IDs, stale or unavailable sources, missing/wrong x/y/lag/sample coverage, same-day/next-day and reversed next-day wording, rho magnitude and sign, cautious explanations and deterministic provider-shaped cache sanitization. Existing `tests/piq3-historical-interpretations.test.ts` fixture now supplies canonical relationship ID and coverage. The first new suite correctly detected a bug where matched terms were returned in registry order, causing a reversed next-day claim to be accepted; corrected `claimedRelationshipSignals()` to preserve actual sentence order and proved the corrected behavior in the final green run. An intermediate run also caught a missing comma in prompt-array syntax, fixed before final validation.

**Limits / next:** The guard certifies only a conservative registered pair identity, not causation, medical significance, comprehensive owner coverage, strength of interpretation or statistical generalizability. Missing/out-of-scope dates remain unknown. Textual relationships without two recognizable specific signal names fail closed; some legitimate paraphrases may be withheld, especially around complex next-day phrasing. Next evaluate pair/date quality under source omission, assess lag statements with adversarial phrasing and correlation direction/strength qualifiers, and design owner-controlled authenticated mobile/provider QA before any release gate. Production verification, backup, privacy, financial budget and explicit owner acceptance remain outstanding.

## 2026-10-16 — PIQ-3 actual paired-date quality, coverage overclaims and screened strength

**State/validation:** Engineering checkpoint, **0/9 PIQ phases formally owner-accepted**. Exact code/test commit `2dd38eb6c39730d8dc0b1d789a65dd5f13d606e1` passed [GitHub Actions 38923900318](https://github.com/daurham/daurham-health/actions/runs/38923900318): `npm ci`, `npx tsc -b`, `npx eslint .`, full `npm test -- --maxWorkers=2`, and `npm run build`. Only the protected PIQ development branch was changed. No main/production deployment, SQL migration, owner-record access, new runtime background job or paid model call.

**Problem:** A matched Spearman relationship identifier with `pairedObservations >= minimum` still does not verify the saved source actually contains that many dated observation pairs, or that every day was observed. Affirmative model prose could also claim unsupported clinical/statistical significance, universal daily behavior, mismatched weak/moderate/strong category, or multiple-day/immediate timing despite screened daily lag being only 0 or 1.

**Source evidence:** `src/domain/ask-health/packet.ts` now emits `pairedDateCount` sourced from `relationship.evidenceDates.length` and `selectedCalendarDays` derived from the existing Ask Health input period, for available and insufficient-data relationship metadata. The routed intelligence payload itself lacks `period`; this was caught in CI and corrected to use `AskHealthPacketInput.period`. The existing verified signal keys, lagDays, full pair count, dated evidence list, owner-completeness filters and excluded-intelligence logic remain unchanged; no new database query. A supported relationship must now have internally consistent reported/present paired date counts, enough distinct evidence dates, available and matching screener metadata (registered pair, exact required threshold, expected sample confidence and |rho| >= 0.2), and calendar size sufficient to contain the sample.

**Answer guard:** `src/domain/ask-health/temporal-citations.ts` continues deterministic post-generation citation checks. Explicit personal relationship claims now fail closed on overconfident words ('every day', 'all recorded days', 'always', 'statistically significant', 'significantly correlated', 'proven', etc.), unsupported precise temporal phrases ('previous day', 'two days later', 'same week', 'within 48 hours', 'immediately', or contradictory same- and next-day text), and claimed weak/moderate/strong wording inconsistent with the canonical Spearman strength threshold. Explicit `rho`, sign, signal order for next-day pairs, source dating and source-identity checks from the prior checkpoint remain enforced. Cautious/educational statements stay eligible. No second model repair call. The prompts now explain limited paired-day coverage, lag limits and non-significance, and the prompt/cache identifier is `ask-health-v11`.

**Regressions and fixes:** `tests/piq3-relationship-identity.test.ts` includes realistic 14 distinct paired dates in a September month window rather than an impossible 14-pair seven-day window; adds missing/duplicate paired dates, contradictory paired counts, too few screened pairs, stale thresholds/confidence, below-floor coefficients, exaggerated signal strength, ambiguous lag, universal coverage and unsupported significance cases. `tests/piq3-historical-interpretations.test.ts` now includes complete dated pairs for its positive synthetic relationship example. During exact-commit validation CI identified an incorrect assumption that routed intelligence contained `period`, then an old synthetic correlation with 12 claimed pairs but no dates. Both were fixed before the full final green run. Provider-shaped original/cached answer tests remain green; no live owner/provider quality test has yet been performed.

**Known limits/next:** These are conservative source and phrase audits, **not** medical proof, universal semantic checking, p-values, causation or a substitute for user QA. Even a correctly screened correlation with 14 pairs across 30 selected calendar days is only an association based on those pairs, not complete ingestion or symptom tracking. Distinct evidence dates are an integrity cross-check, not independent recreation of Spearman from private pair values. Some supported paraphrases and non-English/localized timing can be withheld or not recognized. Next undertake bounded owner-controlled authenticated live-question QA and source/coverage display review; verify selected-mode privacy, costs, release serving identity and backup/restore, then request explicit acceptance prior to any `main` release.

## 2026-10-16 — PIQ-3 controlled owner QA readiness matrix and privacy/cost rehearsal

**State:** Engineering-validated synthetic acceptance rehearsal; live owner acceptance **NOT RUN** and **0/9 PIQ phases formally accepted**. Exact code-and-test commit `a360df83c8557239a3ea25d6a932697b77e6841e` passed [GitHub Actions 38925010267](https://github.com/daurham/daurham-health/actions/runs/38925010267): `npm ci`, `npx tsc -b`, `npx eslint .`, full Vitest suite and `npm run build`. Isolated PIQ development branch only. Documentation was committed afterward with `[skip ci]` and does not change the validated application/test commit.

**Synthetic rehearsal:** New `tests/piq3-owner-qa-readiness.test.ts` uses an intentionally marked artificial personal context, active synthetic weight target and one made-up dated water event to exercise the actual Ask Health service, packet builder, model-provider boundary, citation sanitization, source-display metadata and usage gate. Every test uses an injected stub provider, synthetic data and memory gate, never Gemini or Neon. It verifies (1) Smart and General Only education routes never retrieve or send owner facts or private conversation, (2) Personalized and Deep Dive include explicit relevant owner evidence and Deep Dive widens a narrow tab to the general lens, (3) General Only owner-history refusal and deterministic emergency handling spend zero requests, (4) per-mode cache keys remain separate, cached replies reuse one request without converting general answers into owner facts, (5) a dated and correctly supported personal water observation remains while an unsupported steps assertion citing that same source is withheld, cited-source display includes only surviving refs, and the 'What Health AI considered' overview includes only actually supplied source IDs, and (6) fresh over-budget requests return a clear 429 without provider invocation.

**Owner acceptance preparation:** Added `docs/ai/PIQ3_OWNER_QUESTION_ACCEPTANCE.md`, linked from `PIQ_OWNER_ACCEPTANCE_RUNBOOK.md`. The 13-case matrix covers all four context modes, vague questions, canonical dated claims, incomplete logged fiber/water windows, pair/lag-aware correlations and causation, disposable-owner source corrections, caches/budget refusal, owner-authorized limited paid smoke checks, and narrow mobile layouts. It specifies privacy-preserving case-ID-only results and human scoring using the existing 12-axis PIQ rubric; no raw owner questions, responses, health data or secrets belong in CI/GitHub. This is a **prepared, not executed** owner procedure.

**Remaining hard gates:** Confirm actual Vercel serving commit and right Neon DB/branch, read-only migration preflight and isolated encrypted backup/restore; verify preview cannot reach production data, authenticate mobile owner and test source/correction navigation in the real UI; explicitly approve a tiny live Gemini budget if desired; score real questions with human safety review and visible cost usage. Prior Vercel deployment listing 403 and empty Neon listing remain unresolved, not overridden by a green fake-provider test. No migrations, production merge, deployment, clinical assertions or PIQ phase acceptance authorized.

## 2026-10-16 — PIQ-3 read-only Vercel/Neon deployment identity discovery (blocked release gate)

**Read-only metadata only; not release or owner acceptance.** Exact previously green application and synthetic owner-QA test SHA remains `a360df83c8557239a3ea25d6a932697b77e6841e` (GitHub Actions [38925010267](https://github.com/daurham/daurham-health/actions/runs/38925010267) passed TypeScript, ESLint, full tests and build). No app/test code changed in this discovery. All new updates are documentation-only `[skip ci]` on `piq/00-baseline-20261014`. Formal PIQ phases **0/9 accepted**, `main`/production unchanged, no migration, owner data read or paid model execution.

**Vercel:** Read-only project search identifies `daurham-health` under its correct `daurhams-projects` team, but scoped project lookup, deployment history and production-domain lookup each return 403; team listing from the connected credential is empty. Serving SHA, exact live domain and deployment environment-to-database mapping remain **not verified**. No unrelated scope or copied secret fallback attempted; this is an authorization blocker requiring valid same-team access before safe live QA.

**Neon:** Unlike the prior unscoped empty result, current authorized organization-scoped metadata lists a Vercel-managed organization with a candidate Health project `neon-rose-kettle`. Its default `main` has a child `preview/piq/00-baseline-20261014`, plus recent named Health preview branches. Both `main` and this child have a `neondb` database and the same 85 Health/auth table names (`health_profile`, `nutrition_entries`, `workout_sessions`, `schema_migrations`, `ai_usage`, etc.). This is a **strong candidate from names and schema only**; it is not a verified connection to the Vercel production deployment or proof of any migration values or record integrity. The PIQ child is descended from default `main`; it may contain private owner data and cannot be declared synthetic/disposable on branch name alone. No row/query access or secrets were used.

**Backup metadata:** One named manual health-pre-migration snapshot from October 11 exists in the candidate project's default branch; its automatic snapshot schedule lists no entries. Neither encryption/restore integrity nor owner backup protection has been verified; do not mistake metadata for a recovery test. An older separate fitness-tracker project is also listed; do not infer it serves the app.

**Documentation and gates:** New [`PIQ3_ENVIRONMENT_READONLY_DISCOVERY_20261016.md`](./PIQ3_ENVIRONMENT_READONLY_DISCOVERY_20261016.md) records precisely which facts were returned and which remain blocked; [`PIQ_OWNER_ACCEPTANCE_RUNBOOK.md`](./PIQ_OWNER_ACCEPTANCE_RUNBOOK.md) now replaces stale 'Neon listing empty' language and explicitly flags inherited child-branch private data risk. Keep live owner QA, paid smoke tests, read-only migration preflight, synthetic writes and any release actions **blocked** until correct Vercel scope, serving SHA, actual Neon target, test-data segregation, authenticated mobile access and encrypted verified backup/restore are established. Do not create new Neon resources, read patient rows, promote `main`, or deploy from this discovery.

## 2026-10-16 — PIQ-3 Vercel access correction and verified live production serving SHA

**Correction:** The prior report that the Vercel connection needed to be reauthorized was inaccurate. The same existing linked Vercel account successfully returned the project and deployments when called **without** an explicit `teamId`; team-scoped calls had returned 403. No owner reconnection is needed and no deployment was initiated.

**Verified:** Project `daurham-health` has verified production domain `health.daurham.com`. A read-only deployment lookup by that exact **live domain** resolves to a READY production deployment on GitHub `main`, serving SHA **`dbc3fcb68324d75d30a96132b725456ec7e45d49`** (deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`). This identifies the actual live serving build separately from the PIQ development branch.

**Still unverified:** Un-decrypted Vercel project environment metadata lists database configuration **names** targeted at production and preview, but it does not reveal or certify which Neon project/branch either runtime actually uses. No environment values, tokens or connection strings were decrypted or printed. The candidate `neon-rose-kettle` PIQ child branch still descends from a Health-shaped main schema and must be treated as potentially private; production-to-Neon binding, isolated test owner, migration history and safe backup/restore still need authorized validation. No new AI request, SQL row read, database modification, migration, merge or deploy was performed.

**Documentation:** The [read-only environment discovery](./PIQ3_ENVIRONMENT_READONLY_DISCOVERY_20261016.md) and [owner acceptance/release runbook](./PIQ_OWNER_ACCEPTANCE_RUNBOOK.md) now correct the earlier Vercel access mistake. Changes are docs-only `[skip ci]`; the last application/test CI remains green at `a360df83c8557239a3ea25d6a932697b77e6841e` (run 38925010267). **Formal owner acceptance remains 0/9**. The next action is redacted, explicitly authorized runtime DB identity and preview isolation verification—not reconnecting Vercel.

## 2026-10-16 — PIQ-3 automated Neon preview provenance and environment-binding audit

**Metadata verification only:** Existing Vercel connection now reveals a Neon marketplace integration, the READY PIQ preview deployment on the correct Git ref, and a production-domain deployment pinned to main commit `dbc3fcb68324d75d30a96132b725456ec7e45d49`. The Neon candidate project `neon-rose-kettle` identifies its PIQ child branch `preview/piq/00-baseline-20261014` with `creation_source=vercel`, `init_source=parent-data`, and parent `main`. This verifies that Vercel automation **created an isolated Neon branch initialized with parent data**, not that the current preview server's `DATABASE_URL` points there. Copied private Health rows may exist in the preview branch and have not been inspected.

**Important runtime boundary:** Vercel variable metadata, **without decryption**, shows `DATABASE_URL` and `DATABASE_NEON_PROJECT_ID` configured for preview and production; no branch-specific override appears in these project-wide records. The app's actual DB resolver in `server/db.ts` uses `process.env.DATABASE_URL`. The Neon integration may inject per-deployment values, but the read-only deployment payload does **not** expose a certified runtime project/branch identity. Therefore the audit does **not** assert same-database misconfiguration or proven preview separation. Vercel preview SSO metadata does not certify protection of inherited medical records or authenticated owner QA.

**Safeguards and next:** Before any owner-data/prod work, privately verify the **effective** production Neon branch and preview Neon child branch through authorized redacted identity checks, then establish safe synthetic test owner/data segregation and verified encrypted restore. The runbook now marks the serving SHA verified while keeping actual DB binding, protected preview data, migration preflight, real iPhone QA, paid Gemini, deployments and production release blocked. Changes are docs-only `[skip ci]`; last exact green code/test SHA remains `a360df83c8557239a3ea25d6a932697b77e6841e` ([Actions 38925010267](https://github.com/daurham/daurham-health/actions/runs/38925010267)). **0/9 phases formally accepted**. No secret decryption, personal data rows, SQL, mutation or provider request.

## 2026-10-16 — PIQ-3 opt-in database endpoint binding guard, synthetic CI validated

**Engineering checkpoint; not a live runtime attestation.** Exact code/test SHA `628b446e287b232c53ad9d291f71c3e36420fd64` passed [GitHub Actions 38930989586](https://github.com/daurham/daurham-health/actions/runs/38930989586): `npm ci`, `npx tsc -b`, `npx eslint .`, full `npm test -- --maxWorkers=2` and `npm run build`. Only the isolated PIQ branch was updated. New documentation checkpoint committed afterward with `[skip ci]`; no changes to the exact CI-validated app/test code.

**Problem / identity facts:** The existing server DB resolver previously returned `process.env.DATABASE_URL` without enforcing that its hostname matched the Vercel deployment's intended Neon branch. The existing Neon integration produced a Vercel-created PIQ child branch from parent data and read-only Neon metadata confirmed main/PIQ preview have distinct compute endpoint hosts. That establishes a useful check value, **not** the effective runtime connection values in a currently deployed Vercel Function. Reusing cloned private owner data in preview remains unsafe for writable fixture QA.

**Code:** Added `server/database-binding.ts`, a pure result-code-only validator that compares the effective PostgreSQL URL's hostname with independently supplied, non-secret expected production and preview Neon endpoint hosts; normalizes direct/-pooler variants, demands distinct endpoints and correct `VERCEL_ENV` plus exact Git ref, refuses host routing overrides, malformed URLs and missing inputs. It returns only `VERIFIED_EXPECTED_ENDPOINT` or stable non-secret block codes; never logs or returns passwords, URLs or hostnames. Added `server/database-binding-preflight.ts` and `npm run database:binding-preflight`; the command uses environment values **in memory** without connecting to Postgres or running SQL. Added an **opt-in runtime guard** to `server/db.ts`, active only under `HEALTH_DB_BINDING_ENFORCE=true`. By default, existing production behavior is unchanged; no flag or guard deployment was enabled. Expected endpoint hosts and the preview Git ref are generic configuration, not hard-coded user identifiers.

**Regression tests:** New `tests/piq3-database-binding.test.ts` checks expected production and preview hosts, -pooler normalization, cross-branch mismatches, wrong Git ref, missing/identical/malformed host config, hostile routing overrides, secret-free errors, and explicit activation with disabled-by-default behavior. No real private health records, SQL queries, Vercel secret decryption, provider calls, or production mutations are performed.

**Remaining gates:** The safe preflight is a configuration validator, **not** an automatically completed deployment attestation. To prove live production/preview binding, an authorized operator must provide independently confirmed non-secret Neon endpoints and invoke the check in each exact deployment's effective environment (not a laptop's unrelated env). Before enabling enforcement or writing preview data, separately verify copied-owner-data protections, production backup/restore, production schema state, mobile authentication and explicit release authorization. `main`, production and Neon remain unchanged. **Formal acceptance: 0/9 PIQ phases.**

## 2026-10-16 — PIQ-3 stricter DB and Auth isolation gate; exact CI green

**Engineering validated / owner still unaccepted:** Application/test SHA `50bf9b6940a4c48340cc87bee3b64493a51bbdeb` passed [GitHub Actions 38932688326](https://github.com/daurham/daurham-health/actions/runs/38932688326) on the PIQ development branch: `npm ci`, TypeScript, ESLint, full Vitest suite, and production build. No PR merge or production release. Checkpoint-only documentation committed afterward with `[skip ci]`, so this CI success attests the exact preceding code/test SHA, not its docs-only descendant.

**Guard strengthening:** Existing opt-in `server/database-binding.ts` previously screened only a recognized Neon endpoint host and Vercel ref. It now compares the effective Postgres URL's **database name** against two independently configured expected names (`HEALTH_DB_PRODUCTION_DATABASE_NAME` and `HEALTH_DB_PREVIEW_DATABASE_NAME`), refuses absent/invalid expected names, missing/incorrect URL database names and routing overrides such as `dbname` and `port`. It requires an unambiguous secure `sslmode` (`require`, `verify-ca`, or `verify-full`) rather than allowing a downgraded or absent TLS directive. Synthetic regressions cover wrong database names under correct hosts, differently named installations, encoded path failures, query overrides and insecure/duplicate SSL modes. Errors remain stable reason codes without URLs/credentials. Guard remains **OFF by default**; preflight is read-only and no live URL or health data is inspected.

**Auth metadata finding:** Scoped read-only Neon auth metadata on candidate `neon-rose-kettle` shows `better_auth` on both main and PIQ preview branches. Their Auth base URLs and JWKS endpoints differ, but one opaque auth-provider project identity is shared. This alone establishes neither owner/session segregation nor cross-tenant data safety. Do not interpret distinct URLs as approval to run authenticated owner QA against a preview copied from private parent data. The serving Vercel function's effective DB/Auth destinations remain **NOT VERIFIED**.

**Remaining release blocks:** Verify the effective production and PIQ preview **database endpoint, database name and Auth tenant** inside each authorized deployment, without disclosing credentials; confirm private cloned data access controls and genuinely disposable test owner or clean fixture; perform authorized read-only schema preflight and verified encrypted backup/restore before any migrations. Live iPhone QA and real paid Gemini calls remain unexecuted. `main` and production unchanged. **0/9 phases formally owner-accepted.**


## 2026-10-16 — PIQ-3 Auth URL preflight CI validated; PIQ-4.1 digestive sampled Bristol screen

**Checkpoint:** Repo `daurham/daurham-health`; development branch `piq/00-baseline-20261014`; application code SHA `6c4e402587c28eae33c49325124cdacc8f2b9b52`; remote GitHub tree only (no local worktree). Migration code HEAD `0056_primary_goal_intent_events.sql`, still owner-gated/unapplied. Verified production schema state **unknown**. Production domain `health.daurham.com` still aliases READY `main` deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64` (SHA `dbc3fcb68324d75d30a96132b725456ec7e45d49`). Formal owner-accepted phases **0/9**.

**PIQ-3 safeguard done:** `server/auth/binding.ts`, standalone `npm run auth:binding-preflight`, `server/auth/config.ts` opt-in `HEALTH_AUTH_BINDING_ENFORCE=true` and `tests/piq3-auth-binding.test.ts` implement credential-safe, exact-context production-vs-preview Neon Auth base-URL checks. Guard is **disabled by default**. GitHub Actions [38933955703](https://github.com/daurham/daurham-health/actions/runs/38933955703) passed `npm ci`, TypeScript, ESLint, all Vitest and build at exact SHA `1868eeadf6242fbae57f26652e66c6d3bc8950aa`. Runtime Auth session/tenant isolation **still unverified**.

**PIQ-4.1 first engineering slice done:** `src/domain/ask-health/digestive-screen.ts` + scoped Ask Health packet integration: sample-only observed saved Bristol 1–2, typed/missing event references, explicitly entered zero bowel days, independently sampled same-date logged-water and owner-verified complete-day fiber presence, with noncausal evidence wording. No claim of a full-window trend or hydration status; unknown remains unknown. Seven synthetic cases in `tests/piq4-digestive-screen.test.ts` cover type provenance, zero vs missing, water/fiber completeness, minimum-necessary context privacy, invalid historical scope, provisional days and non-hard examples. Decision/limitations in `docs/ai/PIQ4_DIGESTIVE_SCREEN_CONTRACT.md`. CI FAILURE at checkpoint: GitHub Actions 38935399299 (exact code SHA 6c4e402587c28eae33c49325124cdacc8f2b9b52). New branch preview Vercel build `dpl_8ZdUeoCzCbGDXZXiXoGosZDLC7Jh` reached READY at the code SHA, **not** an authorized live data test or proof of preview DB/Auth isolation.

**No side effects:** No production promotion, migration, owner health row inspection/write, Auth session request, Vercel environment modification, backup mutation or Gemini provider call. Release isolation/backup gates remain **BLOCKED**: independently attest *effective* Vercel database endpoint/name and Auth base URL for both exact runtime deployments; protect copied private parent-data in the Neon preview; verify disposable owner fixture and tenant separation; authorized read-only migration preflight and encrypted backup+isolated restore; then mobile + limited owner QA and explicit migrations/release approval.

**Next tool action:** Recheck [Actions 38935399299](https://github.com/daurham/daurham-health/actions/runs/38935399299) and repair a failing exact SHA if needed; otherwise design PIQ-4.1 full-window, access-limited canonical stool-type coverage and independent aligned/lagged pairing without elevating sample co-presence to correlation. Re-run synthetic digestive, context-mode privacy, source correction/caching, immediate-safety and targeted nutrition completeness scenarios before any owner sign-off.

## 2026-10-16 — PIQ-4.1 causal "from" date-routing repair; exact CI GREEN

**Latest validated code/test SHA:** `b3fe08f3bbdfeb4ae8d48055420b28ef0a6e9e7b` on `piq/00-baseline-20261014`, [Actions 38936040705](https://github.com/daurham/daurham-health/actions/runs/38936040705), **SUCCESS**: `npm ci`, TypeScript, ESLint, full Vitest suite, `npm run build`. The preceding code SHA `6c4e402` **FAILED** [Actions 38935399299](https://github.com/daurham/daurham-health/actions/runs/38935399299): 5 new PIQ-4 sampled-digestive tests received null because the pre-existing `digestDateSelection` marked the causal preposition **from** (e.g. `Are my hard stools from not drinking enough water or fiber?`) as a historical date-range marker. No old tests failed. Rather than weaken these regressions, this fix narrows temporal **from** to recognized date/period anchors, preserving true historical range suppression; added explicit causality-vs-date test. The corrected exact code SHA passed every CI stage. The previous failure is retained as useful regression evidence, not presented as a passing run.

**Release:** This work remains an isolated, unapplied PIQ engineering branch. Last verified Vercel READY preview `dpl_8ZdUeoCzCbGDXZXiXoGosZDLC7Jh` belongs to earlier `6c4e402` and is **not** the corrected current code. Vercel status on corrected commit showed build-rate-limit failure; no retry, quota purchase, production promotion or runtime private-record QA was authorized. Production domain remains on `main` baseline `dbc3fcb68324d75d30a96132b725456ec7e45d49`; migration code head 0056, production schema not verified. PIQ acceptance **0/9**. The new Auth preflight also remains opt-in/off.

**Precise next action:** At next safe Vercel quota opportunity, obtain preview deployment for **the exact release candidate** and verify effective DB *and Auth* destinations through authorized no-secret runtime preflight; isolate copied owner data and test identity, then read-only migration preflight and verified encrypted backup + isolated restore. Until those are proven, do not perform live owner QA, use paid Gemini, enable guards, apply migrations or merge to main. For PIQ-4.1 next implement genuine full-window saved Bristol coverage and temporally aligned/lagged water/fiber eligibility; sampled co-presence from the new screen **must not** be reported as a correlation or clinical cause.

## 2026-10-16 — PIQ-4.1 90-day bounded Bristol full-window aggregation, exact CI GREEN

**Continuation packet:** Repo `daurham/daurham-health`; branch `piq/00-baseline-20261014`; validated application/test SHA `c065f608d487820a1d78dbc2e3fc963e850b904a`; GitHub connector updates only (no local worktree). [GitHub Actions 38937759507](https://github.com/daurham/daurham-health/actions/runs/38937759507) **SUCCESS** on that exact SHA: `npm ci`, `npx tsc -b`, `npx eslint .`, full `npm test -- --maxWorkers=2` and `npm run build`. Migration code still ends with `0056_primary_goal_intent_events.sql`; migrations 0053–0056 remain owner-gated; serving production schema **not verified**. Formal PIQ owner acceptance **0/9**.

**Implemented:** New `src/domain/ask-health/digestive-window.ts` determines a precise in-range history selection and refuses an interval larger than 90 days rather than silently truncating "All"/6m. `server/ask-health/load.ts` conditionally fetches **grouped** bowel event-count, valid-Bristol-count and Bristol-1–2-count per date; no raw notes, event times or owner IDs in this incremental query, and no query for unrelated/General Only requests. The pure calculator reconciles **every selected recorded date** against the existing canonical snapshot, failing closed for count mismatches, duplicate/malformed grouped rows or read failure. Explicit no-BM days, missing/unlogged days, current-day provisional entries and denominator of valid saved Bristol types remain separate. `src/domain/ask-health/packet.ts` adds a bounded, evidence-cited descriptive whole-window marker or a non-substantive explicit unavailable reason. Sampled three-day evidence remains independently labeled; neither series establishes dehydration, fiber deficiency, clinical diagnosis or causal association.

**Regression evidence:** `tests/piq4-digestive-window.test.ts` tests verified counts, missing versus explicit zero, incomplete types, duplicate/mismatched groups, scope cap, historical date/supported trailing windows, provisional today and water-only/General Only isolation. Prior two CI failures were test-title parse and `no-useless-escape` issues; repaired without weakening assertions. Exact green CI is pinned above. See `docs/ai/PIQ4_DIGESTIVE_WINDOW_CONTRACT.md`.

**Deployment/security:** Latest observed production alias `health.daurham.com` still maps to READY `main` deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`, SHA `dbc3fcb68324d75d30a96132b725456ec7e45d49`. Vercel rejected pushes of this newer code due to build-rate limits: do not treat earlier READY PIQ preview builds as the validated SHA. No deployment promotion, owner-data query/write, live authentication, migration, backup mutation, environment variable edit or paid Gemini call was made. The existing Auth and database binding guards remain disabled by default.

**Outstanding:** Exact Vercel runtime-to-Neon DB **and** Auth bindings, private parent-data preview segregation, disposable owner fixture, read-only migration preflight, verified encrypted backup + isolated restore and authorized mobile/answer-quality tests. Separate owner approval required for paid provider QA, migrations, release and main merge.

**Next action:** Continue PIQ-4.1 with cross-domain **quality-qualified paired-day and 0–2 day lag** derivation based on canonical complete-day fiber and recorded water/bowel observations. Design independence/sample maturity/confounder protection before surfacing any personal correlation; do not infer from the newly aggregated Bristol count or sample co-presence. Re-run PIQ-0 safety/history, PIQ-1 completeness, PIQ-3 privacy and PIQ-4 digestive regressions on exact release candidate. PIQ-4.1/PIQ-3 still require human owner acceptance.

## 2026-10-16 — PIQ-4.1 verified fiber/water/Bristol 0–2-day lag readiness (CODE CI GREEN; OWNER QA BLOCKED)

**Continuation snapshot:** repo `daurham/daurham-health`, branch `piq/00-baseline-20261014`; exact code+synthetic test SHA `72c36f2838f1ddcf93f9b5afe339880f9fe87f87`; remote GitHub files only (no local worktree). [Actions 38939803479](https://github.com/daurham/daurham-health/actions/runs/38939803479) **SUCCESS** on that SHA: npm ci, `npx tsc -b`, `npx eslint .`, full Vitest and `npm run build`. This documentation checkpoint is skipped from CI, so this result applies to the preceding exact code SHA. Migration head 0056 is still unapplied/owner-gated; serving production schema unverified. PIQ formal acceptance **0 of 9**.

**Implemented PIQ-4.1 follow-up:** New pure `src/domain/ask-health/digestive-pairing.ts` uses the already-reconciled bounded `DigestiveBowelWindow` dated **grouped** valid Bristol counts (`typedDays` added to window model). Pair readiness is computed on **same date, 1 day prior, 2 days prior** relative to an owner-recorded fully typed bowel event day, and never borrows an exposure before exact selected history. Full-day fiber requires owner-verified complete day, high source confidence and available verification metadata. Water is only **logged event presence**, explicitly never verified total fluid. Incomplete Bristol days, explicit zero days, missing/unlogged records and current provisional dates never become fabricated outcome pairs. Temporal matches for different lags are non-independent. `12` pairs across `4` distinct Monday-start calendar weeks is a conservative *candidate for later reviewed analysis* threshold, not a correlation or decision; raw rho/effect estimates are **not computed**. Even the candidate marker remains non-substantive metadata, not an intelligence.relationship claim. New metadata is emitted only for cross-domain bowel questions or deliberately opted-in Deep Dive. Related Ask Health prompt forbids correlation/cause extrapolation. No new SQL beyond the earlier bounded aggregate.

**Tests:** `tests/piq4-digestive-pairing.test.ts` covers 0/1/2 directional alignment, overlapping/nonindependent lags, minimum paired weeks, exact-scope boundaries, reliable/unverified and unavailable fiber, missing water, incomplete types, provisional today, privacy modes, and fail-closed source disagreement. First code SHA `b6abbf2` CI was cancelled after a synthetic count correction; SHA `439b98d` CI failed one fixture expectation because every-other-day fiber also correctly yields 15 two-day-lag pairs; fixed test expectation in SHA `72c36f2` without weakening source rules. Corrected exact CI above is green.

**Known limits and release blocks:** This detects *pairing readiness* only. Neither stool tracking completeness nor total hydration, confounders, independent replicated windows, outcome change, strength/significance nor causal impact are established; not eligible to change Coach, calorie targets or medications. Vercel latest code status returned build-rate-limit; cannot infer a READY preview for current code. Production alias was last confirmed at unchanged READY `main` deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. Effective exact-deployment DB endpoint/name and Auth tenant/session binding, cloned-owner-data isolation, disposable test owner, read-only schema preflight, encrypted backup+isolated restore, mobile/AI answer evaluation and owner release approval remain outstanding. No private DB query, migration, main promotion, paid Gemini use or prod env changes made.

**Next exact action:** Before any user data QA/deployment, verify isolated Vercel preview + effective Neon DB/Auth binding and backup plan when limits permit, with owner authorization. Continue PIQ-4.1 by designing *independently measured* adequate-duration, completeness-qualified stool-type outcomes, confounder review and source-correction invalidation, not automatically calculating rho from merely aligned pairs. Re-run golden digestive, historical date, General Only privacy, nutrition completeness, cache and immediate-safety tests on each release SHA.

## 2026-10-16 — PIQ-4.1 independent contrast and confounder-screen engineering, exact CI GREEN

**Working branch / handoff:** `piq/00-baseline-20261014`; exact code/test commit `64ec97950d881c48e68358b7bba0cb3d71dd13ba`; [GitHub Actions 38940866587](https://github.com/daurham/daurham-health/actions/runs/38940866587) **SUCCESS** on this SHA (npm ci, TypeScript, ESLint, entire Vitest suite and production build). This subsequent docs-only `[skip ci]` checkpoint does not redefine the tested code SHA. PIQ formal owner acceptance remains **0/9**; migration code head `0056_primary_goal_intent_events.sql`, deployment schema and actual Auth/DB isolation unknown.

**Implementation:** Extended `src/domain/ask-health/digestive-pairing.ts` (called by `server/ask-health/load.ts` using *already-loaded* dated daily context tags and the existing 90-day reconciled Bristol/date frame) with independent *contrast-readiness* checks. Distinguishes at least 12 aligned complete-type stool days across 4 calendar weeks from whether the *saved hard-Bristol proportion actually varies between recorded bowel days* (>=0.2 difference) and whether verified reliable complete-day fiber *actually varies* (>=2g between aligned dates). Invariant stool/fiber series cannot become a personal association simply through large pair counts. No new SQL or migrations; context narrative notes are NOT consumed by this derivation.

**Alternative explanation quality gate:** Date-local or preceding 0–2-day saved daily-context tags (illness, travel, alcohol, late meal, unusual stress, sleep interruptions, pain, new supplement, medication change, physical labor) require further review. Tags only document the owner's label, not that the event caused a symptom. No tag is not proof nothing changed; no causality is computed. Changing saved *water event* totals on the same exposure dates as varying verified fiber also triggers context review; water events remain incomplete fluid intake. Any candidate still feeds a **non-substantive readiness marker**, not an actual `intelligence.relationship`, coefficient, medical diagnosis, or calorie-coaching action. New quality-screen coverage output describes uncertainty and missing logs.

**Synthetic regression tests:** `tests/piq4-digestive-context-review.test.ts` exercises variable fiber + mixed saved Bristol patterns, invariant type 1–2, invariant fiber, supplement/medication tags, travel during a two-day lag interval, note-only/rest context, simultaneously increasing fiber and logged water, sparse fiber and provisional/partially typed bowel events; prior `tests/piq4-digestive-pairing.test.ts` adjusted to require no invented stool variation. Tests/build all GREEN on exact SHA.

**Runtime deployment / owner data:** No prod/main promotion, no Neon writes/migrations, no paid model call, no DB access to private owner rows, and no environment or Auth changes. Vercel preview for these exact changes was not verified READY; earlier Vercel build-rate restriction remains a blocker. Production `health.daurham.com` still pointed to existing main deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64` when checked. Never interpret CI build alone as authorization to run private records through development Auth; cloned preview parent data may be sensitive. Exact runtime binding attestation, isolated test owner, human-reviewed samples, verified encrypted backup+restore and explicit owner release authorization remain release gates.

**Next PIQ-4.1 target:** Audit stale-in-flight snapshot correction, duplicate/stale daily context source behavior, stronger longitudinal stool coding coverage and minimum independent windows, and avoid accidental elevation of the generic `bowel.count` relationship as a `Bristol`-specific claim. No clinical/causal analysis until these guards and owner-run evaluations pass.

## 2026-10-16 — PIQ-4.1 saved event-ID+date correction reconciliation CI GREEN

**Exact validated code:** `f93240bfec4f42411adb4a1fd42886e426e9a025`, GitHub Actions [38942513613](https://github.com/daurham/daurham-health/actions/runs/38942513613) **SUCCESS** (npm ci, TypeScript `tsc -b`, ESLint, complete Vitest, app build). This appended documentation-only checkpoint is `[skip ci]` and not an additional validation of changed application code. Dev branch `piq/00-baseline-20261014`. Formal PIQ acceptance still **0/9**.

**New release-blocking correctness safeguard:** The first snapshot and later read-only grouped Bristol query previously reconciled event *counts* only. If the owner deleted/re-added a different bowel event on the same date, or moved IDs between dates while keeping daily counts unchanged, stale results could appear consistent. New pure bounded `bowelSnapshotEventIds` takes at most 90 days and 512 **existing** saved IDs from the canonical snapshot, attaches each ID to the original date, verifies uniqueness/counts and fails closed if invalid. A read-only grouped SQL query `LEFT JOIN unnest($3::uuid[], $4::date[])` compares both **ID and bowel date** against actual events; only a grouped matched-event **count** per date is retrieved (no note/text/individual-ID column). Pure `summarizeBowelWindow` rejects missing or unequal matched counts and withholds substantive full-window and downstream pair evidence; a refreshed, newly matching snapshot can again qualify. Extra tests cover same-date replacement, date swaps, stale/duplicate/invalid IDs, and the earlier source/temporal/privacy/quality suites.

**Race/privacy limits:** No shared repeatable-read transaction yet covers the independent snapshot, context/fiber, sample, and grouped queries. A concurrent correction after reads may affect a single in-flight response; this narrow guard only proves matching recorded bowel identities for two specific read moments. No general guarantee about completeness of bowel logs, safe inference, hydration, stool diagnosis, confounders, or causal relationships. The model receives no raw IDs. No production Neon records were accessed, no env/migration/backup change, no owner-data testing, and no paid AI invocation. Production alias `health.daurham.com` confirmed unchanged at deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. Vercel build-rate limitation means there is **no verified READY preview for this exact commit**.

**Next guarded work:** Investigate better transaction/snapshot-consistent owner reads and correction invalidation, plus baseline Bristol reporting completeness before considering independent-window correlations. Owner-approved disposable preview identity + database/auth isolation, encrypted backup+verified restore, migration preflight and human Ask Health tests are prerequisites to live QA, migrations and main release. PIQ-4.1 remains engineering-in-progress; acceptance **0/9**.

## 2026-10-16 — PIQ-4.1 independent fiber/water/context read-time consistency recheck CI GREEN

**Exact code and synthetic-test SHA** `6b1a0eeec249924b14b686b712ecee9544521207`; [GitHub Actions 38944207255](https://github.com/daurham/daurham-health/actions/runs/38944207255) **SUCCESS** on that exact code (npm ci, `tsc -b`, ESLint, all Vitest and production build). GitHub remote branch `piq/00-baseline-20261014`; note-only checkpoint `[skip ci]` is not a new code validation. PIQ formal owner acceptance **0/9**; migration code 0056 remains unapplied/owner gated, actual production schema unverified.

**Implemented:** `src/domain/ask-health/digestive-consistency.ts`, `server/ask-health/digestive-consistency.ts`, `server/ask-health/load.ts`, `src/domain/ask-health/focused-digestive.ts`, `src/domain/ask-health/packet.ts`, synthetic `tests/piq4-digestive-consistency.test.ts` and updated `docs/ai/PIQ4_DIGESTIVE_PAIRING_CONTRACT.md`. Only after bounded 90-day Bristol event ID+date reconciliation, cross-domain bowel+fiber/water questions or opt-in Deep Dive trigger three **read-only scoped rechecks**: (1) the **existing** source-revision-matched verified nutrition day query plus fiber/kcal and source ID totals, (2) logged-water identities and mL total, (3) saved daily-context date+tag pairs. No free-text narrative context notes, raw event IDs or mutable owner records enter Ask Health's evidence. Missing/new/edited fiber or water rows, quality-verification changes, or changed context tags cause the derived stool/fiber/water pairing to be **withheld** with a neutral non-substantive source-consistency marker. Separately identity-verified bowel window evidence remains distinct. The sampled cross-domain Bristol screen and displayed focused fiber/water examples are withheld when paired input consistency fails. Query error also fails closed for pairing. Context comparison is **only within the exact user-requested history range**, excluding provisional today, so unrelated notes/tags in the wider selected period do not disqualify it.

**Synthetic regression proof:** Original `21d75ef` passed full CI 38943690782; follow-up `6b1a0ee` changed only range scoping and added historical context tests, then again passed full CI 38944207255. Tests cover matching known inputs, same-ID revised fiber value/calories, removed/new source rows, changed water mL/identity, added/removed/edited/duplicated context tags, boundaries, provisional today, invalid scope and packet suppression when consistency fails. **No private owner-data/SQL runtime verification has occurred**, only synthetic logic and build validation.

**Residual race/clinical limits:** This is an **optimistic post-snapshot recheck, not a shared repeatable-read transaction**. The separate bowel, nutrition, hydration and context SQL statements can observe different read moments, and records can still change **after** the last check. Broader Ask Health progress/intelligence observations are not globally transactional or fully invalidated by this one digest-specific guard. It cannot certify total fluids, stool tracking completeness, causality, symptom diagnosis, or supplement adverse effects. A later release gate must evaluate consistent transaction/owner revision design and whether generic `bowel.count` correlations need suppression on source conflict. No Coach recommendation or calorie target mutation is authorized.

**Environment:** Vercel `health.daurham.com` independently confirmed unchanged at production deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`; latest code not verified as READY on a preview due to build-rate limit. Did not query actual owner health records, modify Neon, apply migrations, change env/Auth, invoke paid Gemini, promote or merge to main. Exact deployed DB/Auth identity isolation, cloned preview privacy, disposable test owner, read-only migration preflight, verified encrypted backup/restore and owner-reviewed answers remain release prerequisites.

**Next:** Evaluate database read-boundary and whole-packet invalidation strategy before clinical-style interpretation, then independent-window robustness and stool-reporting completeness. PIQ-4.1 is still engineering-in-progress, formal phase acceptance 0/9.

## 2026-10-16 — PIQ-4.1 packet-wide stale digestive intelligence suppression, exact CI GREEN

**Validated code:** `23a7513fb86c4b6d91c0f64b099fecb67641cc46` on branch `piq/00-baseline-20261014`. [GitHub Actions 38945887236](https://github.com/daurham/daurham-health/actions/runs/38945887236) **SUCCESS** (npm ci, `tsc -b`, ESLint, entire Vitest suite, production build). Documentation-only checkpoint `[skip ci]` is not an additional app-code validation. Formal owner acceptance **0/9**.

**Why needed:** PIQ-4.1's new optimistic source recheck already withheld `digestive.pairing.*` and focused water/fiber examples on mismatched independently read bowel/nutrition/water/context, but `addSharedIntelligence` still emitted earlier snapshot-derived relationships, baselines and coverage involving **the same unreliable sources**, and `contextSummary` could still mention them. Separate ID/date source conflict could still leave sampled Bristol examples from the obsolete snapshot. Moreover generic `bowel.count` Spearman rho measures bowel **frequency**, never stool consistency.

**Implementation:** New pure `src/domain/ask-health/digestive-packet-guard.ts` determines evidence-limiting state and filters the *routed* intelligence before `buildAskHealthEvidencePacket` produces selected evidence, context summary, and fingerprint. When cross-source reread has failed, remove shared fiber `nutrition.fiber_g`, water `hydration.ml`, and bowel `bowel.count` coverages/baselines/interventions, any relationship using one of those signals, related `knows/missing` context, stale overview nutrition and date-context evidence for that response; preserve unrelated activity/sleep etc. If canonical bowel ID/date reconciliation fails, suppress focused bowel observations, bowel-based shared intelligence and sampled Bristol derived evidence, but preserve neutral unavailable limitation. For any Bristol/stool-consistency/symptom question, withhold generic `bowel.count` correlations regardless of its source agreement: movement count correlation is not evidence of stool hardness, Bristol class or cause. Historical/frequency-only questions can still show genuine count-based associations when independently eligible. Existing packet fingerprint is already generated from filtered evidence/contextSummary, so conflicting prefiltered text is not available through a stale selected packet. No new DB query, migration, AI model request or owner data read.

**Tests:** `tests/piq4-digestive-packet-guard.test.ts` adds synthetic stale fiber/water/bowel relationships and context, verifies removing stale shared rho, other derived intelligence, focused examples, packet summary/fingerprint, frequency-vs-consistency distinction, ID/date mismatch handling, and retention of unrelated sleep/steps evidence. Entire repository CI passed on exact code SHA. No production change.

**Deployment verification:** Vercel deployment listing confirmed an exact-SHA **READY preview** `dpl_HDbkWoqC9aSTHG7Q7z25AFEkHmZg` at `daurham-health-oz1r9kwxh-daurhams-projects.vercel.app`. **READY only establishes build/deployment, not runtime DB/Auth identity isolation or permission to use owner data.** Production `health.daurham.com` still resolves to unchanged deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. No promotion, migration, paid Gemini, authenticated preview test, owner data read, private data import or env change performed. Earlier Vercel build-rate limit is no longer blocking this exact preview, but runtime safety gates remain.

**Next:** Read-only runtime DB/Auth binding attestation and disposable preview owner (only with owner permission) plus controlled owner-reviewed evaluation, or further safe static work on stool recording completeness and independent-window robustness. No claim that full Ask Health packet reads are one atomic DB snapshot; wider independent source reads and post-recheck edits still have race windows. Latest schema/migrations unknown; encrypted verified backup/restore and release approval gates still open. Phase acceptance remains **0/9**.

## 2026-10-16 — PIQ-4.1 grouped source verification now shares one statement snapshot (FULL CI GREEN)

**Development commit:** `3154c514985972e5d0840d3cb381c8c6e7743e44`, on `piq/00-baseline-20261014`; [GitHub Actions 38946983236](https://github.com/daurham/daurham-health/actions/runs/38946983236) **SUCCESS** on the exact SHA: install, `tsc -b`, ESLint, full Vitest and production build. This later docs-only `[skip ci]` checkpoint is not an additional app test. Formal owner PIQ acceptance **0/9**; PIQ-4.1 engineering in progress.

**Implemented:** Read-only `server/ask-health/digestive-consistency.ts` now executes **one PostgreSQL statement** for the final fiber/water/daily-tag source recheck. It uses existing owner-confirmed complete and current-revision nutrition SQL unchanged, bound dates <=90d, and CTEs for grouped fiber/calories/source IDs, logged water/IDs, and dated saved context tag keys. A single SELECT returns exactly one row with three bounded JSON arrays. PostgreSQL supplies a single statement-level MVCC view for these THREE rechecks. Existing pure `digestivePairingSourcesAgree` still rejects missing/new/revised values, changed IDs, stale days or context tags. Bad/missing/malformed/duplicated response rows or SQL failures fail closed. `tests/piq4-digestive-consistency.test.ts` gained injected read-only fake SQL tests that verify exactly one query, parameters, source revision usage, input scope, and fail-closed errors. No raw owner notes, SQL error messages or ID lists are sent to Health AI. No schema migration, database write, owner-data query or paid model execution.

**Exact limits:** This *improves* consistency among fiber, water and context data at the LAST reread, but the earlier canonical source reads, sampled Bristol reads, bowel ID+date check, and all unrelated Ask Health domains remain independently timed; subsequent owner edits after this statement are not caught. It is not an end-to-end transaction, evidence of sufficient stool completeness or a clinically qualified correlation. Continue withholding person-specific cause/treatment/supplement recommendations.

**Non-secret runtime metadata assessment (2026-10-16):** Neon production branch `br-sparkling-dust-aw1q03rt` and preview branch `br-damp-pine-aw5cconp` have distinct compute endpoints, and the preview branch's metadata marks `init_source=parent-data` (personal-record clone, not a disposable empty test tenant). Vercel project metadata lists `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `DATABASE_NEON_AUTH_BASE_URL`, `HEALTH_OWNER_USER_ID` and related keys targeted to **both production and preview** without a branch-specific override in these listed env entries. This by itself does NOT prove whether their effective runtime values match or differ or whether dynamic Neon integration overrides them. Effective deployment database host, Neon Auth tenant/session, safe disposable preview owner and identity isolation remain **unattested**. Do not sign into preview with production owner identity, test on cloned personal records, alter credentials or promote main. No secret values were read. Production `health.daurham.com` still confirmed at READY main deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. Prior exact-code `23a7513` had READY preview `dpl_HDbkWoqC9aSTHG7Q7z25AFEkHmZg`; no new exact-`3154c51` READY preview was confirmed during this check. GitHub build success is not runtime attestation.

**Next:** Develop safe non-secret runtime binding proof + protective opt-in flag/isolated test owner plan for later owner-approved QA. Continue stool tracking completeness and independent-window study designs using synthetic tests. Never apply `0056` migration or owner QA before isolated auth/DB attestations, encrypted recovery copy/verified restore, schema preflight and user release authorization.

## 2026-10-16 — PIQ-4.1 preview QA isolation preflight, exact CI GREEN

**Code SHA:** `0c464a45f4e923d6113ff430a90bdd85694888dd`, branch `piq/00-baseline-20261014`, [GitHub Actions run 38948332648](https://github.com/daurham/daurham-health/actions/runs/38948332648) **SUCCESS** (npm ci, tsc, ESLint, full Vitest, build). Vercel exact-SHA preview `dpl_8evf4sa3bD4SSiNb1HKjrbzhnQd1` **READY**. Production `health.daurham.com` still independently verified at `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. Docs-only follow-up checkpoint `[skip ci]` does not redefine validated code.

**Implementation:** `server/piq-preview-preflight.ts`, `tests/piq4-preview-preflight.test.ts`, `docs/ai/PIQ4_PREVIEW_QA_GATE.md`, npm script `piq:preview-preflight`. New pure `reviewPiqPreviewSafety({env,neonBranch})` combines the already-existing database+Auth binding validators, requires their runtime enforcement flags, exact full commit SHA pin, explicit non-production disposable owner ID, independent Neon API metadata matching project/branch, and **empty-origin non-production Neon branch**. Parent-data clones, uncertain origins, mismatched identities, stale commits and missing metadata fail closed. Results emit only enum blocker codes; no DB/Neon/Auth session, health-row, credential read, host or personal owner ID is printed. Standalone CLI intentionally returns BLOCKED when it has no provider-sourced metadata. Even a static success is only `configuration_eligible_for_manual_attestation`, **never permission to log into a preview or assume there are no private health rows**.

**Preview reality:** Confirmed metadata for branch `br-damp-pine-aw5cconp` reports `init_source=parent-data` from production `br-sparkling-dust-aw1q03rt`. This **blocks preview owner-data QA** under the new guard regardless of the READY preview. Vercel DB/Auth env keys are targeted to preview and production; values/effective runtime routing and Auth tenant/session isolation have not been attested. **Do not reuse a production account, delete/replace the cloned Neon branch, or initiate tests using the copied health data.** No migration 0056, deployment promotion, env/credential mutations, paid Gemini, private DB reads or backup modification were performed.

**Next:** Continue synthetic Bristol reporting-completeness and independent-window readiness checks; separately design owner-approved empty/sanitized QA environment with runtime binding attestation, encrypted recoverable backup plus verified restore, schema preflight and human answer acceptance before releasing. PIQ formal owner acceptance **0/9**. CI and READY preview are not approval to promote main.

## 2026-10-16 — PIQ-4.1 separated observation-window/diary-continuity gate CI GREEN

**Exact validated code:** `040abcf7d3825772f3cef639fef3efb5f94002d2` on `piq/00-baseline-20261014`, [GitHub Actions 38949420254](https://github.com/daurham/daurham-health/actions/runs/38949420254) **SUCCESS**: `npm ci`, TypeScript, ESLint, full Vitest, and production build. Initial `f10cc3c` run failed ONLY on unused index in a new synthetic fixture; this was fixed and the full suite reran green on `040abcf`. A subsequent docs-only `[skip ci]` checkpoint is not additional application validation. Formal PIQ owner acceptance remains **0/9**.

**Engineering increment:** `src/domain/ask-health/digestive-pairing.ts`, `src/domain/ask-health/packet.ts`, `tests/piq4-digestive-context-review.test.ts` and `docs/ai/PIQ4_DIGESTIVE_PAIRING_CONTRACT.md`. A 12-pair / 4-calendar-week minimum could misleadingly qualify an extremely clustered series or long, unreported diary gap. Existing non-substantive `candidate_for_review` now ALSO requires:
- **Two scope-anchored, non-overlapping 14-calendar-day bins**, each with at least four distinct eligible stool+exposure paired dates; this screens for at least two observation segments. They are **not** independent clinical trials, interventions, effect estimates, experimental replications, or causality.
- **No more than seven consecutive dates with unknown bowel status between the first and last explicitly recorded bowel-status day** in the selected scope, ignoring provisional today. An explicit owner-saved zero bowel count is observed status but is **not a stool-type outcome** and cannot be turned into a fiber pair; an unlogged day is UNKNOWN, not no movement. Unknown time preceding/following that active span is not assumed complete and the whole period remains unverified.
- The prior verified fiber/day, Bristol-typed stool, variation, context/confounder and saved ID+date source-reconciliation guards continue to apply.

**Packet:** Adds only aggregate coverage fields (selected calendar days, recorded-status days, unknown days, longest unknown stretch, qualifying separated bins), with explicit notice that a short unknown-gap streak **does not verify a daily bowel diary**. A mostly one-fortnight cluster or unknown >7 day gap yields `insufficient_separated_windows` or `incomplete_bowel_diary` rather than `candidate_for_review`. Never turns a quality screen into an association, medical diagnosis, water sufficiency claim or actionable recommendation.

**Synthetic tests:** 12 pairs across 4 weeks with 11 pairs in one bin and one outlier, two strong clusters separated by >7 unknown days, repeated explicitly saved no-movement statuses covering the gap (no outcome inflation), and ordinary qualified event series with many unknown days outside active span; initial behavioral tests remain green. No extra SQL, schema migration, paid AI call or owner-data read.

**Runtime and release:** No main merge, Vercel promotion, Neon write, Auth/env change or owner login. Production `health.daurham.com` independently verified unchanged at deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. Prior preview Neon branch `br-damp-pine-aw5cconp` was cloned with `init_source=parent-data`: preview owner QA is BLOCKED by `server/piq-preview-preflight.ts` regardless of Vercel readiness. Need owner-authorized disposable empty/sanitized QA environment, runtime DB and Auth isolation, encrypted backup+verified restore, read-only schema/migration preflight, actual human reviewed Ask Health cases, and explicit release authorization before promoting. Formal owner acceptance **0/9**.

**Next:** Assess semantic completeness labels to ensure no claim of stool-frequency trends on unknown diary days, extend phase exit tests on 1-day historical questions / General Only / urgent symptom safety / zero-log semantics and independent-window edge cases. No personal association coefficient or clinical trial claim until authorized QA and acceptance.

## 2026-10-16 — PIQ-4.1 final historical/privacy/symptom boundary regressions CI GREEN

**Exact CI-validated code:** `f3f8366e969f0b5acbebeb64723aa12fb611ba24` on `piq/00-baseline-20261014`, [GitHub Actions 38951133116](https://github.com/daurham/daurham-health/actions/runs/38951133116) **SUCCESS**: npm ci, `tsc -b`, ESLint, full Vitest, production build. Vercel exact-code preview `dpl_AENbcQmQqs5uS7xi8uBNZTU7yzWB` **READY** (not an owner-QA or DB/Auth privacy attestation). Docs-only follow-up checkpoint is `[skip ci]`, not a new code test. PIQ formal owner acceptance **0/9**.

**Root issue #1:** A correctly reconciled single-day window with **no saved bowel status at all** previously emitted `digestive.window.bristol.value=0`, inviting a false statement of zero hard stools. `src/domain/ask-health/packet.ts` now uses `value:null` and `unit:null` and explicitly says **no status is saved, so movement and hard-stool outcomes remain unknown**. An explicitly saved zero-day status still emits the supported count zero and distinguishes it from missing. Sampled or wide period values never substitute for an unrelated named date. Quality counters (e.g. zero saved events) are not evidence of no bowel movement.

**Root issue #2:** Deterministic `detectImmediateSafety` previously handled chest/breathing/severe bleeding/stroke/current self-harm but missed clear current severe GI reports. A narrow first-person present-tense matcher now recognizes reports such as *"I am vomiting blood"*, *"I have severe abdominal pain"* or *"I am passing black tarry stools"*. Existing safety response short-circuits before the private record loader, AI model, and billable gate. Historical, educational, hypothetical and negated statements do not automatically become current emergencies. This detector is intentionally not a complete GI triage system, diagnosis, or substitute for a clinician; do not infer urgency from recorded Bristol classes alone.

**Root issue #3:** Stool-type questioning phrased as *rabbit pellets/droppings* previously could miss the digestive topic or fail to suppress generic `bowel.count` correlation. Shared question-topic and packet guard now recognize those terms and prevent using **movement frequency rho** as a personal stool-type association.

**Validation:** Added `tests/piq4-digestive-exit-regressions.test.ts` with synthetic historical requested dates (unknown vs explicit zero vs typed recorded event), real Ask Health service General Only privacy route (never invokes owner loader or provider), real immediate-emergency safety short circuit (no owner records, paid model or budget), non-emergency counterexamples, and stool-type terminology. Prior PIQ tests remain green. No private owner rows, auth sessions, credentials, Neon mutations, schema migrations, paid Gemini or main promotion involved.

**Environment:** Production `health.daurham.com` independently confirmed still at deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. Preview Neon branch `br-damp-pine-aw5cconp` has parent-data cloning; ready preview may NOT be used to log into/QA inherited personal records. Stronger preview effective DB/Auth runtime binding, disposable empty/sanitized owner, encrypted recovery with verified restore, read-only migration/schema preflight and human owner-reviewed Ask Health test matrix remain release blockers. CI/build alone cannot complete clinical/owner acceptance.

**Next:** Evaluate PIQ-4.1 engineering exit criteria (static completion vs owner QA), prepare safe execution checklist and acceptance matrix for an isolated test instance, and do not consider main promotion or `0056` migration until owner approves environment and recovery plan. Approximate engineering progress **98%**, formal owner acceptance **0/9**.

## 2026-10-16 — PIQ-4.2 FIRST SLICE: source-qualified weight/intake evidence in Ask Health — CI GREEN

**Exact validated code:** `90304a1f4e5ff3476158ad3549911639a6725712` on `piq/00-baseline-20261014`; [GitHub Actions 38954604831](https://github.com/daurham/daurham-health/actions/runs/38954604831) **SUCCESS** (npm ci, TypeScript, ESLint, complete Vitest suite, production build). App changes remain **branch-only**. This subsequent docs checkpoint `[skip ci]` does not redefine the CI-validated application commit. Formal owner acceptance remains **0/9** and the overall PIQ engineering estimate stays **roughly 50–60%**, not the 98% achieved for the separate PIQ-4.1 engineering slice.

**Work:** New `src/domain/ask-health/focused-weight-energy.ts`, `tests/piq4-weight-energy-context.test.ts`, `docs/ai/PIQ4_WEIGHT_ENERGY_CONTRACT.md`, plus existing Ask Health packet/input/loader wiring. For undated weight-loss/plateau/energy-balance questions or explicit Deep Dive, use **only the already-loaded** `HealthIntelligenceSnapshot` and **existing** `buildMaintenanceState` to screen qualified calendar windows. Confirm source-complete nutrition dates from `dayCompleteness='verified_complete'` + reliable quality and unique nonempty source IDs + available completeness status. Exclude provisional today. Pass the exact whitelist to the maintenance engine's already-screened **28/21/14-day** weight/intake alignment, comparability, robust Theil–Sen slope and uncertainty calculation. No new SQL or alternate calorie/TDEE formula.

**Ask Health evidence:** Emit non-substantive `weight_energy.quality` for readiness, substantive `weight_energy.observed_balance` **only if the existing estimator has a qualified window**, and non-substantive `weight_energy.decision_boundary` clarifying that a current authoritative active weight-goal version, target revision, competing experiment checks and comparable strength/e1RM trend have NOT been verified. Thus do **not** export owner plateau classification, maintenance intervention/cut recommendation, automatic calorie target, proven calorie deficit, measured TDEE, fat-loss conclusion, or verified strength preservation. Training session and wellness log counts are context, not strength or adequate recovery. Missing nutrition/weight data remain missing. No narrow historical day/week query is answered with a trailing-28d estimate. General Only gets no owner packet/weight focus, Deep Dive can opt into bounded cross-domain context.

**Validation and correction:** Initial `e70de82` CI failed one overly strict fixture: a 14-day recent complete series legitimately qualified via existing **14-day fallback** (not a bug). Corrected at `f7e5648`: an early-only, temporally disconnected 14-day calorie series is rejected, plus valid 14-day fallback regression. A subsequent review caught a real **count-window bug** in the insufficient-estimate path: `qualifiedWholeDayCalories` previously counted all older verified days within a broad 90-day selection although the engine quality was about its fallback recent 28 days. Fixed at `90304a1` to bound verified dates, logged Training and wellness status, and emitted period to exactly the selected 28-day fallback (or its overlap with snapshot) or qualified 28/21/14-day window. A 90-day fixture with only old verified food days now reports zero recent eligible dates, not 12 of 28. All tests, TypeScript, lint and build passed on the final SHA. Prior experimental runs are not used as release evidence.

**Remaining PIQ-4.2:** Add separately **version-verified** owner directional goal/intent, current target, active experiments and protein/strength-performance preservation constraints before any plateau classification or decision advice. Validate sodium/carbohydrate, fluid/bowel, supplement/context scale-noise alternatives without asserting causality. Incorporate historical-interval evidence without borrowing another time window. Prepare owner-reviewed optional Personal Lab calibration and meaningful real-question QA. PIQ-4.3–4.6, PIQ-5–7 and all 0/9 formal owner acceptance still remain. These tasks are not replaced by the new estimate display.

**Privacy/release:** No owner record read, SQL query, credential read/change, paid AI invocation, migration, main merge or Vercel production deployment. Production alias `health.daurham.com` still independently verified at READY deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. The PIQ preview Neon branch is known to be parent-data cloned and NOT suitable for owner-data QA. The exact `90304a1` Vercel preview readiness was **not confirmed** by deployment lookup; GitHub CI success is not a preview runtime attestation. Migrations through `0056` remain owner-gated; no promotion before DB/Auth isolation, verified encrypted recovery, migration/schema preflight and explicit owner acceptance.

## 2026-10-16 — PIQ-4.2 SECOND SLICE: verified sodium/carb scale context, full CI GREEN

**Validated application commit:** `3398af63b58b115679c0e9e028a1516cb2dd4f17` on `piq/00-baseline-20261014`, [GitHub Actions 38957258842](https://github.com/daurham/daurham-health/actions/runs/38957258842) **SUCCESS**: npm ci, TypeScript `tsc -b`, ESLint, complete Vitest and production build. Initial implementation `c050e55` was superseded by a test wording correction `62df548` (its CI then caught that `AskEvidence.coverage` requires scalar values). `3398af6` flattens the comparison counts to supported scalar coverage keys. Only the final SHA is claimed validated; earlier superseded or failed commits are NOT release evidence. Documentation checkpoint `[skip ci]` is not a further validated app change.

**Behavior:** The first PIQ-4.2 slice already reused the established maintenance engine to assess only independently owner-confirmed complete-day calorie intake vs comparable weight over a recent 28/21/14-day window, without inferring an owner plateau or recommending a calorie cut. The second slice adds a **non-substantive** `weight_energy.scale_context` item by reusing *the same engine's* registered recent sodium/carbohydrate noise candidates (`maintenance.noiseFactors`). Its existing strict qualification compares 3 recent vs 7 baseline dates with at least 2 and 4 separately owner-confirmed, source-reliable days, matching calorie/nutrient source-entry IDs, and a meaningful recorded rise (sodium >=500mg & >=20%; carbs >=50g & >=20%). Only sodium and carbohydrate candidates are forwarded in a bounded, existing Ask Health packet; the engine's weaker logged-water and bowel-frequency suggestions are explicitly excluded from weight interpretation because event-log completeness cannot be established. No separate correlation, metabolic equation, new DB query, provider request or autonomous intervention is introduced.

**No false negatives:** If the conservative comparison has no eligible candidate, the evidence says `no_qualified_comparison` (NOT stable intake, absence of fluid/GI effects or certainty of no confounding); absent owner dates, unconfirmed/estimate-heavy food days, mismatched nutrient/calorie source IDs, and provisional today cannot pass. Qualified descriptions say only what was *logged* and note that any water-weight explanation is general physiology, not a demonstrated personal cause or proof of fat-mass change. Evidence only names aggregate source types and counts, no raw owner IDs, saved notes or unbounded history, and is captured in the selected-packet cache fingerprint. The usual unmet weight-goal, active target/experiments, and strength-performance preservation verification still remains **not checked** in this Ask Health slice; there is NO plateau state, calorie adjustment, muscle-preservation conclusion or approved Personal Lab intervention.

**Synthetic tests:** `tests/piq4-weight-energy-scale-context.test.ts` validates independently verified rises in both sodium and carbs, unverified/incomplete day rejection, nutrient-vs-calorie ID mismatch, today's provisional observation exclusion, non-promotion of logged water/bowel event changes, historical-day/week out-of-range/no substitution, General Only exclusion, and cache material change. All full CI passed.

**Runtime:** Code branch only, no migration, owner-data read/write, credentials/env modification, paid AI call or main promotion. Production alias `health.daurham.com` still independently verified at `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. Exact-`3398af6` READY preview was NOT confirmed by current Vercel listing; even if READY, the known preview Neon child is parent-data-cloned and is NOT cleared for owner Auth/health QA.

**Next:** PIQ-4.2 source-versioned owner weight goal and live calorie target check, active/soon experiment and comparable exercise-strength preservation evidence, actual temporal scope and contradictory explanations before decision advice. Reuse existing Goal Control, `maintenance`, and performance-safety logic rather than inventing model interventions. Owner-certified data, encrypted restorable backup, migration/schema preflight, runtime isolated QA, genuine question acceptance and explicit release authorization still required. PIQ overall rough engineering estimate remains around midprogram (~50–60%); formal owner acceptance **0 of 9**.

## 2026-10-16 — PIQ-4.2 third slice: exact dated weight/intake evidence (CI GREEN)

**Exact CI validated app commit** `0fc0f7d16d5414559a4f96f3ffb3a47f33ecef29` on `piq/00-baseline-20261014`. [GitHub Actions 38958554527](https://github.com/daurham/daurham-health/actions/runs/38958554527) **SUCCESS**: `npm ci`, TypeScript, ESLint, all Vitest tests and production build. Initial `8247638` run failed TypeScript because the evidence coverage schema requires scalar string/number/null rather than booleans. Corrected coverage and hardened packet projection on `0fc0f7d`, fully revalidated. The following docs-only `[skip ci]` commit is **not** additional code validation.

**Behavior:** `src/domain/ask-health/focused-weight-energy-history.ts` reads only the exact selected calendar date from an **already-loaded** Health intelligence snapshot when the owner explicitly asks a weight, scale or calorie/energy question about one unambiguous ISO date, today or yesterday. It reuses the tested historical-date parser: future/out-of-range dates and provisional today emit only neutral date-scope context; ambiguous/invalid/multiple dates or periods remain unsupported without borrowing a recent observation. For an eligible historical day, a saved finite positive weight with unique nonempty source IDs may be reported, with its usual/different/unknown conditions; a calorie value is shown **only** with current available verification, owner-confirmed complete-day/source-identified reliable food totals and high-confidence source quality. Missing/unverified intake is **unknown**, never zero. Both data points are strictly scoped to one date and explicitly cannot prove energy deficit, fat loss, plateau, measured expenditure or calorie target safety.

**Packet and privacy:** `server/ask-health/load.ts` supplies `focusedWeightEnergyDay`; `src/domain/ask-health/types.ts` and `packet.ts` add `weight_energy.historical_day.{coverage,weight,calories}`. For this narrow one-day evidence path, the packet filters **all other undated generic evidence**, stale/current goal/Coach/broad intelligence contexts and notes before model selection and fingerprint, keeping only `ask.range` and the exact date facts; `contextSummary` is empty. General Only does not construct the focus. Tests cover exact date, missing weight, different conditions, unverified or duplicate food source IDs, historical/as-of and future scope, unresolvable periods, General Only, and cache fingerprint on a corrected same-day logged amount. No source IDs or personal notes sent.

**Phase state:** PIQ-4.1 digestive engineering substantially completed; PIQ-4.2 now has source-gated recent 28/21/14-day descriptive maintenance, qualified sodium/carb scale context, and **one-day historical retrieval**. Still missing separately version-confirmed current weight goal/target, experiment/recovery and strength preservation checks, bounded historical multi-day reasoning, and real answer-quality/owner QA; PIQ-4.3–4.6 and PIQ-5–7 not replaced by this slice. Program estimate remains **~55% engineering overall**, not 98% across the program. Formal owner acceptance **0/9 PIQ phases**.

**Runtime/approval:** Production `health.daurham.com` confirmed unchanged at `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. Exact-code preview READY **not confirmed** by query. Existing PIQ preview has parent-data-cloned Neon and cannot be used with real owner records until isolated QA/database/Auth credentials independently verified. No migration, read of health data, credential change, Neon write, paid model, main merge or production rollout. Migrations through `0056` remain gated; owner must separately authorize protected environment/recovery/read-only schema checks and formal rollout.

**Next bounded PIQ-4.2 work:** Prove that individually accepted historical data does not silently become a longitudinal correlation (currently no such calculation) and then design a verified historical **week-range** quality screen requiring comparable weigh-ins and completed whole-day intake, without manufacturing daily deficits or stale goal targets. Keep goal/target/strength decision gate closed until revision-matched owner data is independently attested.

## 2026-10-16 — PIQ-4.2 named historical weight/intake windows, full CI GREEN

**Validated application SHA:** `e1052b025ee1190006afa7d40516a92818b06705` on `piq/00-baseline-20261014`, [GitHub Actions 38960264523](https://github.com/daurham/daurham-health/actions/runs/38960264523) **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest, build). First implementation `56394dc` failed TypeScript because evidence coverage was mistakenly a boolean rather than the contract's scalar; corrected to safe string and added natural-language `eat/eaten/consume` trigger before rerunning full CI green. The docs-only `[skip ci]` checkpoint is not a second code validation.

**Behavior:** New pure `src/domain/ask-health/focused-weight-energy-window.ts`, existing strict `digestDateSelection` parser, Ask Health loader/types/packet wiring, and `tests/piq4-weight-energy-window.test.ts`. Named last/this week, last/this month or supported last/past N days resolves to a single bounded, inclusive *selected-as-of* calendar interval, never a recent maintenance 28-day estimate or current-day substitution. If requested interval is out of selected range, future relative to selected as-of or ambiguous/multiple date expressions, output contains neutral range disclosure only; no clipped totals. The entire packet is projected down to `ask.range` and `weight_energy.historical_window.*`; undated body/nutrition averages, unrelated goals, current clinical profile, global intelligence and notes are not sent, and context summary is empty. General Only service remains private-record-free.

**Data quality:** Within scope, only completed Health-local days with source-unique, positive finite, high-confidence, owner-confirmed reliable **whole-day** calories (canonical nutrition revision/eligibility already in the shared snapshot) contribute to an average over **verified dates**, never all calendar days. Today is excluded even if erroneously marked complete. An observed body weight delta is reported only with at least **three usual-condition weigh-ins spanning six or more days and within two days of BOTH selected interval boundaries**. The endpoints are named as a sampled weight difference, NOT a fat-mass change, energy balance, measured TDEE or verified plateau. Missing/differently recorded weights never mean unchanged weight; unverified food intake never means zero. This does not inspect the current goal version, active experiments or verified comparable lifting strength; all calorie intervention changes remain unauthorized.

**Tests:** synthetic exact previous-week calorie/weight question with newer unrelated observations; scoped source-ID/verified food mismatch, missing records/different weigh-in conditions, current-day exclusion, historical as-of/out-of-range, ambiguous spans, General Only, named one-day interoperability, and packet fingerprint changing upon corrected food records. No owner rows, personal sessions, paid model calls, DB writes, schema migrations, Auth/ENV mutations, or main promotion. **Production `health.daurham.com` verified unchanged** at `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. Exact-`e1052b0` READY Vercel preview was NOT confirmed; and cloned preview Neon data remains unsuitable for owner QA regardless of readiness.

**Next:** PIQ-4.2 broaden goal-version/strength-preservation/energy-and-water-context interpretation only through canonical attested sources, keep decision review-only, and evaluate named-window answers against owner rubric on a truly empty isolated QA instance once authorized. Overall PIQ engineering estimate **about 55%** (not phase acceptance); 0/9 formal PIQ phases accepted.

## 2026-10-16 — PIQ-4.2 fourth slice: verified protein and source-identified training participation (full CI green)

**Validated app SHA:** `77e398d6ef1b1b3d27fd4e70f5eab64aad071220`, development branch `piq/00-baseline-20261014`. [Actions 38961425326](https://github.com/daurham/daurham-health/actions/runs/38961425326) **SUCCESS** on npm ci, TypeScript, ESLint, full Vitest and production build. Exact-SHA Vercel preview `dpl_5SefvnvNcvaYUAFmFufJhfth4qna` READY, **not cleared for owner health-data QA** (preview Neon branch initialized by copying parent data). Production `health.daurham.com` independently remains unchanged at `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. This docs-only `[skip ci]` checkpoint is not an additional app verification. PIQ **0/9 owner-accepted**.

**What changed:** `src/domain/ask-health/protein-training-context.ts` pure bounded computation is integrated into `focused-weight-energy.ts` and Ask Health `packet.ts`. Protein data qualifies only before Health-local today, within selected as-of and recent maintenance window, where independently owner-confirmed, high-confidence **complete-day** calories and protein share exactly the same nonempty unique food-entry source IDs. At least 4 such matching complete dates across >=7 calendar days permits an observational **recorded grams per verified date** (not recommended protein target or guaranteed daily intake). If sparse/mismatched, display coverage limitation and an UNKNOWN rather than zero mean. Positive Training sessions count only with nonduplicate, nonempty source identity and non-unknown provenance; missing identifiers are separately disclosed but not treated as verified participation. A recorded session is **not** exercise-matched progressive lifting, strength retention or preserved muscle. Both new packet `weight_energy.protein_training_context` and `weight_energy.training_preservation_boundary` remain non-substantive explanations; `weight_energy.decision_boundary` is unchanged and prohibits individual plateau classification and calorie cuts pending current owner goals/targets, intervention versions, experiment and independently verified comparable exercise performance.

**Regression:** New `tests/piq4-protein-training-context.test.ts` covers verified 28-day source-ID-aligned protein, mismatch/duplicate IDs, verified dates only, fewer than 4/7-day qualifying samples, no calories, unidentifiable training sessions, provisional today exclusion, General Only and exact historical period isolation, correction-based fingerprint variation, and permanent strength-outcome `not_verified`. No DB read/write, schema migrations, user clinical rows, credentials, Auth sessions or paid Gemini calls performed.

**Next:** PIQ-4.2 source-versioned current owner goal/target and exercise-comparable preservation screening with conflict checks, plus explicit calibration/active-experiment disclaimers. Reuse canonical maintenance, Goal Control, Training provenance contracts rather than inventing treatment/strength targets. Owner data QA and promotion remain blocked until non-cloned disposable preview DB/Auth, verified encrypted restorable backup, schema preflight, genuine answer-quality evaluation, separate explicit approval. Overall PIQ engineering estimate remains near the midpoint (~55%), formal acceptance **0/9**.

## 2026-10-16 — PIQ-4.2 historical calorie representativeness/distribution gate (full CI GREEN)

**Latest validated code SHA:** `32b0c476f0840416e1f76d357ddd3347f7fb3e48`, on `piq/00-baseline-20261014`. [Actions 38962196641](https://github.com/daurham/daurham-health/actions/runs/38962196641) **SUCCESS**: install, TypeScript, ESLint, all Vitest and production build. Earlier `0d41e94` run was superseded/cancelled after fixing a synthetic fixed-mean distribution fixture. This docs-only `[skip ci]` checkpoint is not a second validated app SHA.

**Why:** Historical weight/food summaries could show a truthful *verified-day conditional calorie mean* drawn from one date or clustered days but without clearly warning it is not representative of the requested week/month. That is misleading in decision conversations even if none of the arithmetic is wrong.

**Implementation:** In pure `src/domain/ask-health/focused-weight-energy-window.ts`, count reliable whole-day calorie dates in two non-overlapping immutable halves of the actual completed dates of the selected historical window. Four states: `no_verified_days`, `single_verified_day`, `sparse_or_clustered`, `distributed_observations`. The last requires >=4 verified dates, >=50% coverage of completed dates and >=2 dates in each half. These are engineering presentation heuristics, NOT validated full-meal completeness or clinical thresholds. `src/domain/ask-health/packet.ts` discloses relevant limitation in the selected historical-only evidence, includes each half count and state in packet coverage and thus fingerprint, and explicitly states conditional mean is not a calendar-day or physiological expenditure/deficit estimate. Today remains provisional/excluded. Ambiguous/out-of-range requests cannot receive personal observations; other modes continue existing privacy. No calorie-target or goal edits, personal weight-loss conclusion or automated intervention.

**Tests:** `tests/piq4-weight-energy-window.test.ts` covers clustered verified days (3/0 halves), single verified day, evenly spread sample meeting quality heuristic, provisional today exclusion, and changed date distribution with IDENTICAL average resulting in different packet-cache fingerprint. All legacy tests remain green. No new SQL, source query, schema migration, owner health access, paid AI model call or clinical target mutation.

**Release:** Production `health.daurham.com` independently verified unchanged at deployment `dpl_27tZLD1yAWKd8KCX7gtR3HJexV64`. Exact-SHA READY preview **not confirmed** in Vercel deployment listing; existing PIQ preview database is a parent-data-cloned Neon branch and remains forbidden for owner-data QA regardless. No main merge, Auth/env mutation, migration 0056 or backup modification. Formal PIQ owner acceptance **0/9**.

**Next PIQ-4.2:** Current owner weight-goal version, target revision, relevant active/scheduled experiments and exercise-comparable preservation must come from independently verified canonical guarded sources before producing any owner-specific plateau classification or calorie-target suggestion. Reuse `server/intelligence/maintenance.ts` rather than making a second decision engine; keep Ask Health advice boundary closed until the snapshot/revision, owner QA, and isolation/recovery release gates are satisfied. Program remains roughly mid-development (~55% rough engineering estimate), not 98% complete.


## 2026-10-16 — PIQ-4.2 canonical exact-exercise review flags (CI GREEN; dev merged)

**Validated PR head:** `a81aa25e5b345c809e4e5577a50fc46343ec9e86`; **GitHub Actions [38965028132](https://github.com/daurham/daurham-health/actions/runs/38965028132) SUCCESS** for npm ci, TypeScript, ESLint, full Vitest and production build. Merged [PR #18](https://github.com/daurham/daurham-health/pull/18) into the PIQ **development branch only**, merge commit `89338a913e335fd57da1c1d8f29beb616bb9423c`. This is not production promotion or owner acceptance.

**Behavior:** A current, personally scoped weight/energy Ask Health question may now read the already-canonical exact-exercise Training Progression and existing maintenance-performance risk assessor between read-time target/goal/experiment revision checks. It only counts recent, medium/high-confidence, >=4-exposure exact-exercise e1RM/reps series and provisional performance decline flags. No owner exercise names/IDs, loads, notes or private goal labels are newly included in this aggregate packet. Unqualified/stale data and failed reads remain UNKNOWN. A lack of a decline flag does not establish preserved strength or muscle, and neither a positive decline flag nor training participation proves its cause. The workout history itself is NOT separately source-version attested in this slice, so the result is explicitly review-only.

**Privacy/decision gate:** The additional read is skipped for General Only, historical or unrelated questions. No automatic plateau diagnosis, calorie adjustment, exercise prescription, personal clinical conclusion, model spend, migration or owner-data QA. Weight-goal direction, actual unmet state, current target suitability, experiment causality and proven strength preservation still require independent verification. All calorie advice remains blocked.

**Regression:** Synthetic cases exercise exact-movement decline, clean-but-not-proven preservation, sparse/stale/low-confidence data, changed revision, no private identifiers, General Only and cache-fingerprint changes. First PR CI had two test-contract failures (the earlier goal-query fixture's as-of parameter and wording assertion); both were reconciled before the successful full CI above.

**Next:** PIQ-4.2 source-stable performance/goal/experiment reconciliation, quality-gated alternative hypotheses, and evaluated owner-safe question outcomes in isolated QA. Full PIQ program remains approximately mid-engineering, with **0/9 formal owner-accepted phases**. Retain database backup/schema/isolation and owner-mobile QA gates before any promotion to `main`.


## 2026-10-16 — PIQ-4.2 repeated recorded weight vs revision-attested goal boundary (CI GREEN)

**Validated code:** `0658227ff75823c943e0004daef7d015c2d2ad0a`, [GitHub Actions 38966165809](https://github.com/daurham/daurham-health/actions/runs/38966165809) **SUCCESS** for npm ci, TypeScript, ESLint, all Vitest tests and production build. [PR #19](https://github.com/daurham/daurham-health/pull/19) merged into development branch only at `1d0b361fe4695b51a709b3b16f47dff623c21479`. No promotion to `main`, owner medical record access, DB migration, target mutation or paid-model QA.

**Current, personalized weight/energy questions only:** Existing revision-bracketed goal mode read now privately obtains canonical target bounds and accepts only correctly shaped kg/lb goal versions. A pure deterministic screen examines the most recent three identified, usual-condition owner/device weigh-in dates within 21 days, spanning at least 6 days and with a last sample at most 7 days old. It describes saved weights uniformly above/below/within the goal boundary, mixed recordings, or unavailable coverage; a single reading cannot establish any of these comparisons. SQL errors, invalid versions, multiple goals, changed settings, non-kg observations, ambiguous source IDs, nonusual conditions and stale dates fail closed. Only relation and bounded observation counts enter Ask Health evidence, not private weight values, goal amounts or source IDs. Fingerprint varies with a changed, qualified relation.

**Truth boundary:** This is NOT a certified Goal Control target-state comparison, genuine verified plateau, fat-mass interpretation, proof of preserved muscle or calorie adjustment recommendation. Body history itself is NOT independently revision-attested in this increment. Historical/as-of, General Only and unrelated questions remain excluded from the current-settings/read path. Real-owner quality/latency/answer evaluation and deployment gates remain outstanding; formal PIQ phase acceptance remains **0/9**.

**Next:** Attest actual current primary-goal intent and goal-status temporal evidence using as-of-correct canonical records, reconcile active experiment windows and current target against observed performance, and evaluate a bounded contradiction hierarchy before permitting ANY consequential owner-specific intervention. Avoid reusing `listGoalAskSnapshots` body evidence as historical proof until its latest-measurement SQL is as-of-constrained (current source query lacks that bound). Keep PIQ and release gates unchanged.


## 2026-10-16 — PIQ-4.2 owner primary-goal priority under current revision (CI GREEN; dev merged)

**Validated revision:** `6dd16cae4201e7fa9cbc672281f1e5fbeb4d336e`; [Actions run 38967689896](https://github.com/daurham/daurham-health/actions/runs/38967689896) **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest, build). [PR #20](https://github.com/daurham/daurham-health/pull/20) merged into PIQ development branch only at `90a25f6aae294f2161f5ff538871a4d2ac0dc60a`. No `main` promotion, production migration, model spend, or owner data QA.

**Read-only behavior:** Existing effective-dated canonical `readPrimaryGoalIntent` supplies one owner-declared primary goal as-of the Health-local current date, including an explicit NULL/clear versus an absent history. A single-statement maintenance decision digest now includes the exact as-of effective primary intent record; changing priority without modifying goal versions, calorie targets or experiment count invalidates the read-time decision bracket. A separate current personalized weight-question screen verifies whether that selection matches the single current-version active nonarchived weight goal, selects another/not-current weight goal, is explicitly cleared, remains unset, or is unknown. The packet adds only non-substantive status, no ID, version, goal target, or priority event details. Invalid/future canonical intent rows and database/migration failures fail CLOSED, not to missing-priority semantics. Bounded query excludes archived active weight goals.

**Validation:** Synthetic canonical SQL/temporal validity, owner clear vs unset, mismatch and ambiguous goals, changed revision, packet ID privacy and fingerprint. An initial test surfaced future-row-as-unset behavior; canonical reader validation was tightened and the complete rerun passed.

**Still blocked:** Declared primary priority is NOT equivalent to a goal being unmet, body-fat change, verified plateau, preserved performance, measured expenditure, safe target, or justified calorie reduction. As-of correct canonical Goal Control body/strength readings, independent weight/training record revision attestation, causal experiment screening, and owner-safe clinical quality review are outstanding. The existing `loadEvidence` body metric query currently selects latest observation without as-of filtering, so historical current-state conclusions remain unsafe until corrected. PIQ program remains approximately midway through engineering with **0/9 formally owner-accepted phases**.


## 2026-10-16 — PIQ-4.2 Goal Control as-of point evidence (CI GREEN)

**Validated PR head:** `d08e4dc7ff286f7755d7994118108db171bfe298`. [Actions run 38968835492](https://github.com/daurham/daurham-health/actions/runs/38968835492) **SUCCESS** for npm ci, TypeScript, ESLint, full Vitest and build. [PR #21](https://github.com/daurham/daurham-health/pull/21) merged into the PIQ development branch only as `de5ca2077913142dcadf131f84f50d9519b704b0`. Production/`main` unchanged; no DB schema migration, owner-data reads or paid-AI tests.

**Bug prevented:** The canonical Goal Control `loadEvidence` point-goal readers previously chose the most recent body measurement, e1RM training sets, or valid benchmark result **without constraining source dates to the requested as-of calendar date**. This made future recorded values eligible for a historical target-state display. The new `as-of-point-evidence` module binds each SQL read to as-of **before** selecting latest sources, with independent result-date checks. Body `TIMESTAMPTZ` uses source-session timezone (or Health-local fallback) before `LIMIT 1`, including near-midnight UTC/Arizona crossings. Strength `workout_date` and benchmark `result_date` are restricted before aggregation/latest-result selection. Missing qualified data now means UNKNOWN, never future-based target satisfaction.

**Regression:** Synthetic point readers test October 17 UTC versus October 16 in America/Phoenix, timezone fallback, body future and no source, future e1RM set exclusion, benchmark validity and future exclusion, and unknown Goal Control target state. First CI lint run identified unused test mock parameters; corrected, then full CI green.

**Boundary/next:** A dated measurement is not the same as a historical **Goal version/lifecycle/status**. Goal snapshots still use present-day current versions and lifecycle, without a canonical effective-dated goal-history reconstruction. This patch must NOT authorize historical goal achievement claims, a causal plateau classification, preserved strength/muscle, or calorie-cut recommendations. Next tackle source-versioned or historical goal-status snapshots and experiment/target/evidence reconciliation under the owner's explicit priority. Formal owner phase acceptance remains **0/9**; engineering estimate approximately around **60%**.


## 2026-10-16 — PIQ-4.2 historical Goal Control source/packet fail-closed boundary (CI GREEN)

**Validated PR head:** `471c10e11917e7cbe9299e6a20f26a5795de7a31`. [GitHub Actions run 38971011632](https://github.com/daurham/daurham-health/actions/runs/38971011632) **SUCCESS** (npm ci, TypeScript, ESLint, all Vitest, production build). [PR #22](https://github.com/daurham/daurham-health/pull/22) merged into PIQ development branch only at `5677b6aeab86edd53463a35ff1413adbca646e33`. Production `main` remains unchanged. No DB migration, real-owner health evidence review, paid model calls, or live deployment.

**What was unsafe:** Earlier as-of source-point filters exclude *future measurements*, but `listGoalAskSnapshots(asOf)` was still reading `is_current` **present-day** target versions and **present-day** lifecycle. Supplying older body or training values does not turn today's Goal version/status into a valid historical Goal status. Goal versions have created timestamps but a full effective-dated lifecycle record is absent.

**New read-only guard:** Canonical Goal Ask snapshots now return [] without touching DB when `asOf` differs from actual Health-local current day. The Ask Health loader also skips the Goal read when a query requests a dated/ambiguous historical Goal period even if the request's as-of remains today. Packet creation independently refuses injected current goal status for historical goals; it emits a neutral ID-free **historical status unverified** limitation and includes it in the deterministic fingerprint. It remains visible in named historical-day/window filtering. Non-goal historical calorie/sleep questions do **not** receive the extra Goal warning; current-day Goals continue to be available.

**Quality verification:** Synthetic tests cover source-query suppression, explicit and relative historical goal questions, current-vs-historical packet status, boundary wording/privacy and caching fingerprints. Full CI initially found an unused test import, then identified 23 baseline test failures caused by old goal fixtures missing `healthToday` and one extraneous warning for non-goal history. Fixtures were dated and warning scope tightened; the complete rerun passed. The production fail-closed check was **not** weakened to accommodate old fixtures.

**Remaining:** This does **not** recreate historical lifecycle/version intervals or certify past goal achievement. An owner-approved effective-dated lifecycle contract, revision-aware source audit and experiment/strength/target reconciliation remain necessary before consequential energy-balance advice. Engineering estimate remains around **60–62%**, with **0/9 owner-accepted phases**.


## 2026-10-16 — PIQ-4.2 current Personal Lab experiment window attestation (CI GREEN)

**Validated source:** `802557461f0d31cb4ef2bc393d9db847fc2d87f1`; [GitHub Actions run 38971943567](https://github.com/daurham/daurham-health/actions/runs/38971943567) **SUCCESS** (npm ci, TypeScript, ESLint, complete Vitest and production build). [PR #23](https://github.com/daurham/daurham-health/pull/23) merged into PIQ development only at `f3313b67b758317ed5779e74355b864eb6197306`. No main/prod deployment, migration, owner health data analysis or paid AI invocation.

**New bounded read-only review:** For current personalized weight/energy questions, load the exact active/near-scheduled membership predicate already revision-fingerprinted by `MAINTENANCE_DECISION_REVISION_SQL` (all active experiments; scheduled with start within 14 days and end >= as-of). Verify row dates and IDs, cap at 100 rows, compare record count with the twice-attested decision snapshot and fail closed on mismatch/SQL errors/invalid dates/change during read. Group into active-window-overlaps-today, scheduled-soon, and status-active-but-date-outside-or-missing. A stale/undated active record now signals **timing needs review**, not current experimental exposure or no experiment. The Ask Health evidence has only aggregate counts and state, is non-substantive, changes packet fingerprints and exposes no experiment ID, protocol, title or raw window.

**Still blocked:** This review is not evidence of causal weight influence, adherence, protocol validity or effect. Even zero relevant experiments is bounded to the predicate and does NOT authorize a calorie cut. Before consequential advice, verify experiment relevance to weight/calorie behavior and valid results; reconcile the explicit selected goal, target version, Goal Control current status, source histories, performance, physiology and owner QA. Engineering estimate approximately **61–63%**, formally accepted PIQ phases remain **0/9**.


## 2026-10-16 — PIQ-4.2 versioned experiment outcome relevance (CI GREEN)

**Validated PR head:** `26c1eb83da396495b4b867589006a10886b1f888`. [GitHub Actions run 38973096363](https://github.com/daurham/daurham-health/actions/runs/38973096363) **SUCCESS** for npm ci, TypeScript, ESLint, full Vitest, and production build. [PR #24](https://github.com/daurham/daurham-health/pull/24) merged into PIQ development branch only at `e39eece54769c0239c3473befa8814468bfa2818`. No main/production merge, owner-data analysis, live model spend or migration.

**What changed:** For current personalized weight/energy questions only, select the previously bounded, decision-revision-attested experiment cohort, load the immutable-version `lab_protocol_requirements` for exactly that cohort (100 experiment/400 joined requirement limits), and reconcile source IDs and counts. Extend the single-statement maintenance decision digest to include all relevant experiment protocol-version/typed requirement IDs, roles, domains, kinds and selectors; even illicit external requirement edits invalidate the read bracket. Fail closed on malformed/duplicate/missing rows, SQL failures, revision changes and overlarge reads. Only aggregate structural-outcome state and counts enter non-substantive AI evidence, fingerprinted without raw identifiers, target amounts, protocol selectors or owner notes.

**Conservative semantics:** An explicit `primary_outcome` or `secondary_outcome` with `body/body_metric/{metricKey:weight}` or `nutrition/nutrition_metric/{metricKey:calories}` counts as a *direct declared weight/calorie outcome*. Adherence/context observations, experiment titles, hypotheses and origin labels are NOT a shortcut. Other outcomes are not deemed irrelevant; indirect weight/energy effects remain possible. No declared outcome remains unclassified; active-now vs scheduled-soon direct-outcome tallies remain descriptive, not evidence of observed exposure. Test coverage includes direct and secondary outcomes, nonoutcomes, other domains, no outcome, mixed cohorts, invalid selectors/status/IDs/oversize, strict revision screen and privacy.

**Next blockers:** A declared target metric is NOT adherence, a version-valid experiment result, causal weight influence, preserved strength, target-level suitability, verified goal unmet direction, or permission to change calories. Next evaluate valid result classifications/attestations and reconcile them with current goal priority, target versions, current physiologic/protein/performance context without action-level recommendations. Approximate overall engineering progress **63–64%**; formal owner phase acceptance **0/9**.


## 2026-10-16 — PIQ-4.2 recent finalized Personal Lab results integrity (CI GREEN)

**Validated code SHA:** `87bbaa99716082f19e95c2935dad2952019c21c2`. [Actions run 38975346243](https://github.com/daurham/daurham-health/actions/runs/38975346243) **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest, build). [PR #25](https://github.com/daurham/daurham-health/pull/25) merged into **PIQ development branch only** as `369b3b3f36c43a5c625133019a7f6e8868a03f1c`. Production `main` unchanged; no migration, real-owner medical data read, live AI calls or deployment.

**Lifecycle discovery:** Completing an experiment moves it out of `active`; therefore checking only active/soon-scheduled experiments misses finalized outcomes. Added bounded read-only inspection of Personal Lab results whose `effective_end_date` falls in the last 28 Health-local calendar days, including today (limit 100, fail closed if truncated). The reader refuses future/older dates, malformed statuses/classifications, duplicate valid results for one experiment, incoherent protocol pins, mismatched experiment lifecycle, invalid attestation flags and contradictory direct-outcome source flags.

**Revision attestation:** The twice-checked Maintenance Decision Revision now also fingerprints those recent result identities, current/invalidated status, classifications, protocol-attestation and safety flags, recorded end dates, evidence fingerprint, protocol-version requirement selectors and evaluation summaries. If result data is edited or invalidated during retrieval, the current-settings screen invalidates the read. Only ID-free aggregate counts and neutral descriptions enter the Ask Health packet and fingerprint.

**Strict meaning of a qualified direct observation:** A recent valid `completed_interpretable` result, explicitly followed protocol, no safety stop, and a typed primary/secondary weight or calorie requirement with a matching `available` recorded evaluation. Other interpretable results are non-direct rather than irrelevant. Low-adherence, missing/inconclusive, invalid protocol, safety stop, uncertain attestation, and invalidated results do **not** establish an interpretable direct outcome. An empty response only refers to this 28-day finalized-result window, not the user's full experiment history.

**Still NOT established:** Direction, magnitude, effect or cause of weight change; energy balance causality; current goal achieved/unmet state; strength preservation; target suitability; safe calorie changes. Follow-on should reconcile the selected active goal/version and current performance evidence against these limited observations without making intervention prescriptions. Approximate engineering progress **~65%**, formal owner phase acceptance **0/9**.


## 2026-10-16 — PIQ-4.2 read-only primary goal, experiment, and performance reconciliation (CI GREEN)

**Validated PR head:** `3422d287ecdabcb57f0213d874136f246976e03c`. [GitHub Actions run 38976300813](https://github.com/daurham/daurham-health/actions/runs/38976300813) **SUCCESS** for `npm ci`, `npx tsc -b`, `npx eslint .`, complete `npm test -- --maxWorkers=2`, and `npm run build`. [PR #26](https://github.com/daurham/daurham-health/pull/26) merged **into PIQ development only** at `4708fc076dcb2f4edb9c5945c087ee85d10330d5`. Production `main` unchanged; no database migration, real-owner health data request, paid model invocation or deployment.

**New current-day read-only cross-signal reconciliation:** Pure deterministic `reconcileWeightEnergyEvidence` combines the previously revision-attested current calorie-target/goal settings, effective-dated explicit owner primary goal, comparison of three recent body weights to versioned goal boundary, canonical qualified exercise performance decline screen, active/soon-scheduled experiment timing and direct protocol outcome declarations, recent finalized experiment results, and protein/training source coverage. It orders attention for unavailable/changed sources, *owner-selected active goal contradicted by another goal read*, explicit non-weight/cleared/unset primary goal, possible exercise decline, and experiment context or qualified recent direct observation. Even with apparently consistent sources, its best state is **descriptive_only** and never action-ready. Partial/missing protocol, strength, goal, training or protein evidence remains unverified, not absence.

**Hard invariant:** Every output returns `calorieAdjustment: not_authorized`, `plateauClassification: not_authorized`, `strengthPreservation: not_verified`. A recent interpretable observation is not causally linked to the CURRENT selected goal or target version; a configured calorie target is not validated energy need; no qualified decline flag is not muscle-preservation proof; three comparable weigh-ins are not Goal Control status/urgency. Only non-substantive, private-ID-free reason codes and status enter evidence and the deterministic packet fingerprint; no raw goal or experiment IDs, numeric calorie suggestions, or healthcare prescription.

**Quality gate:** Synthetic tests cover descriptive-only despite apparently aligned data, conflicting active-goal identities, explicit cleared/non-weight priority, strength-decline attention despite concurrent experiments, recent directly observed result not linked to selected goal, missing/changed experimental sources, insufficient protein records, history fail closed, privacy and fingerprint. Initial CI found packet coverage required a scalar string rather than an array of review reasons; fixed serialization to stable text, and reran the *complete* CI successfully on exact corrected PR head.

**Remaining:** This slice is not a verified canonical maintenance action gate, not an owner's actual clinical/protein/calorie adequacy review, and not an experimental causal analysis. Next tasks: harder owner-goal urgency/target lifecycle reconciliation and evidence-based, permissioned intervention criteria; end-to-end owner QA/acceptance. Approximate overall engineering progress **66–67%**; formal owner-accepted phases remain **0/9**.


## 2026-10-16 — PIQ-4.2 exact-version canonical selected weight-goal status boundary (CI GREEN)

**Validated PR head:** `9305f5ded092c0ee7d6a7a8000ae463c96c93021`; [GitHub Actions run 38979304629](https://github.com/daurham/daurham-health/actions/runs/38979304629) **SUCCESS** (npm ci, npx tsc -b, npx eslint ., full Vitest, npm run build). [PR #27](https://github.com/daurham/daurham-health/pull/27) merged **PIQ development only** as `0eb2b4f32044e4344da4af57c967b516e305729a`. Production `main` unchanged; no migration, live-owner data processing, paid model invocation, or production deployment.

**Gap closed:** Ask Health already fetched Goal Control's current-day canonical target/deadline evaluation, but had no source-version ID with which to match the **same explicitly selected active weight goal** from the maintenance decision revision. Now the private Goal Control current version ID remains in the in-memory Ask input and a pure `reviewCanonicalSelectedGoal` checks both exact goal ID and version ID, active bodyweight lifecycle/selector, typed target direction, owner priority and current health day. Missing, mismatched, duplicate, stale, paused, non-weight or otherwise incompatible snapshots are blocked. Explicitly cleared/unset/non-weight owner primary goal is never silently treated as a weight-loss objective.

**Deadline semantics and limitations:** Canonical `passed_unmet`/ `due_today` when target state is `unknown` becomes **past/due with missing target evidence**, NOT confirmed unmet. A version-matched reported `satisfied` or other status can differ from three qualified recent weigh-ins; show **measurement disagreement requiring review**, never a claim either source is incorrect. A canonical current result is descriptive only: the body observations underlying Goal Control were NOT independently version- or revision-locked with the twice-checked maintenance decision. Thus a matching goal target version does not verify unchanged measurements or any clinical urgency. The new non-substantive packet row and cross-signal reasons contain only status enums and generic explanation; no raw goal IDs, version IDs, raw weights or numerical target amounts leak in the new evidence.

**Unchanged hard gates:** Intervention and calorie adjustment remain `not_authorized`; owner-specific plateau classification remains `not_authorized`; muscle preservation remains `not_verified`. No new SQL, interventions or new goal computations; uses already loaded Goal Control service outputs. Synthetic tests cover exact ID/version, stale/missing/duplicate statuses, explicit owner priority, unknown past deadlines, discordant measurements, historical requests, source revision failure, packet privacy and cache fingerprint changes.

**Next checkpoint:** independently bracket and validate body measurement source revisions used for current Goal Control evaluation; further reconcile goal deadline urgency and performance/physiology before considering permissioned intervention logic and owner acceptance. Overall engineering estimate **~68%**, formal PIQ phase acceptance remains **0/9**.


## 2026-10-16 — PIQ-4.2 Goal Control latest bodyweight source integrity (CI GREEN)

**Validated exact code head:** `66b76b7d9b4d3377a4178e4eeaecc77bcac8521b`. [Actions run 38982129215](https://github.com/daurham/daurham-health/actions/runs/38982129215) **SUCCESS** for npm ci, TypeScript build, ESLint, entire Vitest suite and app production build. [PR #28](https://github.com/daurham/daurham-health/pull/28) merged into **PIQ development only** as `1ac11dd9e7f742e84df4cfc82efd97eef74bd5aa`. No production main merge, schema migration, real-owner data query or paid model invocation.

**New measurement-source consistency:** The canonical `BODY_GOAL_AS_OF_SQL` now selects the latest Health-local date-eligible bodyweight measurement with its metric/session UUIDs, raw value/unit, measured timestamp, timezone and metric/session update timestamps. Goal Control's existing point evidence reader computes a private SHA-256 source fingerprint **during the same query used to derive the reported target state**. Its current-day Ask Health snapshot carries this private fingerprint in memory only for the weight metric. Before the final current-settings consistency check concludes, Ask Health independently re-reads the **same latest point query** and compares the current revision to Goal Control's captured source fingerprint. A changed metric value, edit without value change (updated_at), replacement, timestamp change, deletion, missing identity, malformed point, or failed source read invalidates the canonical status/deadline screen instead of claiming an unchanged measurement. A missing weight point leaves goal attainment and missed-deadline claims UNKNOWN.

**Enforced boundaries:** Exact owner-selected goal ID/current version must still match. Only non-substantive status and `latest_point_rechecked`/changed-or-unavailable enums appear in the new AI packet evidence, without hashes, IDs, raw weight, measurement timestamps or numeric target amounts. A stable latest point is an optimistic source recheck, NOT atomic transaction isolation, protection from temporary change-and-revert or attestation of the full historical body/projection series. Cross-signal review remains non-authorizing for calorie adjustments, plateau diagnoses, goal urgency or muscle retention.

**Validation:** Synthetic tests cover canonical query identity/parity and date cutoff, unchanged latest-point hash, same-weight updated-at revision, replacement, deletion, different numeric observation, missing fingerprint/identity, read failure and privacy. Initial full CI had one legacy text-contract assertion expecting the explicit phrase `not atomically versioned` (2,340 tests passed); the source-caveat wording was restored, and full CI rerun succeeded on exact final head. No owner confirmation or migration required for the development branch.

**Next:** Independently attest eligibility/completeness of the *historical trend* used for Goal Control projections or strengthen canonical maintenance action gates, then owner end-to-end QA/acceptance. Overall engineering progress estimated **~69%**, formal phase owner acceptance **0/9**.


## 2026-10-16 — PIQ-4.2 canonical bodyweight projection-series source integrity (CI GREEN)

**Validated PR HEAD:** `23b107d8323e1c693d820dc8de69cd8e695f6a34`. [GitHub Actions run 38985032990](https://github.com/daurham/daurham-health/actions/runs/38985032990) **SUCCESS** for npm ci, `npx tsc -b`, `npx eslint .`, complete `npm test -- --maxWorkers=2`, and `npm run build`. [PR #29](https://github.com/daurham/daurham-health/pull/29) merged **into PIQ development only** as `eb35a92dec3623e56461f289129c41f142917195`. Production main remains unchanged; no database migration, owner data query, paid model call, or live deployment.

**Gap addressed:** PR #28 rechecked only the latest Goal Control weight point. Goal Control separately calculates projections from a full bodyweight history query, so older weight backfills/edits could change a forecast even while the latest point was unchanged. Refactored the canonical projection source select into shared `BODY_GOAL_PROJECTION_SOURCE_SQL`, preserving the existing projected point values, adding metric/session `updated_at`, and applying deterministic ordering by metric ID. The canonical projection calculation remains **uncapped** and uses the same complete rows. A private SHA-256 fingerprint is computed for up to 3,000 well-formed source rows, containing row identity, metric key, recorded weight/unit/type, measurement time/timezone, and edit timestamps. Missing/invalid row metadata, duplicates or a larger cohort yield an unavailable fingerprint, not a misleading partial one.

**Read bracket:** During the current Goal Control weight projection query, capture the exact private history fingerprint in the current-day Ask Health snapshot, then independently re-fetch the same canonical series near the final maintenance decision/point checks. Compare fingerprints for the **same owner-selected active goal ID/version**. A changed early weight, same-value correction timestamp, timezone, unit, deletion, insertion, malformed row or unavailable recheck WITHHOLDS current canonical goal target/deadline reporting and flags source integrity for review. A verified empty history is still insufficient to establish achievement. Existing latest-point attestation remains required. Only non-substantive source-status enums and conservative descriptions enter the AI packet; no goal IDs, versions, weight values, source timestamps or hashes are exposed in this new evidence.

**Safety boundaries:** Consistent source fingerprints are optimistic before/after checks, not transaction isolation, protection against change-and-reversion, causal evidence, projection-quality assessment, physiologic adequacy or permission to reduce calories. Every cross-signal path remains `calorieAdjustment:not_authorized`, `plateauClassification:not_authorized` and `strengthPreservation:not_verified`. Historical/as-of goal lifecycle backcasting remains forbidden.

**Validation:** Synthetic tests cover exact shared query parity, order-independent revision, older history point edits/inserts/deletions, update-only edits, timezone, metric/unit metadata, malformed/duplicate/3,001-row overflow, source failures, empty cohorts, privacy and packet fingerprint. Existing exact-match Goal Control status regression updated for new `projectionRevision:not_attested` field. Full CI GREEN on exact PR head.

**Next:** Safely adjudicate history *eligibility and quality* beyond source stability, including whether projection input is sufficient for decision-grade interpretation, and then align permissioned maintenance action gates plus end-to-end owner acceptance. Overall PIQ engineering progress estimate **~70%**; formal owner acceptance **0/9**.


## 2026-10-16 — PIQ-4.2 projection-history temporal sampling quality (CI GREEN)

**Validated code SHA:** `ea60e948c79d9166bbdb9b443f738676cc992593`. [GitHub Actions run 38986641308](https://github.com/daurham/daurham-health/actions/runs/38986641308) **SUCCESS** for npm ci, TypeScript, ESLint, full Vitest, and production build. Branch: `piq/00-baseline-20261014` only; **main/production unchanged**. No SQL/schema migration, real-owner medical data access, paid model invocation or manual QA.

**Behavior:** The existing Goal Control projection model can calculate an estimated crossing date from 5 weigh-in dates spanning 14 days even if the observations are out of date or unevenly clustered. A new synthetic-tested, read-only temporal distribution screen now evaluates the exact revision-confirmed full measurement history during *current* personalized Ask Health weight/energy review. At least 5 distinct qualified Health-local dates within the canonical 90-day window, >=14 days observed span, a recent point within 14 days, >=2 dates in each half of observed span and no >21-day gap are required for the limited status `date_spread_sufficient`. Malformed timezone/date, invalid/non-positive weight, unsupported units or unverified source yield no qualified history. The screen distinguishes history integrity from temporal sampling quality; it does **not** prove usual weigh-in comparability, a reliable physiological projection or a clinical target. Raw values, weights, IDs, timestamps and source hashes are not included in the new AI status.

**Conservative gate:** If canonical Goal Control reports projection `available` while the verified history lacks the sampling distribution, Ask Health uses `projection_quality_limited` and WITHHOLDS the selected current goal target/deadline report in that cross-signal evidence. If Goal Control already reports an unavailable projection, the quality screen does not erase its current target observation. No changes to the canonical Goal Control math, goal schema, plan, target or intervention. Cross-signal `calorieAdjustment:not_authorized`, `plateauClassification:not_authorized`, `strengthPreservation:not_verified` remain invariant.

**Validation details:** Initial full CI compiled and linted cleanly and had 2,350 passing tests plus one new false-positive assertion: privacy test incorrectly expected the ordinary packet reporting-period end date to be absent. Corrected the assertion to check *text and private coverage*, not required reporting-period metadata; also corrected a synthetic deadline-state enum. Complete CI rerun passed on exact fixed code SHA. The new tests cover distributed, stale, clustered, single-date, malformed and future-only histories, unchanged fingerprint, fail-closed quality, non-authorizing goal screen, and packet/fingerprint boundaries.

**Next:** Continue PIQ-4.2 evidence-based maintenance review WITHOUT turning a forecast heuristic into clinical permission. Independently verify usual-condition/measurement comparability, cross-signal confounding and safety/adequacy gates before any permissioned calorie or goal intervention; retain isolated preview/DB, owner acceptance and baseline quality gates. Approximate engineering progress **~70–71%** (planning estimate), formally owner-accepted PIQ phases **0/9**.


## 2026-10-16 — PIQ-4.2 canonical goal packet consistency and direct question routing (CI GREEN)

**Validated exact application code commit:** `5b92640fefd0600530c5b49877e1f3ee77e2eb42`; [GitHub Actions 38987049640](https://github.com/daurham/daurham-health/actions/runs/38987049640) **SUCCESS** for npm ci, TypeScript, ESLint, complete Vitest suite and production build. Branch `piq/00-baseline-20261014` only, main and production unchanged. No schema migration, owner health data access, live model/provider call or production deployment from this work.

**Issue found:** The PIQ-4 canonical current-goal reconciliation could withhold a selected primary weight goal's target/deadline/projection because its version, source or history sampling did not verify. The generic Goals packet builder could nevertheless append that same goal as a substantive evidence row in the same answer, allowing conflicting model claims.

**Fix:** For current focused weight-energy questions, the packet builder uses an in-memory, never-emitted exact selected weight-goal ID from the existing read-only current-goal check. When canonical status is not `canonical_reported`, it excludes that selected goal from the generic Goals evidence. Missing selection identity fails closed for body-metric goals, without removing other verified non-body goal types; when an exact ID is known, nonmatching body goals remain available. Fully canonical-reported and unfocused generic Goals behavior remains unchanged. Explicit `weight goal`, `weight target`, `weight trend` and `weight projection` question language now enters the focused review rather than bypassing it. New synthetic packet tests cover privacy and cache fingerprint changes, exact selected-goal suppression, unknown-ID fallback, other goal retention, and normal current/unfocused paths.

**Boundaries:** This does not verify the underlying physiological projection, validate intake adequacy, supply a safe calorie target, or authorize action. No owner data nor medical review was inspected. The current Goal Control model and persisted target remain untouched. Next PIQ-4.2 checkpoint should address usual weigh-in condition comparability and contradictory corroborating evidence before any maintenance intervention authority. Estimate overall PIQ engineering progress **~71%**, formally owner-accepted phases **0/9**.


## 2026-10-16 — PIQ-4.2 canonical weigh-in condition consistency (CI GREEN)

**Task state:** validated in synthetic CI, NOT deployed or owner accepted. **Exact validated application SHA:** `22f2a288c4175e232d2f67818aac959862c3b761`. [Actions run 38987664432](https://github.com/daurham/daurham-health/actions/runs/38987664432) **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest regression suite and production build). Branch: `piq/00-baseline-20261014` only; main/production unchanged.

**Why / behavior:** Prior history-date distribution was not enough; five recent weights might include session records marked `unknown` or `different_conditions`, yet Goal Control projects mathematically from all valid date-eligible rows. Reused the existing canonical `body_measurement_sessions.comparability` enum in the exact Goal Control body-history query and included it in its private source fingerprint. Any change in comparability (including same-value/no-timestamp update) changes the read revision. A missing comparability field invalidates the source fingerprint instead of treating absent metadata as an owner choice. For an `available` current selected-weight-goal projection, the late Ask Health recheck now demands `usual` for every weight record in the canonical 90-day projection window, in addition to existing five distinct dates, minimum span, recent sample, coverage halves, gap limits, exact-version goal identity, latest point, and full-history consistency. An otherwise revision-stable mixed/unknown series becomes `projection_conditions_unverified`; Ask Health WITHHOLDS the selected current goal target/deadline in its cross-signal packet, also protected from generic Goals leakage by the previous checkpoint. Source outside the projection window remains fingerprinted but is not mislabeled as influencing the current projection.

**Limits / regression:** This checks a saved owner/source comparability label, not independently validated fasting conditions, scale calibration, weight change due to fluid, fat loss, a goal's medical suitability or intervention safety. A goal with no available projection is not falsely branded as a failed available projection. All cross-signal calorie adjustment and plateau claims remain `not_authorized`, strength preservation stays `not_verified`. New tests cover usual/unknown/different/null/missing condition, source hash changes, out-of-window records, scoped withholding, packet privacy and fingerprint; preexisting series and temporal tests updated for explicit canonical SQL column. No new migration or SQL call count, data mutation, provider usage, owner records, private credentials, production deployment or owner QA.

**Next:** Review true current latest-point body-condition status and competing scale-confounding signals before even considering an intervention eligibility decision; owner mobile QA, isolated preview database, provider cost and production rollout remain gating. Approximate engineering progress **~72%**, formally owner-accepted phases **0/9**.


## 2026-10-16 — PIQ-4.2 current latest-point measurement condition gate (CI GREEN)

**Task:** validate that a current selected primary weight-goal target/deadline report is not inferred from a non-comparable latest scale point. **State:** code validated in synthetic CI, **not deployed or owner accepted**. Exact validated application SHA `604e00f8a88fc380b770f94122759ae526371e4c`; [Actions run 38989125463](https://github.com/daurham/daurham-health/actions/runs/38989125463) **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest and build). Work stays on `piq/00-baseline-20261014`; `main` and production remain unchanged.

**Source-of-truth issue:** The previous whole-history weigh-in comparability screen guarded only `available` projection forecasts. Goal Control could still describe selected-goal target attainment or missed deadline from a latest point marked `different_conditions` or `unknown`, even when its projection was already withheld or absent.

**Code / contract:** The existing shared SQL `BODY_GOAL_AS_OF_SQL` now reads each latest session's `comparability` field; its private point fingerprint includes the field so even same-value and same-timestamp condition relabels invalidate the source. The independently queried current Ask Health point recheck fails closed for a missing field or invalid enumerated label. On exact matching source/selected goal identity and revision, `hasPoint=true` with any condition other than `usual` yields `measurement_conditions_unverified`: current selected-goal target/deadline labels WITHHELD, even if there is no available projection. A genuinely missing point remains `canonical_target_unknown`, and changed/unavailable source identity takes precedence over condition quality. When projection source is supplied, projection revision integrity is confirmed before condition vs forecast-quality ordering. Reconciliation reason `canonical_measurement_conditions_unverified` and non-substantive, privacy-preserving AI explanation are propagated through the packet; generic Goals bypass guard remains in force.

**Validation / UX:** Added `tests/piq4-latest-weight-conditions.test.ts`; updated the prior source-identity fixture for explicit usual conditions and checked canonical SQL. Synthetic tests cover usual/unknown/different/null, invalid/missing condition, revision-only change, absent point, withheld text, non-authorizing reconciliation and private ID/hash not disclosed in packet. Documented `docs/ai/PIQ4_LATEST_POINT_CONDITIONS.md`. No frontend surface, model/provider call, schema migration, extra SQL read, owner data, or production operation. Owner QA and proof of physical measurement standardization remain outstanding.

**Next:** Assess cross-signal confounding (hydration/sodium/carbohydrate short-term fluctuations, weigh-in timing/scale and recent activity) with clear coverage limits; do not derive a plateau diagnosis, strength preservation or calorie intervention from this screening. Approximate engineering progress **~73%**; formally owner-accepted PIQ phases **0/9**.


## 2026-10-16 — PIQ-4.2 short-window scale/food co-observation and log coverage (CI GREEN)

**State:** validated against synthetic tests, NOT deployed or owner-accepted. Exact validated code SHA: `9b4455cf7e230bbe72441687abe58d326d7db671`. [GitHub Actions 38990602182](https://github.com/daurham/daurham-health/actions/runs/38990602182) **SUCCESS**: npm ci, TypeScript, ESLint, full Vitest (2,369 passed, 30 skipped) and build. Branch `piq/00-baseline-20261014` only; main/production unchanged.

**User-visible failure addressed:** The existing maintenance source-matched sodium/carbohydrate 3-day-vs-prior-7-day food-log contrast could be presented as *possible scale context* even when no usual-condition weights existed anywhere in the corresponding ten complete-day comparison window. Logged water/steps were not clearly distinguished from complete-day hydration/activity. This can make a general physiology explanation appear personal without adequate observation.

**Implementation:** Pure `src/domain/ask-health/scale-window-signal-coverage.ts` audits the same complete-day 3+7 calendar dates with snapshot as-of/today/scope, source identity, unit and saved usual-condition markers. A bounded screen labels `sampled_both_windows` only if >=2 recent and >=3 baseline usual-condition weights exist, with no other recorded non-usual point and complete ten-day snapshot bounds. Otherwise `sparse_or_mixed` or `no_qualified_weight`. It does not recompute maintenance model or claim a nutrient/scale association even when windows are sampled. It separately counts source-identified logged water and activity-step dates, with explicitly unverified full-day coverage. `focused-weight-energy.ts` attaches the screen and `packet.ts` adds explicit nutrition-only vs contemporaneous-weight wording, non-substantive quality counts and cache fingerprint inputs. Sodium/carbohydrate source-matched verified nutrition tests remain the only qualifying nutrient contrasts; water/steps cannot imply physiological status or zero for missing dates.

**Tests:** New pure+integration `tests/piq4-scale-window-signal-coverage.test.ts` covers sufficient, sparse, missing, non-usual, duplicate source IDs, truncated period, current-day-only water/steps, qualified nutrient shifts with absent weigh-ins, and packet fingerprint. Existing `tests/piq4-weight-energy-scale-context.test.ts` remains green. First run `38990378878` failed exactly one *test expectation* that incorrectly blocked an otherwise adequate six-day valid baseline merely because one seventh point had duplicate source IDs; fixed assertion and added a truly sparse duplicate-ID case, complete green rerun on final SHA. Source tests distinguish coverage from accuracy and causality.

**Migrations:** none. **Provider cost:** no-call. **Release:** branch only; no prod DB, owner data, model request, runtime owner QA, main promotion, goal or calorie change. **Decision boundary:** no owner-specific plateau, fluid retention, fat change, verified total hydration/activity, muscle preservation or numeric calorie intervention may be derived. **Outstanding:** physiological/day-to-day confounder timing, applicability of owner's current activity/goal priorities, strength and intake-adequacy safety gate, proof against realistic private data (requires owner-run QA). **Next:** conduct bounded temporal conflict-quality review of recent weight/nutrient/context observations without turning contemporaneity into cause. Engineering progress estimate **~74%**, formal phase owner acceptance **0/9**.


## 2026-10-16 — PIQ-4.2 qualified nutrient-log / weigh-in calendar ordering (CI GREEN)

**Task state:** validated on development branch against synthetic tests, NOT deployed or owner accepted. Exact validated app SHA: `7158176d0d6ad4bf5be6c8acc001d53098e02b39`; [GitHub Actions 38991150952](https://github.com/daurham/daurham-health/actions/runs/38991150952) **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest, build). Docs-only checkpoint follows with `[skip ci]`. Branch `piq/00-baseline-20261014`; main and production remain untouched.

**Motivation:** The prior short-window screen checked whether source-qualified usual-condition weigh-ins and sodium/carbohydrate changes coexisted in the recent three / prior seven completed days. Co-observation alone can obscure that an apparently relevant scale reading was taken on the *same* calendar day as an aggregated daily food total, or before the most recent food-log date. A daily aggregate has no attested intra-day timing, so it cannot establish a scale observation occurred after the food record.

**Code:** `src/domain/ask-health/scale-window-signal-coverage.ts` adds independent `screenScaleShiftTiming` states per nutrient: `not_checked` (no verified shift), `source_dates_unverified` (duplicate/malformed/out-of-window/future/impossible source-date selection), `weight_window_insufficient` (existing 2 recent + 3 baseline usual-condition weight coverage not met), `no_later_scale_record` (no usual-condition weight on a strictly later *calendar date* than latest qualified food-log day), `later_scale_recorded` (at least one such later record). The date sources are the maintenance engine's previously source-matched, owner-verified recent food-log days; this screen is not a new source authority. `focused-weight-energy.ts` computes it alongside sampling, and `packet.ts` includes privacy-minimized status and cautious explanations in the existing **non-substantive** scale evidence and packet fingerprint. There is no matching of meal timestamps, reconstructed dietary onset, personal association, measured weight change, diagnosis, intervention/deficit inference or invented zero day.

**Validation:** Extended pure and packet tests for strictly later vs same-day readings, invalid/duplicate/future food dates, sparse/mixed/absent and unidentifiable weigh-ins, nutrient-specific no-qualification, owner-only packet scopes, and explanation/fingerprint integrity. First CI run `38991047551` failed TypeScript due to unsupported `Array.at()` under repository target; changed to compatible indexed access. The exact corrected code `7158176d` passes full CI `38991150952`. Source status remains a calendar-day check, not an owner-specific physiological association. No schema migration, additional SQL, live owner health reads, provider/API model call, calorie/goal mutation, or production deploy.

**Next:** Check whether contextual evidence is sufficiently revision-locked for action-quality reasoning (daily context revisions, nutrition/weight source corrections) and design a conservative cross-signal precedence matrix; do NOT activate calorie adjustments or plateau/strength conclusions without owner acceptance and medical/cost guardrails. Engineering progress estimate **~75%**, formal owner-accepted phases **0/9**.


## 2026-10-16 — PIQ-4.2 late Nutrition revision consistency and activity source identity (CI GREEN)

**State:** validated in synthetic CI on the development branch; not deployed or owner-accepted. **Exact validated application commit:** `a5e98031e7f341f0159596f0509c7218ac50760a`. [GitHub Actions run 38991752879](https://github.com/daurham/daurham-health/actions/runs/38991752879) **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest, production build). Branch `piq/00-baseline-20261014` only; main/production untouched. Engineering estimate **~76%**; formal owner acceptance **0/9**.

**Why:** Ask Health's current focused weight/intake evidence joins multiple independent reads. The first intelligence snapshot independently verifies owner-complete Nutrition days, but an entry edit/deletion or new confirmation before packet assembly could invalidate the initial source after it was checked. A same-ID, same-calorie change in sodium, carbohydrates or protein could also escape a calories-and-IDs-only repeat check. Separately, the intelligence snapshot's activity summaries previously dropped the canonical row ID: legitimate imported step observations were always missing source identity and could be reported as no source-identifiable step-log days.

**Changes:** `server/intelligence/snapshot.ts` uses real `activity_daily_summaries.id` as an observation source ID on steps, active energy, exercise minutes and resting heart rate; absent/invalid provenance remains unattributed, not fabricated. A pure `activitySummaryObservations` helper makes the source semantics testable. New `server/ask-health/current-weight-nutrition-recheck.ts` uses ONE additional bounded, set-based SQL query at the end of *current-day personalized weight/energy retrieval*. It extends the existing revision-/owner-completeness-/exclusion-checked Nutrition query to return same-entry protein, carbohydrate and sodium totals, preserving absent-vs-zero. It compares the exact initial verified-date set against fresh canonical calories, sorted entry IDs and all three nutrient totals. Any source mismatch, lost owner-complete day, unavailable DB/verification or malformed data yields `changed_or_unavailable`, never a false zero or an action authorization. `src/domain/ask-health/focused-weight-energy.ts` carries a transient consistency status, and `src/domain/ask-health/packet.ts` fail-closes focused maintenance estimate, protein/nutrient comparison, scale-context and follow-on focused weight-energy cross-signals with a single non-substantive privacy-safe boundary message. No health or source IDs are included in this new status.

**Validation and costs:** `tests/piq4-current-nutrition-recheck.test.ts` checks canonical query shape, saved activity-row attribution, missing attribution, correct source sets, calorie changes, same-calorie sodium corrections, missing nutrient vs zero, owner-confirmation failures, DB error, packet suppression, privacy and distinct cache fingerprint. An initial type compatibility refinement explicitly passed the real Health-local `today` (the intelligence snapshot has `asOf` but no `today` member); final CI verified exact code SHA. No schema migration, new provider API call, owner PHI read by developer, production deployment, goal or calorie mutation. **Operational price:** one extra local database query per eligible current personalized weight/energy read; not zero DB cost.

**Limits:** The extra read is optimistic, not an atomic source snapshot. It covers nutrition completeness/source IDs/calories/protein/carbs/sodium; it does NOT attest weight-series, imported activity, daily-context, training, medication or experiment revision consistency. An unverified source remains blocked; a valid Nutrition check does not authorize a plateau, fat-loss attribution, calorie intervention or strength-preservation finding. Historical/general-only scopes are unchanged. No owner mobile/production QA yet.

**Next:** Establish a bounded cross-signal provenance/precedence gate for weight/activity/daily-context revisions and mark unavailable context as unknown, without interpreting co-observed records as causation. Maintain current production isolation, model cost cap and remaining owner acceptance gates.


## 2026-10-16 — PIQ-4.2 late current weight/Activity effective-signal consistency (CI GREEN)

**Status:** synthetic/CI validated on branch, not deployed or owner-accepted. Exact validated application SHA: `8c2ee5dd740c5b1c2c9d657472c15c6b49a462e8`. [GitHub Actions 38992402192](https://github.com/daurham/daurham-health/actions/runs/38992402192) **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest, production build). Code started at `910d33b`; first run `38992305954` failed the TypeScript unused-import rule; corrected final SHA passed. Engineering estimate **~77%**; formal owner-accepted phases **0/9**.

**Why:** The earlier focused PIQ-4.2 answer was protected by an independent late Nutrition source recheck but could still combine a stale intelligence snapshot weight or activity summary with later goal/settings rows. A recorded source ID alone is not proof a measurement's current value, unit or comparability label is unchanged. An activity summary can be overwritten/reimported with same date; a scale point can be replaced without changing its value.

**Implementation:** Shared `server/intelligence/snapshot.ts` now exports the initial Activity summary SQL and body-weight SQL plus the pure body-row-to-observation converter; the initial snapshot and the late source check use the same normalizing rules. New `server/ask-health/current-weight-activity-recheck.ts` runs TWO additional read-only database queries for eligible current-day focused weight/energy questions: Activity summary source identity and metrics from the selected focus window; canonical body-weight metrics with current analysis exclusions and 2-day timezone boundary padding. An exact per-calendar-date effective-signal comparison matches date, source identity, numerical value, unit, provenance and weight comparability; duplicate/replaced, added, deleted, invalid source, changed/unavailable read or mismatched source becomes `changed_or_unavailable`. It deliberately models the shared intelligence frame's last-row-per-day semantics; it is **not** a whole raw-event-table equality proof.

**Answer gate:** In `server/ask-health/load.ts` the Activity/weight recheck runs in parallel with the prior final Nutrition recheck. `focused-weight-energy.ts` carries the typed status. If **either** fails, `packet.ts` emits only a non-substantive, privacy-minimized source-consistency boundary and WITHHOLDS all potentially stale focused energy estimate, sodium/carbohydrate and protein discussion, weight/scale explanations, selected-goal cross-signal interpretations, and interventions. Tests in `tests/piq4-current-weight-activity-recheck.test.ts` check unchanged sources, same-ID corrected steps/HR, changed weight condition/unit/value, replaced source ID, added/deleted event, missing identity, unavailable DB, scope limits, filtered older data and packet fingerprint/privacy.

**Boundaries:** two extra local DB reads plus the existing Nutrition recheck; no provider/model fees, no migrations, no owner medical records viewed by developer, no main merge and no prod deployment. This is optimistic read-time consistency, NOT an atomic snapshot: changes after recheck may race. It is only the focused current-day weight-energy response; generic Activity/Context/Goals evidence, underlying current Goal Control computations, Daily Context notes/tags and other training/experiment source revisions are not yet transactionally attested. Missing logs do not mean zero. Weight/activity consistency alone does not diagnose a plateau, prove a nutrient cause or authorize calorie adjustment.

**Next:** bounded Daily Context notes/tags consistency and source precedence across general versus focused packet paths, then owner-run acceptance preparation without sacrificing safety and cost controls.


## 2026-10-16 — PIQ-4.2 late Daily Context revisions + generic-source precedence (CI GREEN)

**Validation:** Branch `piq/00-baseline-20261014`, **exact validated code SHA** `e49f308caa71d0d96889f664b502a0ef741c30d4`. [GitHub Actions 38995054252](https://github.com/daurham/daurham-health/actions/runs/38995054252) **SUCCESS**: npm ci, TypeScript, ESLint, full Vitest and production build. The first run on `5b9ff9d` ([38994800851](https://github.com/daurham/daurham-health/actions/runs/38994800851)) had 2,388 passing tests and 1 failing new integration fixture: the synthetic intelligence router omitted required `selectedKeys`. Corrected the fixture, then reran full CI green. Owner acceptance remains **0/9 formal phases**; engineering estimate **~78%**. Main and production remain unchanged.

**Resolved:** Daily Context initial note/tag reads could go stale after a concurrent owner edit, delete, insert or tag correction and still be quoted by generic Ask Health evidence. New `server/ask-health/current-context-consistency.ts` performs ONE additional late bounded Context-service read for eligible current Health-date personalized/smart/deep General, Recovery or Experiments lens requests. Compares the full saved record sets (identity, context date, note, tags normalized only for ordering, created/updated revisions) rather than only count summaries. Missing/added/deleted, repeated or malformed records and failed reads yield `changed_or_unavailable`; no raw notes, IDs or private revision values leave the integrity screen. Server loader passes the status to the packet. On mismatch the packet **withholds `context.tags` and every `context.note.*`** and emits one privacy-safe, non-substantive `context.source_consistency` warning.

**Cross-source precedence:** A separate bypass existed: when an early-read Nutrition/weight/Activity fact became invalid, the focused weight/energy block was correctly withheld by its late source checks, yet generic body, nutrition, activity, goals and shared Intelligence evidence from the initial progress snapshot still appeared. `packet.ts` now gives the failed current-focused source check precedence across those generic evidence IDs and its intelligence summary. Independently sourced context (when context itself is not conflicted), sleep, supplements and clinical profile remain eligible. The source-conflict gate is explicitly scoped to current-day focused personalized weight/energy questions and does not pretend to attest other goals, historical ranges or General Only input.

**Regression:** `tests/piq4-current-context-consistency.test.ts` checks identical/order-independent records; same-ID note, tag, timestamp or ID revisions; insert/delete, duplicate, out-of-window and database failure; suppression of raw stale notes/summary counts; packet cache fingerprint changes; generic shared-Intelligence bypass suppression and preservation of separately sourced context; historical and General Only boundaries.

**Cost and remaining limits:** One additional Context service reread on eligible current questions (one SQL query if no records, otherwise rows+tags queries), no paid model provider call, no schema migration, no owner PHI accessed by developer, no main merge or production deploy. Optimistic consistency only: Context rows and tags are fetched separately in the existing service; later edits after the recheck can race. Selected generic training, sleep, supplement and profile source revisions, historical-window sources, personal calibration safety, full transactional read coherence and owner-run QA remain unfinished. This does NOT permit a plateau classification, verified strength maintenance, specific deficit or calorie adjustment. **Next:** bounded conflict-quality precedence audit of remaining direct generic and historical evidence paths, and owner acceptance preparation without expensive provider testing.


## 2026-10-16 — PIQ-4.2 named historical weight/nutrition late-source gate (CI GREEN)

**Validated:** Exact application code SHA `6973cbea3814f8bdac4a81828417d08058a56896`, [GitHub Actions 39000152407](https://github.com/daurham/daurham-health/actions/runs/39000152407) **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest, production build). Branch `piq/00-baseline-20261014` only, no promotion to main or production. Engineering estimate **~79%**; owner-accepted **0/9** formal phases.

**New audited gap:** Named historical day and date-window answers used Nutrition days verified at first snapshot load and latest weight data normalized into that snapshot, but the current-focused late rechecks did not cover historical source edits made during the request. A historical weight or kcal mean could remain visible even after owner correction, new confirmation or analysis exclusion.

**Implementation:** New `server/ask-health/historical-weight-energy-source-recheck.ts` runs exactly TWO bounded final local SQL queries when a valid named past day or supported historical window is selected (up to the existing 90 calendar-day selection limit, restricted by the actual intelligence snapshot). Reuses the canonical owner-complete/current-revision Nutrition query for selected dates with source IDs, calories, protein, carbohydrate and sodium agreement, including newly eligible days; also reuses the excluded-weight SQL, original unit/timezone/quality/provenance conversion and effective-last-weight-per-day comparison. A range including today validates only earlier completed dates. An added, deleted, corrected, source-replaced, differently conditioned, unavailable, or inconsistently verified selected measurement fails closed. `server/ask-health/load.ts` computes the previously parsed historical selection once and performs the recheck. `src/domain/ask-health/types.ts` exposes a neutral optional status; `src/domain/ask-health/packet.ts` withholds all source-specific historical calorie, sampled-weight, weight change/range, and coverage claims after a mismatch, preserving only a non-substantive source-consistency explanation and independent historical Goal attestation boundary.

**Validation:** `tests/piq4-historical-weight-source-recheck.test.ts` covers preserved source IDs/values, same-ID correction, value/unit/condition changes, newly confirmed and deleted days, DB failure, scope and privacy/fingerprint suppression for named day and recognized `last week` dates. Production-literal natural-language relative date parser retained; no support invented for arbitrary “from DATE through DATE” date pairs. Original initial run `39000055510` was superseded; final green run is `39000152407`. Day selected as provisional today remains excluded.

**Cost and limitations:** Two additional LOCAL read-only queries only for in-range named historical weight/intake questions, none for unrelated, out-of-range or General Only. No owner data read by developer, SQL migrations, paid model APIs, target mutations or prod. Optimistic recheck is NOT atomic, cannot recover the real historical database version, and does not certify generic historical measurements/training, personal causal deficit, or the complete cross-app snapshot. Other general/training/supplement/profile paths remain release gates.

**Next:** Audit the remaining direct generic and historical evidence paths for contradictory source-quality gates, consolidate owner acceptance test checklist and rollout constraints, and continue development without consuming provider budget or altering main.


## 2026-10-16 — PIQ-4.2 generic Activity vs shared Intelligence cross-read consistency (CI GREEN)

**Status:** Code `839cac18c943729fabf0fb8678c76bdc0043ca29` [Actions 39000625346](https://github.com/daurham/daurham-health/actions/runs/39000625346) **SUCCESS** on `piq/00-baseline-20261014`: npm ci, TypeScript, ESLint, full Vitest, build. Engineering estimate **~80%** of planned development; formal owner-accepted phases **0/9**. Main/production never changed.

**Audited gap:** A personalized current Ask Health question without a weight/energy focus (e.g., “How many steps did I walk?”) loaded canonical Activity summaries for generic Progress and separately loaded Activity values into the shared Intelligence frame. A correction between these reads could cause contradictory direct `activity.*` vs `intelligence.*` evidence without triggering the prior final **focused** weight/activity source check. The latter wasn't intended for standalone activity questions.

**Change:** `src/domain/ask-health/activity-source-reconciliation.ts` compares four actually displayed saved signals—steps, active energy, exercise minutes and resting HR—across both existing source views, exact in-range Health calendar days, timezone, sourced observations and numerical values, treating observed zero differently from absent. A changed/missing source, duplicate in-range date, invalid/mismatched timezone/source ID, inconsistent range coverage or corrected value returns `changed_or_unavailable`. This adds **ZERO database calls**, no new schema, no provider calls. Historical as-of and General Only contexts remain out of scope. The loader publishes an optional status. Packet builder withholds **direct generic** Activity facts and the Activity components of shared Intelligence, including relationships with either side on an Activity key, interventions and knows/missing summaries. A neutral non-substantive `activity.source_consistency` replaces the untrustworthy Activity claims. A simultaneous current weight/energy focused question cannot revive those Activity values or focused weight/energy interpretation through another evidence route. Independent sleep, wellness, training, clinical and Context evidence is not silently discarded.

**Tests:** `tests/piq4-activity-dual-source.test.ts` checks exact matching, real logged zero vs absent, edited steps/exercise/active energy/resting HR, duplicates, wrong timezone, absent IDs, mismatch scopes, generic packet conflict/filtering, preserving unrelated relationship facts, cache fingerprint, and focused weight/energy cross-source precedence. Full repository CI passed at exact code SHA.

**Limits:** This confirms TWO ALREADY-LOADED views agree; it is **not** an independent final source revision read or transactional snapshot and does not certify activity source completeness or prove no correction can happen afterward. Generic historical Activity, Sleep, Training, Supplements and Profile paths are still not fully source-revision attested. Work remains to validate behavior in owner preview/mobile, resolve migration/instance readiness, and obtain explicit acceptance. No automatic calorie advice, action mutation, causal inference, database migration or production promotion.

**Next:** Owner-run PIQ-4 evidence acceptance matrix and source-quality failure simulations, with provider calls disabled or controlled. Then choose a bounded remaining generic source risk to repair before release gating.


## 2026-10-16 — PIQ-4.2 generic Sleep cross-read agreement and nightly identity (CI GREEN)

**Validated:** exact application code `c790488dd593d3e6de0d9988830b614f018737ab` with [GitHub Actions 39001090617](https://github.com/daurham/daurham-health/actions/runs/39001090617) **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest, production build). Development branch `piq/00-baseline-20261014` only. Engineering estimate **~81%**; formal owner acceptance **0/9** phases. Two preceding runs (`39000984430`, `39001020482`) were superseded/cancelled, not counted as validation.

**Gap closed:** Current-day personalized Ask Health loaded `sleep_nightly_summaries` independently into the generic Sleep Progress view and the shared Health Intelligence frame. A changed nightly summary could yield contradictory `sleep.duration` versus `intelligence.baseline.sleep.total_minutes` and Sleep-linked relationships. Neither generic path previously failed closed on cross-read disagreement. A same-duration nightly summary replacement could also be missed if only values were compared.

**Implementation:** Added `src/domain/ask-health/sleep-source-reconciliation.ts` pure `reconcileAskSleepSources` check against existing canonical in-range nightly records and intelligence frame. It compares Health date/timezone, unique daily identity, eligibility/partial classification, total minutes, intelligence unit/provenance, and source identity. `LIST_SLEEP_NIGHTLY_SUMMARIES_SQL` now selects canonical `id::text AS summary_id`; `mapSleepNightlySummaryRow` retains it as optional `SleepNightlySummary.summaryId` for DB-loaded records, without breaking existing synthetic or domain-only data types. A same-duration row replacement fails. Mismatches, missing/unattributed observations, changed eligibility, duplicate dates or differing values become `changed_or_unavailable`. Loader passes this optional status for current personalized questions only. Packet filters ALL generic `sleep.*` evidence on disagreement (duration, baseline, stage and source) and the Sleep parts of routed shared Intelligence (coverage, baselines, interventions, entire relationships with either Sleep operand, and affected knows/missing summary entries). One non-substantive privacy-safe `sleep.source_consistency` boundary remains; other domain evidence is preserved.

**Tests:** New `tests/piq4-sleep-dual-source.test.ts` verifies matched eligible nights, absent and partial nights, mismatched duration/eligibility/status, deletion, duplicate/timezone/date boundary, source replacement or missing summary ID, Sleep-linked relationship suppression, unrelated evidence preservation, packet withholding and fingerprint change. Full CI on exact code SHA green. No schema migrations, new local SQL round trips, provider/AI calls, owner data inspected or production promotion.

**Known limits:** This only verifies two ALREADY-LOADED views agree on the canonical eligible nightly total and row ID. It is **not** a late read-time revision check, a serializable DB snapshot, independent stage quality verification, a full personal baseline audit or Sleep-vitals attestation. Device-source arbitration and later mutations can still change after both reads; historical-as-of and General Only are not claimed verified. Synthetic zero-duration eligible observations are only exact fixtures, not a claim that 0 minutes passes actual eligibility policy. No diagnosis or recovery directive follows from disagreement.

**Next bounded task:** Audit generic Training/session/working-set source coherence and possible overbroad evidence fallback; then owner-preview acceptance matrix. Preserve privacy, provider costs, and separation from production until owner QA/migration gates.

## 2026-10-16 — PIQ-4.2 generic Training session dual-source integrity (CI GREEN)

**Validated code:** [424b8789b96146893f2ada62a9e109f9fd2a4a67](https://github.com/daurham/daurham-health/commit/424b8789b96146893f2ada62a9e109f9fd2a4a67), [GitHub Actions 39001749033](https://github.com/daurham/daurham-health/actions/runs/39001749033) **SUCCESS**: npm ci, TypeScript, ESLint, full Vitest suite and production build. Development branch only; **main/production untouched**. Engineering estimate **~82%**; formal owner acceptance **0/9** phases.

**Closed:** Independent Progress canonical Training sessions and shared Intelligence Training frame could contradict each other after a concurrent owner edit, including same-count session replacement or changed effort. New pure `reconcileAskTrainingSources` checks per-date session identity, count, non-null effort mean and source IDs for the current Health-local range; completed-day synthesized zero is distinguished from missing/provisional today. Conflicting sessions suppress direct Training session/frequency/exercise trend and focused working-set rows, plus shared-intelligence Training baseline/coverage, interventions, whole Training-linked relationships and related context. A neutral non-substantive warning takes their place. Current focused weight-energy interpretation cannot bypass a conflicting Training source gate.

**Tests:** `tests/piq4-training-dual-source.test.ts` covers matching, missing, replaced, altered effort/date, duplicate/invalid source, incompatible range, synthetic zero, shared-relationship pruning and packet cache fingerprint changes.

**Boundaries:** two already-loaded read paths only, **not** a final revision/atomic transaction or independent working-set validation. Same-ID working-set edits after Progress read, historical Training, Supplements, clinical profile and owner-data QA remain unfinished. Zero additional SQL/model calls, no migrations, paid provider spend or owner health-data access. Next: working-set version provenance/late-source coherence audit and bounded owner-preview acceptance without production promotion.

## 2026-10-16 — PIQ-4.2 canonical working-set late recheck (CI VERIFIED)

**Validated application:** code commit `8edba69476b203e985ed9dce27e83aedd5e873f5`, [Actions 39002402550](https://github.com/daurham/daurham-health/actions/runs/39002402550) SUCCESS (install, TypeScript, ESLint, full Vitest, build). Development branch only. Engineering estimate **~83%**, formally owner accepted **0/9** phases.

**Risk addressed:** A workout session ID/count/effort can remain unchanged while working-set reps, load, independent-side measurements, set type or exercise grouping changes. The prior generic session source check could not catch stale exact-exercise estimates and trends. New `server/ask-health/current-working-sets-recheck.ts` uses ONE bounded local final canonical SQL read for current personalized General/Training or focused exercise questions (no query for unrelated lenses). The same exported `mapProgressSetRow` now maps both Progress initial and late set observations. Full selected source content is compared by unique set ID and all canonical fields, including previously empty selections, not merely the highest selected estimate. A modified/replaced/added/deleted/malformed/unavailable set fails closed. Generic/focused Training evidence and Training-linked shared Intelligence are suppressed, and current focused weight-energy cannot bypass conflicting Training support. A privacy-safe, non-substantive boundary and changed cache fingerprint replace claims.

**Tests:** `tests/piq4-working-set-recheck.test.ts` covers unchanged/shuffled/empty records; same-ID load/reps/bilateral fields; metadata/identity changes; deletions/insertions/invalid duplicates; a parameterized scoped local read; unavailable SQL; packet suppression and cache fingerprint. Zero provider calls or migrations; no owner PHI viewed. Not an atomic revision lock, full exercise-definition metadata recheck, historical-as-of attestation, strength-preservation confirmation or clinical deficit authorization. Owner-preview acceptance, supplements/profile integrity and controlled rollout remain future gates.

**Next:** review exercise-definition/classification identity changes and generic evidence quality before formal PIQ-4 preview signoff.

## 2026-10-16 — PIQ-4.2 exercise-definition source agreement (CI VERIFIED)

**Validated code:** `ca7a02abe1dc5e81a84d103d5009a40d0596d07c` [GitHub Actions 39002857872](https://github.com/daurham/daurham-health/actions/runs/39002857872) SUCCESS: npm ci, TypeScript, ESLint, full Vitest and build. PIQ development branch only; main and production unchanged. Engineering estimate **~84%**; formal phase owner acceptance **0/9**.

**Resolved:** A saved exercise definition can change its displayed name, external identity, performance type, load semantics, per-side rep mode, unilateral classification or measurement kind while all workout sets and session IDs remain identical. Those changes can alter the selection and estimation of comparable strength and previously leak stale exercise labels into clarification. The canonical Progress mapper is shared with a new final definition read. One additional local read-only query for current personalized general/training/focused-exercise strength evidence compares unique IDs and ALL effective classification fields, including unused named definitions. Corrections/replacements/additions/removals, malformed/duplicate identities and failed reads suppress direct and focused Training strength, linked shared Intelligence and compromised current weight-energy interpretation. Exercise-name clarification is withheld too. Unrelated source evidence is preserved; source-warning text is non-substantive and privacy-safe.

**Regressions:** `tests/piq4-exercise-definitions-recheck.test.ts` checks exact and order-insensitive matching, same-ID field corrections, insert/delete/duplicate/malformed, one local SQL read, error handling and packet/fingerprint/clarification suppression. This was fully verified at the exact code SHA above. No migrations, provider calls, owner health reads or production release.

**Limits:** Effective canonical attributes only, not raw unchanged-value edits, complete history, atomic cross-read locking or strength recovery confirmation. Existing Training and working-set source gates remain. **Next:** bounded review of generic supplement and profile source revisions plus owner preview/release acceptance planning.

## 2026-10-16 — PIQ-4.2 owner Health Profile final consistency (CI GREEN)

**Code:** `a6d6d8a96726764ff2f5a01faf8eb4ebf86c9ba4`, [Branch validation 39003255534](https://github.com/daurham/daurham-health/actions/runs/39003255534) SUCCESS (install, TypeScript, ESLint, full Vitest and build). Development branch only; engineering estimate **~85%**, formal owner acceptance **0/9**. No main merge, production deployment, migration, paid provider call, or owner health-data inspection.

**Closed:** The initial singleton owner Health Profile could be updated during Ask Health retrieval, leaving stale current medication/dose/status, allergy, condition, height, birthdate, physiology reference, persistent notes or training/dietary limitation in evidence packets. `server/ask-health/current-health-profile-recheck.ts` performs one **late local read** on selected current personalized/smart/deep answers and compares the canonical full profile plus saved `updatedAt`. New/removed/changed/malformed/unreadable profile fails closed, withholds **all** direct stable/clinical profile evidence and shows one neutral limitation instead. It does not claim absent evidence means no illness or no allergies. Independent Sleep/Activity/Nutrition/Training evidence remains available; packet fingerprint changes. Historical-as-of and General Only are not called "verified" by this current revision check.

**Regression:** `tests/piq4-health-profile-recheck.test.ts` covers unchanged/empty initial profile, same-ID clinical edits and saved revision changes, added/changed medication/allergy/condition/demographic/notes, malformed timestamp, failed read, historical scope, profile suppression, unrelated evidence and cache fingerprint. **Limits:** optimistic non-atomic read, not an attestation of medical accuracy, medication ingestion or clinical diagnosis. Next: supplement schedule and adherence source consistency, then owner preview/acceptance.

## 2026-10-16 — PIQ-4.2 Supplements late-source consistency (CI GREEN)

**Code:** `529fec8abb3cfcc25188df7ac57f1bd4d73a9af1`, [Branch validation 39003629185](https://github.com/daurham/daurham-health/actions/runs/39003629185) SUCCESS (install, TypeScript, ESLint, full Vitest and build). PIQ development branch only, estimated engineering progress **~86%**; formal owner acceptance **0/9** phases. No main merge, production deploy, schema migration, paid model calls or personal data inspection.

**Closed:** Current personalized General/Nutrition or saved-name-matched questions may load owner supplement schedules, lifecycle and taken/skipped logs before those rows are edited in the same request. `server/ask-health/current-supplement-recheck.ts` performs a final bounded service read (four local SQL queries) **only when supplement evidence could be surfaced**, using the same exported saved-name matcher as the evidence packet. A deterministic comparison includes regimen dose, units, start/end, weekday masks, status-event chronology, adherence status and actual recorded dose; it handles missing/new records and rejects malformed/duplicate identities. A mismatch/unavailable read suppresses all source-dependent Supplements evidence and shows a neutral warning; missing logs never become skipped/taken. Unrelated source facts remain usable and cache fingerprint changes.

**Tests:** `tests/piq4-supplement-source-recheck.test.ts` covers equal, absent, inserted/deleted, renamed, reclassified/changed schedule, lifecycle, adherence and dose, malformed/duplicate data, same canonical name matching, local read errors, and packet suppression. This is **effective projected-record agreement**, not raw event/adherence row-ID revision validation or an atomic source lock. Historical-as-of supplements remain unverified; owner-preview acceptance is required.

**Next:** prepare PIQ-4.2 owner-realistic test matrix, audit generic context routes/limitations and select release gates without production promotion.

## 2026-10-16 — PIQ-4.2 historical-as-of saved Supplements late-range coherence (CI GREEN)

**Validated code:** `24cf3b575ece22dd14e16a0027e3661d4bb15d1c`, [Actions 39003951542](https://github.com/daurham/daurham-health/actions/runs/39003951542) SUCCESS (npm ci, TypeScript, ESLint, full Vitest and build). Development branch only; engineering estimate **~87%**, formally owner-accepted **0/9** phases. No production promotion, migration, PHI inspection, paid provider call or database mutation.

**Closed:** The Supplements late-range check formerly ran only for Health-local today. An explicitly selected past as-of date could still use a stale regimen or recorded adherence if the owner corrected an old schedule/status/taken/skipped row during request retrieval. The loader now applies the **same exact saved-name selection and selected-date source comparison** to eligible owner-personalized historical-as-of periods. The existing service rereads only the selected date range (four local read-only queries), and evidence suppresses supplement facts with a privacy-safe neutral conflict warning if previously loaded effective records have changed, been deleted or become unavailable. New regression verifies an as-of yesterday scenario, changed saved taken→skipped record and unavailable read.

**Semantic boundary:** This confirms consistency of the *currently stored representation of the requested past date*, NOT what the owner had saved or knew at the time. No raw historical revisions, ingestion confirmation or retroactive causality claims are verified. General Only remains excluded; no unrelated supplement queries or provider calls added. **Next:** move from PIQ-4.2 automated source checks into owner-preview acceptance readiness, using targeted adversarial data fixtures and source-identity limitations before requesting approval for any rollout.

## 2026-10-16 — PIQ-4.2 owner-preview current-claim citation guard (CI GREEN)

**Validated exact code:** `cba590d44a7388e8502dabac9eb4f1b32754138a`, [GitHub Actions 39004654452](https://github.com/daurham/daurham-health/actions/runs/39004654452) SUCCESS (npm ci, npx tsc -b, npx eslint ., full Vitest, npm run build). Development branch only, ~88% engineering estimate, **0/9 owner-accepted** phases. The initial code commit `178c66737dd55e330742743ce1a0c62c30176426` failed first CI solely because one legacy test expected the previous v11 prompt; commit `cba590d44a7388e8502dabac9eb4f1b32754138a` aligned the test to intentional v12 and passed all required checks.

**Problem and fix:** JSON schema validation could accept an affirmative current owner measurement without any evidence citation. Such a claim could still be emitted after the packet withheld changed Activity/other data, or by attaching a neutral source-warning ID / unrelated Sleep metric. The existing `groundHistoricalAnswer` final boundary now also verifies **undated/current affirmative owner measurement claims** have at least one cited substantive item and all explicitly named measurement domains have substantive cited evidence. Unsafe claims/limitations are dropped with a neutral explanation; unrelated educational text remains. Applies to fresh AND cached replies, with cache/prompt version `ask-health-v12`. No extra Gemini repair or database reads.

**Tests:** `tests/piq4-owner-current-claim-guard.test.ts` rehearses uncited figures, cited non-substantive source warnings, wrong-domain citations following source invalidation, supported owner claims, conditional/hypothetical explanations, owner claims in limitations, cache replay and call counts. Synthetic only; no PHI, paid AI, real database access, schema mutation, production promotion or owner-data inspection.

**Limit:** citation scope/domain is **not semantic proof** or current numeric value equality, does not recognize every nonnumeric personal assertion, cannot make concurrent multi-source reads atomic and does not certify medical accuracy. PIQ-4 owner-preview realistic/phone QA, production database read-only migration preflight, budget observation and explicit owner authorization are still required. **Next:** focus bounded current numeric equality/source-claim QA, then isolated preview and no-go gates.

## 2026-10-16 — PIQ-4.2 current numeric values AND configured target distinctions (CI GREEN)

**Validated exact application/test commit:** `df2ba73dbae5bf895e7d80a13d69775292a819f8`, [GitHub Actions 39005550674](https://github.com/daurham/daurham-health/actions/runs/39005550674) **SUCCESS** (npm ci, TypeScript, ESLint, full Vitest, production build). Work limited to PIQ branch, ~89% engineering estimate, **0/9 formal owner-accepted phases**. No owner PHI, database read/write, migration, paid AI calls or `main` promotion.

**Gap and implementation:** A correctly cited substantive current Activity/Body/Nutrition/Training/Sleep fact could previously be restated with an invented same-unit amount. `groundHistoricalAnswer` now matches every recognized affirmative, current owner-recorded number and canonical unit against the SUBSTANTIVE cited numeric evidence (or precisely scoped verified Training set coverage). It checks nutrient identities (150 g protein does not attest 150 g fiber), comma grouping, sleep duration in minutes and saved sodium in mg, with unsupported locale/percentage/conversions withheld. General mechanisms and separately supported evidence remain available; the model cannot spend a second paid call to repair the claim. Ask Health provider/cache prompt moved to `v13` and says to copy only supported numeric values rather than derive unrelated amounts.

**Important regression caught by full suite:** Initial code `0ad6499bf53279f4783e42c3b6e5249ee699fedf` failed [Actions 39005225323](https://github.com/daurham/daurham-health/actions/runs/39005225323) on one pre-existing baseline: a true saved 80 kg *weight-goal target* (non-numeric source value with canonical target text) was falsely suppressed as an inaccurate *measured* 80 kg. The corrective commits `eccdd39dd4f77c3773ee6c7bb42f64eab5217ac5` and `df2ba73dbae5bf895e7d80a13d69775292a819f8` add conservative exact-target and planned-Supplement-regimen matching from their canonical source text, ONLY for explicitly stated configured goals/planned doses. The same values do **not** attest a scale measurement, goal achievement or supplement ingestion. Additional tests prove wrong target/dose and claimed ingestion are rejected.

**Regression inventory:** Expanded `tests/piq4-owner-current-claim-guard.test.ts` covers wrong cited current steps, correct 5,000 formatting, equal-unit wrong fiber/protein, mixed correct steps and changed Sleep minute values, exact sodium mg and unsupported units, target-as-measured-weight denial, correct/incorrect configured goals and Supplement planned dose, no ingestion assertion, mixed bad paragraphs, and cached/synthetic model output. The pre-existing PIQ-0 saved-goal model-and-cache baseline also passes. These are synthetic offline tests.

**Residual:** This is a high-precision deterministic structural/numeric filter, not a semantic or medical fact checker. A cited target can still be misunderstood verbally; nonnumeric claims, arithmetic in compound prose, legitimate unit conversions, dose/goal language combinations, insufficient owner history, clinically inappropriate recommendations and concurrent non-atomic reads require manual owner-preview QA. Historical milligram claims remain in the deliberately limited historical unit policy. No release is authorized from green CI.

**Next:** Owner-preview acceptance review with adversarial owner-shaped scenarios and mobile answer/citation inspection, preview isolation, spend cap, DB migration preflight and explicit promotion approval. Avoid adding unnecessary per-request database reads or model calls.

## 2026-10-16 — PIQ-4.2 current Goal Control status assertion guard (CI GREEN)

**Validated exact code:** `1bfc13b7b5f45eecf6f571d95d25e4a5442dafb3`, [GitHub Actions 39005972600](https://github.com/daurham/daurham-health/actions/runs/39005972600) SUCCESS (npm ci, TypeScript, ESLint, full Vitest, build). PIQ development branch only; engineering estimate **~90%**, formal phase owner acceptance **0/9**. No `main` merge, production, migration, owner records, paid AI or new SQL.

**Problem and fix:** The previous current-answer guard correctly validated a saved numerical goal target but could still accept false *goal achieved*, *goal completed* or *on/off-track* status with that citation. A configured target is NOT a confirmed outcome. The final grounded-answer boundary now checks narrow affirmative current owner Goal Control status assertions against **one** cited substantive `goals.*` record and the exact eligible `targetState`, `lifecycle` or `deadlineState`. Generic or uncertain education remains. The Goal packet now includes current lifecycle in coverage (not a new DB query). False status paragraphs are withheld with a neutral explanation while the legitimate configured target survives. Applies to fresh and cached replies; provider/cache prompt version advances to `ask-health-v14`.

**Synthetic regression:** `tests/piq4-owner-current-claim-guard.test.ts` verifies unsupported claimed target attainment/completion/on-track with above-target active goals, true satisfied state, projected-before-deadline state, an explicitly completed synthetic lifecycle, correct target preservation, speculative uncertainty and cached fake-model answers. No real person or live Gemini tested.

**Limitations:** This is a narrow current-status source consistency check; it does not certify actual real-world goal achievement or complex sentences, reconstruct history, read raw owner data, or replace manual/semantic owner QA. Preview isolation, mobile results, AI spend monitoring and database migration read-only check remain mandatory release gates. Green CI does not constitute owner approval.

**Next:** Record a bounded offline PIQ-4 owner-preview acceptance inventory, then owner-realistic QA and explicit release checks before discussing `main` promotion.

## 2026-10-16 — PIQ-4.2 cached General Only replay safeguards and preview-isolation audit (CI GREEN)

**Validated application/test code:** `0570462c7b120f077cb4c47d195e78c36ec089e9`, [GitHub Actions 39006416516](https://github.com/daurham/daurham-health/actions/runs/39006416516) SUCCESS (npm ci, TypeScript, ESLint, full Vitest, build). Branch-only engineering ~90%, **formal owner acceptance 0/9**. `main`, production, database schema/records, paid provider budget and deployment unchanged by this task.

**Answer-scope gap:** General Only/Smart educational fresh outputs already used a hallucinated-owner-record validator and one bounded provider repair, but cached general replies bypassed that validator. An older cached general reply could thus assert `Your weight is 90 kg` or `You logged 8000 steps` without any source. Added a narrow personal metric/record claim detector in `src/domain/ask-health/general.ts`; explicitly checks current personal weight/steps/height/sleep/intake statements and saved-record attributions. On cached General Only responses, dangerous blocks and limitations are withheld, separately useful general explanation remains, and empty wholly contaminated caches produce a neutral truthful fallback. No re-query, no extra Gemini call, no stored private evidence; prompt/cache version now `ask-health-general-v2`. Expanded `tests/piq3-general-routing.test.ts` checks fresh hallucination retry refusal, contaminated cache redaction, retained general education, zero provider calls, safe fallback and correct general answer scope.

**Preview metadata discovery (READ ONLY):** Correct unscoped Vercel access still works without reconnection. Latest fetched READY PIQ branch preview deployment advertises `df2ba73dbae5bf895e7d80a13d69775292a819f8`, older than the validated code and branch head. Candidate Vercel-managed Neon Health project independently reports the existing PIQ preview branch `init_source=parent-data`; it inherits default-branch records, so **owner-data QA is forbidden until independent EMPTY-origin test isolation is established**. A READY URL is not a permit to use PHI. No runtime binding or active schema-migration preflight was performed.

**Pending:** Isolated preview branch and separate Auth/disposable owner identity attested by provider; exact serving preview SHA; owner mobile/answer quality acceptance, spending review, target-authorized read-only migration inventory, backup/restore rehearsal and separately approved release. Existing source reads remain optimistic and heuristic checks cannot validate every statement.

## 2026-10-16 — PIQ-4 owner preview exact-commit and Neon-origin metadata preflight (CI GREEN)

**Validated code:** `6d4b0a01a82533c166dbac298a368a94fbf08db8` on [GitHub Actions 39007230291](https://github.com/daurham/daurham-health/actions/runs/39007230291), all configured checks passed. No production/main mutation, DB query, migration, owner PHI or paid Gemini. Engineering estimate **~90–91%**; **0/9 owner-accepted** phases.

**Why:** An apparently READY Vercel preview can be at an older git SHA, can point at an unverified branch or Auth tenant, and a Neon preview branch cloned from the source database may inherit private owner data. Existing runtime environment-only validation `reviewPiqPreviewSafety` was appropriately fail-closed but did not independently triangulate GitHub CI and Vercel deployment metadata. New pure `reviewPiqPreviewMetadata` requires actual GitHub PIQ ref and full 40-char SHA, a SUCCESS/COMPLETED GitHub Actions run on that same exact SHA, Vercel READY non-production preview on the matching ref and SHA, and an independently reported Neon branch from the expected project, not production or a child of production and with `init_source=empty`. It reports **only enum blockers**, never raw project/user/connection identifiers.

**Safety outcome:** Even fully matching metadata yields `metadata_consistent_not_authorized`, with outstanding gates for runtime effective DB binding, Auth and disposable-owner separation, empty owner-row verification, migration/backup readiness, and explicit owner consent. Synthetic tests exercise exact-SHA CI mismatch, old/missing READY deployment, wrong ref, fake production target, missing branch, copied parent data, unknown init origin and output redaction without reading any real records.

**Current read-only evidence:** As checked before this code commit, the most recent returned PIQ Vercel preview reports branch SHA `852be816b8efd3077f61f46ff04a024e5a4cff02` (a docs-only checkpoint), which differs from the code candidate `6d4b0a01a82533c166dbac298a368a94fbf08db8`; older code `0570462c7b120f077cb4c47d195e78c36ec089e9` passed full CI but is not the same deployed SHA. Neon candidate PIQ branch `br-damp-pine-aw5cconp` reports `init_source=parent-data` from a parent branch, which may contain owner records. **Owner preview QA is blocked.** The project/branch metadata check was read-only and is not a schema migration assessment or authorization.

**Next:** Establish an independently empty, access-isolated test database and Auth/owner tenancy, verify the exact serving preview SHA with provider metadata, then owner/mobile answer-quality QA and target-approved read-only migration inventory. Do not automatically create/delete branches or promote main to clear a gate.

## 2026-10-16 — PIQ-4 release gate: full CI workflow and preview-project identity (validation pending)

**Development branch only; full CI to be verified on this commit.** Hardened
`server/piq-preview-metadata.ts` to reject a GitHub Actions success from
`.github/workflows/piq1-postgres.yml` (or any other partial workflow), even when
the commit SHA matches, unless the independently supplied provider record
identifies `.github/workflows/validation.yml`. Additionally require the Vercel
preview deployment to belong to the expected Health Vercel project. Missing
identity blocks owner QA. Synthetic regression tests cover incorrect/missing
workflow and wrong/missing project, plus the successful path. No code path can
authorize PHI/owner QA merely because metadata agrees. Await exact-SHA full
GitHub CI before calling this implementation validated.

**Release remains blocked:** current preview code SHA mismatch, Neon branch
inherits parent data, runtime DB/Auth/owner identity and empty-row verification
unattested, no owner/mobile acceptance, read-only migration/backups and approval
pending. Engineering remains approximately 91%; formal owner acceptance 0/9.
No Vercel deployment or other provider mutation was initiated for this step.

## 2026-10-16 — PIQ-3/4 General Only follow-up and qualitative owner-claim guard (CI pending)

**Development branch, exact-SHA full CI pending.** General Only's existing
deterministic unsupported-owner-record screen checked answer blocks and
limitations but omitted model-generated `followUps`. Added follow-up screening
to both fresh-response validation and cached-answer sanitization, so a
seemingly safe education paragraph cannot smuggle a fabricated user
measurement in its suggested next question. Also recognizes narrow,
sentence-start affirmative owner states (e.g., "Your fiber intake is low,"
"Your sleep has worsened," "You are dehydrated") while retaining
hypothetical educational questions and generic second-person physiology.
No user data, provider call or SQL access added. Cache scope stays v2:
already-cached General Only answers are screened on delivery with zero
new model spend. Synthetic stub tests cover provider retry, poisoned
cached follow-up removal, false-personal-state rejection and safe
educational phrasing. This is a high-precision string guard, not clinical
truth verification; owner preview acceptance still required.

**Release:** preview code SHA for preceding candidate is now READY, but
Neon PIQ branch remains a parent-data clone, and runtime Auth/DB/owner
isolation is unverified. No main merge, migration, database mutation or
live owner QA. Approximately 91% engineering, formal acceptance 0/9.

## 2026-10-16 — PIQ-3 General Only cached evidence-reference scrub (validation pending)

**Branch-only code and synthetic test; exact-SHA CI pending.** Legacy cached
General Only responses with entirely harmless educational text could still
return stale owner `evidenceRefs` because the prior sanitizer returned
the entire unchanged answer when the personal-claim regex found no textual
issue. The sanitizer now clears every cached block/limitation reference
regardless of the detector outcome, preserving safe education and
legitimate follow-up suggestions. Detected unsupported owner text continues
to be withheld, including unsafe follow-ups. The test stubs a legacy cache
with private-looking evidence IDs, proves the original object remains
unchanged, the response contains no IDs, and no provider is called.
No database read/write, owner data, schema migration, new model spend,
main merge or release. This does not make a regex an exhaustive semantic
truth validator. Owner preview remains blocked by copied Neon parent data
and unverified runtime Auth isolation. Engineering ~91%; accepted 0/9.

## 2026-10-16 — PIQ-4 preview owner-API runtime lockdown (CI pending)

Bounded release safety change: existing preflight only reported unsafe
provider metadata; it did not prevent PIQ-preview owner API requests.
Added a hard-fail route-level 503 gate for PIQ Git refs and unknown-ref
Vercel previews, including Auth, Health, backup export, and Ask Health.
No environment-only override. Other known preview refs and production
main are unchanged. Added synthetic dispatch tests and no-cache response.
Await exact-commit full CI. Development-branch code cannot protect
older deployed preview SHAs, and the cloned Neon candidate remains
unsuitable for owner QA. No database, migration, credentials,
personal records, paid AI or main touched. ~91% engineering,
formal acceptance 0/9.

## 2026-10-17 — PIQ-4 fresh independent QA project and Auth established

**Approved limited infrastructure action completed, not QA approval.**
Created a separate Neon project `lively-wave-25801832` named
`daurham-health-piq-isolated-qa`, default root
`br-crimson-cloud-akrf5kuo` (Postgres 18), distinct from the
production Health project. Read-only QA SQL initially confirmed
no non-system tables. Provisioned isolated `better_auth`, matching
the production Auth technology but with a different provider project
and Auth endpoint; read-only follow-up found zero application tables,
zero QA users/sessions, and nine new Auth service tables. No owner
rows or backups copied; no QA account created; Vercel and production
untouched. GitHub Actions 39008436437 validation of runtime
API lock `0c06235` succeeded on retry after transient disposable
Postgres runner startup failure.

Neon reports root `init_source=parent-data` despite no parent branch;
existing strict metadata checker appropriately still reports BLOCKED.
Do not weaken it without provider-created root provenance plus
independent schema/data evidence and explicit release review. Next
work: QA schema compatibility and separately approved migrations,
disposable Auth owner, isolated preview bindings and runtime
attestation, then mobile acceptance. Engineering ~91%;
formal owner acceptance 0/9.


## 2026-10-17 — Approved schema-only bootstrap on separate Neon QA project (VERIFIED)

**Owner authorization was expressly limited to applying/testing existing
repository migrations on this new isolated database.** Project
`lively-wave-25801832`, root branch `br-crimson-cloud-akrf5kuo`,
database `neondb`, PostgreSQL version `18.6` (server_version_num
`180006`). No production project or original preview Neon branch
was accessed for SQL in this operation.

- Checked the QA database was pristine: zero public tables, zero QA
  Auth users and sessions before applying application migrations.
- Fetched the 56 numbered migration SQL files from the pinned PIQ
  GitHub branch and used the repository's PostgreSQL-aware
  `splitSqlStatements` semantics. Applied each file in its own Neon
  SQL transaction with the corresponding `schema_migrations` insert,
  after checking the recorded prefix before each batch. This was
  executed through the Neon SQL tooling, not by running `npm run migrate`
  in the deployed app.
- All 56 applied in exact ascending order, from
  `0001_health_foundation.sql` through
  `0056_primary_goal_intent_events.sql`, with no reported DDL errors.
- Independent read-only Neon SQL verified 56 distinct sequential
  migration-history filenames, 77 public application/system tables
  (including `schema_migrations`) and nine `neon_auth` tables.
- Fresh-install seed checks: 26 active shared exercise definitions,
  one active seeded Beginner Calisthenics template (`CAL-BEG`),
  zero active seeded original A/B/C legacy templates and zero
  owner-created workout templates.
- Explicit read-only counts on 13 high-value owner-data tables:
  `health_profile`, `body_metrics`, `nutrition_entries`,
  `workout_sessions`, `goals`, `supplements`, `daily_context`,
  `hydration_events`, `bowel_events`, `benchmark_results`,
  `coach_tasks`, `ai_usage`, and `primary_goal_intent_events` —
  **all zero**, as were QA Auth users and sessions.

**Scope/limits:** This establishes **schema migration compatibility**
with PostgreSQL 18 and an empty disposable-owner starting state,
not runtime/API compatibility or a verified Vercel preview. No
app authentication/logins, disposable owner creation, runtime binding,
model calls, backup import, production migrations, `main` merge,
or preview deployment occurred. New-root Neon
`init_source=parent-data` metadata still needs separately justified
provenance in the strict release gate; do not globally whitelist
`parent-data`. Unverified release conditions: QA account/owner
mapping, Vercel preview-only DB/Auth overrides, exact-SHA deployment,
runtime test, backup/rollback and owner mobile acceptance. Formal
owner acceptance remains 0/9 (~91% overall engineering estimate).


## 2026-10-17 — Separate-project root provenance review: code-only

The new independently provisioned Neon QA **root** has
`init_source=parent-data` despite a null parent branch and verified
zero original application tables. Added a bounded, *offline only*
`piq-neon-root-provenance.ts` review so this root label is not
mistaken for an inherited production-data clone **only when all
independently obtained records are supplied by a trusted operator**:
different production/QA Neon project identities; same newly-created
default/root branch with no parent and matching project creation time;
zero public tables and auth users/sessions at genesis; fully ordered
current migration history; zero owner data in 13 sensitive tables
after bootstrap; distinct, provider-verified better_auth projects.
A missing, mismatched, incomplete, or self-asserted proof blocks
the special case. Other `parent-data` branches remain blocked.

Both existing read-only PIQ metadata and preview preflight validators
can accept this optional independent proof. This **does not enable**
PIQ preview owner/API access: `piq-preview-access.ts` retains its
hard 503 release stop, and live DB/Auth binding, disposable owner,
Vercel exact-SHA deploy, QA/backup and owner acceptance remain
independent requirements. No Vercel variables, deployment, Neon
data, credentials, owner accounts, migrations or production edited.
All tests are synthetic; proof must never originate from the app
request or environment as a self-attestation.

## 2026-10-17 — Disposable QA identity and branch-only Vercel setup (PARTIAL, fail-closed)

With explicit owner approval, created one disposable test-only Neon Auth user
`2420a606-0f6e-46e4-8aab-65a39e25f6e3` under *separate* QA project
`lively-wave-25801832`; the reserved `example.com` address is not a
working sign-in identity and no password/session exists. GitHub commit
`57cb41ed272cc5cfe10b46057d121599a7f2e75e` fixed the provenance
blocker double-report and passed full GitHub Actions CI (39010442965).

Created/verified 37 Vercel environment variable entries exclusively for
Preview + `piq/00-baseline-20261014`. These include distinct Neon Auth
service and QA owner IDs, endpoint metadata, runtime DB/Auth binding flags,
project/branch identity and exact-SHA config. An automatic database-credential
handoff was blocked by platform security controls. No secret was printed or
committed. To avoid falling back to shared production Preview credentials,
branch-specific DB connection aliases, database username/password aliases
and the cookie secret were explicitly overridden with **invalid sentinel
values**. No connected database, authenticated sessions, or owner API access
may be claimed. The release stays blocked by the runtime PIQ API hard lock
and intentional invalid DB/cookie values; the current Vercel deployment may
predate the new environment settings. Documented safe manual future handoff
in `docs/ai/PIQ4_QA_CREDENTIAL_SETUP.md`.

No production/Main changes, production health data reads, migrations,
production account copying, paid AI calls, or personal health QA.


## PIQ-4.2 — QA cookie-secret completeness in static release preflight (2026-10-17)

State: **implemented on development branch; validation pending CI**, not deployed or owner-accepted.
Depends on: PIQ-4 preview/isolation guards.
Why: `reviewPiqPreviewSafety` previously considered configuration eligible for
manual attestation even when `NEON_AUTH_COOKIE_SECRET` was entirely missing.
That could mislead an operator while the preview login is nonfunctional.
Files: `server/piq-preview-preflight.ts`, `tests/piq4-preview-preflight.test.ts`.
Contract: Fail closed with constant `PREVIEW_COOKIE_SECRET_NOT_READY` on missing,
shorter-than-32, whitespace, uniform repeated-character or known placeholder
cookie secrets. Never log the candidate value. This is **only syntactic
readiness**, not cryptographic entropy or proof the QA secret differs from
production. The owner/operator must supply an independently generated QA
secret and independently attest non-reuse. A valid-looking cookie does not
bypass `piq-preview-access.ts`, the inherited-data gate, Git SHA matching,
owner-account matching or real runtime tests.
Test: test valid 64-character synthetic secret + unknown/missing/short,
repeated and placeholder cases; ensure result does not disclose secret.
Migrations: none. Provider/model cost: none. Production/runtime changes: none.
Release: pending CI; avoid Vercel retry under exhausted deployment quota.
Outstanding: manual QA credentials later, usable disposable login, trusted
origin, runtime binding/QA, backup readiness, mobile owner acceptance (0/9).
Next: verify exact-SHA GitHub full validation and keep preview locked.


## PIQ-4.2 — QA database credential placeholders now block static readiness (2026-10-17)

State: **development-branch implementation; CI and owner acceptance pending.**
Depends on: PIQ-4 preview preflight and existing runtime binding check.
Why: The Neon endpoint and database name can match even if the Postgres
URI contains invalid dummy credentials; earlier configuration review did not
explicitly distinguish credential readiness from host identity.
Contract: Add non-secret, pure `PREVIEW_DATABASE_CREDENTIALS_NOT_READY`
blocker for a missing/unparseable URI, absent/whitespace login, too-short
or obviously repeated password, and identifiable placeholder username or
password (including percent-encoded sentinels). Log **only** the blocker
code; no connection strings, role names or decoded passwords. Retain the
independent endpoint/TLS checks in `assessDatabaseBinding` and the hard
503 PIQ API lock. Passing a syntactic check is not a successful SQL login,
proof the credentials are unique to QA, or authority to use owner records.
Test: synthetic valid URI; empty, short, uniformly repeated, placeholder,
percent-encoded sentinel, whitespace, and malformed-percent cases.
Files: `server/piq-preview-preflight.ts`, `tests/piq4-preview-preflight.test.ts`.
Migrations: none; provider/model calls: none; runtime and production: unchanged.
Release: blocked pending CI, manual real QA credential configuration,
exact-SHA preview attestation and owner acceptance (0/9).


## 2026-10-17 — PIQ runtime API lock survives inconsistent Vercel git metadata

State: **implemented in PIQ development branch; CI and exact-preview runtime
validation pending, not owner-accepted**. The existing hard 503 lock previously
keyed mainly on `VERCEL_GIT_COMMIT_REF` and a blank-ref preview fallback.
Now it also fails closed when any PIQ-only environment marker key exists,
even with blank marker values or contradictory Vercel branch/target metadata.
Markers: `HEALTH_PIQ_EXPECTED_NEON_PROJECT_ID`,
`HEALTH_PIQ_EXPECTED_PREVIEW_BRANCH_ID`,
`HEALTH_PIQ_PREVIEW_TEST_OWNER_USER_ID`,
`HEALTH_PIQ_EXPECTED_PREVIEW_SHA`. No marker can **unlock** the APIs;
`HEALTH_PIQ_ALLOW_OWNER_QA` is deliberately ignored. Non-PIQ deployment
without any markers retains prior behavior; production `main` unmodified.

New synthetic dispatcher tests verify known owner, Auth and Ask Health
routes return the original 503, `no-store` and redacted blocker even
when Git metadata disagrees with PIQ branch-scoped configuration.
No migration, database changes, live owner data, model calls, or
production changes. GitHub CI/test/build and Vercel exact-SHA preview
are validation prerequisites, not release approval. Mobile owner
acceptance remains 0/9. Next: verify full branch CI; do not relax the
lock until separately approved owner QA gate.


## 2026-10-17 — General Only factual habit hallucinations, golden regression (PIQ-3 QA)

State: **implemented on the PIQ development branch; exact-SHA CI pending**.
Observed gap in the lexical general-answer safety filter: ungrounded
affirmative owner routine claims without measurements or references (e.g.
`You take creatine every day.`) were not caught by the prior owner-record,
numeric and qualitative-state checks. Bounded fix:
`src/domain/ask-health/general.ts` now screens affirmative, sentence-anchored
owner habit/medication/supplement/food/training statements that assert a
current/regular practice or frequency. It intentionally leaves conditional
and permissive general education (e.g. `If you take creatine ...`,
`You can take ...`) eligible. This is an extra lexical guard, not a
complete semantic health-safety or model-quality classifier.

Added synthetic `tests/piq3-general-routing.test.ts` regression cases
for fresh model responses (one bounded repair and failure), legacy cached
responses (strip claim/evidence IDs while retaining independent general
education), and follow-up statements. No real health data, external
provider/model calls, migrations, new features, auth changes, or
production writes. Release and formal owner acceptance remain blocked;
0/9 owner scenarios accepted. Next: validate affected test and complete
CI; continue owner-realistic QA only after separate credential/isolation gate.


## 2026-10-17 — General Only invented diagnosis/clinician/lab guard (PIQ-3)

State: development-branch implementation, **CI pending**, live owner
acceptance not started. In General Only, provider output may fabricate
a personalized diagnosis, clinician prescription, or lab result without
claiming it came from saved records or supplying a number. Added a
sentence-anchored lexical check for affirmative assertions including
"You have anemia", "Your symptoms suggest...", "Your bloodwork
shows...", and "Your doctor prescribed..."; conditional education
("If you have anemia...", "Your symptoms may vary") remains allowed.
This is a supplemental heuristic, not a complete model-safety
classifier or substitute for clinical QA. Updated the synthetic
General Only regression suite to cover safe-vs-unsafe false positives,
poisoned cached claims/evidence/follow-ups (no provider spend), and
fresh invalid provider responses (bounded repair/failure).

Files: `src/domain/ask-health/general.ts`,
`tests/piq3-general-routing.test.ts`. No migration, preview unlock,
provider calls, owner data or production change. Next: exact-SHA full
CI and later owner/mobile QA. Formal owner acceptance 0/9.

## 2026-10-17 — PIQ-4 digestive safety: affirmative black/tarry-stool synonyms

State: **implemented on PIQ development branch; GitHub CI pending**.
Current severe-GI shortcut recognized present-tense `I am passing black tarry
stools` but did not recognize `I have black tarry stools`, `My stool is
black and tarry`, or `My stools are tarry`. Added sentence-start, first-
person and present-tense equivalents to `detectImmediateSafety` without
classifying hypothetical, explicitly negated or historic reports as an
affirmative *current* emergency. Preexisting deterministic emergency response
is reused: no model spend, no private Health reads, no diagnosis, no state
writes. Added tests in `piq3-immediate-safety.test.ts` and the PIQ-4
digestive-exit integration-style synthetic suite. This remains an intentionally
narrow red-flag floor; more complex and historical symptoms use the existing
owner pathway, not a guarantee of a complete medical triage system.

Migrations: none. Production/main: unchanged. PIQ preview API: still hard
locked. Owner accepted 0/9; no live QA until isolated runtime verified.
Next: full exact-SHA CI and protected-preview runtime attestation.


## 2026-10-17 — T43 cross-instance identical Ask Health request cost guard

State: **implemented on PIQ development branch, exact CI pending; not owner accepted**.
The durable SQL AI usage ledger already serializes reservations under a database
advisory transaction lock and protects the global cost ceiling, but previously
allowed simultaneous *same-hash* Ask Health questions to reserve separate Gemini
calls if budget/rate settings allowed. New same-key duplicate check runs inside
that same locked SQL decision: match request type/provider/model/fingerprint,
block reserved or uncertain attempts for 15 minutes, and completed attempts
for 60 seconds; released pre-call reservations don't block. The in-memory
test double matches SQL. A duplicate receives a distinct privacy-safe 429
`ASK_HEALTH_DUPLICATE_REQUEST`, not another provider call or hidden charge.
Different question/evidence hashes still work. This is conservative duplicate
**suppression**, not cross-instance answer sharing or an exactly-once provider
guarantee. Outside the suppression window, legitimate re-requests remain
possible and all uncertain ledger reservations stay charged against the cap.

Tests: synthetic in-memory two-gate race, completion/retry, release and
unrelated AI workflows; durable isolated PostgreSQL two-client concurrency
and status/fingerprint tests in `tests/ai-usage.test.ts`. No migrations or
database edits, paid model calls, personal owner records, production writes or
PIQ lock changes. Golden T43 stays partial until exact-SHA CI and real
multi-tab/cold-instance QA; production unchanged.


## 2026-10-17 — PIQ-4 T42 / PIQ-3 in-flight UI regression validation (CI GREEN)

State: **validated development-only**, not deployed or owner-accepted.
Depends on: T42 canonical change notifications, PIQ-3 context-mode controls.
Why: cross-tab stale-response safeguards introduced a legitimate Ask Health
`useEffect` subscription and new-chat freshness-marker reset. Existing
static test assumptions incorrectly rejected those changes, making
full-branch GitHub validation red despite their intended safety behavior.

Files: `tests/insights.test.ts`, `tests/piq3-context-mode-page.test.tsx`.
Contract: Insights must prefill Ask Health lens/range/question without a
provider request or auto-submission; only explicit form submission calls
`submit(draft)`. New chat remains disabled while pending, clears the
owner-dependent freshness marker and then resets history. Lens/mode/range/
question pending guards and T42 stale-response protections remain covered.
No source-file, runtime, clinical, data, or provider behavior was relaxed.

Evidence: test commits `a30408b4655a55c82b3acf3ed6919876c7ed8aee`
and `fe8dec4a82c75cd3ac8b0473982b9ec1cfe25acd`; the exact
`fe8dec4` branch GitHub Actions run
https://github.com/daurham/daurham-health/actions/runs/39017579374
**PASSED** npm ci, TypeScript, ESLint, Vitest (2,487 passed, 30 skipped)
and production build. Earlier `767911f` had exactly two failing
static assertions; these were reconciled with live component source rather
than disabling a guard. GitHub run only verifies synthetic/unit/code
behavior; it is not authenticated mobile owner acceptance.

Migrations: none. Provider spend: none. Production/main: untouched.
Vercel preview owner API: remains locked. QA credentials still deliberate
invalid placeholders; exact-SHA preview and real owner QA remain blocked
by credential/trusted-origin and platform deployment-quota gates.
Formal acceptance: 0/9. Golden registry: 50 specifications, not 50
live passing scenarios; independent owner acceptance remains outstanding.

Next: continue bounded quality/fixture work without paid model calls
while preserving the preview lock; later configure distinct QA-only database
and cookie credentials through the approved secret path, attest exact-SHA
preview/runtime/owner isolation, then run the owner acceptance matrix
before considering any production promotion.


## 2026-10-17 — T48 personal cache freshness on size-omitted Health Profile corrections (CI GREEN)

State: **validated on the PIQ development branch**, not deployed, owner-QA-approved or fully T48-accepted.
Depends on: PIQ-2 profile version/recheck and PIQ-3 capped evidence selection.
Why: the real `tests/piq0-retrieval-revision.test.ts` T48 scenario showed a
correction to the final named saved medication could leave the selected
size-capped evidence unchanged and hit a stale Ask Health answer cache.
The app must not imply that omitted profile details were checked.

Files: `src/domain/ask-health/types.ts`,
`src/domain/ask-health/packet.ts`, `server/ask-health/load.ts`,
`tests/piq0-retrieval-revision.test.ts`.
Contract: when a current personalized Health Profile receives a successful
existing two-read field-and-version source recheck, include the already-loaded
`updatedAt` in **private cache-key material only**. A subsequent saved
Profile edit now changes the answer fingerprint even if an affected detail
was omitted by the packet limit. A failed/missing verification, historical
as-of question, or General Only mode does not claim an attested current
profile version. No omitted clinical records or revision token are passed to
Gemini in the model prompt or included in response metadata. The revision
may increase Gemini spend *only if* the owner later manually asks again
after an actual saved Profile edit. It initiates no provider call itself.
No additional SQL, schema, write, or background job.

Evaluation: synthetic T48 adversarial fixture verifies that the capped
evidence stays byte-for-byte identical after a change to an omitted saved
medication, but the verified updated-at revision changes the private cache
fingerprint. Additional assertions deny revision use when source recheck
fails or a historical as-of is requested. This fixes the cache staleness
boundary; it does **not** solve evidence selection of all omitted clinically
relevant medications, full T48 completeness, in-flight multi-device
consistency, or live response quality.

Evidence: commit `ad11cd8ca5be7ddb25854c8214439bbfc43916ee`;
exact-SHA GitHub Actions run
https://github.com/daurham/daurham-health/actions/runs/39019021989
**PASSED** npm ci, TypeScript, ESLint, Vitest (2,487 passed,
30 skipped), and production build. This is synthetic/engineering validation,
not proof that owner-visible personalized answers work on deployed mobile.

Release: branch only; `main` and production unchanged. PIQ Preview APIs
still hard locked, QA login credentials intentionally nonfunctional,
formal owner acceptance 0/9, and production migration/schema state
unattested. No migrations, provider calls, production health-data access,
or owner-data writes performed.

Next: build an executable T48 selection-coverage test that proves the
app discloses/handles omitted relevant clinical facts without guessing
their meaning, and run an isolated credentialed preview owner test once
the already-documented security gate is deliberately unlocked.
