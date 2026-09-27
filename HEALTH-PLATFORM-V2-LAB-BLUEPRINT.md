# Daurham Health — V2 Lab Blueprint

**Status:** V2-A Data Capture Foundations complete. V2-B Personal Lab Core complete (V2-B1 through V2-B4). V2-C Recipes / Batch Meals complete (V2-C1 through V2-C4). V2-D Goals + Projections complete (V2-D1 through V2-D3).  
**Calendar:** America/Phoenix  
**Package version:** remains `1.0.0`  
**Schema head after V2-D3:** `0028_goals.sql`

This file is the v2 product authority for work after the frozen v1 manual. The frozen manual remains the authority for retained v1 semantics. Where this blueprint intentionally extends the product, it takes precedence over the older post-v1 roadmap in the v1 manual and in `docs/V2-ROADMAP.md`.

The v1 roadmap listed Recipes first. That ordering is not the v2 implementation order. V2-A Data Capture Foundations comes first.

The file was not present in the repository when V2-A1 implementation started. This document records the implemented contract rather than inventing an earlier unpublished draft.

## Ordering

1. **V2-A Data Capture Foundations**
   - V2-A1 Supplements + adherence — implemented
   - V2-A2 Body measurement expansion — implemented
   - V2-A3 ad-hoc Training — implemented
   - V2-A4 Context — implemented
2. **V2-B Personal Lab**
   - V2-B1 Experiments, Benchmark definitions, and immutable protocol versions — implemented
   - V2-B2 Benchmark Results — implemented
   - V2-B3 Retest Scheduling — implemented
   - V2-B4 Experiment Result Summaries — implemented
   - V2-B Personal Lab Core — complete
3. **V2-C Nutrition**
   - V2-C1 First-Class Recipes — implemented
   - V2-C2 Recipe version editing — implemented
   - V2-C3 Recipe consumption logging — implemented
   - V2-C4 In-builder ingredient creation — implemented
   - V2-C Recipes / Batch Meals — complete
4. **V2-D Goals**
   - V2-D1 First-Class Goals — implemented
   - V2-D2 Deterministic projections — implemented
   - V2-D3 goal-aware status and reminders — implemented
   - V2-D Goals + Projections — complete
5. Later product work, including Ask Health, stays behind this foundation.

Invariant:

> Health owns canonical facts. Sources provide observations. Deterministic code validates, calculates, and derives. AI interprets or proposes. Missing evidence is never silently manufactured.

## Amendment — 2026-09-26T21:24:40-07:00 — V2-A1 Supplements

### Tables

- `supplements`
- `supplement_schedules`
- `supplement_status_events`
- `supplement_adherence`

No materialized row is stored for every supplement/day. Daily state is derived.

Provenance is the existing manual owner source (`data_sources.key = 'manual'`). Checkbox actions do not create import jobs.

### Schedule recurrence

ISO weekday mask: bit 0 = Monday through bit 6 = Sunday. `127` = every day.

Supported patterns: every day, selected weekdays, different doses via separate masked rows, and more than one slot on the same day.

A historically operative plan is versioned by closing `effective_through` and inserting a new schedule. It is not rewritten in place. A future schedule with no adherence may be edited until it takes effect.

Not in V2-A1: RRULEs, monthly recurrence, PRN, reminders, or pharmacologic unit conversion.

### Lifecycle

`supplement_status_events` stores `active`, `paused`, and `discontinued`, unique per supplement and effective date. The state on a date is the latest event on or before that date. Creating a supplement creates the first `active` event.

Paused and discontinued periods do not create skipped adherence.

### Adherence

Stored outcomes are only `taken` and `skipped`. One row per schedule and scheduled date. Repeat commands upsert. `clear` deletes the row.

`unknown`, `paused`, and `not_scheduled` are derived.

No adherence row means unknown, not skipped. Past unresolved doses stay unknown. Future adherence is rejected.

Actual dose amount and unit are both absent or both present. `taken_at` is stored only when explicitly supplied. `created_at` / `updated_at` record when Health learned the fact.

### Counts

For a range of scheduled occurrences:

