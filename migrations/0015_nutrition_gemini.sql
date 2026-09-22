-- Gemini nutrition captures keep the photo and user note in Health
-- so review and retry do not depend on Home-AI disk.

ALTER TABLE nutrition_capture_jobs
  ADD COLUMN user_context TEXT,
  ADD COLUMN provider TEXT,
  ADD COLUMN image_bytes BYTEA,
  ADD COLUMN image_mime TEXT,
  ADD COLUMN interpretation JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE nutrition_capture_jobs
  ADD CONSTRAINT nutrition_capture_jobs_user_context_length
  CHECK (user_context IS NULL OR char_length(user_context) <= 2000);

ALTER TABLE nutrition_capture_jobs
  ADD CONSTRAINT nutrition_capture_jobs_provider_allowed
  CHECK (provider IS NULL OR provider IN ('gemini', 'home_ai'));
