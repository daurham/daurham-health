# Current task

## Objective

Implement **V2-H2D — Goals + Training Measurement Expansion + Lightweight Routines**.

H2D expands what canonical Training can represent and what first-class Goals/Coach can understand before XP is introduced.

The product outcomes are:

1. Canonical Training can represent:
   - loaded/unloaded reps
   - duration
   - distance
   - distance + duration, with pace derived
   - binary skill/milestone completion
2. Goals can target:
   - reps
   - duration
   - distance
   - pace over a minimum continuous distance
   - a skill/milestone completion
3. Stretch Quests immediately gain trustworthy **distance** and **pace** strategies from the new canonical Training evidence.
4. The existing versioned Training-template architecture becomes a lightweight **Saved Routines** builder.
5. Starting a workout becomes a clear choice among:
   - built-in A/B/C routines
   - Saved Routines
   - Empty Workout
6. H3 can later attach XP to these canonical accomplishments without inventing a second measurement system.

H2D must preserve the core invariant:

> **Training stores observations. Derived performance, pace, PR status, Goal status, and Stretch eligibility are calculated from those observations.**

Do not store derived pace or PR flags in canonical Training rows.

## Current baseline

Start from the deployed H2C tree described in `docs/ai/DEV_STATE.md`.

Production schema is currently:

- `0037_coach_lab_snoozes.sql`

Relevant current architecture:

- `exercise_definitions.measurement_kind` supports:
  - `reps`
  - `duration`
  - `reps_per_side`
  - `duration_per_side`
- `workout_sets` stores reps/duration/per-side measurements and optional external load.
- `performance_type` already includes `distance`, but Training does not yet have a canonical distance field.
- canonical session types remain:
  - `programmed`
  - `ad_hoc`
  - `experiment`
- Apple/Health Auto Export workouts are Activity, not Training.
- loaded-rep strength uses the existing high-confidence Epley authority.
- H2B Stretch currently supports:
  - strength e1RM
  - unloaded reps
  - unloaded duration
- H2A run/hike manual quests can currently preserve optional distance only as Coach evidence; this is not a Training performance authority.
- first-class Goal kinds currently include body, e1RM, benchmark, frequency, steps, protein, sleep, and supplement adherence.
- Goal identity is stable; target changes create immutable `goal_versions`.
- Goal projections currently apply only to body metric and strength e1RM.
- `workout_templates` and `workout_template_exercises` already provide versioned programmed-workout structure.
- built-in A/B/C templates are seeded.
- the template API is currently read-only.
- programmed sessions snapshot template identity/name/version and cannot change to a different template after save.
- owner-created exercises exist and their measurement semantics cannot be changed after use.

## Migration

### 1. Add the next ordered migration

Add:

- `0038_training_measurements_goals_routines.sql`

The exact filename may vary only if another migration has legitimately landed first; preserve ordering.

The migration must cover the canonical schema changes in this task and become the backup inventory head.

Do not mutate the owner's production database during implementation.

## Training measurement model

### 2. Extend exercise measurement kinds

Add canonical measurement kinds:

- `distance`
- `distance_duration`
- `completion`

Existing kinds remain unchanged.

Meaning:

- `distance`: one continuous distance observation
- `distance_duration`: one continuous effort with duration required and distance optional; when both are present, pace is derivable
- `completion`: one explicit binary skill/milestone attempt/result

Do not add generic arbitrary-number measurements in H2D.

### 3. Extend canonical set observations

Add to `workout_sets`:

- `distance_m NUMERIC NULL`
- `completed BOOLEAN NULL`

Canonical units:

- distance is stored in **meters**
- duration remains stored in **seconds**
- pace is never stored; derive it from distance + duration

Update the measurement-family database constraint and application validation.

Allowed set shapes must include the existing families plus:

- distance only
- duration + optional distance for a `distance_duration` exercise
- completion boolean only

For all set shapes:

- measurement values must be finite and nonnegative/positive according to current conventions
- a row must not mix unrelated measurement families
- the service must verify that the set shape matches the selected exercise definition
- warmup/drop/other set types remain legal, but performance/Goal/Stretch evidence continues to use qualifying working sets only

