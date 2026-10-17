# PIQ-4.2 — canonical Goal Control weight projection input consistency

Goal Control uses its latest eligible bodyweight *point* for current target
status, and a separately loaded full `body_metrics` history to calculate
projection state. PIQ PR #28 rechecked only the latest point, so edits,
backfills, deletions or corrections to **earlier weights** could leave the
projection sources inconsistent during a personalized answer.

This change shares an exact projection source SQL query between Goal Control
and an independent late Ask Health recheck. The canonical query's full rows
are unchanged except for stable ordering and adding metric/session
`updated_at` fields, which do not enter projection math. A private SHA-256
hash covers every returned row's metric/session IDs, metric type, raw value,
unit, value kind, measurement time, timezone and both edit timestamps.
The fingerprint includes all fetched weight rows, even if the projection
algorithm later excludes future-dated rows. Source history is fingerprinted
only when it fits the 3,000-row budget and contains valid identities and
types; Goal Control's existing projection math remains uncapped and
unchanged when the fingerprint cannot be established.

The current-day explicitly selected weight goal MUST still match the
active goal's exact identity and current version, the latest point check
and the twice-checked maintenance decision. Its exact private historical
projection input digest captured *during the Goal Control query* must match
the independent recheck near packet completion. Disagreement, source
overflow, missing fingerprint or SQL failure WITHHOLDS the canonical goal
target/deadline and projection interpretation. An empty history can be
consistently verified as empty, but never counted as goal attainment.
This is optimistic before/after consistency, NOT a transaction snapshot,
protection against change-and-revert, clinical safety evidence or
validation of projection quality. No raw records, hashes or numeric
interventions enter the AI packet.

No schema migration, production deployment, paid AI call or owner-data
test. Further work: reconcile projection eligibility and measurement
quality across historical cutoffs, permissioned action gates, owner QA.
