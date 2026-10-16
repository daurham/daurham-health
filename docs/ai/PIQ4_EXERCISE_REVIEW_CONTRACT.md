# PIQ-4.2 — read-only exact-exercise performance review

This development-only slice surfaces **preliminary risk flags** alongside the
existing protein and training participation evidence when the owner asks a
current-date personalized weight/energy question. It reuses the canonical
`loadTrainingProgressionState` and `assessMaintenancePerformanceSafety`
paths: exact exercise performance, not workout-day counts or generic movement
matching. Only recent (last 14 calendar days excluding today), moderate/high
confidence, >=4-exposure e1RM or reps series qualify. Recent negative/confounded
series are REVIEW flags, not proof of diet-caused strength loss.

A read error, stale as-of window, changed/unavailable settings revision, or
insufficient matched series means UNKNOWN, not stable performance. The live
workout snapshot is *not independently revision-attested* and does not justify
asserting intact muscle, guaranteed strength retention, exercise adequacy,
sustainable deficit, physiological expenditure, or a calorie target adjustment.
Even a clean observed set says only that **no qualifying decline flag** appeared.
The Ask Health decision boundary remains permanently review-only in this slice.

No workout names, IDs, loads, effort figures, sets, owner goal labels or SQL error
details are sent with this new aggregate explanation: only eligible-series and
provisional decline-flag counts plus explicit caveats. General Only, dated periods,
historical as-of and unrelated prompts do not load exercise performance.
A recorded training date is still never a strength outcome.

Synthetic regression: matched decline, clean qualified series, sparse/stale
and poor-confidence exercise records, changed settings, historical/General Only,
selected evidence fingerprint. No schema migration, model call, clinical
prescription, production promotion or owner-data QA is authorized.
