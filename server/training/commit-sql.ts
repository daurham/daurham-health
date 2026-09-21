export const CLAIM_AND_INSERT_WORKOUT_SQL = `
WITH claimed AS (
  INSERT INTO source_record_links (
    id, source_id, import_job_id, external_id, external_fingerprint,
    entity_type, entity_id, source_payload
  ) VALUES (
    $1::uuid, $2::uuid, $3::uuid, $4, $5, $6, $7::uuid, $8::jsonb
  )
  ON CONFLICT (source_id, external_fingerprint) DO NOTHING
  RETURNING entity_id
)
INSERT INTO workout_sessions (
  id, workout_date, workout_template_id, routine_code, template_version, template_name,
  duration_min, effort, pain_level, bodyweight_kg, notes, source_kind, metadata
)
SELECT
  claimed.entity_id,
  $9::date,
  $10::uuid,
  $11,
  $12,
  $13,
  $14::numeric,
  $15::int,
  $16::int,
  $17::numeric,
  $18,
  $19,
  $20::jsonb
FROM claimed
`.trim()
