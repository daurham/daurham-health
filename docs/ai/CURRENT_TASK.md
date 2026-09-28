# Current Task — V2-G3 Theme Packs + Appearance

Status: ready_for_implementation

Baseline commit:

00428baac215716f2eee6504a16f53fe1f9bf8bb

Expected baseline:

- V2-F complete
- V2-G1 ongoing Apple workout ingestion complete
- V2-G2 Body Inbox + Shortcut Capture complete, including exact staged-time preservation
- 923 tests passing across 108 files
- typecheck, lint, and production build passing
- schema head 0032_body_capture_inbox.sql
- Design manual 1.0.39
- package 1.0.0

Follow AGENTS.md and the persistent files under docs/ai/.

## Objective

Implement the planned post-v1 Theme Packs / personalization slice without changing Health data semantics.

Appearance becomes two independent browser-local preferences:

1. color mode
   - System
   - Light
   - Dark

2. palette
   - Classic
   - Forest
   - Ocean
   - Sunset
   - Plum

The palette changes visual accent/chrome styling only.

It must not change the meaning of Health status colors, data, thresholds, analytics, or chart values.

## Architecture

No migration.

Expected schema head remains:

0032_body_capture_inbox.sql

No owner API.

No database persistence.

No backup/export change.

No AI/provider call.

Appearance stays device/browser-local through localStorage.

This is intentional: appearance is UI preference, not canonical Health data.

## Existing behavior to preserve

The app already has:

- pre-render dark/light initialization in index.html
- src/theme.ts
- ThemeSync
- current health-theme localStorage key
- CSS semantic accent variables
- dark-mode Zinc remapping
- reduced-motion support
- Settings → Appearance

Do not create a parallel theme system.

Extend the current one.

## Color mode

Current behavior treats absence of health-theme as system-following but Settings cannot explicitly return to System once Light/Dark is chosen.

Make System a first-class UI choice.

Allowed mode preference:

- system
- light
- dark

Backward compatibility:

- existing stored health-theme=light remains Light
- existing stored health-theme=dark remains Dark
- absent/invalid value resolves to System

It is acceptable to keep the existing health-theme key.

Prefer storing System by removing the key rather than persisting a third legacy-incompatible value, unless the existing helper architecture is cleaner with an explicit system value.

Whichever representation is chosen, document it and test it.

### System behavior

When mode is System:

- initial paint follows prefers-color-scheme
- live OS theme changes update the app
- no reload required

When mode is Light or Dark:

- OS changes do not override the explicit selection

Switching back to System resumes live OS following.

## Palette

Add a new browser-local preference key, preferably:

health-palette

Allowed palette ids:

- classic
- forest
- ocean
- sunset
- plum

Classic is the current visual identity.

If the palette key is absent or invalid:

classic

Use stable lowercase machine ids.

Do not derive palette from mode.

Mode and palette combine independently.

Examples:

- Forest Light
- Forest Dark
- Plum System
- Classic Dark

## Pre-render bootstrap

Update index.html so the correct mode and palette are applied before React mounts.

This is important.

Do not introduce:

- white flash before Dark
- Classic flash before a stored palette
- React-only post-paint palette application

The inline bootstrap must:

- read only the known localStorage keys
- validate values against the bounded allowlist
- resolve System through matchMedia
- apply dark class
- apply colorScheme
- apply palette identity on documentElement

Prefer a data attribute such as:

data-health-palette="forest"

Do not insert user-controlled arbitrary strings into class names or CSS.

The React theme helpers and the inline bootstrap must implement the same bounded semantics.

Avoid a generated source-of-truth build step just for this tiny bootstrap; instead add tests that assert the bootstrap allowlist/behavior remains aligned with the TypeScript contract.

## Theme domain API

Refactor src/theme.ts into a clear deterministic contract.

Suggested conceptual types:

ThemeModePreference = 'system' | 'light' | 'dark'
ResolvedColorMode = 'light' | 'dark'
HealthPalette = 'classic' | 'forest' | 'ocean' | 'sunset' | 'plum'

Suggested responsibilities:

- read mode preference
- write mode preference
- resolve color mode
- read palette preference
- write palette preference
- apply appearance to document root
- sync OS color-mode changes when System is active

Do not make React components duplicate localStorage parsing.

Do not make CSS infer preference state.

## DOM contract

The document root should expose resolved appearance predictably.

For example:

- html.dark for resolved dark mode
- html[data-health-palette="forest"] for palette

Optional accessibility/debug attributes are fine if bounded.

Do not put private Health information into the DOM attributes.

## Palette semantics

Theme packs primarily change accent styling.

