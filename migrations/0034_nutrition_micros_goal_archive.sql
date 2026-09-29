-- V2-H1 nutrition micronutrients and safe Goal retirement.

ALTER TABLE nutrition_foods
  ADD COLUMN sodium NUMERIC NULL,
  ADD CONSTRAINT nutrition_foods_sodium_finite CHECK (sodium IS NULL OR sodium >= 0);

ALTER TABLE nutrition_entries
  ADD COLUMN sodium NUMERIC NULL,
  ADD CONSTRAINT nutrition_entries_sodium_finite CHECK (sodium IS NULL OR sodium >= 0);

ALTER TABLE nutrition_targets
  ADD COLUMN sodium_target NUMERIC NULL,
  ADD CONSTRAINT nutrition_targets_sodium_nonnegative CHECK (sodium_target IS NULL OR sodium_target >= 0);

ALTER TABLE recipe_versions
  ADD COLUMN fiber_g NUMERIC NULL,
  ADD COLUMN sodium_mg NUMERIC NULL,
  ADD CONSTRAINT recipe_versions_fiber_finite CHECK (fiber_g IS NULL OR fiber_g >= 0),
  ADD CONSTRAINT recipe_versions_sodium_finite CHECK (sodium_mg IS NULL OR sodium_mg >= 0);

ALTER TABLE recipe_version_ingredients
  ADD COLUMN base_fiber_g_snapshot NUMERIC NULL,
  ADD COLUMN base_sodium_mg_snapshot NUMERIC NULL,
  ADD COLUMN line_fiber_g NUMERIC NULL,
  ADD COLUMN line_sodium_mg NUMERIC NULL,
  ADD CONSTRAINT recipe_version_ingredients_fiber_pair CHECK (
    (base_fiber_g_snapshot IS NULL AND line_fiber_g IS NULL)
    OR (base_fiber_g_snapshot IS NOT NULL AND line_fiber_g IS NOT NULL AND base_fiber_g_snapshot >= 0 AND line_fiber_g >= 0)
  ),
  ADD CONSTRAINT recipe_version_ingredients_sodium_pair CHECK (
    (base_sodium_mg_snapshot IS NULL AND line_sodium_mg IS NULL)
    OR (base_sodium_mg_snapshot IS NOT NULL AND line_sodium_mg IS NOT NULL AND base_sodium_mg_snapshot >= 0 AND line_sodium_mg >= 0)
  );

ALTER TABLE goals ADD COLUMN archived_at TIMESTAMPTZ NULL;
CREATE INDEX goals_archived_idx ON goals (archived_at) WHERE archived_at IS NOT NULL;