For `distance_duration`:

- `duration_sec` is required for a completed observation
- `distance_m` is optional so a duration-only run/hike can still be recorded
- distance/pace analytics require `distance_m > 0`

For `completion`:

- `completed = true` represents achieved
- `completed = false` may preserve an attempted-but-not-achieved skill observation
- Goal satisfaction only treats `true` as achieved

### 4. Public/client Training request shape

Do not expose canonical meters as an awkward raw-only UI.

Add a repository-consistent request/draft shape that supports:

- distance value
- distance unit: `mi` or `km`
- duration seconds
- completion boolean

Convert distance to canonical meters at the domain/service boundary.

Response/detail models should expose canonical distance and a friendly display representation as appropriate, without inventing data.

### 5. Exercise definitions and analytics classification

Owner exercise creation must support the new measurement kinds.

Use deterministic analytics defaults:

- `distance` / `distance_duration`
  - `performance_type = distance`
  - no external-load analytics
- `completion`
  - add/use a clear `performance_type = skill` classification
  - no external-load analytics
- existing owner exercise behavior for reps/duration remains intact

Extend the database `performance_type` constraint with `skill` if required.

Used exercise definitions remain semantically immutable:

- rename may follow current rules
- changing measurement family/load/unilateral semantics after canonical use remains forbidden
- owner should create a new definition instead

### 6. Seed canonical Running and Hiking definitions

Add built-in definitions with stable external ids after the existing catalog:

- Running
- Hiking

Use:

- measurement kind: `distance_duration`
- load type: `none`
- performance type: `distance`
- analytics load type: `none`

These are canonical Training activities, not Apple Activity workouts.

Do not backfill Activity workout rows into Training.

### 7. H2A run/hike Coach logs

Update future H2A manual Run/Hike quest logging to use the canonical Running/Hiking definitions.

When the owner logs:

- duration only: save a valid canonical `distance_duration` Training set with duration and unknown distance
- duration + distance: save both duration and canonical distance on the Training set

The optional distance must no longer live **only** in Coach event evidence for new H2D logs.

Preserve Coach provenance as well.

Do not rewrite historical H2A Training or Coach rows.

## Shared Training performance authority

### 8. Create/extend deterministic performance helpers

Extend shared `src/domain/progress` helpers rather than calculating separately in Goals, Coach, and UI.

Add canonical observation helpers for:

- best reps
- best duration
- best distance
- pace from distance + duration
- skill completion

Each observation must preserve exact evidence:

- session id
- session-exercise id
- set id
- exercise id
- workout date
- source/capture chronology
- raw reps/duration/distance/completion
- relevant per-side interpretation

Reuse existing chronology and evidence helpers.

### 9. Reps semantics

For a qualifying reps observation:

- bilateral: use `reps`
- per-side: require both sides and use the lower completed side
- do not sum sides for a best/Goal/Stretch performance value
- loaded-rep strength exercises remain governed by e1RM for strength Goals/Stretch
- generic reps Goals should be limited to exercise semantics where reps alone are meaningful, such as bodyweight/unloaded reps

### 10. Duration semantics

For a qualifying duration observation:

- bilateral: use `duration_sec`
- per-side: require both sides and use the lower completed side
- `distance_duration` may also provide duration evidence
- session-level `duration_min` is not exercise-performance evidence

### 11. Distance semantics

Distance observations require:

- canonical Training session
- qualifying working set
- compatible `distance` or `distance_duration` exercise
- `distance_m > 0`

Distance PR/best compares canonical meters.

Owner display defaults to miles, with existing unit helpers or a new shared unit helper.

### 12. Pace semantics

Pace requires one **continuous set** with both:

- distance > 0
- duration > 0

Derive:

- seconds per mile for owner-facing Goal/performance comparison
- optional display `mm:ss/mi`

Lower pace value is better.

Never combine distance from one set with duration from another.

Do not infer pauses, moving time, or GPS truth that Training did not record.

### 13. Skill semantics

A skill/milestone observation is an exercise with `measurement_kind = completion`.

