# PIQ-4.2 — historical Goal Control version/lifecycle fail-closed boundary

**Development only.** The canonical point-observation readers now use an
as-of date, but `listGoalAskSnapshots` still selects `is_current` versions
and current `goals.status`. These are not historical target/lifecycle states.

`goal_versions.created_at` can date a target revision, but the schema
does not reconstruct full past effective-dated goal lifecycle, including
start, pause/resume, completion and archive. Showing "target met/unmet",
deadlines or old goals as if their status were attested is incorrect.

- The *service* returns no historical goal-status snapshots when `asOf`
  differs from the actual Health-local day (before performing any DB query).
- The Ask Health loader additionally withholds current goal snapshots when
  the question explicitly requests historical/ambiguous goal dates or past
  windows, even if `asOf` is today.
- The *packet builder* independently blocks injected current goal versions
  for such requests and emits a non-substantive, ID-free **unverified**
  boundary, with a formal limitation. This fact is retained in the
  single-day/window filtering paths and changes the packet fingerprint.
- Current-day goal state remains available; this does not alter saved
  Goals, target versions, experiments, or the DB.

This is a truthful **fail-closed intermediate step**, not retrospective
goal-version reconstruction. An owner-approved effective-dated Goal
lifecycle source and version-interval model are prerequisites before
historical achievement claims. Current maintenance/calorie advice
remains unauthorized for other independent safety reasons.
