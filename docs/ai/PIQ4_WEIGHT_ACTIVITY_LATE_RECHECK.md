# PIQ-4.2 — late effective weight and activity source consistency

An independent intelligence snapshot previously loaded body-weight measurements
and device Activity daily summaries once. Both datasets can be changed by
a later edit/import while the current personalized Ask Health question performs
other reads. Neither a stable metric identity nor a previously read step total
guarantees that the **same effective record** still exists when generating
the answer.

The current-day weight/energy focus now performs two bounded read-only final
queries alongside the late Nutrition check. The source-shape constants share
the initial intelligence snapshot's exact Activity SQL and body-weight SQL.
Activity uses a dated query on Health timezone and compares the selected
steps, active energy, exercise minutes and resting heart rate along with
source ID. Body weights reuse the same unit conversion, local calendar
conversion, source provenance, quality label and SQL ordering as the
intelligence frame (last metric per calendar date wins). Excluded body metrics
or measurement sessions are filtered by current analysis-exclusion reviews.
Two days of scan padding cover timezone-edge weight measurement sessions.
Only the effective signals within the bounded focused period are compared,
including source IDs, units, values, quality labels and provenance.

Any mismatch, missing/duplicate-invalid source identity on an observed
point, delete, unavailable read or changed input yields a neutral
`changed_or_unavailable` state. When either this status or the independently
verified Nutrition status fails, the focused weight/energy packet suppresses
its analytical estimates, nutrient shifts, activity/hydration interpretation,
cross-signal and selected-goal interpretations and supplies a non-substantive,
privacy-minimized explanation instead. The last validated readings are NOT
transactionally locked: a subsequent edit after the last read can still
occur. This screen deliberately does not attest unrelated Daily Context
notes/tags, sleep, supplements, exercise programming or other generic
Ask Health evidence surfaces, and it cannot authorize calorie or
plateau-related interventions.

Additional local database load: **two bounded, read-only queries** on
eligible current-day focused questions, in addition to the existing single
Nutrition recheck. No migrations, third-party provider calls, owner data
exposure, main merge or production deployment.
