-- Owner-declared daily context. One row per Health calendar date.
-- Absence of a row means no context was recorded, not that the day was ordinary.
-- A tag that is missing from a recorded day was not recorded. It is not a negative finding.
-- Empty rows are rejected by the write path: a record needs a tag or a note.
-- created_at and updated_at are record-management times, not when the circumstance happened.

CREATE TABLE daily_context (
  id UUID PRIMARY KEY,
  context_date DATE NOT NULL UNIQUE,
  note TEXT,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_context_note_shape CHECK (
    note IS NULL
    OR (
      btrim(note) <> ''
      AND char_length(note) <= 500
    )
  )
);

CREATE TABLE daily_context_tags (
  context_id UUID NOT NULL REFERENCES daily_context (id) ON DELETE CASCADE,
  tag_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (context_id, tag_key),
  CONSTRAINT daily_context_tags_key_check CHECK (
    tag_key IN (
      'sick',
      'travel',
      'alcohol',
      'late_meal',
      'unusual_stress',
      'poor_sleep_opportunity',
      'baby_night_interruption',
      'pain',
      'rest_day',
      'new_supplement',
      'medication_change',
      'unusual_physical_labor'
    )
  )
);

CREATE INDEX daily_context_tags_tag_key_idx ON daily_context_tags (tag_key);
