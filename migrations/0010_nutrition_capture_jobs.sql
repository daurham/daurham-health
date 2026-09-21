-- Durable Home-AI Nutrition Facts label jobs.
-- Processed JPEGs/PNGs live on Home-AI disk, not in this table.
-- Jobs older than ~24h may be pruned on Home-AI; Health keeps status for pending review.

INSERT INTO data_sources (key, display_name, source_kind)
VALUES ('nutrition_label', 'Nutrition Label Photo', 'image')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE nutrition_capture_jobs (
  home_ai_job_id TEXT PRIMARY KEY,
  capture_kind TEXT NOT NULL,
  status TEXT NOT NULL,
  source_filename TEXT NULL,
  candidate_json JSONB NULL,
  failure_message TEXT NULL,
  food_id UUID NULL REFERENCES nutrition_foods(id),
  entry_id UUID NULL REFERENCES nutrition_entries(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at TIMESTAMPTZ NULL,
  CONSTRAINT nutrition_capture_jobs_kind_allowed CHECK (capture_kind = 'nutrition_label'),
  CONSTRAINT nutrition_capture_jobs_status_allowed CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'committed')
  ),
  CONSTRAINT nutrition_capture_jobs_job_id_present CHECK (btrim(home_ai_job_id) <> '')
);

CREATE INDEX nutrition_capture_jobs_pending_idx
  ON nutrition_capture_jobs (created_at DESC)
  WHERE status <> 'committed';
