-- V2-H1 secondary Nutrition nutrients and safe Goal retirement.
-- Missing fiber/sodium remain NULL. Existing rows are not backfilled to zero.

ALTER TABLE nutrition_foods
  ADD COLUMN sodium_mg NUMERIC NULL,
  ADD CONSTRAINT nutrition_foods_sodium_nonnegative CHECK (sodium_mg IS NULL OR sodium_mg >= 0);

ALTER TABLE nutrition_entries
  ADD COLUMN sodium_mg NUMERIC NULL,
  ADD CONSTRAINT nutrition_entries_sodium_nonnegative CHECK (sodium_mg IS NULL OR sodium_mg >= 0);

ALTER TABLE nutrition_targets
  ADD COLUMN sodium_target_mg NUMERIC NULL,
  ADD CONSTRAINT nutrition_targets_sodium_nonnegative CHECK (sodium_target_mg IS NULL OR sodium_target_mg >= 0);

ALTER TABLE recipe_versions
  ADD COLUMN fiber_g NUMERIC NULL,
  ADD COLUMN sodium_mg NUMERIC NULL,
  ADD CONSTRAINT recipe_versions_fiber_nonnegative CHECK (fiber_g IS NULL OR fiber_g >= 0),
  ADD CONSTRAINT recipe_versions_sodium_nonnegative CHECK (sodium_mg IS NULL OR sodium_mg >= 0);

ALTER TABLE recipe_version_ingredients
  ADD COLUMN base_fiber_g_snapshot NUMERIC NULL,
  ADD COLUMN base_sodium_mg_snapshot NUMERIC NULL,
  ADD COLUMN line_fiber_g NUMERIC NULL,
  ADD COLUMN line_sodium_mg NUMERIC NULL,
  ADD CONSTRAINT recipe_version_ingredients_base_fiber_nonnegative CHECK (
    base_fiber_g_snapshot IS NULL OR base_fiber_g_snapshot >= 0
  ),
  ADD CONSTRAINT recipe_version_ingredients_base_sodium_nonnegative CHECK (
    base_sodium_mg_snapshot IS NULL OR base_sodium_mg_snapshot >= 0
  ),
  ADD CONSTRAINT recipe_version_ingredients_line_fiber_nonnegative CHECK (
    line_fiber_g IS NULL OR line_fiber_g >= 0
  ),
  ADD CONSTRAINT recipe_version_ingredients_line_sodium_nonnegative CHECK (
    line_sodium_mg IS NULL OR line_sodium_mg >= 0
  );

ALTER TABLE goals
  ADD COLUMN archived_at TIMESTAMPTZ NULL;

CREATE INDEX goals_archived_at_idx ON goals (archived_at);
