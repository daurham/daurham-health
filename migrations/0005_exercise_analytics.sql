-- Minimal exercise analytics metadata. Equipment load_type is unchanged.
-- performance_type: what a completed set means. analytics_load_type: how load is interpreted.

ALTER TABLE exercise_definitions
  ADD COLUMN performance_type TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN analytics_load_type TEXT NOT NULL DEFAULT 'none',
  ADD CONSTRAINT exercise_definitions_performance_type_allowed CHECK (
    performance_type IN (
      'loaded_reps',
      'bodyweight_reps',
      'assisted_reps',
      'timed',
      'distance',
      'other'
    )
  ),
  ADD CONSTRAINT exercise_definitions_analytics_load_type_allowed CHECK (
    analytics_load_type IN (
      'external',
      'bodyweight',
      'combined',
      'assistance',
      'none'
    )
  );

UPDATE exercise_definitions
SET
  performance_type = CASE external_id
    WHEN 'EX07' THEN 'timed'
    WHEN 'EX13' THEN 'timed'
    WHEN 'EX01' THEN 'loaded_reps'
    WHEN 'EX02' THEN 'loaded_reps'
    WHEN 'EX03' THEN 'loaded_reps'
    WHEN 'EX04' THEN 'loaded_reps'
    WHEN 'EX05' THEN 'loaded_reps'
    WHEN 'EX06' THEN 'loaded_reps'
    WHEN 'EX08' THEN 'loaded_reps'
    WHEN 'EX09' THEN 'loaded_reps'
    WHEN 'EX10' THEN 'loaded_reps'
    WHEN 'EX11' THEN 'loaded_reps'
    WHEN 'EX12' THEN 'loaded_reps'
    WHEN 'EX14' THEN 'loaded_reps'
    WHEN 'EX15' THEN 'loaded_reps'
    WHEN 'EX16' THEN 'loaded_reps'
    WHEN 'EX17' THEN 'loaded_reps'
    ELSE performance_type
  END,
  analytics_load_type = CASE external_id
    WHEN 'EX01' THEN 'external'
    WHEN 'EX02' THEN 'external'
    WHEN 'EX03' THEN 'external'
    WHEN 'EX04' THEN 'external'
    WHEN 'EX05' THEN 'external'
    WHEN 'EX06' THEN 'external'
    WHEN 'EX07' THEN 'external'
    WHEN 'EX08' THEN 'external'
    WHEN 'EX09' THEN 'external'
    WHEN 'EX10' THEN 'external'
    WHEN 'EX11' THEN 'external'
    WHEN 'EX12' THEN 'external'
    WHEN 'EX13' THEN 'external'
    WHEN 'EX14' THEN 'external'
    WHEN 'EX15' THEN 'external'
    WHEN 'EX16' THEN 'external'
    WHEN 'EX17' THEN 'external'
    ELSE analytics_load_type
  END
WHERE external_id IN (
  'EX01', 'EX02', 'EX03', 'EX04', 'EX05', 'EX06', 'EX07',
  'EX08', 'EX09', 'EX10', 'EX11', 'EX12', 'EX13', 'EX14',
  'EX15', 'EX16', 'EX17'
);
