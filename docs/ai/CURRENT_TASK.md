# Current Task — V2-G1 Ongoing Apple Workout Ingestion

Status: ready_for_implementation

Baseline commit:

55468f04c65c9bd0ccacce40d386f5349980c805

Expected baseline:

- V2-F1 through V2-F5 complete
- 884 tests passing across 105 files
- typecheck, lint, and production build passing
- schema head 0031_experiment_origins.sql
- Design manual 1.0.36
- package 1.0.0

Follow AGENTS.md and the persistent files under docs/ai/.

## Objective

Implement ongoing Health Auto Export workout-object ingestion into the existing canonical Activity workout model.

Historical Apple Health workouts already live in activity_workouts and already appear in the Activity-filtered Timeline. Ongoing HAE synchronization currently covers daily Activity summaries and Sleep, but not workout objects.

Close that gap without creating a second workout model.

Core invariant:

Apple/HAE workouts are Activity context. They never become canonical Training sessions, sets, volume, performance, consistency, or PRs.

## Current provider contract

Health Auto Export JSON version 2 documents workouts in data.workouts.

Official documentation currently requires these workout fields:

- id: unique workout identifier
- name: workout type name such as Running, Cycling, Swimming
- start: offset-aware timestamp
- end: offset-aware timestamp
- duration: seconds

Optional fields include activeEnergyBurned and distance, plus many richer fields such as location, route, heart rate, cadence, power, and other workout metrics.

For this phase, ingest only the existing canonical Activity workout facts:

- provider workout id as provenance identity
- workout name/type
- start
- end
- duration
- active energy when explicitly available
- distance when explicitly available
- small bounded non-clinical metadata such as location/isIndoor if useful

Do not ingest route geometry, heart-rate streams, cadence, power, environmental measurements, or other nested workout telemetry in this phase.

Official references for implementation verification:

https://help.healthyapps.dev/en/health-auto-export/export-format/
https://help.healthyapps.dev/en/health-auto-export/export-format/workouts/
https://help.healthyapps.dev/en/health-auto-export/automations/rest-api/

Use repository fixtures/tests. Automated tests must not call the live provider.

## Schema decision

Expected: no migration.

The existing activity_workouts table already stores:

- activity_type
- start_at
- end_at
- duration_min
- energy_kcal
- distance_m
- source_name
- source_version
- device_name
- source_id
- import_job_id
- metadata

The existing source_record_links provenance model can attach more than one source observation to the same canonical entity.

Verify current constraints before implementation. Do not add a new workout table merely because HAE uses a different transport.

Expected schema head remains:

0031_experiment_origins.sql

If repository reality proves an unavoidable schema gap, stop and document it in DEV_STATE rather than inventing a migration silently.

## Calculation/parser version

Use an explicit version such as:

hae-workout-v1

Keep it in domain/server metadata and documentation.

## New HAE workout parser

Add a deterministic parser for data.workouts, separate from the daily-metric and Sleep parsers.

Conceptual result:

- workoutsPresent
- workouts[]
- ignored optional-field counts if useful

A missing workouts array means this payload did not carry the workout channel.

An existing workouts field that is not an array is invalid.

An empty workouts array is valid.

### Required v2 fields

Each accepted workout requires:

- nonempty id
- nonempty name
- valid offset-aware start
- valid offset-aware end
- finite nonnegative duration
- end >= start

Treat duration as provider seconds and convert to canonical minutes.

Do not silently accept the legacy v1 workout format that lacks a stable id.

### Optional active energy

Use activeEnergyBurned only when explicitly present.

Normalize supported energy units through the existing unit conversion helpers.

Do not substitute totalEnergy for active energy.

Missing active energy remains null.

### Optional distance

Use the documented distance object when explicitly present.

Normalize supported distance units through existing unit conversion helpers.

Missing distance remains null.

Zero remains an explicit zero only when the provider explicitly supplies zero and existing Activity workout semantics permit it.

### Source identity

The documented HAE v2 workout object does not provide a required top-level observing source/device field.

Therefore:

- do not invent Apple Watch
- do not infer observing source from transport
- do not promote a nested metric source into the workout's observing source
- source_name stays null unless a future verified top-level provider field exists
- source_version stays null
- device_name stays null
- source_id remains the existing health_auto_export transport/provenance source

Metadata may say transport = health_auto_export and exportVersion = v2.

Transport is not observing source.

### Activity type

Store the provider's trimmed workout name as the HAE canonical activity_type for a newly inserted HAE workout.

