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