Evidence is the exact working set.

- `completed = true` = achieved
- `completed = false` = attempt only

Do not infer skill level from exercise name.

## Training UI

### 14. Workout editor inputs

Extend `WorkoutEditor` and draft validation for the new families.

Required UI:

- distance:
  - distance numeric input
  - mi/km selector
- distance + duration:
  - duration input
  - optional distance input
  - mi/km selector when distance is present
  - show derived pace preview only when both are valid
- completion:
  - clear Achieved / Not yet control

Keep touch targets and approximately 390 px layout usable.

Do not render irrelevant weight fields for no-load distance/skill exercises.

### 15. Workout detail/history presentation

Workout detail must display:

- distance in a friendly unit
- duration
- derived pace when both are known
- skill achieved/not achieved

Do not display pace when either source value is missing.

Existing reps/load/duration presentation remains unchanged.

### 16. Training PR/best presentation

Where the existing Progress/Training UI already shows exercise performance, extend it with the new shared authority where natural.

At minimum, Training exercise/history detail must be able to state canonical bests for:

- reps
- duration
- distance
- pace
- skill achieved

Do not create a giant new analytics dashboard solely for H2D.

## First-class Goal expansion

### 17. Add Goal kinds

Add:

- `training_reps`
- `training_duration`
- `training_distance`
- `training_pace`
- `training_skill`

Extend the database Goal-kind and selector-shape constraints.

All five use `exercise_definition_id`.

Add a nullable selector/config column for pace minimum distance, preferably:

- `training_min_distance_m NUMERIC NULL`

Rules:

- `training_pace` requires a positive minimum distance
- other Goal kinds must keep it null
- the pace distance is part of stable Goal identity, not a mutable target-version field

A different minimum distance means a different Goal.

### 18. Goal-kind compatibility

Validate exercise compatibility before Goal creation.

- `training_reps`:
  - reps/reps-per-side
  - reps alone must be meaningful
  - do not use loaded-rep strength exercises where e1RM is the established performance authority
- `training_duration`:
  - duration/duration-per-side/distance-duration
- `training_distance`:
  - distance/distance-duration
- `training_pace`:
  - distance-duration
  - positive configured minimum distance
- `training_skill`:
  - completion

Fail closed for incompatible existing exercises.

### 19. Goal targets and units

Use deterministic target contracts:

#### training_reps

- mode: `at_least`
- unit: `reps`
- positive whole-number target

#### training_duration

- mode: `at_least`
- canonical Goal unit: `sec`
- UI may collect/display human-friendly minutes/seconds

#### training_distance

- mode: `at_least`
- Goal display/storage unit: `mi`
- evidence converts canonical meters → miles

#### training_pace

- mode: `at_most`
- Goal target unit: `sec/mi`
- UI accepts/displays pace as `mm:ss/mi`
- target requires the Goal's configured minimum continuous distance

Example:

> Run  
> At least 2.00 mi  
> Pace target ≤ 10:00/mi

A qualifying set must cover at least 2.00 mi and have derived pace ≤ 600 sec/mi.

#### training_skill

- mode: `at_least`
- fixed target = 1 completion
- unit: `completion`
- UI should present this as “Achieve <skill>”, not a numeric form the owner has to type

### 20. Goal evidence

Goal evidence must be read from canonical Training at request time.

Do not cache PR/Goal current values.

Use:

- reps: best qualifying working-set reps
- duration: best qualifying working-set duration
- distance: best qualifying working-set distance
- pace: fastest qualifying pace among continuous sets meeting the Goal's minimum distance
- skill: latest/first qualifying completed=true observation as appropriate; current value is 1 once achieved, otherwise null/0 according to existing Goal missing-evidence semantics

Evidence must expose enough provenance for the Goal UI:

- exact source session
- source set
- observed date
- raw source values
- derived value for pace

Deleted/edited Training must change current Goal evidence on the next read.

Historical immutable Goal versions remain unchanged.

### 21. Goal status/projection

The existing deterministic Goal status engine must support the five new kinds.

All are point-performance Goals, not rolling aggregates.

Do **not** invent projections for them in H2D.

