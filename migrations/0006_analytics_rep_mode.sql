-- Distinguish standard vs per-side repetition/duration analytics.
-- Does not change 0005 performance_type / analytics_load_type.

ALTER TABLE exercise_definitions
  ADD COLUMN analytics_rep_mode TEXT NOT NULL DEFAULT 'standard',
  ADD CONSTRAINT exercise_definitions_analytics_rep_mode_allowed CHECK (
    analytics_rep_mode IN ('standard', 'per_side')
  );

UPDATE exercise_definitions
SET analytics_rep_mode = 'per_side'
WHERE external_id IN ('EX11', 'EX13', 'EX16');
