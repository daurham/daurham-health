-- PIQ-6.3: immutable point-in-time descriptive COVERAGE assessment, not an effect estimate.
-- Requires migrations 0023, 0057 and 0058. Must migrate target DB before app promotion.
-- One owner result has at most one immutable coverage assessment; invalidating the
-- result does NOT rewrite this historical evidence-quality judgment.
CREATE TABLE experiment_result_comparison_snapshots (
  experiment_result_id UUID PRIMARY KEY REFERENCES experiment_results (id) ON DELETE RESTRICT,
  snapshot_version INTEGER NOT NULL CHECK (snapshot_version = 1),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  snapshot_fingerprint TEXT NOT NULL
    CHECK (snapshot_fingerprint ~ '^[0-9a-f]{64}$'),
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- An owner can correct or retract implementation provenance later. That
-- creates a NEW result only after invalidating/reviewing the old result;
-- do not retroactively overwrite this saved assessment.
CREATE FUNCTION reject_experiment_comparison_snapshot_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Experiment comparison snapshots are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER experiment_comparison_snapshot_immutable
BEFORE UPDATE OR DELETE ON experiment_result_comparison_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_experiment_comparison_snapshot_mutation();
