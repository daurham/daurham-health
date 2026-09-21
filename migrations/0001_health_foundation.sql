-- Provenance and import-tracking foundation only.
-- This is not a generic EAV health-data store.

CREATE TABLE data_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO data_sources (key, display_name, source_kind)
VALUES
  ('manual', 'Manual', 'manual'),
  ('health_app', 'Health App', 'application'),
  ('legacy_nutrition', 'Legacy Nutrition', 'file_import'),
  ('fit_profile_xlsx', 'Fit Profile XLSX', 'file_import'),
  ('apple_health', 'Apple Health', 'device_export'),
  ('workout_image', 'Workout Image', 'image'),
  ('home_ai', 'Home AI', 'ai')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES data_sources(id),
  imported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_filename TEXT NULL,
  format_version TEXT NULL,
  status TEXT NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT import_jobs_status_present CHECK (btrim(status) <> ''),
  CONSTRAINT import_jobs_record_count_nonnegative CHECK (record_count >= 0),
  CONSTRAINT import_jobs_inserted_count_nonnegative CHECK (inserted_count >= 0),
  CONSTRAINT import_jobs_matched_count_nonnegative CHECK (matched_count >= 0),
  CONSTRAINT import_jobs_skipped_count_nonnegative CHECK (skipped_count >= 0),
  CONSTRAINT import_jobs_error_count_nonnegative CHECK (error_count >= 0)
);

CREATE INDEX import_jobs_source_imported_at_idx
  ON import_jobs (source_id, imported_at DESC);

CREATE UNIQUE INDEX import_jobs_source_content_hash_uidx
  ON import_jobs (source_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE TABLE source_record_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES data_sources(id),
  import_job_id UUID NULL REFERENCES import_jobs(id),
  external_id TEXT NULL,
  external_fingerprint TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  source_payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT source_record_links_fingerprint_present CHECK (btrim(external_fingerprint) <> ''),
  CONSTRAINT source_record_links_entity_type_present CHECK (btrim(entity_type) <> ''),
  CONSTRAINT source_record_links_source_fingerprint_key UNIQUE (source_id, external_fingerprint)
);

CREATE INDEX source_record_links_entity_idx
  ON source_record_links (entity_type, entity_id);
