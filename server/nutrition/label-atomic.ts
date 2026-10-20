/**
 * A saved Nutrition Label Pantry food can later be logged once, but the
 * source link, daily entry and capture finalization must share one Postgres
 * statement. An old request may never undo a deliberate owner deletion.
 *
 * Rows are serialized by the committed capture lock. A failed entry insert
 * aborts the link and status update; a source fingerprint conflict creates
 * neither an entry nor a new capture association.
 */
export const ATOMIC_LABEL_PANTRY_TO_LOG_SQL = `
WITH eligible_capture AS MATERIALIZED (
  SELECT job.home_ai_job_id
    FROM nutrition_capture_jobs AS job
   WHERE job.home_ai_job_id = $1
     AND job.capture_kind = 'nutrition_label'
     AND job.status = 'committed'
     AND job.food_id = $2::uuid
     AND job.entry_id IS NULL
     AND NOT (job.interpretation ? 'ownerDeletedEntryId')
   FOR UPDATE
), claimed_link AS (
  INSERT INTO source_record_links (
    id, source_id, import_job_id, external_id, external_fingerprint,
    entity_type, entity_id, source_payload
  )
  SELECT $4::uuid, $3::uuid, NULL, $1, $5,
         'nutrition_entry', $6::uuid, $7::jsonb
    FROM eligible_capture
  ON CONFLICT (source_id, external_fingerprint) DO NOTHING
  RETURNING entity_id
), created_entry AS (
  INSERT INTO nutrition_entries (
    id, log_date, consumed_at, timezone, meal, food_id, food_name, brand,
    serving_quantity, serving_unit, grams, calories, protein, carbs, fat,
    fiber, sodium, source_kind, notes, meal_group_id
  )
  SELECT item.id, item.log_date, item.consumed_at, item.timezone,
         item.meal, item.food_id, item.food_name, item.brand,
         item.serving_quantity, item.serving_unit, item.grams,
         item.calories, item.protein, item.carbs, item.fat,
         item.fiber, item.sodium, item.source_kind, item.notes,
         item.meal_group_id
    FROM claimed_link
    CROSS JOIN jsonb_to_record($8::jsonb) AS item (
      id uuid, log_date date, consumed_at timestamptz, timezone text,
      meal text, food_id uuid, food_name text, brand text,
      serving_quantity numeric, serving_unit text, grams numeric,
      calories numeric, protein numeric, carbs numeric, fat numeric,
      fiber numeric, sodium numeric, source_kind text, notes text,
      meal_group_id uuid
    )
   WHERE item.id = $6::uuid
     AND item.food_id = $2::uuid
  RETURNING id
), finalized AS (
  UPDATE nutrition_capture_jobs AS job
     SET entry_id = created_entry.id,
         failure_message = NULL,
         updated_at = now()
    FROM eligible_capture, created_entry
   WHERE job.home_ai_job_id = eligible_capture.home_ai_job_id
  RETURNING job.entry_id
)
SELECT entry_id FROM finalized
`.trim()
