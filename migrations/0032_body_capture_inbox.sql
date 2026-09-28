-- Body Shortcut captures wait for owner review.
-- Staging is not a measurement. Commit is the only path into body_measurement_sessions.

INSERT INTO data_sources (key, display_name, source_kind)
VALUES ('body_shortcut', 'Body Shortcut', 'shortcut')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE body_capture_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_capture_id TEXT NOT NULL,
  status TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL,
  timezone TEXT NOT NULL,
  metrics JSONB NOT NULL,
  notes TEXT NULL,
  source_id UUID NOT NULL REFERENCES data_sources(id),
  canonical_session_id UUID NULL REFERENCES body_measurement_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  committed_at TIMESTAMPTZ NULL,
  discarded_at TIMESTAMPTZ NULL,
  CONSTRAINT body_capture_inbox_capture_id_shape CHECK (external_capture_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  CONSTRAINT body_capture_inbox_status_allowed CHECK (status IN ('pending', 'committed', 'discarded')),
  CONSTRAINT body_capture_inbox_timezone_phoenix CHECK (timezone = 'America/Phoenix'),
  CONSTRAINT body_capture_inbox_metrics_array CHECK (
    jsonb_typeof(metrics) = 'array'
    AND jsonb_array_length(metrics) BETWEEN 1 AND 14
  ),
  CONSTRAINT body_capture_inbox_notes_bounded CHECK (notes IS NULL OR char_length(notes) <= 2000),
  CONSTRAINT body_capture_inbox_pending_shape CHECK (
    status <> 'pending'
    OR (
      committed_at IS NULL
      AND discarded_at IS NULL
      AND canonical_session_id IS NULL
    )
  ),
  CONSTRAINT body_capture_inbox_committed_shape CHECK (
    status <> 'committed' OR committed_at IS NOT NULL
  ),
  CONSTRAINT body_capture_inbox_discarded_shape CHECK (
    status <> 'discarded'
    OR (
      discarded_at IS NOT NULL
      AND committed_at IS NULL
      AND canonical_session_id IS NULL
    )
  )
);

CREATE UNIQUE INDEX body_capture_inbox_source_capture_key
  ON body_capture_inbox (source_id, external_capture_id);
