-- V2-H2B extends the existing Coach ledger; no XP or second performance authority.
ALTER TABLE coach_tasks ADD COLUMN accepted_at TIMESTAMPTZ NULL;

ALTER TABLE coach_tasks DROP CONSTRAINT coach_tasks_kind_allowed;
ALTER TABLE coach_tasks ADD CONSTRAINT coach_tasks_kind_allowed
  CHECK (task_kind IN ('weekly_focus', 'daily_quest', 'stretch_quest'));

ALTER TABLE coach_tasks DROP CONSTRAINT coach_tasks_status_allowed;
ALTER TABLE coach_tasks ADD CONSTRAINT coach_tasks_status_allowed
  CHECK (status IN ('offered', 'active', 'completed', 'passed', 'failed', 'expired'));

ALTER TABLE coach_tasks DROP CONSTRAINT coach_tasks_difficulty_allowed;
ALTER TABLE coach_tasks ADD CONSTRAINT coach_tasks_difficulty_allowed
  CHECK (difficulty IN ('routine', 'standard', 'weekly', 'stretch'));

ALTER TABLE coach_tasks DROP CONSTRAINT coach_tasks_reward_band_allowed;
ALTER TABLE coach_tasks ADD CONSTRAINT coach_tasks_reward_band_allowed
  CHECK (reward_band IN ('routine', 'standard', 'weekly', 'stretch'));

ALTER TABLE coach_tasks ADD CONSTRAINT coach_tasks_stretch_state_allowed CHECK (
  (task_kind = 'stretch_quest' AND difficulty = 'stretch' AND reward_band = 'stretch'
    AND verification_mode = 'canonical' AND action_kind = 'open'
    AND (status NOT IN ('active', 'completed', 'failed') OR accepted_at IS NOT NULL))
  OR (task_kind <> 'stretch_quest' AND status NOT IN ('offered', 'failed') AND accepted_at IS NULL)
);

-- Health has one owner; the constant key serializes all offered/active Stretch rows.
CREATE UNIQUE INDEX coach_tasks_one_current_stretch
  ON coach_tasks ((1))
  WHERE task_kind = 'stretch_quest' AND status IN ('offered', 'active');

CREATE INDEX coach_tasks_stretch_history_idx ON coach_tasks (starts_on DESC, id)
  WHERE task_kind = 'stretch_quest';

ALTER TABLE coach_task_events DROP CONSTRAINT coach_task_events_kind_allowed;
ALTER TABLE coach_task_events ADD CONSTRAINT coach_task_events_kind_allowed
  CHECK (event_kind IN ('offered', 'accepted', 'completed', 'passed', 'failed', 'expired'));