`goal-projection-v1` should return `not_applicable` for these new kinds unless this task explicitly implements a separately tested projection formula. Prefer no projection.

Existing body/e1RM projections stay unchanged.

### 22. Goal UI

Extend Goal creation/detail/revision copy.

Creation must filter exercises by compatible Goal kind.

Required friendly controls:

- reps: integer
- duration: human-friendly duration
- distance: miles
- pace:
  - minimum distance in miles
  - target pace as minutes + seconds per mile or equivalent mm:ss control
- skill: choose compatible skill exercise, no numeric target entry

Goal detail should show source Training evidence and link to the source workout when available.

Target revisions may change threshold/date/notes but must not change selector identity, including pace minimum distance.

## Stretch Quest expansion

### 23. Add distance Stretch strategy

Extend the existing H2B Stretch strategy registry with:

- `distance`

Eligibility:

- canonical distance/distance-duration Training evidence
- same H2B baseline freshness/appearance requirements:
  - at least 2 qualifying appearances
  - latest within 21 Phoenix calendar days
  - appearances within 42 days
- exact baseline source still required

Target:

- baseline distance × 1.05
- display in miles
- round **up** to nearest 0.05 mi
- minimum increase 0.05 mi
- suppress candidate if rounding/minimum would make target >110% of baseline

Completion:

- any post-acceptance qualifying continuous set for same exercise at or above frozen target distance

Preserve exact canonical meters/source in evidence even when UI displays miles.

### 24. Add pace Stretch strategy

Add:

- `pace`

Eligibility:

- canonical `distance_duration` evidence
- at least 0.50 mi in the baseline observation
- same H2B two-appearance/freshness rules
- pace calculated from one set only

Baseline:

- best/fastest eligible pace
- freeze the baseline observation's distance as the minimum comparison distance

Target:

- 2% faster than baseline pace
- unit `sec/mi`
- round **down** to the next whole second per mile so rounding never makes the challenge easier
- target must remain positive

Completion requires one post-acceptance set that:

- is the same exercise
- covers at least the frozen minimum distance
- has pace <= frozen target

UI example:

> Current best: 10:11/mi over 2.13 mi  
> Target: 9:58/mi over at least 2.13 mi

Do not prescribe speed, heart rate, or medical exertion.

### 25. Skill Stretch behavior

Do **not** auto-generate Stretch Quests from binary `completion` skills in H2D.

A binary milestone has no deterministic “2–5% harder” next target without a progression hierarchy.

Training Skill Goals are first-class now; automatic skill Stretch progression is explicitly deferred until a future progression model exists.

Record this as a deliberate decision, not an omission.

### 26. Goal relevance in Stretch ranking

Extend Stretch relevance so active matching Goals can prioritize:

- training_reps
- training_duration
- training_distance
- training_pace
- existing strength_e1rm

Goal relevance never creates evidence by itself.

A pace Goal's minimum distance must be respected by any Goal-relevant pace candidate.

### 27. Existing Stretch safety/lifecycle unchanged

Preserve:

- explicit accept
- one current Stretch
- 8-day offer cooldown
- offer/challenge windows
- context suppression
- pass/fail semantics
- exact completion provenance
- no XP yet

## Saved Routines

### 28. Reuse the existing template system

Do not create a parallel “routine sessions” model.

`workout_templates` remains the programmed-routine authority.

Extend it with explicit origin/state sufficient to distinguish:

- seeded/built-in templates
- owner Saved Routines

Add an explicit template origin column, e.g.:

- `origin_kind = 'seeded' | 'owner'`

Existing rows migrate to `seeded`.

Add/update timestamps if needed for safe management.

### 29. Stable owner-routine identity and immutable versions

Use existing `routine_code + version` semantics.

For an owner Saved Routine:

- generate a stable opaque routine code, e.g. `owner:<uuid>`
- first version is `1`
- editing creates a **new workout_template row/version**
- old version becomes inactive
- existing workout sessions keep their old template id/name/version snapshot
- never rewrite a historical template row used by sessions

Owner does not need to see the opaque routine code.

