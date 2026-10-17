# PIQ-4.2 — scale-window contemporaneous sampling and partial logs

The maintenance engine already authoritatively qualifies 3-day vs prior
7-day sodium and carbohydrate increases only on owner-confirmed source-matched
whole-food dates. The Ask Health description previously did not explicitly
check that **any comparable scale observations** existed in those windows.

`screenScaleWindowSignalCoverage` is a bounded, deterministic *sampling*
screen. It counts source-identified owner/device kg weigh-ins marked `usual`
in the ten completed comparison dates, separating recent three and previous
seven. At least two usual observations in the recent window, three in the
previous window, full snapshot date coverage, and no recorded non-usual
weight conditions qualify `sampled_both_windows`. Sparse, mixed or absent
weights remain explicitly limited. This does **not** pair nutrient exposure
to scale change, evaluate a personal association, infer fluid retention,
measure fat gain, or authorize a calorie target decision.

Water and activity step evidence are limited to counts of source-identified
logged dates. Neither has a whole-day completeness attestation in this
screen; missing logs do not equal zero water or zero physical activity.
Provisional current-day readings never count. The existing non-substantive
scale-context packet now distinguishes nutrition-only shifts from windows
with contemporaneous usual-condition weight samples and discloses logged
water/step observational coverage without claiming mechanisms.
Synthetic tests cover missing, mixed-condition, truncated, invalid-source
and current-day observations plus end-to-end evidence fingerprint changes.

No migrations, SQL reads, owner medical data, paid provider calls, calorie
interventions, changes to Goal Control, or production promotion.
