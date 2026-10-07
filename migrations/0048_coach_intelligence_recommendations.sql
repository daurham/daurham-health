-- I9 — Coach Intelligence / Next Best Actions.
-- Persist only recommendation presentation/owner-response memory. Health evidence and
-- recommendation eligibility remain derived from canonical data.

CREATE TABLE coach_recommendations (
  id UUID PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  recommendation_kind TEXT NOT NULL,
  domain TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  action_text TEXT NOT NULL,
  detail_path TEXT NOT NULL,
  confidence TEXT NOT NULL,
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb,
  response_state TEXT NULL,
  surfaced_on DATE NOT NULL,
  last_surfaced_on DATE NOT NULL,
  suppress_until DATE NULL,
  follow_up_on DATE NULL,
  outcome_state TEXT NULL,
  response_at TIMESTAMPTZ NULL,
  outcome_at TIMESTAMPTZ NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT coach_recommendations_kind_present CHECK (btrim(recommendation_kind) <> ''),
  CONSTRAINT coach_recommendations_domain_present CHECK (btrim(domain) <> ''),
  CONSTRAINT coach_recommendations_title_present CHECK (btrim(title) <> ''),
  CONSTRAINT coach_recommendations_detail_present CHECK (btrim(detail) <> ''),
  CONSTRAINT coach_recommendations_action_present CHECK (btrim(action_text) <> ''),
  CONSTRAINT coach_recommendations_path_present CHECK (btrim(detail_path) <> ''),
  CONSTRAINT coach_recommendations_confidence_allowed CHECK (
    confidence IN ('limited','moderate','high','unknown')
  ),
  CONSTRAINT coach_recommendations_response_allowed CHECK (
    response_state IS NULL OR response_state IN ('do_this','not_now','not_relevant','turn_into_experiment')
  ),
  CONSTRAINT coach_recommendations_outcome_allowed CHECK (
    outcome_state IS NULL OR outcome_state IN ('helped','no_change','made_worse','unclear')
  ),
  CONSTRAINT coach_recommendations_surface_order CHECK (last_surfaced_on >= surfaced_on),
  CONSTRAINT coach_recommendations_response_time CHECK (
    (response_state IS NULL AND response_at IS NULL)
    OR (response_state IS NOT NULL AND response_at IS NOT NULL)
  ),
  CONSTRAINT coach_recommendations_outcome_time CHECK (
    (outcome_state IS NULL AND outcome_at IS NULL)
    OR (outcome_state IS NOT NULL AND outcome_at IS NOT NULL)
  )
);

CREATE INDEX coach_recommendations_response_idx
  ON coach_recommendations (response_state, suppress_until, follow_up_on);

CREATE INDEX coach_recommendations_last_surfaced_idx
  ON coach_recommendations (last_surfaced_on DESC, id);
