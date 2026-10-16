# PIQ-4.2 — Current-settings revision boundary (development slice)

The current Ask Health weight/intake evidence has a **read-only, current-date-only**
target/experiment snapshot gate, separate from the actual maintenance decision engine.
It uses the existing `readMaintenanceDecisionSnapshot` SQL twice around other
Ask Health focused retrieval. That one-statement canonical digest covers the
effective owner nutrition target, **all active goal versions**, applicable active
or soon-scheduled experiments, and profile, at each read.

Only when both reads succeed, use a consistent revision, and validate the returned
target/count may Ask Health state **whether a calorie target is configured** and
**how many active or imminently scheduled experiments** the maintenance gate saw.
Neither the revision digest, numeric calorie target, goal IDs, experiment identities
nor other private settings are sent as this extra packet evidence. A revision change,
missing SQL, malformed value, or failure yields **UNKNOWN**, not zero experiments,
absence of a target, or a safe calorie-cut conclusion.

A consistent revision does NOT establish the user's current *weight-goal direction*,
matching exercise performance, safe calorie intake, actual deficit, plateau diagnosis,
or authorization to alter a target. All those decisions stay with Goal Control and
owner-reviewed maintenance/Personal Lab logic; the `decisionVerification` field
remains `not_checked`. On General Only, dated/historical requests, other questions
and historical as-of, there is **no settings query** or new private evidence.
Any future integration must retain source revisions and fail-closed semantics.

Synthetic tests cover no-goal/no-target versus unreadable, unchanged target/count
but changed goal revision, malformed/failed SQL, cache differentiation,
question/date exclusions, and non-substantive decision-boundary language.
No new migration, owner-data access, AI spend, Auth change or production promotion.
