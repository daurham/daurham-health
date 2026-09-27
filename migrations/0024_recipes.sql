-- First-class Recipes. A recipe is a reusable preparation, not a food and not a consumed entry.
-- Version 1 snapshots the food basis used at creation so later food edits cannot rewrite it.

CREATE TABLE recipes (
  id UUID PRIMARY KEY,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE recipe_versions (
  id UUID PRIMARY KEY,
  recipe_id UUID NOT NULL REFERENCES recipes (id),
  version INTEGER NOT NULL,
  is_current BOOLEAN NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  yield_servings NUMERIC,
  finished_weight_g NUMERIC,
  calories_kcal NUMERIC NOT NULL,
  protein_g NUMERIC,
  carbs_g NUMERIC,
  fat_g NUMERIC,
  calculation_version TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recipe_versions_version_positive CHECK (version >= 1),
  CONSTRAINT recipe_versions_recipe_version_key UNIQUE (recipe_id, version),
  CONSTRAINT recipe_versions_name_present CHECK (btrim(name) <> ''),
  CONSTRAINT recipe_versions_name_length CHECK (char_length(btrim(name)) <= 200),
  CONSTRAINT recipe_versions_notes_present CHECK (notes IS NULL OR btrim(notes) <> ''),
  CONSTRAINT recipe_versions_notes_length CHECK (notes IS NULL OR char_length(notes) <= 2000),
  CONSTRAINT recipe_versions_yield_positive CHECK (yield_servings IS NULL OR yield_servings > 0),
  CONSTRAINT recipe_versions_weight_positive CHECK (finished_weight_g IS NULL OR finished_weight_g > 0),
  CONSTRAINT recipe_versions_calories_finite CHECK (calories_kcal >= 0),
  CONSTRAINT recipe_versions_protein_finite CHECK (protein_g IS NULL OR protein_g >= 0),
  CONSTRAINT recipe_versions_carbs_finite CHECK (carbs_g IS NULL OR carbs_g >= 0),
  CONSTRAINT recipe_versions_fat_finite CHECK (fat_g IS NULL OR fat_g >= 0),
  CONSTRAINT recipe_versions_calculation_known CHECK (calculation_version = 'recipe-v1')
);

CREATE UNIQUE INDEX recipe_versions_one_current
  ON recipe_versions (recipe_id)
  WHERE is_current;

CREATE TABLE recipe_version_ingredients (
  id UUID PRIMARY KEY,
  recipe_version_id UUID NOT NULL REFERENCES recipe_versions (id),
  position INTEGER NOT NULL,
  food_id UUID REFERENCES nutrition_foods (id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  scale_factor NUMERIC NOT NULL,
  food_name_snapshot TEXT NOT NULL,
  food_source_type_snapshot TEXT,
  food_source_external_id_snapshot TEXT,
  base_serving_amount_snapshot NUMERIC,
  base_serving_unit_snapshot TEXT,
  base_weight_grams_snapshot NUMERIC,
  base_calories_kcal_snapshot NUMERIC NOT NULL,
  base_protein_g_snapshot NUMERIC,
  base_carbs_g_snapshot NUMERIC,
  base_fat_g_snapshot NUMERIC,
  line_calories_kcal NUMERIC NOT NULL,
  line_protein_g NUMERIC,
  line_carbs_g NUMERIC,
  line_fat_g NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT recipe_version_ingredients_position_key UNIQUE (recipe_version_id, position),
  CONSTRAINT recipe_version_ingredients_position_positive CHECK (position >= 1),
  CONSTRAINT recipe_version_ingredients_amount_positive CHECK (amount > 0),
  CONSTRAINT recipe_version_ingredients_scale_positive CHECK (scale_factor > 0),
  CONSTRAINT recipe_version_ingredients_unit_present CHECK (btrim(unit) <> ''),
  CONSTRAINT recipe_version_ingredients_unit_length CHECK (char_length(btrim(unit)) <= 80),
  CONSTRAINT recipe_version_ingredients_name_present CHECK (btrim(food_name_snapshot) <> ''),
  CONSTRAINT recipe_version_ingredients_name_length CHECK (char_length(food_name_snapshot) <= 200),
  CONSTRAINT recipe_version_ingredients_calories_finite CHECK (base_calories_kcal_snapshot >= 0 AND line_calories_kcal >= 0),
  CONSTRAINT recipe_version_ingredients_protein_pair CHECK (
    (base_protein_g_snapshot IS NULL AND line_protein_g IS NULL)
    OR (base_protein_g_snapshot IS NOT NULL AND line_protein_g IS NOT NULL AND base_protein_g_snapshot >= 0 AND line_protein_g >= 0)
  ),
  CONSTRAINT recipe_version_ingredients_carbs_pair CHECK (
    (base_carbs_g_snapshot IS NULL AND line_carbs_g IS NULL)
    OR (base_carbs_g_snapshot IS NOT NULL AND line_carbs_g IS NOT NULL AND base_carbs_g_snapshot >= 0 AND line_carbs_g >= 0)
  ),
  CONSTRAINT recipe_version_ingredients_fat_pair CHECK (
    (base_fat_g_snapshot IS NULL AND line_fat_g IS NULL)
    OR (base_fat_g_snapshot IS NOT NULL AND line_fat_g IS NOT NULL AND base_fat_g_snapshot >= 0 AND line_fat_g >= 0)
  )
);

CREATE INDEX recipe_version_ingredients_food_idx
  ON recipe_version_ingredients (food_id);
