-- I1 — Health Profile + Flexible Training Intent.
--
-- One owner per deployment. Stable owner facts live in a singleton profile.
-- Training planning is versioned so historical intelligence can resolve the plan
-- that was actually in force on an as-of date. Dated overrides modify only the
-- relevant week/day and never rewrite canonical workout observations.

CREATE TABLE health_profile (
  singleton_id SMALLINT PRIMARY KEY DEFAULT 1,
  date_of_birth DATE NULL,
  height_cm NUMERIC NULL,
  persistent_health_context TEXT NULL,
  training_limitations TEXT NULL,
  dietary_context TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT health_profile_singleton CHECK (singleton_id = 1),
  CONSTRAINT health_profile_height_range CHECK (
    height_cm IS NULL OR (height_cm >= 50 AND height_cm <= 250)
  ),
  CONSTRAINT health_profile_persistent_context_length CHECK (
    persistent_health_context IS NULL OR char_length(persistent_health_context) <= 2000
  ),
  CONSTRAINT health_profile_training_limitations_length CHECK (
    training_limitations IS NULL OR char_length(training_limitations) <= 2000
  ),
  CONSTRAINT health_profile_dietary_context_length CHECK (
    dietary_context IS NULL OR char_length(dietary_context) <= 2000
  )
);

CREATE TABLE training_plan_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL,
  effective_from DATE NOT NULL,
  weekly_frequency_target INTEGER NOT NULL,
  sequence_start_routine_code TEXT NOT NULL,
  default_non_training_intent TEXT NOT NULL,
  note TEXT NULL,
  is_current BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT training_plan_versions_version_positive CHECK (version >= 1),
  CONSTRAINT training_plan_versions_frequency_range CHECK (
    weekly_frequency_target BETWEEN 1 AND 7
  ),
  CONSTRAINT training_plan_versions_sequence_start_present CHECK (
    btrim(sequence_start_routine_code) <> ''
  ),
  CONSTRAINT training_plan_versions_non_training_intent_allowed CHECK (
    default_non_training_intent IN ('rest', 'active_recovery', 'flexible')
  ),
  CONSTRAINT training_plan_versions_note_length CHECK (
    note IS NULL OR char_length(note) <= 500
  ),
  CONSTRAINT training_plan_versions_version_unique UNIQUE (version)
);

CREATE UNIQUE INDEX training_plan_versions_one_current
  ON training_plan_versions (is_current)
  WHERE is_current = true;

CREATE INDEX training_plan_versions_effective_from_idx
  ON training_plan_versions (effective_from DESC, version DESC);

CREATE TABLE training_plan_sequence_items (
  plan_version_id UUID NOT NULL
    REFERENCES training_plan_versions(id)
    ON DELETE CASCADE,
  position INTEGER NOT NULL,
  routine_code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_version_id, position),
  CONSTRAINT training_plan_sequence_position_positive CHECK (position >= 1),
  CONSTRAINT training_plan_sequence_routine_present CHECK (btrim(routine_code) <> ''),
  CONSTRAINT training_plan_sequence_routine_unique UNIQUE (plan_version_id, routine_code)
);

CREATE TABLE training_plan_preferred_weekdays (
  plan_version_id UUID NOT NULL
    REFERENCES training_plan_versions(id)
    ON DELETE CASCADE,
  weekday INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_version_id, weekday),
  CONSTRAINT training_plan_preferred_weekday_range CHECK (weekday BETWEEN 1 AND 7)
);

CREATE TABLE training_plan_day_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  override_date DATE NOT NULL UNIQUE,
  intent_kind TEXT NOT NULL,
  linked_date DATE NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT training_plan_day_override_intent_allowed CHECK (
    intent_kind IN (
      'training_preferred',
      'rest',
      'active_recovery',
      'flexible',
      'training_moved_here',
      'training_moved_away',
      'paused_or_away'
    )
  ),
  CONSTRAINT training_plan_day_override_link_shape CHECK (
    (
      intent_kind IN ('training_moved_here', 'training_moved_away')
      AND linked_date IS NOT NULL
      AND linked_date <> override_date
    )
    OR (
      intent_kind NOT IN ('training_moved_here', 'training_moved_away')
      AND linked_date IS NULL
    )
  ),
  CONSTRAINT training_plan_day_override_note_length CHECK (
    note IS NULL OR char_length(note) <= 500
  )
);

CREATE INDEX training_plan_day_overrides_date_idx
  ON training_plan_day_overrides (override_date);
