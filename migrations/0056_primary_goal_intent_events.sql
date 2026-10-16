-- PIQ-2.3: explicit, effective-dated owner priority for an existing Goal.
-- An absent history is unset, never inferred from body weight or goal order.
-- Keep UUID identity after a goal is archived/deleted; no cascade of old intent.
CREATE TABLE primary_goal_intent_events (
  id UUID PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE CHECK (version > 0),
  primary_goal_id UUID NULL,
  effective_from DATE NOT NULL,
  source TEXT NOT NULL DEFAULT 'owner' CHECK (source = 'owner'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX primary_goal_intent_asof_idx ON primary_goal_intent_events (effective_from DESC, version DESC);
