-- PIQ-6.4: owner-only optional report of unlogged factors.
-- Append-only history. No inference of health benefit or causal effect.
-- Release gated until the destination DB is migrated through 0060.
CREATE TABLE experiment_outcome_feedback_events (
  id UUID PRIMARY KEY,
  experiment_result_id UUID NOT NULL REFERENCES experiment_results(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version >= 1),
  action TEXT NOT NULL CHECK (action IN ('recorded', 'revised', 'withdrawn')),
  unlogged_factors TEXT CHECK (unlogged_factors IN ('none_reported', 'other_changes', 'unsure')),
  owner_note TEXT CHECK (owner_note IS NULL OR (char_length(btrim(owner_note)) BETWEEN 1 AND 500)),
  comparison_fingerprint TEXT NOT NULL CHECK (comparison_fingerprint ~ '^[0-9a-f]{64}$'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT experiment_outcome_feedback_version_unique UNIQUE (experiment_result_id, version),
  CONSTRAINT experiment_outcome_feedback_payload CHECK (
    (action = 'withdrawn' AND unlogged_factors IS NULL AND owner_note IS NULL)
    OR (action IN ('recorded', 'revised') AND unlogged_factors IS NOT NULL
        AND (unlogged_factors = 'other_changes' OR owner_note IS NULL))
  )
);

CREATE FUNCTION reject_experiment_outcome_feedback_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Experiment outcome feedback events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER experiment_outcome_feedback_events_immutable
BEFORE UPDATE OR DELETE ON experiment_outcome_feedback_events
FOR EACH ROW EXECUTE FUNCTION reject_experiment_outcome_feedback_mutation();
