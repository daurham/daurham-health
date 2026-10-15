-- PIQ-1.5: guard against two truly concurrent starts of alternative plateau levers.
-- A PostgreSQL partial unique index serializes conflicting active starts, even
-- across distinct recommendation IDs and independent stateless Neon queries.
-- Do not auto-resolve existing duplicates: production migration is owner-gated
-- and must fail visibly so preexisting decisions can be reviewed safely.
CREATE UNIQUE INDEX coach_recommendations_one_active_plateau_revision_idx
  ON coach_recommendations ((metadata ->> 'decisionRevision'))
  WHERE recommendation_kind IN ('review_intake_adjustment', 'review_activity_adjustment')
    AND response_state = 'do_this'
    AND metadata ->> 'ownerStarted' = 'true'
    AND outcome_state IS NULL
    AND metadata ->> 'decisionRevision' IS NOT NULL;
