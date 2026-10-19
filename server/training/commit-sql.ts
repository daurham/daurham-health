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
  duration_min, effort, pain_level, limitation_kind, limitation_note, bodyweight_kg, notes, source_kind, metadata,
  session_type, session_name
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
  $17,
  $18,
  $19::numeric,
  $20,
  $21,
  $22::jsonb,
  $23,
  $24
FROM claimed
`.trim()


/** Persist queue completion inside the SAME transaction as canonical workout,
 * exercises and source link. A separate best-effort status update can strand
 * a saved photo on Today/Training as an outstanding review. The linked session
 * must be created in this transaction before the job may be marked committed.
 */
export const COMMIT_IMPORTED_WORKOUT_JOB_SQL = `
WITH committed AS (
  UPDATE workout_transcription_jobs AS job
     SET status = 'committed',
         workout_session_id = $2::uuid,
         failure_message = NULL,
         updated_at = now()
   WHERE job.home_ai_job_id = $1
     AND job.status <> 'committed'
     AND EXISTS (
       SELECT 1 FROM source_record_links AS link
       JOIN workout_sessions AS saved ON saved.id = link.entity_id
       WHERE link.source_id = $3::uuid
         AND link.external_fingerprint = $4
         AND link.entity_type = $5
         AND link.entity_id = $2::uuid
     )
  RETURNING 1
)
-- Exactly one pending capture must be finalized; a missing/mismatched job
-- raises division_by_zero inside the transaction, rolling back all inserts.
SELECT 1 / COUNT(*)::int AS finalized FROM committed
`.trim()
