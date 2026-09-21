-- Outstanding Home-AI workout transcription jobs for cross-device review.
-- Candidates remain on Home-AI until commit. This table stores job identity and status only.

CREATE TABLE workout_transcription_jobs (
  home_ai_job_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  source_filename TEXT NULL,
  failure_message TEXT NULL,
  workout_session_id UUID NULL REFERENCES workout_sessions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT workout_transcription_jobs_status_allowed CHECK (
    status IN ('queued', 'processing', 'completed', 'failed', 'committed')
  ),
  CONSTRAINT workout_transcription_jobs_job_id_present CHECK (btrim(home_ai_job_id) <> '')
);

CREATE INDEX workout_transcription_jobs_pending_idx
  ON workout_transcription_jobs (created_at DESC)
  WHERE status <> 'committed';
