-- Canonical Activity / Sleep foundation for Apple Health and later Shortcut ingestion.
-- Apple Health is a source, not the permanent domain model.

CREATE TABLE activity_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  value NUMERIC NOT NULL,
  canonical_unit TEXT NOT NULL,
  source_unit TEXT NOT NULL,
  source_name TEXT NULL,
  source_version TEXT NULL,
  device_name TEXT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id),
  import_job_id UUID NULL REFERENCES import_jobs(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT activity_samples_metric_present CHECK (btrim(metric_key) <> ''),
  CONSTRAINT activity_samples_canonical_unit_present CHECK (btrim(canonical_unit) <> ''),
  CONSTRAINT activity_samples_source_unit_present CHECK (btrim(source_unit) <> ''),
  CONSTRAINT activity_samples_end_not_before_start CHECK (end_at >= start_at)
);

CREATE INDEX activity_samples_metric_start_idx
  ON activity_samples (metric_key, start_at);

CREATE INDEX activity_samples_import_job_idx
  ON activity_samples (import_job_id);

CREATE TABLE sleep_intervals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  stage TEXT NOT NULL,
  source_category TEXT NOT NULL,
  source_name TEXT NULL,
  source_version TEXT NULL,
  device_name TEXT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id),
  import_job_id UUID NULL REFERENCES import_jobs(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sleep_intervals_stage_present CHECK (btrim(stage) <> ''),
  CONSTRAINT sleep_intervals_source_category_present CHECK (btrim(source_category) <> ''),
  CONSTRAINT sleep_intervals_end_not_before_start CHECK (end_at >= start_at)
);

CREATE INDEX sleep_intervals_start_idx
  ON sleep_intervals (start_at);

CREATE INDEX sleep_intervals_import_job_idx
  ON sleep_intervals (import_job_id);

CREATE TABLE activity_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_type TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  duration_min NUMERIC NULL,
  energy_kcal NUMERIC NULL,
  distance_m NUMERIC NULL,
  source_name TEXT NULL,
  source_version TEXT NULL,
  device_name TEXT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id),
  import_job_id UUID NULL REFERENCES import_jobs(id),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT activity_workouts_type_present CHECK (btrim(activity_type) <> ''),
  CONSTRAINT activity_workouts_end_not_before_start CHECK (end_at >= start_at)
);

CREATE INDEX activity_workouts_start_idx
  ON activity_workouts (start_at);

CREATE INDEX activity_workouts_import_job_idx
  ON activity_workouts (import_job_id);
