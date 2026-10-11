-- Optional global water goal in canonical milliliters.
-- A goal is a preference, never a water consumption event or source of XP.
-- Existing hydration events are not changed and no default is imposed.
CREATE TABLE hydration_goal_settings (
  singleton SMALLINT PRIMARY KEY DEFAULT 1 CHECK (singleton = 1),
  daily_target_ml NUMERIC(10,2) NOT NULL
    CHECK (daily_target_ml >= 29.57 AND daily_target_ml <= 10000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
