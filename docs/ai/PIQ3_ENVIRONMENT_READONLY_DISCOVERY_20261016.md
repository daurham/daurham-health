# PIQ environment identity — read-only discovery, 2026-10-16

**Status: PARTIAL MATCH; RELEASE AND LIVE QA BLOCKED.** This is a metadata-only investigation, not a migration preflight, permission to test private health records, encryption audit, isolated restore rehearsal, deployment, or proof of production identity. All nine PIQ phases remain **unaccepted**. No connection string, token, raw account/health data, deployment logs, SQL query, or mutation was used.

## Vercel: project located; serving identity inaccessible

- The Vercel project search located the project named `daurham-health` under the `daurhams-projects` team scope.
- Scoped read-only project lookup, latest deployment listing and production-domain lookup **each returned HTTP 403**: the linked Vercel credential is not authorized for this team scope.
- The same Vercel account's team list was empty. **Do not switch to another team or an unrelated project just to bypass 403.** The exact production deployment, commit SHA, linked Git ref, domain aliases, protection settings, and runtime environment-to-database mapping are **unverified**.
- Required next step: grant/reconnect access to the **same correct team** through the authorized Vercel connection. Then inspect the deployed commit/environment and verify server-side database destination through a safe redacted identity/checksum path. Never reveal environment secret values.

## Neon: candidate Health metadata found; deployment mapping not verified

- Neon organization discovery returned both a console-managed and a Vercel-managed organization. An unscoped project list returned empty, but an explicitly scoped **read-only** list of projects in the returned Vercel-managed organization succeeded.
- One project, named `neon-rose-kettle`, contains a default branch `main` and child branch `preview/piq/00-baseline-20261014`; that child is parented to `main`. Other preview branches reference recent Health-specific feature work and a pre-migration preservation branch. This strongly suggests association with the Health repository; **it does not establish which Neon project or branch the live Vercel deployment uses**.
- Both `main` and the PIQ preview branch have a database named `neondb`; a schema-name-only inspection returned the same 85 Health application/auth tables (including `health_profile`, `nutrition_entries`, `workout_sessions`, `schema_migrations`, `ai_usage`) on both branches. This confirms compatible schema names, **not** identical migration contents, owner safety, or the current serving deployment's DB target.
- The preview branch is **NOT** a disposable clean QA fixture by default: a child Neon branch may inherit the parent's data at creation. Do **not** use this branch for synthetic owner writes, unauthenticated inspection, broad Gemini prompts, destructive operations, or share its database URL. An isolated test owner and appropriately protected clean test data environment require their own verification.
- A manual snapshot labeled `health-prod-before-0051-2026-10-11` is present in the candidate project, sourced from its main branch. The default main branch returned an **empty automatic snapshot schedule**. A manual snapshot is not evidence of a tested, encrypted backup-and-restore process, nor confirmation that this candidate is the actual production database.
- Another Neon project is labeled `jakes-fitness-tracker-postgres`, with a separate, older default branch; project names alone cannot authorize using either database. No data rows, credentials, private table contents, or migration ledger values were read.

## Gate outcomes (all unchecked for release)

| Gate | Metadata-only observation | Acceptance state |
| --- | --- | --- |
| Correct Vercel project exists | `daurham-health` found | **Located, not authenticated for detail reads** |
| Exact live Vercel serving SHA and domain | Scoped 403 | **BLOCKED** |
| Vercel runtime → Neon project/branch/database binding | Requires authorized environment identity comparison without exposing secrets | **NOT VERIFIED** |
| Preview web deployment → separate intended DB target | No authorized deployment/secret metadata | **NOT VERIFIED** |
| Preview test data isolated from private owner rows | PIQ branch descends from candidate main | **NOT VERIFIED; treat as sensitive** |
| Schema migration history/read-only preflight | 85 table names observed, no `schema_migrations` values queried | **NOT RUN** |
| Owner backup is verified encrypted and restores cleanly | One manual snapshot, no scheduled snapshots | **NOT VERIFIED** |
| Paid-provider smoke tests and actual mobile owner QA | No access/approval | **NOT RUN** |
| Production changes or owner acceptance | No action requested or performed | **0/9 accepted** |

## Safe continuation order

1. Resolve the scoped Vercel 403 under the **existing correct** team, without pasting tokens into chat or GitHub.
2. Pin and privately record the live production deployment SHA and the app's exact database project, branch and database via **authorized**, redacted identity methods. Do not assume the best-named Neon branch is production.
3. Verify preview Vercel and Neon are actually paired and segregated; use synthetic-only, access-limited fixtures for destructive or editing tests, not inherited owner data.
4. Only after target authorization, conduct read-only `npm run migration:preflight` against the explicitly verified DB, and independently verify encrypted backup + separate restore rehearsal.
5. Seek explicit owner approval for any paid Gemini smoke batch, migrations, merge, deploy or owner-data writes. The [owner acceptance matrix](./PIQ3_OWNER_QUESTION_ACCEPTANCE.md) stays **prepared, not executed**.

No action in this discovery changed `main`, Vercel deployments, Neon projects/branches/databases, migrations, backups, Health records or AI usage.
