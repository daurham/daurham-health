-- Allow consecutive repeated routine codes within a versioned Training plan.
-- Position remains the ordered primary key; domain validation forbids scattered duplicates.
ALTER TABLE training_plan_sequence_items
  DROP CONSTRAINT IF EXISTS training_plan_sequence_routine_unique;
