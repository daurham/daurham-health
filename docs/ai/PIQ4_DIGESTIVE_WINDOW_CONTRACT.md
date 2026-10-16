# PIQ-4.1 — Audited 90-day maximum Bristol-event window

**Engineering implementation only. Does not prove personal cause, complete symptom tracking, AI quality, production DB/Auth identity or owner acceptance.**

## Question-scoped, bounded privacy rules

For explicit bowel questions or opt-in Deep Dive, determine an *exact* period from already validated calendar/request scope (historic day, supported trailing week/month, or selected history). If the period exceeds 90 calendar days, return a non-substantive unavailable marker and do not silently clip. Invalid or out-of-range requested intervals do not run a query. A General Only request is routed before private packet loading.

Only grouped counts by saved `bowel_date` are read from `bowel_events`: event count, valid Bristol count (1–7), and hard Bristol count (1–2). No free-text notes, timestamps, source IDs, user credentials, actual rows or unrestricted event history are sent in this additional query. The source pre-existing snapshot already has recorded bowel event counts and explicit no-movement days. A pure verifier recomputes totals from the grouped data and checks every observed date against the canonical snapshot. Conflicting counts, invalid shape, duplicate date rows or provider read failure suppress the summary without fabricating trends.

Explicit zero and unlogged date are different; the denominator for hard stools is only events with saved valid Bristol types. Partial today is marked provisional. The result is aggregated only for the requested complete in-bounds window; it cannot establish total movements, dehydration, fiber sufficiency, mechanism, association or cause. Water/fiber comparisons with genuine lag and confounders remain a later PIQ-4.1 slice, not automatically inferred here.

## Synthetic tests and release

Tests cover full-window counts, zero versus unknown, incomplete types, count conflicts and duplicate rows, query scope, >90-day fail closed, historical requests, provisional today, and explicit privacy-mode isolation. A successful test/build must be pinned to the exact commit. No migration is introduced. Production remains on main; effective Neon DB/Auth branch, backup+restore, disposable test owner, human-reviewed answer quality and explicit release permission remain mandatory before owner-data QA or deployment.
