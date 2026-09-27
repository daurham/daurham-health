INSERT INTO data_sources (key, display_name, source_kind)
VALUES ('usda_fooddata_central', 'USDA FoodData Central', 'reference')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE nutrition_foods DROP CONSTRAINT nutrition_foods_source_kind_valid;

ALTER TABLE nutrition_foods
  ADD CONSTRAINT nutrition_foods_source_kind_valid
  CHECK (source_kind IN ('manual', 'migrated', 'barcode', 'ocr', 'photo_ai', 'shortcut', 'import', 'usda', 'description_ai'));

DROP INDEX nutrition_foods_name_brand_kind_uidx;

CREATE UNIQUE INDEX nutrition_foods_name_brand_kind_uidx
  ON nutrition_foods (lower(btrim(name)), lower(btrim(COALESCE(brand, ''))), catalog_kind)
  WHERE archived = false AND source_kind <> 'usda';

INSERT INTO source_record_links (
  source_id, import_job_id, external_id, external_fingerprint, entity_type, entity_id, source_payload
)
SELECT
  sources.id,
  NULL,
  substring(foods.notes FROM '^fdc:([0-9]+)'),
  'usda-fdc-serving-v1|{"amount":' ||
    CASE
      WHEN foods.serving_quantity = trunc(foods.serving_quantity) THEN trunc(foods.serving_quantity)::bigint::text
      ELSE trim(trailing '0' FROM trim(trailing '.' FROM foods.serving_quantity::text))
    END ||
    ',"fdcId":' || substring(foods.notes FROM '^fdc:([0-9]+)') ||
    ',"grams":' ||
    CASE
      WHEN foods.serving_grams = trunc(foods.serving_grams) THEN trunc(foods.serving_grams)::bigint::text
      ELSE trim(trailing '0' FROM trim(trailing '.' FROM foods.serving_grams::text))
    END ||
    ',"unit":' || to_json(lower(btrim(foods.serving_unit)))::text || '}',
  'nutrition_food',
  foods.id,
  jsonb_build_object(
    'provider', 'usda_fooddata_central',
    'fdcId', substring(foods.notes FROM '^fdc:([0-9]+)')::integer,
    'amount', foods.serving_quantity,
    'unit', foods.serving_unit,
    'grams', foods.serving_grams
  )
FROM nutrition_foods foods
JOIN data_sources sources ON sources.key = 'usda_fooddata_central'
WHERE foods.source_kind = 'usda'
  AND foods.notes ~ '^fdc:[0-9]+'
  AND foods.serving_grams IS NOT NULL
ON CONFLICT (source_id, external_fingerprint) DO NOTHING;

UPDATE nutrition_foods
SET
  brand = CASE
    WHEN brand ~ ' · fdc [0-9]+$' THEN NULL
    WHEN notes ~ '^fdc:[0-9]+\nUSDA FoodData Central\nportion: '
      AND brand = substring(notes FROM 'portion: ([^\n]+)') THEN NULL
    ELSE brand
  END,
  notes = NULLIF(
    btrim(
      CASE
        WHEN notes ~ '^fdc:[0-9]+$' THEN ''
        WHEN notes ~ '^fdc:[0-9]+\nUSDA FoodData Central\nportion: [^\n]+$' THEN ''
        WHEN notes ~ '^fdc:[0-9]+\nUSDA FoodData Central\nportion: [^\n]+\n'
          THEN regexp_replace(notes, '^fdc:[0-9]+\nUSDA FoodData Central\nportion: [^\n]+\n?', '')
        WHEN notes ~ '^fdc:[0-9]+\n' THEN regexp_replace(notes, '^fdc:[0-9]+\n', '')
        ELSE notes
      END
    ),
    ''
  )
WHERE source_kind = 'usda'
  AND notes ~ '^fdc:[0-9]+';
