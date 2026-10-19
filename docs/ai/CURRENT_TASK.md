> **Current bounded task, PIQ-8 late Log Meal race (2026-10-19):** reject overwriting previously committed Meal Photo captures, preserve label Pantry→Log conversion, and remove ignored Meal Photo commit conflicts; add synthetic Postgres 16/18 and early-service regression. Residual nontransactional in-flight Log Meal writes are documented, not called solved. Branch `piq/08-meal-first-writer-20261019`, validation pending. Production unchanged, owner-accepted 0/9.

> **Current PIQ-7 branch task:** enforce `piq/` Git ref and root-only QA Neon lineage in offline/static Preview reviewers. Earlier metadata logic allowed a fictitious `empty` child with an unrelated parent, and preflight accepted non-PIQ ref when DB/Auth expected refs matched. Regression fix on `piq/07-root-and-ref-guard-20261018`, feature and merge CI pending. No 503 unlock, migrations, QA or production writes. Owner acceptance **0/9**.

> **PIQ-7 current feature work:** require independently distinguished production-vs-QA **Neon project IDs** in both Preview preflight and provider metadata reviewer, including `initSource: empty` branches. A production-project sibling cannot qualify as independent QA. Add regressions, keep output enum-only. Branch `piq/07-preview-project-isolation-20261018`, verification pending. No migration, owner API unlock, credentials or production change; PIQ owner acceptance **0/9**.

> **Active PIQ-7 engineering:** close exact-release-SHA PostgreSQL CI blind spots. Prior path allowlist missed newly created QA Auth and Pantry safety modules. Widen `piq1-postgres.yml` integration-branch code triggers (not docs-only, feature branches or `main`); add fixed-scope workflow tests; tighten fictional Auth fixture matching to the provider-observed one account. [Merge-only results pending]. Production unchanged; Preview API hardlock 503, QA secrets, auth users and 0/9 owner acceptance unchanged.

