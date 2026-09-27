-- V2-D1 First-class Goals.
-- Goal identity is stable. Target revisions are immutable goal_versions.
-- Lifecycle status lives on the goal and does not create a version.
-- This migration does not store projections, reminders, or AI proposals.

CREATE TABLE goals (
  id UUID PRIMARY KEY,
  goal_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  started_on DATE NOT NULL,
  body_metric_key TEXT NULL,
  exercise_definition_id UUID NULL REFERENCES exercise_definitions (id),
  benchmark_definition_id UUID NULL REFERENCES benchmark_definitions (id),
  benchmark_protocol_version_id UUID NULL REFERENCES lab_protocol_versions (id),
  benchmark_requirement_id UUID NULL REFERENCES lab_protocol_requirements (id),
  supplement_id UUID NULL REFERENCES supplements (id),
  source_id UUID NOT NULL REFERENCES data_sources (id),
  paused_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT goals_kind_allowed CHECK (
    goal_kind IN (
      'body_metric',
      'strength_e1rm',
      'benchmark_result',
      'training_frequency',
      'activity_steps',
      'nutrition_protein',
      'sleep_duration',
      'supplement_adherence'
    )
  ),
  CONSTRAINT goals_status_allowed CHECK (status IN ('active', 'paused', 'completed')),
  CONSTRAINT goals_lifecycle_state CHECK (
    (status = 'active' AND paused_at IS NULL AND completed_at IS NULL)
    OR (status = 'paused' AND paused_at IS NOT NULL AND completed_at IS NULL)
    OR (status = 'completed' AND paused_at IS NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT goals_body_metric_key_known CHECK (
    body_metric_key IS NULL OR body_metric_key IN (
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
  ),
  CONSTRAINT goals_selector_shape CHECK (
    (
      goal_kind = 'body_metric'
      AND body_metric_key IS NOT NULL
      AND exercise_definition_id IS NULL
      AND benchmark_definition_id IS NULL
      AND benchmark_protocol_version_id IS NULL
      AND benchmark_requirement_id IS NULL
      AND supplement_id IS NULL
    )
    OR (
      goal_kind = 'strength_e1rm'
      AND exercise_definition_id IS NOT NULL
      AND body_metric_key IS NULL
      AND benchmark_definition_id IS NULL
      AND benchmark_protocol_version_id IS NULL
      AND benchmark_requirement_id IS NULL
      AND supplement_id IS NULL
    )
    OR (
      goal_kind = 'benchmark_result'
      AND benchmark_definition_id IS NOT NULL
      AND benchmark_protocol_version_id IS NOT NULL
      AND benchmark_requirement_id IS NOT NULL
      AND body_metric_key IS NULL
      AND exercise_definition_id IS NULL
      AND supplement_id IS NULL
    )
    OR (
      goal_kind = 'supplement_adherence'
      AND supplement_id IS NOT NULL
      AND body_metric_key IS NULL
      AND exercise_definition_id IS NULL
      AND benchmark_definition_id IS NULL
      AND benchmark_protocol_version_id IS NULL
      AND benchmark_requirement_id IS NULL
    )
    OR (
      goal_kind IN ('training_frequency', 'activity_steps', 'nutrition_protein', 'sleep_duration')
      AND body_metric_key IS NULL
      AND exercise_definition_id IS NULL
      AND benchmark_definition_id IS NULL
      AND benchmark_protocol_version_id IS NULL
      AND benchmark_requirement_id IS NULL
      AND supplement_id IS NULL
    )
  )
);

CREATE INDEX goals_status_idx ON goals (status);

CREATE TABLE goal_versions (
  id UUID PRIMARY KEY,
  goal_id UUID NOT NULL REFERENCES goals (id),
  version INTEGER NOT NULL,
  is_current BOOLEAN NOT NULL,
  target_mode TEXT NOT NULL,
  target_min NUMERIC NULL,
  target_max NUMERIC NULL,
  target_unit TEXT NOT NULL,
  target_date DATE NULL,
  evaluation_window_days INTEGER NULL,
  notes TEXT NULL,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT goal_versions_version_positive CHECK (version >= 1),
  CONSTRAINT goal_versions_goal_version_key UNIQUE (goal_id, version),
  CONSTRAINT goal_versions_mode_allowed CHECK (target_mode IN ('at_least', 'at_most', 'range')),
  CONSTRAINT goal_versions_target_shape CHECK (
    (
      target_mode = 'at_least'
      AND target_min IS NOT NULL
      AND target_max IS NULL
      AND target_min > 0
    )
    OR (
      target_mode = 'at_most'
      AND target_min IS NULL
      AND target_max IS NOT NULL
      AND target_max > 0
    )
    OR (
      target_mode = 'range'
      AND target_min IS NOT NULL
      AND target_max IS NOT NULL
      AND target_min > 0
      AND target_min <= target_max
    )
  ),
  CONSTRAINT goal_versions_unit_known CHECK (
    target_unit IN (
      'lb',
      'in',
      '%',
      'sessions/week',
      'steps/day',
      'g/day',
      'min/night',
      'reps',
      'sets',
      'seconds',
      'kg',
      'cm',
      'percent',
      'kcal',
      'g',
      'count',
      'minutes',
      'bpm'
    )
  ),
  CONSTRAINT goal_versions_window_known CHECK (
    evaluation_window_days IS NULL OR evaluation_window_days IN (7, 14, 30, 90)
  ),
  CONSTRAINT goal_versions_notes_present CHECK (notes IS NULL OR btrim(notes) <> ''),
  CONSTRAINT goal_versions_notes_length CHECK (notes IS NULL OR char_length(notes) <= 2000)
);

CREATE UNIQUE INDEX goal_versions_one_current
  ON goal_versions (goal_id)
  WHERE is_current;
