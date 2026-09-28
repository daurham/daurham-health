import { BODY_INBOX_LIST_LIMIT } from '../../src/domain/body-capture.js'

export const BODY_CAPTURE_SOURCE_SQL = `
  SELECT key, id::text AS id
  FROM data_sources
  WHERE key IN ('manual', 'body_shortcut')
`

export const BODY_CAPTURE_STAGE_SQL = `
  WITH inserted AS (
    INSERT INTO body_capture_inbox (
      external_capture_id, status, captured_at, timezone, metrics, notes, source_id
    ) VALUES (
      $1, 'pending', $2::timestamptz, $3, $4::jsonb, $5, $6::uuid
    )
    ON CONFLICT (source_id, external_capture_id) DO NOTHING
    RETURNING id::text AS id, status, captured_at, timezone, metrics, notes
  )
  SELECT id, status, captured_at, timezone, metrics, notes, false AS existing
  FROM inserted
  UNION ALL
  SELECT id::text AS id, status, captured_at, timezone, metrics, notes, true AS existing
  FROM body_capture_inbox
  WHERE source_id = $6::uuid
    AND external_capture_id = $1
    AND NOT EXISTS (SELECT 1 FROM inserted)
`

export const BODY_CAPTURE_COMMIT_SQL = `
  WITH locked AS (
    SELECT id, status, canonical_session_id, external_capture_id, captured_at, timezone, metrics, notes
    FROM body_capture_inbox
    WHERE id = $1::uuid
    FOR UPDATE
  ),
  inserted_session AS (
    INSERT INTO body_measurement_sessions (
      id, measured_at, timezone, source_id, import_job_id, device_name, notes
    )
    SELECT $2::uuid, $3::timestamptz, $4, $5::uuid, NULL, NULL, $6
    FROM locked
    WHERE locked.status = 'pending'
    RETURNING id
  ),
  inserted_metrics AS (
    INSERT INTO body_metrics (
      id, measurement_session_id, metric_key, value, unit, value_kind
    )
    SELECT u.metric_id::uuid, inserted_session.id, u.metric_key, u.metric_value::numeric, u.metric_unit, 'manual'
    FROM inserted_session
    CROSS JOIN unnest($7::text[], $8::text[], $9::text[], $10::text[])
      AS u(metric_id, metric_key, metric_value, metric_unit)
    RETURNING id
  ),
  inserted_link AS (
    INSERT INTO source_record_links (
      id, source_id, entity_type, entity_id, external_id, external_fingerprint, source_payload
    )
    SELECT
      $12::uuid,
      $13::uuid,
      'body_measurement_session',
      inserted_session.id,
      locked.external_capture_id,
      'body_shortcut|body-capture-v1|' || locked.external_capture_id,
      jsonb_build_object(
        'version', 'body-capture-v1',
        'captureId', locked.external_capture_id,
        'capturedAt', locked.captured_at,
        'timezone', locked.timezone,
        'metrics', locked.metrics,
        'notes', locked.notes
      )
    FROM inserted_session
    CROSS JOIN locked
    ON CONFLICT (source_id, external_fingerprint) DO NOTHING
    RETURNING id
  ),
  updated AS (
    UPDATE body_capture_inbox AS inbox
    SET status = 'committed',
        canonical_session_id = inserted_session.id,
        committed_at = now(),
        updated_at = now()
    FROM inserted_session, locked
    WHERE inbox.id = locked.id
      AND locked.status = 'pending'
    RETURNING inbox.id
  ),
  guard AS (
    SELECT CASE
      WHEN NOT EXISTS (SELECT 1 FROM locked) THEN 1
      WHEN (SELECT status FROM locked) <> 'pending' THEN 1
      WHEN (SELECT COUNT(*) FROM inserted_session) <> 1 THEN (1 / 0)
      WHEN (SELECT COUNT(*) FROM inserted_metrics) <> $11::int THEN (1 / 0)
      WHEN NOT EXISTS (SELECT 1 FROM updated) THEN (1 / 0)
      ELSE 1
    END AS ok
  )
  SELECT
    locked.status AS previous_status,
    locked.canonical_session_id::text AS existing_session_id,
    (SELECT id::text FROM inserted_session) AS inserted_session_id,
    guard.ok
  FROM locked
  CROSS JOIN guard
`

export const BODY_CAPTURE_DISCARD_SQL = `
  WITH locked AS (
    SELECT id, status
    FROM body_capture_inbox
    WHERE id = $1::uuid
    FOR UPDATE
  ),
  updated AS (
    UPDATE body_capture_inbox AS inbox
    SET status = 'discarded',
        discarded_at = COALESCE(inbox.discarded_at, now()),
        updated_at = now()
    FROM locked
    WHERE inbox.id = locked.id
      AND locked.status IN ('pending', 'discarded')
    RETURNING inbox.id
  )
  SELECT locked.status AS previous_status
  FROM locked
`

export const BODY_CAPTURE_LIST_SQL = `
  WITH pending AS (
    SELECT id::text AS id, captured_at, timezone, metrics, notes
    FROM body_capture_inbox
    WHERE status = 'pending'
  )
  SELECT
    (SELECT COUNT(*)::int FROM pending) AS pending_count,
    items.id,
    items.captured_at,
    items.timezone,
    items.metrics,
    items.notes
  FROM (SELECT 1) AS anchor
  LEFT JOIN (
    SELECT id, captured_at, timezone, metrics, notes
    FROM pending
    ORDER BY captured_at DESC
    LIMIT ${BODY_INBOX_LIST_LIMIT}
  ) AS items ON true
`

export const BODY_CAPTURE_DETAIL_SQL = `
  SELECT
    id::text AS id,
    status,
    captured_at,
    timezone,
    metrics,
    notes,
    canonical_session_id::text AS canonical_session_id
  FROM body_capture_inbox
  WHERE id = $1::uuid
`