- `scheduled_count`
- `taken_count`
- `skipped_count`
- `unknown_count = scheduled_count - taken_count - skipped_count`

Primary adherence is `taken_count / scheduled_count`. Capture coverage stays separate. Unknown doses are not treated as skips. There is no wellness score.

### Today

`GET /api/today` includes today's actionable occurrences. The card sits after Nutrition/Training and before Activity/Sleep/Body. Checkbox moves unknown to taken, and taken back to unknown. Skip is explicit. The five primary navigation items are unchanged. Settings links to `/supplements`.

If no supplement definitions exist, Today omits the card.

### Backup and demo

All four tables are canonical, included in the full backup and the owner portable export, and covered by restore round-trip tests.

`/demo` stays synthetic and read-only. V2-A1 does not add a public supplements demo or a demo API fallback. The demo Today payload omits the card.

### Deviations from the implementation handoff

- The pre-existing blueprint file was absent, so this amendment is the v2 authority record created with the implementation.
- Today items also include `actualDoseAmount` and `actualDoseUnit` when the owner recorded an override, so the checklist can show that dose. Planned dose remains on the item.
- The management page can preview another calendar date with the same resolver. That is how a dose change effective tomorrow can be checked without waiting for that date.
- In-place schedule edits are limited to schedules whose `effective_from` is still after today and that have no adherence. Operative schedules are versioned.

### Still deferred

V2-A3 ad-hoc Training, V2-A4 Context, Recipes, Goals, Experiments, benchmarks, and Ask Health.

## Amendment — 2026-09-26T21:49:02-07:00 — V2-A2 Body measurement expansion

Resolved for this phase: the exact manual Body metric set, body-measurement unit normalization, and cadence/reminder rules.

### Metric set

Manual capture uses the existing session and EAV metric tables. Keys: `weight`, `body_fat_percentage`, and the twelve circumference keys `waist_circumference`, `hip_circumference`, `chest_circumference`, `neck_circumference`, plus left/right upper arm, forearm, thigh, and calf. `waist_circumference` is distinct from `waist_hip_ratio`.

### Units

Weight stays canonical kilograms, with manual input in pounds or kilograms and owner display in pounds. Body fat stays a percent, not a fraction. Circumferences are canonical centimeters. Manual input accepts inches or centimeters. Owner display is inches. `1 in = 2.54 cm`. Display rounding is 0.1. Canonical values are not rounded on the way in. A blank field is absent, not zero.

### Manual mutation

`POST`, `PATCH`, and `DELETE /api/body/measurements` apply only to sessions whose source is `manual` and whose `import_job_id` is null. Metrics use `value_kind = manual`. Quick entry stores the current timestamptz in `America/Phoenix`. Imported Fit Profile sessions stay read-only. `updated_at` on sessions and metrics was added and backfilled from `created_at`.

### Cadence

Table: `body_measurement_cadences` (`metric_key` unique, `interval_days` 1–3650, `enabled_from`, manual source). No default cadence. Deleting the row disables it. Status is `current` when age is below the interval, `due` until twice the interval, `stale` at twice the interval or beyond, and `initial_due` when nothing has been measured. Today shows one reminder: stale, then initial baseline, then due. `dueCount` covers the rest. A cadence does not insert measurements.

### Today, backup, demo

The reminder is part of `GET /api/today`. Cadence configuration is in the full backup and the portable export. `/demo` does not expose owner cadence or manual capture.

### Deviations

- Group presets are buttons that write per-metric rows. Arms and full circumference use an explicit 30-day action. They are not stored as groups.
- Edit keeps the existing measured instant unless the request sends a real timestamp. The form does not invent a time for a date-only correction.
- A cadence whose `enabled_from` is still in the future does not appear on Today.
- Today items include `dueCount` on the single primary reminder rather than a separate wrapper field.

### Still deferred after V2-A2

Body Inbox, Shortcut ingestion, notifications, circumference projections, goals, Experiments, V2-A3 Training, and V2-A4 Context.

## Amendment — 2026-09-26T22:13:01-07:00 — V2-A3 Ad-hoc Training

Resolved for this phase: Training session intent is a canonical `session_type`, separate from `source_kind`.

