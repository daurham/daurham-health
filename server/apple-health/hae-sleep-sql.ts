import { SLEEP_INTERVAL_ENTITY } from '../../src/domain/apple-health/config.js'

export const HAE_SLEEP_STRATEGY = 'health_auto_export_sleep'

export const MATCH_SLEEP_INTERVALS_SQL = `SELECT si.id::text AS id,
           si.start_at,
           si.end_at,
           si.stage,
           si.source_name,
           ds.key AS source_key
         FROM unnest($1::timestamptz[], $2::timestamptz[]) AS incoming(start_at, end_at)
         JOIN sleep_intervals AS si
           ON si.start_at = incoming.start_at
          AND si.end_at = incoming.end_at
         JOIN data_sources AS ds ON ds.id = si.source_id`

export const WINDOW_SLEEP_INTERVALS_SQL = `SELECT si.id::text AS id,
           si.start_at,
           si.end_at,
           si.stage,
           si.source_name,
           ds.key AS source_key
         FROM sleep_intervals AS si
         JOIN data_sources AS ds ON ds.id = si.source_id
         WHERE si.start_at >= $1::timestamptz
           AND si.end_at <= $2::timestamptz`

export const SLEEP_LINK_OWNERSHIP_SQL = `SELECT srl.entity_id::text AS id,
           bool_or(ds.key = 'health_auto_export') AS hae_owned,
           bool_or(ds.key = 'apple_health') AS xml_owned
         FROM source_record_links AS srl
         JOIN data_sources AS ds ON ds.id = srl.source_id
         WHERE srl.entity_type = $2
           AND srl.entity_id = ANY($1::uuid[])
         GROUP BY srl.entity_id`

export const INSERT_HAE_SLEEP_INTERVAL_SQL = `WITH claimed AS (
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
RETURNING id`

export const LINK_EXISTING_SLEEP_SQL = `INSERT INTO source_record_links (
           id, source_id, import_job_id, external_id, external_fingerprint,
           entity_type, entity_id, source_payload
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, NULL, $4, $5, $6::uuid, $7::jsonb
         )
         ON CONFLICT (source_id, external_fingerprint) DO NOTHING`

export const DELETE_HAE_SLEEP_INTERVALS_SQL = `DELETE FROM sleep_intervals
         WHERE id = ANY($1::uuid[])
           AND source_id = $2::uuid`

export const DELETE_SLEEP_LINKS_SQL = `DELETE FROM source_record_links
         WHERE entity_type = $2
           AND entity_id = ANY($1::uuid[])`

export { SLEEP_INTERVAL_ENTITY }

export const LATEST_HAE_STRATEGY_SQL = `SELECT imported_at, status
         FROM import_jobs
         WHERE source_id = $1
           AND status = 'completed'
           AND metadata->>'strategy' = $2
         ORDER BY imported_at DESC
         LIMIT 1`

export const LATEST_SLEEP_NIGHT_SQL = `SELECT MAX(sleep_date)::text AS latest_night
         FROM sleep_nightly_summaries
         WHERE timezone = $1`
