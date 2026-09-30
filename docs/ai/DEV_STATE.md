# Dev state

Snapshot recorded 2026-09-29 after **V2-H2D — Goals + Training Measurement Expansion + Lightweight Routines**, on top of H2A/H2B/H2C Coach. This is the current health application.

## Git and runtime

- Branch: `main` after H2D publication; package version remains 1.0.0.
- No new runtime dependency, provider request type, scheduler, or Vercel function was added.
- H2D remains deterministic/provider-free except the already-existing explicit workout-photo transcription path.
- Full implementation/validation details are in `docs/ai/H2D_REPORT.md`.

## Schema and deployment

- Migration head: `0038_training_measurements_goals_routines.sql`.
- Production is currently applied through `0037_coach_lab_snoozes.sql`; **0038 is pending owner deployment**.
- `exercise_definitions.measurement_kind` now supports `distance`, `distance_duration`, and `completion` in addition to the existing reps/duration families.
- `exercise_definitions.performance_type` adds `skill`.
- `workout_sets` adds canonical `distance_m` and `completed`. Distance is meters; duration remains seconds; pace/PR flags are not stored.
- `goals` adds `training_min_distance_m` and the Training Goal kinds `training_reps`, `training_duration`, `training_distance`, `training_pace`, and `training_skill`.
- `workout_templates` adds `origin_kind = seeded|owner` and `updated_at`; a partial unique index permits only one active owner version per routine code.
- Built-in EX18 Running and EX19 Hiking are canonical no-load `distance_duration` Training definitions.
- Backup/full and portable inventory head is 0038 and includes new set fields, Goal selector state, and Saved Routine origin/version fields.

## Canonical Training measurements

- Existing reps, duration, per-side reps/duration, load semantics, programmed/ad-hoc/experiment session types, and imported workout behavior remain intact.
- Distance-only observations use `distance_m > 0`.
- `distance_duration` requires duration for its performance observation and may additionally store distance. Duration-only running/hiking remains representable; pace/distance analytics require known positive distance.
- `completion` records explicit `completed = true|false`; false is an attempt, not achievement.
- Public/manual UI accepts miles or kilometers and converts once at the Training boundary to meters. A supplied distance requires an explicit unit.
- The editor shows distance/unit controls, distance+duration with a derived pace preview, and Achieved/Not yet for completion. Irrelevant weight fields are hidden for no-load distance/skill exercises.
- Workout detail formats distance, duration, pace, and skill state and shows **derived Training bests** for reps, duration, distance, pace, and skill achievement, with links to source workouts.
- Derived bests are recalculated from current canonical Training on read; deleting/editing source Training changes the next result.

## Shared performance authority

- `src/domain/progress/training-performance.ts` is the shared reps/duration/distance/pace/skill authority.
- Qualifying performance comes from canonical `programmed`, `ad_hoc`, or `experiment` working sets.
- Per-side reps/duration use the lower completed side for performance; they are never summed for bests.
- Generic reps performance is limited to unloaded/bodyweight semantics. Loaded strength remains governed by e1RM.
- Distance compares canonical meters and displays miles.
- Pace is seconds per mile derived from one set's distance + duration; lower is better. Values from different sets are never combined.
- Skill best exists only when a qualifying set has `completed = true`.
- Exact session/session-exercise/set provenance and raw source fields remain available to Goals, Stretch, and Training best presentation.

## Training Goals

- New first-class point-performance Goal kinds:
  - `training_reps` — at least whole reps.
  - `training_duration` — at least seconds; UI uses minutes/seconds.
  - `training_distance` — at least miles; canonical evidence converts meters.
  - `training_pace` — at most whole seconds/mile, with a stable positive `training_min_distance_m` selector.
  - `training_skill` — fixed one-completion target.
- Goal creation filters to compatible exercise semantics and fails closed server-side on incompatible selectors.
- Pace minimum distance is Goal identity and cannot change in a target-version revision.
- Goal evidence is read from canonical Training at request time and carries source session/set/raw values plus the derived pace when applicable.
- Training edits/deletes automatically alter current Goal evidence on the next read. Immutable Goal target versions remain unchanged.
- The existing `goal-projection-v1` remains projectable only for body/e1RM. New Training Goal kinds intentionally return `not_applicable`.
- Goal UI uses friendly distance/duration/pace/skill controls and links canonical Training evidence back to the source workout.

## Stretch Quest expansion