### Schema

`workout_sessions.session_type` is `programmed`, `ad_hoc`, or `experiment`. `session_name` is optional and is not `template_name`. Existing rows become `programmed` when any template identity is present (`workout_template_id`, `routine_code`, `template_version`, or `template_name`) and `ad_hoc` otherwise. The column is not given a permanent default. Session ids, sets, template snapshots, and `source_kind` are not rewritten.

### Coherence

A new programmed session requires a template. An ad-hoc session stores template id, routine, version, template name, and slot ids as NULL. Ordinary creation of `experiment` is rejected until a real Experiment or Benchmark reference exists. Session type is immutable on a normal edit. Transcription commits `programmed` and keeps `imported_candidate`.

### Owner exercises

Reusable exercises are rows in `exercise_definitions`, marked `{ "origin": "owner", "created_via": "ad_hoc_training" }`. That metadata is not a health observation. New definitions use `performance_type = other`, `analytics_load_type = none`, and `analytics_rep_mode = per_side` only for a per-side measurement family. Used definitions cannot change measurement family, unilateral, or load type. Name corrections do not rewrite workout `exercise_name` snapshots. Archive sets `is_active = false`. Seeded catalog rows are not managed through this API.

### Today, backup, demo

Today stays one payload and can name programmed and ad-hoc sessions. The no-training card keeps Log workout on the photo import path and adds an ad-hoc action. Ad-hoc sessions count as Training. Classified exercises still feed existing analytics. Unclassified custom exercises do not receive an e1RM. Backup and portable export include the new session columns and owner exercise rows beside seeded definitions. `/demo` stays read-only.

### Deviations

- Unilateral is required to match the measurement family so set entry and the definition describe the same sides.
- The ad-hoc route is `/training/new?type=ad_hoc`.
- Progress titles use the display-name rule. Stored `template_name` is not overwritten.
- No distance field was added to `workout_sets`.

### Still deferred after V2-A3

Experiment and Benchmark tables, the link from an existing session to those objects, Personal Lab, context tags, goals, and V2-A4 Context.

## Amendment — 2026-09-26T22:34:28-07:00 — V2-A4 Daily Context

V2-A Data Capture Foundations is complete.

### Catalog

Frozen keys, in response order: `sick`, `travel`, `alcohol`, `late_meal`, `unusual_stress`, `poor_sleep_opportunity`, `baby_night_interruption`, `pain`, `rest_day`, `new_supplement`, `medication_change`, `unusual_physical_labor`.

These are owner observations. `sick` and `pain` are not diagnoses. `poor_sleep_opportunity` and `baby_night_interruption` are not inferred from sleep. `late_meal` and `alcohol` are not inferred from Nutrition. `alcohol` records presence only. `rest_day` does not forbid Training and is not inferred from a missing workout. `new_supplement` does not create a Supplement or an adherence event. `medication_change` does not create a medication record. `unusual_physical_labor` is neither Training nor Apple Activity.

No row means no context was recorded. A tag absent from a recorded day was not recorded. Neither absence is negative evidence.

### Schema

`daily_context` is one row per `context_date` (`DATE`, America/Phoenix), with a nullable note of at most 500 characters, `source_id` to the existing manual source, and record-management timestamps. `daily_context_tags` is the queryable membership, cascading on delete, checked against the frozen keys. Tags are not JSON. A record needs a tag or a note. Ordinary correction keeps the same id and `created_at`. Future dates are rejected. There is no import job and no AI.

### Today, Timeline, backup

Today reads context inside `GET /api/today`. Absence is not Needs Attention, and there is no reminder, streak, or score. The editor is `/context`, outside the five-item nav. Timeline kind `daily_context` is date precision, ordered first on its day, included in All and in a Context focus, and plotted on no numeric lane. Context does not change current analytics and does not auto-exclude days.

`daily_context` and `daily_context_tags` are canonical and portable. Parent rows restore before tags. A date-and-tag query does not parse notes. Personal Lab is still not implemented.

### Deviations

