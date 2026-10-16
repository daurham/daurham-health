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