Seeded A/B/C templates remain immutable through owner CRUD.

### 30. Saved Routine contents

A Saved Routine includes:

- name
- ordered exercise slots
- exercise definition
- planned set count
- prescription matching the exercise measurement family

Prescriptions must support:

- reps
- reps per side
- duration
- duration per side
- distance
- distance + duration
- completion

Keep the builder lightweight.

Do not add periodization, supersets, rest timers, RPE programming, automatic progression, or calendar scheduling in H2D.

### 31. Routine API

Extend owner-authenticated Training template routes for:

- list
- create owner routine
- revise current owner routine → new version
- archive current owner routine

Use repository-consistent HTTP semantics.

Suggested contract:

- GET `/api/training/templates`
- POST `/api/training/templates`
- PATCH `/api/training/templates/:id`
- DELETE or archive action for `/api/training/templates/:id`

Physical delete is not required; archive is preferred.

Requirements:

- seeded templates cannot be edited/archived through owner routine endpoints
- stale edits to an inactive historical owner version fail cleanly
- concurrent revisions cannot create two current versions
- archive preserves historical versions/sessions
- no provider calls

### 32. Routine builder UI

Add a Training Saved Routines management surface.

At minimum:

- list current owner routines
- create
- rename/edit
- reorder exercises
- add/remove exercises
- planned sets
- basic prescription
- archive

Reuse the existing exercise picker/catalog and owner exercise creation where practical.

Do not require editing JSON.

### 33. Start Workout UX

Change the programmed-workout chooser into a clear start flow:

> **Built-in routines**  
> A / B / C

> **Saved routines**  
> <owner routines>

> **Empty workout**

Empty Workout creates the existing `ad_hoc` draft/session path.

The Training landing page should expose:

- Start workout
- Manage routines
- Import workout photo

Do not remove ad-hoc Training semantics.

### 34. Programmed workout integrity

Starting from either built-in or Saved Routine creates a normal `programmed` session.

Preserve:

- template id
- routine code
- template version
- template name
- slot ids
- exercise snapshot names

Editing a saved workout later must not switch it to another template version.

Historical sessions remain readable if the Saved Routine is revised or archived.

## Coach / Today integration

### 35. Coach refresh after Training/routine changes

Current H2C canonical-change signaling remains authoritative.

New Training set measurements, Goal mutations, and routine CRUD must trigger the correct existing in-app refresh behavior where they can affect Today/Coach.

Routine definition changes alone do not manufacture Coach completion.

Do not add polling.

### 36. Daily/Weekly Quest behavior

Do not invent a large new Daily Quest registry in H2D.

Existing H2A daily/weekly behavior remains valid.

However:

- canonical Training created through new measurement families must count toward existing training-frequency rules
- matching new Training Goals may be used as deterministic Goal relevance/context where current Coach architecture already supports it
- Stretch is the primary H2D Coach expansion

## Demo / auth / provider boundary

### 37. Owner-only writes

New:

- routine CRUD
- new Training measurements
- Goal creation/revision

remain owner-authenticated under the existing single Vercel function architecture.

Preserve:

- anonymous 401
- non-owner 403
- method validation

### 38. Demo

Public demo remains:

- anonymous
- synthetic
- read-only
- provider-free

If demo data shows distance/pace/skill/routines, it must be compiled synthetic data.

Do not expose owner routines or hit owner APIs from demo.

### 39. Provider boundary

H2D is deterministic and provider-free.

Do not call:

- Gemini
- Home-AI, except existing explicit workout-photo transcription flows that already use it
- Europe PMC

Do not add an AI request type for Goals, routines, performance, or Stretch.

## Backup/export

### 40. New canonical fields round-trip

Update backup/portable inventory for:

- new workout-set distance/completion fields
- Goal selector/config fields
- new Goal kinds
- template origin/version-management fields

Historical and current Saved Routine versions must round-trip.

Derived pace/PR values are not backed up because they are not stored.

## Non-goals

Do not implement in H2D:

