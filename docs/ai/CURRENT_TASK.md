# Current Task — V2-G5 Motion + Micro-Interactions

Status: ready_for_implementation

Baseline commit:

2b72b6f847076349d8900c411b1d77b98cfe945b

Expected baseline:

- V2-F complete
- V2-G1 ongoing Apple workout ingestion complete
- V2-G2 Body Inbox + Shortcut Capture complete
- V2-G3 Theme Packs + Appearance complete
- V2-G4 Nutrition Gemini durable cost safety complete
- 936 tests passing across 109 files
- typecheck, lint, and production build passing
- schema head 0032_body_capture_inbox.sql
- Design manual 1.0.41
- package 1.0.0

Follow AGENTS.md and the persistent files under docs/ai/.

## Objective

Polish the existing Health UI with restrained, consistent motion and tactile interaction feedback without changing navigation semantics, Health data, calculations, or persistence.

This is a presentation-only slice.

The app should feel more responsive and deliberate, especially on mobile, while remaining calm enough for a personal health record.

Core invariant:

Motion may help the owner understand interaction and state change. It must never imply a Health value changed when the underlying data did not.

## Architecture

No migration.

Expected schema head remains:

0032_body_capture_inbox.sql

No new API.

No database persistence.

No localStorage motion preference.

No provider or AI call.

No new runtime dependency or animation library.

Use the existing React, Tailwind 4, CSS, and browser media-query capabilities.

## Existing motion to preserve and rationalize

The app already has:

- .page-enter
- animate-pulse placeholders
- PendingLoadRegion opacity transition
- transition-colors on shared interactive classes
- prefers-reduced-motion CSS that currently disables page-enter and pulse

Do not create a second motion system.

Turn these into one bounded shared motion vocabulary.

## Motion principles

Use short durations.

Recommended ranges:

- press / hover feedback: about 100–150ms
- opacity / local state transitions: about 150–180ms
- page/content entry: about 180ms
- sheet/dialog entry: no more than about 200ms

Avoid long easing or decorative animation.

Preferred easing should feel direct, for example ease-out for entry and standard ease for small state transitions.

Do not add spring physics, bouncing, overshoot, parallax, looping decoration, or celebratory effects.

## Reduced motion is mandatory

prefers-reduced-motion: reduce must disable or effectively eliminate every new nonessential transform/animation/transition introduced by G5.

This includes:

- page entry transforms
- card lift
- button press scale
- sheet/dialog movement
- notice entry
- loading shimmer/pulse where practical
- chart animation if a chart currently animates

The current PendingLoadRegion opacity transition also needs to stop transitioning under reduced motion.

Reduced motion must not hide content or delay state changes.

Do not add a separate Settings toggle in this phase.

OS preference is the authority.

## Shared motion vocabulary

Prefer a small number of reusable classes/tokens rather than page-specific arbitrary durations.

A reasonable shape is:

- motion-interactive
- motion-pressable
- motion-card
- motion-page-enter
- motion-panel-enter
- motion-notice-enter

Names may differ if they fit the repo better.

Keep definitions centralized in src/index.css and/or src/lib/interactive.ts.

Do not scatter @keyframes through feature files.

## Interactive controls

Update the existing shared interactive class constants so common buttons, tabs, cards, and rows receive consistent feedback.

Affected shared classes include at least:

- primaryButtonClass
- secondaryButtonClass
- dangerButtonClass
- quietButtonClass
- interactiveCardClass
- selectedCardClass
- interactiveRowClass
- tabClass
- selectedTabClass
- themeChoiceClass
- themeChoiceSelectedClass

### Press behavior

Buttons and pressable cards may use a very small scale or opacity response while actively pressed.

Keep it subtle.

Example magnitude:

0.98–0.99 scale

Do not reduce touch-target dimensions.

Do not move surrounding layout.

Do not add press scaling to plain text links where it makes reading jittery.