> **Verified PIQ-7 checkpoint (2026-10-18 Phoenix):** [PR #32](https://github.com/daurham/daurham-health/pull/32) merged to development at `cbca33f9fcd3555626ae24a2a35b09de73b713eb`, [exact merge CI 39204168866](https://github.com/daurham/daurham-health/actions/runs/39204168866) SUCCESS: **2,762 passed / 43 skipped**, TypeScript, ESLint, build. Independent QA Neon has a documented fictional Auth fixture with no password, verified email or session; QA Auth provider differs from candidate production provider. New aggregate-only diagnostic never authorizes QA. **Next action:** trusted operator creates secure independent Preview cookie secret and usable QA-only login, verifies actual protected Preview runtime DB/Auth isolation, then exact release-SHA PostgreSQL CI and owner acceptance. The Vercel Preview SHA pin is stale (`91f8eef5b`), latest READY Preview is `044332d8`. Production `main` untouched at `dbc3fcb`; hard 503 lock remains. Formal acceptance **0/9**. This subsequent docs-only checkpoint skips CI.

> **Latest verified checkpoint — 2026-10-18 Phoenix (PIQ development only):** [PR #31](https://github.com/daurham/daurham-health/pull/31) merged safely into `piq/00-baseline-20261014` as commit `7cb3d5f0f8c5906cd330461ee88bdf19c2437f0d`. Exact merge-commit [application CI 39201933212](https://github.com/daurham/daurham-health/actions/runs/39201933212) PASSED: 2,755 Vitest tests, 43 skipped, TypeScript, ESLint and production build. Fix: an altered retry of a previously committed Meal Photo cannot create an extra Pantry food/link before HTTP 409. No new migration. See `docs/ai/PIQ8_PANTRY_RETRY_CHECKPOINT.md`. This subsequent documentation-only [skip ci] checkpoint is not itself a new test run. Production remains `main` at `dbc3fcb`, separately verified through Vercel. **0/9 PIQ phases formally owner-accepted. No owner API 503 unlock, production migration, or main promotion.**

> **Exact next safe task:** Continue PIQ-7 release isolation: independently verify provenance and permissions of the **one existing QA Auth user** (zero sessions), actual serving Vercel Preview → isolated QA Neon/Auth bindings and cookie isolation, and safe protected operator access without viewing owner health data. QA app schema has 60/60 migrations and 76 non-seeded app tables empty; this does NOT certify Auth identity isolation. Keep protected owner endpoints hard-locked. Owner mobile QA, backup/restore, exact release SHA PG CI and separate production migration/merge approval remain pending.


# Current task — PIQ release qualification and small deferred polish

## Actual working branch

- Branch: `piq/00-baseline-20261014`. **Do not promote `main`.**
- Latest fully green baseline before the circumference-input patch: `ef00fa0953f740944e8674e7a066782d26bb82cc`.
- Repository schema head: **0060_experiment_outcome_feedback_events.sql**.
- PostgreSQL 16/18 isolated CI at baseline: **42/42 each**. Full baseline validation: **2,742 passed, 43 skipped; TypeScript, ESLint, build passed**.
- Master plan: `docs/ai/HEALTH_INTELLIGENCE_QUALITY_MASTER_PLAN.md`; ongoing evidence: `docs/ai/PIQ_PROGRESS.md`. Treat older I0–I10 notes as historical, not current release instructions.

## QA state (read-only verified 2026-10-18)

- Separately provisioned Neon QA project: `lively-wave-25801832`, root `br-crimson-cloud-akrf5kuo`, database `neondb`, PostgreSQL 18.6.
- QA migrations **60/60** after explicitly authorized atomic application of 0057–0060. All four new provenance tables and immutable triggers exist. None was populated by migration.
- Read-only counts: **76 non-seeded application tables have 0 rows**; the four seeded tables retain **70 migration seed rows**. Auth directory is separate from these app-table counts.
- Preview Vercel project: `prj_KNUk1CcJbYjQbSkADSHSuynhpZJU`, 37 branch-scoped Preview-only entries.
- `DATABASE_URL` was updated directly from the verified isolated QA Neon endpoint; `HEALTH_DB_BINDING_ENFORCE` and `HEALTH_AUTH_BINDING_ENFORCE` are `true`. The effective deployed runtime connection has **not** been independently tested.
- QA Neon Auth uses `better_auth`; the PIQ branch's stable Preview origin was added and verified as trusted **only for QA Auth**.
- `NEON_AUTH_COOKIE_SECRET` was **not successfully replaced**; its QA-only secure value and independence from production still require operator setup.
- `HEALTH_PIQ_PRODUCTION_OWNER_USER_ID` is absent. No independently verified production owner comparison has happened. Existing disposable example.com QA Auth user is **not a working login**.
- One baseline Vercel Preview deployment was READY with the exact `ef00fa0` SHA; Vercel protected-deployment inspection returned 403. Preview must be rebuilt after new environment changes.
- The **PIQ owner API hard 503 lock remains mandatory**. Do not weaken it for developer convenience.
- Formal iPhone/iPad owner acceptance: **0/9**. This is not production-release approval.

## Task under implementation

**Current UI polish:** all nine Settings sections are native accessible disclosures collapsed by default, with deep-link and Ask Health correction auto-opening. Exact commit validation remains pending; no production/QA API unlock.

Deferred small PIQ polish: accept centimeter and inch circumference measurements, including precise mixed and standalone inch fractions; safely convert a filled value on unit switches; prevent edit-path one-decimal truncation. No SQL migration, no new data model, no extra AI budget. Test and run application CI on exact new commit before marking validated. Preserve all PIQ API restrictions.

## Remaining release operations (separate authorization gates)

1. Complete owner-managed **QA-only** cookie secret and usable test Auth account, and independently compare QA versus production owner identity through an approved metadata process. Do **not** read/copy production health records, credentials or sessions.
2. Confirm expected commit pin and rebuild only the **Preview** deployment after configuration changes; verify effective Auth/DB endpoints with an authenticated operator. Vercel deployment protection 403 must be resolved without disabling protection.
3. Recheck owner-data emptiness after QA Auth setup; rehearse owner-authorized backup, restore and isolation with fictional records. Existing synthetic PG16/18 tests are green but cannot replace this.
4. Obtain separate owner approval before changing the hard PIQ 503 API lock. Perform real mobile/answer-quality QA (9 checks) and record results before any production migration or `main` merge.

## Nonnegotiables

- No production or `main` change without separate user approval; no production health data, credentials, or Auth sessions copied into QA.
- Treat blank or placeholder QA secrets as **blocked**. Never log DB URL, cookie secret, owner ID or personal health data.
- Don't use “~91% complete” as a release metric; report CI validation, provider readiness, and owner acceptance independently.
