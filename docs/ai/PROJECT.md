# Project

Daurham Health is a personal health record for one owner. Package version is `1.0.0`. The signed-in app reads and writes that owner's database. The public demo at `/demo` is anonymous, synthetic, and read-only. It does not use the database, owner APIs, or model providers.

The durable product rule is: Health owns canonical facts. Sources provide observations. Deterministic code validates, calculates, and derives. AI interprets or phrases. Missing evidence stays missing.

Calendar dates use America/Phoenix (`HEALTH_CALENDAR_TIME_ZONE` in `src/domain/time.ts`). Phoenix has no daylight-saving shift. Provider billing months for `ai_usage` use UTC.

## Domains

Primary navigation is Today, Nutrition, Training, Body, and Progress. Progress contains Activity, Sleep, Strength, Body, Timeline, and Compare. Weekly Coach is a secondary Progress page, not a tab.

Other owner surfaces, reached from pages rather than the primary tabs:

- Supplements and adherence
- Daily Context
- Personal Lab: experiments, benchmark protocols, benchmark results, retests, and derived experiment suggestions
- Goals and deterministic projections
- Settings, including backup export
- Ask Health
- Checkpoints

Canonical Training sessions are `programmed`, `ad_hoc`, and `experiment`. Apple Activity workouts stay in Activity. They are not Training sets, volume, or performance bests.

## Frontend

Vite, React 19, React Router 7, and Tailwind 4. Routes live in `src/routes/index.tsx`. Feature UI lives in `src/features/`. Shared deterministic calculations live in `src/domain/` and are imported by both the client and the server. The client calls owner APIs through `healthFetch`. It does not receive database credentials or provider keys.

The demo reuses domain builders and feature components under a `/demo` prefix. Demo modules must not call owner APIs or providers.

Appearance is two browser preferences, `health-theme` and `health-palette`. System, Light, and Dark are independent of Classic, Forest, Ocean, Sunset, and Plum. They change accent chrome. They are not owner records, and they are not in backup or portable export.

## Server

One Vercel function, `api/index.ts`, dispatches every `/api/*` request through `server/dispatch.ts`. Handlers live in `server/handlers/`. Domain services live under `server/<area>/`. Server TypeScript imports use `.js` specifiers.

Owner routes use `withOwnerAuth`. Anonymous callers get 401. A signed-in user who is not the owner gets 403. Wrong methods get 405, and handlers that must do that for anonymous callers check the method before auth.

PostgreSQL is reached with the Neon HTTP driver (`@neondatabase/serverless`). `pg` is a devDependency used by ledger tests against an ephemeral local database, not by production request handling.

Migrations are ordered SQL files in `migrations/`, applied with `npm run migrate`.

## Storage

The database is the owner's system of record. Full backup, verify, and restore are described in `docs/BACKUP.md`. Portable export is a smaller owner-data archive. Operational rows such as `ai_usage` belong in the full backup and not in the portable export.

Derived products are not stored as tables. That includes goal status, projections, insight cards, weekly coach prose, sleep baselines, and Ask Health transcripts. Correcting a canonical row changes the next read.

## Important flows

- Today assembles the owner's current Phoenix day from canonical domains. Activity for the current day can be provisional.
- Nutrition logs foods, recipes, targets, barcode lookups, label photos, meal photos, and text descriptions. Capture jobs can ask Gemini, with Home-AI as an explicit fallback.
- Training stores exercises, templates, and workout sessions. A workout photo becomes a Home-AI transcription job. The owner reviews it before it becomes a session.
- Body stores manual measurements, an XLSX fit-profile import, and optional measurement cadence. A Shortcut can stage a capture with `POST /api/ingest/body`. That row stays in `body_capture_inbox` until the owner reviews it and saves one ordinary manual measurement. Pending captures are not observations. Setup is `docs/body-shortcut.md`.
- Apple Health history can be imported from export archives. Ongoing Activity, Sleep, and workout sync arrives as `POST /api/ingest/apple-health` with `APPLE_HEALTH_SYNC_TOKEN`. That token cannot read Health data or post a Body capture. Apple and Health Auto Export workouts stay in Activity. They are not Training sessions. Body intake uses a separate `BODY_CAPTURE_TOKEN` and cannot read or save measurements.
- Progress, insights, and the weekly coach read canonical rows and run the existing analytics. They do not create a second copy of those formulas in React.
- Ask Health, Weekly Coach, and Experiment Suggestion drafts may call Gemini only after an explicit owner action, and only through the `ai_usage` reservation gate.

## Authentication

Sign-in uses Neon Auth (Better Auth). The owner is `HEALTH_OWNER_USER_ID`, or, only until that id is set, `HEALTH_OWNER_EMAIL`. Session cookies use `NEON_AUTH_COOKIE_SECRET`. Server secrets must not use a `VITE_` prefix.

## AI providers

This repository does not run a model. It calls two HTTP providers:

- Gemini, through `server/integrations/gemini/`, for nutrition interpretation, Ask Health, Weekly Coach phrasing, Experiment Suggestion phrasing, and literature synthesis.
- Home-AI, through `server/integrations/home-ai/`, for workout transcription and as the nutrition-capture fallback. Older architecture notes describe Ollama as the runtime behind Home-AI. This repo only has the Home-AI HTTP client.

Ask Health (`ask-health-evidence-v1`, prompt `ask-health-v1`), Weekly Coach (`weekly-coach-evidence-v1`, prompt `weekly-coach-v1`), Experiment Suggestions (`experiment-suggestion-evidence-v1`, prompt `experiment-suggestion-v1`), literature synthesis (`literature-retrieval-v1`, prompt `literature-synthesis-v1`), and Nutrition Gemini (`nutrition_description`, `nutrition_meal_photo`, `nutrition_label`) share `ai_usage`, `AI_MONTHLY_BUDGET_USD`, and the provider rate gate. The Europe PMC search is not a Gemini call. Home-AI is not on that ledger. The rate query does not filter by `request_type`. A process-local response cache is an optimization, not the budget authority. Model prose is not a canonical fact and is not stored as Health history. An experiment suggestion becomes canonical only when the owner accepts it.

## API conventions

- JSON over `/api/...`, routed by `matchHealthApiRoute`.
- Owner mutations and reads require the owner session, except the two machine ingest routes.
- Validation uses Zod and domain parsers. Handlers return `HttpError` statuses.
- `asOf` dates are `YYYY-MM-DD` in the Health calendar. Historical reads must not include later evidence.
- Idempotent ingest and import paths keep provenance on `data_sources` and import jobs.

## Testing

Vitest (`npm test`). Tests live in `tests/`. Domain tests should not require the owner's Neon database. The AI ledger tests use ephemeral local Postgres. Lint is `npx eslint .`. The production build is `tsc -b && vite build`.

## Runtime

Production is the Vite client plus the single Vercel function. `vercel.json` rewrites `/api/:path*` to that function and all other paths to `index.html`. The function `maxDuration` is 60 seconds. Local development is `npm run dev`.

## Environment variable names

Values belong in the host environment or `.env.local`, never in docs or client bundles.

- `DATABASE_URL`
- `HOME_AI_BASE_URL`
- `HOME_AI_API_KEY`
- `NEON_AUTH_BASE_URL`
- `NEON_AUTH_COOKIE_SECRET`
- `HEALTH_OWNER_USER_ID`
- `HEALTH_OWNER_EMAIL`
- `LEGACY_NUTRITION_DATABASE_URL`
- `APPLE_HEALTH_SYNC_TOKEN`
- `HEALTH_CALENDAR_TIMEZONE`
- `GEMINI_API_KEY`
- `GEMINI_NUTRITION_MODEL`
- `GEMINI_NUTRITION_DESCRIPTION_MODEL`
- `GEMINI_NUTRITION_MEAL_MODEL`
- `GEMINI_NUTRITION_LABEL_MODEL`
- `AI_ASK_HEALTH_MODEL`
- `AI_MONTHLY_BUDGET_USD`
- `AI_WARNING_BUDGET_USD`
- `AI_ASK_HEALTH_MAX_REQUEST_COST_USD`
- `AI_WEEKLY_COACH_MODEL`
- `AI_WEEKLY_COACH_MAX_REQUEST_COST_USD`
- `AI_EXPERIMENT_SUGGESTION_MODEL`
- `AI_EXPERIMENT_SUGGESTION_MAX_REQUEST_COST_USD`
- `AI_LITERATURE_MODEL`
- `AI_LITERATURE_MAX_REQUEST_COST_USD`
- `USDA_FDC_API_KEY`
- `OPEN_FOOD_FACTS_USER_AGENT`
- `OPEN_FOOD_FACTS_BASE_URL`

`AI_WARNING_BUDGET_USD` is not a spending gate. `HEALTH_CALENDAR_TIMEZONE` documents the zone; the code constant is the source of truth.

## Invariants

- One owner. The demo is not a second account.
- Missing measurements stay missing. They are not zeros.
- Deterministic analytics define numbers. Models may explain, select, or phrase. They may not invent measurements, correlations, diagnoses, treatments, or canonical writes.
- Activity's current Phoenix day stays provisional until the day is complete.
- Sleep identity uses canonical `sleep_date` and the stored logical source. Source priority is not an accuracy ranking.
- Overnight vital metrics stay disabled until a payload is verified. The production registry currently has every metric `enabled: false`.
- Supplement states stay distinct: taken, skipped, unknown, paused, not scheduled. Unknown is not skipped.
- Goal status and Lab retest status stay with their existing calculations (`goal-status-v1` and the B-series retest rules).
- Apple Activity workouts stay outside canonical Training.
- No readiness, recovery, or device-quality score exists.
- Backup and export inventories must change only when a real table is added.
