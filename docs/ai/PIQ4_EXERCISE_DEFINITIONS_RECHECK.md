# PIQ-4.2 — Exercise-definition source consistency (development only)

## Why

Canonical Progress can produce exercise-specific strength figures using one
saved exercise definition while the owner changes that definition's name,
performance type, external-load classification, rep mode, unilateral flag or
measurement semantics before Ask Health finishes. Matching set rows and session
IDs would not reveal the source change. Even the exercise-name clarification
could remain stale.

## Bounded implementation

The shared Progress exercise-definition mapper is now used for both original
and final canonical reads, including existing fallback classification rules.
One additional **local read-only SQL query** of exercise definitions runs
concurrently with the existing final set-content recheck only for eligible
current personalized general/training/focused-exercise answers. Compare the
full selected canonical definition set (including unused definitions that
might be surfaced as names) by unique ID and all effective fields. Changed
labels/classification, insert/delete, duplicate/malformed IDs, unavailable
database or changed semantics fail closed.

Any mismatch withholds generic and focused Training evidence, associated
Training Intelligence coverage/baselines/relationships/interventions and
cross-signal weight-energy conclusions that could rely on stale Training.
Exercise-name clarification is also withheld. Existing independent evidence
from unrelated domains remains eligible; a neutral, privacy-safe source
boundary replaces invalidated strength claims.

## Cost, scope and limits

No paid AI-provider calls, mutations or schema changes. This adds exactly
one bounded local SQL read *when the existing set recheck is active*.
The initial and final reads are not atomic, edits after the check can race,
and only **effective canonical definition fields** are compared (a raw
database edit that maps to the same effective classification is not claimed
to be detected). Historical-as-of Training, physiology, personal strength
preservation and owner preview acceptance remain unverified.

CI tests and owner-preview checks are necessary before release. No approval
for migrations, main merge or production deployment is implied.
