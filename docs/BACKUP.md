# Health backup and recovery

This is the portable copy of Health-owned data. It is separate from any Neon provider snapshot. A Neon plan's own backups, if the current plan includes them, are an extra layer. They do not replace this file, and no plan upgrade is required.

Create a backup once a month, and again before a schema migration.

Authentication is not in the backup. After a restore, sign in with the existing owner account. Passwords and sessions are not copied.

## Create

```bash
npm run backup:create -- ./backups/health-2026-09-22.health-backup.zip
```

The command reads the configured Health database, writes the archive, and verifies it before it exits.

## Verify

```bash
npm run backup:verify -- ./backups/health-2026-09-22.health-backup.zip
```

Verification only reads the file. It does not connect to a database.

## Restore dry run

```bash
npm run backup:restore -- ./backups/health-2026-09-22.health-backup.zip
```

This prints schema versions, row counts, and conflicts. It does not write.

## Restore to a new database

Point `DATABASE_URL` at an empty Health database that has already had `npm run migrate` applied. The destination must be on the same migration as the backup. User tables must be empty. Migration seed rows for sources, exercises, and templates are replaced so original ids survive. Owner-created exercises live in `exercise_definitions` and are restored with that table. `workout_sessions` includes `session_type` and `session_name`.

```bash
HEALTH_BACKUP_RESTORE=yes npm run backup:restore -- ./backups/health-2026-09-22.health-backup.zip --apply
```

If the destination already has nutrition, training, body, activity, sleep, supplement, or measurement-cadence rows, restore stops. It does not merge and it does not overwrite newer rows.

## Verify recovery

```bash
npm run backup:verify -- ./backups/health-2026-09-22.health-backup.zip
```

Then confirm row counts in the destination match the dry-run list. Derived sleep nights and activity days are restored with the raw evidence, not recomputed alone.

`npm run backup:restore` uses `DATABASE_URL` through the Neon HTTP client. Do not point that command at the production database. A local socket-only Postgres cluster is not a target for this CLI. The release-candidate check restored the 2026-09-22 archive with the same restore planner into a disposable local database, compared it with the archive, and deleted that database.

## What is not in the file

- Passwords, sessions, API keys, and the Apple Health ingest token
- Photos that exist only on Home-AI disk
- A Settings download may be a portable export when the full archive is large. Portable exports omit raw samples, raw sleep intervals, and capture jobs. Use the CLI archive for disaster recovery.

Settings → Data & Backup downloads a private copy for the signed-in owner. The machine ingest token cannot read it.

## Body measurements

Owner Health data includes Body sessions, metrics, and measurement cadence (`body_measurement_sessions`, `body_metrics`, `body_measurement_cadences`). Cadence is the owner's reminder plan, not a measurement. Circumference values use centimeters. Session and metric `updated_at` is included. They are in the full archive and in the portable export.

## Supplements

Owner Health data includes supplement definitions, schedules, lifecycle events, and explicit taken/skipped adherence (`supplements`, `supplement_schedules`, `supplement_status_events`, `supplement_adherence`). They are in the full archive and in the portable export. An absent adherence row means the dose is unknown, not skipped. Restore keeps the original ids, dates, timestamps, and nulls.

## Daily context

Owner Health data includes one optional context row per calendar date and its tag membership (`daily_context`, `daily_context_tags`). Both are in the full archive and in the portable export. Restore inserts `daily_context` before `daily_context_tags`, keeps the original ids, dates, notes, tags, source ids, and timestamps, and does not add a second row for the same date. A missing context row means no context was recorded. Deleting a context row cascades its tags.

## Personal Lab

Owner Health data includes first-class recipes (`recipes`, `recipe_versions`, `recipe_version_ingredients`). They are in the full archive and in the portable export. A recipe may contain several versions. Exactly one is current. Each version keeps the ingredient name, amount, unit, scale factor, and nutrition snapshot accepted when that version was created. An external reader can reconstruct the identity and the version chain from those tables. Restore inserts `nutrition_foods` before `recipes`, then `recipe_versions`, then `recipe_version_ingredients`. `food_id` may be null. Null macros stay null. Archive state, version ids, and ingredient order are preserved. Creating or editing a recipe does not create a nutrition entry. Logging a portion does. That entry stores `recipe_version_id`, the portion kind and amount, the resolved fraction, the recipe version name, the portion description, and the scaled nutrition. Restore inserts recipe versions before nutrition entries. Entries with no recipe provenance keep those columns null.

Owner Health data includes protocol identity, immutable protocol versions, measurement requirements, observe-only context controls, benchmark definitions, experiments, their supplement and benchmark links, and Benchmark Results (`lab_protocols`, `lab_protocol_versions`, `lab_protocol_requirements`, `lab_protocol_context_controls`, `benchmark_definitions`, `experiments`, `experiment_benchmarks`, `experiment_supplements`, `experiment_results`, `experiment_result_requirements`, `experiment_result_evidence`, `benchmark_results`, `benchmark_result_values`, `benchmark_result_evidence`). `lab_protocol_requirements.criteria` is stored with the requirement. `workout_sessions` also carries `experiment_id` and `benchmark_protocol_version_id`. All of these tables are in the full archive and in the portable export. Restore inserts protocols and experiments before workout sessions, supplements before experiment supplement links, and benchmark results before their values and evidence. It keeps the original protocol version ids, result ids, fingerprints, units, evidence JSON, and invalidation fields. A workout is not remapped onto a different protocol version. A committed Benchmark Result or Experiment Result is not recalculated from later edits to its source observations. Restore writes the stored experiment result, its requirement summaries, and its evidence snapshots. Retest scheduling is derived from the protocol intervals and valid results. It has no backup table, and the same restored facts produce the same retest state for the same `asOf` date.