### Hover behavior

On devices that truly support hover and a fine pointer, interactive cards may gain a restrained lift or border/background transition.

Use transform, not margin/top changes, so layout does not move.

Do not make hover lift persist on touch devices.

### Focus

Existing focus-visible outlines remain authoritative.

Motion must not replace focus indication.

Do not animate focus in a way that makes keyboard location harder to see.

## Navigation feedback

Primary desktop tabs and mobile bottom navigation should transition color/background state smoothly.

Do not add an animated sliding indicator that depends on measuring tab positions.

Do not delay navigation.

Do not key the main Outlet in a way that remounts route components merely to force an animation.

That would risk refetching state and is prohibited.

If route-level entry polish is desired, use the existing page-enter convention on rendered content rather than remounting router state.

## Page entry

Refine .page-enter into a subtle content-entry motion.

Suggested effect:

- opacity from roughly 0.85–0.9 to 1
- optional translateY of no more than 3–4px
- around 180ms ease-out

The current 0.55 starting opacity is more dramatic than necessary and may be softened.

Do not animate entire pages from offscreen.

Do not animate Health numbers from zero.

Use page-enter only where content is actually mounting.

Do not add it to continuously updating values in a way that makes normal polling flash.

## Suspense and initial loading

Keep loading immediate and stable.

The generic Suspense text fallback may be upgraded to a shared lightweight placeholder if that reduces abruptness, but:

- no new data fetch
- no artificial delay
- no spinner loop that ignores reduced motion
- no layout explosion

Existing page-specific placeholders should remain useful.

Do not show a skeleton after real content is already available merely for animation.

## PendingLoadRegion

Preserve its current semantic behavior:

- existing content stays visible
- pending state reduces emphasis
- a small progress indicator may appear

Improve consistency with the shared motion tokens.

Under reduced motion:

- do not pulse
- do not fade over time
- switch state immediately

Do not replace actual content with an empty skeleton during a refresh.

## Loading placeholders

Current ListPlaceholder and NutritionPlaceholder use animate-pulse.

Keep the placeholder concept.

Under reduced motion, placeholders remain static.

If adding a custom skeleton animation, do not use aggressive shimmer.

A gentle pulse is sufficient.

No moving gradient is required.

## Panels, sheets, and overlays

Inspect existing overlays/sheets already used by Nutrition and other current features.

For existing bottom sheets or modal-like panels only:

- scrim may fade in
- panel may enter with a small translate/opacity transition
- closing should remain immediate or equivalently short if the component architecture already supports an exit state

Do not build a general modal framework in G5.

Do not delay unmount with timers solely to create exit animation unless the component already has an explicit close state.

Do not break Escape, back, click-outside, or focus behavior.

No new portal architecture.

## Notices and validation feedback

Dynamic success/error/notice blocks may use a very small opacity/translate entry.

Examples:

- import success
- save error
- generated result notice
- retryable AI failure

Do not animate the same persistent error on every render.

Do not shake fields.

Do not flash red/green backgrounds.

Error semantics remain color/text based as before.

## Form feedback

Do not add automatic scrolling or focus movement beyond existing behavior.

Buttons that become busy may transition opacity but:

- must remain disabled according to existing logic
- label changes remain immediate
- no fake progress percentages
- no minimum waiting time

Checkboxes, radios, native inputs, and date controls keep native interaction unless already custom.

## Lists and data changes

Do not animate reordering of health-history lists.

Do not animate deleted items collapsing through neighboring rows.

Do not count numbers up/down.

Do not interpolate:

- weight
- calories
- macro totals
- steps
- sleep duration
- strength
- goal progress
- experiment results
- benchmark values

Data should change immediately to the new deterministic value.

A surrounding card may have normal state-transition styling, but the numeric fact itself is not a motion toy.

## Progress bars

Existing progress bars may smoothly transition their width when the underlying UI state changes, if doing so is already natural in the component.

