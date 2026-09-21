-- Canonical Training: exercise library, versioned templates, sessions, sets.
-- Observations only. Do not store volume, e1RM, PR flags, or other derived analytics.
-- Paper-form pixel geometry and transcription candidates do not belong here.

CREATE TABLE exercise_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NULL,
  name TEXT NOT NULL,
  measurement_kind TEXT NOT NULL,
  load_type TEXT NOT NULL,
  unilateral BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT exercise_definitions_name_present CHECK (btrim(name) <> ''),
  CONSTRAINT exercise_definitions_load_type_present CHECK (btrim(load_type) <> ''),
  CONSTRAINT exercise_definitions_measurement_kind_allowed CHECK (
    measurement_kind IN ('reps', 'duration', 'reps_per_side', 'duration_per_side')
  )
);

CREATE TABLE workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_code TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workout_templates_routine_code_present CHECK (btrim(routine_code) <> ''),
  CONSTRAINT workout_templates_version_present CHECK (btrim(version) <> ''),
  CONSTRAINT workout_templates_name_present CHECK (btrim(name) <> ''),
  CONSTRAINT workout_templates_routine_version_key UNIQUE (routine_code, version)
);

CREATE TABLE workout_template_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  exercise_definition_id UUID NOT NULL REFERENCES exercise_definitions(id),
  slot_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  planned_sets INTEGER NULL,
  prescription JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workout_template_exercises_slot_present CHECK (btrim(slot_id) <> ''),
  CONSTRAINT workout_template_exercises_position_positive CHECK (position >= 1),
  CONSTRAINT workout_template_exercises_planned_sets_positive CHECK (
    planned_sets IS NULL OR planned_sets >= 1
  ),
  CONSTRAINT workout_template_exercises_slot_key UNIQUE (workout_template_id, slot_id),
  CONSTRAINT workout_template_exercises_position_key UNIQUE (workout_template_id, position)
);

CREATE TABLE workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_date DATE NOT NULL,
  workout_template_id UUID NULL REFERENCES workout_templates(id),
  routine_code TEXT NULL,
  template_version TEXT NULL,
  template_name TEXT NULL,
  duration_min NUMERIC NULL,
  effort INTEGER NULL,
  pain_level INTEGER NULL,
  bodyweight_kg NUMERIC NULL,
  notes TEXT NULL,
  source_kind TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workout_sessions_effort_range CHECK (effort IS NULL OR (effort >= 1 AND effort <= 5)),
  CONSTRAINT workout_sessions_pain_range CHECK (pain_level IS NULL OR (pain_level >= 0 AND pain_level <= 3)),
  CONSTRAINT workout_sessions_duration_positive CHECK (duration_min IS NULL OR duration_min > 0),
  CONSTRAINT workout_sessions_bodyweight_positive CHECK (bodyweight_kg IS NULL OR bodyweight_kg > 0),
  CONSTRAINT workout_sessions_source_kind_allowed CHECK (
    source_kind IN ('manual', 'imported_candidate')
  )
);

CREATE INDEX workout_sessions_workout_date_idx
  ON workout_sessions (workout_date DESC, created_at DESC);

CREATE TABLE workout_session_exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_session_id UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_definition_id UUID NOT NULL REFERENCES exercise_definitions(id),
  position INTEGER NOT NULL,
  slot_id TEXT NULL,
  exercise_external_id TEXT NULL,
  exercise_name TEXT NOT NULL,
  notes TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workout_session_exercises_name_present CHECK (btrim(exercise_name) <> ''),
  CONSTRAINT workout_session_exercises_position_positive CHECK (position >= 1),
  CONSTRAINT workout_session_exercises_position_key UNIQUE (workout_session_id, position)
);