Do not fabricate a HealthKit enum.

The existing display helper already handles human-readable activity strings.

Preserve the raw provider workout name in bounded source evidence/metadata.

## Provenance identity

Preserve the HAE workout id in source_record_links.external_id when compatible with the current schema.

Use a deterministic HAE source fingerprint derived from the stable provider workout id, for example the semantic equivalent of:

health_auto_export | workout | v2 | provider-id

Do not fingerprint a HAE workout primarily from calories/distance. Those optional values may be absent.

Repeated delivery of the same HAE workout id must not create another canonical workout.

## Cross-transport duplicate prevention

A physical workout may already exist from the historical Apple Health XML import.

Do not create a second Activity workout merely because the same event now arrives through HAE.

Implement a deterministic cross-transport semantic match.

Initial match requires:

- exact start instant
- exact end instant
- same normalized activity identity

The normalized activity identity should normalize formatting only, for example:

- historical HKWorkoutActivityTypeRunning
- HAE Running

should compare as the same semantic activity.

Likewise spacing/case/punctuation differences may normalize.

Do not use fuzzy text similarity.

Do not merge merely because two workouts overlap in time.

### Cross-source match behavior

If exactly one existing activity_workouts row matches the semantic identity:

- keep the existing canonical workout row
- attach a new health_auto_export source_record_link to that existing entity
- preserve the HAE source payload/provenance
- do not rewrite the historical canonical row merely because another transport observed it

If no match exists:

- create one new activity_workouts row
- link HAE provenance to it

If multiple existing rows are equally valid semantic matches:

- fail closed for that incoming workout
- do not choose arbitrarily
- do not insert another duplicate to avoid deciding
- report an ambiguous/conflict count in the ingest result

## Repeated HAE observations

If the same HAE provider id is already linked:

- treat it as already matched
- do not insert another row
- do not create another source link

Initial V2-G1 does not treat omission from a later rolling HAE payload as a deletion command.

Do not delete activity_workouts because a later payload omitted them.

Initial V2-G1 also does not implement a general Apple-workout correction/edit lifecycle. A repeated provider id whose core identity conflicts with the already-linked canonical event must fail closed rather than silently move/rename historical evidence.

Optional-field differences alone do not create a second event.

Document this limitation.

## Atomic/idempotent persistence

Reuse the current source_record_links claim model.

Concurrent/repeated ingestion of one HAE workout id must still result in at most one canonical entity/link.

Prefer the existing insert-claim pattern or an equally strong transaction-safe mechanism rather than process-local deduplication.

HTTP success must not be returned before persistence has committed.

## HAE channel routing

POST /api/ingest/apple-health remains the only machine-ingest endpoint.

Do not add another Vercel function.

The same write-only APPLE_HEALTH_SYNC_TOKEN authority remains.

A HAE payload may carry:

- metrics only
- workouts only
- metrics + workouts
- Sleep metrics + workouts

The handler must support a workouts-only v2 payload.

Current Sleep/vital helpers expect data.metrics. Do not let that requirement make a valid data.workouts-only payload fail.

Refactor channel detection narrowly so metric parsers run only when the metrics channel is present.

If neither a supported metrics array nor workouts array is present, retain a clean 400 validation failure.

Parse all present channels before performing writes so a malformed workout does not cause a partially accepted multi-channel payload when practical under the existing handler architecture.

## Workout ingest service

Use a separate HAE workout service rather than embedding SQL/parsing in the handler.

Suggested strategy name in import job metadata:

health_auto_export_workouts

A workout sync result should expose bounded operational counts such as:

- workoutsSeen
- workoutsInserted
- workoutsMatchedHae
- workoutsMatchedExisting
- workoutsAmbiguous
- workoutsIgnored if applicable

Do not expose private raw payload blobs in the HTTP response.

## Import jobs and sync status

Track the workout channel through the existing import_jobs/provenance infrastructure.

Extend Health Auto Export status with a workouts channel, conceptually:

- importedAt
- status
- latestWorkoutAt or latest workout date

Keep existing top-level/activity/sleep status fields backward compatible.

A workouts-only sync should be visible as a successful HAE sync rather than disappearing because no daily Activity row was written.

## Settings

Update Settings → Data sources → Apple Health.

Current text says workout summaries come from the Apple archive.

Change it to accurately state that:

- historical workouts can come from the Apple archive
- ongoing workout summaries can come from a separate Health Auto Export Workouts automation
- Apple/HAE workouts remain Activity and never become Training

