# Dev state

## 2026-10-06 I0B complete — dynamic instance identity + canonical timezone

- Completed deployment-level timezone portability without adding a schema migration; schema head remains `0041_exercise_library_calisthenics.sql`.
- `HEALTH_CALENDAR_TIMEZONE` is now the runtime calendar authority across owner-facing server flows. Shared domain helpers retain `America/Phoenix` only as the backward-compatible default and receive explicit timezone context in live paths.
- Today, Activity, Sleep, Progress, Goals, Coach, Weekly Coach, Lab evidence, intelligence/Ask Health inputs, Nutrition, Training defaults, Body capture, backup metadata, and Apple/Health Auto Export runtime paths were wired to instance time.
- Historical Apple compact reconciliation now accepts an arbitrary IANA timezone and splits cross-midnight samples at DST-aware Health-calendar boundaries.
- Added DST regression coverage using `America/New_York`, including spring-forward/fall-back midnight behavior and Body local-time editing offsets.
- App chrome now consumes the I0A public instance config for app name, external home link, public-demo capability, and calendar timezone. Date-sensitive owner routes wait for config before mounting to avoid a first-render Phoenix fallback race.
- Current deployment defaults remain `Daurham Health`, `https://daurham.com`, and `America/Phoenix`; another deployment can override them without source edits.
- Demo exposure is capability-driven and fails closed when disabled.
- Body Shortcut documentation is deployment-neutral and Open Food Facts fallback branding is neutral.
- Backups record the instance calendar timezone rather than a universal Phoenix value.
- Stored historical timezone/provenance rows were not rewritten.
- Independent validation run `37541015943` passed TypeScript, ESLint, all Vitest tests, and production build.
- Remaining portability work is intentionally separated into the next candidate slice: fresh-instance bootstrap and Jake-specific legacy seed/routine separation. Historical diagnostic/backfill scripts may retain legacy Phoenix defaults when they are explicitly reproducing old-owner data; they are not runtime calendar authorities.

## 2026-10-06 I0A complete — instance configuration foundation

- Added the master program at `docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`.
- Added a typed server-side instance configuration and safe public capability payload through `GET /api/health`.
- Optional capabilities now include Gemini, USDA, Home-AI, training photo import, Apple Health sync, Body Shortcut, and public demo state.
- Training photo import is capability-driven: without Home-AI/feature enablement, Training hides photo import and does not poll transcription jobs.
- Today → Training → **Log workout** now routes to `/training/new`; photo import is no longer the primary logging path.
- Added `npm run config:check` for non-secret deployment diagnostics.
- Updated `.env.example` and `PROJECT.md` with the portable instance configuration contract.
- Recorded the one-owner-per-deployment portability decision.
- No schema migration was added; repository schema head remains `0041_exercise_library_calisthenics.sql`.
- Validation run `37535917165` passed TypeScript, ESLint, the full Vitest suite, and production build.
- Next planned slice: I0B dynamic canonical timezone + instance identity/origin wiring.

## 2026-10-06 next-intelligence program start

- Current `main` includes the H5 Pantry/Exercise Library work and later maintenance fixes.
- Repository schema head is `0041_exercise_library_calisthenics.sql`.
- The prior H5 owner-QA wording in `CURRENT_TASK.md` was stale relative to current `main`; I0A replaces it as the active task.
- The master next-intelligence/portability program is checked in at `docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`.
- I0A establishes one-owner-per-deployment instance configuration and safe capability discovery before later Health Profile/intelligence phases.
- No I0A schema migration is planned.

## 2026-10-05 maintenance

- General Ask Health cross-domain synthesis was hardened for questions combining body, nutrition, and training evidence.
- Ask Health now uses a smaller structured-output contract, retries JSON mode if Gemini rejects the schema, and tolerates harmless response-shape differences without accepting fabricated evidence refs.
- Personal claims stay evidence-grounded, while established general health/physiology context can be used as clearly qualified possibilities.
- Ask Health prompt version is `ask-health-v3`.
- No migration or environment-variable change is required.
- Recipe edits can now save a new current version when linked ingredient nutrition (including fiber/sodium) has changed; immutable prior versions remain intact.
- Recipe update review now surfaces fiber/sodium completion and uses owner-facing “update” language instead of treating version creation as the primary action.

Snapshot recorded 2026-09-30 after **V2-H4 — Experience System**.

## Current product state

The app now includes the H1–H3 functional foundation plus the H4 presentation/progression system.

High-frequency experience:

- Today is Nutrition-first.
- Coach is compact and progressively disclosed.
- Daily Quest is not displaced by Stretch.
- XP is globally visible and visually distinct.
- Rewards separates Spendable XP from Lifetime progression.
- Theme Studio controls full visual packs independently from System/Light/Dark.
- Lifetime XP drives Levels/theme unlocks.
- Progress signals can express toward/away/neutral and conservative motivating defaults without replacing the underlying finding detail.
- Reduced-motion remains authoritative.

## Schema

Repository migration head:

`0040_goal_training_units_fix.sql`

0040 repairs the Training Goal unit constraint introduced by H2D application behavior.

## Important H4 runtime fixes

- local Nutrition date query handling now matches production;
- local `.env.local` values can override `.env` defaults;
- Coach loading reserves final compact geometry;
- mobile Nutrition Add Food CTA is viewport-bounded;
- owner-facing standalone dates use readable month/day/year presentation;
- Progress motivating signals preserve the specific finding text.

## Validation

Final H4 branch commit:

`0d7c3d297b304b23fc88af87ac14736c5592399a`

GitHub Actions run `36787289740`:

- 145 test files passed
- 1,315 tests passed
- 1 skipped
- TypeScript passed
- ESLint passed
- production build passed

## Next accepted work

V2-H5 — Pantry + Exercise Library + Flexible Programmed Workouts.

The staged contract is in `docs/ai/H5_DRAFT.md` until promoted into `CURRENT_TASK.md`.
