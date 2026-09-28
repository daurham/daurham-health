# Dev state

Snapshot recorded 2026-09-27 after V2-G3 Appearance. This commit is the current health application.

## Git

- Branch: `main`
- Baseline the task named: `00428baac215716f2eee6504a16f53fe1f9bf8bb` (“Keep a Shortcut capture's exact time unless the owner edits it.”)
- Parent of this snapshot: `8b2ad7a` (“docs: define V2-G3 theme packs”)
- This commit adds browser-local color mode and palette preferences
- Finished tasks are committed and pushed
- Local annotated tag `v1.0.0` points at `7124ca513efa6c833457303ee6ff79d78344fce6`. Whether that tag exists on the remote is unknown

## Schema

- Migration head: `0032_body_capture_inbox.sql`
- No migration was added or applied for Appearance
- Design manual version: 1.0.40
- Package version: 1.0.0
- V2-F remains complete. V2-G1 remains implemented. V2-G2 remains implemented, including exact staged-time preservation. Goal-observation suggestions remain deferred. Overnight vital metrics remain disabled until a payload is verified

## Mode preference

- Storage key: `health-theme`
- Allowlist: `system`, `light`, `dark`
- System is the absence of the key. `writeThemePreference('system')` calls `removeItem`
- Stored `light` and `dark` stay as those strings
- An absent or invalid value reads as `system`
- Explicit Light ignores a dark operating system. Explicit Dark ignores a light operating system
- While System is selected, a later `prefers-color-scheme` change updates the document without a reload
- An explicit mode ignores later operating-system changes until the owner chooses System again

## Palette

- Storage key: `health-palette`
- Ids: `classic`, `forest`, `ocean`, `sunset`, `plum`
- An absent or invalid value reads as `classic`
- Writing a palette stores that id, including `classic`
- Removing the key resolves Classic
- Palette does not follow color mode, and color mode does not follow palette

## Pre-render bootstrap

- `index.html` reads only `health-theme` and `health-palette`
- `dark` is stored dark, or anything other than stored light when `prefers-color-scheme: dark` matches
- The palette is applied only after an allowlist check. Unknown values become `classic`
- The script toggles `html.dark`, sets `colorScheme`, and sets `data-health-palette`
- It does not copy an arbitrary stored string into a class name

## ThemeSync

- `src/theme-sync.tsx` still wraps the app from `src/main.tsx`
- Mount applies the stored appearance
- A media-query change applies only when the stored mode is System
- A `window` `storage` event applies `health-theme` and `health-palette`
- Other storage keys are ignored
- A cleared palette key resolves Classic. A cleared theme key resumes System and follows the current media query

## Semantic color and charts

- Palette rules set accent, accent-muted, accent-fg, info, and `--chart-ink`
- `--health-danger`, `--health-warning`, and `--health-success` stay on the base light and dark rules
- Classic light and dark accent values match the previous default
- `--chart-ink` is `var(--health-accent)`. Progress charts already stroke and fill that token. Chart calculations are unchanged

## Settings

- Appearance offers Mode (System, Light, Dark) and Palette (Classic, Forest, Ocean, Sunset, Plum)
- The pressed button is the stored preference, not the resolved `html.dark` class
- With no `localStorage`, static render shows System and Classic pressed
- A choice applies immediately. There is no Save button
- Controls use `aria-pressed`, `min-h-11`, and wrapping grids (`grid-cols-3` for mode, `grid-cols-2` for palette)
- Another tab's `storage` event refreshes the pressed state through the theme helpers

## Demo and auth

- Demo, sign-in, and reset-password use the same document appearance
- Demo stays read-only. It has no separate palette store and does not call an owner API for theme
- Signed-in Settings was not exercised. `/settings` still stops at the owner lock screen

## Persistence

- Only `health-theme` and `health-palette` are stored
- No Health data, auth, owner identity, or page state goes through the theme system
- No theme preference in PostgreSQL, backup, or portable export

## Validation

- Tests: 927 passing across 108 files
- `npx tsc -b` passed as part of `npm run build`
- `npx eslint .` passed
- `npm run build` passed. The existing Vite chunk-size warning remains
- Browser check on the local demo: empty storage with a dark operating system painted Classic dark; explicit Light plus Forest stayed light with the forest accent and the existing danger, warning, and success values; System plus Plum followed the dark operating system; an invalid palette attribute resolved to Classic; Progress charts still use `--chart-ink`
- At 390px, demo Today, Nutrition, Training, Body, Progress, Ask Health, and Lab did not overflow. Sign-in and reset-password rendered. Desktop demo at 927px did not overflow
- Owner Appearance controls were not clicked. The lock screen blocks `/settings`

## Deviations

- System is stored by deleting `health-theme` rather than writing a third value. Existing `light` and `dark` values stay valid
- `readThemePreference` returns `system` when the key is absent. `resolveTheme(null, …)` still follows the operating system

## Remaining V2-G work

- Native iOS share-sheet targeting is deferred
- Route geometry and nested Health Auto Export workout telemetry stay deferred
- No correction or deletion lifecycle for Health Auto Export workouts
- Goal-observation experiment suggestions and overnight vital metrics remain deferred from earlier slices
- Motion and micro-interactions remain deferred
