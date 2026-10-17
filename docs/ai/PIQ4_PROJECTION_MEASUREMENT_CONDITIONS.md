# PIQ-4.2 — same-series body measurement comparability contract

The canonical bodyweight projection source query now reads the existing
`body_measurement_sessions.comparability` status, alongside weight, timezone,
source row identity and edit timestamps. The **private full-history fingerprint**
includes this field. A change from `usual` to `unknown` or
`different_conditions` invalidates the optimistic source recheck, even if
value and updated timestamps are unchanged.

The Ask Health 90-day current selected-weight-goal projection reviewer
requires *all source rows contributing to the canonical projection* to be
explicitly `usual` before a date-qualified projection may be described.
The canonical projector currently incorporates all date-eligible rows; five
usual weigh-ins cannot justify ignoring another mixed-condition point in the
same calculation. Older excluded dates cannot make an otherwise usable
current window incomparable, though they remain fingerprinted.

A revision-stable but mixed/unknown-condition available projection becomes
`projection_conditions_unverified` and the exact current goal target/deadline
cross-signal report is withheld. This withholding propagates to the generic
Goals packet safeguard. A current target status with an already-unavailable
projection is not reclassified as having a bad projection by this screen.
Only nonsubstantive status codes and neutral explanations reach the model.

Usual-condition flags are **owner/source labels**, not independent proof of
fasting time, scale calibration, matching devices, absence of water retention,
fat change, physiological adequacy or intervention permission. Additional
performance, energy and nutrition safety review remains required.

No new database migration, query count, provider call, owner-data testing,
goal update, calorie recommendation or production release.
