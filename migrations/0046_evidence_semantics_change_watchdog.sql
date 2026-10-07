-- I4 — Evidence Semantics, Effort, and Change Ledger.
-- Add only durable evidence semantics and owner review state. Derived intelligence remains derived.

ALTER TABLE exercise_definitions
  ADD COLUMN side_tracking_mode TEXT NOT NULL DEFAULT 'shared';

ALTER TABLE exercise_definitions
  ADD CONSTRAINT exercise_definitions_side_tracking_mode_allowed CHECK (
    side_tracking_mode IN ('shared', 'paired', 'independent')
  );

-- Existing explicit per-side exercises are paired unless the limbs can meaningfully
-- continue/fail independently. Several dumbbell arm/press movements are marked
-- independent without rewriting historical set measurements.
UPDATE exercise_definitions
SET side_tracking_mode = CASE
  WHEN external_id IN ('EX05','EX09','EX12','EX14','EX16','EX17') THEN 'independent'
  WHEN measurement_kind IN ('reps_per_side','duration_per_side') THEN 'paired'
  ELSE 'shared'
END;

ALTER TABLE workout_sets
  ADD COLUMN rir SMALLINT NULL,
  ADD COLUMN rpe NUMERIC(4,1) NULL,
  ADD COLUMN failure_kind TEXT NULL,
  ADD COLUMN left_failure_kind TEXT NULL,
  ADD COLUMN right_failure_kind TEXT NULL;

ALTER TABLE workout_sets
  ADD CONSTRAINT workout_sets_rir_range CHECK (rir IS NULL OR rir BETWEEN 0 AND 10),
  ADD CONSTRAINT workout_sets_rpe_range CHECK (rpe IS NULL OR (rpe >= 1 AND rpe <= 10)),
  ADD CONSTRAINT workout_sets_effort_scale_exclusive CHECK (rir IS NULL OR rpe IS NULL),
  ADD CONSTRAINT workout_sets_failure_kind_allowed CHECK (
    failure_kind IS NULL OR failure_kind IN ('reached_failure','failed_rep')
  ),
  ADD CONSTRAINT workout_sets_left_failure_kind_allowed CHECK (
    left_failure_kind IS NULL OR left_failure_kind IN ('reached_failure','failed_rep')
  ),
  ADD CONSTRAINT workout_sets_right_failure_kind_allowed CHECK (
    right_failure_kind IS NULL OR right_failure_kind IN ('reached_failure','failed_rep')
  ),
  ADD CONSTRAINT workout_sets_failure_scope_exclusive CHECK (
    failure_kind IS NULL OR (left_failure_kind IS NULL AND right_failure_kind IS NULL)
  );

ALTER TABLE workout_sessions
  ADD COLUMN limitation_kind TEXT NULL,
  ADD COLUMN limitation_note TEXT NULL;

ALTER TABLE workout_sessions
  ADD CONSTRAINT workout_sessions_limitation_kind_allowed CHECK (
    limitation_kind IS NULL OR limitation_kind IN ('pain','fatigue','illness','time','equipment','other')
  ),
  ADD CONSTRAINT workout_sessions_limitation_note_shape CHECK (
    limitation_note IS NULL OR (btrim(limitation_note) <> '' AND char_length(limitation_note) <= 500)
  );

ALTER TABLE nutrition_entries
  ADD COLUMN evidence_quality TEXT NOT NULL DEFAULT 'legacy_unknown';

UPDATE nutrition_entries AS entries
SET evidence_quality = CASE
  WHEN entries.source_kind = 'photo_ai'
    OR EXISTS (
      SELECT 1 FROM nutrition_foods foods
      WHERE foods.id = entries.food_id AND foods.source_kind = 'description_ai'
    )
    THEN 'ai_estimate'
  WHEN entries.source_kind IN ('barcode','ocr')
    OR EXISTS (
      SELECT 1 FROM nutrition_foods foods
      WHERE foods.id = entries.food_id AND foods.source_kind IN ('usda','barcode','ocr')
    )
    THEN 'measured_reference'
  WHEN entries.source_kind = 'manual' THEN 'owner_entered'
  ELSE 'legacy_unknown'
END;

