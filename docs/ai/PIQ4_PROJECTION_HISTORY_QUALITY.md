# PIQ-4.2 — current Goal Control projection temporal sampling screen

After exact current goal/version and full-series revision comparison, current
personalized weight/energy Ask Health reads now evaluate the same signed-off
source rows for **date distribution**. This remains a conservative heuristic,
not a model of weight physiology or a source of truth for Goal Control's math.

The sampled history must contain at least five unique eligible Health-local
weigh-in dates over 14+ days within the canonical 90-day projection window,
include a weigh-in no older than 14 days, represent both halves of the observed
span with at least two days in each, and have no >21-day gap. Historical future
rows are never counted. Unknown mass units, nonpositive/invalid values, bad
dates/timezones or unverified source integrity cannot establish sufficient
distribution. These stricter Ask Health rules do **not** alter canonical goal
evaluation, the source SQL, the projection slope algorithm or the database.

If Goal Control reports an available projection but its source dates fail this
screen, Ask Health WITHHOLDS canonical target/deadline interpretation in the
cross-signal evidence and reports a non-substantive quality-limited status.
If Goal Control already lacks a projection, this check does not change the
current target observation report. Sampling consistency never verifies usual
weigh-in conditions, sleep/food/bowel confounders, body-composition changes,
physiological calorie needs or the suitability of a deadline. It authorizes no
calorie change and does not make the read atomic.

No new SQL, migrations, external provider calls, owner-data inspection,
production promotion or AI spend. Owner QA and independently isolated data
environment remain release gates.
