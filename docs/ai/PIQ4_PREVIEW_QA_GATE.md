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