CREATE TABLE workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_session_exercise_id UUID NOT NULL
    REFERENCES workout_session_exercises(id)
    ON DELETE CASCADE,
  set_number INTEGER NOT NULL,
  set_type TEXT NOT NULL DEFAULT 'working',
  load_state TEXT NOT NULL,
  weight_kg NUMERIC NULL,
  reps INTEGER NULL,
  duration_sec INTEGER NULL,
  left_reps INTEGER NULL,
  right_reps INTEGER NULL,
  left_duration_sec INTEGER NULL,
  right_duration_sec INTEGER NULL,
  notes TEXT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workout_sets_set_number_positive CHECK (set_number >= 1),
  CONSTRAINT workout_sets_set_type_allowed CHECK (
    set_type IN ('working', 'warmup', 'drop', 'other')
  ),
  CONSTRAINT workout_sets_load_state_allowed CHECK (
    load_state IN ('external', 'bodyweight', 'unknown')
  ),
  CONSTRAINT workout_sets_load_weight CHECK (
    (load_state = 'external' AND weight_kg IS NOT NULL AND weight_kg >= 0)
    OR (load_state = 'bodyweight' AND weight_kg IS NULL)
    OR (load_state = 'unknown' AND weight_kg IS NULL)
  ),
  CONSTRAINT workout_sets_counts_nonnegative CHECK (
    (reps IS NULL OR reps >= 0)
    AND (duration_sec IS NULL OR duration_sec >= 0)
    AND (left_reps IS NULL OR left_reps >= 0)
    AND (right_reps IS NULL OR right_reps >= 0)
    AND (left_duration_sec IS NULL OR left_duration_sec >= 0)
    AND (right_duration_sec IS NULL OR right_duration_sec >= 0)
  ),
  CONSTRAINT workout_sets_measurement_family CHECK (
    (
      reps IS NOT NULL
      AND duration_sec IS NULL
      AND left_reps IS NULL AND right_reps IS NULL
      AND left_duration_sec IS NULL AND right_duration_sec IS NULL
    ) OR (
      duration_sec IS NOT NULL
      AND reps IS NULL
      AND left_reps IS NULL AND right_reps IS NULL
      AND left_duration_sec IS NULL AND right_duration_sec IS NULL
    ) OR (
      (left_reps IS NOT NULL OR right_reps IS NOT NULL)
      AND reps IS NULL
      AND duration_sec IS NULL
      AND left_duration_sec IS NULL AND right_duration_sec IS NULL
    ) OR (
      (left_duration_sec IS NOT NULL OR right_duration_sec IS NOT NULL)
      AND reps IS NULL
      AND duration_sec IS NULL
      AND left_reps IS NULL AND right_reps IS NULL
    )
  ),
  CONSTRAINT workout_sets_set_number_key UNIQUE (workout_session_exercise_id, set_number)
);

-- Equipment semantics live in metadata, not as derived "true load":
-- barbell_total_including_bar: logged weight is the full barbell.
-- one_dumbbell: logged weight is one dumbbell, not the pair.
-- cable_stack_setting_no_ratio: logged weight is the stack number; do not apply pulley ratio.
-- one_dumbbell_or_kettlebell: logged weight is one implement.

INSERT INTO exercise_definitions (
  external_id, name, measurement_kind, load_type, unilateral, metadata
) VALUES
  ('EX01', 'Box Squat', 'reps', 'barbell', false, '{"equipment_load":"barbell_total_including_bar"}'::jsonb),
  ('EX02', 'Barbell Bench Press', 'reps', 'barbell', false, '{"equipment_load":"barbell_total_including_bar"}'::jsonb),
  ('EX03', 'Cable Row', 'reps', 'cable', false, '{"equipment_load":"cable_stack_setting_no_ratio"}'::jsonb),
  ('EX04', 'Dumbbell Romanian Deadlift', 'reps', 'dumbbell', false, '{"equipment_load":"one_dumbbell"}'::jsonb),
  ('EX05', 'Dumbbell Curl', 'reps', 'dumbbell', false, '{"equipment_load":"one_dumbbell"}'::jsonb),
  ('EX06', 'Cable Triceps Pressdown', 'reps', 'cable', false, '{"equipment_load":"cable_stack_setting_no_ratio"}'::jsonb),
  ('EX07', 'Farmer Carry', 'duration', 'dumbbell', false, '{"equipment_load":"one_dumbbell"}'::jsonb),
  ('EX08', 'Goblet Squat to Bench', 'reps', 'dumbbell_or_kettlebell', false, '{"equipment_load":"one_dumbbell_or_kettlebell"}'::jsonb),
  ('EX09', 'Incline Dumbbell Press', 'reps', 'dumbbell', false, '{"equipment_load":"one_dumbbell"}'::jsonb),
  ('EX10', 'Hip Thrust', 'reps', 'barbell', false, '{"equipment_load":"barbell_total_including_bar"}'::jsonb),
  ('EX11', 'Reverse Lunge', 'reps_per_side', 'dumbbell', true, '{"equipment_load":"one_dumbbell"}'::jsonb),
  ('EX12', 'Hammer Curl', 'reps', 'dumbbell', false, '{"equipment_load":"one_dumbbell"}'::jsonb),
  ('EX13', 'Suitcase Carry', 'duration_per_side', 'dumbbell', true, '{"equipment_load":"one_dumbbell"}'::jsonb),
  ('EX14', 'Dumbbell Overhead Press', 'reps', 'dumbbell', false, '{"equipment_load":"one_dumbbell"}'::jsonb),
  ('EX15', 'Cable Pulldown', 'reps', 'cable', false, '{"equipment_load":"cable_stack_setting_no_ratio"}'::jsonb),
  ('EX16', 'One-Arm Dumbbell Row', 'reps_per_side', 'dumbbell', true, '{"equipment_load":"one_dumbbell"}'::jsonb),
  ('EX17', 'Dumbbell Lateral Raise', 'reps', 'dumbbell', false, '{"equipment_load":"one_dumbbell"}'::jsonb)
