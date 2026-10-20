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

/**
 * Atomic first approved Nutrition Label save for create, log_existing and
 * update_and_log (with/without a food log). The capture is first-writer
 * serialized; failures roll back food changes, provenance and entries.
 * Pantry-only provenance uses a separate fingerprint so Pantry -> Log works.
 * Params: 1 job, 2 action, 3 shouldLog, 4 existingFood, 5 newFood,
 * 6 entry, 7 source, 8 sourceLink, 9 fingerprint, 10 sourcePayload,
 * 11 food JSON, 12 entry JSON.
 */
export const ATOMIC_LABEL_INITIAL_COMMIT_SQL = `
WITH eligible_capture AS MATERIALIZED (
  SELECT job.home_ai_job_id
  FROM nutrition_capture_jobs AS job
  WHERE job.home_ai_job_id = $1
    AND job.capture_kind = 'nutrition_label'
    AND job.status = 'completed'
    AND NOT (job.interpretation ? 'ownerDeletedEntryId')
    AND (
      $2::text = 'create'
      OR EXISTS (SELECT 1 FROM nutrition_foods existing WHERE existing.id = $4::uuid)
    )
  FOR UPDATE
), claimed_link AS (
  INSERT INTO source_record_links (
    id, source_id, import_job_id, external_id, external_fingerprint,
    entity_type, entity_id, source_payload
  )
  SELECT $8::uuid, $7::uuid, NULL, $1, $9,
    CASE WHEN $3::boolean THEN 'nutrition_entry' ELSE 'nutrition_food' END,
    CASE WHEN $3::boolean THEN $6::uuid
         WHEN $2::text = 'create' THEN $5::uuid
         ELSE $4::uuid END,
    $10::jsonb
  FROM eligible_capture
  ON CONFLICT (source_id, external_fingerprint) DO NOTHING
  RETURNING entity_id
), created_food AS (
  INSERT INTO nutrition_foods (
    id, name, brand, barcode, catalog_kind, serving_quantity, serving_unit,
    serving_grams, calories, protein, carbs, fat, fiber, sodium,
    source_kind, is_staple, notes
  )
  SELECT $5::uuid, item.name, item.brand, item.barcode, item.catalog_kind,
    item.serving_quantity, item.serving_unit, item.serving_grams,
    item.calories, item.protein, item.carbs, item.fat, item.fiber,
    item.sodium, 'photo_ai', false, NULL
  FROM claimed_link
  CROSS JOIN jsonb_to_record($11::jsonb) AS item (
    name text, brand text, barcode text, catalog_kind text,
    serving_quantity numeric, serving_unit text, serving_grams numeric,
    calories numeric, protein numeric, carbs numeric, fat numeric,
    fiber numeric, sodium numeric
  )
  WHERE $2::text = 'create'
  RETURNING id
), updated_food AS (
  UPDATE nutrition_foods AS food SET
    name = item.name,
    brand = item.brand,
    barcode = item.barcode,
    serving_quantity = item.serving_quantity,
    serving_unit = item.serving_unit,
    serving_grams = item.serving_grams,
    calories = item.calories,
    protein = item.protein,
    carbs = item.carbs,
    fat = item.fat,
    fiber = item.fiber,
    sodium = item.sodium,
    updated_at = now()
  FROM claimed_link,
       jsonb_to_record($11::jsonb) AS item (
         name text, brand text, barcode text, catalog_kind text,
         serving_quantity numeric, serving_unit text, serving_grams numeric,
         calories numeric, protein numeric, carbs numeric, fat numeric,
         fiber numeric, sodium numeric
       )
  WHERE $2::text = 'update_and_log' AND food.id = $4::uuid
  RETURNING food.id
), approved_food AS (
  SELECT id FROM created_food
  UNION ALL SELECT id FROM updated_food
  UNION ALL
  SELECT existing.id FROM nutrition_foods existing
  JOIN claimed_link ON true
  WHERE $2::text = 'log_existing' AND existing.id = $4::uuid
), created_entry AS (
  INSERT INTO nutrition_entries (
    id, log_date, consumed_at, timezone, meal, food_id, food_name, brand,
    serving_quantity, serving_unit, grams, calories, protein, carbs, fat,
    fiber, sodium, source_kind, notes, meal_group_id
  )
  SELECT entry.id, entry.log_date, entry.consumed_at, entry.timezone,
    entry.meal, approved_food.id, entry.food_name, entry.brand,
    entry.serving_quantity, entry.serving_unit, entry.grams,
    entry.calories, entry.protein, entry.carbs, entry.fat,
    entry.fiber, entry.sodium, entry.source_kind, entry.notes,
    entry.meal_group_id
  FROM approved_food
  CROSS JOIN jsonb_to_record($12::jsonb) AS entry (
    id uuid, log_date date, consumed_at timestamptz, timezone text,
    meal text, food_id uuid, food_name text, brand text,
    serving_quantity numeric, serving_unit text, grams numeric,
    calories numeric, protein numeric, carbs numeric, fat numeric,
    fiber numeric, sodium numeric, source_kind text, notes text,
    meal_group_id uuid
  )
  WHERE $3::boolean AND entry.id = $6::uuid AND entry.food_id = approved_food.id
  RETURNING id
), finalized_capture AS (
  UPDATE nutrition_capture_jobs AS capture SET
    status = 'committed',
    food_id = approved_food.id,
    entry_id = (SELECT id FROM created_entry),
    failure_message = NULL,
    committed_at = COALESCE(capture.committed_at, now()),
    updated_at = now()
  FROM approved_food
  WHERE capture.home_ai_job_id = $1
    AND capture.capture_kind = 'nutrition_label'
    AND capture.status = 'completed'
    AND EXISTS (SELECT 1 FROM claimed_link)
    AND (NOT $3::boolean OR EXISTS (SELECT 1 FROM created_entry))
  RETURNING capture.food_id, capture.entry_id
)
SELECT food_id, entry_id FROM finalized_capture
`.trim()