- XP
- spendable/lifetime XP
- reward wallet
- purchases
- levels/ranks
- theme unlocks
- streak economy
- automatic skill-progression Stretch Quests
- GPS routes/maps
- Apple workout → Training conversion
- automatic pace from Activity
- moving-time inference
- heart-rate-zone prescriptions
- automatic routine progression
- calendar scheduling
- rest timers
- supersets/circuits as first-class structures
- arbitrary custom metric schemas
- Mind tab
- notifications/background jobs

H3 remains the next phase after H2D.

## Existing behavior that must remain unchanged

- H2A Coach task lifecycle and manual/self-report semantics, except future Run/Hike distance now becomes canonical Training when provided
- H2B Stretch accept/pass/fail/cooldown/safety/provenance
- H2C Personal Lab attention/snooze/priority behavior
- current e1RM authority
- existing body/e1RM Goal projections
- immutable Goal versions
- Goal deletion/archive rules
- Personal Lab
- Apple workouts remain Activity only
- experiment Training linkage
- imported workout-photo workflow
- programmed/ad-hoc/experiment session types
- built-in A/B/C history
- owner exercise used-definition immutability
- Phoenix calendar
- demo isolation
- backup/export integrity
- reduced-motion behavior

## Edge cases

Cover at least:

### Training measurements

- distance only
- distance + duration
- duration-only record for distance-duration exercise
- mi conversion
- km conversion
- zero/negative distance rejected
- pace with missing distance
- pace with missing duration
- completion true
- completion false
- measurement-family mismatch
- unrelated fields mixed into a set rejected
- per-side existing semantics unchanged
- edit/delete recomputes derived bests

### Goals

- compatible/incompatible exercise selection for each new kind
- reps Goal
- per-side reps Goal
- duration Goal
- per-side duration Goal
- distance Goal
- pace Goal with minimum distance
- pace evidence below minimum distance excluded
- pace exact target
- faster/slower target
- skill missing
- skill attempted false
- skill achieved true
- Training deletion/edit changes evidence
- target revision preserves selector/minimum-distance identity
- new kinds return projection not-applicable
- existing Goal kinds unchanged

### Stretch

- distance baseline/target rounding
- distance cap
- distance exact/above/below target
- pace baseline minimum 0.5 mi
- pace target rounds harder
- pace attempt too short excluded
- pace exact/faster/slower
- Goal relevance
- two-appearance/freshness rule
- exact source deletion behavior
- existing strength/reps/duration unchanged
- completion skills do not generate Stretch candidates

### Routines

- list seeded A/B/C
- create owner routine
- create with new measurement prescriptions
- revise owner routine creates version 2
- old version remains unchanged
- old programmed session remains tied to old version
- archive owner routine
- archived routine not offered for new workout
- seeded routine edit/archive rejected
- stale/inactive owner version edit rejected
- concurrent revision safety
- duplicate positions/slots rejected
- inactive exercise handling
- empty routine validation
- mobile builder

### Coach Run/Hike

- duration-only run quest logs canonical Training
- duration + miles logs canonical distance
- duration + km logs canonical distance
- Coach completion semantics unchanged
- historical Coach evidence remains readable

## Tests required

Add focused coverage for every new authority and mutation.

At minimum:

1. **Training domain tests**
   - new measurement schemas
   - unit conversion
   - measurement-family coherence
   - distance/pace helpers
   - completion helper
   - evidence provenance

2. **Training service/API tests**
   - create/edit/read/delete new measurements
   - Running/Hiking definitions
   - owner exercise new kinds
   - auth/method boundaries

3. **Goal domain/service/API tests**
   - five new kinds
   - selector constraints
   - target/unit rules
   - canonical evidence
   - pace minimum distance
   - edit/delete recomputation
   - immutable version behavior
   - projection not-applicable

4. **Goal UI tests**
   - kind labels
   - compatible exercise filtering
   - duration/distance/pace controls
   - skill fixed target
   - source evidence link

5. **Stretch domain/service tests**
   - distance strategy
   - pace strategy
   - baseline/freshness
   - target rounding
   - minimum distance
   - Goal relevance
   - no skill auto-Stretch
   - existing strategies regressions

