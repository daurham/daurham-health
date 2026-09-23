# V1 release checklist

Release version: **1.0.0**  
Release date: **2026-09-22 America/Phoenix**

Owner acceptance is complete. This file records the frozen v1.0.0 result.

## Owner manual acceptance

- Owner manual acceptance: **PASSED**
- Desktop acceptance: **PASSED**
- iPhone acceptance: **PASSED**
- Today / Nutrition / Training / Body / Progress acceptance: **PASSED**
- Auth / demo acceptance: **PASSED**
- HAE current-day Activity: **PASSED**
- HAE Previous-7-Days reconciliation: **PASSED**
- Backup verification: **PASSED**
- Tests / lint / build: **PASSED**

## Automated

- `npm test`
- `npm run lint`
- `npm run build`
- Latest schema migration: `0016_sleep_nightly_summaries.sql`
- `npm run backup:verify -- ./backups/<archive>.health-backup.zip`

Phase 15A already physically restored a verified archive into disposable PostgreSQL and deleted that copy. Do not rerun that restore merely to tag.

## Production

- Latest migration: `0016_sleep_nightly_summaries.sql`.
- Required server environment names: `DATABASE_URL`, `NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET`, `HEALTH_OWNER_USER_ID`, `APPLE_HEALTH_SYNC_TOKEN`, `GEMINI_API_KEY`, `HOME_AI_BASE_URL`, `HOME_AI_API_KEY`. `USDA_FDC_API_KEY` is used only for unmatched food descriptions. Do not store values in this file.
- Health Auto Export Activity and Sleep automations post to `/api/ingest/apple-health`.
- Home-AI is reachable at the configured base URL.
- A verified full backup exists outside git. `backups/` and `*.health-backup.zip` are gitignored.

## Rollback and recovery

- Roll a bad deployment back in Vercel. That does not roll the database back.
- Keep the latest verified `.health-backup.zip`. Restore steps are in `docs/BACKUP.md`.
- Restore into an empty database on migration `0016_sleep_nightly_summaries.sql`. Do not restore over production rows.
- Authentication is not in the backup. Recover the owner account separately.