Rules:

- short duration only
- no from-zero mount animation invented just for show
- reduced motion = immediate width
- width is always driven directly by the real calculated ratio
- no delayed catch-up

Do not change thresholds or colors.

## Charts

Do not introduce new chart animation.

Inspect current Recharts behavior.

If current charts animate by default, make them respect prefers-reduced-motion.

A small shared hook such as usePrefersReducedMotion is acceptable if needed.

Do not change:

- datasets
- scales
- domains
- tooltip semantics
- category colors
- chart calculations

Do not replay chart animation on unrelated React renders.

## Appearance boundary

G3 Theme Packs remain independent of motion.

Motion durations do not vary by palette.

Do not add animated theme transitions between Light/Dark or palettes in this task; instant appearance switching avoids color-flash and contrast problems.

Danger/warning/success semantics stay unchanged.

## Mobile behavior

This app is heavily phone-oriented.

At 390px:

- pressed feedback must not create horizontal overflow
- bottom navigation must remain stable
- fixed action bars must not jump
- safe-area behavior must remain unchanged
- sheet entry must not expose content behind the bottom nav incorrectly

Do not use viewport-width transforms that create sideways scroll.

## Performance

Prefer transform and opacity for motion.

Avoid animating:

- width/height of large layout containers
- top/left positioning
- box-shadow blur over large full-screen areas
- expensive filters

Do not add requestAnimationFrame loops.

Do not add IntersectionObserver-driven reveal animations.

Do not animate long scrolling pages section-by-section.

The app should remain responsive on ordinary mobile Safari/Chrome hardware.

## Accessibility

Maintain:

- focus-visible outlines
- aria-busy behavior
- progressbar labels
- button disabled states
- minimum touch targets
- native scrolling
- pinch zoom

Motion should never be required to understand state.

No content may only be communicated by animation.

## Demo and auth

The same shared interaction styles may apply to:

- owner app
- public demo
- sign-in/reset-password

Demo remains provider-free and read-only.

Do not add demo-only animation code.

## Persistence / backup / privacy

No persistence changes.

No backup/export changes.

No new browser storage.

No Health data enters CSS attributes or animation names.

## Tests required

Add focused tests covering at least:

1. shared primary button includes bounded transition/press behavior.
2. secondary button uses the same motion vocabulary.
3. danger button preserves danger semantics while gaining the shared interaction behavior.
4. quiet buttons do not gain disruptive layout movement.
5. interactive cards use transform-based hover/press feedback rather than margin/top layout changes.
6. touch/mobile does not depend on hover.
7. tab classes transition selected/unselected styling without an animated measured indicator.
8. theme choice controls use shared interaction motion.
9. page-enter duration is bounded around the accepted short range.
10. page-enter initial opacity is restrained rather than 0.55.
11. page-enter transform is no more than a few pixels if present.
12. reduced-motion disables page-enter animation.
13. reduced-motion disables pulse placeholders.
14. reduced-motion disables PendingLoadRegion transition.
15. reduced-motion disables press-scale/lift transforms introduced by G5.
16. ListPlaceholder remains aria-busy and labeled.
17. NutritionPlaceholder remains aria-busy and labeled.
18. PendingLoadRegion preserves aria-busy/progressbar semantics.
19. PendingLoadRegion keeps existing content mounted while pending.
20. no artificial delay or timeout is added to data loading for animation.
21. no router Outlet key/remount trick is introduced.
22. primary navigation remains the same destinations.
23. bottom navigation remains fixed and safe-area aware.
24. current fixed action-bar shell variables remain unchanged.
25. existing modal/sheet close semantics remain unchanged.
26. any panel-entry class is disabled under reduced motion.
27. notices/errors keep semantic text/colors and do not use shake animation.
28. no Health metric count-up/interpolation helper exists.
29. no history-list reorder animation library/helper is introduced.
30. no new chart dataset/calculation behavior.
31. current charts do not animate when reduced motion is requested, if chart animation exists.
32. no animation library dependency is added to package.json.
33. no database/API/env/backup/export change.
34. G3 theme bootstrap remains unchanged in behavior.
35. demo remains API/provider-free.
36. 390px layout contracts remain intact by construction/tests.
37. full G1-G4 and F1-F5 regressions remain green.

