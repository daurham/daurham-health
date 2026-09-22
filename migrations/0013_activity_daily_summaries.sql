-- Compact canonical Activity day for Health.
-- activity_samples from 0012 stays available for bounded sample-level use.
-- A historical Apple export must not backfill that table.

CREATE TABLE activity_daily_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date DATE NOT NULL,
  timezone TEXT NOT NULL,
  steps_count NUMERIC NULL,
  active_energy_kcal NUMERIC NULL,
  exercise_minutes NUMERIC NULL,
  walking_running_distance_m NUMERIC NULL,
  resting_heart_rate_bpm NUMERIC NULL,
  calculation_version TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_id UUID NOT NULL REFERENCES data_sources(id),
  import_job_id UUID NULL REFERENCES import_jobs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT activity_daily_summaries_timezone_present CHECK (btrim(timezone) <> ''),
  CONSTRAINT activity_daily_summaries_calculation_present CHECK (btrim(calculation_version) <> ''),
  CONSTRAINT activity_daily_summaries_date_timezone_key UNIQUE (summary_date, timezone)
);

CREATE INDEX activity_daily_summaries_import_job_idx
  ON activity_daily_summaries (import_job_id);
