# V1 release checklist

Release-candidate checks. This does not tag or freeze v1.

## Automated

- `npm test`
- `npm run lint`
- `npm run build`
- Replay `migrations/0001_health_foundation.sql` through `0016_sleep_nightly_summaries.sql` on an empty disposable Postgres database.
- `npm run backup:verify -- ./backups/<archive>.health-backup.zip`
- Restore that archive into a disposable database that is not production. Require `HEALTH_BACKUP_RESTORE=yes` and `--apply` for the Neon CLI. Delete the disposable copy after verification.

The 2026-09-22 full archive verified as 22 tables and 34,258 rows. A disposable local restore matched those counts and was deleted. The Neon restore CLI cannot open a local socket database.

## Owner manual

Perform this on a real signed-in iPhone and desktop session. Do not mark it passed from an automated session.

iPhone, signed in:

- Today loads owner data, refresh works, and provisional Activity reads "so far".
- Nutrition: change day, manual Add Food, Description, Meal Photo, Nutrition Label, barcode camera, edit, delete/undo, and keyboard/save stays above the bottom nav.
- Training: history, session detail, workout-sheet review, and reachable Save controls.
- Body: latest values, XLSX preview without committing, and the supported add flow.
- Progress: overview, Strength, Body, Activity, Sleep, Timeline, Compare, a checkpoint, and ranges.
- Settings: portable Health export downloads.
- Auth: sign out, private routes lock, and sign-in returns to the in-app path.
- Signed out: Explore demo stays under `/demo`.

Desktop, signed in:

- Today, Nutrition, Training, Body, Progress, Timeline, and Compare.
- Browser back, forward, and a deep refresh.
- The responsive breakpoint.

Budget about 20–30 minutes.

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
