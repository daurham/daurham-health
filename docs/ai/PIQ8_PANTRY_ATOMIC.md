# PIQ-8: atomic first-time Pantry approval for Meal Photos

**2026-10-18 Arizona · Engineering checkpoint, NOT release permission**

Earlier PIQ-8 changes prevented **sequential** altered retries from creating
an extra Pantry food. However, first-time saves still claimed a source link,
inserted a food, and marked a capture `committed` in three independent Neon
HTTP SQL operations. A competing finalized Meal Photo between them could
leave a food/link after a rejected 409 response.

For a *new* food attached to a valid completed Meal Photo job, the first save
now uses one SQL statement with a `FOR UPDATE` capture-row lock and dependent
PostgreSQL modifying CTEs to claim the canonical fingerprint, create the food
and commit the capture. If the capture was finalized before the lock, no
source link or food is written. Concurrent approvals serialize; only one
changed approval wins. A food-name uniqueness conflict rolls back the entire
statement, including its provisional fingerprint claim.

Generic AI and USDA food saves, already existing Pantry-food reuse, and exact
committed lost-response retries continue through their existing paths.
No migrations, production data, paid model calls, Neon/Auth changes or
release-access changes were made.

Automated tests: existing mocked service suite plus a new **real disposable
PostgreSQL 16/18** integration suite checking two competing first-time saves,
capture committed before the write, and rollback on food uniqueness violation.

**Known residual scope:** an unrelated Log Meal path that unconditionally
changes an already committed capture *after* the Pantry commit is a separate
cross-flow race that needs its own review. Do not claim the entire photo
finalization system is transactionally first-writer-wins from this change.
Production `main` untouched. PIQ-7 owner acceptance remains 0/9.
