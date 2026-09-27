-- Experiment Result summaries.
-- A result records what the frozen protocol observed. It does not record a causal conclusion.
-- Protocol requirement criteria are part of the immutable protocol version.

ALTER TABLE lab_protocol_requirements
  ADD COLUMN criteria JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE lab_protocol_requirements
  ADD CONSTRAINT lab_protocol_requirements_criteria_object CHECK (jsonb_typeof(criteria) = 'object');

CREATE TABLE experiment_results (
  id UUID PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES experiments (id),
  protocol_version_id UUID NOT NULL REFERENCES lab_protocol_versions (id),
  classification TEXT NOT NULL,
  status TEXT NOT NULL,
  window_start DATE NOT NULL,
  planned_window_end DATE NOT NULL,
  effective_end_date DATE NOT NULL,
  protocol_attestation TEXT NOT NULL,
  stopped_for_safety BOOLEAN NOT NULL,
  safety_reason TEXT,
  owner_note TEXT,
  evidence_fingerprint TEXT NOT NULL,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  supersedes_result_id UUID REFERENCES experiment_results (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  CONSTRAINT experiment_results_classification_allowed CHECK (
    classification IN (
      'completed_interpretable',
      'completed_low_adherence',
      'incomplete',
      'inconclusive',
      'invalid_protocol',
      'stopped_safety'
    )
  ),
  CONSTRAINT experiment_results_status_allowed CHECK (status IN ('valid', 'invalidated')),
  CONSTRAINT experiment_results_attestation_allowed CHECK (
    protocol_attestation IN ('followed', 'not_followed', 'uncertain')
  ),
  CONSTRAINT experiment_results_window_order CHECK (
    planned_window_end >= window_start
    AND effective_end_date >= window_start
    AND effective_end_date <= planned_window_end
  ),
  CONSTRAINT experiment_results_safety_reason_present CHECK (
    safety_reason IS NULL OR btrim(safety_reason) <> ''
  ),
  CONSTRAINT experiment_results_safety_reason_length CHECK (
    safety_reason IS NULL OR char_length(safety_reason) <= 500
  ),
  CONSTRAINT experiment_results_owner_note_present CHECK (
    owner_note IS NULL OR btrim(owner_note) <> ''
  ),
  CONSTRAINT experiment_results_owner_note_length CHECK (
    owner_note IS NULL OR char_length(owner_note) <= 2000
  ),
  CONSTRAINT experiment_results_fingerprint_present CHECK (btrim(evidence_fingerprint) <> ''),
  CONSTRAINT experiment_results_not_self CHECK (id <> supersedes_result_id),
  CONSTRAINT experiment_results_invalidation_pair CHECK (
    (
      status = 'valid'
      AND invalidated_at IS NULL
      AND invalidation_reason IS NULL
    )
    OR (
      status = 'invalidated'
      AND invalidated_at IS NOT NULL
      AND (invalidation_reason IS NULL OR (btrim(invalidation_reason) <> '' AND char_length(invalidation_reason) <= 500))
    )
  )
);

CREATE UNIQUE INDEX experiment_results_one_valid
  ON experiment_results (experiment_id)
  WHERE status = 'valid';

CREATE TABLE experiment_result_requirements (
  id UUID PRIMARY KEY,
  experiment_result_id UUID NOT NULL REFERENCES experiment_results (id) ON DELETE RESTRICT,
  requirement_id UUID NOT NULL REFERENCES lab_protocol_requirements (id),
  evaluation_status TEXT NOT NULL,
  summary_kind TEXT NOT NULL,
  summary JSONB NOT NULL,
  criterion_status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT experiment_result_requirements_unique UNIQUE (experiment_result_id, requirement_id),
  CONSTRAINT experiment_result_requirements_evaluation_allowed CHECK (
    evaluation_status IN ('available', 'missing', 'insufficient', 'unsupported', 'not_applicable')
  ),
  CONSTRAINT experiment_result_requirements_criterion_allowed CHECK (
    criterion_status IN ('pass', 'fail', 'not_configured', 'not_applicable')
  ),
  CONSTRAINT experiment_result_requirements_summary_object CHECK (jsonb_typeof(summary) = 'object'),
  CONSTRAINT experiment_result_requirements_summary_kind_allowed CHECK (
    summary_kind IN (
      'benchmark',
      'training',
      'body',
      'nutrition',
      'activity',
      'sleep',
      'adherence',
      'context',
      'none'
    )
  )
);

CREATE TABLE experiment_result_evidence (
  id UUID PRIMARY KEY,
  experiment_result_id UUID NOT NULL REFERENCES experiment_results (id) ON DELETE RESTRICT,
  requirement_result_id UUID REFERENCES experiment_result_requirements (id),
  evidence_kind TEXT NOT NULL,
  evidence_ref JSONB NOT NULL,
  evidence_snapshot JSONB NOT NULL,
  observation_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT experiment_result_evidence_kind_allowed CHECK (
    evidence_kind IN (
      'benchmark_result',
      'training_session',
      'body_metric',
      'nutrition_day',
      'activity_day',
      'sleep_night',
      'supplement_adherence',
      'daily_context'
    )
  ),
  CONSTRAINT experiment_result_evidence_ref_object CHECK (jsonb_typeof(evidence_ref) = 'object'),
  CONSTRAINT experiment_result_evidence_snapshot_object CHECK (jsonb_typeof(evidence_snapshot) = 'object')
);
