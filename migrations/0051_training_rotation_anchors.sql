-- Training Plan 2.0: audited, version-scoped historical rotation decisions.
-- Canonical Training evidence remains in workout_sessions / exercises / sets.
-- Existing plans receive NO guessed anchors or fictitious session counts.
CREATE TABLE training_plan_rotation_anchors (
  plan_version_id UUID PRIMARY KEY REFERENCES training_plan_versions(id) ON DELETE CASCADE,
  anchor_date DATE NOT NULL,
  current_routine_code TEXT NOT NULL,
  completed_at_anchor INTEGER NOT NULL DEFAULT 0,
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  note TEXT NULL,
  CONSTRAINT training_plan_rotation_anchor_routine_present CHECK (btrim(current_routine_code) <> ''),
  CONSTRAINT training_plan_rotation_anchor_count_range CHECK (completed_at_anchor BETWEEN 0 AND 11),
  CONSTRAINT training_plan_rotation_anchor_note_length CHECK (note IS NULL OR char_length(note) <= 500)
);
CREATE TABLE training_plan_block_ends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_version_id UUID NOT NULL REFERENCES training_plan_versions(id) ON DELETE CASCADE,
  routine_code TEXT NOT NULL,
  generation INTEGER NOT NULL,
  ended_on DATE NOT NULL,
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT training_plan_block_end_routine_present CHECK (btrim(routine_code) <> ''),
  CONSTRAINT training_plan_block_end_generation_positive CHECK (generation >= 1),
  CONSTRAINT training_plan_block_end_reason_length CHECK (reason IS NULL OR char_length(reason) <= 200),
  CONSTRAINT training_plan_block_end_unique UNIQUE (plan_version_id, routine_code, generation)
);
CREATE INDEX training_plan_block_ends_version_date_idx
  ON training_plan_block_ends (plan_version_id, ended_on);
