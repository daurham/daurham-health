export type ImportJobCounts = {
  recordCount: number
  insertedCount: number
  matchedCount: number
  skippedCount: number
  errorCount: number
}

export function resolveImportJobCounts(input: {
  recordCount: number
  selectedCount: number
  unselectedCount: number
  insertedCount: number
  errorCount?: number
}): ImportJobCounts {
  const insertedCount = Math.max(0, input.insertedCount)
  const matchedCount = Math.max(0, input.selectedCount - insertedCount)
  return {
    recordCount: input.recordCount,
    insertedCount,
    matchedCount,
    skippedCount: Math.max(0, input.unselectedCount),
    errorCount: input.errorCount ?? 0,
  }
}

export const CLAIM_AND_INSERT_SESSION_SQL = `
WITH claimed AS (
  INSERT INTO source_record_links (
    id, source_id, import_job_id, external_id, external_fingerprint,
    entity_type, entity_id, source_payload
  ) VALUES (
    $1::uuid, $2::uuid, $3::uuid, NULL, $4, $5, $6::uuid, $7::jsonb
  )
  ON CONFLICT (source_id, external_fingerprint) DO NOTHING
  RETURNING entity_id
)
INSERT INTO body_measurement_sessions (
  id, measured_at, timezone, source_id, import_job_id, device_name, notes, metadata
)
SELECT
  claimed.entity_id,
  $8::timestamptz,
  $9,
  $2::uuid,
  $3::uuid,
  $10,
  NULL,
  $11::jsonb
FROM claimed
`.trim()

export function buildMetricsInsertSql(metricCount: number): string {
  if (metricCount < 1) {
    throw new Error('Cannot build a metrics insert with no values')
  }
  const valueFragments = Array.from({ length: metricCount }, (_, index) => {
    const offset = index * 6
    return `($${offset + 1}::uuid, $${offset + 2}::uuid, $${offset + 3}, $${offset + 4}::numeric, $${offset + 5}, $${offset + 6})`
  })
  const linkIdParam = metricCount * 6 + 1
  return `
INSERT INTO body_metrics (
  id, measurement_session_id, metric_key, value, unit, value_kind
)
SELECT v.id, v.measurement_session_id, v.metric_key, v.value, v.unit, v.value_kind
FROM (VALUES ${valueFragments.join(', ')}) AS v(id, measurement_session_id, metric_key, value, unit, value_kind)
WHERE EXISTS (
  SELECT 1
  FROM source_record_links AS claimed
  WHERE claimed.id = $${linkIdParam}::uuid
    AND claimed.entity_id = v.measurement_session_id
)
`.trim()
}

export const UPDATE_IMPORT_JOB_COUNTS_SQL = `
UPDATE import_jobs AS job
SET inserted_count = counted.inserted,
    matched_count = GREATEST($2::int - counted.inserted, 0),
    skipped_count = $3::int,
    error_count = $4::int,
    record_count = $5::int,
    status = 'completed'
FROM (
  SELECT COUNT(*)::int AS inserted
  FROM body_measurement_sessions
  WHERE import_job_id = $1::uuid
) AS counted
WHERE job.id = $1::uuid
`.trim()
