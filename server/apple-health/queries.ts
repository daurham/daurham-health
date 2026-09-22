export const APPLE_HEALTH_SOURCE_SQL = `SELECT id FROM data_sources WHERE key = 'apple_health' LIMIT 1`

export const EXISTING_APPLE_HEALTH_FINGERPRINTS_SQL = `SELECT external_fingerprint
         FROM source_record_links
         WHERE source_id = $1
           AND external_fingerprint = ANY($2::text[])`

export const INSERT_APPLE_HEALTH_JOB_SQL = `INSERT INTO import_jobs (
           id, source_id, source_filename, format_version, status, record_count,
           inserted_count, matched_count, skipped_count, error_count, metadata
         ) VALUES ($1, $2, $3, $4, 'processing', $5, 0, 0, $6, 0, $7::jsonb)`

export const GET_APPLE_HEALTH_JOB_SQL = `SELECT id, source_id, status, record_count, inserted_count, matched_count,
           skipped_count, error_count, metadata, imported_at, source_filename, format_version
         FROM import_jobs
         WHERE id = $1 AND source_id = $2
         LIMIT 1`

export const UPDATE_APPLE_HEALTH_JOB_SQL = `UPDATE import_jobs
         SET status = $2,
             inserted_count = inserted_count + $3::int,
             matched_count = matched_count + $4::int,
             skipped_count = GREATEST($5::int, skipped_count),
             record_count = GREATEST($6::int, record_count),
             error_count = error_count + $7::int,
             metadata = CASE WHEN $8::jsonb IS NULL THEN metadata ELSE $8::jsonb END
         WHERE id = $1`

export const LATEST_APPLE_HEALTH_JOB_SQL = `SELECT
           job.id,
           job.imported_at,
           job.source_filename,
           job.format_version,
           job.status,
           job.record_count,
           job.inserted_count,
           job.matched_count,
           job.skipped_count,
           job.error_count,
           job.metadata,
           (SELECT COUNT(*)::int FROM activity_samples WHERE import_job_id = job.id) AS activity_count,
           (SELECT COUNT(*)::int FROM sleep_intervals WHERE import_job_id = job.id) AS sleep_count,
           (SELECT COUNT(*)::int FROM activity_workouts WHERE import_job_id = job.id) AS workout_count
         FROM import_jobs AS job
         WHERE job.source_id = $1
         ORDER BY job.imported_at DESC
         LIMIT 1`

export const CLAIM_AND_INSERT_ACTIVITY_SAMPLE_SQL = `
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
INSERT INTO activity_samples (
  id, metric_key, start_at, end_at, value, canonical_unit, source_unit,
  source_name, source_version, device_name, source_id, import_job_id, metadata
)
SELECT
  claimed.entity_id,
  $8,
  $9::timestamptz,
  $10::timestamptz,
  $11::numeric,
  $12,
  $13,
  $14,
  $15,
  $16,
  $2::uuid,
  $3::uuid,
  $17::jsonb
FROM claimed
`.trim()

export const CLAIM_AND_INSERT_SLEEP_INTERVAL_SQL = `
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
INSERT INTO sleep_intervals (
  id, start_at, end_at, stage, source_category, source_name, source_version,
  device_name, source_id, import_job_id, metadata
)
SELECT
  claimed.entity_id,
  $8::timestamptz,
  $9::timestamptz,
  $10,
  $11,
  $12,
  $13,
  $14,
  $2::uuid,
  $3::uuid,
  $15::jsonb
FROM claimed
`.trim()

export const CLAIM_AND_INSERT_ACTIVITY_WORKOUT_SQL = `
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
INSERT INTO activity_workouts (
  id, activity_type, start_at, end_at, duration_min, energy_kcal, distance_m,
  source_name, source_version, device_name, source_id, import_job_id, metadata
)
SELECT
  claimed.entity_id,
  $8,
  $9::timestamptz,
  $10::timestamptz,
  $11::numeric,
  $12::numeric,
  $13::numeric,
  $14,
  $15,
  $16,
  $2::uuid,
  $3::uuid,
  $17::jsonb
FROM claimed
`.trim()
