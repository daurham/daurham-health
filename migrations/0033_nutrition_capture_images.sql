-- Ordered meal-photo views for one capture. Operational evidence only.
-- Legacy nutrition_capture_jobs.image_bytes stays for labels and older meal jobs.

CREATE TABLE nutrition_capture_images (
  home_ai_job_id TEXT NOT NULL REFERENCES nutrition_capture_jobs (home_ai_job_id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  source_filename TEXT,
  image_mime TEXT NOT NULL,
  image_bytes BYTEA NOT NULL,
  content_sha256 TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (home_ai_job_id, position),
  CONSTRAINT nutrition_capture_images_position_range CHECK (position >= 0 AND position < 3),
  CONSTRAINT nutrition_capture_images_mime_allowed CHECK (image_mime IN ('image/jpeg', 'image/png')),
  CONSTRAINT nutrition_capture_images_sha256_hex CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT nutrition_capture_images_unique_digest UNIQUE (home_ai_job_id, content_sha256)
);