- Duplicate tags are deduped into catalog order.
- A missing day is `{ context: null }` with HTTP 200. Delete of a missing day is idempotent.
- The public range is capped at 3660 days.
- `/demo` omits context entirely and does not link to the private editor.
- The no-empty-row rule is enforced in the write path. The database checks note shape and tag keys.

### Still deferred

Recipes, Goals, experiment results, benchmark results, retest reminders, AI proposals, Ask Health, symptom tracking, medication management, custom tags, severity scales, and causal interpretation.

## Amendment — 2026-09-26T23:03:14-07:00 — V2-B1 Personal Lab protocols

V2-B1 implements experiment and benchmark identity. It does not implement results.

### Shared protocol architecture

Experiments and Benchmarks stay separate first-class objects. They share `lab_protocols`, `lab_protocol_versions`, `lab_protocol_requirements`, and `lab_protocol_context_controls`. That sharing is an implementation design. It does not merge the two domains.

A protocol version's instructions, requirements, context controls, and retest intervals are immutable after insert. Editing creates the next version. One version is current. Existing experiments and Training sessions keep the version they used.

### Experiments

An owner-created experiment starts `origin = owner_created` and `status = accepted`. A future AI proposal must start `proposed` and cannot accept, schedule, or start itself. Scheduling requires an America/Phoenix date window. Activation freezes the protocol version and the window. `completed` and `inconclusive` are reserved for a later result workflow.

Multiple intervention supplements may be stored. B1 does not claim that design isolates any one supplement. Supplement name, dose, and schedule stay on the Supplement record. Context controls may only `observe`. They do not exclude a day and they do not write Daily Context.

### Benchmarks and Training

A benchmark definition owns one protocol identity and its version history. A later benchmark result must be able to reference both `benchmark_definition_id` and `protocol_version_id`. B1 does not store that result.

`session_type = experiment` requires an Experiment, a benchmark protocol version, or both. Programmed and ad-hoc sessions cannot take those parents. Historical ad-hoc tests stay ad-hoc.

### Deferred from this amendment

Benchmark result rows, experiment result summaries, automatic retest reminders, AI-generated proposals, literature persistence, Goals, and causal interpretation remain later work. Timeline experiment lifecycle events are also deferred; the window is shown on the experiment.

### Deviations

- Requirement kinds are the centralized catalog: `training_measure`, `body_metric`, `nutrition_metric`, `activity_metric`, `sleep_metric`, `supplement_adherence`, `context_tag`, and `benchmark_definition`.
- Write-path text caps are 200, 2000, 4000, or 8000 characters depending on the field.
- `/demo` omits Personal Lab.
- `experiment_benchmarks` and `experiment_supplements` cascade when the experiment row is deleted. A supplement delete does not cascade to the experiment. A workout delete does not cascade to the experiment.

## Amendment — 2026-09-26T23:38:19-07:00 — V2-B2 Benchmark Results

V2-B2 stores durable Benchmark Results. It does not store experiment result summaries, retest due dates, or causal conclusions.

### Result record

A result references one benchmark definition and one immutable protocol version. The result date comes from the canonical evidence. Primary outcomes must resolve. A missing secondary outcome is omitted and is not zero. Values use canonical units. `observed` means the canonical metric itself. `derived` means a deterministic calculation such as total reps or daily protein. The client cannot submit the number.

Each value keeps at least one evidence link. The snapshot is bounded provenance so a later correction of the source observation does not silently change the committed result. The evidence fingerprint is a stable hash of the benchmark, protocol version, result date, outcome requirement ids, source identities, and source values. The same fingerprint cannot be committed twice. The API returns 409 with the existing result.

Confirmation is `linked_protocol` when the training session already names that protocol version and every outcome comes from that session. Otherwise the owner attests. Historical ad-hoc training stays ad-hoc. Creating a result does not complete an experiment.

### Comparability and correction

A valid result is immutable. Correction is invalidate, then commit a replacement. `supersedes_result_id` may name the invalidated result from the same benchmark. Default history and Timeline show valid results. Same-protocol results may show an absolute and percent delta. Different protocol versions are not directly compared. There is no composite score.

`latestValidBenchmarkResult` exists for a later retest phase. This amendment does not calculate due or overdue.