Preserve the semantic meaning of:

- danger
- warning
- success
- clinical/health status cues already using those tokens

Do not make a Theme Pack convert danger red into decorative purple, for example.

At minimum each palette may define:

- --health-accent
- --health-accent-muted
- --health-accent-fg
- --health-info if appropriate
- --chart-ink

Keep:

- --health-danger
- --health-warning
- --health-success

semantically stable across palettes unless a contrast-only adjustment is required between Light and Dark.

The palette is visual personalization, not semantic recoloring.

## Palette design

Implement five restrained palettes that fit the existing Health UI.

Use CSS custom properties and existing semantic Tailwind mappings.

Do not scatter palette-specific utility classes through pages.

### Classic

Must reproduce the existing current accent closely enough that users who never choose a palette see no meaningful visual regression.

### Forest

Green/teal leaning accent, distinct from success.

Do not choose a hue/lightness combination that makes ordinary accent controls indistinguishable from success messages.

### Ocean

Blue/cyan leaning accent, distinct from Classic.

### Sunset

Warm orange/coral leaning accent.

Do not collide visually with warning/danger states.

### Plum

Purple/plum leaning accent.

### Light and Dark variants

Each palette needs deliberate values for both resolved modes.

Do not assume one accent value will have sufficient contrast on both.

Use the current oklch/CSS-variable approach where practical.

## Accessibility

Maintain accessible control contrast.

At minimum verify:

- accent button foreground against accent background
- selected-tab foreground against accent
- focus ring visibility
- accent-muted selection contrast
- link/accent visibility on both zinc light and dark surfaces

Do not encode selected/unselected state by color alone when the existing component already provides aria-pressed or structural state.

Appearance controls must use aria-pressed correctly.

Keyboard focus behavior remains intact.

Do not remove pinch zoom.

## Chart behavior

Charts should inherit the palette through existing chart semantic variables.

Do not edit every Recharts component individually if they already use --chart-ink or semantic helpers.

Verify charts that currently use the accent change with the palette.

Do not recolor data series that have established category semantics merely to force the theme.

No chart values, domains, scales, or data logic may change.

## Settings UI

Expand Settings → Appearance.

Preferred structure:

Appearance

Mode
[ System ] [ Light ] [ Dark ]

Palette
[ Classic ] [ Forest ] [ Ocean ] [ Sunset ] [ Plum ]

The selected choices should be obvious via existing selected styles and aria-pressed.

Changing either preference applies immediately.

No Save button.

Show short restrained labels only. Do not add marketing copy for each palette.

At 390px there must be no horizontal overflow.

Use responsive wrapping/grid rather than tiny tap targets.

Minimum touch targets remain consistent with the existing 44px-ish controls.

## Preference state correctness

Settings must display the actual preference, not merely the current resolved dark/light class.

Example:

- stored mode = System
- OS currently dark

Settings must show System selected, not Dark.

This is a key acceptance requirement.

The resolved mode and the user preference are different concepts.

Likewise, invalid/absent palette storage should show Classic.

## Cross-tab/browser synchronization

Add storage-event synchronization for appearance preferences.

If another tab changes:

- health-theme
- health-palette

the current tab should update appearance without reload.

For mode:

- if the incoming preference becomes System, resume OS media-query following
- if explicit Light/Dark, resolve immediately

For palette:

- apply validated palette immediately
- invalid/removed palette resolves Classic

Do not poll localStorage.

## Demo and auth surfaces

Appearance is global browser chrome.

The selected mode/palette may apply to:

- owner app
- public demo
- sign-in/reset-password

That is acceptable.

Demo remains read-only and makes no owner API call.

Do not create a separate demo palette store.

## Persistence and privacy

Only these small UI preferences are stored locally.

Do not persist:

- Health data
- auth info
- owner identity
- page state

through the theme system.

No theme preference belongs in PostgreSQL, backup, or portable export.

## Reduced motion

Do not add new motion in G3.

Existing page-enter and reduced-motion behavior remain unchanged.

The separate Motion / micro-interactions roadmap slice remains deferred.

## No style rewrite

This is not a wholesale design-system rewrite.

Do not:

- replace Tailwind
- redesign every card
- rename all zinc utilities
- introduce a component library
- change navigation structure
- add gradients/background illustrations
- add per-page themes

The goal is bounded personalization using the semantic tokens that already exist.

## Tests required

Add focused tests covering at least:

