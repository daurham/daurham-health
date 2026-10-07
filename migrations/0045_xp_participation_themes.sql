-- I3 XP Participation Expansion.
-- Keep the append-only wallet; broaden award sources beyond Coach while preserving purchase/refund semantics.

ALTER TABLE xp_ledger
  DROP CONSTRAINT xp_ledger_source_kind_allowed,
  DROP CONSTRAINT xp_ledger_source_shape;

ALTER TABLE xp_ledger
  ADD CONSTRAINT xp_ledger_source_kind_allowed CHECK (
    source_kind IN ('coach_task', 'daily_participation', 'reward_purchase')
  ),
  ADD CONSTRAINT xp_ledger_source_shape CHECK (
    (entry_kind = 'award' AND source_kind IN ('coach_task', 'daily_participation') AND rule_version IS NOT NULL)
    OR
    (entry_kind IN ('purchase', 'refund') AND source_kind = 'reward_purchase')
  );

CREATE INDEX xp_ledger_daily_participation_idx
  ON xp_ledger (occurred_at DESC, id DESC)
  WHERE entry_kind = 'award' AND source_kind = 'daily_participation';

-- No historical Daily Signals or supplement adherence is backfilled here.
-- I3 participation XP is mutation-driven, idempotent per domain/Health date,
-- and only eligible inside the configured short backlog grace window.