Display the HAE workout channel sync status alongside Activity and Sleep.

Do not expose the machine bearer token.

## HAE setup documentation

Document the recommended owner automation:

- data type: Workouts
- JSON
- export version v2
- same POST /api/ingest/apple-health endpoint
- same Authorization bearer token
- a rolling window is safe because provider workout ids are idempotent
- route data is not required
- Include Workout Metrics is not required for V2-G1

Do not imply HAE workout metrics are being stored when they are intentionally ignored.

## Today integration

Add canonical Activity workouts for the current Phoenix date to the existing Today Activity card.

Do not add a new Today card.

Today Activity may show lines such as:

- Walking · 42 min
- Hiking · 1h 13m

Use the existing activity workout display labeling.

### Today data contract

Add a bounded list to Today activity, with fields sufficient for display:

- workout id
- activity type/label
- startAt
- durationMinutes nullable

Sort deterministically by start time.

Prefer showing at most 3 workout lines in the card and expose an additional count if more exist.

If the Activity daily summary is missing but a workout exists, the Activity card still has real Activity data and should not display the empty "No activity data received" state.

Do not add workout energy to daily active energy.

Do not add workout duration to daily exercise minutes.

Those daily metrics already have their own canonical summaries and combining them would double count.

## Training boundary

This must remain true in code and tests:

activity_workouts never write or imply workout_sessions.

An Apple Watch strength workout is Activity context only.

It does not satisfy Today Training logged state.

It does not enter:

- Training frequency
- e1RM
- Training volume
- performance bests
- F2 Training detector
- Goal Training frequency
- Personal Lab Training evidence

## Timeline

No new Timeline event kind is needed.

The existing activity_workout Timeline event already reads activity_workouts.

New HAE workouts should naturally appear under the Activity filter.

Preserve the current rule that Activity workouts are excluded from the Timeline "All" view so a year of walks does not crowd it.

Cross-transport matched workouts must appear once, not once per source link.

## Progress and analytics

Do not make workout objects alter the existing Activity daily-summary analytics.

F2/F3/Ask Health continue to use their accepted Activity metrics unless an existing path already reads workout events explicitly.

No new workout-duration correlation or score in this phase.

## Backup and portable export

No inventory change is expected because activity_workouts and source_record_links are already in the relevant backup model.

Verify:

- a newly inserted HAE workout survives full backup/restore
- portable Activity workouts remain understandable
- HAE source provenance remains in the full archive
- cross-source matched canonical workout is still one activity_workouts row

Do not add derived Today presentation fields to backup/export.

## Demo

Demo remains provider-free.

It may reuse existing synthetic Activity workout fixtures to show one current-day workout in the Today Activity card.

Do not call HAE or owner APIs.

Do not imply a demo Apple workout is Training.

## Auth/security

POST /api/ingest/apple-health remains:

- bearer-token machine write path
- no owner read authority
- no broader API authority

Do not alter owner auth.

Wrong method behavior remains unchanged.

## Tests required

Add focused tests covering at least:

1. documented HAE v2 workout object parses.
2. data.workouts-only payload is accepted by channel detection.
3. required id is enforced.
4. required name is enforced.
5. required start/end are valid offset-aware instants.
6. end before start is rejected.
7. required duration is finite/nonnegative.
8. duration seconds normalize to minutes.
9. activeEnergyBurned normalizes to kcal.
10. missing activeEnergyBurned stays null.
11. totalEnergy is not silently substituted.
12. distance normalizes to meters.
13. missing distance stays null.
14. no Apple Watch/source/device is invented.
15. nested workout-metric source does not become top-level workout source.
16. route/heart-rate/cadence/power telemetry is ignored in V2-G1.
17. stable provider id yields stable HAE fingerprint/provenance.
18. repeated same HAE id inserts one canonical workout.
19. repeated same HAE id creates one HAE source link.
20. historical HKWorkoutActivityTypeRunning and HAE Running can semantic-match.
21. exact start/end + same semantic activity links HAE to the existing canonical workout.
22. overlapping-but-different workout does not merge.
23. ambiguous semantic matches fail closed.
24. conflicting core identity for an already-linked HAE id does not rewrite history.
25. omission in a later payload does not delete a workout.
26. mixed metrics + workouts payload preserves existing Activity behavior.
27. Sleep + workouts payload preserves Sleep behavior.
28. malformed workout is detected before partial channel persistence where the handler supports preflight validation.
29. ingest result returns workout counts.
30. HAE status exposes workout sync channel.
31. Settings status schema accepts the workout channel.
32. Today current-day workouts appear in Activity.
33. Today workout list is deterministically ordered/capped.
34. a workout without a daily summary still makes Activity non-empty.
35. workout energy/duration are not added into daily summary totals.
36. Apple workouts never set Today Training logged.
37. activity_workout Timeline behavior remains Activity-only and one event per canonical row.
38. cross-source matched workout yields one Timeline event.
39. no Training session is created.
40. backup/portable behavior remains valid.
41. demo remains provider-free and Activity-only.
42. existing HAE Activity/Sleep/vital tests remain green.
43. F1-F5 regressions remain green.

