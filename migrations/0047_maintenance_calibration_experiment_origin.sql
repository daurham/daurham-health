-- I7 — Observed Maintenance + Plateau Engine.
-- Extend deterministic Experiment provenance so an owner-reviewed maintenance
-- calibration suggestion can be accepted through the existing Personal Lab flow.

ALTER TABLE experiments
  DROP CONSTRAINT experiments_origin_trigger_allowed;

ALTER TABLE experiments
  ADD CONSTRAINT experiments_origin_trigger_allowed CHECK (
    origin_trigger IS NULL OR origin_trigger IN (
      'benchmark_missing_baseline',
      'benchmark_retest_due',
      'goal_observation',
      'maintenance_calibration'
    )
  );
