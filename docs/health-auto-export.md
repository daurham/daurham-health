# Health Auto Export

Health Auto Export daily summaries are the canonical source for steps, active energy, Apple exercise time, and resting heart rate. The Apple XML archive remains the source for sleep intervals and workout summaries.

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

## Step counts

Health Auto Export may send fractional step totals. Canonical steps truncate toward zero:

- 18525.951 becomes 18525
- 6851.477 becomes 6851
- 7645.730 becomes 7645

The original quantity is kept in the import evidence. Values are not rounded to the nearest integer.

## What this does not sync

Walking and running distance, workout automation, Progress, and Timeline are not part of this activity setup. Sleep uses a separate automation on the same endpoint.