### Deferred from this amendment

Experiment result tables, experiment completion, adherence and confounder scoring, context exclusion, retest reminders, notifications, AI interpretation, literature, Goals, and Challenges remain later work.

### Deviations

- Preview state `conflicting_dates` covers outcomes that do not share one Health date.
- Invalidation reasons are capped at 500 characters.
- New benchmark protocols must use result-capable primary and secondary outcomes. Existing rows stay readable.
- `duration` is the sum of canonical working-set duration seconds.
- `/demo` continues to omit Personal Lab.

## Amendment — 2026-09-26T23:55:51-07:00 — V2-B3 Retest Scheduling

V2-B3 derives retest state. It does not add a table, a migration, a notification, a snooze, or an experiment result.

### Scheduling rule

Automatic scheduling uses the benchmark's current protocol version and the latest valid result for that exact version. `minimum_retest_days` is the earliest suggested repeat. `suggested_retest_days` is the point where Health says a retest is suggested. Only the suggested interval creates `due`. A missing interval is not invented. A current protocol with guidance and no valid result is `no_baseline`, not due. An older protocol series does not schedule the current version.

Calendar dates use America/Phoenix. The boundary day is included. Invalidation and replacement recompute the anchor from `result_date`. An early valid result becomes the new anchor. The minimum interval does not reject that result.

Archived benchmarks are omitted from the active list and from Today.

### Today

`GET /api/today` carries at most one `due` retest. Ranking is days past the suggested date, then the oldest anchor, then title and id. A scheduled or active experiment linked through `experiment_benchmarks` suppresses that standalone card. An accepted experiment does not. The copy says retest suggested. It does not say overdue.

### Deviations

- Retest state is not stored. Schema head after V2-B3 remained `0022_benchmark_results.sql`.

## Amendment — 2026-09-27T00:29:14-07:00 — V2-B4 Experiment Result Summaries

V2-B Personal Lab Core is complete. An Experiment Result says what was observed under one frozen protocol version. It does not say the intervention caused the outcome.

Classifications, in precedence order when their conditions apply: `stopped_safety`, `invalid_protocol`, then a block on ordinary review before `window_end`, then `incomplete`, `inconclusive`, `completed_low_adherence`, and `completed_interpretable`. The first two completed classifications set the experiment to `completed`. The other four set it to `inconclusive`. Those statuses are written only by result commit and invalidation.

The owner attests whether the protocol was followed and, separately, whether the experiment was stopped for pain or safety. Safety is not inferred from a pain tag or a poor measurement. Early finalization is limited to those two attestations and stores `effective_end_date` without changing the planned `window_end`.

Requirement criteria are versioned with the protocol. Empty criteria do not invent a threshold. Adherence percent is taken among resolved scheduled days. Unknown is not skipped. Paused days are not nonadherence. If an adherence threshold is configured and coverage is not, coverage must be complete before the threshold applies. Context absence is not proof the factor did not occur and does not by itself make a result incomplete or invalid.

Benchmark comparisons use the same protocol version. A prior result is history, not a fabricated baseline. Direct-domain summaries keep each domain's missingness rules. Commit re-reads canonical evidence. A committed result is immutable. Correction invalidates it and commits a replacement. At most one valid result exists per experiment.

Today can say an active experiment is ready to review after its window ends. Timeline records a valid result on the effective end date. There is no AI classification and no causal claim. Ask Health, Goals, notifications, and causal interpretation remain later work.

## Amendment — 2026-09-27T00:36:13-07:00 — Inclusive window closes the next day

Experiment windows stay inclusive calendar dates. Ordinary result finalization is available when the Health calendar day is after `window_end`, not on `window_end`. On the final planned day the preview remains in progress. The copy says the final observation day is in progress and that review will be available tomorrow. That day is not classified incomplete because same-day evidence is still open.

Today does not say Ready to review on `window_end`. It may say the experiment ends today. Ready to review, and the neutral Needs Attention item, begin the next Health day if no valid result exists.

