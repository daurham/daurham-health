-- Recipe consumption provenance on ordinary nutrition entries.
-- The entry stores the consumed snapshot. recipe_version_id names the immutable formulation used.

ALTER TABLE nutrition_entries
  ADD COLUMN recipe_version_id UUID NULL REFERENCES recipe_versions (id),
  ADD COLUMN recipe_portion_kind TEXT NULL,
  ADD COLUMN recipe_portion_amount NUMERIC NULL,
  ADD COLUMN recipe_fraction NUMERIC NULL;

ALTER TABLE nutrition_entries
  ADD CONSTRAINT nutrition_entries_recipe_portion_kind_valid CHECK (
    recipe_portion_kind IS NULL OR recipe_portion_kind IN ('servings', 'fraction', 'grams')
  ),
  ADD CONSTRAINT nutrition_entries_recipe_provenance_coherent CHECK (
    (
      recipe_version_id IS NULL
      AND recipe_portion_kind IS NULL
      AND recipe_portion_amount IS NULL
      AND recipe_fraction IS NULL
    )
    OR (
      recipe_version_id IS NOT NULL
      AND recipe_portion_kind IS NOT NULL
      AND recipe_portion_amount IS NOT NULL
      AND recipe_fraction IS NOT NULL
      AND recipe_portion_amount > 0
      AND recipe_fraction > 0
    )
  );

CREATE INDEX nutrition_entries_recipe_version_idx
  ON nutrition_entries (recipe_version_id)
  WHERE recipe_version_id IS NOT NULL;
