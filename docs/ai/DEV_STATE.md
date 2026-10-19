## 2026-10-19 — PIQ-8 late job-created callback freeze (feature CI pending)

- `recordLabelJobCreated` previously preserved `status='committed'` on an
  upsert conflict, but still changed `source_filename`, `user_context` and
  `updated_at` on an owner-approved capture. That bypassed the new guards
  for the two late provider-result callbacks.
- Conditional PostgreSQL upsert now updates a conflicting capture only while
  `status <> 'committed'`; both new first-time job creation and unfinished
  retry/queue behavior are unchanged. Existing committed Label Pantry → Log
  transitions are unaffected.
- Added two real isolated PG16/18 tests covering late callback immutability
  and preapproval retry behavior, with no owner health rows.
- This is a development-only bounded patch. Full feature CI and exact merge
  SHA PG16/18/app validation are pending; no QA or production deployment,
  migrations, credentials, API unlock or phase acceptance authorized.

## 2026-10-19 — PIQ-8 late provider response after capture approval (engineering CI pending)

- Audit: both background nutrition capture update paths preserved `status='committed'` but could still overwrite `candidate_json`, `failure_message`, `interpretation` or `updated_at` when late Home-AI/Gemini responses returned *after* owner-approved Pantry or Log Meal. Approved review state must remain immutable to unsolicited provider results.
- Both `RECORD_CAPTURE_PROVIDER_STATUS_SQL` and `FINISH_CAPTURE_INTERPRETATION_SQL` now use an atomic PostgreSQL predicate `status <> 'committed'`. This is not a new privacy grant; it serializes with prior Pantry and Log Meal row-locked capture finalization. Unapproved queued/processing/completed/failed updates preserve previous behavior; approved labels may still be explicitly transitioned Pantry→Log through the dedicated commit path.
- Two new real PG16/18 checks: late completed/failed provider result plus delayed interpretation cannot mutate a Pantry winner (including timestamps), and pre-commit updates work while a committed label blocks a later provider update. No migration, owner data, model requests, QA or production write. Feature/source validation pending. PIQ owner acceptance remains 0/9.

## 2026-10-19 — critical capture source/entry first-writer atomicity (in CI)

- Independent logging of meal photo source link and Nutrition entries followed by a separate capture commit previously permitted food-log or group entries to remain after a concurrent Pantry-first approval rejected late finalization. Both Meal Photo pathways now stage reviewed snapshot rows and submit one dependent Postgres CTE statement with `FOR UPDATE` capture eligibility, fingerprint claim, one-or-many entry insert and conditional finalization, sharing the same capture lock used by existing atomic Pantry-first approval. Lost/replayed photo log claims resolve to the original canonical entry/group when present and otherwise fail closed. No-photo food-description saves follow their existing workflow.
- Corrects earlier multi-component insertion values to include explicit SQL sodium placeholder so all 20 target entry columns are aligned; any invalid entry rolls back the entire statement. Real disposable PostgreSQL 16/18 fixtures validate entry-only, competing first saves, multi-component groups and atomic constraint rollback. CI pending, no release/owner acceptance. This is a data-integrity task escalated to PIQ-1 under master-plan scope.
- No production migration, live health read/write, change to provider budgets, Preview access, owner auth, QA Neon, or main deployment.

## PIQ-8 review correction — estimated Meal Photo commit foreign key

The previously silent estimated-Meal-Photo commit passed an `entry.id` into
`nutrition_capture_jobs.food_id` (which references `nutrition_foods`), so
the FK could reject it with no user-visible error. This task makes only
`foodId` nullable in `recordLabelJobCommitted`, commits estimate captures
with `food_id=NULL`, returns committed entries when their `food_id` is NULL,
and uses null-safe comparison for immutable exact retries. Real PostgreSQL
regression verifies first commit, same retry, changed retry rejection.
No migrations. Implementation CI pending.

## 2026-10-19 — PIQ-8 Meal Photo finalization first-writer-wins (feature CI pending)

- Audit found `recordLabelJobCommitted` unconditionally overwrote an already-committed Meal Photo association, and both Meal Photo Log paths silently suppressed finalization conflicts. A late Log Meal could therefore rewrite a previously saved-to-Pantry job even after the atomic Pantry-first fix.
- Commit SQL now refuses a different existing **Meal Photo** commitment, allows an exact idempotent replay, while retaining **Nutrition Label**'s intentional Pantry-then-Log transition. Both Meal Log service paths reject an already Pantry-finalized capture before writing; later finalization conflicts are now surfaced rather than swallowed.
- Added real PG16/18 regression checks for late Log Meal vs Pantry and label transition. **Residual race:** if a Log Meal starts before a concurrent Pantry winner, its nontransactional Nutrition entry/source-link may already be written when the capture-finalization CAS rejects it; eliminating that orphan requires a larger atomic Log Meal plan. Do not claim full end-to-end first-writer-wins for entry writes.
- No production or QA Neon mutation, API 503 unlock, migration or main promotion. Feature/merged exact-SHA CI pending; formal PIQ acceptance 0/9.

## 2026-10-18 — PIQ-7 root/ref lineage review (new feature branch, CI pending)

- Static PIQ preview preflight now requires a plausible `piq/` Git ref in addition to matching configured DB/Auth expected refs. Previously, both expected variables could be erroneously set to `main` or a feature branch, letting an unapproved ref appear configuration-eligible despite a correct SHA pin. Fixed enum-only blocker, no leaked credentials.
- Both independent Neon metadata reviewers now treat **any parent branch** as non-independent QA lineage, even when the provider-reported creation source is `empty`. Previous checks explicitly refused parents equal to production but silently accepted an unrelated parent on an `empty` child. Root-only reviews are safer until an independent parent/sanitization attestation exists.
- Synthetic regression tests cover ref spoofing, unrelated parent, production parent and valid independent root. No changes to runtime API hardlock, Auth, migrations, Vercel/Neon, secrets, owner's data, GitHub `main`, or production.
- Feature app CI, development-only PR merge, exact merge SHA application and PostgreSQL 16/18 CI remain to be checked. PIQ release owner acceptance **0/9**; protected runtime binding/cookie/working QA owner and mobile QA still blocked.

## 2026-10-18 — PIQ-7 empty-branch isolation fail-closed fix IN REVIEW

- Offline PIQ Preview metadata and static preflight previously allowed an `initSource: empty` QA branch to reach `configuration_eligible_for_manual_attestation` / `metadata_consistent_not_authorized` **without proving the QA Neon project differs from production**. Distinct branch IDs are insufficient: a fresh empty branch *inside* production is not independent QA.
- Both reviewers now require a separately known production Neon **project ID**, and reject when either the expected QA project or independently reported Neon QA branch project matches production. New fixed enum blockers; no URLs, credentials or owner IDs returned. Existing guards for distinct branch, Auth, runtime API 503 lock and manual approval remain unchanged.
- Synthetic regression coverage for missing production project, same-project empty QA branch, lying expected project and normal independent-project case. No migration, Vercel/Neon change or runtime unlock.
- Source/test CI and merge into PIQ integration pending. **0/9 owner accepted**; runtime Auth/cookie/binding attestation, operator QA login, backup/recovery and owner mobile acceptance remain blocked.

## 2026-10-18 — PIQ-7 exact-SHA PostgreSQL CI coverage in review

- Development-only PR changes `.github/workflows/piq1-postgres.yml` to run isolated PostgreSQL 16/18 for **all code, API, server, client, test, migration, configuration, and dependency changes** pushed to `piq/00-baseline-20261014`. The old explicit per-file allowlist omitted `server/piq-qa-auth-census.ts`, Pantry saves, and other PIQ work; they only received application CI. PG verification remains two disposable localhost fixtures, not Neon/production. Docs-only commits deliberately do not trigger extra PG compute.
- Prevents known-fixture classification when the account record is absent: the observed independent QA fixture had exactly one user and **one account** (zero stored password credentials), not zero accounts. Still never authorizes QA login or relaxes the hard API lock.
- Adds synthetic regression and a workflow route guard verifying code coverage, 16/18 matrix, local fixture, and no production branch trigger. **CI results and merge SHA pending**; no change to Vercel/Neon settings, production `main`, migrations, release authorization or Auth credentials.
- Next after passing feature/app CI: merge only into PIQ integration, verify **both full application CI and isolated PG CI at the merge SHA**, then stop before runtime QA access, cookie/owner setup or release.

## 2026-10-18 — PIQ-7 QA Auth census merged; exact integration CI GREEN

