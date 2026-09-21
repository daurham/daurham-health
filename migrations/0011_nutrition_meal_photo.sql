-- Meal photo capture: reuse nutrition_capture_jobs and group component entries.
-- Images stay on Home-AI disk, not Neon.

INSERT INTO data_sources (key, display_name, source_kind)
VALUES ('meal_photo', 'Meal Photo', 'image')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE nutrition_capture_jobs
  DROP CONSTRAINT nutrition_capture_jobs_kind_allowed;

ALTER TABLE nutrition_capture_jobs
  ADD CONSTRAINT nutrition_capture_jobs_kind_allowed
  CHECK (capture_kind IN ('nutrition_label', 'meal_photo'));

ALTER TABLE nutrition_entries
  ADD COLUMN meal_group_id UUID NULL;

CREATE INDEX nutrition_entries_meal_group_idx
  ON nutrition_entries (meal_group_id)
  WHERE meal_group_id IS NOT NULL;
