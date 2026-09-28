# Dev state

Snapshot recorded 2026-09-27 after V2-G5 Motion and micro-interactions. This commit is the current health application.

## Git

- Branch: `main`
- Baseline the task named: `2b72b6f847076349d8900c411b1d77b98cfe945b` (“Put every Nutrition Gemini attempt on the shared AI budget.”)
- Parent of this snapshot: `9bbd905` (“docs: define V2-G5 motion micro-interactions”)
- This commit keeps interaction motion short and turns it off when the system asks for reduced motion
- Finished tasks are committed and pushed
- Local annotated tag `v1.0.0` points at `7124ca513efa6c833457303ee6ff79d78344fce6`. Whether that tag exists on the remote is unknown

## Schema

- Migration head: `0032_body_capture_inbox.sql`
- No migration was added or applied
- Design manual version: 1.0.42
- Package version: 1.0.0
- No new runtime dependency
- V2-F remains complete. V2-G1 through V2-G4 remain implemented. Goal-observation suggestions remain deferred. Overnight vital metrics remain disabled until a payload is verified

## Shared motion vocabulary

- CSS variables on `:root`: `--motion-press` 120ms, `--motion-state` 160ms, `--motion-enter` 180ms, `--motion-panel` 200ms
- Classes live in `src/index.css`: `motion-interactive`, `motion-pressable`, `motion-card`, `page-enter` / `motion-page-enter`, `motion-panel-enter`, `motion-scrim-enter`, `motion-notice-enter`, `pending-load`, `motion-meter`
- No second motion system and no animation library

## Interaction classes changed

- `primaryButtonClass`, `secondaryButtonClass`, `dangerButtonClass`, `themeChoiceClass`, and `themeChoiceSelectedClass` use `motion-pressable`
- `quietButtonClass`, `interactiveRowClass`, `tabClass`, and `selectedTabClass` use `motion-interactive`
- `interactiveCardClass` and `selectedCardClass` use `motion-card`
- Desktop tabs and the mobile bottom nav use `motion-interactive`
- Press scale is `scale(0.985)` on `.motion-pressable:active:not(:disabled)`
- Card press scale is `scale(0.99)`
- Hover lift is `translateY(-1px)` only inside `@media (hover: hover) and (pointer: fine)`
- Sign-in, reset-password, and lock-screen submit buttons keep their zinc colors and now include `motion-pressable`

## Page-enter behavior

- `.page-enter` fades from opacity 0.88 and moves `translateY(3px)` over `--motion-enter` (180ms) ease-out
- The previous 0.55 starting opacity is gone
- Route outlets are not keyed and routes are not remounted to play the animation
- Suspense fallbacks use `RouteFallback`: two pulse bars, `aria-busy`, and `aria-label="Loading"`. There is no delay

## Pending and loading behavior

- `PendingLoadRegion` keeps children mounted inside `.pending-load`
- `data-pending="true"` sets opacity 0.6
- The thin progress bar still uses `animate-pulse`, `role="progressbar"`, and `aria-label="Loading"`
- `ListPlaceholder` and `NutritionPlaceholder` stay as they were

## Panel and sheet behavior

- Nutrition sheets add `motion-scrim-enter` and `motion-panel-enter`
- The panel fades from opacity 0.92 and moves 6px over 200ms
- The scrim fades in over 160ms
- Close stays immediate. Escape, scrim click, focus restore, and `role="dialog"` stay

## Notice and form behavior

- `LoadErrorNotice` adds `motion-notice-enter` and stays `role="alert"` with the existing red text
- The notice animation runs on mount. There is no shake
- Checkboxes, radios, and date inputs stay native
- Health numbers do not count up or interpolate

## Chart and reduced-motion behavior

- `usePrefersReducedMotion` reads `prefers-reduced-motion: reduce`
- Progress line, scatter, and sleep-stage bar charts set `isAnimationActive` from that hook
- The hook is called before any early return
- Chart strokes stay `var(--chart-ink)`. Calculations are unchanged

## Reduced-motion contract

- `prefers-reduced-motion: reduce` sets `animation: none` on `.page-enter`, `.motion-page-enter`, `.motion-panel-enter`, `.motion-scrim-enter`, `.motion-notice-enter`, and `.animate-pulse`
- It sets `transition: none` on `.motion-interactive`, `.motion-pressable`, `.motion-card`, `.pending-load`, and `.motion-meter`
- It sets `transform: none` on press and card hover or active states
- Content stays visible. State changes stay immediate
- There is no Settings toggle and no stored motion preference

## Mobile behavior

- Bottom nav stays `fixed inset-x-0 bottom-0` with `env(safe-area-inset-bottom)`
- Shell variables `--shell-nav-offset`, `--shell-action-bar`, and `--shell-main-pad` are unchanged
- Press and lift use transform and opacity. Meter width is the only width transition
- At 390px the demo bottom nav is 390px wide and the page does not overflow horizontally

## Appearance boundary

- Color mode and palette behavior are unchanged
- Durations do not vary by palette
- Light, Dark, and palette changes stay instant
- Danger, warning, and success stay semantic

## Persistence, API, and backup

- No API, database, backup, or portable-export change
- No motion environment variable
- No `localStorage` motion key
- `ai_usage` stays operational and portable false

## Validation

- Tests: 939 passing across 110 files
- `npx tsc -b` passed
- `npx eslint .` passed
- `npm run build` passed. The existing Vite chunk-size warning remains

## Manual QA

- Demo Today, Nutrition, Training, Body, Progress, Personal Lab, and Ask Health rendered. Nutrition totals stayed the prepared demo values
- Sign-in rendered, and its submit button uses `motion-pressable`. Reset password showed the invalid-link state without a token
- Settings, owner pending refresh, owner notices, and Appearance switches showed the lock screen: “Private Health data”
- At 390px the demo bottom nav stayed fixed and the page did not overflow. Sign-in at 390px did not overflow
- Emulated `prefers-reduced-motion: reduce` set nav and sign-in transitions to `none`
- Live Gemini and owner chart animation were not exercised

## Deviations

- Sign-in, reset-password, and the lock-screen action were custom zinc buttons outside `interactive.ts`. They now include `motion-pressable` so those screens get the same press feedback. Their colors are unchanged
- Suspense fallbacks use `RouteFallback` instead of the text “Loading…”

## Remaining V2-G work

- Native iOS share-sheet targeting is deferred
- Route geometry and nested Health Auto Export workout telemetry stay deferred
- No correction or deletion lifecycle for Health Auto Export workouts
- Goal-observation experiment suggestions and overnight vital metrics remain deferred from earlier slices
