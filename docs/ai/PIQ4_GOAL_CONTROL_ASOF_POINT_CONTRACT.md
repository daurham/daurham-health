# PIQ-4.2 — Goal Control as-of point-observation guard

**Development-only measurement correction.** Goal Control previously selected
the latest saved body value, e1RM workout sets or valid benchmark result
independently of the requested historical as-of date, enabling future-source
leakage into a past target-state response.

- Body: Postgres local-date comparison of `measured_at TIMESTAMPTZ` using
  session timezone or the Health-local fallback, before ordering and LIMIT.
  Calendar-date recheck rejects future/malformed mock/source rows.
- Strength: exact-exercise workout `DATE <= asOf` before e1RM aggregation;
  code additionally discards future or malformed returned dates.
- Benchmark: valid result `DATE <= asOf` before latest-result LIMIT and
  verified in code. Missing qualified point means UNKNOWN.

**Not authorized:** reconstructing old goal versions, lifecycle, primary intent,
source mutations, strength retention or a historical plateau. The current
goal snapshot is not equivalent to a historical version. No new migrations,
production release, health data, model spend or calorie recommendation.