Explicit early finalization for `stopped_safety` and `invalid_protocol` can still commit on or before `window_end`. `effective_end_date` stays inside the planned window and not after today. Schema head remains `0023_experiment_results.sql`. Package version remains `1.0.0`.
- `experiment_benchmarks` does not record a protocol version, so a scheduled or active benchmark link suppresses the current-protocol Today card.
- Same-day display follows the existing latest-valid ordering. The schedule date is the shared `result_date`.
- No notification or snooze persistence.

### Deferred from this amendment

Experiment result tables, experiment completion, adherence and confounder scoring, causal language, AI retest proposals, notifications, and Goals remain later work.

## Amendment — 2026-09-27T00:52:31-07:00 — V2-C1 First-Class Recipes

V2-C1 is implemented. A Recipe is a reusable preparation, distinct from a reusable food and from a consumed Nutrition entry. Creating a recipe does not log intake.

`recipes` is identity and archive state. `recipe_versions` holds the name, notes, optional yield, optional finished weight, whole-recipe nutrition, and calculation version `recipe-v1`. C1 writes version 1 as the only current version. Semantic version content is immutable. A later edit will create another version rather than patching v1.

Ingredients are existing `nutrition_foods`. Each line snapshots the food name, serving basis, and calories, protein, carbs, and fat used at creation. `food_id` can be cleared if the food row is removed. The snapshot remains. The same food may appear more than once. Owner order is `position`.

The server resolves amount and unit into a scale factor. Servings, an exact match to the food's serving unit, and grams, ounces, and pounds when the food has a weight basis are supported. Density is not guessed. An invalid ingredient creates no recipe row.

If any ingredient is missing protein, carbs, or fat, that whole-recipe macro is null. The other macros still sum. Calories are required and are not rounded during calculation.

Archive hides the recipe from the active list and keeps the version readable. Restore returns it. Recipe APIs are owner-only. `/demo` does not call them.

Backup and portable export include `recipes`, `recipe_versions`, and `recipe_version_ingredients`. Restore order is foods, recipe identity, versions, then ingredients.

C2 version editing, C3 consumption from a `recipe_version_id`, and C4 in-builder food creation are not implemented. Nested recipes, AI recipe generation, fiber, and the legacy meal-combo tables are not part of C1. Package version remains `1.0.0`.

## Amendment — 2026-09-27T08:11:37-07:00 — V2-C2 Recipe version editing

V2-C2 is implemented. No new migration. Schema head remains `0024_recipes.sql`. Package version remains `1.0.0`.

A semantic edit creates version N+1 of the same recipe. The previous version stays unchanged, including its snapshots, nutrition, calculation version `recipe-v1`, and `created_at`. Only the current version can start an edit. The next integer is `current version + 1` inside one transaction that locks the recipe and current version. Success leaves exactly one current version.

Preview (`POST /api/nutrition/recipes/:id/versions/preview`) writes nothing. It re-resolves live foods, shows food-basis changes, and returns a fingerprint. Commit (`POST /api/nutrition/recipes/:id/versions`) recalculates. A stale source version and a stale food basis are separate 409 responses. An identical draft creates no version. A food-basis refresh with no owner formulation edit can create a version. A historical line with a null `food_id` must be replaced or removed before commit. Archived recipes reject preview and commit. Restore does not create a version.

The list uses the current version. History is newest version integer first. Historical detail reads snapshots. The edit route is `/nutrition/recipes/:id/edit`. Review states that the next version is created and the previous version remains unchanged. Editing does not write `nutrition_entries`. Nested recipes and C4 food creation stay out. `/demo` does not call recipe APIs.

Backup and portable export already include every version row. A multi-version chain round-trips with the same ids, snapshots, current flag, and archive state.

C3 consumption logging is implemented in the following amendment. C4 in-builder food creation is not implemented.

## Amendment — 2026-09-27T08:38:26-07:00 — V2-C3 Recipe consumption logging

V2-C3 is implemented. Migration `0025_recipe_consumption.sql` adds `recipe_version_id`, `recipe_portion_kind`, `recipe_portion_amount`, and `recipe_fraction` to `nutrition_entries`. Schema head is `0025_recipe_consumption.sql`. Package version remains `1.0.0`.

