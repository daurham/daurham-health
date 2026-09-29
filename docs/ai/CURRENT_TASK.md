# Current task

## Objective

Implement **V2-H1 — Trust + Daily UX Cleanup**, the first slice of the post-V2 polish initiative.

This task improves correctness, nutrition completeness, and the highest-friction owner UI discovered during the September 2026 mobile review. It intentionally does **not** begin the Coach/Quest, XP economy, routine-builder, Mind, or expanded-theme work yet.

The result should make the existing product more trustworthy and easier to scan before the new coaching/progression layer is added.

## Background

The current application is the tree described in `docs/ai/DEV_STATE.md` after V2-G8. The owner reviewed the live mobile UI and identified several correctness and daily-use problems:

- Nutrition tracks calories/macros but not fiber or sodium.
- A strength Goal can appear achieved from a performance the owner cannot find in the currently recorded Training sessions. Test/dummy workout data may have contributed historically. Goal/strength derivation must stay synchronized with current canonical Training data.
- A mistaken Goal cannot be corrected cleanly (for example, switching `at_least` to `at_most`) and there is no satisfactory way to remove a mistaken Goal.
- The Settings menu can remain open after navigating elsewhere.
- The Body measurement schedule is too long on mobile and due measurements do not get enough visual attention.
- The Supplements Today card remains large after the day's supplement work is resolved.
- Supplement management entries are too tall and difficult to scan on mobile.
- Progress > Overview > Nutrition calorie-chart Y-axis ticks can render excessive decimal precision.

Repository invariants still apply:

- Canonical facts live in the owner database.
- Deterministic code calculates derived values.
- Missing evidence stays missing.
- Derived products such as Goal status are not a second persisted source of truth.
- Supplement states remain distinct: taken, skipped, unknown, paused, and not scheduled.
- Appearance/motion must respect the existing semantic-color rules and `prefers-reduced-motion`.
- Demo remains anonymous, synthetic, read-only, and provider-free.

The older roadmap says recipe fiber was deferred. This task supersedes that backlog decision: fiber and sodium are now intentionally part of the Nutrition model wherever a current Nutrition source can provide or deterministically compose them.

## Requirements

### 1. Add fiber and sodium to Nutrition end to end

Add two optional nutrients to the existing Nutrition pipeline:

- fiber, stored and calculated in grams
- sodium, stored and calculated in milligrams

Use the repository's existing naming/unit conventions where possible. Do not create a competing nutrition model just for these nutrients.

The fields must flow through every currently supported Nutrition path that can reasonably provide them, including:

- manual food creation/editing
- canonical/saved foods
- USDA food lookup/import
- Open Food Facts/barcode data when the provider supplies them
- nutrition-label capture/review
- Gemini description capture
- Gemini meal-photo capture/refinement
- Home-AI nutrition fallback when the provider supplies them
- recipe ingredient composition and saved recipe versions
- recipe consumption
- Nutrition entries
- daily/summary Nutrition reads used by Today, Nutrition, Progress, or other existing surfaces

Provider parsing must map the provider's actual fiber/sodium fields or nutrient identifiers rather than infer values.

AI prompts/schemas/sanitizers may request and accept fiber/sodium, but the model must not invent a value merely because the field now exists.

#### Missing-value semantics

Missing nutrient evidence must remain missing.

- Do not coerce absent fiber or sodium to zero at ingestion or storage boundaries.
- A food/entry may have one nutrient while the other is unknown.
- Deterministic recipe composition must not represent an incomplete nutrient total as a known exact total. If every required weighted ingredient has the nutrient, compute it. If one or more contributing ingredients lack it, preserve an explicit incomplete/unknown state using the smallest change consistent with the existing Nutrition architecture.
- Daily totals may expose known contribution only if the UI/model also makes incompleteness explicit; do not display a partial sum as though it were the complete day's fiber/sodium total.
- Existing calorie/protein/carbohydrate/fat behavior must remain unchanged.

Expose fiber and sodium as secondary nutrition information rather than crowding the primary calorie/macro hierarchy. They should be available in relevant food/entry review and Nutrition summary/detail surfaces.

If a schema migration is required, add the next ordered migration after the current head and update backup/portable-export inventories consistently with whether the affected rows are already canonical/portable.

### 2. Make strength records and Goal achievement derive from current canonical Training data

Investigate the owner's reported case where a Bench Press Goal of 120 lb is shown as achieved even though the owner cannot find a current Training session above 100 lb.

Find the actual derivation path before changing behavior.

The authority must be current canonical Training sessions and their valid exercise/set data. A deleted Training session must not continue contributing to:

- strength bests
- e1RM calculations
- Goal observations
- Goal status/achievement
- projections or other derived strength products that use the same observation

