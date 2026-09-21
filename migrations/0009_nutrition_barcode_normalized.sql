-- Normalized barcode uniqueness so UPC-A and equivalent EAN-13 cannot both exist.
-- Foods without barcodes are unchanged. Do not edit 0008.

UPDATE nutrition_foods
SET barcode = '0' || regexp_replace(barcode, '[^0-9]', '', 'g')
WHERE barcode IS NOT NULL
  AND length(regexp_replace(barcode, '[^0-9]', '', 'g')) = 12
  AND barcode = regexp_replace(barcode, '[^0-9]', '', 'g');

CREATE UNIQUE INDEX nutrition_foods_barcode_normalized_uidx
  ON nutrition_foods ((
    CASE
      WHEN length(regexp_replace(barcode, '[^0-9]', '', 'g')) = 12
        THEN '0' || regexp_replace(barcode, '[^0-9]', '', 'g')
      ELSE regexp_replace(barcode, '[^0-9]', '', 'g')
    END
  ))
  WHERE barcode IS NOT NULL;
