# daurham-health

Personal health record for one owner. The signed-in app reads and writes the owner's database. The public demo at `/demo` is anonymous, synthetic, and read-only.

## Surfaces

- Owner app: Today, Nutrition, Training, Body, Progress, Activity, Sleep, Timeline, Compare, Checkpoints, and Settings.
- Public demo: `/demo` and the same sections under that prefix. It does not use the database, owner APIs, or providers.
- Sign-in is owner-only. Private APIs reject anonymous callers. The Apple Health ingest token can write `POST /api/ingest/apple-health` and cannot read Health data.

## Providers

- Nutrition capture: Gemini, with Home-AI as an explicit fallback.
- Workout-sheet transcription: Home-AI.
- Ongoing Activity and Sleep transport: Health Auto Export. See `docs/health-auto-export.md`.

## Data

- Schema migrations live in `migrations/`. The current migration is `0016_sleep_nightly_summaries.sql`. Apply them with `npm run migrate`.
- Full backup, verify, and restore commands are in `docs/BACKUP.md`.
- Release checks are in `docs/V1-RELEASE-CHECKLIST.md`.

## Deploy

Production is a Vite client plus one Vercel function (`api/index.ts`). Server secrets stay in the host environment. They are not `VITE_` variables.
