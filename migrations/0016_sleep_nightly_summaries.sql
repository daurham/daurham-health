-- Canonical nightly sleep summaries. One selected source per local date.
-- sleep_intervals remain raw evidence. logical_source_key is the wearable/provider,
-- not data_sources.id (which is the Apple Health import origin).

CREATE TABLE sleep_nightly_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sleep_date DATE NOT NULL,
  timezone TEXT NOT NULL,
  logical_source_key TEXT NOT NULL,
  source_name TEXT NOT NULL,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  total_sleep_minutes NUMERIC NULL,
  time_in_bed_minutes NUMERIC NULL,
  awake_minutes NUMERIC NULL,
  core_minutes NUMERIC NULL,
  deep_minutes NUMERIC NULL,
  rem_minutes NUMERIC NULL,
  unspecified_sleep_minutes NUMERIC NULL,
  stage_coverage_pct NUMERIC NULL,
  stage_conflict_minutes NUMERIC NOT NULL DEFAULT 0,
  observation_status TEXT NOT NULL,
  analysis_eligible BOOLEAN NOT NULL,
  stage_analysis_eligible BOOLEAN NOT NULL,
  selection_reason TEXT NOT NULL,
  calculation_version TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_id UUID NULL REFERENCES data_sources(id),
  import_job_id UUID NULL REFERENCES import_jobs(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sleep_nightly_summaries_timezone_present CHECK (btrim(timezone) <> ''),
  CONSTRAINT sleep_nightly_summaries_logical_source_present CHECK (btrim(logical_source_key) <> ''),
  CONSTRAINT sleep_nightly_summaries_source_name_present CHECK (btrim(source_name) <> ''),
  CONSTRAINT sleep_nightly_summaries_calculation_present CHECK (btrim(calculation_version) <> ''),
  CONSTRAINT sleep_nightly_summaries_status_known CHECK (
    observation_status IN ('analysis_eligible', 'partial_observation', 'in_bed_only')
  ),
  CONSTRAINT sleep_nightly_summaries_reason_known CHECK (
    selection_reason IN ('source_priority', 'completeness_override', 'partial_only', 'in_bed_only')
  ),
  CONSTRAINT sleep_nightly_summaries_eligibility_consistent CHECK (
    (observation_status = 'analysis_eligible' AND analysis_eligible)
    OR (observation_status <> 'analysis_eligible' AND NOT analysis_eligible)
  ),
  CONSTRAINT sleep_nightly_summaries_stage_implies_analysis CHECK (
    NOT stage_analysis_eligible OR analysis_eligible
  ),
  CONSTRAINT sleep_nightly_summaries_end_not_before_start CHECK (end_at >= start_at),
  CONSTRAINT sleep_nightly_summaries_date_timezone_key UNIQUE (sleep_date, timezone)
);

CREATE INDEX sleep_nightly_summaries_eligible_date_idx
  ON sleep_nightly_summaries (sleep_date)
  WHERE analysis_eligible;

CREATE INDEX sleep_nightly_summaries_import_job_idx
  ON sleep_nightly_summaries (import_job_id);
