# PIQ-4.2 — explicit owner priority in Ask Health's current-weight decision boundary

**Development-only read-only increment.** Reuse the existing PIQ-2.3 owner
`primary_goal_intent_events` timeline through `readPrimaryGoalIntent`.
The **effective-as-of selection** (including an explicit null/cleared choice)
is added to the existing *single SQL statement* maintenance decision fingerprint;
therefore any priority edit between the before/after snapshots invalidates
the Ask Health state even when weight-goal target, experiment count and
configured calories remain identical.

For current personalized weight/energy questions, acquire the canonical
intent read together with current active weight-goal versions and recent
performance. Only when the two settings fingerprints match, the goal read
succeeds, and the intent read is valid may the UI evidence distinguish:
owner explicitly selected the **same** active weight goal, selected another
or inactive/non-matching goal, explicitly cleared the choice, or never set
one. Multiple active weight goals, unavailable SQL, missing migration or
read-time change are UNKNOWN. Owner priority is never inferred from goal
sort order, status, scale movement, or programmed workout schedule.

This produces **non-substantive, ID-free** text and a deterministic
fingerprint. Nothing divulges goal UUIDs, version IDs, target amounts or
priority event metadata; the extra query is skipped for General Only,
historical/as-of and unrelated questions. Priority attestation is *not*
a Goal Control target-state verdict, evidence of deficit, experiment causal
result, or authorization to adjust calories.

The 0056 migration already defines the intent table; this increment adds
no migration. If that table is absent, maintenance screening must fail
closed rather than quietly claim no owner priority. Goal-status as-of
measurements and complete revision-attestation of body/training source
records remain future gates.
