-- V2-A2: owner measurement cadence plus correction timestamps.
-- Cadence is configuration. It does not create body observations.
-- Circumference values stay on body_metrics with canonical unit cm.

ALTER TABLE body_measurement_sessions
  ADD COLUMN updated_at TIMESTAMPTZ;

UPDATE body_measurement_sessions
  SET updated_at = created_at
  WHERE updated_at IS NULL;

ALTER TABLE body_measurement_sessions
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE body_metrics
  ADD COLUMN updated_at TIMESTAMPTZ;

UPDATE body_metrics
  SET updated_at = created_at
  WHERE updated_at IS NULL;

ALTER TABLE body_metrics
  ALTER COLUMN updated_at SET DEFAULT now(),
  ALTER COLUMN updated_at SET NOT NULL;

CREATE TABLE body_measurement_cadences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_key TEXT NOT NULL UNIQUE,
  interval_days INT NOT NULL,
  enabled_from DATE NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT body_measurement_cadences_metric_key_present CHECK (btrim(metric_key) <> ''),
  CONSTRAINT body_measurement_cadences_interval_range CHECK (interval_days BETWEEN 1 AND 3650),
  CONSTRAINT body_measurement_cadences_metric_key_allowed CHECK (
    metric_key IN (
      'weight',
      'body_fat_percentage',
      'waist_circumference',
      'hip_circumference',
      'chest_circumference',
      'neck_circumference',
      'left_upper_arm_circumference',
      'right_upper_arm_circumference',
      'left_forearm_circumference',
      'right_forearm_circumference',
      'left_thigh_circumference',
      'right_thigh_circumference',
      'left_calf_circumference',
      'right_calf_circumference'
    )
  )
);

COMMENT ON TABLE body_measurement_cadences IS
  'Owner opt-in reminder cadence per metric. Absence means no cadence. This table does not store measurements.';
