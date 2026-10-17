-- PIQ-6: separate owner-confirmed implementation from scheduled and Lab-active state.
-- This migration is additive and MUST be applied before deploying code that queries the table.
CREATE TABLE experiment_implementations (
  experiment_id UUID PRIMARY KEY REFERENCES experiments (id) ON DELETE CASCADE,
  effective_date DATE NOT NULL,
  behavior_change TEXT NOT NULL,
  owner_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT experiment_implementation_behavior_present CHECK (btrim(behavior_change) <> ''),
  CONSTRAINT experiment_implementation_behavior_length CHECK (char_length(behavior_change) <= 500)
);

CREATE INDEX experiment_implementations_effective_date
  ON experiment_implementations (effective_date, experiment_id);
