-- H2D schema repair discovered during H4 visual QA.
-- H2D introduced Training Goal units in application/domain code but migration 0038
-- did not expand the original 0028 goal_versions unit constraint.

ALTER TABLE goal_versions
  DROP CONSTRAINT IF EXISTS goal_versions_unit_known,
  ADD CONSTRAINT goal_versions_unit_known CHECK (
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
      'bpm',
      'sec',
      'mi',
      'sec/mi',
      'completion'
    )
  );