Do not solve this by introducing a manually synchronized "max weight" source of truth.

If the current implementation has a derived cache/record that can become stale, remove or correctly invalidate/recompute it so canonical Training remains authoritative.

If the apparent 120 lb achievement comes from a canonical dummy/test session that still genuinely exists in the owner's production data, do **not** silently bulk-delete owner data or guess which sessions are fake. The implementation must still fix synchronization/deletion behavior, and the completion report must identify the exact source of the reported achievement and whether a separate explicit owner cleanup is required.

Test/demo fixture data must never leak into owner production reads.

### 3. Improve Goal correction and removal

A mistaken Goal must be repairable without marking it complete.

For an active Goal, support editing the target definition using the existing Goal/version architecture rather than rewriting historical versions. At minimum, the owner must be able to correct:

- target direction/state such as `at_least` ↔ `at_most`
- target value(s) supported by that Goal kind
- other fields already intended to be editable through Goal versioning

After an edit, deterministic Goal status must recompute from the corrected current version.

Add a clear way to remove a Goal created by mistake.

- If the Goal has no downstream immutable references that require its identity, allow a confirmed delete.
- If an existing immutable relationship makes physical deletion unsafe, use an explicit retire/archive behavior that removes the Goal from active/default Goal surfaces without falsifying history, and explain that behavior in the UI.
- Do not use "mark complete" as the substitute for deletion.

Preserve existing active/paused/completed semantics for legitimate Goals.

This task does not add new Goal kinds such as push-up reps, running distance, handstands, or generic skill Goals. Those belong to a later Goal/routine slice.

### 4. Close Settings/menu UI when navigation changes

Fix the current behavior where the Settings/menu surface can stay open after the owner navigates elsewhere.

At minimum:

- navigating to a different route closes the menu/sheet/drawer
- selecting a destination from that menu closes it
- existing outside-click, Escape/back, focus, and mobile behavior must not regress

Do not add global state solely to work around a local navigation-state bug if the existing component/router structure can own the fix.

### 5. Make the Body measurement schedule compact and attention-first

The Body measurement schedule must no longer render as a long, permanently expanded mobile list.

Create a compact default presentation that summarizes the current schedule state and can be expanded to inspect individual metrics.

The collapsed state should communicate, as applicable:

- number of measurements due/overdue
- number scheduled soon or the next due date
- completion/current state when nothing needs attention

Due/overdue measurements must have a stronger visual/typographic state than ordinary future measurements so they are easy to notice.

Do **not** represent "due" as a medical danger state. Reuse or introduce presentation tokens that communicate attention/urgency without implying the measurement itself is clinically abnormal.

The detailed schedule remains accessible through an explicit expand/view action.

Existing cadence calculations and due-state authority must remain unchanged unless a correctness bug is found and recorded as a deviation.

### 6. Collapse the Today Supplements card when the day is resolved

When today's scheduled supplement occurrences no longer contain an actionable `unknown` occurrence, transition the Today Supplements component into a compact resolved state.

Preserve state distinctions:

- all scheduled occurrences taken: a positive completed summary is appropriate
- one or more skipped but no unknown occurrences remain: show a neutral resolved summary that keeps the skipped count visible; do not claim all supplements were taken
- paused/not-scheduled items must not be converted into taken/skipped

The compact state should be reopenable so the owner can inspect or correct today's supplement state.

Use the existing motion vocabulary. A short collapse/completion transition is desired, but `prefers-reduced-motion: reduce` must remove the animation while preserving the state change.

Do not animate health numbers or change adherence calculations.

### 7. Redesign supplement management for mobile scanability

Improve the owner-facing supplement-management list so one supplement does not consume a large, confusing vertical card by default.

The compact/default row must make the supplement identity obvious first. Secondary information such as dose, schedule, lifecycle state, or adherence configuration should use smaller supporting text/chips as appropriate.

Editing/details may expand inline or open the app's existing sheet/detail pattern, but the list itself should be easy to scan on a narrow mobile viewport.

Preserve every existing supplement-management capability and lifecycle state. This is an information-hierarchy/layout improvement, not a rewrite of supplement semantics.

### 8. Fix Nutrition calorie-chart Y-axis formatting

On Progress > Overview > Nutrition, format calorie-chart Y-axis ticks using human-readable "nice" values.

Requirements:

- no long floating-point labels
- normal calorie ranges should use integer ticks
- tick spacing should remain useful across small and large ranges
- underlying data precision and tooltip/detail values must not be mutated merely to make axis labels clean
- empty/single-point/flat-series cases must remain stable

Prefer a shared deterministic axis/tick helper if the charting layer already has or would benefit from one.

## Non-goals

Do not implement any of the following in V2-H1:

