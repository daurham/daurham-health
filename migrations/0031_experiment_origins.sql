-- Provenance for accepted Experiments. Unaccepted suggestions are not stored.
-- Existing rows stay owner-created unless origin already says ai_assisted or external_research.
-- Historical trigger labels on origin are not rewritten into deterministic origins.

ALTER TABLE experiments
  ADD COLUMN origin_kind TEXT,
  ADD COLUMN origin_trigger TEXT,
  ADD COLUMN origin_fingerprint TEXT,
  ADD COLUMN origin_evidence JSONB;

UPDATE experiments
SET origin_kind = CASE
  WHEN origin = 'ai_assisted' THEN 'ai_assisted'
  WHEN origin = 'external_research' THEN 'external_research'
  ELSE 'owner_created'
END
WHERE origin_kind IS NULL;

ALTER TABLE experiments
  ALTER COLUMN origin_kind SET NOT NULL;

ALTER TABLE experiments
  ADD CONSTRAINT experiments_origin_kind_allowed CHECK (
    origin_kind IN ('owner_created', 'deterministic_candidate', 'ai_assisted', 'external_research')
  ),
  ADD CONSTRAINT experiments_origin_trigger_allowed CHECK (
    origin_trigger IS NULL OR origin_trigger IN (
      'benchmark_missing_baseline',
      'benchmark_retest_due',
      'goal_observation'
    )
  ),
  ADD CONSTRAINT experiments_origin_fingerprint_shape CHECK (
    origin_fingerprint IS NULL OR origin_fingerprint ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT experiments_origin_provenance_pair CHECK (
    (
      origin_kind = 'deterministic_candidate'
      AND origin_trigger IS NOT NULL
      AND origin_fingerprint IS NOT NULL
    )
    OR (
      origin_kind = 'ai_assisted'
      AND (
        (origin_trigger IS NULL AND origin_fingerprint IS NULL)
        OR (origin_trigger IS NOT NULL AND origin_fingerprint IS NOT NULL)
      )
    )
    OR (
      origin_kind IN ('owner_created', 'external_research')
      AND origin_trigger IS NULL
      AND origin_fingerprint IS NULL
    )
  );

CREATE UNIQUE INDEX experiments_open_origin_fingerprint
  ON experiments (origin_fingerprint)
  WHERE origin_fingerprint IS NOT NULL
    AND status IN ('proposed', 'accepted', 'scheduled', 'active');

CREATE TABLE experiment_goals (
  experiment_id UUID PRIMARY KEY REFERENCES experiments (id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES goals (id),
  goal_version_id UUID NOT NULL REFERENCES goal_versions (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
