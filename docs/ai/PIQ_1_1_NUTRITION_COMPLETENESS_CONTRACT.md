# PIQ-1.1 — Nutrition Day Completeness implementation contract

Status: branch-only domain rules, proposed 0053 migration, owner-authenticated GET/PUT API and synthetic mocked-DB tests. Full branch CI passed for implementation commit 1b47aaff (Actions 38684874814). **Migration not applied or real-DB validated; UI and maintenance-engine integration still pending.** PIQ-0 production/runtime/owner acceptance remains open.

## Code verified before work

1. Source: src/domain/nutrition/quality.ts reports accuracy/provenance of RECORDED food. One accurately logged 600 kcal meal can return high_confidence; this is NOT evidence all meals were recorded.
2. Loader: server/intelligence/snapshot.ts aggregates food into nutrition.calories with the above quality label but no whole-day completeness information.
3. Maintenance: src/domain/maintenance.ts reliableNutrition() uses quality and provenance but has no owner-confirmed completeness. A partial day can currently qualify as an observed day when enough other records are available.
4. Existing data-quality incompleteNutritionDay() is a relative-to-target anomaly flag, not proof that a day is complete or partial. The calorie target itself may be wrong.

## Two independent dimensions

* Entry/source quality: measured_reference, owner_entered, ai_estimate, legacy_unknown (existing and unchanged). This describes only the fidelity of logged entries.
* Whole-day completeness: confirmed_complete, probably_complete, partial, unknown. It describes whether the available log adequately covers what the owner ate, not clinical truth or measured metabolism. Historical unreviewed days are UNKNOWN by default.
* probably_complete is reserved but NOT inferred from total calories, meal count, food type, logged protein, or source quality.
* The owner can report complete, partial or unknown, including the explicit special case of a fasted day with no entries. A fasted day is recorded as owner-complete but is not automatically eligible for maintenance energy estimation.

## Pure domain behavior now implemented

Module: src/domain/nutrition/day-completeness.ts

