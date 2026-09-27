ALTER TABLE nutrition_foods DROP CONSTRAINT nutrition_foods_source_kind_valid;

ALTER TABLE nutrition_foods
  ADD CONSTRAINT nutrition_foods_source_kind_valid
  CHECK (source_kind IN ('manual', 'migrated', 'barcode', 'ocr', 'photo_ai', 'shortcut', 'import', 'usda'));
