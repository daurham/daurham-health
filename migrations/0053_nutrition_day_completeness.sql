-- PIQ-1.1: explicit owner-reported completeness, never infer old days complete.
-- This migration is committed on a feature branch only; do not apply to prod
-- until instance schema and backup/restore readiness are verified.
CREATE TABLE nutrition_day_completeness (
  health_date DATE PRIMARY KEY,
  owner_report TEXT NOT NULL CHECK (owner_report IN ('complete', 'partial', 'unknown')),
  zero_intake_fast BOOLEAN NOT NULL DEFAULT false,
  entry_revision TEXT NOT NULL CHECK (length(entry_revision) = 64),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (NOT zero_intake_fast OR owner_report = 'complete')
);
