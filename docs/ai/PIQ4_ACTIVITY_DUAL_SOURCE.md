# PIQ-4.2 — generic Activity / shared Intelligence dual-read agreement

**Development-only deterministic reconciliation; no new SQL, paid provider call
or production deployment.**

A current personalized Ask Health response independently retrieves canonical
Activity summaries through `listActivityDailySummaries` for the direct
`activity.*` evidence and through `loadHealthIntelligenceSnapshot` for
`intelligence.coverage/baseline/relationship/change` evidence. Previously a
mid-request Activity correction or different source view could cause those
two paths to contradict each other, even when no focused weight/energy
source check ran (e.g. “How many steps did I walk?”).

The new `reconcileAskActivitySources` compares all four directly displayed
Activity signals (steps, active energy, exercise minutes, resting HR), on
exactly the selected current date range, against the source-identified
intelligence frame, without another database round trip. Complete
`0` is an actual recorded observation, not an inferred no-activity day.
Missing on either side, changed numerical value, duplicate in-range date,
different timezone, missing source identity, or insufficient overlapping
snapshot date scope fails closed. Distance is not used by the current
generic packet and is not claimed as verified.

A conflict suppresses `activity.*` direct evidence and the Activity
slices of routed shared Intelligence, including relationships and changes
with an Activity operand. Its related knows/missing context summaries are
removed, while unrelated observations (such as sleep or wellness) remain.
For the same current personalized focused weight/energy question, the
Activity conflict also withholds focused weight/intake interpretation and
generic conflicting evidence under the existing packet precedence rule.
All warnings are non-substantive and privacy-safe; no source identities or
step/HR values from a conflicting view enter the warning. Cache fingerprint
changes automatically with the evidence selection.

This is cross-read agreement only, **NOT** independent final row revision
attestation. A source can be modified after both reads; current focused
weight/energy's separate final recheck continues to be necessary. This
does not attest unrelated training, workouts, sleep, supplements or profile.
For historical as-of requests, it reports not checked and leaves existing
scope policies unchanged.