- Today Coach/attention inbox
- Daily Quests
- Stretch Quests
- Personal Lab proposal surfacing on Today
- XP, Lifetime XP, spendable XP, reward ledger, real-world reward redemptions, levels, or unlocks
- expanded theme catalog or DBZ/anime/game-inspired themes
- new theme-token architecture beyond changes strictly required for the due-state/UI fixes
- generic workout/routine builder
- custom exercise creation
- new Goal kinds for reps, distance, duration, skills, calisthenics, or continuous running
- Mind tab, meditation, mood tracking, journaling, or mental-health interpretation
- notifications/background AI calls
- new AI-generated health conclusions
- changes to Personal Lab experiment eligibility
- overnight vital enablement

These are intentionally deferred so the trust/UX foundation lands first.

## Existing behavior that must remain unchanged

- One-owner authentication and owner-only APIs.
- Public `/demo` remains anonymous, synthetic, read-only, and must not call provider or owner APIs.
- Phoenix calendar-date semantics.
- Existing calorie/protein/carbohydrate/fat calculations and targets except where a shared generic nutrient type must be extended.
- Existing reviewed-before-commit Nutrition capture flows.
- Gemini calls continue through the existing `ai_usage` reservation gate and request types; adding fiber/sodium does not create a new AI wallet or request type.
- Home-AI remains a separate HTTP service and remains outside the Gemini ledger.
- Recipe nutrition remains deterministic from canonical ingredients; AI does not calculate saved recipe nutrition.
- Goal display continues to use the existing deterministic Goal authority/version model.
- Training session kinds remain `programmed`, `ad_hoc`, and `experiment`.
- Apple/Health Auto Export Activity workouts remain outside canonical Training and must not contribute to Training strength bests.
- Supplement occurrence states remain distinct.
- Existing color mode/palette preferences and reduced-motion contract remain intact.
- No health measurement, chart, or Goal number receives decorative count-up animation.
- Backup/export behavior changes only when canonical schema changes actually require it.

## Edge cases

Cover at least the following:

### Nutrition

- USDA/provider food has fiber but not sodium, or sodium but not fiber.
- Provider returns neither nutrient.
- Provider returns zero explicitly; explicit zero must remain distinguishable from unknown.
- AI output omits one or both new nutrients.
- Recipe contains a mix of ingredients with known and unknown fiber/sodium.
- Scaling recipe servings/grams preserves correct nutrient units.
- Existing Nutrition rows created before this change remain readable.
- Today/daily summary does not falsely label a partial nutrient sum as complete.

### Training / Goals

- Deleting the session that currently supplies a strength best immediately changes the next derived read.
- Editing/replacing a set changes the derived best/status on the next read if current architecture supports that edit.
- Two sessions tie for the same best and one is deleted.
- A rep-based e1RM observation and a literal load observation are not confused.
- Apple Activity workouts never become strength evidence.
- A Goal corrected from `at_least` to `at_most` recomputes from the new version.
- A mistaken unreferenced Goal can be removed without being marked complete.
- A referenced Goal is not destructively deleted if doing so would corrupt immutable experiment/history relationships.

### Body

- No cadence configured.
- Some metrics due and some future.
- Many metrics due at once.
- Everything current.
- Expansion/collapse works at mobile width.

### Supplements

- All scheduled items taken.
- Mix of taken and skipped with none unknown.
- At least one unknown remains.
- Paused/discontinued/not-scheduled items do not block resolution incorrectly.
- Correcting a resolved occurrence causes the compact summary to update appropriately.
- Reduced-motion users get the same final state without the collapse animation.

### Chart

- no points
- one point
- flat values
- narrow range
- large range
- values that previously produced decimal tick noise

## Implementation constraints

- Read and follow `AGENTS.md`, `docs/ai/PROJECT.md`, `docs/ai/DECISIONS.md`, and `docs/ai/DEV_STATE.md` before modifying code.
- Inspect the relevant current code and schema before choosing exact field names, migration shape, or UI components.
- Prefer extending established domain builders/parsers/types rather than duplicating calculations in React.
- Keep deterministic calculations in shared domain code when both client and server need them.
- Do not introduce a new runtime dependency unless unavoidable; if one appears necessary, record it as a deviation before adding it.
- Do not silently change an existing API contract. Extend it compatibly when possible.
- New nullable database columns must be backward-compatible with existing rows.
- Never interpret missing fiber/sodium as zero.
- Never persist Goal status or strength-best state as a new independent authority to solve the stale-record bug.
- Do not run destructive production-data cleanup as part of an application migration.
- If an owner-only data cleanup is required to remove a still-existing dummy Training session, identify it in the completion report rather than deleting guessed rows.
- Use existing semantic colors and motion vocabulary where practical.
- Responsive/mobile behavior is a first-class acceptance requirement.
- Update durable docs/decisions only for semantics that outlive this task. Do not rewrite historical ledger entries.

