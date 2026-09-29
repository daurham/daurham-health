-- V2-H2A persistent deterministic Coach tasks and append-only lifecycle evidence.

CREATE TABLE coach_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_kind TEXT NOT NULL,
  rule_key TEXT NOT NULL,
  rule_version INTEGER NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  starts_on DATE NOT NULL,
  expires_on DATE NOT NULL,
  period_fingerprint TEXT NOT NULL UNIQUE,
  goal_id UUID NULL REFERENCES goals(id) ON DELETE SET NULL,
  verification_mode TEXT NOT NULL,
  action_kind TEXT NOT NULL,
  action_href TEXT NULL,
  target_value NUMERIC NULL,
  target_unit TEXT NULL,
  baseline_value NUMERIC NULL,
  difficulty TEXT NOT NULL,
  reward_band TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  completed_at TIMESTAMPTZ NULL,
  closed_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coach_tasks_kind_allowed CHECK (task_kind IN ('weekly_focus', 'daily_quest')),
  CONSTRAINT coach_tasks_verification_allowed CHECK (
    verification_mode IN ('canonical', 'training_log', 'owner_self_report')
  ),
  CONSTRAINT coach_tasks_action_allowed CHECK (
    action_kind IN ('open', 'log_training', 'log_self_report')
  ),
  CONSTRAINT coach_tasks_difficulty_allowed CHECK (difficulty IN ('routine', 'standard', 'weekly')),
  CONSTRAINT coach_tasks_reward_band_allowed CHECK (reward_band IN ('routine', 'standard', 'weekly')),
  CONSTRAINT coach_tasks_status_allowed CHECK (status IN ('active', 'completed', 'passed', 'expired')),
  CONSTRAINT coach_tasks_period_order CHECK (expires_on >= starts_on),
  CONSTRAINT coach_tasks_target_nonnegative CHECK (target_value IS NULL OR target_value >= 0),
  CONSTRAINT coach_tasks_baseline_nonnegative CHECK (baseline_value IS NULL OR baseline_value >= 0)
);

CREATE UNIQUE INDEX coach_tasks_daily_period_unique
  ON coach_tasks (starts_on)
  WHERE task_kind = 'daily_quest';

CREATE UNIQUE INDEX coach_tasks_weekly_period_unique
  ON coach_tasks (starts_on)
  WHERE task_kind = 'weekly_focus';

CREATE INDEX coach_tasks_status_period_idx
  ON coach_tasks (status, expires_on, starts_on);

CREATE INDEX coach_tasks_goal_idx
  ON coach_tasks (goal_id)
  WHERE goal_id IS NOT NULL;

CREATE TABLE coach_task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES coach_tasks(id) ON DELETE CASCADE,
  event_kind TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  evidence_kind TEXT NOT NULL,
  source_type TEXT NULL,
  source_id TEXT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coach_task_events_kind_allowed CHECK (
    event_kind IN ('offered', 'accepted', 'completed', 'passed', 'expired')
  ),
  CONSTRAINT coach_task_events_evidence_allowed CHECK (
    evidence_kind IN ('none', 'deterministic_canonical', 'training_session', 'owner_self_report')
  ),
  CONSTRAINT coach_task_events_idempotency_present CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT coach_task_events_idempotency_unique UNIQUE (task_id, idempotency_key)
);

CREATE INDEX coach_task_events_task_time_idx
  ON coach_task_events (task_id, occurred_at, id);