- H2B lifecycle, explicit acceptance, one-current invariant, eight-day cooldown, challenge windows, context suppression, pass/fail semantics, and exact provenance are unchanged.
- Stretch strategies now include `distance` and `pace` in addition to strength e1RM, reps, and duration.
- Distance baseline uses the existing two-appearance / 21-day latest / 42-day window rule. Target is +5%, rounded upward to 0.05 mi, minimum +0.05 mi, and fails closed above the 110% rounding cap.
- Pace baseline requires one-set distance+duration and at least 0.50 mi. Target is 2% faster, rounded down to a whole second/mile.
- Pace completion must cover at least the frozen baseline distance and meet or beat the frozen pace target in one post-acceptance canonical set.
- Active matching Training Goals may add deterministic Stretch relevance; a pace Goal's minimum distance must be satisfied by the relevant baseline.
- Binary skill Goals deliberately do not auto-generate Stretch challenges until a progression hierarchy exists.
- Future H2A Run/Hike manual quest logs now use EX18/EX19 and write supplied distance into canonical Training as well as retaining Coach provenance. Historical rows are not rewritten.

## Saved Routines

- Saved Routines reuse `workout_templates`; there is no parallel routine authority.
- Existing A/B/C rows are `seeded` and cannot be changed or archived through owner CRUD.
- Owner routines use stable opaque `owner:<uuid>` routine codes. Initial version is 1.
- Editing the current owner routine atomically deactivates it and creates a new immutable numeric version. Stale/inactive revisions fail. The database enforces one active owner version.
- Archiving deactivates the current owner version; no historical template row is deleted.
- Historical programmed sessions remain pinned to their original template id/version/name and can still be read/edited without switching template identity.
- Routine prescriptions are validated against exercise measurement families and reject invalid/mixed/range semantics.
- Training exposes a lightweight Saved Routines manager: name, ordered exercises, planned sets, compatible prescription, create/revise/archive.
- Start Workout is organized as **Built-in routines / Saved routines / Empty workout**. Empty Workout is the existing fully editable `ad_hoc` path.
- Training landing actions are Start workout / Manage routines / Import workout photo.

## Coach, Today, demo, and provider boundaries

- H2C's primary Coach hierarchy, Lab derivation/snooze rules, in-app canonical-change invalidation, and no-polling behavior remain intact.
- New Training and Goal mutations participate in existing Today/Coach refresh signaling where relevant.
- Routine definition changes do not manufacture Coach completion.
- Apple/Health Auto Export workouts remain Activity and are never Training performance evidence.
- Public demo remains anonymous, synthetic, read-only, and provider-free.
- H2D adds no Gemini, Home-AI, Europe PMC, or AI-ledger call. Existing explicit workout-photo Home-AI behavior is unchanged.
- H2D adds no XP or reward issuance.

## Validation and QA

- Final validated production/test code commit: `062ba51a2043d18f884e48f2374dbbe463f5a7f8`.
- GitHub Actions run `36650042103`, Ubuntu / Node 22 / PostgreSQL 14 / America/Phoenix:
  - `npx tsc -b`: passed
  - `npx eslint .`: passed
  - `npm run build`: passed
  - `npm test`: **135 test files passed; 1,270 tests passed, 1 skipped (1,271 total)**
- Real PostgreSQL coverage applies migration 0038 in disposable PostgreSQL and verifies new set constraints, Goal selector constraints, Running/Hiking seeds, and active owner-routine version invariants.
- H2D-focused regression covers units, measurement families, performance evidence, all new Goal kinds, Goal UI semantics, distance/pace Stretch, skill Stretch deferral, Saved Routine contracts, Start Workout paths, backup round-trip, and Training-best presentation.
- No authenticated production browser click-through was performed. Mobile/touch/reduced-motion behavior is covered by markup/component/static regression and existing shared UI tests; production owner data/database were not used for implementation validation.

## Retained invariants and next phases

One-owner auth, Phoenix calendar, single Vercel function, Health-as-canonical-facts, immutable Goal versions, Lab authority, Apple Activity separation, Nutrition unknown-evidence semantics, backup/export integrity, Appearance, and shared motion remain active.

- **H3:** XP / Reward Wallet — lifetime + spendable XP, append-only reward ledger, calibration, and purchases.
- **H4:** Themes + progression polish.
- A future skill-progression model may add automatic skill Stretch strategies; H2D intentionally does not invent one.