* Complete owner report is bound to an opaque canonical entryRevision; a mismatch caused by editing, deleting, importing or excluding food invalidates the prior report and returns unknown until renewed.
* Today/future (using the owner's health calendar, not UTC client date) remains provisional. Unknown local today cannot qualify.
* A matching complete past day with high-confidence food-source quality and positive intake may qualify for FUTURE maintenance aggregation. Partial/unknown, stale, excluded, estimate-heavy, zero-intake fast, current day, or unverified date cannot.
* Separate totals for calendar days, confirmed days, reliably complete days, partial days, unknown days and future probably-complete days. Never divide by only recorded food days and call it complete.
* 15 synthetic tests exercise exactly these decision boundaries. They do not prove the current maintenance engine is fixed.

## Proposed persistence (NOT implemented; requires production schema audit)

After establishing the live schema head and validating any pending migration on a Neon branch, propose a per-owner-instance day table with date as the primary key (subject to existing multi-instance separation), owner_report in complete/partial/unknown, zero_intake_fast flag, canonical entry_revision, confirmed_at, and updated_at. Existing historical days have no confirmation and must never be automatically marked complete.

Calculate revision using deterministic SHA-256 over sorted canonical entry IDs, dates, nutrients, amounts, updated timestamps, and analysis exclusion flags, or use a reliable monotonic revision written atomically. Do not expose source text or food notes in diagnostics. Edits across calendar dates must invalidate both old and new dates. Reports are owner statements, not proof that a source or AI observed every meal.

The authenticated confirmation endpoint should atomically check the expected revision, reject stale writes with 409, preserve the newer owner report, and permit correction/undo. A no-entry complete day requires explicit fasting confirmation, never a generic empty-log confirmation. Do not push new required daily questionnaires.

## Maintenance and downstream integration (NOT implemented yet)

1. Read stored confirmation + canonical revision together with nutrition rows and data-quality exclusion state. Failed read does not mean complete.
2. Require both acceptable food-source quality AND eligible whole-day completeness in maintenance, Goal Control, Coach, Weekly Coach and any calibration Lab candidate that relies on observed daily calories.
3. Add the critical T03 integration test: 21+ days containing one precisely logged 600-kcal meal, comparable weights, and no owner confirmations -> INSUFFICIENT estimate, no calorie-cut suggestion. Repeat with some partial and some unknown days and verify the estimator remains conservative.
4. Test sufficient confirmed complete comparable days, source edits/deletions, late imports, same-day owner actions, multiple logs, exclusions, historical backfill, valid fast days, day rollover and timezone.
5. Preserve logged macro reporting and existing food records, with clear wording distinguishing logged intake from complete intake. Don't automatically reset calorie targets, run Gemini, or reclassify old records.

## Decisions / phase gates

PIQ-0 remains IN PROGRESS: deployed Vercel commit, applied Neon schema, owner mobile acceptance, real provider usage/latency and clinical-quality QA are still unverified. PIQ-1.1 has begun as branch-only safe implementation. Do not call PIQ-1 completed or PIQ-0 exited.

Next: validate pure tests under branch CI; then inspect applicable migration/CRUD code and implement a database-safe, owner-authenticated completion flow only after verifying production migration prerequisites. The final maintenance recommendation changes require actual stored confirmation and full regression pass, with zero accidental calorie reductions.

No production changes were made in creating this contract.

## Storage checkpoint (implemented in branch, NOT deployed)

- Proposed `migrations/0053_nutrition_day_completeness.sql`: historical days remain unknown; new per-date report, fasting bit, entry revision and optimistic confirmation version.
- `server/nutrition/day-completeness.ts`: SHA-256 of canonical food rows and affected exclusion-review rows, including edits/deletions and current source state; atomic confirmation revision/version comparison returns HTTP 409 on mismatch.
- `GET/PUT /api/nutrition/day/completeness`: owner-authenticated; read current revision and confirmation, write explicit complete/partial/unknown. Rejects future days, empty-day nonfasted completion and bad revision input. Missing migration yields sanitized 503.
- `server/backup/inventory.ts` includes canonical report table in backup/restore inventory; migration head and older test fixtures updated to 0053.
- `tests/piq1-nutrition-completeness-storage.test.ts` exercises mocked database version conflicts, current-state reads, stale edits, explicit fast, safety errors and route registration.
- **Known remaining validation as of storage checkpoint:** mock DB tests cannot guarantee SQL syntax or concurrency on real Neon; validate 0053 on a disposable DB branch. The UI was added in a later checkpoint below; maintenance has still not been wired and no migration has been applied.


## Optional Nutrition review UI (implemented on development branch, CI validated)

- `src/features/nutrition/DayCompletenessCard.tsx` adds a compact date-scoped review under the Nutrition summary; no extra required questionnaire. It displays unknown, partial, confirmed, provisional current day, explicit fast, and stale-needs-review states; it does not infer whole-day completeness from calorie totals or entry count.
- `src/features/nutrition/api.ts` sends typed expectedRevision/expectedVersion to the owner-authenticated GET/PUT route; the UI reacts conservatively to revision changes, 409 conflicts, missing API/migration 503 and food-log edits. This does not change the existing logging or calorie-target semantics.
- Seven synthetic rendering-state tests in `tests/piq1-nutrition-completeness-ui.test.ts`. Code commit `9b1686a` passed all checks in [Actions 38685607348](https://github.com/daurham/daurham-health/actions/runs/38685607348).
- **NOT validated:** live browser touch flow, actual Postgres SQL/migration/transaction behavior, Neon backup/restore, or completeness-informed maintenance/Coach decisions. Migration 0053 is deliberately not applied.

## Read consistency, atomicity and route hardening (validated code; real DB test pending)

- `server/nutrition/day-completeness.ts` now performs a second source fingerprint read, rejecting with sanitized 409 if entries or affected review state change during its multi-query read. This is a conservative protection but **not a full repeatable-read transaction**: verify transaction semantics and race conditions against a disposable Postgres/Neon branch before making maintenance decisions depend on it.
- Any individually analysis-excluded food causes `excluded_from_analysis` maintenance ineligibility for that date, even if the remaining entry source quality is good; user can still view and correct the underlying ledger.
- The SQL source digest uses review fingerprint to order ties deterministically. Atomic write SQL enforces the no-food fasting requirement as well as the source-revision/version guard, even if food rows change after a preliminary API check.
- `tests/piq1-nutrition-completeness-handler.test.ts` adds six synthetic authenticated route checks, including unauthorized GET/PUT and stale 409. `tests/piq1-nutrition-completeness-storage.test.ts` adds two source-consistency/excluded-food checks, bringing the mocked storage suite to 12 cases.
- `migrations/0053_nutrition_day_completeness.sql` remains **unapplied**; no real database transaction or backup restore has run. Verified CI covers code, mocks and build, not deployment/migration. Next: stage migration safely, verify SQL against real schema, then implement UI and consumers.

