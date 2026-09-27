-- Training session intent, distinct from source_kind.
-- session_type says what kind of Training session this is.
-- source_kind remains how Health received the workout.
-- No permanent default: every insert states the type explicitly.

ALTER TABLE workout_sessions
  ADD COLUMN session_type TEXT,
  ADD COLUMN session_name TEXT;

UPDATE workout_sessions
SET session_type = CASE
  WHEN workout_template_id IS NOT NULL
    OR routine_code IS NOT NULL
    OR template_version IS NOT NULL
    OR template_name IS NOT NULL
  THEN 'programmed'
  ELSE 'ad_hoc'
END
WHERE session_type IS NULL;

ALTER TABLE workout_sessions
  ALTER COLUMN session_type SET NOT NULL;

ALTER TABLE workout_sessions
  ADD CONSTRAINT workout_sessions_session_type_allowed CHECK (
    session_type IN ('programmed', 'ad_hoc', 'experiment')
  ),
  ADD CONSTRAINT workout_sessions_session_name_present CHECK (
    session_name IS NULL OR btrim(session_name) <> ''
  );
