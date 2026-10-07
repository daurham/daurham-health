-- I2 Daily Signals: canonical hydration, bowel, and subjective wellness evidence.
-- Missing rows mean unknown / not tracked. They must never be interpreted as zero.
-- Event dates use the configured Health calendar. occurred_at may be NULL for date-only backlog.

CREATE TABLE hydration_events (
  id UUID PRIMARY KEY,
  hydration_date DATE NOT NULL,
  occurred_at TIMESTAMPTZ NULL,
  amount_ml NUMERIC(10,2) NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  note TEXT NULL,
  request_id UUID NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT hydration_events_amount_range CHECK (amount_ml > 0 AND amount_ml <= 10000),
  CONSTRAINT hydration_events_note_shape CHECK (
    note IS NULL OR (btrim(note) <> '' AND char_length(note) <= 300)
  )
);

CREATE INDEX hydration_events_date_idx ON hydration_events (hydration_date, occurred_at, created_at);

CREATE TABLE bowel_events (
  id UUID PRIMARY KEY,
  bowel_date DATE NOT NULL,
  occurred_at TIMESTAMPTZ NULL,
  bristol_type SMALLINT NOT NULL,
  straining BOOLEAN NULL,
  urgency TEXT NULL,
  incomplete_feeling BOOLEAN NULL,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  note TEXT NULL,
  request_id UUID NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bowel_events_bristol_range CHECK (bristol_type BETWEEN 1 AND 7),
  CONSTRAINT bowel_events_urgency_shape CHECK (urgency IS NULL OR urgency IN ('none','mild','strong')),
  CONSTRAINT bowel_events_note_shape CHECK (
    note IS NULL OR (btrim(note) <> '' AND char_length(note) <= 300)
  )
);

CREATE INDEX bowel_events_date_idx ON bowel_events (bowel_date, occurred_at, created_at);

CREATE TABLE bowel_day_states (
  bowel_date DATE PRIMARY KEY,
  state TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bowel_day_states_state_check CHECK (state = 'no_bowel_movement')
);

CREATE TABLE daily_wellness (
  wellness_date DATE PRIMARY KEY,
  energy_rating SMALLINT NULL,
  hunger_rating SMALLINT NULL,
  soreness_rating SMALLINT NULL,
  stress_rating SMALLINT NULL,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT daily_wellness_energy_range CHECK (energy_rating IS NULL OR energy_rating BETWEEN 1 AND 5),
  CONSTRAINT daily_wellness_hunger_range CHECK (hunger_rating IS NULL OR hunger_rating BETWEEN 1 AND 5),
  CONSTRAINT daily_wellness_soreness_range CHECK (soreness_rating IS NULL OR soreness_rating BETWEEN 1 AND 5),
  CONSTRAINT daily_wellness_stress_range CHECK (stress_rating IS NULL OR stress_rating BETWEEN 1 AND 5),
  CONSTRAINT daily_wellness_not_empty CHECK (
    energy_rating IS NOT NULL
    OR hunger_rating IS NOT NULL
    OR soreness_rating IS NOT NULL
    OR stress_rating IS NOT NULL
  )
);
