# PIQ-4.1 preview QA isolation gate — non-secret preflight

**Status: code-only and synthetic tests; not a permit to use personal health records.**

## Why

The development PIQ Vercel preview deploy can be READY while the Neon preview branch inherits production private records, the Auth URL resolves to production, or the single-owner `HEALTH_OWNER_USER_ID` continues to identify the production owner. A separate Neon compute endpoint is necessary but not sufficient: the application loads unscoped single-owner health tables, so even a new test account cannot safely use a database copied from real records.

## Safe static preflight

Run `npm run piq:preview-preflight` in a controlled runtime to check the process environment **without** opening SQL, contacting Neon/Auth, or printing URLs, IDs, tokens, cookies or secrets. Without independently obtained Neon branch metadata, the CLI must return **blocked**. For controlled test tooling, the exported pure `reviewPiqPreviewSafety({env, neonBranch})` requires:

- Preview target and exact 40-hex-character expected/deployed commit SHA match.
- Existing independent database endpoint and Auth base URL guard validations, BOTH runtime enforcement flags set to `true`, correct git ref, HTTPS Auth, TLS Postgres and distinct registered production/preview endpoints.
- Explicit production owner ID different from the configured disposable preview owner; actual `HEALTH_OWNER_USER_ID` must match the disposable owner.
- Provider-derived Neon project/branch IDs match expectations, branch differs from production and **independent Neon API metadata establishes an `empty` origin**. A `parent-data` clone, unknown origin or missing provider metadata remains blocked. Provider metadata values must come from an independently trusted tool, **not self-asserted preview env variables**.

A result of `configuration_eligible_for_manual_attestation` means **only** that these static gates passed. It does NOT prove runtime Auth session isolation, absence of imported rows, effective Vercel integration overrides, schema readiness, ability to restore a backup, or permission to test with personal data. Empty origin must also be verified with authorized tenant/data controls before any authenticated testing. SQL code/test changes must not be deployed to main.

As of October 16, 2026, PIQ preview Neon `br-damp-pine-aw5cconp` reports `init_source=parent-data`, parent `br-sparkling-dust-aw1q03rt`: it fails this preflight for owner-data QA regardless of a READY Vercel preview. Do not delete or mutate that branch autonomously. No credential reads or environment modifications are needed for this checkpoint.

## October 16 follow-up — current metadata check, still BLOCKED

- Read-only Neon organization/project discovery again identified the candidate Vercel-managed Health project. Its existing PIQ preview child branch retains `init_source=parent-data`, parented to the default Health candidate main branch. **No isolated-empty-origin attestation exists**, so do not use this Vercel preview for disposable-owner tests or assume that copied owner rows are safe.
- The existing Vercel connection works using the project's unscoped deployment listing. The most recent returned PIQ preview was READY but built from code `df2ba73dbae5bf895e7d80a13d69775292a819f8`, not the newer full-CI-validated release-candidate code. READY does not mean up to date and does not establish runtime DB/Auth binding.
- No Neon branch creation/deletion, profile/owner row read, deployment, migration, runtime environment read/decryption, Auth test, or Gemini request occurred. The manual provider-backed isolation gate remains **not run**. Do not request production promotion on the strength of metadata alone.

## 2026-10-16 — independently sourced CI/preview/Neon metadata cross-check (synthetic validation)

Pure module `server/piq-preview-metadata.ts` (`6d4b0a01a82533c166dbac298a368a94fbf08db8`) and `tests/piq4-preview-metadata.test.ts` cross-check **independently supplied GitHub commit & successful Actions exact SHA**, **Vercel preview ref/READY deployment exact SHA**, and **Neon independently reported project/branch/empty-init origin**. Status is always `blocked` or `metadata_consistent_not_authorized`. There is *no* allow/disclose-rows, migrate, delete, create, deploy or permission action; enum-only blocker results contain no credentials, account IDs or sensitive values. Even aligned metadata cannot attest runtime DB binding, Auth tenant, private-row absence, migration/backup readiness or owner approval.

