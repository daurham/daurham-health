# Health Auto Export

Health Auto Export daily summaries are the canonical source for steps, active energy, Apple exercise time, and resting heart rate. A separate Workouts automation sends JSON v2 workout objects into the existing Activity workout rows. The Apple XML archive remains the historical source for sleep intervals and earlier workout summaries.

Daily walking and running distance is not ingested. The default Health Auto Export aggregate failed Apple Health UI validation on multi-source days (2025-08-30: Apple showed 2.2 mi, the export aggregate was 6.624 mi and included Circular). Health Auto Export can prefer a source later. Until that is validated, `walking_running_distance_m` stays empty. Workout rows may still carry their own workout distance.

## Activity automations

Both automations write to the same endpoint, `POST /api/ingest/apple-health`. The bearer token is server-only (`APPLE_HEALTH_SYNC_TOKEN`). It is not a `VITE_` variable, it is not shown in Settings, and it cannot read Health data. Do not put the token value in this document.

Shared settings:

- Data type: Health Metrics
- Metrics: Step Count, Active Energy, Apple Exercise Time, Resting Heart Rate
- Do not select Walking + Running Distance
- Format: JSON
- Version: v2
- Summarize data: On
- Time grouping: Days
- Batch requests: Off
- Header: `Authorization: Bearer <APPLE_HEALTH_SYNC_TOKEN>`

### History

Purpose: reconcile recent completed days.

Date range: Previous 7 Days. On Sep 22 that window is Sep 15–21. It does not include the current calendar day.

A late phone sync can replace a day that was still changing. Repeating a day updates that day's exported values. A metric missing from a later payload is left as it was. A missing resting heart rate stays empty. It is not copied forward and it is not stored as zero.

### Current day

Purpose: keep Today's provisional Activity current.

Date range: the current day in Health Auto Export.

The same metrics apply. A repeated same-day summary updates the canonical row for that day. It does not replace completed history by itself. Run this automation alongside Previous 7 Days.

This sync does not use Home AI or the Beelink.

Enable the automations only after production has `APPLE_HEALTH_SYNC_TOKEN` set. The same write-only endpoint also accepts a separate Sleep Analysis automation. Sleep reconciliation may replace Health Auto Export intervals inside its window. It does not delete Apple XML sleep evidence.

## Workout automation

Purpose: keep Activity workout objects current. They never become Training sessions.

Use a separate Health Auto Export automation. It posts to the same endpoint with the same bearer token.

- Data type: Workouts
- Format: JSON
- Export version: v2
- Header: `Authorization: Bearer <APPLE_HEALTH_SYNC_TOKEN>`
- A rolling window is safe. The provider workout id is idempotent, so a repeated workout does not create a second Activity row.
- Route data is not required. Include Workout Metrics is not required. Route geometry, heart-rate streams, cadence, power, and other nested workout metrics are ignored and are not stored.

Stored summary fields are the workout id, name, start, end, duration, and, when the payload includes them, active energy burned and distance. Location and the indoor flag may be kept in metadata. `totalEnergy` is not used as active energy. A workout missing from a later export is left in place. It is not deleted.

## Step counts

Health Auto Export may send fractional step totals. Canonical steps truncate toward zero:

- 18525.951 becomes 18525
- 6851.477 becomes 6851
- 7645.730 becomes 7645

The original quantity is kept in the import evidence. Values are not rounded to the nearest integer.

## What this does not sync

Walking and running distance on the daily Activity summary, route geometry, nested workout telemetry, Progress calculations, and Timeline event kinds are not part of this setup. Sleep uses a separate automation on the same endpoint. Workouts use the automation above and stay in Activity.

## Sleep vitals

No Sleep Vitals automation is configured.

The repository fixtures and the current Activity and Sleep automations do not contain an unaggregated heart-rate, HRV, respiratory-rate, oxygen-saturation, or wrist-temperature export. The only `heart_rate` example is a midnight daily point, and the activity parser ignores it. `resting_heart_rate` stays an Activity day summary. It is not overnight heart rate.

Do not add those metrics to the Activity automations or to the Sleep Analysis automation. A separate automation that sends individual observations is the intended path once a payload verifies the metric name, unit, timestamp, and source. Until that export exists, those metrics stay disabled. Inspect a saved payload with `tsx server/apple-health/vital-audit-cli.ts <payload.json>`. The audit prints metric names, units, and source families. It does not print quantities or device identifiers.
