# PIQ-4.2 — calendar-day ordering of verified nutrient shifts and weigh-ins

**State:** development-only deterministic evidence screen. The existing
3-day-vs-7-day sodium/carbohydrate comparison is an aggregate of **daily
food logs**, not an intervention starting at an attested hour. Even recorded
usual-condition weights on the same day CANNOT be assumed to follow the food.

New `screenScaleShiftTiming` examines the verified recent nutrient-source
dates already selected by the maintenance engine, within the same ten
completed-day comparison and existing usual-condition weight coverage.
For each qualified nutrient independently it distinguishes:
`later_scale_recorded` (at least one source-identified usual-condition
weight recorded on a strictly later calendar date than the latest selected
food day), `no_later_scale_record`, `weight_window_insufficient`,
`source_dates_unverified`, and `not_checked` (no qualifying shift).

An actual later record is **only temporal ordering**, NOT evidence of
nutrient-linked body mass change, exposure onset, retained water, a fat-mass
change, causation, or intervention safety. The later measure is not required
to have changed, and no weight response is estimated. Duplicate, out-of-
scope, incomplete, malformed or future source dates fail closed. The owner
packet describes this limit without copying weight values or identities.
These bounded states affect the answer fingerprint; no raw identifiers,
health values or onset times enter this screen's new coverage status.

The previous window coverage and water/steps counts are unchanged. No
new SQL, migration, owner health records, paid AI calls, maintenance or
calorie changes, or production deployment.
