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
