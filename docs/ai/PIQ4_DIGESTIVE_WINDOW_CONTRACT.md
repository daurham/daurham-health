# PIQ-4.1 — Audited 90-day maximum Bristol-event window

**Engineering implementation only. Does not prove personal cause, complete symptom tracking, AI quality, production DB/Auth identity or owner acceptance.**

## Question-scoped, bounded privacy rules

For explicit bowel questions or opt-in Deep Dive, determine an *exact* period from already validated calendar/request scope (historic day, supported trailing week/month, or selected history). If the period exceeds 90 calendar days, return a non-substantive unavailable marker and do not silently clip. Invalid or out-of-range requested intervals do not run a query. A General Only request is routed before private packet loading.

Only grouped counts by saved `bowel_date` are read from `bowel_events`: event count, valid Bristol count (1–7), and hard Bristol count (1–2). No free-text notes, timestamps, source IDs, user credentials, actual rows or unrestricted event history are sent in this additional query. The source pre-existing snapshot already has recorded bowel event counts and explicit no-movement days. A pure verifier recomputes totals from the grouped data and checks every observed date against the canonical snapshot. Conflicting counts, invalid shape, duplicate date rows or provider read failure suppress the summary without fabricating trends.

Explicit zero and unlogged date are different; the denominator for hard stools is only events with saved valid Bristol types. Partial today is marked provisional. The result is aggregated only for the requested complete in-bounds window; it cannot establish total movements, dehydration, fiber sufficiency, mechanism, association or cause. Water/fiber comparisons with genuine lag and confounders remain a later PIQ-4.1 slice, not automatically inferred here.

## Synthetic tests and release

Tests cover full-window counts, zero versus unknown, incomplete types, count conflicts and duplicate rows, query scope, >90-day fail closed, historical requests, provisional today, and explicit privacy-mode isolation. A successful test/build must be pinned to the exact commit. No migration is introduced. Production remains on main; effective Neon DB/Auth branch, backup+restore, disposable test owner, human-reviewed answer quality and explicit release permission remain mandatory before owner-data QA or deployment.

## 2026-10-16 identity-consistent corrections (new engineering guard)

A matching **daily count** does not prove that the two reads saw the same events: a delete and re-add can preserve the movement count and Bristol-1/2 totals with different underlying IDs. The already-loaded canonical `HealthIntelligenceSnapshot` provides bounded saved event IDs per selected day; a pure read-only selector validates unique IDs and a maximum of 512 references over the maximum 90-day scope. Null or oversized identity lists fail closed.

The supplemental grouped SQL query receives this known-ID array as a parameter and returns **only** `matched_event_count` per date, alongside already-approved totals. It does **not** SELECT raw IDs or notes. The pure window reconciler now requires `matchedEventCount === eventCount` on each saved bowel-event date, in addition to per-date canonical counts, rejecting same-day replacement even when counts and classifications match. Identity parameters are server-internal; no IDs are sent to the AI packet. Existing evidence fingerprints change when a previously available group becomes unavailable, protecting normal follow-on response cache selection. The query still is not a cross-table repeatable-read transaction: edits to fiber/context between separate reads are possible and require runtime QA / future transaction-boundary design.

Tests explicitly verify old-event deletion/replacement, refreshed matching snapshot, missing/out-of-range identity match counts, duplicated IDs and no synthetic promotion on mismatch. No schema change, migration, extra owner data, Gemini or deployment required.
