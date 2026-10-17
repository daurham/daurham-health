-- PIQ-6: owner-correctable provenance without rewriting the original report.
-- Apply after 0057; no migrations have been run by this assistant.
CREATE TABLE experiment_implementation_revisions (
  id UUID PRIMARY KEY,
  experiment_id UUID NOT NULL REFERENCES experiment_implementations (experiment_id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision > 0),
  action TEXT NOT NULL CHECK (action IN ('corrected', 'retracted')),
  effective_date DATE,
  behavior_change TEXT,
  reason TEXT NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT implementation_revision_unique UNIQUE (experiment_id, revision),
  CONSTRAINT implementation_revision_reason CHECK (char_length(btrim(reason)) BETWEEN 3 AND 500),
  CONSTRAINT implementation_revision_snapshot CHECK (
    (action = 'corrected' AND effective_date IS NOT NULL
      AND behavior_change IS NOT NULL AND char_length(btrim(behavior_change)) BETWEEN 1 AND 500)
    OR
    (action = 'retracted' AND effective_date IS NULL AND behavior_change IS NULL)
  )
);
-- The original implementation row and its first confirmation timestamp are immutable;
-- correction/retraction only appends a revision. Application reads select the latest.
