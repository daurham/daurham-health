# PIQ-4.2 requested historical calendar-window evidence contract

**Code-only; requires synthetic CI validation and later owner review.** A question explicitly naming last/this week, last/this month, or a supported trailing N-day period may only cite that **exact selected inclusive calendar interval**, not a recent 14/21/28-day maintenance estimate or an unscoped body or nutrition average.

The deterministic parser already in `digestDateSelection` supplies supported dates, selected-as-of timezone semantics, and ambiguous/invalid flags. If the named period exceeds the selected history or as-of bounds, the response contains **only neutral scoped unavailable evidence**, never silently clips or borrows data. A multi-date or unsupported date expression is not approximated with current values. The General Only service still bypasses all private reads.

For an in-range window, only strictly source-unique, positive, finite, `owner`-verified current-revision completed food-date observations qualify for a **conditional mean**; its denominator is verified observed dates, not every selected day. Exact day during Health-local today is provisional and excluded even if erroneously labeled complete. A weight change is emitted only when >=3 recorded usual-condition weigh-ins span >=6 days and have samples within 2 days of both period boundaries; difference is a *scale observation* between sampled endpoints, not fat-mass change, a plateau diagnosis, rate per day, or an energy-balance estimate. Incomplete or different-condition days are recorded as unknown/comparability withheld, never zero or stable. No new SQL, AI request, migration, calorie target change, or correlation.

The Ask Health packet is **restricted** to `ask.range` and `weight_energy.historical_window.*` for this requested period; neither current profile nor unscreened global intelligence, historical single-day, unrelated goals, notes, recent stats or undated nutrient averages may leak through. ContextSummary excludes other periods, fingerprint follows the scoped evidence, and an out-of-range or ambiguous request cannot gain a substantive personal answer from unrelated saved data.

Remaining PIQ-4.2: verify current goal/version, experiments, training preservation and alternative hypotheses in a truly isolated QA environment. This screen never authorizes calorie or activity changes.

## 2026-10-16 — Historical intake coverage distribution screen

The mean across independently confirmed complete food days remains a
*conditional observed-day statistic*, even if only one date, but is never
portrayed as a representative week/month intake. The pure bounded screen
counts verified days in two immutable non-overlapping halves of the actual
COMPLETED requested dates. A `distributed_observations` quality indicator
requires at least 4 verified food dates, at least half the completed selected
dates, and at least 2 dates in each half. One recorded date is labeled
`single_verified_day`, all other limited/grouped coverage
`sparse_or_clustered`, and none `no_verified_days`.
All four remain descriptive and none proves every meal was entered, calorie
deficit, fat loss, expenditure or an appropriate calorie change. Packet
coverage and prose expose the qualification and thus change the deterministic
response-cache fingerprint after a source/date correction. Today excluded,
missing records UNKNOWN; General Only and ambiguous windows keep existing
non-disclosure. No new SQL, data reads, model calls or schema change.
