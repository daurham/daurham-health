# Dev state

Snapshot recorded 2026-09-29 after **V2-H1 — Trust + Daily UX Cleanup**. This is the current health application.

## Git

- Branch: `main`
- V2-H1 implementation is committed and pushed
- The implementation contract that started this slice was committed as `987582668f6c4b63c750535fa6989d6c639b5377`
- Package version remains 1.0.0
- No new runtime dependency was added

## Schema

- Migration head: `0034_nutrition_micros_goal_archive.sql`
- V2-H1 migration was committed but was **not applied to the owner's production database by the implementation workflow**
- The migration adds:
  - nullable `sodium` to `nutrition_foods` and `nutrition_entries`
  - nullable `sodium_target` to `nutrition_targets`
  - nullable whole-recipe `fiber_g` and `sodium_mg`
  - nullable ingredient snapshot/line fiber and sodium fields
  - nullable `goals.archived_at` plus an archive index
- Backup/portable inventory includes every new canonical column, including archived Goal state

## Nutrition micronutrients

- Fiber remains grams. Sodium is canonical milligrams.
- Both are optional evidence. Missing stays missing; an explicit zero stays zero.
- Legacy in-memory objects may omit sodium, but canonical read/write boundaries normalize that omission to unknown rather than zero.
- Daily totals return `insufficient_data` when any logged entry is missing the nutrient. A partial sum is not presented as the complete day.
- Recipe composition uses the same all-lines-known rule. Whole-recipe fiber/sodium are null if any contributing line is unknown.
- Recipe versions snapshot base and line fiber/sodium so historical recipe nutrition does not drift when a reusable food changes.
- Recipe consumption scales the frozen version values for servings, grams, or whole-recipe fractions.
- Manual foods/entries, saved foods, USDA, Open Food Facts, label capture, description capture, meal-photo capture, reusable recipe foods, recipes, Today, Nutrition, and Progress carry the new nutrients.
- USDA sodium uses FoodData Central nutrient id 1093. Open Food Facts sodium is converted from provider grams to canonical milligrams.
- Gemini Nutrition prompts/schemas accept fiber and sodium. Missing AI output remains null; adding the field does not authorize inventing it.
- Fiber and sodium are secondary UI information. Calories and protein/carbs/fat retain the primary hierarchy.

## Strength and Goal authority

- A strength Goal still derives from canonical Training sessions and sets at read time. There is no persisted Goal-achievement or max-weight authority.
- The path is `server/goals/service.ts -> loadEvidence -> latestSessionE1rm -> sessionStrengthHistory/sessionStrengthPoint`.
- Training evidence only joins canonical `workout_sessions`, `workout_session_exercises`, and `workout_sets` for `programmed`, `ad_hoc`, and `experiment` sessions.
- Apple/Health Auto Export Activity workouts remain outside Training and cannot satisfy a strength Goal.
- Deleting a Training session cascades to session exercises and sets, so the deleted evidence disappears from the next Goal/Progress read automatically.
- `strength_e1rm` is an **estimated 1RM**, not a literal heaviest lifted load. Epley is the existing formula. For example, 100 lb × 6 reps estimates 120 lb.
- V2-H1 exposes the source load, reps, session id, and set id for strength Goal evidence. The Goal detail explains that the displayed e1RM can come from a lower literal load.
- The repo implementation contains no stale strength cache that could independently preserve a deleted session.
- The implementation workflow did not query the owner's production database, so it did not delete or relabel any suspected historical/dummy session.

## Goal correction and removal

- Goal target correction continues through immutable `goal_versions`. Revising direction/value creates a new current version and preserves prior versions.
- The existing Goal form exposes the target modes supported by that Goal kind, including correcting `at_least` / `at_most` where the domain definition permits them.
- `DELETE /api/goals/:id` is now the owner removal action.
- If no `experiment_goals` row references the Goal, removal deletes its versions and Goal identity.
- If immutable Experiment history references the Goal, removal instead sets `archived_at`; archived Goals leave default Goal/Ask surfaces while historical references remain valid.
- Marking complete is no longer the only escape hatch for a mistaken Goal.

## Daily/mobile UX

- The mobile Menu/Settings `details` element closes whenever route path/search changes, including navigation selected from the menu.
- Body measurement cadence is collapsed by default. The summary shows whether measurements need attention and the number of scheduled metrics; due/stale/initial-due rows use an amber attention treatment when expanded.
- Due styling is intentionally an attention state, not a clinical danger state.
- Today Supplements collapses once no scheduled occurrence is `unknown`.
  - all taken: positive resolved summary
  - taken + skipped: compact neutral summary preserves the skipped count
  - the owner can reopen the card to inspect/correct occurrences
- Supplement management uses compact identity-first `details` rows on mobile; full lifecycle/schedule controls remain inside the expanded row.
- Existing shared motion classes are reused. Reduced-motion behavior remains controlled by the global `prefers-reduced-motion` rules.
- Progress Nutrition calorie Y-axis labels use whole-number tick formatting. Underlying chart data/tooltips are unchanged.

## Validation

Validation ran in GitHub Actions with `TZ=America/Phoenix` against the completed V2-H1 code.

- `npx tsc -b` passed
- `npx eslint .` passed
- `npm run build` passed
- `npm test`: **969 passed, 1 skipped across 113 test files**
- Existing Vite chunk-size warning remains non-blocking
- A missing synthetic Apple Health fixture was restored under `tests/fixtures/apple-health/export.xml` so the repository test suite is reproducible in CI
- The temporary V2-H1 validation workflow was removed after the green run

## Manual QA / deviations

- No authenticated deployed owner runtime was available through the GitHub implementation tooling, so post-change click-through QA at desktop and 390 px was not performed.
- Responsive behavior is covered by the existing component/static-render tests plus the new compact markup, and build/type/lint/test gates are green.
- The production migration was not applied. Deployment must apply `0034_nutrition_micros_goal_archive.sql` before code paths that write/read the new database columns are used.

## Existing V2 behavior retained

- One-owner auth, Phoenix calendar semantics, provider boundaries, demo isolation, AI usage ledger, Personal Lab, Goals, recipes, Body Shortcut capture, multi-angle meals, meal clarifications, Activity/Sleep, supplements, Appearance, and shared motion remain in place.
- Goal status remains deterministic `goal-status-v1`; no new stored Goal-status authority was introduced.
- Supplement occurrence states remain distinct.
- Overnight vitals remain disabled.
- Demo remains anonymous, synthetic, read-only, and provider-free.

## Deferred post-V2 work

V2-H1 intentionally does not implement the next product layers:

- Today Coach / attention inbox
- Weekly Focus
- Daily Quests and rare Stretch Quests
- Personal Lab proposals surfaced on Today
- spendable XP, lifetime XP, reward ledger, real-world reward redemptions, levels, and unlocks
- expanded Goal kinds for reps, distance, duration, skills, and calisthenics
- lightweight saved-routine / empty-workout builder and custom exercises
- expanded theme system and unlockable theme catalog
- Mind / meditation / mental-wellness surface

Those belong to later implementation contracts.