Run:

- npm test
- npx tsc -b
- npx eslint .
- npm run build

No migration command.

## Manual QA

1. With normal motion enabled, navigate through Today, Nutrition, Training, Body, Progress, Lab, Ask Health, and Settings.
2. Verify page/list appearance feels subtle rather than theatrical.
3. Tap primary/secondary/danger controls on mobile and verify tactile feedback without layout jump.
4. Hover cards/tabs on desktop and verify subtle feedback.
5. Trigger an in-place pending refresh and verify existing content stays visible.
6. Trigger success/error notices and verify they remain readable and immediate.
7. Open existing Nutrition capture sheets/overlays and verify any added panel motion does not break close behavior.
8. Inspect a Progress chart and verify no misleading data animation was added.
9. Enable OS Reduce Motion.
10. Repeat navigation, button presses, loading placeholders, panels, and charts.
11. Verify state changes remain immediate and nonessential movement disappears.
12. Switch Theme Packs and Light/Dark while motion is normal and reduced; appearance must still switch immediately.
13. Check 390px bottom nav, fixed action bars, and overlays for overflow/jump.
14. Verify sign-in and public demo still render correctly.
15. Run automated validation.

## Documentation

On completion:

- update HEALTH-PLATFORM-DESIGN-MANUAL.md
- expected Design Manual version 1.0.42
- append a historical ledger row; do not rewrite older rows
- update HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md with V2-G5 Motion + Micro-Interactions
- update docs/ai/PROJECT.md
- update docs/ai/DEV_STATE.md
- update docs/ai/DECISIONS.md if a durable motion rule is established
- update docs/ai/ROADMAP.md
- update docs/V2-ROADMAP.md to mark Motion / micro-interactions implemented
- document reduced-motion behavior
- document that Health numeric facts do not animate/interpolate
- document no persistence/API/schema change

Expected schema head:

0032_body_capture_inbox.sql

Package remains:

1.0.0

## Acceptance criteria

V2-G5 is complete only when:

- shared controls have restrained consistent interaction feedback
- page/content entry is subtle
- loading/pending transitions are consistent
- existing sheets/panels may use bounded entry motion without changing behavior
- prefers-reduced-motion removes new nonessential movement
- current PendingLoadRegion transition also respects reduced motion
- charts respect reduced motion if they animate
- no route remount/refetch trick is used for animation
- no numeric Health facts count up/interpolate
- no history list reorder animation is introduced
- no navigation semantics change
- no Health data/calculation change
- no API/database/persistence/backup/export change
- no animation dependency is added
- G3 appearance behavior remains intact
- demo/auth remain functional
- tests pass
- typecheck passes
- lint passes
- production build passes
- docs updated

## Required completion report

Update docs/ai/DEV_STATE.md with:

- baseline commit
- resulting commit / working-tree state
- schema/migration status
- shared motion vocabulary
- interaction classes changed
- page-enter behavior
- pending/loading behavior
- panel/sheet behavior
- notice/form behavior
- chart/reduced-motion behavior
- exact reduced-motion contract
- mobile behavior
- appearance boundary
- persistence/API/backup status
- package/dependency status
- tests/count
- typecheck/lint/build
- manual QA
- docs version
- deviations
- remaining V2-G work

When finished, reset CURRENT_TASK.md to the standard no-active-task template, commit, and push according to AGENTS.md.

## Final invariant

Motion may make Daurham Health feel responsive.

It must never make a Health fact look more certain, more dramatic, or different from the deterministic value that actually exists.