1. allowed mode values.
2. absent mode means System.
3. existing stored light remains Light.
4. existing stored dark remains Dark.
5. invalid stored mode falls back to System.
6. System resolves from prefers-color-scheme.
7. explicit Light ignores prefers-dark.
8. explicit Dark ignores prefers-light.
9. switching System follows later media-query changes.
10. explicit mode does not follow later media-query changes.
11. allowed palette values.
12. absent palette => Classic.
13. invalid palette => Classic.
14. each palette can be written/read deterministically.
15. apply appearance toggles html.dark correctly.
16. apply appearance sets colorScheme correctly.
17. apply appearance sets a bounded data-health-palette value.
18. palette application cannot emit an arbitrary stored string.
19. pre-render bootstrap understands the same five palettes.
20. pre-render bootstrap preserves existing light/dark backward compatibility.
21. Settings shows System when System is preferred even if resolved mode is dark.
22. Settings shows the stored palette.
23. mode buttons use aria-pressed.
24. palette buttons use aria-pressed.
25. changing mode applies immediately.
26. changing palette applies immediately.
27. storage event for mode updates appearance.
28. storage event for palette updates appearance.
29. removing palette storage resolves Classic.
30. System mode storage event resumes media-query following.
31. CSS contains Light and Dark values for all five palette ids.
32. danger/warning/success remain semantic and are not palette-specific theme identities.
33. Classic retains current default appearance contract.
34. chart semantic ink follows palette token without changing chart calculations.
35. demo uses the same appearance system without API/provider calls.
36. no database/API/backup/export change.
37. no new motion behavior.
38. 390px Appearance controls do not require horizontal scrolling by construction/testable layout contract.
39. existing theme behavior regressions remain green.
40. full G1/G2/F1-F5 regressions remain green.

Run:

- npm test
- npx tsc -b
- npx eslint .
- npm run build

No migration command.

## Manual QA

1. Start with empty localStorage.
2. Verify Settings shows System + Classic.
3. Toggle OS dark/light and verify System follows live.
4. Choose Light; toggle OS; verify app stays Light.
5. Choose Dark; toggle OS; verify app stays Dark.
6. Switch back to System; verify app immediately follows OS.
7. Try Classic, Forest, Ocean, Sunset, Plum in Light.
8. Repeat palettes in Dark.
9. Reload each non-default combination and verify no visible Classic/Light flash before React.
10. Open a second tab, change mode/palette, verify first tab updates from storage events.
11. Inspect Today, Nutrition, Training, Body, Progress, Lab, Ask Health, Settings, and demo for unreadable controls.
12. Verify danger/warning/success states still read semantically.
13. Verify charts use the selected accent where expected.
14. Verify 390px Settings layout.
15. Verify sign-in and demo do not break.
16. Run automated validation.

## Documentation

On completion:

- update HEALTH-PLATFORM-DESIGN-MANUAL.md
- expected Design Manual version 1.0.40
- append a historical ledger row; do not rewrite older rows
- update HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md with V2-G3 Theme Packs
- update docs/ai/PROJECT.md
- update docs/ai/DEV_STATE.md
- update docs/ai/DECISIONS.md
- update docs/ai/ROADMAP.md
- update docs/V2-ROADMAP.md live status
- document browser-local persistence
- document System/Light/Dark preference vs resolved mode
- document palette ids and semantic-color boundary
- keep Motion / micro-interactions deferred

Expected schema head:

0032_body_capture_inbox.sql

Package remains:

1.0.0

## Acceptance criteria

V2-G3 is complete only when:

- System, Light, Dark are explicit appearance choices
- System genuinely follows live OS changes
- existing stored Light/Dark preferences remain compatible
- Classic, Forest, Ocean, Sunset, Plum are available
- mode and palette are independent
- preferences apply immediately
- preferences apply before React paint on reload
- Settings reflects preference rather than merely resolved mode
- another tab can update appearance through storage events
- invalid localStorage values fail closed to System/Classic
- palette values are allowlisted
- semantic danger/warning/success meanings are preserved
- charts inherit palette only through semantic styling
- no Health data/calculation changes
- no database/API/backup/export changes
- demo/auth surfaces remain functional
- reduced-motion behavior is unchanged
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
- mode preference representation
- palette storage representation
- pre-render bootstrap behavior
- ThemeSync behavior
- storage-event behavior
- System-mode media-query behavior
- exact palette ids
- semantic-color boundary
- chart behavior
- Settings UI
- demo/auth behavior
- persistence/backup/export
- tests/count
- typecheck/lint/build
- manual QA
- docs version
- deviations
- remaining V2-G work

When finished, reset CURRENT_TASK.md to the standard no-active-task template, commit, and push according to AGENTS.md.

## Final invariant

Theme Packs may change how Daurham Health looks.

They must never change what Health data means.
