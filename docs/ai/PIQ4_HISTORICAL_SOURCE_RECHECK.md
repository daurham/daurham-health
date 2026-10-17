# PIQ-4.2 — historical selected-date late Nutrition and weight recheck

In-scope explicit historical past-day and bounded date-range evidence had
revision-checked Nutrition only at the initial intelligence snapshot load.
A later owner edit, deletion, analysis exclusion or confirmation change could
invalidate the weight or calorie figure before Ask Health generated its answer.
Current-day focused source rechecks intentionally do not cover those dates.

`server/ask-health/historical-weight-energy-source-recheck.ts` performs
exactly TWO additional bounded local SQL source reads for an explicitly
selected in-range past day or window of up to 90 calendar days. The first
reuses the canonical owner-complete, current-revision, source-identified
Nutrition SQL, including actual calories, protein, carbohydrates and sodium.
It compares the same requested date set, exact calorie IDs/values, nutrient
totals and newly confirmed eligible dates against the initial snapshot.
The second reads weight metrics from the requested historical dates using
the existing late comparison's exclusion guard and source-identity, unit,
calendar-date, value, condition and provenance conversion. One extra date
padding handles timezone normalization. If any required data changed,
became unavailable, or was newly confirmed, the entire specific historical
weight/energy context fails closed.

The loader runs this check only when a history-specific in-range day/window
was actually parsed; it never replaces requested dates with today's current
goal or unrelated profile. The packet keeps only a non-substantive
`weight_energy.historical_day.source_consistency` or
`weight_energy.historical_window.source_consistency` warning plus its range
and any independent historical Goal attestation boundary when recheck fails.
It withholds the earlier historical weight value, mean completed-day kcal,
weight range/change and even earlier completeness count, since those might
now be stale.

No personal causal physiology conclusion, deficit, prescription, database
migration, third-party AI call, production merge or owner PHI access.
This is bounded optimistic read consistency, NOT historical versioning,
a proof of a full transaction snapshot, or a guarantee against mutations
after the last read. Out-of-range, provisional today and General Only
questions do not receive an attested historical figure.
