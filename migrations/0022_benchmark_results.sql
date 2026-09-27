-- Durable Benchmark Results.
-- A result is a Personal Lab fact derived from canonical Health observations.
-- It does not copy those observations into a second Training, Body, Activity, Sleep, or Nutrition system.
-- Committed result values, evidence, and protocol identity are not rewritten in place.

CREATE TABLE benchmark_results (
  id UUID PRIMARY KEY,
  benchmark_definition_id UUID NOT NULL REFERENCES benchmark_definitions (id),
  protocol_version_id UUID NOT NULL REFERENCES lab_protocol_versions (id),
  result_date DATE NOT NULL,
  experiment_id UUID NULL REFERENCES experiments (id),
  status TEXT NOT NULL,
  protocol_confirmation_kind TEXT NOT NULL,
  evidence_fingerprint TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  supersedes_result_id UUID NULL REFERENCES benchmark_results (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invalidated_at TIMESTAMPTZ NULL,
  invalidation_reason TEXT NULL,
  CONSTRAINT benchmark_results_status_allowed CHECK (status IN ('valid', 'invalidated')),
  CONSTRAINT benchmark_results_confirmation_allowed CHECK (
    protocol_confirmation_kind IN ('linked_protocol', 'owner_attested')
  ),
  CONSTRAINT benchmark_results_fingerprint_present CHECK (btrim(evidence_fingerprint) <> ''),
  CONSTRAINT benchmark_results_reason_bound CHECK (
    invalidation_reason IS NULL OR char_length(invalidation_reason) <= 500
  ),
  CONSTRAINT benchmark_results_reason_present CHECK (
    invalidation_reason IS NULL OR btrim(invalidation_reason) <> ''
  ),
  CONSTRAINT benchmark_results_invalidation_pair CHECK (
    (status = 'valid' AND invalidated_at IS NULL AND invalidation_reason IS NULL)
    OR (status = 'invalidated' AND invalidated_at IS NOT NULL)
  ),
  CONSTRAINT benchmark_results_not_self_superseding CHECK (
    supersedes_result_id IS NULL OR supersedes_result_id <> id
  ),
  CONSTRAINT benchmark_results_evidence_identity UNIQUE (
    benchmark_definition_id, protocol_version_id, evidence_fingerprint
  )
);

CREATE INDEX benchmark_results_definition_date_idx
  ON benchmark_results (benchmark_definition_id, result_date);

CREATE TABLE benchmark_result_values (
  id UUID PRIMARY KEY,
  benchmark_result_id UUID NOT NULL REFERENCES benchmark_results (id) ON DELETE RESTRICT,
  requirement_id UUID NOT NULL REFERENCES lab_protocol_requirements (id),
  value NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  value_kind TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT benchmark_result_values_identity UNIQUE (benchmark_result_id, requirement_id),
  CONSTRAINT benchmark_result_values_unit_present CHECK (btrim(unit) <> ''),
  CONSTRAINT benchmark_result_values_kind_allowed CHECK (value_kind IN ('observed', 'derived')),
  CONSTRAINT benchmark_result_values_finite CHECK (value = value)
);

CREATE TABLE benchmark_result_evidence (
  id UUID PRIMARY KEY,
  benchmark_result_value_id UUID NOT NULL REFERENCES benchmark_result_values (id) ON DELETE RESTRICT,
  evidence_kind TEXT NOT NULL,
  evidence_ref JSONB NOT NULL,
  evidence_snapshot JSONB NOT NULL,
  observation_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT benchmark_result_evidence_kind_allowed CHECK (
    evidence_kind IN ('training_session', 'body_metric', 'nutrition_day', 'activity_day', 'sleep_night')
  ),
  CONSTRAINT benchmark_result_evidence_ref_object CHECK (jsonb_typeof(evidence_ref) = 'object'),
  CONSTRAINT benchmark_result_evidence_snapshot_object CHECK (jsonb_typeof(evidence_snapshot) = 'object')
);

CREATE INDEX benchmark_result_evidence_value_idx
  ON benchmark_result_evidence (benchmark_result_value_id);
