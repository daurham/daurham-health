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
| PIQ-1 data/decision integrity | BRANCH PREPARATION | PIQ-1.1 day-completeness pure domain and persisted owner API code validated; migration/UI/consumer wiring and owner runtime QA missing |
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
