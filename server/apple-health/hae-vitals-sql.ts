export const SLEEP_VITAL_ENTITY = 'sleep_vital_sample'
export const HAE_VITAL_STRATEGY = 'health_auto_export_sleep_vitals'

export const WINDOW_SLEEP_VITALS_SQL = `SELECT samples.id::text AS id,
           samples.metric_key,
           samples.fingerprint,
           samples.transport_source_id::text AS transport_source_id
         FROM sleep_vital_samples AS samples
         WHERE samples.metric_key = ANY($1::text[])
           AND samples.observed_at >= $2::timestamptz
           AND samples.observed_at <= $3::timestamptz`

export const VITAL_LINK_OWNERSHIP_SQL = `SELECT srl.entity_id::text AS id,
           bool_or(ds.key = 'health_auto_export') AS hae_owned
         FROM source_record_links AS srl
         JOIN data_sources AS ds ON ds.id = srl.source_id
         WHERE srl.entity_type = $2
           AND srl.entity_id = ANY($1::uuid[])
         GROUP BY srl.entity_id`

export const INSERT_SLEEP_VITAL_SQL = `WITH claimed AS (
  INSERT INTO source_record_links (
    id, source_id, import_job_id, external_id, external_fingerprint,
    entity_type, entity_id, source_payload
  ) VALUES (
    $1::uuid, $2::uuid, $3::uuid, NULL, $4, $5, $6::uuid, $7::jsonb
  )
  ON CONFLICT (source_id, external_fingerprint) DO NOTHING
  RETURNING entity_id
)
INSERT INTO sleep_vital_samples (
  id, metric_key, value_numeric, unit, observed_at, start_at, end_at,
  source_family, transport_source_id, import_job_id, fingerprint, source_metadata
)
SELECT
  claimed.entity_id,
  $8,
  $9,
  $10,
  $11::timestamptz,
  $12::timestamptz,
  $13::timestamptz,
  $14,
  $2::uuid,
  $3::uuid,
  $4,
  $15::jsonb
FROM claimed
ON CONFLICT (fingerprint) DO NOTHING
RETURNING id`

export const DELETE_SLEEP_VITAL_LINKS_SQL = `DELETE FROM source_record_links
         WHERE entity_type = $2
           AND entity_id = ANY($1::uuid[])`

export const DELETE_HAE_SLEEP_VITALS_SQL = `DELETE FROM sleep_vital_samples
         WHERE id = ANY($1::uuid[])
           AND transport_source_id = $2::uuid
           AND metric_key = ANY($3::text[])`
