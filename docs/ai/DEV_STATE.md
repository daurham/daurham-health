# Dev state

Snapshot recorded 2026-09-27 after the V2-G2 capture-time correction. This commit is the current health application.

## Git

- Branch: `main`
- Baseline the task named: `8a0bce97c32aa3bdf9f049d82ff21091e9b0d510` (“Stage Shortcut Body captures until the owner saves a measurement.”)
- Parent of this snapshot: `e6e6d27` (“docs: correct G2 capture timestamp preservation”)
- This commit keeps the staged Shortcut instant when the owner saves without editing the measurement time
- Finished tasks are committed and pushed
- Local annotated tag `v1.0.0` points at `7124ca513efa6c833457303ee6ff79d78344fce6`. Whether that tag exists on the remote is unknown

## Schema

- Migration head: `0032_body_capture_inbox.sql`
- Applied with `npm run migrate` on 2026-09-27
- Design manual version: 1.0.39
- Package version: 1.0.0
- V2-F remains complete. V2-G1 remains implemented. Goal-observation suggestions remain deferred. Overnight vital metrics remain disabled until a payload is verified

## Staging table

- `body_capture_inbox` has no `user_id`
- Status is `pending`, `committed`, or `discarded`
- Unique `(source_id, external_capture_id)` for the `body_shortcut` source
- `canonical_session_id` references `body_measurement_sessions` with `ON DELETE SET NULL`
- A committed row may keep a null session id after the owner deletes the measurement. `committed_at` stays set
- Notes are at most 2000 characters. Metrics are a JSON array of 1–14 staged entries
- Timezone check is `America/Phoenix`

## Source

- New data source key: `body_shortcut` (`Body Shortcut`, kind `shortcut`)
- The canonical session uses the existing `manual` source so edit and delete stay available
- Shortcut origin is a `source_record_links` row, not the session source

## Token

- `BODY_CAPTURE_TOKEN` is server-only. It is blank in `.env.example` and is not a `VITE_` variable
- It authorizes only `POST /api/ingest/body`
- Missing token is 503. A wrong bearer is 401. A non-POST with a valid token is 405
- An owner session does not authorize intake
- `APPLE_HEALTH_SYNC_TOKEN` does not authorize Body intake. `BODY_CAPTURE_TOKEN` does not authorize Apple ingest or any owner route
- The token is not in the browser, Settings, responses, demo, backup, or portable export

## Intake

- Contract `body-capture-v1`
- Fields: `version`, `captureId`, `capturedAt`, `timezone`, `metrics`, `notes`
- `captureId` is 1–80 characters from `[A-Za-z0-9_-]`
- `capturedAt` must include a timezone offset (`Z`, `±HH:MM`, `±HHMM`, or `YYYY-MM-DD HH:mm:ss ±HHMM`). Date-only values are rejected
- Future times use the existing Body skew of 120 seconds
- `timezone` must be `America/Phoenix`
- Metric keys and units are `MANUAL_BODY_METRICS` and each metric's `manualInputUnits`. There is no second catalog
- At least one metric. Duplicate keys, unknown keys, illegal units, and non-finite values are rejected
- Body fat may be 0. Other metrics must be greater than 0. Missing metrics are not stored as zero
- Staged values keep the owner-supplied number and normalized unit. They are not pre-converted to kilograms or centimeters
- Notes are optional. The 2000-character bound is on capture and inbox commit. Ordinary manual `parseNotes` is unchanged
- Unknown top-level fields and extra metric fields are rejected
- Response: `{ accepted: true, id, status, reviewPath, duplicate }`
- `reviewPath` is `/body/inbox/<uuid>` with no query string and no measurement values

## Idempotency

- The same `captureId` and the same captured instant, notes, and staged metrics return the existing inbox row with `duplicate: true`
- The same `captureId` with different evidence returns 409 and does not update the row
- Identity is not derived from weight

## Owner inbox

- `GET /api/body/inbox` returns pending items, at most 20, plus `pendingCount`
- `GET /api/body/inbox/:id` returns status, captured time, timezone, staged metrics with labels, notes, `canCommit`, `canDiscard`, and `canonicalSessionId` only after commit
- `POST /api/body/inbox/:id/commit` and `POST /api/body/inbox/:id/discard`
- Anonymous is 401. A non-owner is 403. Neither machine token is accepted
- Body shows Captures only when `pendingCount` is greater than 0: count, time, a short metric preview, and Review
- `/body/inbox/:id` is a secondary page, not a tab
- The review page says the capture is not in Body until save succeeds. The owner can change the measured time, edit values, remove or add a manual metric, edit notes, discard, or save
- Kilograms and centimeters are converted into the form's pounds and inches before display. Commit parses those owner-facing numbers again
- The measurement-time field shows Phoenix time with seconds (`step=1`)
- Save submits the stored `capturedAt` until the owner changes that field. Editing weight, another metric, or notes does not replace it
- Seconds and fractional seconds on the staged instant stay intact on that untouched path
- An explicit time edit is parsed as America/Phoenix and keeps the entered seconds. The HTML control does not edit fractional seconds
- Commit still revalidates `measuredAt` with the existing Body parser and the 120-second future skew
- Shortcut setup is `docs/body-shortcut.md`. A native share sheet is not implemented

