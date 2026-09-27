import { ACTIVITY_WORKOUT_ENTITY } from '../../src/domain/apple-health/config.js'
import { HAE_WORKOUT_STRATEGY } from '../../src/domain/apple-health/hae-workouts.js'

export { HAE_WORKOUT_STRATEGY }

export const HAE_WORKOUT_LOCK_SQL = `SELECT pg_advisory_xact_lock(hashtext('fp:' || $1)),
                pg_advisory_xact_lock(hashtext('sem:' || $2))`

/**
 * Semantic activity identity in SQL. Keep this equivalent to
 * semanticActivityIdentity in src/domain/apple-health/hae-workouts.ts:
 * strip a leading HKWorkoutActivityType, split camel case, lowercase, and
 * collapse punctuation and spacing. It is not a fuzzy comparison.
 */
export function semanticActivitySql(column: string): string {
  return `btrim(regexp_replace(lower(regexp_replace(regexp_replace(btrim(${column}), '^HKWorkoutActivityType', '', 'i'), '([a-z0-9])([A-Z])', '\\1 \\2', 'g')), '[^a-z0-9]+', ' ', 'g'))`
}

export const HAE_WORKOUT_PERSIST_SQL = `
WITH existing AS (
  SELECT srl.entity_id::text AS entity_id,
         w.start_at,
         w.end_at,
         w.activity_type
  FROM source_record_links srl
  JOIN activity_workouts w ON w.id = srl.entity_id
  WHERE srl.source_id = $1::uuid
    AND srl.external_fingerprint = $2
    AND srl.entity_type = $3
),
candidates AS (
  SELECT w.id::text AS id
  FROM activity_workouts w
  WHERE NOT EXISTS (SELECT 1 FROM existing)
    AND w.start_at = $4::timestamptz
    AND w.end_at = $5::timestamptz
    AND ${semanticActivitySql('w.activity_type')} = $6
),
candidate_count AS (
  SELECT COUNT(*)::int AS n,
         (ARRAY_AGG(id ORDER BY id))[1] AS id
  FROM candidates
),
linked AS (
  INSERT INTO source_record_links (
    id, source_id, import_job_id, external_id, external_fingerprint,
    entity_type, entity_id, source_payload
  )
  SELECT $7::uuid, $1::uuid, $8::uuid, $9, $2, $3, candidate_count.id::uuid, $10::jsonb
  FROM candidate_count
  WHERE candidate_count.n = 1
  ON CONFLICT (source_id, external_fingerprint) DO NOTHING
  RETURNING entity_id::text AS entity_id
),
claimed AS (
  INSERT INTO source_record_links (
    id, source_id, import_job_id, external_id, external_fingerprint,
    entity_type, entity_id, source_payload
  )
  SELECT $11::uuid, $1::uuid, $8::uuid, $9, $2, $3, $12::uuid, $10::jsonb
  FROM candidate_count
  WHERE candidate_count.n = 0
    AND NOT EXISTS (SELECT 1 FROM existing)
  ON CONFLICT (source_id, external_fingerprint) DO NOTHING
  RETURNING entity_id::text AS entity_id
),
inserted AS (
  INSERT INTO activity_workouts (
    id, activity_type, start_at, end_at, duration_min, energy_kcal, distance_m,
    source_name, source_version, device_name, source_id, import_job_id, metadata
  )
  SELECT claimed.entity_id::uuid,
         $13,
         $4::timestamptz,
         $5::timestamptz,
         $14::numeric,
         $15::numeric,
         $16::numeric,
         NULL,
         NULL,
         NULL,
         $1::uuid,
         $8::uuid,
         $17::jsonb
  FROM claimed
  RETURNING id::text AS id
)
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM existing) THEN 'hae'
    WHEN (SELECT n FROM candidate_count) > 1 THEN 'ambiguous'
    WHEN EXISTS (SELECT 1 FROM inserted) THEN 'inserted'
    WHEN EXISTS (SELECT 1 FROM linked) THEN 'existing'
    ELSE 'hae'
  END AS outcome,
  COALESCE(
    (SELECT entity_id FROM existing),
    (SELECT id FROM inserted),
    (SELECT entity_id FROM linked)
  ) AS entity_id,
  (SELECT start_at FROM existing) AS existing_start,
  (SELECT end_at FROM existing) AS existing_end,
  (SELECT activity_type FROM existing) AS existing_type
`.trim()

export const LATEST_HAE_WORKOUT_AT_SQL = `SELECT MAX(w.start_at) AS latest_workout_at
         FROM activity_workouts w
         JOIN source_record_links srl
           ON srl.entity_id = w.id
          AND srl.entity_type = $2
          AND srl.source_id = $1`

export const HAE_WORKOUT_ENTITY = ACTIVITY_WORKOUT_ENTITY
