# PIQ-4.2 — Daily Context read consistency and generic evidence precedence

**Development only, CI validation required.** The first Ask Health read loads
Daily Context notes and tags, then separately assembles other health evidence.
A late edit, deletion or insertion can invalidate those notes/counts.

A new bounded current-day Context service reread compares the first and late
saved sets: row ID, date, note content, canonical tags, createdAt and
updatedAt. Duplicates, malformed dates/tags, partial/error responses, added
and deleted records are treated as changed or unavailable. The check runs
only for relevant current-day personalized/smart/deep general, recovery or
experiments lens requests, even when no Context rows were initially saved.
Its status is privacy-minimized; it does not disclose raw notes or IDs.

On disagreement, the generic packet's context notes and tag-count evidence
are withheld and replaced with a neutral `context.source_consistency`
warning. A separate generic bypass is also closed: a failed current
weight/energy Nutrition or weight/Activity recheck previously withheld only
focused evidence while earlier-read generic Progress/Goals/Intelligence
facts remained. Now generic body, nutrition, Activity, goals and shared
intelligence evidence and intelligence summary are suppressed in the same
conflicted **current focused question**. Independently sourced context
(if verified), sleep, supplements and clinical facts remain available.

Limitations: not an atomic multi-source transaction. Context service still
loads rows and tags in separate existing queries, and a further edit can
race after the late check. This does not certify workouts, the entire
personal context or general-health evidence beyond the covered paths.
No model-provider call, schema migration, owner data access or production
promotion; only an extra bounded local Context reread on eligible questions.