## Commit

- Commit is the only path from a staged capture to canonical Body data
- The server revalidates with `parseManualCreate`. Invalid review input is 400 and the row stays pending
- One statement locks the inbox row, inserts one `body_measurement_sessions` row (`source` manual, timezone America/Phoenix, `device_name` null, `import_job_id` null), inserts `body_metrics` with `value_kind` `manual`, inserts the provenance link, and marks the inbox committed with `canonical_session_id` and `committed_at`
- A failed statement leaves the inbox pending
- A repeated commit returns the existing session and does not write again
- Concurrent commits wait on `FOR UPDATE`. The second sees `committed` and inserts nothing
- A discarded row cannot be committed
- Discard of a pending row is idempotent. A second discard does not reset `discarded_at`
- A committed row cannot be discarded. There is no hard delete of the inbox row
- Provenance fingerprint: `body_shortcut|body-capture-v1|<captureId>`
- `entity_type` is `body_measurement_session`
- `source_payload` is the original staged capture built from the inbox row, not the edited review values
- The inbox `metrics` column is not rewritten on commit

## Edit and delete

- The committed session remains a normal manual measurement. Existing PATCH and DELETE still apply
- Editing the session does not rewrite the Shortcut payload
- Deleting the session sets `canonical_session_id` to null. The inbox row stays `committed`
- `source_record_links.entity_id` has no foreign key, so that link can remain after the session is gone
- A later commit does not recreate the deleted session

## Analytics

- Pending and discarded rows are not loaded by Today, Progress, Goals, Compare, or Timeline
- After commit, the canonical session participates through existing Body queries
- Timeline has no `body_capture` kind. The measurement appears once as `body_measurement`
- Fit Profile XLSX is unchanged and does not use the inbox
- `/body?action=measure` does not require the inbox

## Backup and demo

- `body_capture_inbox` is in the full backup, `portable: false`
- Canonical sessions and metrics stay portable
- `body_shortcut` and `source_record_links` stay full-backup provenance
- Restore order follows inventory: `data_sources`, `body_measurement_sessions`, `body_capture_inbox`, `source_record_links`
- A committed inbox row that points at a missing session fails backup verification
- No token is in the backup
- The demo omits the inbox. It does not call `/api/ingest/body` or mention `BODY_CAPTURE_TOKEN`

## Validation

- Tests: 923 passing across 108 files
- `npx tsc -b` passed as part of `npm run build`
- `npx eslint .` passed
- `npm run build` passed. The existing Vite chunk-size warning remains
- No migration was added or applied for this correction. Schema head stays `0032_body_capture_inbox.sql`
- Signed-in review QA was not run. `/body/inbox/:id` still stops at the owner lock screen. The untouched and edited time paths are covered by the pure review helper

## Capture time

- The first review implementation formatted `capturedAt` to minute precision and always rebuilt `:00` on save. An untouched save could change `12:04:37.456` into `12:04:00`
- `reviewCommitMeasuredAt` returns the stored instant when `measuredAtEdited` is false. The flag starts false and becomes true only from the time input's change event
- `phoenixDateTimeLocal` includes seconds. `measuredAtFromPhoenixLocal` keeps a provided seconds component

## Deviations

- Canonical `source_id` is `manual`. Shortcut origin is only the `source_record_links` row. That keeps the existing edit and delete checks
- Ordinary manual notes stay unbounded. The 2000-character bound applies to capture intake and inbox commit
- After the owner deletes a committed session, `canonical_session_id` becomes null and a repeated commit does not create a replacement session
- An explicit time edit does not preserve fractional seconds. Those remain only when the time field is untouched

## Remaining V2-G work

- Native iOS share-sheet targeting is deferred
- Route geometry and nested Health Auto Export workout telemetry stay deferred
- No correction or deletion lifecycle for Health Auto Export workouts
- Goal-observation experiment suggestions and overnight vital metrics remain deferred from earlier slices
