# Dev state

Snapshot recorded 2026-09-27 after V2-G1 Ongoing Apple Workout Ingestion. This commit is the current health application.

## Git

- Branch: `main`
- Baseline the task named: `55468f04c65c9bd0ccacce40d386f5349980c805` (“Add an explicit literature drawer beside Ask Health.”)
- Parent of this snapshot: `c5a64bf` (“docs: define V2-G1 ongoing Apple workout ingestion”)
- This commit ingests Health Auto Export JSON v2 workout objects into `activity_workouts`. It does not add a migration
- Finished tasks are committed and pushed
- Local annotated tag `v1.0.0` points at `7124ca513efa6c833457303ee6ff79d78344fce6`. Whether that tag exists on the remote is unknown

## Schema

- Migration head in the working tree: `0031_experiment_origins.sql`
- No migration was applied for G1. `activity_workouts` and `source_record_links` already store the required facts
- Design manual version in the working tree: 1.0.37
- Package version: 1.0.0
- V2-F remains complete. Goal-observation suggestions remain deferred. Overnight vital metrics remain disabled until a payload is verified

## Parser

- Calculation version: `hae-workout-v1`
- Import job strategy: `health_auto_export_workouts`
- Supported HAE v2 workout fields: `id`, `name`, offset-aware `start`, offset-aware `end`, `duration` in seconds, optional `activeEnergyBurned` `{qty, units}`, optional `distance` `{qty, units}`, optional `location`, optional `isIndoor`
- Ignored or deferred: legacy v1 workouts without `id`, `activeEnergy`, `totalEnergy` as a substitute for active energy, route geometry, heart-rate streams, cadence, power, step samples, and other nested telemetry. Include Workout Metrics is not required and those samples are not stored
- A missing `workouts` array means the channel is absent. A present non-array is invalid. An empty array is valid
- No sanitized live HAE payload was available. Fixtures follow the official v2 contract fetched from the Health Auto Export workouts documentation

## Source identity

- `source_name`, `source_version`, and `device_name` stay null
- `source_id` remains the `health_auto_export` transport
- Metadata may record `transport = health_auto_export` and `exportVersion = v2`
- A nested sample source such as Apple Watch is not promoted to the observing source

## Fingerprint and matching

- Fingerprint: `health_auto_export|workout|v2|<provider id>`
- The same id is also stored on `source_record_links.external_id`
- Calories and distance are not part of the fingerprint
- The same provider id matches the existing canonical row and does not insert another workout or another link
- Cross-transport match requires the same start instant, the same end instant, and the same activity identity after formatting normalization (`HKWorkoutActivityTypeRunning` and `Running`)
- Overlap alone does not match. Name similarity does not match
- One match keeps the historical row and adds a Health Auto Export provenance link
- Several matches fail closed for that workout: no insert, and the result counts `workoutsAmbiguous`
- A repeated id whose start, end, or activity identity disagrees with the linked row fails closed. The historical row is not moved or renamed. That count is `workoutsConflict`, and `workoutsIgnored` counts the same refusals
- Optional-field differences do not create a second event
- Omission from a later rolling payload is not a deletion. There is no general correction or edit lifecycle
- Concurrent ingestion of one provider id uses the existing `(source_id, external_fingerprint)` unique key, `ON CONFLICT DO NOTHING`, and a transaction-scoped advisory lock. HTTP success is returned after that transaction commits

## Ingest API

- `POST /api/ingest/apple-health` remains the only machine ingest route. The same write-only `APPLE_HEALTH_SYNC_TOKEN` authorizes it. No new Vercel function
- Workouts-only, metrics-only, metrics plus workouts, and Sleep plus workouts are accepted
- Metric, sleep, and vital parsers run only when `data.metrics` is an array
- Every present channel is parsed before any write
- Result counts: `workoutsSeen`, `workoutsInserted`, `workoutsMatchedHae`, `workoutsMatchedExisting`, `workoutsAmbiguous`, `workoutsConflict`, `workoutsIgnored`
- The HTTP body does not include the raw payload
- Settings → Data sources → Apple Health reports historical archive workouts, the Health Auto Export workout channel, and states that both stay in Activity and never become Training. A workouts-only sync is a successful Health Auto Export sync even when no daily Activity row was written. The bearer token is not shown

## Today, Timeline, and Training

- Today Activity lists the current Phoenix day's workouts, sorted by start, at most three lines plus an additional count. Examples: `Walking · 42 min`, `Hiking · 1h 13m`
- A workout with no daily summary does not show “No activity data received yet today.”
- Workout energy is not added to daily active energy. Workout duration is not added to daily exercise minutes
- Timeline has no new event kind. One `activity_workouts` row is one `activity_workout` event under the Activity filter, including a cross-source match. Activity workouts stay out of Timeline All
- No Apple workout becomes a Training session, set, volume total, performance best, consistency count, or PR
- Activity daily-summary analytics are unchanged

## Backup, demo, and auth

- Backup inventory is unchanged. A full archive keeps the canonical workout and both provenance links. The portable export keeps the readable Activity workout fields and omits `source_record_links`. Today presentation lines are not backup columns
- The demo shows one fictional current-day walk on the Today Activity card. It does not call Health Auto Export or an owner API, and that walk is not a Training session
- Auth is unchanged: bearer write on the ingest route, no owner read with that token, wrong method unchanged

## Validation

- Tests: 905 passing across 106 files
- `npx tsc -b` passed
- `npx eslint .` passed
- `npm run build` passed. The existing Vite chunk-size warning remains
- No migration command was run
- Manual owner QA was not run. The signed-in app is behind the owner lock screen. Demo Today was checked at desktop width and at 390px: Activity shows `Walking · 42 min` beside 3,840 steps and 186 active kcal, Training stays Lower A, and the page does not overflow

## Deviations

- `workoutsConflict` is reported in addition to `workoutsIgnored`. `workoutsIgnored` counts those same fail-closed conflicts. Ambiguous matches stay in `workoutsAmbiguous`
- Duration is stored from the provider's duration seconds, converted to minutes. It is not recomputed from end minus start

## Remaining V2-G work

- Route geometry and nested workout telemetry stay deferred
- No correction or deletion lifecycle for Health Auto Export workouts
- Observing source and device stay unknown for these rows
- Goal-observation experiment suggestions and overnight vital metrics remain deferred from earlier slices
