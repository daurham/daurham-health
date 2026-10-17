# PIQ-4.2 — generic Goals packet cross-source consistency

The current personalized weight-energy reconciliation may withhold the
selected primary weight goal's target/deadline because Goal Control version,
measurement source or temporal quality is not verified. The generic Goals
builder previously appended that same goal as a **substantive** row, which
could contradict the evidence boundary in the very same model packet.

The focused screen now carries a private, transient selected active weight
goal ID from the already loaded canonical current-goal result. When the
canonical goal review is not `canonical_reported`, the generic Goals
builder excludes the exact selected goal. When selection ID could not be
established, it conservatively omits body-metric Goals from this current
focused answer rather than risk emitting the unverifiable weight-goal status.
Non-body Goals and other body goals with a known nonmatching ID remain
available. In the absence of a focused weight-energy analysis, normal
general Goals behavior is unchanged.

This is a packet assembly safeguard, not a claim of clinical projection
validity, owner goal fulfillment, or authorization to change calorie targets.
The selected ID must never appear in new structured confidence summaries.
No SQL, schema, provider calls, production deployment or owner PHI testing.
