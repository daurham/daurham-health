-- Operational provider-cost ledger. Not an owner Health record.
-- No question, conversation, evidence packet, answer, note, or user_id.

CREATE TABLE ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  request_hash TEXT NULL,
  status TEXT NOT NULL,
  reserved_cost_usd NUMERIC(12, 6) NOT NULL,
  actual_cost_usd NUMERIC(12, 6) NULL,
  input_tokens INTEGER NULL,
  output_tokens INTEGER NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalized_at TIMESTAMPTZ NULL,
  CONSTRAINT ai_usage_request_type_present CHECK (char_length(btrim(request_type)) BETWEEN 1 AND 64),
  CONSTRAINT ai_usage_provider_present CHECK (char_length(btrim(provider)) BETWEEN 1 AND 64),
  CONSTRAINT ai_usage_model_present CHECK (char_length(btrim(model)) BETWEEN 1 AND 200),
  CONSTRAINT ai_usage_status_known CHECK (status IN ('reserved', 'completed', 'released', 'uncertain')),
  CONSTRAINT ai_usage_hash_shape CHECK (request_hash IS NULL OR request_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ai_usage_reserved_nonnegative CHECK (reserved_cost_usd >= 0),
  CONSTRAINT ai_usage_actual_nonnegative CHECK (actual_cost_usd IS NULL OR actual_cost_usd >= 0),
  CONSTRAINT ai_usage_actual_within_reservation CHECK (actual_cost_usd IS NULL OR actual_cost_usd <= reserved_cost_usd),
  CONSTRAINT ai_usage_tokens_nonnegative CHECK (
    (input_tokens IS NULL OR input_tokens >= 0)
    AND (output_tokens IS NULL OR output_tokens >= 0)
  ),
  CONSTRAINT ai_usage_status_fields CHECK (
    (
      status = 'reserved'
      AND actual_cost_usd IS NULL
      AND finalized_at IS NULL
      AND input_tokens IS NULL
      AND output_tokens IS NULL
    )
    OR (
      status = 'completed'
      AND actual_cost_usd IS NOT NULL
      AND finalized_at IS NOT NULL
    )
    OR (
      status = 'uncertain'
      AND actual_cost_usd IS NULL
      AND finalized_at IS NOT NULL
      AND input_tokens IS NULL
      AND output_tokens IS NULL
    )
    OR (
      status = 'released'
      AND finalized_at IS NOT NULL
      AND (actual_cost_usd IS NULL OR actual_cost_usd = 0)
      AND input_tokens IS NULL
      AND output_tokens IS NULL
    )
  )
);

CREATE INDEX ai_usage_created_at_idx ON ai_usage (created_at);

CREATE INDEX ai_usage_provider_attempts_idx
  ON ai_usage (created_at)
  WHERE status IN ('reserved', 'completed', 'uncertain');
