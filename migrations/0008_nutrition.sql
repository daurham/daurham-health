-- Canonical Nutrition: food definitions, consumed-entry snapshots, effective-dated targets.
-- Single-owner: no per-user identity column. Totals are derived, not stored.

CREATE TABLE nutrition_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  brand TEXT NULL,
  barcode TEXT NULL,
  catalog_kind TEXT NOT NULL,
  serving_quantity NUMERIC NOT NULL DEFAULT 1,
  serving_unit TEXT NOT NULL,
  serving_grams NUMERIC NULL,
  calories NUMERIC NOT NULL,
  protein NUMERIC NULL,
  carbs NUMERIC NULL,
  fat NUMERIC NULL,
  fiber NUMERIC NULL,
  source_kind TEXT NOT NULL,
  is_staple BOOLEAN NOT NULL DEFAULT false,
  archived BOOLEAN NOT NULL DEFAULT false,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_foods_name_present CHECK (btrim(name) <> ''),
  CONSTRAINT nutrition_foods_name_length CHECK (char_length(btrim(name)) <= 200),
  CONSTRAINT nutrition_foods_brand_length CHECK (brand IS NULL OR char_length(btrim(brand)) <= 120),
  CONSTRAINT nutrition_foods_barcode_present CHECK (barcode IS NULL OR btrim(barcode) <> ''),
  CONSTRAINT nutrition_foods_barcode_length CHECK (barcode IS NULL OR char_length(btrim(barcode)) <= 64),
  CONSTRAINT nutrition_foods_serving_unit_present CHECK (btrim(serving_unit) <> ''),
  CONSTRAINT nutrition_foods_serving_unit_length CHECK (char_length(btrim(serving_unit)) <= 80),
  CONSTRAINT nutrition_foods_serving_quantity_positive CHECK (serving_quantity > 0),
  CONSTRAINT nutrition_foods_serving_grams_positive CHECK (serving_grams IS NULL OR serving_grams > 0),
  CONSTRAINT nutrition_foods_calories_finite CHECK (calories >= 0),
  CONSTRAINT nutrition_foods_protein_finite CHECK (protein IS NULL OR protein >= 0),
  CONSTRAINT nutrition_foods_carbs_finite CHECK (carbs IS NULL OR carbs >= 0),
  CONSTRAINT nutrition_foods_fat_finite CHECK (fat IS NULL OR fat >= 0),
  CONSTRAINT nutrition_foods_fiber_finite CHECK (fiber IS NULL OR fiber >= 0),
  CONSTRAINT nutrition_foods_catalog_kind_valid CHECK (catalog_kind IN ('ingredient', 'recipe', 'packaged', 'custom')),
  CONSTRAINT nutrition_foods_source_kind_valid CHECK (source_kind IN ('manual', 'migrated', 'barcode', 'ocr', 'photo_ai', 'shortcut', 'import')),
  CONSTRAINT nutrition_foods_notes_length CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE UNIQUE INDEX nutrition_foods_barcode_uidx
  ON nutrition_foods (barcode)
  WHERE barcode IS NOT NULL;

CREATE UNIQUE INDEX nutrition_foods_name_brand_kind_uidx
  ON nutrition_foods (lower(btrim(name)), lower(btrim(COALESCE(brand, ''))), catalog_kind)
  WHERE archived = false;

CREATE INDEX nutrition_foods_name_idx
  ON nutrition_foods (lower(btrim(name)));

CREATE TABLE nutrition_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date DATE NOT NULL,
  consumed_at TIMESTAMPTZ NULL,
  timezone TEXT NOT NULL,
  meal TEXT NULL,
  food_id UUID NULL REFERENCES nutrition_foods(id) ON DELETE SET NULL,
  food_name TEXT NOT NULL,
  brand TEXT NULL,
  serving_quantity NUMERIC NOT NULL,
  serving_unit TEXT NOT NULL,
  grams NUMERIC NULL,
  calories NUMERIC NOT NULL,
  protein NUMERIC NULL,
  carbs NUMERIC NULL,
  fat NUMERIC NULL,
  fiber NUMERIC NULL,
  source_kind TEXT NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_entries_food_name_present CHECK (btrim(food_name) <> ''),
  CONSTRAINT nutrition_entries_food_name_length CHECK (char_length(btrim(food_name)) <= 200),
  CONSTRAINT nutrition_entries_timezone_present CHECK (btrim(timezone) <> ''),
  CONSTRAINT nutrition_entries_serving_unit_present CHECK (btrim(serving_unit) <> ''),
  CONSTRAINT nutrition_entries_serving_quantity_positive CHECK (serving_quantity > 0),
  CONSTRAINT nutrition_entries_grams_positive CHECK (grams IS NULL OR grams > 0),
  CONSTRAINT nutrition_entries_calories_finite CHECK (calories >= 0),
  CONSTRAINT nutrition_entries_protein_finite CHECK (protein IS NULL OR protein >= 0),
  CONSTRAINT nutrition_entries_carbs_finite CHECK (carbs IS NULL OR carbs >= 0),
  CONSTRAINT nutrition_entries_fat_finite CHECK (fat IS NULL OR fat >= 0),
  CONSTRAINT nutrition_entries_fiber_finite CHECK (fiber IS NULL OR fiber >= 0),
  CONSTRAINT nutrition_entries_meal_valid CHECK (
    meal IS NULL OR meal IN ('breakfast', 'lunch', 'dinner', 'snack', 'other')
  ),
  CONSTRAINT nutrition_entries_source_kind_valid CHECK (
    source_kind IN ('manual', 'migrated', 'barcode', 'ocr', 'photo_ai', 'shortcut', 'import')
  ),
  CONSTRAINT nutrition_entries_notes_length CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE INDEX nutrition_entries_log_date_idx
  ON nutrition_entries (log_date, consumed_at NULLS LAST, created_at, id);

CREATE INDEX nutrition_entries_food_id_idx
  ON nutrition_entries (food_id)
  WHERE food_id IS NOT NULL;

CREATE TABLE nutrition_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  effective_from DATE NOT NULL,
  calories_target NUMERIC NOT NULL,
  protein_target NUMERIC NOT NULL,
  carbs_target NUMERIC NULL,
  fat_target NUMERIC NULL,
  fiber_target NUMERIC NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT nutrition_targets_calories_positive CHECK (calories_target > 0),
  CONSTRAINT nutrition_targets_protein_nonnegative CHECK (protein_target >= 0),
  CONSTRAINT nutrition_targets_carbs_nonnegative CHECK (carbs_target IS NULL OR carbs_target >= 0),
  CONSTRAINT nutrition_targets_fat_nonnegative CHECK (fat_target IS NULL OR fat_target >= 0),
  CONSTRAINT nutrition_targets_fiber_nonnegative CHECK (fiber_target IS NULL OR fiber_target >= 0),
  CONSTRAINT nutrition_targets_effective_from_key UNIQUE (effective_from)
);
