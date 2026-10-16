# PIQ-4.2 — structural Personal Lab outcome relevance

Development-only read-only safeguard. The previous timing review proved that active/near-scheduled experiment windows were part of the same current decision revision. This adds **protocol outcome metadata**, not a causal assessment.

Protocol requirements are typed and anchored to `experiments.protocol_version_id`. The single-statement Maintenance Decision Revision digest now fingerprints the relevant experiment protocol version and *all its frozen requirements*: identity, role, domain, kind and selector. This avoids declaring a changed outcome configuration consistent merely because the experiment count or version ID remains the same.

For an attested cohort of ≤100 current relevant experiments, read requirement rows for exactly those private experiment IDs (≤400 joined rows; a larger response fails closed). Validate no duplicate IDs, protocol inconsistencies, missing experiment rows, invalid roles/kinds/domains and malformed direct outcome selectors. Compare every experiment ID and total count to the revision-screened windows.

**Direct declared outcome** is ONLY `primary_outcome` or `secondary_outcome` with `body/body_metric/{metricKey:'weight'}` or `nutrition/nutrition_metric/{metricKey:'calories'}`. Do not infer relevance from a title, hypothesis, rationale, origin trigger, context control, supplement or adherence field. A protocol listing only other outcomes is **not** therefore irrelevant; indirect pathways are untested. Protocols with no declared outcomes are explicitly unclassified. Report aggregate counts, including directly matched active-now and scheduled-soon, without private IDs or source dates.

No results, outcome values, experiment effectiveness, causal effects, adherence, calorie adequacy, clinical safety or direct calorie recommendations are certified. Missing source, >400 rows, malformed configuration, changed decision revision and inconsistent cohorts remain UNKNOWN. No migrations or production changes. Further gates: actual version-bound experiment result validity/adherence, goal Control direction/urgency and physiological/strength criteria.