Run:

- npm test
- npx tsc -b
- npx eslint .
- npm run build

Expected: no migration command.

## Manual QA

When owner runtime is available:

1. Configure a separate HAE Workouts automation using JSON v2.
2. Send a payload containing one recent workout.
3. Verify HTTP response reports the workout.
4. Send the same payload again.
5. Verify no duplicate activity_workouts row.
6. Verify Settings shows the workout sync channel.
7. Verify the workout appears once in Timeline → Activity.
8. Verify Today Activity shows a workout occurring today.
9. Verify Today Training remains unchanged.
10. Verify daily steps/energy/exercise values do not increase merely because the workout object was also ingested.
11. Test a combined metrics + workouts payload.
12. Test a workouts-only payload.
13. Verify an existing historical workout matched by exact semantic identity does not duplicate.
14. Verify no route/HR stream data is persisted by this phase.
15. Test 390px Today layout.
16. Run automated validation.

If a real HAE payload differs from the official v2 contract, preserve a sanitized fixture and document the verified difference. Do not guess around it.

## Documentation

On completion:

- update HEALTH-PLATFORM-DESIGN-MANUAL.md
- expected manual version 1.0.37
- add a new historical ledger row
- update HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md with V2-G1 ongoing Apple workout ingestion
- keep V2-F marked complete
- update docs/ai/PROJECT.md
- update docs/ai/DEV_STATE.md
- update docs/ai/DECISIONS.md
- update docs/ai/ROADMAP.md
- update docs/V2-ROADMAP.md live status
- document the HAE workout automation setup and supported v2 fields
- document the cross-transport dedupe rule
- document the no-deletion/no-general-correction limitation
- document that HAE transport is not observing-source identity

Do not rewrite older historical amendments.

Schema head should remain:

0031_experiment_origins.sql

Package remains:

1.0.0

## Acceptance criteria

V2-G1 is complete only when:

- documented HAE v2 workout objects can ingest continuously
- workouts-only payloads work
- provider workout id drives idempotent HAE provenance
- repeated rolling exports do not duplicate workouts
- historical XML and HAE exact semantic duplicates become one canonical Activity workout with multiple provenance links
- ambiguous cross-source matching fails closed
- no observing source/device is invented
- only bounded workout summary fields are stored
- routes and detailed workout telemetry remain deferred
- omission from a rolling payload does not delete history
- no Apple workout becomes Training
- existing Activity daily summaries are not double counted
- Today Activity can show current-day workout context
- Timeline continues to show one Activity workout event
- Settings reports ongoing workout sync
- backup/export remain coherent
- demo remains provider-free
- auth boundary remains narrow
- existing HAE Activity/Sleep/vital behavior is preserved
- tests pass
- typecheck passes
- lint passes
- production build passes
- docs updated

## Required completion report

Update docs/ai/DEV_STATE.md with:

- baseline commit
- resulting commit / working-tree state
- migration/schema decision
- parser/calculation version
- exact supported HAE workout fields
- exact ignored/deferred fields
- source-identity policy
- provider-id/fingerprint policy
- cross-transport semantic matching rule
- idempotency behavior
- ambiguity/conflict behavior
- import-job/status behavior
- ingest API behavior
- Today behavior
- Timeline behavior
- Training boundary
- backup/export
- demo/auth
- tests/count
- typecheck/lint/build
- manual QA
- docs version
- deviations
- remaining V2-G work

When finished, reset CURRENT_TASK.md to the standard no-active-task template, commit, and push according to AGENTS.md.

## Final invariant

A Health Auto Export workout such as Running, Walking, Hiking, Cycling, Yoga, Swimming, or an Apple-recorded strength workout may become one canonical Activity workout.

It may enrich Today and Timeline as Activity context.

It must never become a Training session merely because Apple Health called it a workout.
