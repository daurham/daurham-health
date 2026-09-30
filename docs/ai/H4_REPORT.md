# V2-H4 — Experience System completion report

Completed 2026-09-30.

## Summary

H4 reshaped the high-frequency owner experience around visual hierarchy, progressive disclosure, themes, progression, and restrained motion.

The most important product changes are:

- Nutrition is the first-load hero on Today.
- Daily Quest remains visible even when Stretch exists.
- Coach is a compact mission summary with detail behind disclosure.
- XP has a distinct reward visual identity.
- Spendable XP is globally discoverable in the owner header.
- Lifetime XP drives deterministic Levels and theme unlocks.
- Settings now includes Theme Studio with full theme packs rather than accent-only palette swaps.
- Progress trend signals can reflect active Goals, owner presentation preferences, and conservative motivating defaults.
- Meaningful reward/progression events use bounded celebration motion.
- Reduced motion removes travel/scale/glow animation while preserving information.
- Owner-facing dates use readable display formats rather than raw ISO strings.

## Theme and progression system

Theme packs remain presentation-only browser preferences. System/Light/Dark stays independent from pack selection.

Existing packs remain always available:

- Classic
- Forest
- Ocean
- Sunset
- Plum

Lifetime-XP progression unlocks additional packs such as Aura, Saiyan Dawn, Grand Line, Hidden Leaf, Super Saiyan Gold, Spartan, Namek Sky, Wasteland, Bonfire, Clone Legion, and Silver Instinct.

Progression uses Lifetime XP rather than Spendable XP, so redeeming rewards never lowers Level or relocks a theme.

## Today / Coach

Today now prioritizes Nutrition visually and keeps Coach compact.

Daily Quest, Stretch, and Weekly Focus can coexist on the default Coach surface. Stretch no longer consumes the entire Today experience or hides the Daily Quest.

Detailed task explanation, baselines, targets, verification rules, and secondary actions are progressively disclosed.

The loading skeleton reserves the compact Coach card geometry so loading does not shift the first-load layout.

## Progress semantics

Trend color is no longer derived from arrow direction alone.

Priority is:

1. matching active formal Goal
2. owner presentation preference
3. conservative motivating default for clear performance/activity wins
4. neutral

Examples of motivating defaults include strength improvement, performance bests, higher workout frequency, higher steps, and higher logged-day protein. Calories and ambiguous Health changes remain neutral unless owner intent establishes meaning.

The visible signal keeps the specific finding detail, such as "Heaviest load" or "Estimated strength improved"; generic semantic meaning stays supplemental/accessibility information.

## Motion

H4 extends the existing reduced-motion-safe motion grammar with bounded event-driven celebration:

- XP earn
- mission complete
- reward redeem/refund
- Level up
- theme unlock
- theme selection

Ordinary Health measurements do not count up or animate continuously.

## Runtime / bug fixes discovered during H4

H4 visual QA exposed two unrelated runtime/schema bugs that were fixed as part of closeout:

### Migration 0040 — Goal Training units

Migration `0040_goal_training_units_fix.sql` expands the database Goal-unit constraint so the H2D Training Goal kinds can actually persist their units.

This fixes the production Goal POST 500 for Distance/Duration/Pace/Skill-style Goals.

### Local Nutrition date parity

The local Vite API path now preserves query-string dates for `/api/nutrition/day?date=...`, matching production/Vercel behavior.

Local env precedence was also corrected so `.env.local` can override `.env` defaults as expected.

## Validation

Final H4 branch commit `0d7c3d297b304b23fc88af87ac14736c5592399a` passed GitHub Actions run `36787289740`:

- 145 test files passed
- 1,315 tests passed
- 1 skipped
- TypeScript passed
- ESLint passed
- production build passed

Visual owner QA was performed on desktop/mobile local builds and directly drove the final Coach, Theme Studio, Progress-signal, date-formatting, Goal, Nutrition, and mobile CTA corrections.

## Schema / deployment

Repository schema head after H4 is:

`0040_goal_training_units_fix.sql`

No H4 production deployment is claimed here. The owner applies migrations/deployments separately.

## Follow-up

H5 is the next accepted functional slice:

**Pantry + Exercise Library + Flexible Programmed Workouts**

Its staged design lives in `docs/ai/H5_DRAFT.md`.
