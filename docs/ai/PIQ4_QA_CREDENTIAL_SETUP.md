# PIQ-4 — isolated preview credential handoff (safe; release still blocked)

**Status (2026-10-17): PREVIEW AUTH/DB SETTINGS PREPARED, NOT CONNECTED.**
This page is a non-secret operator checklist. Never copy production
Health database credentials, owner login secrets, or actual health data.

## Confirmed infrastructure

- QA Neon project: `daurham-health-piq-isolated-qa`
  (`lively-wave-25801832`); new root `br-crimson-cloud-akrf5kuo`,
  database `neondb`, PostgreSQL 18; 56/56 migrations.
- QA Auth uses `better_auth`, with distinct auth provider project and
  HTTPS endpoint from existing Health production.
- One disposable QA Auth record was created in this QA project only,
  ID `2420a606-0f6e-46e4-8aab-65a39e25f6e3`,
  address `piq.qa.20261017@example.com`, **which is deliberately
  non-deliverable and is not a working interactive login**. It has
  no known password, and there are no Auth sessions.
- The PIQ Vercel project is `prj_KNUk1CcJbYjQbSkADSHSuynhpZJU`;
  the *only* configured scope for the 37 QA environment variables is
  Preview, branch `piq/00-baseline-20261014`.
- QA Auth URL, disposable owner ID, independently sourced QA vs.
  production endpoint host metadata, project/branch metadata, runtime
  DB/Auth check flags, and SHA-pinning were created branch-only.
- `DATABASE_URL`, related credential aliases, and
  `NEON_AUTH_COOKIE_SECRET` are deliberately **invalid, QA-only
  placeholders**, not production values. The tool did not permit
  automated credential handoff, and this fail-closed override prevents
  the PIQ branch from silently inheriting production credentials at
  its next deployment.
- All PIQ preview API routes remain locked with
  `PIQ_PREVIEW_OWNER_API_LOCKED` (HTTP 503). Do not change this
  without a separate code review and explicit release authorization.

## Credential setup for a future approved QA rehearsal

1. In the **new** Neon project `lively-wave-25801832`, open
   **Connect**, select root branch `main` and database `neondb`,
   and obtain its **pooled** PostgreSQL connection URI. Confirm the
   host belongs to the QA compute, *not* the existing production
   endpoint. Do not paste the URI into chat, Markdown, GitHub, a
   screenshot, or the regular application environment.
2. In Vercel project `daurham-health` → Settings →
   Environment Variables, find the **branch-scoped Preview entry**
   for `DATABASE_URL` scoped exclusively to
   `piq/00-baseline-20261014`. Replace its invalid sentinel with
   the QA pooled URI. Do **not** edit the global Preview/Production
   entry, any `main` environment, or an unrelated project.
   Other `DATABASE_*` credential aliases deliberately remain
   invalid until their use is audited; the current app's
   `server/db.ts` uses `DATABASE_URL`.
3. Generate an independent 32-byte-or-stronger random secret using
   a trusted local password generator (e.g. Node crypto randomBytes);
   replace only the **branch-scoped Preview** value of
   `NEON_AUTH_COOKIE_SECRET`. Never use the production cookie
   secret or paste the new value into chat or code.
4. **Do not enable API access or sign in yet.** The initial
   `example.com` disposable user cannot receive sign-in mail
   and has no known password. A reachable user must eventually
   register through isolated QA Auth in an authorized controlled
   rehearsal; its verified unique auth user ID must replace
   `HEALTH_OWNER_USER_ID` and
   `HEALTH_PIQ_PREVIEW_TEST_OWNER_USER_ID`. It must differ from
   the production owner. Verify the owner comparison with
   independently obtained production owner ID, not a fabricated
   identifier.
5. Deploy the exact reviewed PIQ Git SHA to **Preview only**, then
   update branch-scoped `HEALTH_PIQ_EXPECTED_PREVIEW_SHA` to match.
   Read-only inspect that effective runtime `DATABASE_URL` maps to
   the independent Neon QA project, and `NEON_AUTH_BASE_URL`
   maps to the separate QA Auth project, with both binding enforcement
   flags `true`. Do not print credentials in logs.
6. Repeat empty owner-row checks (except controlled QA test rows),
   test backup/rollback and actual owner/Auth routing in an isolated
   approved environment. Only after explicit user sign-off and a
   reviewed code change may the PIQ API hard lock be relaxed for
   mobile acceptance. No production merge or production migration.

**Failure mode:** missing, invalid, stale, or mismatched connections
keep the preview blocked. Merely seeing Vercel's READY status, green
GitHub CI, matching project host, or a successful QA Auth user
creation does not mean the user API is safe or functional.
