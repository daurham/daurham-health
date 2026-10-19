# PIQ-8 Meal Photo Pantry retry — engineering checkpoint

Date: 2026-10-18 (America/Phoenix). Source: `piq/00-baseline-20261014` at `044332d8e1469453468d4a9ea65a0ca7e88b1f5e`. Work branch: `piq/08-pantrysave-idempotency-20261018`.

## Observed code defect

The Pantry-only Meal Photo path checked whether a capture was already `committed` but, on a modified retry with a new food fingerprint, could insert a new `nutrition_foods` / `source_record_links` record before discovering that the job was already committed to a *different* food and returning 409. A failed retry must not leave a new food behind.

## Change

Before any new food/link write, a previously committed capture now requires the exact previously committed food fingerprint and identity, no linked Nutrition entry, and a still-available unarchived Pantry food. An exact lost-response retry reuses the original food. Altered, missing, archived, or entry-committed retries return 409 before mutating Pantry. New first-time capture saves preserve the existing conditional job UPDATE behavior.

Regression: `tests/recipe-ingredients.test.ts` checks altered retry rejection with unchanged food inserts, links and original capture association, alongside the existing successful exact retry test.

## Validation / limitations

Full GitHub application validation **PASSED** on source/test commit `6596230f2ac807568bd1689deeba17a5fe4edeb0` in [Actions run 39201396578](https://github.com/daurham/daurham-health/actions/runs/39201396578): npm ci, TypeScript, ESLint, 2,755 Vitest tests passed (43 skipped), production build succeeded. The subsequent documentation-only commit does not represent an additional test run. No new migration, owner record accessed, model spent, production merge/deploy, or QA API unlock. This early guard prevents the identified *sequential already-committed retry* write; a concurrent first-save race during an in-flight insert may still require a future atomic DB-level solution. Keep PIQ-7 privacy, Auth and DB isolation release gates unchanged.

## Next exact action

Review and merge [PR #31](https://github.com/daurham/daurham-health/pull/31) into the PIQ **development** integration branch only, not `main`; verify the resulting integration ref and validation. Record its merged SHA before later release work. Then resume PIQ-7 isolated Auth/DB runtime binding preflight; note a QA Auth user now exists so the earlier zero-user empty-root gate is not satisfied.
