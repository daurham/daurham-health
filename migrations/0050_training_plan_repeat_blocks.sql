-- Preserve ordered routine slots and the exact start position, including
-- the middle of a repeated block. Preexisting plans are backfilled from
-- their original sequence_start_routine_code so their next routine is unchanged.
ALTER TABLE training_plan_sequence_items
  DROP CONSTRAINT IF EXISTS training_plan_sequence_routine_unique;

ALTER TABLE training_plan_versions
  ADD COLUMN sequence_start_position INTEGER NOT NULL DEFAULT 1;

UPDATE training_plan_versions AS p
SET sequence_start_position = COALESCE(
  (SELECT MIN(s.position) FROM training_plan_sequence_items AS s
   WHERE s.plan_version_id = p.id
     AND s.routine_code = p.sequence_start_routine_code),
  1
);

ALTER TABLE training_plan_versions
  ADD CONSTRAINT training_plan_start_position_positive CHECK (sequence_start_position >= 1);
