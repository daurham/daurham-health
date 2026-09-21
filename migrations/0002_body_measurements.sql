-- Canonical Body measurement sessions and EAV metrics.
-- Not a Fit Profile-specific column table.

CREATE TABLE body_measurement_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measured_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id),
  import_job_id UUID NULL REFERENCES import_jobs(id),
  device_name TEXT NULL,
  notes TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX body_measurement_sessions_measured_at_idx
  ON body_measurement_sessions (measured_at DESC);

CREATE INDEX body_measurement_sessions_source_id_idx
  ON body_measurement_sessions (source_id);

CREATE TABLE body_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  measurement_session_id UUID NOT NULL
    REFERENCES body_measurement_sessions(id)
    ON DELETE CASCADE,
  metric_key TEXT NOT NULL,
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  value_kind TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT body_metrics_metric_key_present CHECK (btrim(metric_key) <> ''),
  CONSTRAINT body_metrics_unit_present CHECK (btrim(unit) <> ''),
  CONSTRAINT body_metrics_session_metric_key UNIQUE (measurement_session_id, metric_key),
  CONSTRAINT body_metrics_value_kind_allowed CHECK (
    value_kind IN ('measured', 'device_estimated', 'vendor_derived', 'manual')
  )
);

CREATE INDEX body_metrics_key_session_idx
  ON body_metrics (metric_key, measurement_session_id);