6. **Saved Routine domain/service/API tests**
   - owner create
   - immutable revisions
   - archive
   - seeded protection
   - concurrency/stale version
   - session snapshot integrity

7. **Training UI tests**
   - Built-in / Saved / Empty start flow
   - routine builder
   - new set inputs
   - detail formatting
   - approximately 390 px
   - touch targets
   - reduced-motion regression where applicable

8. **Coach integration tests**
   - Run/Hike canonical distance
   - new Training mutation refresh behavior
   - existing H2A/H2B/H2C behavior unchanged

9. **Real PostgreSQL migration tests**
   - new set constraints
   - Goal kind/selector constraints
   - template-origin/version invariants
   - concurrent routine revision where applicable

10. **Backup/export tests**
   - schema head
   - fields/kinds/versions round-trip

11. Full regression:
   - `npm test`
   - `npx tsc -b`
   - `npx eslint .`
   - `npm run build`

Do not use or mutate the owner's production database in tests.

## Acceptance criteria

V2-H2D is complete when all are true:

1. Canonical Training stores distance in meters and skill completion explicitly.
2. Pace is derived from one canonical distance+duration set and is never stored.
3. Existing Training measurements continue to work unchanged.
4. Running/Hiking are first-class canonical Training definitions.
5. New Run/Hike Coach logs preserve provided distance in Training.
6. Shared deterministic helpers expose reps/duration/distance/pace/skill evidence with exact provenance.
7. Goal kinds `training_reps`, `training_duration`, `training_distance`, `training_pace`, and `training_skill` are first-class.
8. Pace Goal identity includes a fixed minimum continuous distance.
9. Goal evidence rereads canonical Training and responds to edit/delete.
10. New Goal kinds do not invent unsupported projections.
11. Training Goal UI uses appropriate friendly controls and units.
12. Stretch supports canonical distance and pace challenges with H2B lifecycle/safety unchanged.
13. Binary skill Goals do not auto-generate Stretch challenges without a progression hierarchy.
14. Existing templates are reused as the Saved Routine architecture.
15. Owner routine revisions create immutable new template versions.
16. Built-in A/B/C remain immutable.
17. Historical sessions retain their original template/version after routine changes.
18. Start Workout clearly offers Built-in, Saved, and Empty Workout.
19. Routine builder supports ordered exercises, planned sets, and basic compatible prescriptions.
20. Demo/auth/provider boundaries remain intact.
21. Backup/export includes the new canonical schema but not derived pace/PR data.
22. Existing H2A/H2B/H2C, Lab, Goal, Training import, and calendar invariants remain intact.
23. All tests, typecheck, lint, and production build pass.

## Required completion report

When finished, report:

1. Files changed.
2. Migration added, exact filename, where it was applied, and resulting migration head.
3. New Training measurement schema and set constraints.
4. Distance unit conversion/canonical storage.
5. Pace derivation authority.
6. Skill completion semantics.
7. Running/Hiking canonical definitions and Coach logging changes.
8. New Goal kinds and selector/target rules.
9. Goal evidence/provenance and edit/delete behavior.
10. Goal projection behavior.
11. Distance Stretch target/verification.
12. Pace Stretch target/minimum-distance/verification.
13. Skill-Stretch deferral decision.
14. Saved Routine schema/origin/version semantics.
15. Routine CRUD and concurrency/stale behavior.
16. Start Workout Built-in/Saved/Empty UX.
17. Training editor/detail UI changes.
18. Coach/Today refresh integration.
19. Backup/export changes.
20. Tests added/updated and final counts.
21. Results of:
    - `npm test`
    - `npx tsc -b`
    - `npx eslint .`
    - `npm run build`
22. Manual QA performed at desktop and approximately 390 px.
23. Deviations, risks, unresolved questions, or H3 follow-up.
24. Documentation updated (`DEV_STATE.md`, `DECISIONS.md`, and any durable manual/roadmap amendment actually required).
25. Final commit SHA and confirmation that it was pushed.

When implementation is complete, update `docs/ai/DEV_STATE.md` to the actual resulting product state, reset this file to `No active implementation task`, commit, and push per `AGENTS.md`.
