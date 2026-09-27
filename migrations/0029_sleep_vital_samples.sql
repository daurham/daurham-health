-- Timestamped physiological observations that may fall inside a canonical Sleep episode.
-- Association to a night is derived from episode bounds. The night is not a column.
-- No nightly median table. No user_id.

CREATE TABLE sleep_vital_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key TEXT NOT NULL,
  value_numeric NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  start_at TIMESTAMPTZ NULL,
  end_at TIMESTAMPTZ NULL,
  source_family TEXT NOT NULL,
  transport_source_id UUID NULL REFERENCES data_sources(id),
  import_job_id UUID NULL REFERENCES import_jobs(id),
  fingerprint TEXT NOT NULL,
  source_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sleep_vital_samples_metric_known CHECK (
    metric_key IN (
      'heart_rate',
      'hrv_sdnn',
      'respiratory_rate',
      'oxygen_saturation',
      'sleeping_wrist_temperature'
    )
  ),
  CONSTRAINT sleep_vital_samples_unit_matches CHECK (
    (metric_key = 'heart_rate' AND unit = 'bpm')
    OR (metric_key = 'hrv_sdnn' AND unit = 'ms')
    OR (metric_key = 'respiratory_rate' AND unit = 'breaths/min')
    OR (metric_key = 'oxygen_saturation' AND unit = '%')
    OR (metric_key = 'sleeping_wrist_temperature' AND unit = '°C')
  ),
  CONSTRAINT sleep_vital_samples_family_present CHECK (btrim(source_family) <> ''),
  CONSTRAINT sleep_vital_samples_fingerprint_present CHECK (btrim(fingerprint) <> ''),
  CONSTRAINT sleep_vital_samples_fingerprint_key UNIQUE (fingerprint),
  CONSTRAINT sleep_vital_samples_bounds_ordered CHECK (
    start_at IS NULL OR end_at IS NULL OR end_at >= start_at
  )
);

CREATE INDEX sleep_vital_samples_observed_at_idx
  ON sleep_vital_samples (observed_at);
