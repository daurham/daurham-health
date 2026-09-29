-- V2-H2D canonical Training measurements, Training-performance Goals, and owner Saved Routines.
-- Training stores observations only. Pace/PR/Goal/Stretch state remains derived.

ALTER TABLE exercise_definitions
  DROP CONSTRAINT exercise_definitions_measurement_kind_allowed,
  ADD CONSTRAINT exercise_definitions_measurement_kind_allowed CHECK (
    measurement_kind IN (
      'reps',
      'duration',
      'reps_per_side',
      'duration_per_side',
      'distance',
      'distance_duration',
      'completion'
    )
  );

ALTER TABLE exercise_definitions
  DROP CONSTRAINT exercise_definitions_performance_type_allowed,
  ADD CONSTRAINT exercise_definitions_performance_type_allowed CHECK (
    performance_type IN (
      'loaded_reps',
      'bodyweight_reps',
      'assisted_reps',
      'timed',
      'distance',
      'skill',
      'other'
    )
  );

ALTER TABLE workout_sets
  ADD COLUMN distance_m NUMERIC NULL,
  ADD COLUMN completed BOOLEAN NULL;

ALTER TABLE workout_sets
  DROP CONSTRAINT workout_sets_counts_nonnegative,
  ADD CONSTRAINT workout_sets_counts_nonnegative CHECK (
    (reps IS NULL OR reps >= 0)
    AND (duration_sec IS NULL OR duration_sec >= 0)
    AND (left_reps IS NULL OR left_reps >= 0)
    AND (right_reps IS NULL OR right_reps >= 0)
    AND (left_duration_sec IS NULL OR left_duration_sec >= 0)
    AND (right_duration_sec IS NULL OR right_duration_sec >= 0)
    AND (distance_m IS NULL OR distance_m > 0)
  );

ALTER TABLE workout_sets
  DROP CONSTRAINT workout_sets_measurement_family,
  ADD CONSTRAINT workout_sets_measurement_family CHECK (
    (
      reps IS NOT NULL
      AND duration_sec IS NULL
      AND left_reps IS NULL AND right_reps IS NULL
      AND left_duration_sec IS NULL AND right_duration_sec IS NULL
      AND distance_m IS NULL
      AND completed IS NULL
    ) OR (
      duration_sec IS NOT NULL
      AND reps IS NULL
      AND left_reps IS NULL AND right_reps IS NULL
      AND left_duration_sec IS NULL AND right_duration_sec IS NULL
      AND completed IS NULL
    ) OR (
      (left_reps IS NOT NULL OR right_reps IS NOT NULL)
      AND reps IS NULL
      AND duration_sec IS NULL
      AND left_duration_sec IS NULL AND right_duration_sec IS NULL
      AND distance_m IS NULL
      AND completed IS NULL
    ) OR (
      (left_duration_sec IS NOT NULL OR right_duration_sec IS NOT NULL)
      AND reps IS NULL
      AND duration_sec IS NULL
      AND left_reps IS NULL AND right_reps IS NULL
      AND distance_m IS NULL
      AND completed IS NULL
    ) OR (
      distance_m IS NOT NULL
      AND duration_sec IS NULL
      AND reps IS NULL
      AND left_reps IS NULL AND right_reps IS NULL
      AND left_duration_sec IS NULL AND right_duration_sec IS NULL
      AND completed IS NULL
    ) OR (
      duration_sec IS NOT NULL
      AND reps IS NULL
      AND left_reps IS NULL AND right_reps IS NULL
      AND left_duration_sec IS NULL AND right_duration_sec IS NULL
      AND completed IS NULL
      AND (distance_m IS NULL OR distance_m >= 0)
    ) OR (
      completed IS NOT NULL
      AND reps IS NULL
      AND duration_sec IS NULL
      AND left_reps IS NULL AND right_reps IS NULL
      AND left_duration_sec IS NULL AND right_duration_sec IS NULL
      AND distance_m IS NULL
    )
  );

ALTER TABLE goals
  ADD COLUMN training_min_distance_m NUMERIC NULL;

