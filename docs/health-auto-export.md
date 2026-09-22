# Health Auto Export

Health Auto Export daily summaries are the canonical source for steps, active energy, Apple exercise time, and resting heart rate. The Apple XML archive remains the source for sleep intervals and workout summaries.

Daily walking and running distance is not ingested. The default Health Auto Export aggregate failed Apple Health UI validation on multi-source days (2025-08-30: Apple showed 2.2 mi, the export aggregate was 6.624 mi and included Circular). Health Auto Export can prefer a source later. Until that is validated, `walking_running_distance_m` stays empty. Workout rows may still carry their own workout distance.

## Automation

In Health Auto Export, create a REST automation:

- Data type: Health Metrics
- Metrics: Step Count, Active Energy, Apple Exercise Time, Resting Heart Rate
- Do not select Walking + Running Distance
- Format: JSON
- Version: v2
- Summarize data: On
- Time grouping: Days
- Date range: Previous 7 Days
- Batch requests: Off
- Endpoint: `https://health.daurham.com/api/ingest/apple-health`
- Header: `Authorization: Bearer <APPLE_HEALTH_SYNC_TOKEN>`

The token is server-only (`APPLE_HEALTH_SYNC_TOKEN`). It is not a `VITE_` variable, it is not shown in Settings, and it cannot read Health data or call the owner API. Rotate it by replacing the value in the server environment and in the automation header.

Previous 7 Days is the rolling window so a late phone sync can replace a day that was still changing. Repeating a day upserts that day's exported value. A metric missing from a later payload is left as it was. A missing resting heart rate stays empty. It is not copied forward and it is not stored as zero.

This sync does not use Home AI or the Beelink.

Do not turn the automation on until this endpoint is deployed and `APPLE_HEALTH_SYNC_TOKEN` is set in the production environment.

## Step counts

Health Auto Export may send fractional step totals. Canonical steps truncate toward zero:

- 18525.951 becomes 18525
- 6851.477 becomes 6851
- 7645.730 becomes 7645

The original quantity is kept in the import evidence. Values are not rounded to the nearest integer.

## What this does not sync

Sleep automation, workout automation, distance, Progress, and Timeline are separate and are not part of this setup.
