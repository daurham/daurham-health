# PIQ-7 QA Auth directory: counts-only evidence and release boundaries

> **Current read-only QA Auth recheck (2026-10-19/20) — supersedes the historical figures in this document:** Neon QA `neon_auth` aggregate counts are now **2 users, 2 accounts, 1 account with password credentials, 1 session, 1 unexpired session, zero verified users, and zero users or sessions older than the independent QA root**. Read-only comparison of provider metadata confirms the QA and Production `better_auth` integrations have distinct provider project IDs; identifiers were not printed. **Do not assume** this session belongs to the documented fixture or is safe for owner testing; only operator-approved attribution can establish that. **Do not revoke/delete it automatically.** Full QA public-table census is 76/76 non-seeded app tables exactly empty; it does not prove historical initial-empty-root SQL or deployed runtime bindings. Production health and Auth records were never read; no session content/token/email was retrieved. No Auth, DB, env, deployment or API-lock changes occurred. PIQ owner acceptance stays **0/9**.

**2026-10-18 Phoenix · Development branch only · No authorization to log in or release.**

## Provider-backed read-only observation

Target explicitly selected: separate Neon QA project `lively-wave-25801832`, root branch
`br-crimson-cloud-akrf5kuo`, database `neondb`. The Auth catalog schema was
inspected first, then a single SELECT of **aggregate counts only** was executed.
No user row, ID, email, password hash, session token, private health data or
production database was selected or changed.

- Exactly **1 Auth user**, matching the previously documented *fictional,
  non-deliverable QA fixture* by equality predicate (count only).
- Exactly **1 associated Auth account row**, but **0 accounts with stored password
  credentials**. There are **0 sessions**, **0 email-verified users**, **0 banned
  users**, and **0 Auth users predating the QA root's creation timestamp**.
- This explains why the fixture is not a demonstrated usable login.
  It does not prove the record is safe as a production-like owner,
  or exclude other login methods configured in Auth.
- Provider `get_auth` confirms QA `better_auth`, and Auth config reports
  email/password sign-up enabled and a QA-only Preview origin trusted.
  These configuration facts are **not** a successful sign-in nor deployment
  runtime binding attestation.
- Vercel metadata confirms 37 branch-specific Preview variables exist, including
  a QA cookie-secret variable. No value was decrypted; existence is **not**
  proof it is random, independent of production or effective in the Preview.
- The most recent inspected READY PIQ Preview served earlier commit `044332d8`;
  the development integration checkpoint was validated at `7cb3d5f` and later
  documentation-only `9ae1a3a`, not an exact-sha READY deployment. GitHub's
  application CI passing does not replace isolated PostgreSQL release-SHA CI.

## Added engineering contract

Pure, offline `reviewPiqQaAuthCensus` in `server/piq-qa-auth-census.ts` accepts
only counts tagged with a scoped Neon SQL provenance. It separates
`empty_directory`, `documented_fixture_only`, `operator_review_required`, and
`unverified`; malformed, wrong-target, pre-root identities and unexpected active
sessions fail closed. Every state returns `ownerQaAuthorized: false` and requires
runtime Auth/login verification. Tests use only synthetic metadata. The new
function does not change existing Preview lock, database operations, migrations,
Auth settings, cookie secrets, or release-authorization behavior.

The original root-provenance guard still requires a pristine post-migration
Auth directory: its 0-user predicate **must not be claimed satisfied by this
current 1-user snapshot**. A later fully reviewed design must separately attest
historical empty-root origin and the actual authorized working QA test identity,
not silently relax either.

## Exact next secure steps

1. Keep the PIQ 503 API hard lock and deployment protection enabled.
2. A human operator must establish a real QA-only login and independent cookie
   secret securely in **branch-scoped Preview configuration**. The available
   Neon `create_auth_user` connector creates directory entries **without
   passwords**; calling it now would only make another unusable account.
3. Independently compare the QA versus production Auth tenant and owner identity
   without copying identity values or credentials into GitHub; then validate
   effective deployed Preview DB/Auth binding at the exact release SHA.
4. Re-run a fresh full non-seeded table census and Auth counts, and independently
   rehearse backup/restore before owner mobile QA. No release or protected
   login testing before separate owner authorization.

**Exact feature SHA CI [39203800556](https://github.com/daurham/daurham-health/actions/runs/39203800556) PASSED** and **exact integration merge SHA CI [39204168866](https://github.com/daurham/daurham-health/actions/runs/39204168866) PASSED**: 2,762 Vitest tests passed / 43 skipped; TypeScript, ESLint and build green. PR #32 merged **only to PIQ development** as `cbca33f9fcd3555626ae24a2a35b09de73b713eb`. The expected Preview SHA pin is stale at `91f8eef5b`, most recent inspected READY preview at `044332d8`; neither authorizes runtime QA. Production stays unchanged, schema head
0060, 0/9 PIQ phases formally owner-accepted.
