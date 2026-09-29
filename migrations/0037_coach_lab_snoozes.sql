-- V2-H2C owner presentation state. Lab eligibility and content remain derived.
CREATE TABLE coach_lab_snoozes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_kind TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_fingerprint TEXT NOT NULL,
  snoozed_until DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coach_lab_snoozes_kind_allowed CHECK (
    item_kind IN ('benchmark_retest', 'experiment_suggestion')
  ),
  CONSTRAINT coach_lab_snoozes_source_key_present CHECK (
    length(source_key) BETWEEN 1 AND 512 AND source_key !~ '[[:cntrl:][:space:]]'
  ),
  CONSTRAINT coach_lab_snoozes_fingerprint_valid CHECK (source_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT coach_lab_snoozes_identity_unique UNIQUE (item_kind, source_key, source_fingerprint)
);

CREATE INDEX coach_lab_snoozes_until_idx ON coach_lab_snoozes (snoozed_until);