ON CONFLICT (external_id) DO UPDATE SET
  name = EXCLUDED.name,
  measurement_kind = EXCLUDED.measurement_kind,
  load_type = EXCLUDED.load_type,
  unilateral = EXCLUDED.unilateral,
  metadata = EXCLUDED.metadata,
  is_active = true,
  updated_at = now();

INSERT INTO workout_templates (routine_code, version, name, metadata)
VALUES
  ('A', '1.3.1', 'Full Body A — Chest & Arms Focus', '{"paper_form":"A-1.3.1"}'::jsonb),
  ('B', '1.3.1', 'Full Body B — Legs, Glutes & Dad Strength Focus', '{"paper_form":"B-1.3.1"}'::jsonb),
  ('C', '1.3.1', 'Full Body C — Back, Shoulders & Posterior Chain Focus', '{"paper_form":"C-1.3.1"}'::jsonb)
ON CONFLICT (routine_code, version) DO UPDATE SET
  name = EXCLUDED.name,
  metadata = EXCLUDED.metadata,
  is_active = true;

INSERT INTO workout_template_exercises (
  workout_template_id,
  exercise_definition_id,
  slot_id,
  position,
  planned_sets,
  prescription
)
SELECT
  templates.id,
  exercises.id,
  seed.slot_id,
  seed.position,
  seed.planned_sets,
  seed.prescription
FROM (
  VALUES
    ('A'::text, '1.3.1'::text, 'EX01'::text, 'A01'::text, 1, 3, '{"measurement":"reps","min":6,"max":10}'::jsonb),
    ('A', '1.3.1', 'EX02', 'A02', 2, 3, '{"measurement":"reps","min":6,"max":10}'::jsonb),
    ('A', '1.3.1', 'EX03', 'A03', 3, 3, '{"measurement":"reps","min":8,"max":12}'::jsonb),
    ('A', '1.3.1', 'EX04', 'A04', 4, 3, '{"measurement":"reps","min":8,"max":10}'::jsonb),
    ('A', '1.3.1', 'EX05', 'A05', 5, 2, '{"measurement":"reps","min":10,"max":15}'::jsonb),
    ('A', '1.3.1', 'EX06', 'A06', 6, 2, '{"measurement":"reps","min":10,"max":15}'::jsonb),
    ('A', '1.3.1', 'EX07', 'A07', 7, 2, '{"measurement":"duration","min_sec":30,"max_sec":45}'::jsonb),
    ('B', '1.3.1', 'EX08', 'B01', 1, 3, '{"measurement":"reps","min":8,"max":12}'::jsonb),
    ('B', '1.3.1', 'EX09', 'B02', 2, 3, '{"measurement":"reps","min":8,"max":12}'::jsonb),
    ('B', '1.3.1', 'EX03', 'B03', 3, 3, '{"measurement":"reps","min":8,"max":12}'::jsonb),
    ('B', '1.3.1', 'EX10', 'B04', 4, 3, '{"measurement":"reps","min":10,"max":15}'::jsonb),
    ('B', '1.3.1', 'EX11', 'B05', 5, 2, '{"measurement":"reps_per_side","min":6,"max":8}'::jsonb),
    ('B', '1.3.1', 'EX12', 'B06', 6, 2, '{"measurement":"reps","min":10,"max":15}'::jsonb),
    ('B', '1.3.1', 'EX13', 'B07', 7, 2, '{"measurement":"duration_per_side","min_sec":30,"max_sec":45}'::jsonb),
    ('C', '1.3.1', 'EX01', 'C01', 1, 3, '{"measurement":"reps","min":6,"max":10}'::jsonb),
    ('C', '1.3.1', 'EX14', 'C02', 2, 3, '{"measurement":"reps","min":8,"max":12}'::jsonb),
    ('C', '1.3.1', 'EX15', 'C03', 3, 3, '{"measurement":"reps","min":8,"max":12}'::jsonb),
    ('C', '1.3.1', 'EX04', 'C04', 4, 3, '{"measurement":"reps","min":8,"max":10}'::jsonb),
    ('C', '1.3.1', 'EX16', 'C05', 5, 2, '{"measurement":"reps_per_side","min":8,"max":12}'::jsonb),
    ('C', '1.3.1', 'EX17', 'C06', 6, 2, '{"measurement":"reps","min":10,"max":15}'::jsonb),
    ('C', '1.3.1', 'EX07', 'C07', 7, 2, '{"measurement":"duration","min_sec":30,"max_sec":45}'::jsonb)
) AS seed(routine_code, version, external_id, slot_id, position, planned_sets, prescription)
JOIN workout_templates AS templates
  ON templates.routine_code = seed.routine_code
 AND templates.version = seed.version
JOIN exercise_definitions AS exercises
  ON exercises.external_id = seed.external_id
ON CONFLICT (workout_template_id, slot_id) DO UPDATE SET
  exercise_definition_id = EXCLUDED.exercise_definition_id,
  position = EXCLUDED.position,
  planned_sets = EXCLUDED.planned_sets,
  prescription = EXCLUDED.prescription;
