# PIQ-4.2 — Version-attested goal boundary vs comparable recorded weights

**Development only, no new migration.** For current personalized weight/energy
questions, extend the existing read-only active current-version weight-goal
query to obtain target bounds (kg or lb, normalized to kg in private code).
The goal, target and experiments must remain attested by two matching
`readMaintenanceDecisionSnapshot` revision reads. Missing version, invalid
target shape, unsupported unit, revision disagreement and ambiguous multiple
active weight goals all fail closed. No numeric target, goal ID or version ID is
newly added to the provider packet.

A separate pure screen selects only the latest three usual-condition,
source-identified owner/device weight observations from the last 21 calendar
days, with >=6 days between first/last and the latest within 7 days of
the Health-local as-of day. Those thresholds are engineering safeguards, **not**
clinical diagnostic standards. It describes whether all sampled weights are
above, below or within the attested boundary, or mixed, without exposing any
weight or target amount. It is NOT a canonical Goal Control target-state
recomputation or a validated plateau/preservation result. Saved body rows are
not independently revision-pinned in this slice.

General Only, dated history, past as-of and unrelated questions bypass the
current owner-goal read. Clinical/calorie advice stays blocked. The evidence is
non-substantive for advice and participates in response fingerprinting. Future
work should resolve true active goal intent, movement confounding, experiment
baseline and longitudinal record revisions before any intervention decision.
