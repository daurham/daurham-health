# PIQ-4.2 — exact-version canonical selected-goal status and deadline boundary

Current-day personalized weight/energy questions already load Goal Control
snapshots with canonical target/deadline evaluation (not suitable for historical
version reconstruction). The read has the current version UUID internally;
that UUID was not connected to the owner-selected active weight goal.

This increment carries the private current-version ID from Goal Control into
the in-memory Ask Health input (never into the AI evidence), then compares
**both goal ID and version ID** with the current maintenance decision revision
read, explicitly selected primary goal and the active weight-goal source row.
It rejects duplicate, stale, missing, non-weight, non-active or incompatible
target reports. Explicitly unset, cleared or non-weight priorities are *not*
coerced into weight-loss intentions. A selected current goal with a compatible
Goal Control report can describe canonical `satisfied`, `above_target`,
`below_target` and outside-range states, but **never independently verifies
that the measurements used for the report remained unchanged during read**.

Dates are treated conservatively: Goal Control `passed_unmet` / `due_today`
with `targetState=unknown` means **past/due deadline with missing target
evidence**, not a verified unmet weight goal. A valid current goal-status
report can also disagree with three comparable recent weights; this triggers
a measurement-source/timing review, not a claim that either source is wrong.

A pure downstream cross-signal reconciliation now highlights version
mismatches, source disagreement and deadline attention. All results keep
`intervention:not_authorized`, `calorieAdjustment:not_authorized`,
`plateauClassification:not_authorized` and
`strengthPreservation:not_verified`. The AI packet carries only descriptive
status enums, deadline attention classes and the explicit
`measurementRevision:not_attested` boundary. No raw goal IDs, version IDs,
weights, numeric goal targets or SQL digests enter these new evidence rows.

No new SQL request, production deployment, migration, paid model call or real
owner data test. Future work: separately bracket relevant body observation
source revisions, adjudicate clinical and energy safety constraints, complete
owner-directed end-to-end validation and phase acceptance.
