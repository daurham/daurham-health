# PIQ — isolated Preview QA credential and release handoff

**Status: QA schema migrated and isolated Preview DB URL configured; Auth and live acceptance remain blocked.**
Verified 2026-10-18. This guide deliberately contains **no credentials** and grants no authority to unlock Health APIs.

## What is complete

- Isolated Neon QA project `lively-wave-25801832`, root branch `br-crimson-cloud-akrf5kuo` (`main` **inside QA Neon only**), database `neondb`, PostgreSQL **18.6**, exact migrations **0001–0060**.
- Atomic, user-approved upgrade of migrations `0057`–`0060` succeeded; the four new provenance tables and immutable event/snapshot triggers exist, with zero rows.
- Inventory-only SQL audit: **76 non-seeded app tables have zero rows**. Four migration-seeded app tables have 70 total rows. This is **not** a provider Auth-directory audit.
- Vercel project `daurham-health` (`prj_KNUk1CcJbYjQbSkADSHSuynhpZJU`) has **37** branch-scoped Preview variables for `piq/00-baseline-20261014`.
- The Preview-branch **`DATABASE_URL` was replaced** directly with the independent QA pooled URI after verifying project, branch, database, endpoint, TLS and distinct production endpoint metadata. Never paste or repeat it.
- Both database and Auth binding enforcement flags are `true`. Static checks do not prove the effective deployed credentials or live SQL session.
- Isolated `better_auth` Neon Auth exists. Its QA-only redirect allowlist now contains `https://daurham-health-git-piq-00-baseline-20261014-daurhams-projects.vercel.app`.
- Prior baseline preview deployment `ef00fa0` reported READY. For any **subsequent** commit, repin `HEALTH_PIQ_EXPECTED_PREVIEW_SHA` to that reviewed branch commit; a READY deployment alone is not runtime qualification.

## Unresolved safeguards — do not bypass

- **Cookie secret:** Preview-only `NEON_AUTH_COOKIE_SECRET` has **not** been replaced with a verified independent strong secret. Its existing value must be treated as placeholder/not-ready. Automated attempt was blocked; do not retry by exposing secret in chat, logs, GitHub or terminals.
- **Usable QA owner:** Existing `piq.qa.20261017@example.com` disposable directory record is non-deliverable and has no known password. It cannot be used for owner testing. Create a **working separate QA-only** Auth login through approved procedures; confirm the actual QA Auth user ID, then update the Preview-branch-only `HEALTH_OWNER_USER_ID` and `HEALTH_PIQ_PREVIEW_TEST_OWNER_USER_ID`.
- **Production-owner identity proof:** `HEALTH_PIQ_PRODUCTION_OWNER_USER_ID` is missing. An operator must independently obtain and verify it without exposing owner credentials, health data, or sessions. It must differ from the QA identity; do **not** manufacture an ID. Reading production owner metadata requires an approved source/path.
- **Vercel deployment access:** authenticated deployment API inspection was denied **403** by the connection's deployment protection. Reauthorize the Vercel connection to the exact project and team before live HTTP checks; **do not disable deployment protection**.
- **Redeploy:** after credential changes, rebuild the **PIQ Preview branch only** so the effective runtime environment receives them. Confirm SHA pin, 503 hardlock, and independently sourced QA DB/Auth identity. Do not promote to Production.
- **API hardlock:** every recognized PIQ owner/Auth/Health API must keep returning `PIQ_PREVIEW_OWNER_API_LOCKED` with **503** and `Cache-Control: no-store` until a separate approved unlock change after complete isolation proof. No environment-only unlock exists.
- **Owner acceptance:** 0/9 completed. The synthetic PG16/PG18 recovery, rollback, schema coverage, and migration tests are not owner acceptance.

## Next safe operator steps

1. In **Vercel → daurham-health → Settings → Environment Variables**, select exclusively `Preview` and Git branch `piq/00-baseline-20261014`. Generate a new independent 32-byte-or-stronger cookie secret in a trusted local password manager and replace **only** that scoped `NEON_AUTH_COOKIE_SECRET`. Do not reuse production; never send secret through chat.
2. Verify separately sourced production-versus-QA owner Auth identities and provide only the approved **nonsecret matching result** to the release review, while configuring required Preview-only owner ID metadata through secure settings. Existing example.com user is not usable.
3. Grant the Vercel connector permission to inspect this exact deployment project/team. Check Auth trusted origins and DB binding against provider metadata. Update SHA pin to the exact new commit **before** redeploy; retain the PIQ API hard lock.
4. Only with new explicit approval, rehearse end-to-end QA login, owner-safe recovery and mobile acceptance, then review a narrow code change to unlock the owner APIs. No `main` or production migration is authorized.

Never confuse the **QA project's root branch named `main`** with the GitHub `main` branch or production Neon project. A schema migration, a CI run, a trusted Auth origin or a READY Preview is not a sufficient release grant.
