-- Personal Lab protocol foundation.
-- Experiments and Benchmarks are separate objects that share immutable protocol versions.
-- This migration does not store results, observations, or causal conclusions.
-- Protocol version content is not updated in place. A change inserts the next version.

CREATE TABLE lab_protocols (
  id UUID PRIMARY KEY,
  protocol_kind TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lab_protocols_kind_allowed CHECK (protocol_kind IN ('experiment', 'benchmark')),
  CONSTRAINT lab_protocols_title_present CHECK (btrim(title) <> ''),
  CONSTRAINT lab_protocols_description_present CHECK (description IS NULL OR btrim(description) <> '')
);

CREATE TABLE lab_protocol_versions (
  id UUID PRIMARY KEY,
  protocol_id UUID NOT NULL REFERENCES lab_protocols (id),
  version INTEGER NOT NULL,
  instructions TEXT NOT NULL,
  minimum_retest_days INTEGER,
  suggested_retest_days INTEGER,
  is_current BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lab_protocol_versions_version_positive CHECK (version >= 1),
  CONSTRAINT lab_protocol_versions_protocol_version UNIQUE (protocol_id, version),
  CONSTRAINT lab_protocol_versions_instructions_present CHECK (btrim(instructions) <> ''),
  CONSTRAINT lab_protocol_versions_minimum_retest CHECK (
    minimum_retest_days IS NULL OR minimum_retest_days >= 1
  ),
  CONSTRAINT lab_protocol_versions_suggested_retest CHECK (
    suggested_retest_days IS NULL OR suggested_retest_days >= 1
  ),
  CONSTRAINT lab_protocol_versions_retest_order CHECK (
    minimum_retest_days IS NULL
    OR suggested_retest_days IS NULL
    OR suggested_retest_days >= minimum_retest_days
  )
);

CREATE UNIQUE INDEX lab_protocol_versions_one_current
  ON lab_protocol_versions (protocol_id)
  WHERE is_current;

CREATE TABLE lab_protocol_requirements (
  id UUID PRIMARY KEY,
  protocol_version_id UUID NOT NULL REFERENCES lab_protocol_versions (id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  role TEXT NOT NULL,
  domain TEXT NOT NULL,
  requirement_kind TEXT NOT NULL,
  selector JSONB NOT NULL,
  label TEXT NOT NULL,
  required BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lab_protocol_requirements_position UNIQUE (protocol_version_id, position),
  CONSTRAINT lab_protocol_requirements_position_positive CHECK (position >= 1),
  CONSTRAINT lab_protocol_requirements_role_allowed CHECK (
    role IN ('primary_outcome', 'secondary_outcome', 'adherence', 'context', 'safety')
  ),
  CONSTRAINT lab_protocol_requirements_domain_allowed CHECK (
    domain IN ('training', 'body', 'nutrition', 'activity', 'sleep', 'supplements', 'context', 'benchmark')
  ),
  CONSTRAINT lab_protocol_requirements_kind_allowed CHECK (
    requirement_kind IN (
      'training_measure',
      'body_metric',
      'nutrition_metric',
      'activity_metric',
      'sleep_metric',
      'supplement_adherence',
      'context_tag',
      'benchmark_definition'
    )
  ),
  CONSTRAINT lab_protocol_requirements_selector_object CHECK (jsonb_typeof(selector) = 'object'),
  CONSTRAINT lab_protocol_requirements_label_present CHECK (btrim(label) <> '')
);

CREATE TABLE lab_protocol_context_controls (
  protocol_version_id UUID NOT NULL REFERENCES lab_protocol_versions (id) ON DELETE CASCADE,
  tag_key TEXT NOT NULL,
  control_mode TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (protocol_version_id, tag_key),
  CONSTRAINT lab_protocol_context_controls_mode_allowed CHECK (control_mode = 'observe'),
  CONSTRAINT lab_protocol_context_controls_tag_allowed CHECK (
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

CREATE TABLE benchmark_definitions (
  id UUID PRIMARY KEY,
  protocol_id UUID NOT NULL UNIQUE REFERENCES lab_protocols (id),
  domain TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT benchmark_definitions_domain_allowed CHECK (
    domain IN ('training', 'body', 'activity', 'sleep', 'other')
  ),
  CONSTRAINT benchmark_definitions_description_present CHECK (
    description IS NULL OR btrim(description) <> ''
  )
);

CREATE TABLE experiments (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  hypothesis TEXT,
  rationale TEXT,
  origin TEXT NOT NULL,
  status TEXT NOT NULL,
  protocol_version_id UUID NOT NULL REFERENCES lab_protocol_versions (id),
  window_start DATE,
  window_end DATE,
  source_id UUID NOT NULL REFERENCES data_sources (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT experiments_title_present CHECK (btrim(title) <> ''),
  CONSTRAINT experiments_question_present CHECK (btrim(question) <> ''),
  CONSTRAINT experiments_hypothesis_present CHECK (hypothesis IS NULL OR btrim(hypothesis) <> ''),
  CONSTRAINT experiments_rationale_present CHECK (rationale IS NULL OR btrim(rationale) <> ''),
  CONSTRAINT experiments_origin_allowed CHECK (
    origin IN (
      'owner_created',
      'ai_assisted',
      'evidence_gap',
      'goal_plateau',
      'stale_benchmark',
      'repeated_pattern',
      'external_research'
    )
  ),
  CONSTRAINT experiments_status_allowed CHECK (
    status IN (
      'proposed',
      'accepted',
      'scheduled',
      'active',
      'completed',
      'abandoned',
      'inconclusive',
      'superseded'
    )
  ),
  CONSTRAINT experiments_window_pair CHECK (
    (window_start IS NULL AND window_end IS NULL)
    OR (
      window_start IS NOT NULL
      AND window_end IS NOT NULL
      AND window_end >= window_start
    )
  )
);

CREATE TABLE experiment_benchmarks (
  experiment_id UUID NOT NULL REFERENCES experiments (id) ON DELETE CASCADE,
  benchmark_definition_id UUID NOT NULL REFERENCES benchmark_definitions (id),
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, benchmark_definition_id),
  CONSTRAINT experiment_benchmarks_role_allowed CHECK (role IN ('primary', 'secondary'))
);

CREATE UNIQUE INDEX experiment_benchmarks_one_primary
  ON experiment_benchmarks (experiment_id)
  WHERE role = 'primary';

CREATE TABLE experiment_supplements (
  experiment_id UUID NOT NULL REFERENCES experiments (id) ON DELETE CASCADE,
  supplement_id UUID NOT NULL REFERENCES supplements (id),
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (experiment_id, supplement_id),
  CONSTRAINT experiment_supplements_role_allowed CHECK (role IN ('intervention', 'tracked'))
);

ALTER TABLE workout_sessions
  ADD COLUMN experiment_id UUID REFERENCES experiments (id),
  ADD COLUMN benchmark_protocol_version_id UUID REFERENCES lab_protocol_versions (id);

ALTER TABLE workout_sessions
  ADD CONSTRAINT workout_sessions_lab_parents_check CHECK (
    (
      session_type <> 'experiment'
      AND experiment_id IS NULL
      AND benchmark_protocol_version_id IS NULL
    )
    OR (
      session_type = 'experiment'
      AND (
        experiment_id IS NOT NULL
        OR benchmark_protocol_version_id IS NOT NULL
      )
    )
  );