ALTER TABLE goals
  DROP CONSTRAINT goals_kind_allowed,
  ADD CONSTRAINT goals_kind_allowed CHECK (
    goal_kind IN (
      'body_metric',
      'strength_e1rm',
      'benchmark_result',
      'training_frequency',
      'activity_steps',
      'nutrition_protein',
      'sleep_duration',
      'supplement_adherence',
      'training_reps',
      'training_duration',
      'training_distance',
      'training_pace',
      'training_skill'
    )
  );

ALTER TABLE goals
  DROP CONSTRAINT goals_selector_shape,
  ADD CONSTRAINT goals_selector_shape CHECK (
    (
      goal_kind = 'body_metric'
      AND body_metric_key IS NOT NULL
      AND exercise_definition_id IS NULL
      AND benchmark_definition_id IS NULL
      AND benchmark_protocol_version_id IS NULL
      AND benchmark_requirement_id IS NULL
      AND supplement_id IS NULL
      AND training_min_distance_m IS NULL
    )
    OR (
      goal_kind = 'strength_e1rm'
      AND exercise_definition_id IS NOT NULL
      AND body_metric_key IS NULL
      AND benchmark_definition_id IS NULL
      AND benchmark_protocol_version_id IS NULL
      AND benchmark_requirement_id IS NULL
      AND supplement_id IS NULL
      AND training_min_distance_m IS NULL
    )
    OR (
      goal_kind IN ('training_reps', 'training_duration', 'training_distance', 'training_skill')
      AND exercise_definition_id IS NOT NULL
      AND body_metric_key IS NULL
      AND benchmark_definition_id IS NULL
      AND benchmark_protocol_version_id IS NULL
      AND benchmark_requirement_id IS NULL
      AND supplement_id IS NULL
      AND training_min_distance_m IS NULL
    )
    OR (
      goal_kind = 'training_pace'
      AND exercise_definition_id IS NOT NULL
      AND training_min_distance_m IS NOT NULL
      AND training_min_distance_m > 0
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
      AND training_min_distance_m IS NULL
    )
    OR (
      goal_kind = 'supplement_adherence'
      AND supplement_id IS NOT NULL
      AND body_metric_key IS NULL
      AND exercise_definition_id IS NULL
      AND benchmark_definition_id IS NULL
      AND benchmark_protocol_version_id IS NULL
      AND benchmark_requirement_id IS NULL
      AND training_min_distance_m IS NULL
    )
    OR (
      goal_kind IN ('training_frequency', 'activity_steps', 'nutrition_protein', 'sleep_duration')
      AND body_metric_key IS NULL
      AND exercise_definition_id IS NULL
      AND benchmark_definition_id IS NULL
      AND benchmark_protocol_version_id IS NULL
      AND benchmark_requirement_id IS NULL
      AND supplement_id IS NULL
      AND training_min_distance_m IS NULL
    )
  ),
  ADD CONSTRAINT goals_training_min_distance_positive CHECK (
    training_min_distance_m IS NULL OR training_min_distance_m > 0
  );

ALTER TABLE workout_templates
  ADD COLUMN origin_kind TEXT NOT NULL DEFAULT 'seeded',
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD CONSTRAINT workout_templates_origin_allowed CHECK (origin_kind IN ('seeded', 'owner'));

CREATE UNIQUE INDEX workout_templates_one_active_owner_version_idx
  ON workout_templates (routine_code)
  WHERE origin_kind = 'owner' AND is_active;

INSERT INTO exercise_definitions (
  external_id, name, measurement_kind, load_type, unilateral, metadata,
  performance_type, analytics_load_type, analytics_rep_mode
) VALUES
  ('EX18', 'Running', 'distance_duration', 'none', false,
   '{"activity_family":"running"}'::jsonb, 'distance', 'none', 'standard'),
  ('EX19', 'Hiking', 'distance_duration', 'none', false,
   '{"activity_family":"hiking"}'::jsonb, 'distance', 'none', 'standard')
ON CONFLICT (external_id) DO UPDATE SET
  name = EXCLUDED.name,
  measurement_kind = EXCLUDED.measurement_kind,
  load_type = EXCLUDED.load_type,
  unilateral = EXCLUDED.unilateral,
  metadata = EXCLUDED.metadata,
  performance_type = EXCLUDED.performance_type,
  analytics_load_type = EXCLUDED.analytics_load_type,
  analytics_rep_mode = EXCLUDED.analytics_rep_mode,
  is_active = true,
  updated_at = now();
