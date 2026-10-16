# PIQ-4.2 — exact latest bodyweight point consistency at read time

Goal Control uses `BODY_GOAL_AS_OF_SQL` to select the latest eligible weight
metric by timestamp and metric ID, with session-local calendar cutoff. It
computes the canonical `targetState` from that **point**. This checkpoint
adds metric ID, session ID, timestamps, update timestamps, value and unit
to the SAME query and hashes this private tuple (SHA-256). Existing goal
evaluation remains unchanged; the token is copied only into the in-memory
current Goal Control snapshot for a weight goal, not any AI evidence.

During current-day personalized weight/energy packet load, the latest weight
point is re-read using **the exact same canonical query**, alongside the
final maintenance decision snapshot. The selected goal must still match the
exact goal ID and version; a nonempty original point fingerprint must equal
the later fingerprint to report `latest_point_rechecked`. Changes to point
identity, edits, measured times, recorded units/values, deletion, missing
identifiers, read errors or unknown source identity cause the canonical
target/deadline status to be WITHHELD. A missing measurement cannot
establish goal satisfaction, unmet status, or stable measurement coverage.

Only generic source check states and non-substantive summaries enter the
AI evidence. No source identifiers, hashes, values, timestamps or clinical
thresholds are published in the new row. The resulting cross-signal review
still cannot authorize a calorie adjustment, plateau diagnosis, muscle
preservation or efficacy statement.

This is an optimistic exact-*latest-point* consistency check, **not** a
database transaction snapshot, protection against transient change-and-
reversion, or an attestation of the historical body trend underlying Goal
Control projections. Other source channels and Goal Control presentation
may have independent provenance semantics. No migration, production
promotion, real owner data test or paid AI operation.
