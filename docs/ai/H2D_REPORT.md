# V2-H2D — Goals + Training Measurement Expansion + Lightweight Routines

Completed 2026-09-29.

## Summary

H2D expands canonical Training so Health can represent distance, continuous distance+duration, derived pace, and binary skill achievement. Those facts now drive first-class Training Goals, distance/pace Stretch Quests, derived Training bests, and Saved Routines.

No XP was implemented.

## Migration

New migration: `0038_training_measurements_goals_routines.sql`.

Repository migration head is 0038. It was applied only to disposable PostgreSQL 14 during validation. It was **not** applied to the owner's production database during implementation.

Schema changes include:
- new Training measurement kinds: distance, distance_duration, completion
- performance type skill
- `workout_sets.distance_m` and `workout_sets.completed`
- five Training Goal kinds plus `goals.training_min_distance_m`
- `workout_templates.origin_kind` and `updated_at`
- one-active-owner-routine database invariant
- EX18 Running and EX19 Hiking

## Training measurements

Distance is stored canonically in meters. Owner input uses explicit mi/km and converts at the Training boundary.

Pace is never stored. It is derived as seconds per mile from one qualifying set containing both distance and duration. Different sets are never combined.

Completion is explicit binary evidence: true is achieved; false is an attempt.

Generic reps performance is limited to unloaded/bodyweight semantics. Loaded strength continues to use e1RM.

Workout editor/detail support the new fields, friendly pace/distance presentation, and derived Training bests with source-workout links. No PR table, pace cache, or PR boolean was added.

## Goals

Added `training_reps`, `training_duration`, `training_distance`, `training_pace`, and `training_skill`.

Pace Goals store a stable minimum continuous distance in canonical meters as selector identity. Target revisions cannot change that selector.

Goal evidence is recomputed from current canonical Training on request and includes exact source session/set/raw evidence. Training edits/deletes therefore change current Goal evidence on the next read.

New Training Goal kinds intentionally return not-applicable from `goal-projection-v1`; existing body/e1RM projections are unchanged.

## Stretch

Added distance and pace strategies while preserving H2B lifecycle, cooldown, safety, freshness, and exact provenance.

Distance target:
- +5%
- round upward to 0.05 mi
- minimum +0.05 mi
- fail closed if rounding/minimum would breach 110%

Pace target:
- baseline one-set distance+duration of at least 0.50 mi
- 2% faster
- round down to whole sec/mi
- completion must cover at least the frozen baseline distance

Matching Training Goals can influence deterministic relevance. Binary skills intentionally do not auto-generate Stretch challenges without a progression hierarchy.

## Running, Hiking, and Coach

EX18 Running and EX19 Hiking are built-in canonical Training definitions using distance_duration.

Future Coach Run/Hike manual logs now write duration and supplied distance into normal ad-hoc Training while preserving Coach provenance. Historical records are not rewritten. Apple workouts remain Activity only.

## Saved Routines

Saved Routines reuse `workout_templates`.

- seeded A/B/C are immutable
- owner routine code is stable opaque `owner:<uuid>`
- first version is 1
- revise atomically deactivates current and creates a new immutable numeric version
- archive deactivates current
- stale/inactive revisions fail
- database enforces one active owner version
- historical sessions stay pinned to their exact old template/version
- no physical template delete

Routine prescriptions are measurement-aware and server-validated.

The Training UI now provides Built-in / Saved / Empty start paths plus a lightweight routine manager for ordered exercises, planned sets, prescriptions, revisions, and archive.

## Backup/export

Backup schema head is 0038. Full/portable round-trip coverage includes new Training set fields, pace Goal selector identity, and Saved Routine origin/version fields. Portable Goal labels understand the new exercise-backed Goal kinds.

Derived pace and PR values are not backed up because they are not stored.

## Review fixes

Final review corrected several issues before publication:
- repaired an accidental TypeScript block embedded inside Saved Routine revision SQL
- made Empty Workout genuinely ad-hoc and load the exercise catalog
- removed a silent distance-unit fallback
- restricted generic reps Goals/performance to unloaded semantics
- made Goal revisions use friendly duration/pace/skill controls
- added Saved Routine prescription semantic validation
- constrained pace Goal thresholds to whole sec/mi
- added visible, derived Training bests

## Validation

Validated production/test code commit: `062ba51a2043d18f884e48f2374dbbe463f5a7f8`.

GitHub Actions run `36650042103`:
- Ubuntu
- Node 22
- PostgreSQL 14
- America/Phoenix
- `npx tsc -b`: passed
- `npx eslint .`: passed
- `npm run build`: passed
- `npm test`: **135 files passed; 1,270 passed, 1 skipped (1,271 total)**

The suite applies 0038 to disposable PostgreSQL and validates the new constraints/invariants.

## QA limitation

No authenticated production browser or production database was used. UI/component/static regression covers narrow/mobile-safe controls and the shared reduced-motion contract. Production migration 0038 remains the post-publication deployment step.

## Next phase

H3 — XP / Reward Wallet:
- append-only reward ledger
- Lifetime XP and Spendable XP
- calibrated issuance from auditable canonical completion events
- reward wallet/purchases

Automatic skill Stretch progression remains deferred until a deterministic skill hierarchy exists.
