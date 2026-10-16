# PIQ-4.2 — bounded experiment timing review

Read-only development increment. The existing single-statement Maintenance Decision Revision fingerprints relevant active and near-scheduled experiment identity, dates, protocol version, status and updated timestamp. Between two matching revision snapshots, inspect the **same predicate** as the revision (all active, scheduled overlapping the next 14 days). Limit to 100 rows; a larger cohort or count mismatch makes evidence unavailable, not partial.

Compare dated `active` experiment windows against the current Health-local day, and distinguish running-now, scheduled-soon, overlapping, and active-but-outside/undated. The last case is an explicit **timing needs review**, not a completed experiment or no experiment. Missing SQL, malformed dates, duplicate IDs, changed revision, or disallowed scheduled rows are UNKNOWN.

Only aggregate counts and state enter non-substantive Ask Health evidence and packet fingerprints. No experiment titles, questions, UUIDs, protocol IDs, owner notes, or efficacy claims. Even `none` is scoped to the membership predicate only and **not** a green light for a calorie cut, causality, medication change or plateau diagnosis. No migration, paid AI calls, or production deployment.

Follow-on work: verify semantic experiment relevance to weight/energy outcomes and overlap with target revisions; provenance and goal urgency require a separate attested source-level causal protocol.