## Tests required

Add or update focused tests for every changed domain/API path plus regression coverage for the reported issues.

At minimum:

1. **Nutrition domain/storage/provider tests**
   - nullable fiber/sodium parsing and serialization
   - explicit zero versus missing
   - USDA mapping
   - Open Food Facts mapping when currently supported
   - Gemini candidate/schema/sanitizer handling
   - Home-AI candidate handling when currently supported
   - label/description/meal capture commit paths
   - recipe deterministic composition and missing-value behavior
   - daily/summary completeness behavior
   - backward compatibility for pre-migration rows

2. **Training/Goal derivation tests**
   - current canonical sessions are the strength/Goal observation authority
   - session deletion removes its contribution
   - tie/best fallback after deletion
   - Activity workouts excluded
   - Goal target-direction edit/version recomputes status
   - Goal delete/archive safety behavior

3. **UI/component tests where the existing test stack supports them**
   - Settings menu closes on route change/navigation selection
   - Body schedule collapsed summary and expansion
   - due/overdue presentation state
   - Supplements compact resolved state for all-taken and taken+skipped cases
   - reduced-motion-safe state behavior where testable
   - compact supplement-management rendering
   - calorie-axis labels do not expose excessive decimals

4. **Regression validation**
   - existing relevant tests remain green
   - `npm test`
   - `npx tsc -b`
   - `npx eslint .`
   - `npm run build`

If a migration is added, run the repository's migration/ledger validation appropriate for a new migration without using or mutating the owner's production database from tests.

## Acceptance criteria

V2-H1 is complete when all of the following are true:

1. Fiber and sodium are first-class optional Nutrition nutrients across supported ingestion, food, recipe, entry, and summary flows.
2. Unknown fiber/sodium never silently becomes zero or a falsely exact aggregate.
3. The UI exposes fiber/sodium without overwhelming the primary calories/macros hierarchy.
4. Strength bests/e1RM-derived Goal observations reflect only current canonical Training data.
5. Deleting a contributing Training session removes its effect from the next strength/Goal read.
6. The completion report identifies the concrete cause/source of the owner's reported false 120 lb Bench Press achievement.
7. A mistaken Goal can be corrected through Goal version/edit semantics, including `at_least` ↔ `at_most`, without marking it complete.
8. A mistaken Goal has a legitimate delete or safe retire/archive path.
9. The Settings/menu surface does not persist across navigation.
10. Body measurement cadence is compact by default, expandable, and makes due/overdue items noticeably easier to find without implying clinical danger.
11. Today's Supplements card collapses when the day is resolved, distinguishes all-taken from taken+skipped, can be reopened, and respects reduced motion.
12. Supplement management is materially easier to scan on a mobile viewport without losing functionality.
13. Progress Nutrition calorie-chart Y-axis labels are human-readable and do not show floating-point noise.
14. Existing owner/demo/auth/provider/backup invariants remain intact.
15. All required tests, typecheck, lint, and production build pass.

## Required completion report

When finished, report:

1. Files changed.
2. Any migration added, its exact filename, whether it was applied anywhere, and resulting migration head.
3. Fiber/sodium data model:
   - field names and units
   - provider mappings implemented
   - missing/partial aggregate semantics
   - recipe and daily-summary behavior
4. Strength/Goal diagnosis:
   - exact code path that previously produced strength observations
   - exact source of the reported 120 lb Bench Press achievement
   - whether that source is still-existing canonical owner data, stale derived data, or a code bug
   - how deletion/edit now propagates to strength bests and Goal status
   - any explicit owner data cleanup still required
5. Goal edit/delete behavior and how historical versions/references are preserved.
6. Settings navigation fix.
7. Body measurement collapsed/due UX behavior.
8. Supplements Today collapse behavior, including all-taken versus skipped semantics and reduced motion.
9. Supplement management mobile redesign.
10. Calorie chart tick-formatting approach.
11. Tests added/updated and final counts.
12. Results of:
    - `npm test`
    - `npx tsc -b`
    - `npx eslint .`
    - `npm run build`
13. Manual QA performed at desktop and approximately 390 px mobile width.
14. Any deviations, unresolved questions, risks, or follow-up work.
15. Documentation updated (`DEV_STATE.md`, `DECISIONS.md`, roadmap/manual amendments if needed).
16. Final commit SHA and confirmation that it was pushed.

When implementation is complete, update `docs/ai/DEV_STATE.md` to the actual resulting product state, reset this file to "No active implementation task", commit, and push per `AGENTS.md`.