Logging uses the exact recipe version, not whichever version is current. Servings divide the amount by `yield_servings`. Fraction mode uses the amount itself, including values above one. Grams divide the amount by `finished_weight_g`. The stored whole-recipe nutrition is scaled by that fraction once, through the existing nutrient scaler. A null macro stays null. One log creates one nutrition entry. Ingredient foods are not reloaded.

Active current recipes appear in Quick Log search and open a portion chooser. Historical versions are logged from version history. An archived recipe stays out of active search and can still be logged from its exact version. Later recipe edits, archive, and restore do not change the consumed entry. Delete removes the entry only. The older `catalog_kind = 'recipe'` food kind stays separate.

Backup and portable export include the provenance columns. Restore writes recipe versions before nutrition entries. Entries from before this migration restore with those columns null.

C4 in-builder ingredient creation is implemented in the following amendment. There is no batch inventory. `/demo` does not log recipes.

## Amendment — 2026-09-27T09:02:35-07:00 — V2-C4 In-builder ingredient creation

V2-C4 is implemented. Migration `0026_nutrition_food_usda_source.sql` adds `usda` to the `nutrition_foods` source check. It does not add columns or change nutrition entry sources. Schema head is `0026_nutrition_food_usda_source.sql`. Package version remains `1.0.0`. V2-C Recipes / Batch Meals is complete.

The recipe draft stays in memory in the builder. Add ingredient can search My Foods, search USDA, scan a barcode, photograph a nutrition label, enter a food manually, or describe one reusable food. Cancel, provider failure, and a successful food save all return to the same unsaved draft. The returned value is the canonical food id. The new line starts at one serving and can be edited. Saving the food does not save the recipe and does not write `nutrition_entries`.

USDA results stay candidates until a real FoodData Central portion is reviewed and saved. The FDC id is the external identity. The same id and serving is reused. Similar names are not merged. Barcode reuses a local food or reviews an Open Food Facts candidate, then saves without logging. Nutrition label capture uses the existing capture jobs and, inside a recipe, saves the food only. Manual food uses the shared reusable-food validation. AI output is an estimate until review. A composite description is not turned into recipe lines. Ordinary Food Description, Meal Photo, and reference USDA lookup outside the builder stay unchanged.

Preview and commit still reload `nutrition_foods` and apply the existing fingerprint and stale-basis rules. New foods export as normal food rows. `/demo` does not expose the builder. Later product work is not marked implemented.

## Amendment — 2026-09-27T09:18:47-07:00 — V2-C4 provenance correction

USDA reusable foods keep `source_kind = 'usda'` on `nutrition_foods`. The FDC id is `source_record_links.external_id` for data source `usda_fooddata_central` and entity type `nutrition_food`. The fingerprint also includes the reviewed serving amount, unit, and grams, so one FDC food may have more than one reusable serving. Reuse does not read notes, brand, or name. A text description saved as a reusable food uses `source_kind = 'description_ai'`. Meal Photo remains `meal_photo_ai`. Ordinary Food Description remains a consumption entry. Migration `0027_nutrition_food_ai_source.sql` is the schema head. Package version remains `1.0.0`. V2-C Recipes / Batch Meals stays complete. Recipe versions are not rewritten.

## Amendment — 2026-09-27T09:27:03-07:00 — Portable USDA provenance

The full archive still stores `data_sources`, `source_record_links`, and `nutrition_foods` with their canonical ids. The portable owner export does not include those source-link foreign keys. A USDA food in that export carries `external_provenance` with provider `usda_fooddata_central`, the FDC `external_id`, and the serving-basis `external_fingerprint`. The reviewed serving stays on the food row. The seeded source UUID is not exported. Portable JSON is not a second restore path. Schema head remains `0027_nutrition_food_ai_source.sql`. Package version remains `1.0.0`.

## Amendment — 2026-09-27T09:57:21-07:00 — V2-D1 First-Class Goals

V2-D1 is implemented. Migration `0028_goals.sql` adds `goals` and `goal_versions`. Schema head is `0028_goals.sql`. Package version remains `1.0.0`. V2-D2 and V2-D3 are not implemented.

