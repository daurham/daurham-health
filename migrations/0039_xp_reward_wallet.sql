-- V2-H3 XP / Reward Wallet.
-- Coach completion is the only XP issuance boundary. The ledger is append-only.

CREATE TABLE reward_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  cost_xp INTEGER NOT NULL,
  note TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reward_items_name_present CHECK (btrim(name) <> ''),
  CONSTRAINT reward_items_name_length CHECK (char_length(name) <= 120),
  CONSTRAINT reward_items_cost_positive CHECK (cost_xp > 0),
  CONSTRAINT reward_items_note_length CHECK (note IS NULL OR char_length(note) <= 500)
);

CREATE TABLE reward_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reward_item_id UUID NULL REFERENCES reward_items(id) ON DELETE SET NULL,
  reward_name TEXT NOT NULL,
  cost_xp INTEGER NOT NULL,
  submission_id UUID NOT NULL UNIQUE,
  purchased_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reward_purchases_name_present CHECK (btrim(reward_name) <> ''),
  CONSTRAINT reward_purchases_cost_positive CHECK (cost_xp > 0)
);

CREATE TABLE xp_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_kind TEXT NOT NULL,
  amount_xp INTEGER NOT NULL,
  source_kind TEXT NOT NULL,
  source_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  rule_version TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT xp_ledger_entry_kind_allowed CHECK (entry_kind IN ('award', 'purchase', 'refund')),
  CONSTRAINT xp_ledger_amount_positive CHECK (amount_xp > 0),
  CONSTRAINT xp_ledger_source_kind_allowed CHECK (source_kind IN ('coach_task', 'reward_purchase')),
  CONSTRAINT xp_ledger_idempotency_present CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT xp_ledger_source_shape CHECK (
    (entry_kind = 'award' AND source_kind = 'coach_task' AND rule_version IS NOT NULL)
    OR
    (entry_kind IN ('purchase', 'refund') AND source_kind = 'reward_purchase')
  )
);

CREATE UNIQUE INDEX xp_ledger_one_coach_award
  ON xp_ledger (source_id)
  WHERE entry_kind = 'award' AND source_kind = 'coach_task';

CREATE UNIQUE INDEX xp_ledger_one_purchase_debit
  ON xp_ledger (source_id)
  WHERE entry_kind = 'purchase' AND source_kind = 'reward_purchase';

CREATE UNIQUE INDEX xp_ledger_one_purchase_refund
  ON xp_ledger (source_id)
  WHERE entry_kind = 'refund' AND source_kind = 'reward_purchase';

CREATE INDEX xp_ledger_occurred_at_idx ON xp_ledger (occurred_at DESC, id DESC);
CREATE INDEX reward_items_active_idx ON reward_items (is_active, created_at DESC);
CREATE INDEX reward_purchases_purchased_at_idx ON reward_purchases (purchased_at DESC, id DESC);

-- H3 arrives after Coach. Backfill every previously completed Coach commitment
-- from its frozen reward_band. This is deterministic and idempotent at migration time.
INSERT INTO xp_ledger (
  id,
  entry_kind,
  amount_xp,
  source_kind,
  source_id,
  idempotency_key,
  rule_version,
  occurred_at,
  metadata
)
SELECT
  gen_random_uuid(),
  'award',
  CASE task.reward_band
    WHEN 'routine' THEN 10
    WHEN 'standard' THEN 25
    WHEN 'weekly' THEN 75
    WHEN 'stretch' THEN 100
  END,
  'coach_task',
  task.id,
  'award:coach:' || task.id::text,
  'xp-rule-v1',
  COALESCE(task.completed_at, task.closed_at, task.updated_at, task.created_at),
  jsonb_build_object(
    'coachTaskId', task.id::text,
    'taskKind', task.task_kind,
    'rewardBand', task.reward_band,
    'title', task.title,
    'completedAt', COALESCE(task.completed_at, task.closed_at, task.updated_at, task.created_at),
    'ruleVersion', 'xp-rule-v1'
  )
FROM coach_tasks task
WHERE task.status = 'completed'
  AND task.reward_band IN ('routine', 'standard', 'weekly', 'stretch')
ON CONFLICT DO NOTHING;

-- Guard accounting history from accidental application UPDATE/DELETE.
CREATE OR REPLACE FUNCTION prevent_reward_history_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER xp_ledger_append_only
BEFORE UPDATE OR DELETE ON xp_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_reward_history_mutation();

CREATE TRIGGER reward_purchases_immutable
BEFORE UPDATE OR DELETE ON reward_purchases
FOR EACH ROW EXECUTE FUNCTION prevent_reward_history_mutation();