ALTER TABLE nutrition_entries
  ADD CONSTRAINT nutrition_entries_evidence_quality_allowed CHECK (
    evidence_quality IN ('measured_reference','owner_entered','ai_estimate','legacy_unknown')
  );

CREATE OR REPLACE FUNCTION set_nutrition_entry_evidence_quality()
RETURNS TRIGGER AS $quality$
DECLARE
  food_source TEXT;
BEGIN
  IF NEW.food_id IS NOT NULL THEN
    SELECT source_kind INTO food_source FROM nutrition_foods WHERE id = NEW.food_id;
  END IF;

  NEW.evidence_quality = CASE
    WHEN NEW.source_kind = 'photo_ai' OR food_source = 'description_ai' THEN 'ai_estimate'
    WHEN NEW.source_kind IN ('barcode','ocr') OR food_source IN ('usda','barcode','ocr') THEN 'measured_reference'
    WHEN NEW.source_kind = 'manual' THEN 'owner_entered'
    ELSE 'legacy_unknown'
  END;
  RETURN NEW;
END;
$quality$ LANGUAGE plpgsql;

CREATE TRIGGER nutrition_entries_evidence_quality_insert
BEFORE INSERT ON nutrition_entries
FOR EACH ROW EXECUTE FUNCTION set_nutrition_entry_evidence_quality();

ALTER TABLE body_measurement_sessions
  ADD COLUMN comparability TEXT NOT NULL DEFAULT 'unknown';

ALTER TABLE body_measurement_sessions
  ADD CONSTRAINT body_measurement_sessions_comparability_allowed CHECK (
    comparability IN ('usual','different_conditions','unknown')
  );

ALTER TABLE health_profile
  ADD COLUMN body_measurement_protocol TEXT NULL;

ALTER TABLE health_profile
  ADD CONSTRAINT health_profile_body_protocol_length CHECK (
    body_measurement_protocol IS NULL OR char_length(body_measurement_protocol) <= 1000
  );

CREATE TABLE change_candidates (
  id UUID PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  candidate_kind TEXT NOT NULL,
  detected_on DATE NOT NULL,
  window_start DATE NOT NULL,
  window_end DATE NOT NULL,
  direction TEXT NOT NULL,
  magnitude NUMERIC NOT NULL,
  unit TEXT NOT NULL,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT change_candidates_kind_allowed CHECK (
    candidate_kind IN ('steps_shift','training_frequency_shift','hydration_shift')
  ),
  CONSTRAINT change_candidates_direction_allowed CHECK (direction IN ('increase','decrease')),
  CONSTRAINT change_candidates_status_allowed CHECK (status IN ('open','confirmed','dismissed')),
  CONSTRAINT change_candidates_window_order CHECK (window_end >= window_start),
  CONSTRAINT change_candidates_fingerprint_present CHECK (btrim(fingerprint) <> ''),
  CONSTRAINT change_candidates_unit_present CHECK (btrim(unit) <> ''),
  CONSTRAINT change_candidates_summary_present CHECK (btrim(summary) <> ''),
  CONSTRAINT change_candidates_resolution_pair CHECK (
    (status = 'open' AND resolved_at IS NULL)
    OR (status IN ('confirmed','dismissed') AND resolved_at IS NOT NULL)
  )
);

CREATE INDEX change_candidates_status_date_idx
  ON change_candidates (status, detected_on DESC, created_at DESC);

CREATE TABLE data_quality_reviews (
  id UUID PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  issue_kind TEXT NOT NULL,
  entity_kind TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  review_status TEXT NOT NULL,
  issue_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  note TEXT NULL,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT data_quality_reviews_status_allowed CHECK (
    review_status IN ('confirmed_valid','excluded_from_analysis')
  ),
  CONSTRAINT data_quality_reviews_fingerprint_present CHECK (btrim(fingerprint) <> ''),
  CONSTRAINT data_quality_reviews_entity_present CHECK (
    btrim(entity_kind) <> '' AND btrim(entity_id) <> ''
  ),
  CONSTRAINT data_quality_reviews_note_shape CHECK (
    note IS NULL OR (btrim(note) <> '' AND char_length(note) <= 500)
  )
);

CREATE INDEX data_quality_reviews_entity_idx
  ON data_quality_reviews (entity_kind, entity_id);