Read-only observation: GitHub code `6d4b0a01a82533c166dbac298a368a94fbf08db8` has its CI identified at [Actions 39007230291](https://github.com/daurham/daurham-health/actions/runs/39007230291). Most recent returned Vercel PIQ branch deployment is READY on docs checkpoint `852be816b8efd3077f61f46ff04a024e5a4cff02`, not the exact validated code candidate. The candidate Neon PIQ branch `br-damp-pine-aw5cconp` in project `holy-recipe-28496000` reports `init_source=parent-data`, parent `br-sparkling-dust-aw1q03rt`, so it is NOT independent empty test data. **Both cases fail** the appropriate metadata checks; the preview remains unsafe for owner QA. Do not create/delete Neon branches, change deployment configuration, access owner rows, or apply migrations without the separate necessary authorizations.

## October 16 — exact full-workflow and Vercel-project identity gate (offline)

The release metadata checker now requires GitHub's independently reported successful
**full** `.github/workflows/validation.yml` run on the exact candidate SHA, not simply
a green partial PostgreSQL/other workflow. Vercel deployment metadata must also
match the separately expected Health Vercel **project ID** as well as preview ref,
exact SHA, target and READY state. Missing/incorrect workflow or project evidence
is a blocker. The test suite uses only synthetic records, and enum-only output
never reveals project IDs.

This is a release-gate hardening step, not runtime approval. The currently
parent-data-cloned Neon preview and older deployed code remain blocked. No owner
records, credentials, Vercel deployments, migration, paid provider, or production
changes are authorized by these checks.

## 2026-10-16 — Runtime PIQ candidate API stop (CI pending)

Metadata-only preview release checks were advisory; they did not stop live
API requests. New `server/piq-preview-access.ts` and `dispatchHealthApi`
gate recognized routes **before** any owner/Auth/Health/backup handler:
`piq/*` Git refs (regardless of claimed Vercel target) and Vercel
previews with no identifiable Git ref receive a fixed uncacheable 503
`PIQ_PREVIEW_OWNER_API_LOCKED`. Known unrelated previews and `main`
are unchanged. No config-only bypass is permitted. An explicit reviewed
code/release transition remains necessary **after** independent empty
Neon origin, runtime Auth/DB/owner identity, migration/backup safety,
and owner approval. Synthetic dispatch tests only, no SQL/PHI/provider
calls. The old deployed preview SHA is **not protected** by undelivered
development code. Existing inherited-data preview remains unsafe
for owner QA.

## 2026-10-17 — Independently empty PIQ Neon QA project (provisioned; runtime QA not approved)

After owner approval, created a **separate new Neon project** named
`daurham-health-piq-isolated-qa` (`lively-wave-25801832`).
Its new default root branch is `br-crimson-cloud-akrf5kuo` (`main`),
created 2026-10-17 06:13:43 UTC, PostgreSQL 18, with **no parent
branch**, in a different project from existing Health
`holy-recipe-28496000`. Read-only SQL on the new root established
zero public application tables and zero non-system tables before Neon
Auth setup. No existing Health records, migrations or backups were
copied.

Provisioned a **new better_auth integration on the QA project only**.
Verified through independently read Neon provider metadata that the
auth provider-project identity and base URL both differ from the
existing Health production Auth integration. Subsequent read-only SQL
found only nine `neon_auth` service tables, **zero public application
tables, zero QA Auth users, and zero sessions**. No disposable user
or owner identifier has been created yet; no credentials/URLs appear in
these docs. No Vercel environment/deployment mutation occurred.

**Provenance caveat:** Neon labels the brand-new default root branch
`init_source=parent-data` even though it is a root with no
`parent_id` and independent project identity. The current pure PIQ
preflight correctly still blocks it: do **not** blindly reclassify
every `parent-data` branch as safe. Follow-up gate design must require
independent new-project creation evidence, new-root identity, verified
empty application data, and verified distinct Auth, alongside all
existing runtime and owner checks. Never use the cloned former
`br-damp-pine-aw5cconp` PIQ branch for owner QA.

Remaining blockers: independent project empty schema is **not yet
migrated**; PostgreSQL 18 compatibility unvalidated, disposable QA
owner not created, no Vercel preview-specific database/Auth binding,
runtime comparison/owner-row attestation, recovery readiness, or owner
mobile acceptance. No schema migration, production changes, owner
data access, paid AI requests, or PIQ preview enablement authorized
by the provisioning. Code branch `0c0623572f1b1f463266f6147f0aa71320a3a790`
passed GitHub full validation on attempt 2,
[Actions 39008436437](https://github.com/daurham/daurham-health/actions/runs/39008436437).
Latest known READY Vercel PIQ preview is an older SHA and must not be
treated as isolation-protected or current.


## 2026-10-17 — Approved schema-only bootstrap on separate Neon QA project (VERIFIED)

**Owner authorization was expressly limited to applying/testing existing
repository migrations on this new isolated database.** Project
`lively-wave-25801832`, root branch `br-crimson-cloud-akrf5kuo`,
database `neondb`, PostgreSQL version `18.6` (server_version_num
`180006`). No production project or original preview Neon branch
was accessed for SQL in this operation.

- Checked the QA database was pristine: zero public tables, zero QA
  Auth users and sessions before applying application migrations.
- Fetched the 56 numbered migration SQL files from the pinned PIQ
  GitHub branch and used the repository's PostgreSQL-aware
  `splitSqlStatements` semantics. Applied each file in its own Neon
  SQL transaction with the corresponding `schema_migrations` insert,
  after checking the recorded prefix before each batch. This was
  executed through the Neon SQL tooling, not by running `npm run migrate`
  in the deployed app.
- All 56 applied in exact ascending order, from
  `0001_health_foundation.sql` through
  `0056_primary_goal_intent_events.sql`, with no reported DDL errors.
- Independent read-only Neon SQL verified 56 distinct sequential
  migration-history filenames, 77 public application/system tables
  (including `schema_migrations`) and nine `neon_auth` tables.
- Fresh-install seed checks: 26 active shared exercise definitions,
  one active seeded Beginner Calisthenics template (`CAL-BEG`),
  zero active seeded original A/B/C legacy templates and zero
  owner-created workout templates.
- Explicit read-only counts on 13 high-value owner-data tables:
  `health_profile`, `body_metrics`, `nutrition_entries`,
  `workout_sessions`, `goals`, `supplements`, `daily_context`,
  `hydration_events`, `bowel_events`, `benchmark_results`,
  `coach_tasks`, `ai_usage`, and `primary_goal_intent_events` —
  **all zero**, as were QA Auth users and sessions.

**Scope/limits:** This establishes **schema migration compatibility**
with PostgreSQL 18 and an empty disposable-owner starting state,
not runtime/API compatibility or a verified Vercel preview. No
app authentication/logins, disposable owner creation, runtime binding,
model calls, backup import, production migrations, `main` merge,
or preview deployment occurred. New-root Neon
`init_source=parent-data` metadata still needs separately justified
provenance in the strict release gate; do not globally whitelist
`parent-data`. Unverified release conditions: QA account/owner
mapping, Vercel preview-only DB/Auth overrides, exact-SHA deployment,
runtime test, backup/rollback and owner mobile acceptance. Formal
owner acceptance remains 0/9 (~91% overall engineering estimate).


## 2026-10-17 — Separate-project root provenance review: code-only

The new independently provisioned Neon QA **root** has
`init_source=parent-data` despite a null parent branch and verified
zero original application tables. Added a bounded, *offline only*
`piq-neon-root-provenance.ts` review so this root label is not
mistaken for an inherited production-data clone **only when all
independently obtained records are supplied by a trusted operator**:
different production/QA Neon project identities; same newly-created
default/root branch with no parent and matching project creation time;
zero public tables and auth users/sessions at genesis; fully ordered
current migration history; zero owner data in 13 sensitive tables
after bootstrap; distinct, provider-verified better_auth projects.
A missing, mismatched, incomplete, or self-asserted proof blocks
the special case. Other `parent-data` branches remain blocked.

Both existing read-only PIQ metadata and preview preflight validators
can accept this optional independent proof. This **does not enable**
PIQ preview owner/API access: `piq-preview-access.ts` retains its
hard 503 release stop, and live DB/Auth binding, disposable owner,
Vercel exact-SHA deploy, QA/backup and owner acceptance remain
independent requirements. No Vercel variables, deployment, Neon
data, credentials, owner accounts, migrations or production edited.
All tests are synthetic; proof must never originate from the app
request or environment as a self-attestation.

## 2026-10-17 — Disposable QA identity and branch-only Vercel setup (PARTIAL, fail-closed)

With explicit owner approval, created one disposable test-only Neon Auth user
`2420a606-0f6e-46e4-8aab-65a39e25f6e3` under *separate* QA project
`lively-wave-25801832`; the reserved `example.com` address is not a
working sign-in identity and no password/session exists. GitHub commit
`57cb41ed272cc5cfe10b46057d121599a7f2e75e` fixed the provenance
blocker double-report and passed full GitHub Actions CI (39010442965).

Created/verified 37 Vercel environment variable entries exclusively for
Preview + `piq/00-baseline-20261014`. These include distinct Neon Auth
service and QA owner IDs, endpoint metadata, runtime DB/Auth binding flags,
project/branch identity and exact-SHA config. An automatic database-credential
handoff was blocked by platform security controls. No secret was printed or
committed. To avoid falling back to shared production Preview credentials,
branch-specific DB connection aliases, database username/password aliases
and the cookie secret were explicitly overridden with **invalid sentinel
values**. No connected database, authenticated sessions, or owner API access
may be claimed. The release stays blocked by the runtime PIQ API hard lock
and intentional invalid DB/cookie values; the current Vercel deployment may
predate the new environment settings. Documented safe manual future handoff
in `docs/ai/PIQ4_QA_CREDENTIAL_SETUP.md`.

No production/Main changes, production health data reads, migrations,
production account copying, paid AI calls, or personal health QA.
