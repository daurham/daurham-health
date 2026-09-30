# Dev state

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