- [PR #32](https://github.com/daurham/daurham-health/pull/32) merged to **PIQ development only**, exact merge `cbca33f9fcd3555626ae24a2a35b09de73b713eb`; [merge GitHub Actions 39204168866](https://github.com/daurham/daurham-health/actions/runs/39204168866) **SUCCESS**: 2,762 passed, 43 skipped, 369 test files passed / 4 skipped, TypeScript, ESLint and build. Feature SHA `63b1406` independently passed [39203800556](https://github.com/daurham/daurham-health/actions/runs/39203800556).
- Separate QA Neon SQL verified 1 known fictional non-deliverable Auth user, 1 account, **0 password credentials, 0 verified emails, 0 sessions, 0 accounts created before the QA root**, without selecting any private/Auth rows. Auth provider ID on independent QA root differs from candidate production Neon project's parent/cloned-preview Auth provider ID. This is not effective runtime binding proof or a usable QA login.
- New offline, counts-only `reviewPiqQaAuthCensus` explains fixed states without raw identities and always returns `ownerQaAuthorized: false`. Seven synthetic tests; existing original root-provenance zero-Auth requirement and PIQ API 503 lock unchanged. No migration, SQL write, secret read/rotation, provider model spend, production/main merge or deploy.
- Vercel branch Preview SHA pin was independently read **without decrypting protected vars**: `91f8eef5b` (older than dev merge), while latest inspected READY Preview was `044332d8`. Production `main` remains `dbc3fcb`. A READY old Preview and green application CI are insufficient for release-SHA qualification.
- **Next:** operator sets independent QA-only cookie secret and working auth, independently attests actual Preview runtime-to-QA bindings and production-vs-QA owner identity without copying health data, then exact SHA PostgreSQL CI, QA backup/recovery and mobile owner acceptance with separate approval. QA schema count reconfirmed 60. **0/9 PIQ owner accepted.** This later docs-only checkpoint carries `[skip ci]`, not new app validation.

## 2026-10-18 — PIQ-8 Pantry retry PR #31 merged; integration CI GREEN

- Actual development integration merge `7cb3d5f0f8c5906cd330461ee88bdf19c2437f0d`: [PR #31](https://github.com/daurham/daurham-health/pull/31) closed/merged into `piq/00-baseline-20261014`; production `main` unchanged at `dbc3fcb68324d75d30a96132b725456ec7e45d49` (Vercel `health.daurham.com` READY, independently inspected).
- [Exact merge CI 39201933212](https://github.com/daurham/daurham-health/actions/runs/39201933212) **SUCCESS**: 2,755 passed / 43 skipped (368 passing / 4 skipped files), TypeScript, ESLint, Vite production build. First implementation SHA `6596230` separately passed [39201396578](https://github.com/daurham/daurham-health/actions/runs/39201396578). No isolated-PostgreSQL workflow on **this** merge SHA; release gate requires an exact release SHA PG run when appropriate.
- A committed Meal Photo saved only to Pantry now checks original committed fingerprint and food identity before any new writes on a changed retry. Synthetic regression proves failed retry does not add link/food or alter original committed association; exact retry still succeeds. Scope: sequential post-commit retries; a concurrent initial approval still has a known potential race and needs a separately designed transactional boundary.
- No new migration, production data access, Gemini spend, production merge/deployment, or PIQ owner API 503 unlock. Documentation-only checkpoint commit is not another application validation.
- **Next:** PIQ-7 safe operator attestation of current isolated QA Auth user provenance (1 user, 0 sessions), runtime Vercel Preview → QA Neon and Auth binding/cookie isolation with protection kept, then restore/backups and owner mobile acceptance. QA schema 60/60 and 76 application tables empty do not clear Auth identity gate. Formal PIQ owner acceptance **0/9**. Exact production migration state and safe approved release still blocked.

## 2026-10-18 PIQ-8 Meal Photo Pantry altered retry fail-closed (PR #31)

- Engineering branch `piq/08-pantrysave-idempotency-20261018`, source/test commit `6596230f2ac807568bd1689deeba17a5fe4edeb0`; [GitHub Actions 39201396578](https://github.com/daurham/daurham-health/actions/runs/39201396578) SUCCESS: TypeScript, ESLint, production build, 2,755 Vitest tests passed / 43 skipped.
- In `saveAiReusableFood`, a capture already marked committed now verifies its originally committed food identity and fingerprint before any new Pantry link/food write. Changed or logged-entry capture retries return HTTP 409 without creating another Pantry record; exact retries reuse the original food.
- Regression: `tests/recipe-ingredients.test.ts` proves an altered retry does not increment food inserts or source links or change the original capture association. A previously existing exact-retry test remains green. Sequential-retry integrity only: concurrent first-time capture finalization can still race and may need a future atomic approach.
- [PR #31](https://github.com/daurham/daurham-health/pull/31) targets **development** branch `piq/00-baseline-20261014`; record actual merge SHA and integration CI after merge. No new migration, production merge/deployment, owner records, provider spend or 503 API unlock. PIQ owner phase acceptance remains 0/9.
- Remaining PIQ-7 QA blocker: one unverified QA Auth user (zero sessions) exists despite 76 empty non-seeded QA application tables; runtime DB/Auth binding, QA cookie isolation and protected preview login unverified. Do not remove QA API lock or assert release readiness. Next: integrate reviewed fix, then safe read-only QA Auth/isolation attestation.

## 2026-10-17 PIQ-6.3 overlap review verified, further outcome gates open

- CI 39067558828 SUCCESS for app commit 857512bd74e93cc1fbbf059a0ca877f401b46498 (2,606 passed/30 skipped, 343 files passed/2 skipped, TS, ESLint, build). No new migration; read-only Change Ledger source queries for verified linked Lab observation windows. None-recorded explicitly does not rule out unlogged confounders; unavailable fails closed.
- Critical gates remain: baseline sufficiency, outcome-level completeness/quality, corrected interventions impact on finalized results, owner evaluation feedback and calibration memory. Existing migrations 0057 and 0058 remain unapplied, do not promote to main/prod until authorized and applied. Owner phase acceptance 0/9.

## 2026-10-17 PIQ-6.3 observed timing overlap warning (CI GREEN)

- Read-only one-query aggregation for 7 existing Change Ledger-relevant sources, current date/window/verified owner Lab scope; present only aggregate counts by source-kind. Owner's own implementation excluded; retracted other experiments excluded; unavailable and missing-data categories remain explicit.
- No causal claim or automatic result, target, protocol changes. Not an outcome evaluator or complete confounder registry. Migrations 0057/0058 still unapplied, stay on PIQ branch, phase owner acceptance 0/9.

## 2026-10-17 PIQ-6.1 append-only owner correction acceptance checkpoint

- GitHub Actions `39065588376` is SUCCESS on commit `79643a999321eb5de7f7d318cf93b70d48c791b3`; TypeScript, ESLint, production build, 2,600 Vitest cases passed (30 skipped).
- Added regression tests for correction/retraction input validation, bounded reasons, effective dates, optimistic concurrent version, retracted privacy and original-record immutability, canonical Lab detail and owner-only actions.
- Release gate still open: apply BOTH 0057 and 0058 in the right database when owner authorizes promotion; never deploy branch readers until schema exists. No automatic goal/result/target updates and no claimed causal learning. Formal PIQ phase owner acceptance 0/9.

## 2026-10-17 — PIQ-6.1 owner correction/retraction journal (CI GREEN)

- Additive migration 0058 after 0057, creating append-only revision rows (action, reason, effective date/details, revision, timestamp). Stale-write guarded by unique experiment/revision. Owner-only POST endpoints and correction/retraction UX use expectedRevision from canonical Lab detail.
- Original 0057 row is immutable; latest correction wins in Lab, Coach and Ledger; retraction removes behavior-change claims but retains audit and contextual retraction status; result not automatically changed and explicit warning if correction/retraction postdated result.
- No migration was executed. 0057 AND 0058 must be applied to target DB before any deployment of this branch. No main/prod promotion; 0/9 owner phase acceptance.

## 2026-10-17 PIQ-6.1 engineering verification of explicit implementation journal

- Tested commit `141b3103cc216de36c34f896555570753a6b682d`; Actions run `39064788711` green, 2,594 tests passed / 30 skipped, TS, ESLint, build all passed. Lab-service test mock was updated to read absent/present implementation records and assert that a plain Start is not implementation.
- Migration `0057_experiment_implementations.sql` remains unexecuted. All code remains on `piq/00-baseline-20261014`. Do not merge to main or deploy until migration is approved/applied in target DB; runtime Lab and Change Ledger now query this table.
- Next PIQ-6 gaps: explicit correction/retraction of mistaken owner report, direct contextual/confounder overlap analysis, measured outcomes with provenance, final owner QA/acceptance (0/9).

## 2026-10-17 PIQ-6 explicit implementation record — CI GREEN (release gated on migration)

- Validated application/test commit `141b3103cc216de36c34f896555570753a6b682d`; [GitHub run 39064788711](https://github.com/daurham/daurham-health/actions/runs/39064788711): 2,594 pass / 30 skipped, TypeScript, ESLint and build green.
- New additive `0057_experiment_implementations.sql` NOT APPLIED. **Before production deployment, review/apply migration to target DB**. Existing Lab detail, Coach linked Lab and Change Ledger now query this table and will fail on an unmigrated DB; do not promote without migration. Explicit owner confirmation distinct from Lab Start, bounded effective date/what changed, atomic first-write-only, self-reported visibility in Change Ledger and Coach. Further correction/withdrawal/causal assessment required, not part of this checkpoint. No main merge and formal owner acceptance stays 0/9.

## 2026-10-17 PIQ-6.1 explicit implementation journal (branch only; CI GREEN)

- New migration 0057 creates `experiment_implementations` with one owner-confirmed actual-change date/description per experiment. The Start button remains status-only. Active Lab records gain a separate owner-confirmed implementation form; owner-auth POST is atomic, date-scoped and collision-safe; Change Ledger gains explicit owner-report events and Coach projects the same state as self-report. No automatic target or result writes.
- **Do not merge to main or promote without running/reviewing migration 0057 in the target DB first. Migration not executed.** No production changes. Corrections, revocations and measured outcomes remain future work; formal acceptance 0/9.

## 2026-10-17 PIQ-6.1 cautious owner result-attestation display (CI GREEN)

- Coach's read-only existing Lab result join includes only finalized protocol-following attestation and safety-stop flag, never free-text owner notes. Current status alone is not evidence of actual implementation.
- Domain projection requires result classification to agree with canonical experiment status; a mismatch or absent/invalid attestation cannot prove implementation. Self-report of `followed` remains labelled subjective and subordinate to low adherence and safety flags.
- New regression + integrated golden scenario cases cover all attestation choices, low adherence conflicts, inconsistent statuses, safety stop, no-result active periods and absence of owner notes in Coach response. GitHub run `39063057645` on app commit `716a8d20b78c988af48f482aa0065c169b98dc0e` passed TypeScript, ESLint, production build and 2,586 Vitest cases (30 skipped). No migration, model spend or production promotion; phase acceptance 0/9.

## 2026-10-17 PIQ-5.7 six integrated golden scenarios — CI GREEN

- `tests/piq5-integrated-golden-scenarios.test.tsx` validates completed Training, poor food-log coverage and blocked calorie changes, legitimate quiet Coach behavior, accepted-but-unstarted Lab, active-but-unevaluated Lab, and low-adherence/historical result framing using synthetic fixtures.
- CI on app/test commit `e53ba12acac96e6a2b09fc5a6eaa19bbddc5b299`, GitHub Actions run `39061903631`: 2,582 passing tests, 30 skipped; TypeScript, ESLint and build green.
- PIQ-5.7 remains broader than these six scenarios, and PIQ-6 still needs owner-verifiable implementation/adherence/outcome controls. No production promotion, migration, provider spend or formal owner phase acceptance (0/9).

## 2026-10-17 Verified Coach-linked Lab lifecycle checkpoint

Branch code commit `d4f715ad01c43b5c75ef92e3db72398d0516dea9` passed GitHub Actions 39061473074: 2,576 tests passing, 30 skipped; TypeScript, ESLint and build green. Canonical Lab state is a read-only owner-created experiment projection, not an adopted intervention or causal outcome. Continue PIQ-5.7 integrated scenarios and PIQ-6 actual implementation/evaluation; owner QA and rollout gates remain closed. Owner phase acceptance 0/9.

## 2026-10-17 PIQ-5.5 linked Lab lifecycle projection — engineering, CI pending

- Added read-only canonical lifecycle `src/domain/coach-lab-lifecycle.ts` for owner-created linked experiments. Coach shows accepted/scheduled/active/completed/inconclusive/archived with truthful observational limits, a verified result link only when present, and observation windows. Does not assume actual behavior, adherence, improvement or causation.
- Missing/unreachable/invalid Lab links retain saved provenance and an unknown-state cue in Coach; no false fresh handoff or owner-start prompt. Archived linked records remain historical rather than being treated as unlinked.
- Tests in `tests/piq5-coach-experiment-link.test.tsx`. Branch `piq/00-baseline-20261014`, no new migrations, owner data access, production deployment or AI provider cost. PIQ-6 actual verified intervention-to-result closed loop and owner mobile QA remain to be done; 0/9 owner-accepted phases.

## 2026-10-17 PIQ-5.5 owner-selected canonical Lab association — development only

- Branch `piq/00-baseline-20261014` now carries a separate Coach-to-Lab handoff and owner-confirmed link endpoint. An owner may save a new Personal Lab experiment and explicitly link that canonical record to the originating non-calorie Coach recommendation.
- SQL conditional write validates current recommendation eligibility/context, exact response version, actual owner-created accepted/scheduled/active Lab record, and no prior response or link. Link ID persists as recommendation metadata; Coach only displays extant non-abandoned/superseded Lab links.
- This **does not** start the experiment or prove implementation, improvement, safety, or adherence. Existing seven-day follow-up is still reserved for separately acknowledged `I started this`; no auto-target changes, schema changes, AI costs, owner PHI read, or production deployment.
- New regression tests: `tests/piq5-coach-experiment-link.test.tsx` and route assertion. The exact code commit `de60760d7f5717abbc277fb2a5f6026616e236b4` passed branch CI run `39058896137`: TypeScript, lint, 2,571 Vitest cases passed (30 skipped), production build. Real owner mobile acceptance remains pending. Continue PIQ-5.5 verified implementation state and PIQ-5.7 golden scenarios after validations. The source-of-truth task ledger is `docs/ai/PIQ_PROGRESS.md`, not the older I0–I10 CURRENT_TASK stub. Owner phase acceptance remains 0/9.

## 2026-10-17 PIQ-5.5 owner feedback reasons — branch only

- Added optional Coach recommendation dismissal reasons: `Already knew`, `Wrong context`, and `Not practical`, nested in collapsed "Other feedback" disclosure; existing `Not relevant` remains.
- All map to the existing `not_relevant` suppression response, but persist a strictly validated `feedbackReason` enum within the existing recommendation metadata JSON. Repeated reads/upserts preserve this reason; a future different response clears it. No schema migration or AI calls.
- Reason handling is isolated from safety/eligibility ranking: owner feedback cannot relax a hard medical or evidence gate, start an action or create follow-ups. Work remains development-only and needs CI and actual owner/mobile QA. Earlier note about the seven-day owner-start and 21-day follow-up grace still applies.

## 2026-10-15 PIQ-1.4 saved workout edit/delete freshness — branch only

- Program authority: `docs/ai/HEALTH_INTELLIGENCE_QUALITY_MASTER_PLAN.md`; detailed phase evidence and remaining gates: `docs/ai/PIQ_PROGRESS.md`.
- PIQ branch `piq/00-baseline-20261014` has server-issued saved-session `editRevision` and transactionally version-guarded workout PATCH and DELETE, with old-token HTTP 409 and missing-token HTTP 428.
- Workout Details preserve unsaved edit drafts on detected background changes, disallow an automatic overwrite, and require explicit owner reload. Destructive Delete confirmation now binds its authorization to the originally reviewed saved version and cannot silently upgrade after background revalidation.
- Previous server DELETE commit `c5b440c` passed full CI 38782039599 and isolated PostgreSQL CI 38782039764. The combined confirmation-snapshot and profile/evidence-quality invalidation code passed full CI 38784304136 after updating one legacy copy test. No authenticated iOS/Safari or two-device end-to-end test is claimed.
- Mounted Nutrition now refreshes its atomic day on canonical data changes/focus, evicts prefetched adjacent days, and keeps open forms. Body refreshes sessions/cadences/inbox with latest-request guards, keeps open forms, and shows last-known-data errors. This Nutrition/Body slice passed GitHub Actions branch run 38784733886 (TypeScript, ESLint, tests, build).
- Additional PIQ-1.4 freshness coverage: successful PUT Health Profile, POST Data Quality review, and PUT Nutrition day completeness now trigger the existing privacy-safe canonical-change event so mounted Today/Goal Control/Coach/Weekly Coach consumers refetch. Failures and read-only requests do not signal completion. Browser/mobile owner acceptance is still pending.
- A later bounded follow-up addresses Body's stale network error race and allows mounted Data Quality review to revalidate on mutation/focus, keep late reads from replacing owner-confirmed review states, and disable review actions until a failed refresh succeeds. That follow-up awaits its own branch validation.
- Schema has **no new migration** for saved-workout CAS; production applied migrations (including repository 0053) remain unknown. No clinical data, owner workouts, Gemini provider usage or production deployment were changed.
- No PIQ phase has met all acceptance gates (0/9 accepted). Before release: branch validation for the confirmation snapshot, owner/browser concurrent-edit/delete testing, production schema read-only reconciliation and explicit owner rollout approval. Do **not** promote `main` based on isolated tests.

## 2026-10-06 I0–I10 integrated validation complete — rollout gated on database access

- The dormant I0–I10 stack was exposed once on `validate-i0-i10` after the Vercel deployment-rate limit cleared.
- Last fully validated application commit is `eac16edaa595929b51ec942e402acbd2c7378ee1`.
- GitHub Actions run `37579440908` passed TypeScript, ESLint, all 1,479 Vitest tests, and the production build.
- The corresponding Vercel preview deployment completed successfully.
- Integrated validation fixed cross-phase contract drift plus two real behavior gaps: Training substitution classification no longer labels same-movement/incompatible-equipment exercises as merely similar-muscle substitutes, and Weekly Coach deep-review safety catches plural target-change wording such as “decrease calories.”
- Repository schema head remains `0049_passive_recovery_clinical_context.sql`.
- Production database migration state is still unverified and unchanged.
- A temporary read-only Actions probe could not run `npm run instance:check` because the repository has no `DATABASE_URL` secret. The probe made no database connection and executed no migration.
- Connected Neon tooling is unscoped and requires the existing Health project's non-secret project ID before it can inspect the default branch; Vercel environment metadata is currently inaccessible through the connected team scope.
- The temporary readiness workflow is removed from the validation branch after recording the result.
- `main` remains untouched. Next gate: read-only production instance check, test/apply pending migrations through 0049 with explicit approval, owner mobile QA, then promotion.

# Dev state

## 2026-10-06 I10 prepared — Passive Recovery + Clinical Context Expansion

- I10 is prepared as a dormant batch on top of I9; no branch ref is moved while the Vercel deployment-rate window remains active.
- Schema head advances to `0049_passive_recovery_clinical_context.sql`.
- Canonical completed-day resting heart rate now participates in the shared intelligence frame with coverage, confidence, personal baseline, historical-as-of handling, and question/lens routing.
- No readiness/recovery score is added.
- Health Profile now stores structured owner-entered conditions, allergies, and medications and exposes them to Ask Health as user-authored evidence only for the current Health date. Historical `asOf` requests omit the current profile until clinical history is date-versioned.
- Ask Health still forbids starting/stopping/changing medication or supplement doses and treats owner-entered profile text as data rather than instructions.
- Full/portable backup inventory includes the new clinical profile JSON fields using the existing serialized-JSON backup representation.
- The existing sleep-vital registry remains fully disabled because HAE HRV/respiratory/SpO2/wrist-temperature payload semantics have not been validated in production.
- Heart-rate recovery/cardio-fitness observations, clinical lab results, and standardized progress photos are intentionally deferred until a trustworthy source/workflow exists.
- A dormant Ask Health prompt syntax defect (two missing separators) was fixed during the compatibility sweep.
- Focused I10 tests are staged. Full stack validation remains deferred until the dormant I0–I10 stack is exposed once.
- I10 completes the numbered intelligence roadmap; the next operation is integrated validation and rollout.

## 2026-10-06 I9 prepared — Coach Intelligence / Next Best Actions + Deep Health Review

- I9 is prepared as a dormant batch on top of I8; no branch ref is moved while the Vercel deployment-rate window remains active.
- Schema head advances to `0048_coach_intelligence_recommendations.sql`.
- Added durable, portable Coach recommendation memory and owner response/outcome state.
- Next Best Actions are derived from the existing Goal Control, observed-maintenance, Training progression, and evidence-limitation engines rather than a new score.
- Coach emits at most three actions; planned rest remains rest and a deterministic maintain state emits no invented action.
- `not_now` suppresses a recommendation for one week; `not_relevant` and Personal Lab handoffs prevent repetitive resurfacing.
- Accepted recommendations can be followed up with owner-observed outcomes without pretending that the outcome proves causality.
- Adaptive follow-up questions are limited to one per three-day window and are only eligible when Goal Control is evidence-limited.
- The existing Coach card loads intelligence separately from missions to avoid making the established `/api/coach` workflow heavier.
- Weekly Coach prompt v3 adds a cautious deeper review using the structured evidence + deterministic intelligence packet, with competing explanations and “what would improve this conclusion?” guidance.
- Weekly AI remains wording/synthesis only: no hidden target mutation, diagnosis, medication/supplement prescription, or override of deterministic no-change/rest state.
- Post-I10 integration audit makes Personal Lab handoff server-owned: model-authored experiment ideas are ignored. Deterministic Coach logic may offer a handoff, which opens New Experiment with only title/rationale prefilled; the owner must still write/review the question and protocol before saving.
- Backup inventory includes `coach_recommendations` as portable owner data.
- Focused I9 tests are staged; full stack validation remains deferred until the dormant stack is exposed once.
- I10 is next: Passive Recovery + Clinical Context Expansion.

## 2026-10-06 I8 prepared — Training Progression / Preservation Goals

- I8 is prepared as a dormant batch on top of dormant I7; no branch ref is moved while the Vercel deployment-rate window remains active.
- No migration is added; schema head remains `0047_maintenance_calibration_experiment_origin.sql`.
- Added `training-progression-v1` with exact-exercise progression/stall/decline/confounded states.
- RIR, RPE, and failure evidence contribute to hard-set/proximity interpretation when explicitly logged; missing effort evidence remains missing.
- Lower recent performance is treated as confounded rather than a true decline when recent effort is materially harder or the session carries a recovery/limitation tag.
- Bodyweight-relative loaded strength is descriptive context and never rewrites the exact strength series.
- Movement and muscle exposure are derived from recent canonical Training working sets.
- Exercise substitution distinguishes same exercise, comparable substitute, and similar muscle group; substitutes never merge historical strength series.
- Active exercise-linked Goals receive preservation context. Comparable substitutes can preserve movement exposure but do not satisfy exact-exercise progression.
- Goal Control can use a strong Training progression concern only when higher-priority weekly/maintenance evidence does not already own the decision.
- Added owner-only `GET /api/intelligence/training-progression`.
- Focused I8 deterministic tests are staged. Full validation remains deferred until the dormant stack is exposed to one branch.
- I9 is next: Coach Intelligence / Next Best Actions + Deep Health Review.

## 2026-10-06 I7 prepared — Observed Maintenance + Plateau Engine

- I7 is prepared as a dormant batch on top of dormant I6; no branch ref is moved while the Vercel rolling deployment limit remains active.
- Schema head advances to `0047_maintenance_calibration_experiment_origin.sql`; the migration only permits `maintenance_calibration` as an owner-reviewed Experiment provenance trigger.
- Added `maintenance-engine-v1`, using reliable calorie evidence plus a robust Theil–Sen body-weight trend to estimate observed maintenance from 28/21/14-day completed windows.
- The estimate is explicitly an approximate energy-balance observation, not BMR/TDEE measurement, and implausible values are withheld.
- Nutrition-quality and body-comparability floors gate the estimate and its confidence.
- Added `nutrition.carbs_g` to the shared I5 evidence frame so carbohydrate context uses the same provenance/quality semantics as calories, protein, fiber, and sodium.
- Plateau classification distinguishes insufficient evidence, stability, goal-direction movement, movement away from goal, noise-obscured, possible plateau, and likely plateau.
- Sodium, carbohydrate, logged-water, bowel, and Daily Context timing can explain why a short scale window is noisy without assigning causality.
- Candidate interventions remain review-only; no Nutrition target, Goal, or Training Plan is mutated.
- I7 feeds I6 Goal Control rather than creating a competing decision surface. Today and Weekly Coach show compact weight-response context inside their existing decision cards.
- Personal Lab can now surface an owner-reviewed 14-day Weight-response calibration suggestion when meaningful uncertainty remains. Existing stale-candidate fingerprint protection and duplicate open-Experiment suppression are reused.
- Added owner-only `GET /api/intelligence/maintenance`.
- Focused I7 domain, routing, Lab, compatibility, and schema-head tests are staged. Full TypeScript/lint/test/build validation remains deferred until the dormant stack is exposed to one branch.
- I8 is next: Training Progression / Preservation Goals.


## 2026-10-06 I6 prepared — Goal Control / Weekly Decision Engine

- I6 is prepared as a dormant batch on top of dormant I5; no branch ref is moved while the Vercel deployment-rate window remains active.
- No schema migration is added; schema head remains `0046_evidence_semantics_change_watchdog.sql`.
- Added `goal-control-v1`, a deterministic authority above Weekly Coach evidence/candidates and I5 shared intelligence.
- Decision states are `act`, `maintain`, and `insufficient_evidence`; `maintain` carries an explicit no-change recommendation instead of manufacturing an action.
- Goal Control uses the last seven completed days for weekly evidence, the Training Plan effective at `asOf`, and I5 30-day coverage/confidence/relationship context.
- Added a Nutrition evidence-quality floor: four logged and four sufficiently reliable completed days before intake evidence is considered decision-ready.
- Training adherence is plan-aware. Planned rest/active-recovery/flexible/moved-away/away days are not missed workouts when enough planned days remain.
- Goal-driven daily Training quests are suppressed on configured non-Training days; if the day's plan changes after creation, an active quest expires without XP.
- New gamified weekly goal missions are limited to genuine goal-attention states instead of every active goal.
- Today gains a separate compact Goal overview resource/card; `/api/today` is not expanded with another heavy evidence load.
- Weekly Coach responses include the same Goal Control decision and suppress the older independent Focus section; AI intro/focus wording is hidden when deterministic Goal Control is present.
- Added owner-only `GET /api/intelligence/goal-control`.
- Focused I6 domain, routing/source-contract, UI, and Weekly Coach compatibility tests are staged. Full TypeScript/lint/test/build validation remains deferred until the dormant stack is exposed to one branch.
- I7 remains responsible for observed maintenance, plateau classification, and candidate intake interventions.


## 2026-10-06 I5 prepared — shared Health Intelligence + Ask Health context

- I5 is prepared as a dormant batch on top of dormant I4; no branch ref is moved while the Vercel deployment-rate window remains active.
- No schema migration is added; schema head remains `0046_evidence_semantics_change_watchdog.sql`.
- Added `health-intelligence-v1`: a typed signal registry and sparse Health-date evidence frame spanning Activity, Sleep, Nutrition, Training, Body, hydration, bowel tracking, and subjective wellness.
- Missing owner-tracked signals remain missing. Completed-day Training frequency is the one safe absence-to-zero semantic; current-day complete metrics remain provisional.
- I4 `excluded_from_analysis` reviews are applied at the shared-loader boundary before baselines or relationships are calculated. Canonical rows remain untouched.
- Snapshot coverage carries observed/eligible days, exclusion counts, provenance, and descriptive confidence rather than a universal quality/readiness score.
- Added recent personal baselines, curated same-day and one-day-lag relationships, and bounded Change Ledger before/after comparisons with explicit non-causal wording.
- Added question/lens-specific evidence routing and evidence-date/detail-path drill-down metadata.
- Ask Health now uses `ask-health-evidence-v2` / `ask-health-v4` and consumes the shared snapshot for Daily Signals, relationships, confidence, exclusions, and change context.
- Ask Health adds a compact What Health knows / Missing context that matters disclosure.
- Progress Timeline now receives one day-level Daily check-in event instead of per-event Daily Signal noise.
- Added owner-only `GET /api/intelligence/snapshot`.
- Focused deterministic I5 tests are staged; full TypeScript/lint/test/build validation remains deferred until the dormant stack is exposed to one branch.
- I6 is the planned point to migrate consequential Today/Coach goal-control decisions onto the shared evidence layer.


## 2026-10-06 I4 prepared — evidence semantics, effort, Change Ledger + data-quality watchdog

- I4 is prepared as a dormant batch on top of dormant I3; no branch ref is moved while the Vercel deployment-rate window remains active.
- Proposed schema head is `0046_evidence_semantics_change_watchdog.sql`.
- Training keeps existing session effort/pain and adds optional set RIR/RPE, explicit whole-set or per-side failure evidence, exercise side-tracking semantics, and optional session limitation context.
- Historical Training is not rewritten. Independent-side semantics improve new logging while old shared-rep sets remain valid.
- Nutrition entries gain coarse provenance/evidence quality and Nutrition-day responses derive a calorie-weighted quality label. The label describes evidence, not dietary healthfulness.
- Manual Body sessions gain comparability state and Health Profile gains an optional usual-measurement protocol.
- Event/effective time continues to use existing domain timestamps/dates; `created_at` remains storage/entry time rather than a duplicate observation timestamp.
- Progress Timeline gains an owner-only derived Change Ledger from existing target/plan/goal/supplement/experiment/context histories.
- Initial automatic behavior candidates cover steps, Training frequency, and logged water. Candidates require owner confirmation/dismissal and never rewrite canonical intent.
- Settings gains a deterministic Data Quality review inbox for unusual values, duplicate-like Nutrition entries, future timestamps, incomplete independent-side sets, possible incomplete Nutrition days, and Body source changes.
- Data-quality review decisions are durable annotations: confirmed valid or excluded from future intelligence. They do not mutate/delete the source record.
- Backup/export includes all I4 durable semantics plus Change candidate and Data Quality review state.
- I5, not I4, will make the shared evidence frame honor exclusions and use quality/change context for cross-domain intelligence.
- Focused I4 domain, routing, migration-contract, and backup tests are staged. Full TypeScript/lint/test/build validation remains deferred until this dormant commit is exposed to one branch.


## 2026-10-06 I3 prepared — XP participation expansion + theme runway

- I3 is prepared as a dormant batch on top of dormant I2; no branch ref is moved while the Vercel deployment-rate window remains active.
- Proposed schema head is `0045_xp_participation_themes.sql`.
- Wallet presentation moves to `xp-rule-v2` while existing Coach awards remain frozen under `xp-rule-v1`.
- Added `xp-participation-v1` daily participation awards: water 10 XP, bowel tracking 10 XP, daily wellness 20 XP, and fully recorded supplement day 25 XP.
- Participation is capped structurally at one award per domain/Health date (65 XP/day maximum) through immutable idempotency keys.
- Today and yesterday are eligible for participation XP; older backlog remains valid Health history but does not mint currency.
- Supplement completion rewards recording the full scheduled day, including honest skips; it does not reward ingestion or penalize skips.
- Health corrections do not claw back historical XP.
- Migration 0045 broadens the existing append-only ledger to `daily_participation`; it must be applied before I3 server code is exposed.
- Rewards explains the participation values, anti-farming behavior, backlog rule, and the owner convention that 100 XP = $1.
- Progression thresholds remain unchanged. Eight theme packs extend the runway from Level 12 through Level 20, ending with Cosmic Instinct at 10,450 lifetime XP.
- Participation-only maximum is about 1,950 XP per 30-day month; Coach/challenge completion remains the main path toward the intended $30–$50/month reward budget.
- Added wallet/database, backup, progression, theme, and source-contract regression coverage.
- Full TypeScript/lint/test/build validation remains deferred until this dormant commit is exposed to one branch.

## 2026-10-06 I2 prepared — Daily Signals foundation + Today check-in

- I2 raw-signal work is prepared on top of dormant I1 without moving a feature branch ref during the Vercel deployment-rate window.
- Proposed schema head is `0044_daily_signals.sql`.
- Added canonical water events in milliliters with Health-date semantics and optional observed timestamps; date-only backlog does not invent event times.
- Added canonical bowel events with Bristol type 1–7 plus an explicit no-BM day state. Missing bowel evidence remains unknown.
- Added one-per-day subjective wellness rows for energy, hunger, soreness, and optional stress.
- Added a consolidated Today Daily Check-in after Training and before Supplements; it absorbs the old standalone Today Context presentation while preserving Daily Context as its own authority.
- Added quick water logging plus a dedicated `/check-in` backlog/detail route for water, bowel, wellness, and contextual navigation.
- New Daily Signals mutations use the existing Health-data-change invalidation path so Today refreshes after successful owner writes.
- Added canonical portable backup inventory for all four new tables.
- XP, correlations, readiness scoring, Timeline signal lanes, and Ask Health signal packets are intentionally not part of this first batch. Timeline/Ask Health signal integration moves to the shared-intelligence I5 work.
- Full TypeScript/lint/test/build validation remains deferred until this dormant commit is exposed to one branch.

## 2026-10-06 I1 prepared — Health Profile + Flexible Training Intent

- I1 is prepared as one dormant batched Git commit on top of current `main`; no feature-branch ref has been moved while the Vercel deployment-rate window remains active.
- Proposed schema head is `0043_health_profile_training_plan.sql`.
- Added canonical singleton Health Profile: DOB, height, bounded persistent health context, Training limitations, and dietary context.
- Age remains derived as-of a Health calendar date; biological sex is intentionally not collected because I1 has no supported calculation that requires it.
- Added versioned Training Plan baseline with weekly target, ordered routine-code sequence, preferred weekdays, default non-training intent, and optional note.
- Added current-week dated overrides including explicit paired move semantics. Daily Context `rest_day` remains retrospective and is not schedule authority.
- Sequence advancement replays canonical programmed sessions; an out-of-order programmed workout cannot silently skip the currently expected routine.
- Training page gets a compact Plan summary and direct start of the next planned session when appropriate. Training → Plan owns baseline editing and current-week adjustments.
- Health Profile is the first substantive Settings card.
- Profile and plan tables are added to full and portable backups.
- `docs/SINGLE_OWNER_DEPLOYMENT.md` now includes Health Profile and Training Plan first-use setup.
- Domain, migration, and backup regression coverage is included in the prepared commit.
- Full TypeScript/lint/test/build validation remains intentionally deferred until the dormant commit is published to one branch.

## 2026-10-06 I0C complete — fresh-instance bootstrap + seed separation

- Proposed schema head is now `0042_instance_seed_scope.sql`.
- The original A/B/C 1.3.1 routine family is tagged `legacy_owner`; Beginner Calisthenics is tagged `product_builtin`.
- Fresh databases deactivate the legacy A/B/C family when no canonical Training history references it.
- Established databases preserve that legacy family when historical Training references it by routine snapshot or template identity.
- Historical templates/sessions are never deleted or rewritten.
- Owner-created routines remain unchanged.
- Added `npm run instance:check` for migration/bootstrap diagnostics.
- Added `docs/SINGLE_OWNER_DEPLOYMENT.md` covering a second private one-owner deployment.
- Replaced stale phase-specific validation workflows with one generic non-main branch validation workflow.
- Validation run `37545271735` passed TypeScript, ESLint, the full Vitest suite, and production build.
- No Health data was copied between owners; separate deployment/database/auth remains the portability model.
- Next planning slice: I1 Health Profile + Flexible Training Intent.

## 2026-10-06 I0C prepared — fresh-instance bootstrap

- I0C is prepared as a single batched Git commit object on top of current `main`; its branch ref is intentionally not published while Vercel's rolling deployment limit is active.
- Proposed schema head is `0042_instance_seed_scope.sql`.
- The migration classifies original A/B/C 1.3.1 as `legacy_owner` seeds and Beginner Calisthenics as a `product_builtin`.
- A fresh database deactivates the original A/B/C family automatically.
- An established database preserves the A/B/C family when historical Training references it.
- No templates or historical sessions are deleted.
- Added a read-only `npm run instance:check` diagnostic contract.
- Added `docs/SINGLE_OWNER_DEPLOYMENT.md` for a second-owner installation.
- Full validation is intentionally deferred until the dormant commit is exposed to a branch after the Vercel rate window clears.

## 2026-10-06 I0B complete — dynamic instance identity + canonical timezone

- Completed deployment-level timezone portability without adding a schema migration; schema head remains `0041_exercise_library_calisthenics.sql`.
- `HEALTH_CALENDAR_TIMEZONE` is now the runtime calendar authority across owner-facing server flows. Shared domain helpers retain `America/Phoenix` only as the backward-compatible default and receive explicit timezone context in live paths.
- Today, Activity, Sleep, Progress, Goals, Coach, Weekly Coach, Lab evidence, intelligence/Ask Health inputs, Nutrition, Training defaults, Body capture, backup metadata, and Apple/Health Auto Export runtime paths were wired to instance time.
- Historical Apple compact reconciliation now accepts an arbitrary IANA timezone and splits cross-midnight samples at DST-aware Health-calendar boundaries.
- Added DST regression coverage using `America/New_York`, including spring-forward/fall-back midnight behavior and Body local-time editing offsets.
- App chrome now consumes the I0A public instance config for app name, external home link, public-demo capability, and calendar timezone. Date-sensitive owner routes wait for config before mounting to avoid a first-render Phoenix fallback race.
- Current deployment defaults remain `Daurham Health`, `https://daurham.com`, and `America/Phoenix`; another deployment can override them without source edits.
- Demo exposure is capability-driven and fails closed when disabled.
- Body Shortcut documentation is deployment-neutral and Open Food Facts fallback branding is neutral.
- Backups record the instance calendar timezone rather than a universal Phoenix value.
- Stored historical timezone/provenance rows were not rewritten.
- Independent validation run `37541015943` passed TypeScript, ESLint, all Vitest tests, and production build.
- Remaining portability work is intentionally separated into the next candidate slice: fresh-instance bootstrap and Jake-specific legacy seed/routine separation. Historical diagnostic/backfill scripts may retain legacy Phoenix defaults when they are explicitly reproducing old-owner data; they are not runtime calendar authorities.

## 2026-10-06 I0A complete — instance configuration foundation

- Added the master program at `docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`.
- Added a typed server-side instance configuration and safe public capability payload through `GET /api/health`.
- Optional capabilities now include Gemini, USDA, Home-AI, training photo import, Apple Health sync, Body Shortcut, and public demo state.
- Training photo import is capability-driven: without Home-AI/feature enablement, Training hides photo import and does not poll transcription jobs.
- Today → Training → **Log workout** now routes to `/training/new`; photo import is no longer the primary logging path.
- Added `npm run config:check` for non-secret deployment diagnostics.
- Updated `.env.example` and `PROJECT.md` with the portable instance configuration contract.
- Recorded the one-owner-per-deployment portability decision.
- No schema migration was added; repository schema head remains `0041_exercise_library_calisthenics.sql`.
- Validation run `37535917165` passed TypeScript, ESLint, the full Vitest suite, and production build.
- Next planned slice: I0B dynamic canonical timezone + instance identity/origin wiring.

## 2026-10-06 next-intelligence program start

- Current `main` includes the H5 Pantry/Exercise Library work and later maintenance fixes.
- Repository schema head is `0041_exercise_library_calisthenics.sql`.
- The prior H5 owner-QA wording in `CURRENT_TASK.md` was stale relative to current `main`; I0A replaces it as the active task.
- The master next-intelligence/portability program is checked in at `docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`.
- I0A establishes one-owner-per-deployment instance configuration and safe capability discovery before later Health Profile/intelligence phases.
- No I0A schema migration is planned.

## 2026-10-05 maintenance

- General Ask Health cross-domain synthesis was hardened for questions combining body, nutrition, and training evidence.
- Ask Health now uses a smaller structured-output contract, retries JSON mode if Gemini rejects the schema, and tolerates harmless response-shape differences without accepting fabricated evidence refs.
- Personal claims stay evidence-grounded, while established general health/physiology context can be used as clearly qualified possibilities.
- Ask Health prompt version is `ask-health-v3`.
- No migration or environment-variable change is required.
- Recipe edits can now save a new current version when linked ingredient nutrition (including fiber/sodium) has changed; immutable prior versions remain intact.
- Recipe update review now surfaces fiber/sodium completion and uses owner-facing “update” language instead of treating version creation as the primary action.

Snapshot recorded 2026-09-30 after **V2-H4 — Experience System**.

## Current product state

The app now includes the H1–H3 functional foundation plus the H4 presentation/progression system.

High-frequency experience:

- Today is Nutrition-first.
- Coach is compact and progressively disclosed.
- Daily Quest is not displaced by Stretch.
- XP is globally visible and visually distinct.
- Rewards separates Spendable XP from Lifetime progression.
- Theme Studio controls full visual packs independently from System/Light/Dark.
- Lifetime XP drives Levels/theme unlocks.
- Progress signals can express toward/away/neutral and conservative motivating defaults without replacing the underlying finding detail.
- Reduced-motion remains authoritative.

## Schema

Repository migration head:

`0040_goal_training_units_fix.sql`

0040 repairs the Training Goal unit constraint introduced by H2D application behavior.

## Important H4 runtime fixes

- local Nutrition date query handling now matches production;
- local `.env.local` values can override `.env` defaults;
- Coach loading reserves final compact geometry;
- mobile Nutrition Add Food CTA is viewport-bounded;
- owner-facing standalone dates use readable month/day/year presentation;
- Progress motivating signals preserve the specific finding text.

## Validation

Final H4 branch commit:

`0d7c3d297b304b23fc88af87ac14736c5592399a`

GitHub Actions run `36787289740`:

- 145 test files passed
- 1,315 tests passed
- 1 skipped
- TypeScript passed
- ESLint passed
- production build passed

## Next accepted work

V2-H5 — Pantry + Exercise Library + Flexible Programmed Workouts.

The staged contract is in `docs/ai/H5_DRAFT.md` until promoted into `CURRENT_TASK.md`.


## 2026-10-15 PIQ-1.5 started vs reviewed guard (work branch)

Read-only review of Coach advice and Lab experiment preview no longer create saved acceptance or seven-day follow-ups. Actionable recommendations expose a separately labeled "I started this" acknowledgement; evidence-only proposals cannot be started. Added server-side 409 guard for legacy/direct evidence-only `do_this` requests. No schema, provider, data or production changes; full CI / owner QA status is recorded in `PIQ_PROGRESS.md`. Branch `piq/00-baseline-20261014` remains isolated from `main`.


## 2026-10-15 PIQ-1.5 explicit started provenance — branch only

Owner "I started this" now sends `ownerStarted: true`, which is stored in existing Coach recommendation JSONB metadata. Old review-only `do_this` responses cannot trigger new follow-ups or outcomes, and older clients without the marker cannot create more. No schema/production/provider changes. Review-only navigation passed CI 38787118162; provenance commit `ca1d6e7` still has separate CI and mobile/browser acceptance gates. Continue from `docs/ai/PIQ_PROGRESS.md`.


## 2026-10-15 PIQ-1.5 legacy suppression requalification — branch only

Read-only Coach memory now requires stored `ownerStarted` provenance to suppress via `do_this`, while old `turn_into_experiment` previews no longer suppress and direct legacy conversion writes are rejected. Current safety, quality and recommendation revision gates still apply before resurfacing. Explicit not-now/not-relevant remain intact. No migration, legacy data repair, owner data changes or main promotion. CI and owner QA status tracked in PIQ_PROGRESS.


## 2026-10-15 PIQ-1.5 response-version CAS — branch only

Coach response mutation now requires the server-rendered `expectedResponseAt` and atomically compares it to the saved PostgreSQL response timestamp before updating. Stale or missing client versions fail closed. Coach resurfacing preserves confirmed owner-started provenance for non-calorie advice. Added isolated regression and real-disposable-PostgreSQL tests. No migrations or production promotion; CI and owner QA in `PIQ_PROGRESS.md`.


## 2026-10-15 PIQ-1.5 outcome concurrency guard — work branch

Coach follow-ups now carry the original exact SQL response revision. Recording an outcome requires that revision, an explicitly owner-started recommendation, an elapsed review date, and no prior outcome in one conditional PostgreSQL UPDATE. Conflicts show a refreshed Coach state. No schema, provider or production changes. Automated and mobile acceptance gates tracked in `docs/ai/PIQ_PROGRESS.md`.


## 2026-10-15 PIQ-1.5 plateau option grouping — work branch

Intake and activity adjustments now share the named `possible_plateau_response` decision group. A same-revision, owner-started, unevaluated option prevents competing cards from surfacing and blocks sequential conflicting starts in the response SQL. Older revisions and legacy Review clicks do not count. Tests include disposable PostgreSQL rollback. Remaining strict concurrency, device and Neon validation gates: `docs/ai/PIQ_PROGRESS.md`. No promotion or migration.


## 2026-10-15 PIQ-1.5 database-backed plateau exclusivity — work branch

Prepared migration `0054_coach_plateau_active_unique.sql`, schema inventory and isolated migration-chain update. A partial unique index guarantees distinct concurrent activity/intake starts cannot share one active plateau revision; one writer is rejected and Coach receives HTTP 409. Two-connection disposable PostgreSQL regression and precise error mapping tests added. No production migration or `main` merge. Release prerequisites documented in `PIQ_PROGRESS.md`.


## 2026-10-15 PIQ-1.5 non-calorie stale advice and historical follow-ups

Added a live saved-ID kind+fingerprint guard on non-calorie recommendation response writes and a historical-state marker on due non-calorie follow-ups whose original recommendation no longer qualifies today. Historical results stay reportable, not implicitly recommended or overwritten. Tests, build and owner QA remain release gates; no production mutation.


## 2026-10-15 PIQ-1.5 non-calorie context tokens — branch only

Non-calorie Coach cards now include `contextRevision`, a domain-bounded SHA-256 of the displayed advice plus current derived Goal Control evidence/date. The client carries it on response; the server recomputes current evidence and returns 428/409 on missing/stale tokens before accepting owner decisions. Numerical calorie decisions retain their existing safety and revision contract. No schema changes or production writes. Tests and limits: `docs/ai/PIQ_PROGRESS.md`.


## 2026-10-15 PIQ-1.6 scoped-confidence presentation — work branch

Goal overview confidence now explicitly describes cross-domain goal evidence; observed maintenance estimates display their independent estimate confidence, range, and an expandable evidence basis. Maintenance-backed Coach drafts use estimator confidence instead of Goal Control summary confidence; unrelated Training advice is unchanged. Synthetic tests verify disagreement, insufficient numeric evidence and distinct decision safety labels. No `main` or production changes; CI and mobile review remain release gates in `docs/ai/PIQ_PROGRESS.md`.


## 2026-10-15 PIQ-1.6 exercise-specific Training confidence — branch only

Coach now attributes Training progression confidence to the exact matching exercise-series assessment, rather than the Goal Overview's cross-domain badge or a partial exercise-ID match. Goal Overview and Coach show scoped Training evidence explanations (recorded comparable exposure count, latest exposure date, trend, confounders); unmatched evidence shows unknown. Added synthetic confidence-disagreement and rendering tests. No owner DB migration, live data writes, provider calls, or production promotion. CI/owner QA recorded in `PIQ_PROGRESS.md`.


## 2026-10-15 PIQ-1.6 Nutrition evidence scope — work branch

Added Coach disclosure using bounded seven-completed-day nutrition-quality counts already computed by Goal Control. Evidence-gap cards no longer borrow global confidence; numerically gated plateau options expose the same coverage without changing gating. Context revisions include the displayed evidence. Tests cover high-versus-limited/unknown conflict, exact counts, no zero-intake inference, and stale-count invalidation. Branch only; no production migration, merge, provider call or owner-record change. Release gates: full CI, authenticated device validation, migration `0054` preflight.


## 2026-10-15 PIQ-1.6 recovery/goal missingness confidence — work branch

A missing Recovery sensor/check-in or unknown active Goal no longer inherits global high confidence on a Coach evidence-gap card. Coach displays a source-specific missingness explanation and derived assessment period, explicitly declining to interpret unknown as deterioration or failure. Non-calorie context tokens include the displayed explanation. Regression tests cover sleep, goal, generic weak evidence, and stale-context fingerprints. No schema/provider/owner/prod changes. Release gates remain in `docs/ai/PIQ_PROGRESS.md`.


## 2026-10-15 PIQ-1.6 missing-signal source coverage — work branch

Goal Control missing-signal limitations carry optional exact observation-window coverage and source provenance. Coach differentiates its assessment window from the actual source window, displays observed and eligible dates and excluded observations, and explains limits without assuming unlogged equals zero or complete. The existing non-calorie context fingerprint includes these fields. Synthetic and derived-Goal-Control regression tests added. No schema/production/provider/owner-data writes.


## 2026-10-15 PIQ-1.6 paired-signal association evidence — work branch

Goal Overview now has a collapsed observational relationship disclosure with actual paired dates, sample minimum, lag, source window, independently derived source coverage and provenance, plus an explicit non-causality caveat. Existing Health Intelligence correlation thresholds/ranking are unchanged; tests include real synthetic data and absent coverage. No DB migration, provider call, production data change, deployment or `main` merge. CI and owner QA pending.


## 2026-10-15 PIQ-1.6 observational coefficient meaning — work branch

Goal Overview now distinguishes paired-date count grading from Spearman rank-association magnitude and its original categorical strength, and explicitly avoids claiming statistical significance, confounder control or causation. An unavailable coefficient remains unavailable. The Health Intelligence relationship calculation itself is unchanged. Synthetic and SSR regressions added; CI and owner-device QA remain gates. No schema, prod, Gemini or canonical owner data changes.


## 2026-10-15 PIQ-1.6 time-trend sensitivity — work branch

Added an optional, derived day-to-day first-difference Spearman sensitivity beside the existing observed relationship coefficient. Uses strictly consecutive eligible X-side matched anchor dates and original Y lag; explicitly labels sparse/constant/bad data unavailable. Does not change relationship eligibility, confidence grade, Coach interventions, database schema or production data. Regression tests include a shared monotone trend with opposite short-term change correlation and lag/gap edge cases. Full CI, authenticated iOS QA and PIQ owner acceptance remain gates; migration 0054 still not applied.


## 2026-10-15 PIQ-1.6 correlation screening disclosure — work branch

Goal Overview derives candidate/evidence-qualified/goal-relevant/displayed relationship counts from its existing intelligence snapshot. The collapsed panel names selection bias and explicitly does not claim a multiple-testing correction, statistical significance, independent replication or causation. Synthetic 10/1/1/1 and top-three-cap 10/5/4/3 regressions added. No new model calls, schema, production writes or main promotion; CI and owner device gate still apply.


## 2026-10-15 PIQ-1.6 observational direction comparison — work branch

Goal Overview now labels descriptive agreement/opposition between overall and adjacent-day Spearman signs with explicit noncausal, non-actionable caveats. Null/zero/invalid/sparse evidence remains unavailable. Calendar-date clustering rejects impossible dates. SSR and pure regression tests added. No schema, model calls, prod writes, main promotion or owner-history backfill. CI/owner-device gates remain recorded in `PIQ_PROGRESS.md`.


## 2026-10-15 PIQ-1.6 paired-date availability disclosure — branch only

Goal Overview observational relationships now disclose actual paired observations against calendar-alignable lag opportunities within the source window, with explicit observation-selection and no-zero/no-completeness cautions. Inconsistent pair dates/counts disable precise derived pairing, clustering and day-change context. Synthetic and SSR tests cover 16/28 same-day and 16/27 next-day cases, impossible/duplicate/out-of-range dates and unavailable fallback. No owner DB writes, Gemini/provider calls, schema changes, production promotion or main merge. CI/mobile acceptance status tracked in PIQ_PROGRESS.


## 2026-10-15 PIQ-1.6 paired-reading provenance — work branch

Relationship date disclosures now verify each claimed X/Y pair is backed by two finite, key-matched, date-consistent recorded observations in a unique daily frame. Invalid provenance hides pair opportunity, matched window, clustering and daily sensitivity; the original observed association is not recomputed. Synthetic tests and release gates documented in `PIQ_PROGRESS.md`. No live records, migrations or provider calls.


## 2026-10-15 PIQ-1.6 observed association coefficient source reproducibility

Added read-only rank-coefficient attestation for Goal Overview relationships using their exact cited daily X/Y observations. When a finite source edit makes the old rho non-reproducible, the panel suppresses rho/strength and precise pair diagnostics and identifies the prior association as unverified; original snapshot ranking and owner records remain untouched. Focused SSR/analytic regression added; CI and owner-device review remain release gates in PIQ_PROGRESS. No schema/provider/production change.


## 2026-10-15 PIQ-1.6 relationship label consistency — work branch

Goal Overview checks that originally reported observational strength and direction agree with reproducible Spearman rho and original thresholds; inconsistencies withhold numerical interpretation, with synthetic/SSR tests. Branch only; pending CI, authenticated owner review and existing migration 0054 release gate.


## 2026-10-15 PIQ-1.6 relationship nutrition eligibility recheck

Bounded work-branch read-time validation for selected observed relationships: exact numeric coefficient and dates are insufficient if a cited nutrition day is no longer `verified_complete`. Withhold numeric interpretation without editing canonical history. Synthetic regression and UI disclosure added; CI and authenticated owner QA remain pending. Production/main unchanged.


## 2026-10-15 PIQ-1.6 relationship nutrition source-quality guard

Work-branch verification now requires both confirmed complete nutrition days and source-reliable high-confidence nutrition observations before Goal Overview interprets a selected observational relationship. Estimate-heavy, mixed-quality, unknown and missing-quality entries withhold numerical claims even when the original rho remains mathematically reproducible. Regression and UI disclosure added; CI/owner-device acceptance still gated. No production or provider work.


## 2026-10-15 PIQ-1.6 observed relationship snapshot context — work branch

A matching exact Health-date snapshot and valid observation window are now prerequisites for present-tense observed relationship statistics. Mismatch withholds rho, strength, paired dates and sensitivity while retaining historical evidence links. Synthetic SSR regression covers matching, stale and corrupted windows. This is not canonical SQL source-event revision checking. Refer to `PIQ_PROGRESS.md` for release gates.


## 2026-10-15 PIQ-1.6 relationship frame calendar coherence — work branch

Goal Control now requires the loaded 30-day source frame to agree with its declared day count and have exact, ordered contiguous calendar rows, not merely matching cited pairs. A corrupted source window withholds present-tense observational rho and paired-date diagnostics but leaves historical source links available. Added synthetic/SSR regressions. CI, owner device QA, source-event revision atomicity and the separately gated migration 0054 remain open.


## 2026-10-15 PIQ-1.6 leave-one-pair-out evidence disclosure — work branch

Added descriptive matched-pair deletion sensitivity to Goal Overview's verified observational relationships, with direction-category changes and an unknown result when deletion makes rho undefined. Synthetic and SSR tests protect source-gating and meaning. No schema migration, provider call, owner-data write, merge or deployment. Full CI and owner acceptance tracked in `PIQ_PROGRESS.md`.


## 2026-10-15 PIQ-1.6 readable relationship evidence — work branch

The Goal Overview relationship cards now show short observational summaries, verification state, count and count-grade by default, while nested closed native details preserve full selection/coverage/statistical limitations and sensitivity diagnostics. Source links and stale-evidence warnings remain visible. No data/calculation change; tests and full CI must pass before owner QA. No main/prod action.


## 2026-10-15 PIQ-1.6 registered association screening guard — work branch

Goal Overview now rechecks each displayed observational relationship against the current shared source registry (signal pair, lag, minimum matched count, 0.2 display floor and count grade), in addition to the existing exact-source coefficient/calendar/quality verification. A drifted definition with unchanged numeric rho cannot receive verified present-tense details. Regression tests and CI required; owner iOS and full source-revision atomicity still pending. No schema, provider, production or main changes.


## 2026-10-15 PIQ-1.6 cited source coverage consistency — work branch

Goal Overview now verifies raw per-source observed/eligible counts, provenance and count grade against the current loaded snapshot before exposing selected observational relation precision. Missing, duplicated and mismatched coverage reports retire present-tense rho, grade and source evidence; historical links remain. Synthetic nutrition and sleep tests added. No provider, schema, owner data, production or main mutations. CI and owner device QA remain open.


## 2026-10-15 PIQ-2.1 physiological reference-sex field — work branch

New nullable owner-selected `sex_for_physiology` profile field with portable backup, Settings editor, and owner-entered current-day Ask Health context. No default male on new installs; unset and individually reviewed values never choose a binary formula automatically. Server omitted input preserves current value, explicit null clears it. Requires unapplied migration 0055 after 0053/0054, CI, and owner QA/approval. No main deployment or real owner profile modifications.


## 2026-10-15 PIQ-2.2 stable demographic Ask context — work branch

Ask Health's existing owner profile load now conditionally exposes owner-entered birth date, as-of derived calendar age, and today's recorded height for relevant questions. Historical selected dates receive only DOB-derived age, never current height or current clinical/medication/sex-reference context. Unset facts are never guessed, and unrelated general knowledge queries do not include the extra demographic facts. Independent synthetic packet tests added. The branch remains isolated from production; full CI and owner QA required.


## 2026-10-15 PIQ-2.2 known profile inventory — work branch

Ask Health has a collapsed, on-demand "What Health knows about me" inventory using the existing authenticated Health Profile GET. It shows saved fields, derived age, per-profile last update and a direct Settings edit link, without loading owner data before expansion or inferring unset values. Synthetic UI tests verify default privacy and presented field semantics. CI + real owner iOS QA required.


## 2026-10-15 PIQ-2.3 owner primary-goal intent slice — work branch

Added unapplied migration `0056_primary_goal_intent_events.sql` and portable canonical event history; owner-authenticated GET/PUT `/api/goals/priority`; Goals-page picker with clear/unset state and revision-aware writes. Only an explicitly selected active goal becomes primary; no impact on Coach logic or numerical targets yet. Tests verify date-scoped history, stale versions and disposable PostgreSQL data. New migration requires owner-gated production deployment after previous PIQ schema changes.


## 2026-10-15 PIQ-2.3 safe owner-goal focus tie-break

Goal Control now reads the dated owner goal priority and may select its existing qualified due-goal Weekly Coach focus over another due-goal focus, with exact evidence references and active/unmet/current checks. Goal Overview identifies the explicitly owner-selected active goal and the tie-break reason. Does not invent advice or override non-goal focus. Branch-only tests and CI required; migration 0056 unapplied and owner QA pending.


## 2026-10-15 PIQ-2.4 named supplements in Ask Health — work branch

Question-specific Ask Health evidence now reads existing owner-saved supplement lifecycle/schedule/adherence and keeps a strict planned vs taken distinction, with the packet range capped at its as-of date. Named supplement questions are included independent of UI lens; unrelated questions remain aggregate. No new migration, Gemini call, live records or main promotion; CI and owner iOS QA tracked in `docs/ai/PIQ_PROGRESS.md`.


## 2026-10-15 PIQ-2.4 named supplement aliases — work branch

Ask Health now matches an exact saved supplement name or a conservative primary ingredient word, enabling queries like "my creatine dose" for `Creatine monohydrate`. Multiple matching saved products remain independent; unrelated, generic and similar-word questions do not trigger false source matches. Packet-only regression and green CI/owner-device gate tracked in `PIQ_PROGRESS.md`. No schema, provider, production or main changes.


## 2026-10-15 PIQ-2.4 Ask medication evidence selection — work branch

Ask Health medication evidence is now question-scoped: names, explicitly owner-asked treatment/interactions, or active records for personal GI/recovery symptoms. Source status/dose remain explicitly owner-entered and never proof of ingestion or diagnosis. Synthetic packet tests and progress gates are in \`PIQ_PROGRESS.md\`. No schema, provider calls, production modification or main merge.


## 2026-10-15 PIQ-2.4 saved allergy question gating — work branch

The Ask Health evidence packet now selects owner-saved allergy records only for explicitly personal allergy questions, exact named allergens in personal context, or personal food/medicine/supplement decisions. Unrelated general and Training requests no longer receive the allergy list. Facts are labeled current owner-entered, not verified diagnoses/exposures. Synthetic tests, CI and release gating recorded in PIQ_PROGRESS.md. No SQL, Gemini, production or main updates.


## 2026-10-15 PIQ-2.4 saved condition and free-text context minimization — work branch

Ask Health now routes current owner-entered saved diagnoses by exact personal name or deliberate owner history inventory, and attaches free-text health fields only to a relevant owner-specific question. Evidence discloses saved status, undated provenance and no clinical verification; symptom questions do not imply diagnostic relevance. Six synthetic regressions added. Production, main, owner data and provider calls unchanged; CI/owner review pending.


## 2026-10-15 PIQ-2.4 voluntary owner fact draft — work branch

Ask Health now supports owner-authored notes routed privately to an explicit Settings confirmation, staged into existing context and saved only by the original owner-operated profile save. Added conservative bounds, duplicate and overflow protection and pure tests; fixed stale broad-disclosure I10 test semantics. No migrations, AI calls, owner writes or main promotion. Full CI and mobile QA are release gates.


## 2026-10-15 PIQ-2.5 profile stale-save guard — work branch

Settings profile writes now carry the original GET version. Server writes are guarded by an atomic conditional SQL update or no-clobber initial insert, and stale attempts return 409 with no retry. Updates bump the visible timestamp by at least a millisecond; partial omitted fields remain unchanged. User drafts remain visible on stale conflict until explicit reload-discard. The prior non-atomic note-only preflight was removed. Added eight synthetic cases. CI, PostgreSQL concurrency testing, authenticated mobile QA and owner migration gates remain open; main and production unchanged.


## 2026-10-15 PIQ-2.5 optional nutrition quality clarification — work branch

One narrow Ask Health clarification is eligible only for personal diet/weight trend decisions with logged calories but no verified complete, source-reliable day in the routed context. It links to the existing Nutrition Day log completeness editor, without writing records from a chat statement or incurring AI tokens. Adds one-question cap, Skip, Ask later (until next Health calendar day), Never ask again and opt-in re-enable; browser-local preferences contain no health prose. Deterministic eligibility/suppression regressions added. Remaining: authenticated device QA, other domain clarifications, canonical correction workflows and owner acceptance. No migrations or production changes.


## 2026-10-15 PIQ-2.5 canonical correction routing — work branch

Ask Health now offers an evidence-level “Something wrong?” review. Verified Health Profile and Nutrition evidence only can deep link to their original editors; unknown/imported/derived evidence is inspect-only. Source editors display a save-first, return-to-Ask banner. The original question/lens/range move via bounded transient router state, rehydrate an unsent question and require an explicit Ask for current records; no chat-based canonical write or unsolicited Gemini call. Settings #health-profile hash scroll is now supported. Added pure allowlist/state regressions. CI and device acceptance pending. Main, prod and schema unchanged.


## 2026-10-15 PIQ migration-preflight safety checkpoint

Read-only npm run migration:preflight added; reads schema_migrations and pg_catalog metadata only, prints migration filenames/status and returns nonzero for pending or blocked histories. Existing npm run migrate now checks migration history BEFORE creating its tracking table or applying SQL. Unknown migration filenames, out-of-order applied history, backup inventory mismatch, and occupied schemas without tracked history block writes; fresh empty schemas may initialize. Isolated Postgres CI 38851338365 and full app CI 38851338346 passed on code commit f77f2783. Live Neon/Vercel environment identities remain unverified. No production change, migration, owner health data access or phase acceptance.


## 2026-10-15 PIQ-3 early answer-quality and safety handoff

Development branch: piq/00-baseline-20261014. Source modules ask-health/intent.ts, general.ts, immediate-safety.ts; server Ask Health routing, diagnostics, UI and synthetic regressions. Standalone educational questions bypass private data loading, retain existing cost gates and use a general-only prompt/cache scope. Owner evidence requests remain conservative, with source-less personal questions unable to invent metrics. Immediate first-person emergency statements get deterministic safety advice without database or Gemini. Source-claim checks and emergency detection are intentionally narrow and require owner/expert QA. T01 old negative golden replaced with positive general-answer test. No migrations, owner data edits, production/main changes, or phase acceptance. Validate exact SHA with GitHub Actions.


## 2026-10-15 PIQ-3.3 focused training evidence

Added src/domain/ask-health/focused-training.ts and wired it into the existing canonical Ask Health loader and evidence packet: exercise-name-specific strength questions can cite a bounded six most recent high-confidence Epley-estimable working-set sessions, while reporting all eligible session coverage. Ambiguous saved exercise matches never choose arbitrarily. Same progress semantics, no new SQL/migration/model calls and derived-from-owner provenance. Unit/regression tests in tests/piq3-focused-training.test.ts. Full CI and owner acceptance still required. PIQ-3.3 GI/fiber retrieval, exact window text, and typed DB optimization remain outstanding. No main merge or prod write.


## 2026-10-15 — Context Mode handoff

PIQ development branch `piq/00-baseline-20261014`. Ask Health UI/API/owner handler supports four server-enforced context modes: smart, personalized (default), deep and general_only. Personalized bypasses the general no-record route for vague educational questions; Deep widens available evidence categories and clinical profile inventory within range and 24K evidence budget, NOT entire owner database; General Only never loads or forwards owner evidence. Metadata distinguishes what was supplied from what was cited and discloses omissions; prompt contains evidenceScope limits. Selected mode is isolated in cache key and retained on canonical source-correction return. Tests: `piq3-context-modes.test.ts` and `piq2-canonical-corrections.test.ts`; CI must be verified against latest SHA. Existing AI budget/usage gates retained, 0/9 PIQ phases formally accepted, no main/prod merge or migration.


## 2026-10-15 PIQ-3 Context Mode follow-up

Explicit owner-controlled Context Mode now includes a bounded, privacy-safe “What Health AI considered” manifest for up to 24 supplied substantive evidence items (id, label, domain, dated source, detailPath, provenance) and distinguishes model-cited facts from context-only facts. Deterministic answers display no-model-call disclosure. General Only personal metric/trend queries give deterministic no-data guidance, never guessing or burning model tokens. Synthetic Context Mode regressions expanded. Changes remain on piq/00-baseline-20261014 only, unaccepted. Run full checks on exact current SHA; no production operations. The standalone single-topic digestive privacy regression from earlier PIQ-3.3 remains a separate follow-up.


## 2026-10-15 Deep Dive vague-question coverage checkpoint

Deep Dive now opts into a small sample of recorded fiber/hydration/bowel values even for questions without these keywords. Existing General Only isolation, Smart/Personalized minimum-necessary GI selection, verified whole-day nutrition filtering, source caveats, packet-size limit and AI cost gate are retained. Added regression tests: piq3-deep-context-evidence. No live DB or Gemini usage; tests/owner sign-off still required.


## 2026-10-15 — Context Mode all-history UX checkpoint

On PIQ branch, added `src/domain/ask-health/context-range.ts` and a Deep Dive-specific **Use all available history** shortcut in `AskHealthPage`. It discloses 30d/90d/6m/1y versus All and still warns that All refers to the date scope, not a raw full-database AI upload. Date range changes clear previous AI answer/chat, do not trigger a new model call, and cannot change an in-flight request. Tests: `tests/piq3-deep-dive-history-window.test.ts`. No production/main migration, model or owner-data action. CI, iPhone UX and phase approval remain open.

## 2026-10-16 PIQ-4.1 first digestive sample screen — isolated branch

Auth branch-binding preflight `1868eea` passed exact GitHub CI run 38933955703; it remains opt-in and does not prove runtime Auth tenant isolation. First PIQ-4.1 saved-Bristol sample-screen integration landed in `6c4e402`; CI FAILURE at checkpoint: GitHub Actions 38935399299 (exact code SHA 6c4e402587c28eae33c49325124cdacc8f2b9b52). New Vercel preview built READY; production still serves main. All real owner-data QA, migration, paid provider, DB/Auth runtime attestation, encrypted restore and owner acceptance remain blocked. Full-window digestive trend/lag reasoning is **not implemented**; sample co-presence is noncausal.

## 2026-10-16 — PIQ-4.1 first slice passes GitHub CI after natural-language date fix

Code SHA `b3fe08f3bbdfeb4ae8d48055420b28ef0a6e9e7b` passes run 38936040705: npm ci, tsc, ESLint, full Vitest, build. Fix `digestDateSelection` to treat causal "from low fiber" as non-temporal; date-anchored "from YYYY-MM-DD" remains unsupported range. Previous `6c4e402` failed its five new GI tests and was repaired; previous READY Vercel preview is stale and corrected commit was build-rate-limited. No prod release, schema mutation, Auth isolation proof, owner-data test or paid provider call. Engineering PIQ-4.1 partial only; formal PIQ acceptance 0/9.

## 2026-10-16 PIQ-4.1 audited full-window Bristol coverage, CI green

Development code SHA `c065f608d487820a1d78dbc2e3fc963e850b904a`, run 38937759507 all required checks **passed**. New 90-day maximum per selected/requested interval, explicit history date handling, query-scoped aggregate stool types, reconciliation to existing source counts, unknown-vs-explicit-zero separation and no fabricated association. See `docs/ai/PIQ4_DIGESTIVE_WINDOW_CONTRACT.md` and PIQ_PROGRESS. Vercel corrected preview not deployed due build-rate cap; production remains on original main SHA. Schema 0053–0056 unapplied pending authorized DB target. No paid provider/owner-data operations or formal phase acceptance (0/9).

## 2026-10-16 — PIQ-4.1 lag pairing coverage verified

Development code `72c36f2838f1ddcf93f9b5afe339880f9fe87f87` passes full [CI 38939803479](https://github.com/daurham/daurham-health/actions/runs/38939803479) (install/tsc/lint/Vitest/build). Bounded canonical Bristol source + source-quality verified fiber / logged water pairing 0–2 days now reports **coverage only**, not a personal symptom correlation; test synthetic every-other-day overlap corrected. Prompt prevents pairing coverage from being treated as a personal rho. Latest Vercel preview build rate-limited, production alias main unchanged; migration 0056 unapplied, effective production vs preview Neon Auth/DB not attested, human owner QA and 9 phase acceptances open. See `docs/ai/PIQ4_DIGESTIVE_PAIRING_CONTRACT.md`.

## 2026-10-16 — PIQ-4.1 contrast/context readiness CI GREEN

Exact application commit `64ec97950d881c48e68358b7bba0cb3d71dd13ba` passed all steps of GitHub Actions [38940866587](https://github.com/daurham/daurham-health/actions/runs/38940866587). Unlike the previous 12-pair/4-week minimum alone, a personal digestive relationship review candidate now needs actual between-date stool-hardness and verified fiber variation. Already-loaded dated context *tags* (never notes) and co-changing logged water force manual alternative-explanation review. A missing tag is unknown, not proof no confounder; all markers remain non-substantive, not a rho/cause/clinical guidance. Tests in `tests/piq4-digestive-context-review.test.ts`, contract `docs/ai/PIQ4_DIGESTIVE_PAIRING_CONTRACT.md`. Production and migrations untouched; latest exact deployment's runtime DB/Auth still unverified, PIQ owner acceptance 0/9.

## 2026-10-16 — PIQ-4.1 correction-aware bowel event identity validation

Validated SHA `f93240bfec4f42411adb4a1fd42886e426e9a025` is fully green on [Actions 38942513613](https://github.com/daurham/daurham-health/actions/runs/38942513613). Exact saved ID+calendar-date pairs (max 512 across 90 days) are now passed as query parameters to a privacy-bounded read-only grouped SQL join; matching *counts* returned to the pure verifier. Same-date deletion/re-add or moving events to another date invalidates a stale canonical snapshot despite unchanged per-day totals, withholding full-window Bristol and derived pairing. No expanded owner note retrieval. Not a cross-query transactional snapshot; future hardening remains. Dev branch only; current code not preview-deployed due to Vercel rate limit. Production alias unchanged, 0056 schema/DB/Auth still owner gated, PIQ owner acceptance 0/9.

## 2026-10-16 — PIQ-4.1 optimistic cross-domain digest recheck validated

Latest code SHA `6b1a0eeec249924b14b686b712ecee9544521207` passed [Actions 38944207255](https://github.com/daurham/daurham-health/actions/runs/38944207255): install, tsc, lint, complete Vitest and build. Existing source-revision-gated full-day fiber, water event ID/volume, and dated context **tags only** are re-read within exact requested <=90d scope after bowel ID+date reconciliation; mismatch or SQL failure withholds derived digestive pairing, sampled cross-domain claims and focused water/fiber examples. No raw owner notes enter the derived marker. This is not a multi-source transactional snapshot; wider packet remains independently loaded and needs review. Original SHA `21d75ef` was also green before a narrow historical-date context fix. Production alias main unchanged, Vercel preview latest code not READY/verified, migrations owner-gated, 0/9 PIQ owner acceptance.

## 2026-10-16 — PIQ-4.1 packet-level invalidation validated

Exact code `23a7513fb86c4b6d91c0f64b099fecb67641cc46` CI [38945887236](https://github.com/daurham/daurham-health/actions/runs/38945887236) **SUCCESS** on full install/tsc/lint/Vitest/build. New `digestive-packet-guard.ts` filters stale fiber/water/bowel signal baselines, coverage, rho, interventions and contextSummary after optimistic source mismatch; separately suppresses obsolete bowel samples on ID/date conflict; never treat `bowel.count` correlation as hard stool/Bristol relationship. Unrelated intelligence survives and filtered packet governs cache fingerprint. Exact commit preview **READY** `dpl_HDbkWoqC9aSTHG7Q7z25AFEkHmZg`, but runtime Neon DB/Auth isolation still unverified; production alias main unchanged, no migration or owner tests. PIQ formal acceptance 0/9.

## 2026-10-16 — PIQ-4.1 recheck grouped into one MVCC-consistent statement

Code `3154c514985972e5d0840d3cb381c8c6e7743e44` fully passed [Actions 38946983236](https://github.com/daurham/daurham-health/actions/runs/38946983236). Three independent read-only source rechecks are now one bounded SELECT using revision-gated verified whole-day fiber, water logs and saved context tags, yielding a common statement-level read snapshot; malformed results or discrepancies suppress cross-domain pairing. Still not a shared transaction with the original loaded health snapshot or future edits. Synthetic mock-query regressions added; no owner DB reads or writes. Vercel env metadata scopes important Auth/DB/owner keys to both preview and production, preview Neon branch is a clone of the parent's data. Effective runtime binding remains unverified; do not sign in to preview. Main production unchanged. Current code not yet confirmed deployed READY, PIQ formal acceptance 0/9.

## 2026-10-16 — PIQ-4.1 preview isolation preflight

Dev code `0c464a45f4e923d6113ff430a90bdd85694888dd` passed [CI 38948332648](https://github.com/daurham/daurham-health/actions/runs/38948332648), preview READY `dpl_8evf4sa3bD4SSiNb1HKjrbzhnQd1`. New pure `server/piq-preview-preflight.ts` + tests combine exact DB/Auth binding, mandatory enforcement flags, pinned SHA, unique preview owner and independently obtained Neon branch-origin attestation. The actual PIQ preview `br-damp-pine-aw5cconp` is parent-data cloned; its use for owner-data QA is BLOCKED. CLI `npm run piq:preview-preflight` prints reason enums only, never reads secrets or records, and cannot pass without trusted Neon metadata. No release, migration or main/production change. PIQ acceptance 0/9.

## 2026-10-16 — PIQ-4.1 separated window and bowel-status continuity check validated

Exact code SHA `040abcf7d3825772f3cef639fef3efb5f94002d2`, [CI 38949420254](https://github.com/daurham/daurham-health/actions/runs/38949420254) **SUCCESS** across install, tsc, lint, full tests and build (initial unused-index lint failure in `f10cc3c` corrected before validated run). Digestive pairing candidate screens now require at least two separate anchored 14-day bins with >=4 qualified paired dates in each, and reject >7 consecutive days of *unknown saved bowel status* between the first and last observed status. Explicit zero counts as an observed status, NOT as Bristol outcome. Unknown dates before/after active span remain unknown; passing never verifies a complete bowel diary or supports causality. Packet coverage reflects missing status and separated-bin count, always non-substantive. No owner data queried, no new DB operations/migration, no preview login; production unchanged. Preview parent-data clone remains forbidden for owner-data QA. PIQ formal acceptance 0/9.

## 2026-10-16 — PIQ-4.1 final privacy/date/symptom boundary regressions

Latest exact app SHA `f3f8366e969f0b5acbebeb64723aa12fb611ba24` passed [Actions 38951133116](https://github.com/daurham/daurham-health/actions/runs/38951133116), including TypeScript, lint, full Vitest and build. Exact-SHA Vercel preview `dpl_AENbcQmQqs5uS7xi8uBNZTU7yzWB` is READY; not owner-data-isolated. An entirely unrecorded bowel history day now has a **null**, never a false zero hard-stool value; explicit owner-reported zero days stay valid. Explicit present/current vomiting blood, severe abdominal pain or black tarry stools gets deterministic immediate guidance without private loader, model or AI budget. Negated/historical/educational questions do not trigger this narrow path. General Only private history test verifies no loader/provider. Rabbit-pellet phrasing now counts as stool-type and cannot use bowel count rho as hardness evidence. No changes to private DB/Auth, owner data, migrations or main. Prod alias unchanged. Owner acceptance 0/9. PIQ-4.1 code ~98%, isolation/recovery/human QA still blocked.

## 2026-10-16 — PIQ-4.2 first cross-domain weight/intake Ask Health slice

CI-green app commit `90304a1f4e5ff3476158ad3549911639a6725712` ([Actions 38954604831](https://github.com/daurham/daurham-health/actions/runs/38954604831)) implements source-verified complete-day intake + comparable weigh-ins using the **existing** 28/21/14-day maintenance engine. Emits selected, bounded, descriptive observed energy-balance estimate only with aligned data; never a measured TDEE, proven deficit, plateau recommendation or automatic calorie cut. New `focused-weight-energy.ts` and tests; Ask Health loader/packet wiring. Separate goal-version, target revision, competing experiments and strength preservation remain explicitly **unverified**. Historical explicit dates skipped, General Only no owner focus, Deep Dive opt-in. The fallback insufficient state now counts only the attempted last 28 completed days, not old verified days elsewhere in 90-day history. Initial fixture correction acknowledged intended 14-day fallback; exact final SHA passed all CI stages. Still dev branch only, production/Neon/Auth unchanged, no owner data access. PIQ program approx 50–60% engineering, **0/9 formally accepted**.

## 2026-10-16 — PIQ-4.2 sodium/carb scale context green

Exact validated app SHA `3398af63b58b115679c0e9e028a1516cb2dd4f17`, [GitHub Actions 38957258842](https://github.com/daurham/daurham-health/actions/runs/38957258842) **SUCCESS** on npm ci, tsc, lint, all Vitest and build. Ask Health weight-intake descriptive screen now selects only source-verified sodium/carb rise context from existing maintenance-engine `noiseFactors`; event-only hydration and bowel changes are withheld from this weight-cause context. Empty qualifying list means NOT TESTED/SUFFICIENT COMPARISON, not proven normal. Generic causal water-weight or calorie-change claims remain blocked by the verified goal/target/strength/experiment decision boundary. Scalar evidence coverage ensures packet schema compatibility. All tests are synthetic, no owner Auth/DB access, migrations, paid AI or production change. Production alias unchanged. Formal PIQ acceptance 0/9.

## 2026-10-16 — PIQ-4.2 one-day weight/intake history verified

Exact application code `0fc0f7d16d5414559a4f96f3ffb3a47f33ecef29` passed [CI 38958554527](https://github.com/daurham/daurham-health/actions/runs/38958554527) (tsc, lint, full tests, build). New `focused-weight-energy-history.ts` strictly answers individually requested historical dates with recorded scale kg and **only owner-verified completed-day** calories from the already-loaded intelligence frame; no deficit/plateau/TDEE or calorie-cut inference. Single-day Ask Health packet projection prevents broader nutrition, body, goal, AI context or undated data from being misquoted for that date, and protects General Only. Out-of-range/ambiguous dates remain no-substitute, exact date privacy/correction tests are green. Initial code attempt failed boolean coverage TypeScript, corrected/fully rerun on final code SHA. Production unchanged, private/paid/migration operations not performed, preview owner QA blocked pending DB/Auth isolation. Overall PIQ ~55% engineering estimate, formal owner acceptance 0/9.

## 2026-10-16 — PIQ-4.2 bounded named historical window for weight/calories

Exact code `e1052b025ee1190006afa7d40516a92818b06705`, [CI 38960264523](https://github.com/daurham/daurham-health/actions/runs/38960264523) **SUCCESS** on tsc/lint/all Vitest/build. Supports last/this week/month and eligible trailing day windows via existing strict Health as-of period parser; per-interval average only over verified reliable complete food days, and observed weigh-in difference only with >=3 usual-condition measurements spanning >=6d and covering endpoints. Omit today and other periods; no current body/clinical/global evidence leak into these named-window packets. Out-of-range/ambiguous scopes fail closed. No verified plateau, fat loss, deficit, target or exercise changes. Initial TypeScript boolean coverage failed on `56394dc`, fixed in `e1052b0`; only last SHA validated. Production unchanged; exact code preview READY not attested and Neon preview is parent-data clone, so owner QA prohibited. 0/9 formal PIQ acceptance; overall engineering approx 55%.

## 2026-10-16 — PIQ-4.2 source-matched protein / training context

Dev code `77e398d6ef1b1b3d27fd4e70f5eab64aad071220` passed full [CI 38961425326](https://github.com/daurham/daurham-health/actions/runs/38961425326), exact-SHA preview READY `dpl_5SefvnvNcvaYUAFmFufJhfth4qna`; production alias unchanged. New pure protein/training screen only counts owner-verified complete, source-identical food-date protein, allows descriptive average after >=4 dates spanning >=7 days, excludes provisional today; source-attributed positive Training events counted solely as participation. No muscle-retention or sufficient-protein claims, exercise-comparable trend, current goal/target, experimental-intervention approval or calorie adjustment. New non-substantive packet context is fingerprinted and respects historical/General Only boundaries. All tests synthetic, no owner records or paid AI. QA remains blocked for cloned preview, formal owner acceptance 0/9.

## 2026-10-16 — PIQ-4.2 historical calorie-date distribution confidence

Exact code `32b0c476f0840416e1f76d357ddd3347f7fb3e48` fully passed [CI 38962196641](https://github.com/daurham/daurham-health/actions/runs/38962196641), npm ci/tsc/lint/all Vitest/build. Fixed single/clustered-window calorie averages potentially being mistaken for representative weekly intake by adding a verified-date distribution status across immutable halves of completed dates, with dates/counts in historical-only packet and cache fingerprint. Distributed screen: >=4 verified reliable whole-day dates, >=50% completed date coverage and >=2 dates in each half; heuristic only, no clinical intake-completeness claim. Conditional verified-day mean remains truthful but explicitly nonrepresentative when sparse. Today excluded; no extra DB/model calls. Production unchanged, owner data and preview auth untouched, no migration. PIQ formal acceptance 0/9.


## 2026-10-16 — PIQ-4.2 projection-history temporal sampling checkpoint

Exact implementation commit `ea60e948c79d9166bbdb9b443f738676cc992593` passed [full CI run 38986641308](https://github.com/daurham/daurham-health/actions/runs/38986641308). For current, owner-personalized weight/energy Ask Health, the independent recheck of the same source revision also evaluates unique Health-local measurement dates (90-day window, 5 dates, 14-day span, <=14-day age, 2 dates per observed-span half, no >21-day gap). Projection outputs that Goal Control mathematically labels available but that fail this screen now trigger a non-substantive `projection_quality_limited` state and WITHHELD goal target/deadline interpretation. The canonical projection and Goal Control calculations, database and targets are unchanged. Strict gate is not a proof of usual-condition comparability, clinical suitability, weight loss, or calorie-change authorization. No migration, owner-data inspection, model bill, production/main update or owner QA. Continue with measurement-comparability and permissioned maintenance review only after evidence/safety gates; 0/9 phases formally accepted.


## 2026-10-16 — PIQ-4.2 generic goal packet escape hatch closed

Exact development commit `5b92640fefd0600530c5b49877e1f3ee77e2eb42` passed [full CI 38987049640](https://github.com/daurham/daurham-health/actions/runs/38987049640) (TypeScript, lint, all Vitest, build). When current selected weight-goal Goal Control status is withheld in the focused weight-energy review, ordinary `goals.<id>` rows cannot quietly re-introduce the same goal as unqualified substantive evidence. The server's transient exact current selected weight-goal ID is not emitted as new confidence evidence; unknown identity conservatively excludes body-metric goal rows in focused context, preserving other goal kinds. Direct weight-goal/target/trend/projection questions now route into the focused review. No database migration, owner record access, paid AI call, target change or production promotion. PIQ phase owner acceptance remains 0/9; next check weigh-in comparability/contradiction and intervention safety.


## 2026-10-16 — PIQ-4.2 weigh-in session conditions included in verified weight history

Validated code SHA `22f2a288c4175e232d2f67818aac959862c3b761` passed [CI run 38987664432](https://github.com/daurham/daurham-health/actions/runs/38987664432): install, typecheck, lint, full Vitest, build. The existing body-history projection SELECT and its private deterministic fingerprint now cover each session's existing comparability label. Ask Health's temporal sampling screen distinguishes sufficient date coverage from `measurement_conditions_unverified` when any 90-day projection contributor is not explicitly `usual`. Available yet noncomparable projections are withheld in current selected-goal cross-signal status as `projection_conditions_unverified`; generic Goals bypass remains suppressed. Not a physiological safety or calorie-adjustment gate. No migration, new SQL calls, owner health reads, paid model calls, production merge or owner acceptance. Next investigate exact latest-point comparability and confounder alignment.


## 2026-10-16 — PIQ-4.2 latest-point source comparability now attested

Validated application commit `604e00f8a88fc380b770f94122759ae526371e4c`, [CI 38989125463](https://github.com/daurham/daurham-health/actions/runs/38989125463) full green (install, types, lint, Vitest, build). The shared canonical as-of weight-point SQL/hash includes the measurement-session comparability label. Its independent late Ask Health recheck fails closed on absent/invalid conditions; revision-matched, present latest points not labeled `usual` now cause `measurement_conditions_unverified`, withholding selected primary weight goal status/deadline independently of forecast availability. Empty point remains unknown; source integrity takes precedence. Cross-signal reason, packet text, and synthetic regression tests added. No migration or extra SQL, production release, owner data or provider spend. Next scoped evidence-quality work: distinct scale fluctuation confounder screening without asserting causality or caloric authorization.


## 2026-10-16 — PIQ-4.2 short-window scale sampling context verified

Exact CI-green code `9b4455cf7e230bbe72441687abe58d326d7db671` ([Actions 38990602182](https://github.com/daurham/daurham-health/actions/runs/38990602182): install, types, lint, full Vitest and build). `src/domain/ask-health/scale-window-signal-coverage.ts` now checks actual source-identified usual-condition weigh-in dates in the same recent 3 + preceding 7 completed days used for the existing source-verified sodium/carbohydrate shift. A food-log change is explicitly labelled nutrition-only without adequate usual weight coverage; even good co-observation is NOT a personal nutrient/scale association. Water and step observations count source-identified logs, never complete-day water/activity or a verified scale confounder. `focused-weight-energy.ts` and `packet.ts` pass this non-substantive evidence into output and fingerprint; new synthetic tests cover time, attribution, malformed sources and no-weigh-in changes. Initial run had a false-positive test expectation and final corrected run is fully green. No schema migration, paid provider calls, additional SQL, owner data, or production operation. Next review bounded temporal conflicts/confounders, retain all calorie/plateau intervention prohibitions.


## 2026-10-16 — PIQ-4.2 current nutrient log vs weigh-in date ordering

CI-green exact code SHA `7158176d0d6ad4bf5be6c8acc001d53098e02b39` ([Actions 38991150952](https://github.com/daurham/daurham-health/actions/runs/38991150952): install, TypeScript, ESLint, full Vitest, build). Pure `screenScaleShiftTiming` adds nutrient-specific chronological qualification atop existing ten completed-day weigh-in sampling: verified daily food-log dates in recent three days require a usual-condition scale point on a strictly later calendar day before any claim of *later record existence*. Same-day recorded weight has unknown within-day ordering. Insufficient usual weight coverage, missing/duplicate/future dates and unqualified food shifts get separate neutral states. Existing `focused-weight-energy.ts` and `packet.ts` expose only non-substantive status and explicit no-causality wording. Regression tested, including owner-only scope and packet fingerprints. Initial TS target `Array.at()` compatibility regression was fixed; final exact run green. No migration, extra SQL call, paid model spend, source data mutation, production merge or owner QA. Next: revision/quality coherence across changing daily context and scale sources before action gates.


## 2026-10-16 — PIQ-4.2 current Nutrition late recheck and step identity

Application code `a5e98031e7f341f0159596f0509c7218ac50760a` passed [GitHub Actions 38991752879](https://github.com/daurham/daurham-health/actions/runs/38991752879): npm ci, typecheck, lint, full Vitest and build. Existing `activity_daily_summaries.id` is now preserved as an actual identity on intelligence activity observations (rather than reporting source-identifiable step dates as zero). A final set-based canonical Nutrition recheck, one additional DB query per eligible current personalized weight/energy question, checks original owner-confirmed days, source IDs, calories and protein/carbs/sodium values against the late database revision. A failure/change withholds focused intake/weight conclusions, replacing them with a non-substantive privacy-safe explanation. Tests include same-calories macro change and missing data, owner-confirmation, attribution and output cache integrity. No schema migration, paid model, owner data, main merge or deployment. Important boundaries: weight/activity/context revisions are NOT all locked, and source consistency is optimistic not a transaction. Next evaluate those distinct provenance gates.


## 2026-10-16 — PIQ-4.2 current scale and device Activity late-read check

CI-green code `8c2ee5dd740c5b1c2c9d657472c15c6b49a462e8` ([Actions 38992402192](https://github.com/daurham/daurham-health/actions/runs/38992402192): install, typecheck, lint, full Vitest, build). Shared intelligence source SQL and pure body-weight conversion now support a late canonical effective-signal comparison. Two bounded DB reads verify source-identifiable selected-window body-weight and Activity signals against the first intelligence snapshot: ID, date, unit, value, weight conditions and provenance. Either this or the prior Nutrition late recheck failing now withholds the focused current-day weight/energy content and emits a privacy-safe source warning. Tests include replaced/deleted rows, source IDs and unchanged values with changed conditions. Only effective per-day frame data and current exclusions are attested; Daily Context, generic packet activity, clinical interpretation and fully atomic reads remain unverified. No migrations, third-party API cost, production merge or owner data. Next: cross-domain Daily Context consistency and owner QA acceptance design.


## 2026-10-16 — PIQ-4.2 Daily Context and generic-source conflict prevention

Full CI-green application commit `e49f308caa71d0d96889f664b502a0ef741c30d4` ([Actions 38995054252](https://github.com/daurham/daurham-health/actions/runs/38995054252): install/typecheck/lint/full Vitest/build). An extra late saved Daily Context service reread checks full note/tag/ID/date and created/updated revision equality for eligible current-day private-context General/Recovery/Experiments requests. Any changed/added/deleted, malformed or unavailable data is withheld in generic context evidence and replaced with one neutral explanation; no private text leaks in failed evidence. Separately, failed focused Nutrition or weight/Activity consistency checks now suppress stale generic body/nutrition/activity/Goals/shared Intelligence evidence and intelligence context summaries that previously bypassed the focused withholding. Sleep, supplements, verified context, clinical profile retained independently. New tests verify these conditions; first run failed a synthetic routed-intelligence fixture lacking selectedKeys and final rerun fully passed. No migrations/paid provider calls/production updates. Optimistic non-atomic reads remain; owner QA/acceptance and additional independent sources still pending.


## 2026-10-16 — PIQ-4.2 selected historical weight/nutrition recheck

Exact code `6973cbea3814f8bdac4a81828417d08058a56896` [CI run 39000152407](https://github.com/daurham/daurham-health/actions/runs/39000152407) fully green: install, typecheck, lint, full Vitest, build. A named past day or recognized historical window in scope now gets a bounded two-query local source recheck for owner-complete Nutrition and source-matched usual/other-condition weight records. A source correction, new/deleted confirmation, changed sampled weight conditions/ID/value, or unavailable read suppresses stale historical weight, calorie and sampling facts in the final packet and shows only a neutral source warning. Today is explicitly excluded from historical full-day data; existing selection limit up to 90 calendar days preserved. No migration, external AI request, owner data access, or production promotion. Not an atomic historical snapshot and not universal source attestation. Next review other generic data paths and owner-run acceptance/rollout.


## 2026-10-16 — PIQ-4.2 generic Activity cross-read agreement

**Full CI pass:** exact app SHA `839cac18c943729fabf0fb8678c76bdc0043ca29`, [Actions 39000625346](https://github.com/daurham/daurham-health/actions/runs/39000625346). Generic current-day `activity.*` evidence no longer assumes that the Progress Activity read and the independent Intelligence Activity snapshot agree. A pure check matches steps, exercise, energy and resting HR by date, value, timezone and source-qualified Intelligence record, rejecting duplicate/changed/missing or incomparable views; **zero new SQL or provider requests**. On mismatch the packet suppresses direct Activity measures, Activity-linked Intelligence coverage, baselines, relationships and changes, and related context summaries. Existing focused weight-energy conflict precedence is also triggered, preserving independent sleep and clinical data. Not an atomic/late source attestation. Next: owner evidence acceptance tests and independent generic source-gate review. Development only; no migration, prod push, or PHI reads.


## 2026-10-16 — PIQ-4.2 generic Sleep source consistency

**CI green:** application `c790488dd593d3e6de0d9988830b614f018737ab`, [Actions run 39001090617](https://github.com/daurham/daurham-health/actions/runs/39001090617), npm ci/typecheck/lint/full Vitest/build. The Sleep nightly Progress and independent Health Intelligence reads are now deterministically reconciled for current personalized answers without a new database query. Canonical nightly summary row ID is retained in the DB-loaded Progress type, alongside the original source ID in Intelligence; same-duration row replacement, modified duration, differing eligibility, missing date, duplicate record, source ID or timezone fails closed. Packet withholds generic Sleep-specific facts and Sleep-linked correlations/interventions, preserving unrelated facts and a neutral privacy-safe explanation. Not late row revision attestation and not stage/vitals source equivalence. PIQ development only; no migrations/paid provider calls/main merge/owner PHI reads. Next generic Training source integrity and owner acceptance QA.

## 2026-10-16 — PIQ-4.2 Training generic source agreement

Full green GitHub Actions [39001749033](https://github.com/daurham/daurham-health/actions/runs/39001749033) on code `424b8789b96146893f2ada62a9e109f9fd2a4a67` (install, types, lint, Vitest, build). A zero-query dual-source Training check compares canonical session dates/IDs/count and recorded effort against the independently loaded shared Intelligence frame. Any conflict withholds generic Training measures, strength set snippets and Training-linked intelligence, and blocks current focused weight-energy source interpretation from silently using conflicting training data. Retains unrelated domain evidence, leaves unlogged sessions unknown, distinguishes derived completed-day zero from provisional today. No schema changes, owner PHI, paid calls, main merge or production deploy. **~82% engineering estimate; 0/9 formal owner acceptance**. Remaining: working-set late revisions, generic Supplements/profile source quality, QA and release gates.

## 2026-10-16 — PIQ-4.2 working-set content reconciliation

CI-green `8edba69476b203e985ed9dce27e83aedd5e873f5`, [Actions 39002402550](https://github.com/daurham/daurham-health/actions/runs/39002402550) (install, TypeScript, ESLint, full Vitest and build). One bounded local read rechecks initial canonical working-set contents for selected current personalized strength evidence, including previously empty windows; any missing/edited/added/replaced values or unavailable read withholds direct Training strength and associated shared-intelligence claims. Existing session dual-read gate retained. No additional paid provider calls, schema migration, main merge, deployment or owner data access. This is optimistic value/source agreement, not a transactional working-set version lock. Exercise-definition edits and owner preview QA remain; engineering ~83%, formal owner acceptance 0/9.

## 2026-10-16 — PIQ-4.2 canonical exercise classification consistency

Full green GitHub Actions [39002857872](https://github.com/daurham/daurham-health/actions/runs/39002857872), code SHA `ca7a02abe1dc5e81a84d103d5009a40d0596d07c`. Progress and Ask Health now share a canonical mapper for exercise-definition effective fields. One extra bounded local read, in parallel with working-set final recheck only when current personalized strength evidence may appear, detects changed exercise labels, identities and load/rep classifications even if workout sets remain unchanged. Packet fails closed on definitions mismatch, omits stale exercise clarification/strength evidence and linked Training intelligence, preserves unrelated domains. No PHI access, paid AI calls, migrations or main/prod changes. **~84% engineering; 0/9 formal owner acceptance**. Next generic supplements/profile source integrity and preview acceptance; reads are optimistic, not atomic.

## 2026-10-16 — PIQ-4.2 Health Profile late source agreement

**CI:** [39003255534](https://github.com/daurham/daurham-health/actions/runs/39003255534) SUCCESS on code `a6d6d8a96726764ff2f5a01faf8eb4ebf86c9ba4`, including full tests/build. Late, read-only singleton Health Profile reread compares all effective saved fields and `updatedAt` for current owner-personalized modes; profile edits or unavailable final read withhold stable demographic and clinical owner context with privacy-safe source warning and distinct packet fingerprint. One additional local SQL query; no paid Gemini calls, migrations or production writes. Engineering ~85%; formal owner acceptance 0/9. Remaining: supplement source revisions, historical profile gaps, realistic QA and release gate; non-atomic reads explicitly limited.

## 2026-10-16 — PIQ-4.2 Supplements source consistency

Code `529fec8abb3cfcc25188df7ac57f1bd4d73a9af1`, [CI 39003629185](https://github.com/daurham/daurham-health/actions/runs/39003629185) fully green. Bounded late rerun of supplement range input service in current personalized questions able to surface Supplement facts. Reuses exact saved-name selection. Effective source mismatch in schedules, lifecycle, adherence or dose suppresses direct Supplement evidence; cache fingerprint changes; source-warning only. One service call / four read-only SQL queries only when relevant; no paid provider request, owner data access, migration or main/production deployment. Engineering estimate ~86%, formal owner acceptance 0/9; further generic/historical and owner preview review pending, not an atomic revision lock.

## 2026-10-16 — PIQ-4.2 historical Supplements late-range recheck

Code `24cf3b575ece22dd14e16a0027e3661d4bb15d1c`, [Actions 39003951542](https://github.com/daurham/daurham-health/actions/runs/39003951542) full green. Selected historical-as-of Supplements are now eligible for a bounded source reread exactly like current recorded supplements when owner-personalized answers can show regimen or adherence. A late backdated correction withholds stale Supplement evidence with neutral source warning, preserving other data; General Only still avoids personal retrieval. Only current saved interpretation of the historical range is checked, not historical point-in-time state or an atomic revision. No migration, paid model calls, owner-data reads, main merge or production. Engineering ~87%; formal owner acceptance 0/9. Next owner-realistic evidence acceptance and release gate.

## 2026-10-16 — PIQ-4.2 owner-current measurement answer boundary

Validated code `cba590d44a7388e8502dabac9eb4f1b32754138a`, [full GitHub Actions 39004654452](https://github.com/daurham/daurham-health/actions/runs/39004654452) SUCCESS (install, TypeScript, ESLint, full Vitest, build). A prior run `39004445573` had one failed legacy hardcoded v11 test (other 2435 passed), corrected in the validated commit. New synthetic adversarial integration tests show unsupported current owner measurements cannot be emitted from uncited, neutral source warning or unrelated-domain evidence; fresh and cached outputs are guarded, general education retained; no second provider call. Ask Health cache/prompt version is v12. This is not numerical validation or full personal claim semantics; source reads are optimistic. Preview, migration and owner approval gates remain open. PIQ dev branch only, no PHI/DB/model access, no migration or main/prod change. **~88% engineering, 0/9 formally owner-accepted**.

## 2026-10-16 — PIQ-4.2 current owner number/source consistency and configuration distinction

Final code `df2ba73dbae5bf895e7d80a13d69775292a819f8`, [Actions 39005550674](https://github.com/daurham/daurham-health/actions/runs/39005550674) full green CI (install/TS/lint/full tests/build). Earlier `0ad6499` run failed one synthetic saved-goal baseline because a configured 80 kg target had been incorrectly treated as an actual numerical weigh-in; fixed by reading exact canonical configured goal/planned Supplement schedule text only when the response expressly describes targets or planned doses. Recorded owner numeric claims need exact cited value/unit and correct nutrient identity; unsupported mixed quantities withheld, general responses preserved, both cached and fresh replies sanitized with no second provider request. No proof of goal achievement, ingestion, physiology, causality or all nonnumeric correctness. Owner preview/mobile/cost/privacy + schema release checks remain open; ~89% engineering, 0/9 formally accepted, PIQ branch only, no production or paid calls.

## 2026-10-16 — PIQ-4.2 current Goal Control status evidence

Code `1bfc13b7b5f45eecf6f571d95d25e4a5442dafb3`, [Actions 39005972600](https://github.com/daurham/daurham-health/actions/runs/39005972600) SUCCESS for install, tsc, lint, full Vitest and build. Last-mile current goal statements must cite a matching substantive Goal Control satisfied, lifecycle-completed or projected-deadline status rather than simply a true configured target. Exact owner target remains useful; unsupported attainment is withheld, including cached responses. v14 prompt/cache key. Synthetic offline QA only, no owner records, DB changes, paid calls or production promotion; ~90% engineering estimate, 0/9 owner-accepted phases. Preview/mobile owner acceptance still needed.

## 2026-10-16 — PIQ-4.2 General Only cached-safety and blocked preview

Code `0570462c7b120f077cb4c47d195e78c36ec089e9`, [Actions 39006416516](https://github.com/daurham/daurham-health/actions/runs/39006416516) full green. Cached general-only replies are now re-screened for invented owner-record claims, including explicit personal measurement numbers; bad cached blocks withheld, useful education preserved, no new provider attempt. Fresh/general prompt version `ask-health-general-v2` isolates cache; synthetic tests confirm zero PHI and provider usage in cached replay. External read-only metadata verified no approval for real owner preview: Vercel branch READY is older code SHA and Neon PIQ child `init_source=parent-data`, not independently empty. Runtime DB/Auth binding unknown. Branch-only, ~90% engineering / 0 of 9 owner-approved. No production, migration, PHI, database mutation or paid model calls.

## 2026-10-16 — PIQ-4 release safety metadata exact SHA/origin checker

New `server/piq-preview-metadata.ts` + synthetic tests `tests/piq4-preview-metadata.test.ts` validated on code `6d4b0a01a82533c166dbac298a368a94fbf08db8`, [Actions 39007230291](https://github.com/daurham/daurham-health/actions/runs/39007230291). Cross-source metadata require GitHub success exact SHA = Vercel READY preview deployed SHA, PIQ ref, and independent Neon empty-origin branch/identity. A valid metadata result is explicitly **not authorization**; runtime DB/Auth/tenant/data, migration backup and owner approval remain mandatory. Read-only discovery: current returned Vercel READY preview SHA `852be816b8efd3077f61f46ff04a024e5a4cff02` ≠ code candidate; existing Neon PIQ branch `br-damp-pine-aw5cconp` is `parent-data` from parent, unsafe for test-owner writes. No health data read or prod/branch write or paid AI. Engineering ~90–91%, owner acceptance 0/9.

## 2026-10-16 — PIQ-4 release metadata hardening: full CI and Vercel project (CI pending)

The offline metadata checker now verifies the exact successful **full branch
validation** workflow path (not an arbitrary green partial Actions workflow)
and the intended Vercel project ID (not a matching SHA/ref on another project).
Synthetic tests added; commit requires an exact-SHA CI pass before validated
status. No DB/PHI/model access, schema work, preview authorization, main merge
or manual deployment. Preview still blocked by inherited Neon data and
unmatched deployed commit; owner acceptance 0/9 (~91% engineering).

## 2026-10-16 — General Only suggestion-scope gap (CI pending)

Found that fabricated personal-record claims in `followUps` were not
screened though blocks/limitations were. Added a deterministic
follow-up integrity check for fresh and cached General Only replies,
plus narrow affirmative nonnumeric owner states; safe educational
conditionals remain. Synthetic stub regression only, no paid model
or Health data. Await exact commit CI. Preview remains blocked by
Neon parent-data clone and unknown runtime owner/Auth isolation.

## 2026-10-16 — General Only legacy cached references stripped (CI pending)

Corrected cached General Only response processing: sanitize all block and
limitation `evidenceRefs`, including when text has no personal claim.
This removes a possible legacy owner-evidence ID disclosure via cached
educational output. Fresh General Only output already uses an empty
evidence-ID universe. Synthetic cache/provider-spend assertions added.
PIQ branch only, no owner/DB/AI access or release; owner QA outstanding.

## 2026-10-16 — PIQ preview API hard stop (CI pending)

Static PIQ metadata gates previously never enforced server request
isolation. The branch-specific API dispatch stop now returns an
uncacheable 503 before owner/Auth handlers on PIQ candidates, with
synthetic direct/rewrite route tests. The gate has no env-only
unlock. Older Vercel READY deployment does not include it until
matching commit deployment. Production untouched; owner QA blocked.

## 2026-10-17 — Isolated QA infrastructure created (release remains blocked)

User approved a separate empty PIQ QA Neon project. Provisioned
`lively-wave-25801832`, root `br-crimson-cloud-akrf5kuo`;
verified zero application tables/read-only SQL, distinct Health project,
and distinct new QA better_auth integration. Nine Auth service tables;
zero QA users or sessions. Default Neon root reports
`init_source=parent-data` with no parent branch, so existing
PIQ empty-origin release gate still blocks until root provenance is
separately attested and logic reviewed. No migrations, QA account,
Vercel overrides/deployment, AI billing, personal record access or
production mutation. Guard commit `0c06235` passed full CI on run
39008436437 attempt 2. PostgreSQL 18 migration compatibility, test
Auth owner, and preview runtime bindings still need work.


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


## 2026-10-18 — PIQ-6.5 linked-goal / Health Profile write-time CAS (green; development only)

Commit `2f5d50dacc07a4ed67439e666887a0bb86495a5a` passed full
GitHub branch Actions 39151422885 (TypeScript, ESLint, 2,713 tests,
Vite build), and real isolated PostgreSQL 16 run 39151422876
(31/31 integration tests). The existing immutable experiment result
INSERT now compares read-time evidence to the same SQL-statement
projection of private `EXPERIMENT_CONTEXT_SIGNATURE_SQL` revision
metadata for profile and linked goal/version/lifecycle. Synthetic
two-session test mutations reject stale profile, goal-link and
goal-status changes. No notes, clinical text, goal target values,
new migration or AI/model calls were added. `main`, live production,
production migrations and owner data remain untouched.

This remains PostgreSQL READ COMMITTED statement-snapshot CAS, not
serializable transaction isolation or evidence of intervention effect.
The historical evidence-memory ranking gate stays disabled. PIQ-7
independent preview DB/Auth, release/rollback, mobile owner QA and
formal owner acceptance are outstanding (0/9). Next review: staging
query cost / statement timing and post-finalization source drift.


## 2026-10-18 — PIQ-6.5 bounded body evidence loader / INSERT source CAS (green)

Commit `b038b09b3f6ff738a389d337af5828d661a7008c`,
branch CI 39153220945 (2,713 passed, 32 skipped, TypeScript,
ESLint, Vite build green), and isolated PostgreSQL 39153220879
(31/31 tests green) verified a bounded measured_at UTC envelope in
the shared body-metric loader / finalization source digest. This
limits unrelated historical rows and retains +14/-12 local-date
boundary records through a conservative two-day UTC safety pad.
Canonical JS local calendar eligibility is unchanged. In-window
corrections still block stale result INSERT; out-of-window old
measurements are not a reason to invalidate the read-time digest.
No schema migration, owner data/model call or deployment took place.
No latency improvement has been measured on real-world datasets.

Remaining PIQ-6.5/7 gates: realistic SQL EXPLAIN/performance on
synthetic staging; digest coverage after the INSERT statement;
Neon/Vercel independently isolated Auth QA, owner device signoff,
schema/backup/rollback, and explicit release approval (formal 0/9).
`main` remains unchanged.


## 2026-10-18 — PIQ-6.5 bounded supplement lifecycle status source (green)

Feature commit `58c3443c6af36e2189aba1624976299e8bb2db45`
and parameter-binding correction `c80f306b740e2e1a80b9932839b7817dcc683245`
passed full development-branch CI 39154167931 (2,713 tests,
32 skipped, TypeScript, ESLint, Vite production build) and isolated
PostgreSQL 16 CI 39154167935 (31/31 synthetic integration tests,
full migration chain through 0060). The initial feature-only database
run failed on the repeated supplement-ID SQL parameter; replaceAll
fixed that exact bind and final runs were separately green.

The canonical experiment-adherence status query now reads the latest
pre-window event per supplement plus all in-window lifecycle events.
Superseded earlier and future status rows are neither needed by
`resolveOccurrence` nor a reason to invalidate the write-time source
digest. Existing unique supplement/date constraint makes predecessor
selection deterministic. The same SELECT and properly remapped
parameters govern evidence loading and INSERT-statement CAS.
Unknown adherence is never manufactured as skipped. No schema,
owner data, Gemini, Vercel production or `main` touched.

Future tasks: assess performance of large schedule/adherence history
under realistic synthetic workloads, address remaining post-result
source correction semantics, and clear PIQ-7 independent-root
preview/auth, backup/rollback, schema and mobile owner acceptance.
READ COMMITTED CAS is not serializable multi-table isolation.
Formal owner-accepted PIQ phases 0/9.


## 2026-10-18 — PIQ-6.5 schedule-window intersection guard (green)

Commit `1a85d723955eaef522fa2c9879f07a828a625cb1` narrows
Lab experiment supplement schedules to effective intervals overlapping
the evaluated start/end date, inclusive of both edges and open-ended
schedules. The exact SQL and bounded scope are shared by evidence
loading and parent result INSERT source-digest CAS. Old disjoint or
future-starting schedule revisions do not trigger false source drift;
on-boundary schedule changes and prior-expired schedules edited to
overlap still invalidate a stale result. No missing dose is inferred
skipped. The same 12-position source scope is retained.

Validation: full CI 39155229781, TypeScript/lint/Vite build green,
2,713 tests passed (32 skipped, 359 passing test files); isolated
PostgreSQL 16 CI 39155229758, 31/31 synthetic integration tests green.
No new migration, paid provider, live owner read/write or main merge.
This establishes narrower source eligibility, not a measured query-
planner or real-user latency improvement.

Remaining release gates: real-scale isolated query-plan benchmarking,
post-finalization evidence correction semantics, 0057–0060 production
migration state/restore/rollback, separate QA Auth+DB, mobile owner
validation, owner usefulness review and explicit promotion approval.
Formal owner acceptance remains 0/9; never conflate green CI with
production qualification.


## 2026-10-18 — PIQ-6.5 saved-result evidence-drift warnings (green)

Commit `790bd43ff228cf579d785d57543ffee9eaf0eb2b`,
validated with branch workflow 39158711330 (2,714 passed,
32 skipped; TypeScript, ESLint and Vite build all green).
The existing read-only current-record outcome gate already hides
before/after values when the prespecified nutrition/sleep source-value
seal changes or coverage no longer matches. The main owner-visible
Evidence review status now separately reports source changes,
coverage changes, or unverifiable seals, with an accessible alert.
Invalid snapshots, changed implementations and withdrawn feedback
still take precedence. No historical result, feedback event, goal,
recommendation, schema or owner data is mutated or replayed.

Remaining concern: owner-feedback *write* readiness is separately
derived from snapshot/implementation state, not the new current
source-value drift signal. Do not assume all source-corrected results
are prevented from receiving new owner feedback until this is
explicitly reviewed and race-tested. The prior PostgreSQL 31/31
validation is for preexisting canonical/source-CAS tests; this
presentation-only patch ran full branch CI, no new PG gate.
PIQ-7 deployment separation, production schema/backup/rollback,
mobile owner UAT and full owner acceptance remain open (0/9).
`main` and production remain unchanged.


## 2026-10-18 — PIQ-6.5 follow-up feedback source-seal POST CAS (green)

Feature `a9460652842ea35cef97228efcd2dfbbc36c6775`,
source restoration `bde6a5cbc9758c2620441901dd2c00ea20d5fee9`,
and SQL parenthesis fix `82794792bbec26d297ccd84219afb6973c8f3aa6`
validate a previously missing owner-feedback POST gate. For recorded
or revised follow-up, the owner-only server verifies original sealed
prespecified nutrition/sleep values against current verified values,
rejects missing/changed source-value seals and coverage, detects
interleaved checksum drift across canonical reads, and checks that
same SQL projection once more inside the INSERT statement snapshot.
The existing feedback-version and implementation revision CAS remains
in place. Explicit withdrawal still works without a current source
seal; no audit event or experiment historical result is changed.

Final full CI 39161702219 passed 2,716 application tests (32 skipped),
360 passing test files, TS, ESLint and Vite build. Final independent
PostgreSQL 16 workflow 39161702170 passed 31/31 tests through all
60 synthetic migrations, including a stale-source INSERT rejection
and a current-source INSERT acceptance. Intermediate failed CI runs
were diagnosed and corrected; they are not part of final validation.
No live owner data, paid provider, schema migration, production
deployment, or `main` touched.

Remaining: detail GET still permits the feedback form display based
on snapshot/implementation readiness; the now-stricter POST can
return an accurate 409 when a post-finalization source correction
has occurred. Align owner read-side availability/wording later,
preserving no automatic historical replay. READ COMMITTED statement
CAS is not serializable isolation, and future data changes still
require review. PIQ-7 independent-root Auth/DB, backup/rollback,
owner mobile and usefulness UAT, production migration state and
explicit release approval remain pending; formal acceptance 0/9.


## 2026-10-18 — PIQ-6.5 read-side owner feedback availability aligned (green)

Code commit `da138d963167c92c5a1686b4455ca19e425661e5`.
Branch CI 39163141086 passed 2,720 tests (32 skipped),
361 passing test files, TypeScript, ESLint and Vite build.
Isolated PostgreSQL 16 workflow 39163141148 passed 31/31
integration tests on disposable fully migrated synthetic schema.
No schema or write-path changes in this pass.

The saved-result GET now derives the optional follow-up form's
readiness from its *already verified* bounded nutrition/sleep current
outcome comparison. If the original source seal is absent or cannot
be confirmed, or if source values/verified observation days changed,
the owner sees an explicit accessible source-evidence warning and no
Save/Revise button. An existing answer can still be withdrawn.
Higher-priority protocol, implementation and maturity reasons retain
precedence. No extra GET source queries or provider calls.

Server-side feedback POST remains the canonical authority: it
independently verifies original source values and checks a matching
digest in the INSERT statement snapshot. Concurrent changes after
GET still require a 409; a stale already-open page may need an
explicit refetch after a failed submission. This does not establish
serializable isolation nor persistent physiological applicability.

Next priority: PIQ-7 release readiness: independent nonproduction
Auth/DB root, isolation, staging/restore/rollback, migration 0057-0060
production-state inspection, cost/latency, real-mobile QA, owner
question usefulness and explicit release acceptance. No production
deploy/migration or main merge. Formal owner acceptance 0/9.


## 2026-10-18 — PIQ-7 exact-SHA dual-CI metadata qualification

Preview metadata now requires independent exact-commit green application
workflow **and** exact-commit green isolated PostgreSQL workflow.
Only a GitHub-Actions-sourced record for
`.github/workflows/piq1-postgres.yml` with matching 40-hex
candidate HEAD, completed/success, is eligible. This never grants
owner-data access: `metadata_consistent_not_authorized` retains
runtime DB/Auth identity, empty-owner provenance, migration/backups
and explicit human-approval holds.

The PG workflow trigger list now includes all `migrations/**`,
`server/lab/**`, `server/backup/**`, plus PIQ preview metadata
qualification code/tests, not only prior hardcoded migration names.
Workflow dispatch is available for exact release candidates with no
triggering changes; a prior SHA's green run does not satisfy this rule.
Initial branch CI 39164164588 found a missing postgresCi record in
an older *synthetic* independent-root test fixture. Fix `59e6dabb`
updated that fixture; initial isolated PG CI 39164164631 was green.
Consult latest commit run statuses for final validation.

Read-only Vercel project metadata showed a READY PIQ preview
deployment pinned to the prior `da138d9` SHA, not the current
candidate. Read-only Neon QA metadata showed ready root and
snapshot-validation child, but no authorized runtime connection,
clean owner data, Auth/session QA or backup/restore proof. No production
mutation or owner health data access. Release and formal 0/9 owner
acceptance remain blocked; no `main` merge.


## 2026-10-18 — PIQ-7 partial Lab archive/replay and failed restore rollback

Added a synthetic, real PostgreSQL 16 recovery test: archive fictional
protocol/experiment/implementation revisions/immutable result snapshot/
append-only feedback+withdrawal, verify checksums/FKs, clear fixtures by
SAVEPOINT rollback, replay actual restore SQL into an empty Lab subset,
force an error late in the write batch, rollback all attempted inserts,
then replay successfully and check restored canonical values, hash,
immutable mutation triggers and refusal to merge with existing rows.
Migration-seeded data_sources are deliberately untouched. Initial PG
workflow for `fa77212` passed 32/32. Refer to final HEAD's exact-SHA
app and database workflows for completed gate validation.

This is NOT a full `backup:restore --apply` onto a separate fresh
Neon root, not a whole-schema integrity or encrypted-backup rehearsal,
and does not validate production migration 0057–0060/rollback.
No production DB/owner row/Auth access, no deployment or main merge.
PIQ-7 isolated QA environment + separate Auth, privacy/backup/recovery
proof, iPhone/iPad UAT, model-cost and usefulness acceptance remain
outstanding; formal phase acceptance 0/9.

## 2026-10-18 — PIQ-7 secure local backup creation (pending CI)

CLI `backup:create` now validates its full archive *before* saving, uses exclusive owner-only file creation (`wx`, `0600` on Unix), and refuses existing paths and symlinks. Synthetic filesystem tests cover the private mode, malformed input, no-clobber semantics and link protection. Existing full/portable archive format, backup API, and restore transaction are unchanged. This does not encrypt backups or prove full recovery. Check exact-SHA full and PG workflow after commit. No production/main/DB changes. PIQ-7 QA environment/Auth/migration/backup acceptance and 0/9 owner acceptance stay pending.


## 2026-10-18 — PIQ-7 private backup atomic name publication (CI pending)

CLI backup:create writes the verified full archive into a random private same-directory temporary file, flushes it, and uses an exclusive hard link to expose only complete bytes without overwriting. The temporary entry is removed on ordinary success/error. Synthetic tests cover invalid input, owner-only mode, existing output, symlink, concurrent writers and no temporary leftovers. Hardlink-incompatible filesystems fail rather than degrade. Crashes can leave private partial files; encryption/directory durability are not guaranteed. No database/API/migration/owner/provider/production changes. Await exact-SHA full and PG CI. PIQ-7 and owner acceptance 0/9 remain pending.


## 2026-10-18 — PIQ-7 owner Settings export uses one snapshot (CI pending)

The owner-only backup export now generates full and portable options from one migration-checked readBackupTables repeatable-read transaction. A large full archive no longer triggers another entire database read at a different point in time. Preserves size threshold, table selection, archive format and existing full-CLI path. Synthetic regression verifies the single transaction, source parity, time zone, portable exclusion and incorrect schema rejection. No Auth, migration, production or paid-model changes. Await exact-SHA full and isolated PG CI and formal release gates.


## 2026-10-18 — PIQ-7 PostgreSQL 16 + 18 CI parity (CI pending)

Read-only provider metadata and SQL on the separate QA root confirmed PostgreSQL 18.6, 56 ordered applied migration-history rows through 0056. Before this patch the isolated all-60-migration fixture tested only PG16. Workflow now runs the identical dedicated local synthetic integration suite in independent PG16 and PG18 GitHub job matrix, with fail-fast disabled so both produce evidence. Candidate dual-major validation is required for green PG CI. No persistent QA migration, credentials, copied owner records, production/main or model calls. Release gates still outstanding (QA 0057–0060, independent runtime Auth/DB isolation, recovery, iOS UAT, owner 0/9 acceptance).


## 2026-10-18 — PIQ-7.2b staged 0056→0060 upgrade verification (CI pending)

Added tests/piq7-incremental-upgrade-postgres.integration.test.ts to the dedicated localhost piq_fixture PG16+PG18 workflow. On a separate disposable schema it applies first 56 real migrations, seeds a fictional Health Profile and Lab result, verifies pending exact prefix, proves failed 0057 DDL/history transaction leaves no partial schema, then applies 57–60. It asserts old records survive, no owner claims are backfilled and new append-only triggers work. All fictional new-event writes are rolled back. QA Neon and production remain untouched; authorization, Auth/DB runtime binding, recovery and owner acceptance 0/9 remain gating.


## 2026-10-18 — PIQ-7 complete source-to-fresh-destination backup/restore suite (CI pending)

Synthetic PG16 and PG18 real-SQL backup: two independently migrated disposable localhost-only schemas, fictional owner/profile/nutrition/Lab provenance, full checksum/table inventory, mid-restore transaction failure rollback, successful archive content parity and second restore refusal. Calls the actual Health service rather than simulating insert plan only. No persistent QA Neon, production, auth records, offsite encryption or owner acceptance. Exact SHA workflows must be checked before green.


## 2026-10-18 — PIQ-7 schema-to-backup inventory drift gate

Added pure backup catalog coverage audit, exercised against actual fully migrated local PG16 and PG18 schemas. CI fails if migration-added public tables or columns are absent from full Health backup inventory, or if inventory references missing schema names. Negative tests create and roll back a synthetic new table/column and prove detection, without touching production/QA. The separately isolated QA root (0056) was checked using metadata-only public table/column names: no inventory omissions in the 0056 schema. Real backup recovery, owner Auth isolation, QA migration and owner acceptance remain separately gated.


## 2026-10-18 — PIQ release gate and deferred Body unit UX (validation pending)

The isolated QA project is at migration 0060 (PG18.6); 76 nonseeded app tables still empty, 70 migration seed records. Branch-only Vercel DATABASE_URL updated using verified QA Neon endpoint; exact-preview SHA needs upkeep after each new push; branch QA Auth trusted preview alias. QA cookie secret remains blocked, no real QA owner login or independent production owner identity, Vercel deployment protection denies runtime verification. PIQ owner API 503 hardlock must remain. Working patch supports Body circumference cm/in select, inch fractions and precise edit roundtrip; no data model or migration changes. CURRENT_TASK and QA handoff refreshed from obsolete I10/0049 state. This checkpoint does not authorize production/main promotion or owner testing (0/9).


## 2026-10-18 — PIQ8 Settings accordion polish (exact-SHA CI pending)

Settings' nine long sections are collapsed by default with native keyboard-operable `<details>/<summary>` controls; opening a section mounts its content on demand. A deep-linked target (Health Profile, AI Usage, Theme Studio, Trend Colors and nested owner-note/physiology/height controls) expands the right group automatically; the existing Ask Health owner-note correction handoff expands Health Profile rather than hiding the correction form. Section content, save handlers, canonical health data and PIQ preview owner-API 503 hardlock are unchanged. Added deterministic deep-link and server-rendered collapsed/expanded accessibility checks. No SQL migration, Vercel env writes, production/main promotion or owner data access. Must verify branch validation on exact SHA; owner acceptance remains 0/9.


## 2026-10-19 — PIQ8 completed photo pending-card cleanup (CI pending)

Diagnosed a likely cause of approved photo captures lingering on Nutrition: a freshly launched meal or label capture has `panel.jobId` absent because the actual persisted photo job is created inside the sheet. Approval/discard callbacks filtered only by `panel.jobId`, so the completed card survived, and capture polling stops after jobs leave queued/processing. Forward the *actual* job ID from Meal/Label review on log, save-only, and discard to the parent, and remove the matching pending card, with fallback for a reopened pending card and no clearing of unrelated jobs. Added deterministic job-resolution regression and callback-wiring assertions. No SQL migration, provider AI calls, production data, or PIQ API unlock. Requires exact-SHA full CI and eventual mobile owner verification before marking UX accepted.


## 2026-10-18 — PIQ8 three prestige palettes (CI pending)

Three distinct unlockable palettes at Levels 21–23 with light/dark CSS, Theme Studio previews, bootstrap allowlist and progression regression tests. No migrations/model calls. QA preview hardlock and 0/9 owner acceptance remain unchanged.


## 2026-10-19 — Persist Pantry-only Meal Photo approval (CI pending)

Additional regression revealed that meal-photo AI review saved to Pantry without a Nutrition log did not mark its capture job committed, so the card could reappear after refresh. The reusable-food API now accepts a *strictly optional* meal-photo job ID only for the save-only path. The server checks the job kind/status before creating a food, creates or reuses the canonical food as before, and atomically changes an eligible completed photo job to committed with `food_id` and null `entry_id`. A concurrent meal log cannot be overwritten, and retries for the same saved meal/job are idempotent. Original capture remains available rather than being deleted. Generic description saves and regular meal logging remain unchanged. Added mocked SQL tests for commit, retry and malformed/orphan ID no-write. No migration, owner data, paid AI requests, QA 503 unlock, or production promotion. Requires exact-SHA CI and mobile acceptance.


## 2026-10-18 — Read-only Preview qualification checkpoint

Connector inspection of Vercel project `prj_KNUk1CcJbYjQbSkADSHSuynhpZJU` returned 37 Preview variables explicitly scoped to `piq/00-baseline-20261014` (variable names, targets and types only; no secret values inspected). These include DATABASE_URL, NEON_AUTH_BASE_URL, test-owner binding, expected Neon identity and optional binding-enforcement controls. This **does not** attest the effective values injected into a particular deployment, independent Auth tenant/session ownership, or runtime DB identity. No enforcement toggles, auth credentials or deployment variables were changed.

The most recent inspected READY Preview was `dpl_AzmiLqDA4tQB8urQZWt4NuSj7gZL` on `1b7350b01352c9c2961f847457e02a5b16efaba5`; GitHub compare found the PIQ development branch 3 commits ahead at inspection. Thus this deployment is not a candidate for current-HEAD acceptance. The independently configured QA Neon branch `br-crimson-cloud-akrf5kuo` in `lively-wave-25801832` reports `ready` and is the designated isolated QA root, but provider branch metadata alone cannot establish actual Vercel runtime binding or Auth/owner-row isolation.

**Hard stops retained:** no PIQ 503 API unlock, owner login/tests, real health data or model calls, production migration, main merge or release. Next is authorized, credential-safe runtime attestation on the exact deployment SHA and proof of isolated Auth/owner access; do not infer success from env-variable scope or Vercel READY. Formal owner acceptance remains 0/9.


## 2026-10-18 — exhaustive QA row-count read and changed Auth-user gate

Following the PIQ-7 full non-seeded table census safeguard, an authorized read-only Neon query on the *separate* QA root `lively-wave-25801832 / br-crimson-cloud-akrf5kuo / neondb` counted exactly **76 non-seeded application tables** against the repository's 80-table backup inventory (four seeded). **All 76 reported zero rows**. No private row content was selected. Schema history returned 60 distinct migrations, from 0001 to 0060. This independently supports emptiness of ordinary QA Health application tables, **not** a Vercel runtime connection attestation.

Crucially, a separate counts-only Auth query returned **one** `neon_auth.user` and **zero** `neon_auth.session` records. Older handoff language claiming zero QA Auth users is no longer current. Do not read account details, presume this is a disposable/test-only identity, or treat the previous independent-root proof's `authUserCount:0` requirement as satisfied. No Auth identity was accessed or modified. Check the provenance of the QA identity using an authorized, privacy-preserving verification before relaxing a gate. The PIQ hard 503 owner API lock remains active. Owner acceptance 0/9, no production/main change or migration.
