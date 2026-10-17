# PIQ-4.2 — Latest Goal Control weight point condition integrity

**Scope:** current selected primary weight goal, personalized Ask Health
current-day cross-signal evidence only. Does not change canonical Goal Control
target or projection math.

Previously, the latest as-of weight point query shared by Goal Control and
Ask Health attested the metric value, unit, source IDs, session timestamps,
timezone, and edit revisions, but did not attest the session's existing
`comparability` label. Consequently a Goal Control target status based on a
`different_conditions` weigh-in could be repeated even where the full-series
projection quality gate already withheld forecasts.

The shared as-of SQL now reads `body_measurement_sessions.comparability` and
includes it in the private source fingerprint. Ask Health's late independent
recheck requires the field to be present and valid. After matching the
captured source revision and source identity, a point present with anything
other than owner/source-reported `usual` yields
`measurement_conditions_unverified`, with selected goal current target and
deadline status **WITHHELD**, even if Goal Control has no available forecast.
No point remains `canonical_target_unknown`, not fabricated goal failure.
Source-revision mismatch is reported as change, not hidden by condition
status; projection source integrity still takes precedence over both
condition and forecast quality assessments.

Model evidence contains non-substantive reason/coverage only, never
measurement values, IDs or revision hashes. The existing generic Goals
packet consistency guard prevents substantive re-entry of the selected goal.
Goal calculations and user-authored goal remain unchanged.

Recorded `usual` does not verify the scale, timing, hydration status,
physiological interpretation or calorie adjustment. This is an evidence
quality fence, not a treatment decision.

No schema migration, added SQL query, model invocation, owner health record
inspection, production deployment or owner acceptance.