A Goal is the metric the owner chose, the original target, later target revisions, the current revision, and the current lifecycle. It does not say when the target will be reached, and it does not say the owner is on or off track.

Supported kinds are body metric, strength e1RM, benchmark result, training frequency, activity steps, nutrition protein, sleep duration, and supplement adherence. Nutrition consistency, sleep consistency, and general activity stay unsupported. The selector is structured columns. An arbitrary metric string is rejected. The selector does not change after creation.

Version 1 is written with the goal. A target revision locks the current version, requires `sourceVersionId`, inserts the next version, and leaves the previous version unchanged. Lifecycle changes do not create a version. Status is active, paused, or completed. Only the owner completes a goal. A current observation that meets the target does not.

Body goals use the existing body metric keys and display units `lb`, `in`, and `%`. Strength goals reference an exercise definition. Benchmark goals pin the protocol version and one primary or secondary outcome. The benchmark unit comes from that outcome. Training frequency is at least N canonical training sessions per fixed 7 days and does not count Apple Activity workouts. Activity steps average observed completed days. Protein averages logged days with a known total. Sleep averages analysis-eligible nights and leaves partial nights out of the average. Supplement adherence is taken divided by taken plus skipped. Unknown is not skipped. Missing evidence stays null.

Target modes are `at_least`, `at_most`, and `range` where that mode fits the kind. The target date is optional. Evaluation windows belong to the version. Point metrics have no window. There is no projection table, no reminder, and no AI endpoint that commits a goal. `/goals` is a private route linked from Settings and Progress. It is not a primary navigation tab. `/demo/goals` is omitted. Backup and portable export include both tables. Portable rows add a readable selector label and the manual source key. Those labels are not a restore path.

## Amendment — 2026-09-27T10:16:35-07:00 — V2-D2 Deterministic Goal Projections

V2-D2 is implemented. There is no migration. Schema head remains `0028_goals.sql`. Package version remains `1.0.0`. V2-D3 is not implemented.

Projections are derived on read. The calculation version is `goal-projection-v1`. It is not a Goal Version. Only active body-metric and strength e1RM goals are projected. Benchmark results, training frequency, steps, protein, sleep duration, and supplement adherence are `not_applicable`. Paused and completed goals are `not_applicable_lifecycle`.

The slope is Theil–Sen. Slope dispersion is the 25th and 75th percentile of the same pairwise slopes. It is not a confidence interval. All three slopes must move toward the owner-chosen boundary. A current value that already meets the target produces no ETA. Body evidence is the trailing 90 days and keeps the five-measurement, 14-day gate, with one observation per calendar date. Strength evidence is the trailing 180 days, one canonical e1RM per exercise appearance, at least six appearances spanning 28 days. The horizon is `min(365, max(90, spanDays * 4))`. Crossing dates use `ceil` of the unrounded day count after `asOf`.

The target date does not change the observed slope. Nothing is stored, exported as an ETA, or sent to a model. Goal detail can show an estimated window. It does not say the owner will arrive on that date, and it does not say the owner is on or off track.

## Amendment — 2026-09-27T10:36:03-07:00 — V2-D3 Goal-Aware Status + Reminders

V2-D3 is implemented. There is no migration and no status table. Schema head remains `0028_goals.sql`. Package version remains `1.0.0`. V2-D Goals + Projections is complete.

Status is derived on read as `goal-status-v1`. `targetState` and `deadlineState` stay separate. Missing evidence is unknown. Meeting a target does not complete the goal. On track means the entire available D2 window falls on or before the owner-chosen date. Off track means the entire window falls after that date. Overlap stays uncertain. An unavailable projection is not off track. A passed date does not invent a historical failure.

Reminders are current in-app attention. Body uses the existing A2 cadence. Benchmarks use the pinned protocol version and only a B3 `due` state. There is no invented strength cadence and no coaching for training, steps, protein, sleep, or supplements. Today returns at most two goal-derived items, after existing review work, and dedupes them against the domain item. Paused and completed goals suppress that attention. Nothing is stored, exported, or sent to a model. There is no push, email, or SMS.




