# Current task

## V2-H4 — Experience System: Themes, Today Hierarchy, Progression, Motion, and Final UX Polish

### Why this phase exists

H1–H3 added substantial Health capability: Goals, Personal Lab, Coach, Stretch Quests, expanded Training measurements/routines, XP, and the Reward Wallet. The product is now functionally rich, but the high-frequency owner experience does not yet communicate that richness well.

The current UI has several specific problems:

- Today gives Coach too much first-load visual weight.
- An offered/active Stretch Quest can visually displace the Daily Quest even though the Daily Quest is the most immediate commitment.
- Coach exposes too much explanation, baseline/target detail, verification copy, and action chrome before the owner asks for it.
- Nutrition should be the primary first-load Today surface, but it currently competes equally with Coach and Training.
- XP is rendered in the same neutral gray vocabulary as ordinary metadata, so the reward system has little visual identity.
- Rewards exists at `/rewards`, but it is not globally discoverable. The owner reasonably expects the current spendable XP balance near Settings.
- Progress arrows currently describe direction but do not visually communicate whether that direction is toward or away from the owner's own goals.
- The existing Appearance system is only an accent-palette swap. It does not yet create genuinely distinct, durable themes.
- Existing motion is useful but deliberately minimal. The app still feels static and monotone because meaningful events such as earning XP, completing a quest, leveling up, unlocking a theme, or redeeming a reward have almost no personality.
- Too many secondary cards use the same border/background/text treatment, so important information and mundane information compete at the same visual level.

H4 is not a page-by-page reskin. It is the final experience-system pass that decides:

1. what deserves attention immediately,
2. what stays compact until requested,
3. what deserves semantic color,
4. how progression is visible without becoming noisy,
5. how themes change the whole application's personality rather than only one accent,
6. how motion celebrates meaningful state changes without animating Health facts or becoming distracting.

The guiding product rule is:

> **Default surfaces answer “what matters now?”; explanation and evidence appear through progressive disclosure.**

The phase may be implemented as H4A/H4B/H4C/H4D commits or branches for safety, but do not declare H4 complete after only one slice. If implementation size requires another named phase, preserve every requirement below rather than silently trimming the visual/UX scope.

---

# H4A — Design-system and theme foundation

## 1. Preserve existing product invariants

H4 is primarily presentation/progression work. Preserve:

- canonical Health facts and all existing domain authorities;
- America/Phoenix calendar behavior;
- owner-only private routes and anonymous synthetic `/demo`;
- one Vercel function;
- H3 append-only XP accounting;
- Lifetime XP vs Spendable XP semantics;
- Coach completion as the only XP issuance boundary;
- Goals as the canonical target authority;
- reduced-motion accessibility;
- no background model/provider calls;
- no new paid service;
- no new required environment variable.

H4 should require **no database migration**. Repository schema head remains `0039_xp_reward_wallet.sql`.

Presentation-only preferences may use browser storage in the same spirit as Appearance. They are not Health facts and are not included in backup/portable export.

## 2. Replace “palette” thinking with a durable theme-pack system

The current `health-theme` Light/Dark/System preference remains separate from the visual pack.

Keep the existing `health-palette` storage key for backward compatibility if practical, but evolve its meaning from “accent palette” to a full **theme pack**. Existing stored ids must continue to work.

A theme pack must be declarative and addable from one catalog/config definition without touching individual pages.

Each pack should provide, for both light and dark resolved modes where needed:

- primary accent;
- accent-muted surface;
- secondary accent;
- app canvas/background;
- normal surface;
- raised/interactive surface;
- subtle tinted surface;
- border/divider;
- primary and muted text when a pack needs a tint;
- chart primary + supporting chart colors;
- progress/meter treatment;
- navigation active treatment;
- XP/reward color and XP-soft background;
- optional glow;
- optional hero/background gradient;
- optional abstract decorative motif metadata;
- focus-ring treatment.

Do **not** let decorative themes redefine danger/warning/success meanings.

Goal-direction semantics and error/warning/success semantics remain stable across themes.

### Theme implementation constraint

The app currently has many hard-coded Zinc/White utility classes. Do not manually restyle every card.

Create a semantic theme bridge so existing shared surfaces inherit the pack. Use CSS variables/shared surface primitives and, where safe, map the existing neutral utility scale to subtly themed surfaces.

The theme system should make the whole app feel meaningfully different while keeping contrast/readability predictable.

Prefer:

- shared semantic surface classes/components;
- CSS custom properties;
- theme catalog data;
- minimal component-specific overrides.

Avoid:

- hundreds of per-theme component classes;
- remote images;
- remote fonts;
- copied franchise logos/art;
- canvas particle engines;
- a theme-specific fork of page markup.

## 3. Theme catalog

Existing packs remain permanently unlocked so an existing preference can never become invalid:

- Classic
- Forest
- Ocean
- Sunset
- Plum

Add a large first progression catalog. Theme names and visuals may evoke the owner's requested inspirations, but use original abstract presentation rather than copied copyrighted imagery/logos.

Initial target catalog:

### Always available
- **Classic** — restrained neutral/blue baseline.
- **Forest** — deep teal/green organic surfaces.
- **Ocean** — blue/cyan, crisp and open.
- **Sunset** — coral/orange warmth.
- **Plum** — plum/violet.
  
### Progression unlocks
- **Aura** — electric violet/cyan, soft energy glow.
- **Saiyan Dawn** — deep royal blue + orange/gold energy.
- **Grand Line** — ocean blue + warm red/gold adventure treatment.
- **Hidden Leaf** — warm orange + deep charcoal + restrained green.
- **Super Saiyan Gold** — gold/yellow energy against navy/charcoal.
- **Spartan** — olive/steel with cyan HUD-like accents.
- **Namek Sky** — green, blue, and lavender atmosphere.
- **Wasteland** — amber/olive/terminal-green utilitarian treatment.
- **Bonfire** — charcoal/ash with ember orange.
- **Clone Legion** — clean white/slate with blue tactical accent.
- **Silver Instinct** — silver/cyan/indigo, highest-energy prestige pack.

This intentionally includes several Dragon-Ball-inspired directions plus One Piece, Naruto, Halo, Fallout, Dark Souls, Star Wars/Clone, and generic Aura/Ocean directions discussed during design. Treat them as color/motion inspirations only; do not import protected artwork or logos.

The catalog architecture must make adding future packs cheap.

## 4. Theme Studio in Settings

Replace the current small palette selector experience with a real **Theme Studio** / Appearance section.

Keep mode selection:

- System
- Light
- Dark

Below it, show a responsive theme gallery with:

- theme name;
- miniature live preview using that pack's actual tokens;
- current/selected state;
- unlocked/locked state;
- unlock requirement where applicable;
- one short flavor line, not a paragraph.

Locked themes are visible so progression has a destination.

A locked theme can be previewed in its mini-card but cannot become the active selection through normal UI until unlocked.

Do not hide the existing basic themes behind progression.

Theme selection remains a presentation preference and does not spend XP.

---

# H4B — Progression shell, Today information hierarchy, and Coach redesign

## 5. Progression v1

Build progression deterministically from **Lifetime XP**, not Spendable XP.

Spending rewards must never make the owner lose a level/theme.

Version the rule in shared domain code as something like `progression-v1`.

### Level curve

Level 1 starts at 0 Lifetime XP.

The XP required to advance from level `L` to `L + 1` is:

`50 × (L + 1)`

This produces cumulative thresholds:

- Level 1: 0 XP
- Level 2: 100 XP
- Level 3: 250 XP
- Level 4: 450 XP
- Level 5: 700 XP
- Level 6: 1,000 XP
- Level 7: 1,350 XP
- Level 8: 1,750 XP
- Level 9: 2,200 XP
- Level 10: 2,700 XP
- Level 11: 3,250 XP
- Level 12: 3,850 XP

Continue the same formula above Level 12.

Expose shared deterministic helpers for:

- current level;
- current-level floor;
- next-level threshold;
- XP progress within level;
- percent to next level;
- newly unlocked theme ids at a level;
- next locked theme.

### Theme unlock mapping

- Level 2 — Aura
- Level 3 — Saiyan Dawn
- Level 4 — Grand Line
- Level 5 — Hidden Leaf
- Level 6 — Super Saiyan Gold
- Level 7 — Spartan
- Level 8 — Namek Sky
- Level 9 — Wasteland
- Level 10 — Bonfire
- Level 11 — Clone Legion
- Level 12 — Silver Instinct

Existing five themes remain unlocked at Level 1.

Unlocks are derived from Lifetime XP and do not create ledger entries.

## 6. Global XP / wallet discoverability

Add a compact owner-only XP chip in the top-right shell **beside Settings**, exactly where the owner expected to find it.

Desktop target:

`✦ 175 XP   Settings   Sign out`

The number is **Spendable XP** because it answers “what can I use right now?”

Accessible label/copy must make that meaning clear.

The chip links to `/rewards`.

On mobile:

- keep the XP chip visible in the header rather than hiding it inside the Menu;
- Settings/Sign out may remain in Menu;
- do not make the header overcrowded.

Add a lightweight owner reward-summary read path if needed so the shell does not fetch the full reward catalog/history merely to show two balances.

Demo and anonymous routes must not call the owner wallet endpoint.

Wallet mutations and Coach XP awards should invalidate/refetch the chip through the app's existing event/resource style rather than page reloads.

## 7. XP gets a visual identity

Introduce a semantic XP/reward token and shared `XpBadge` / `XpAmount` presentation.

XP should no longer use ordinary zinc metadata styling.

Default direction:

- warm gold/amber reward identity;
- theme packs may tune the exact hue/glow while preserving readability and “reward” meaning;
- XP amounts use a small spark/star motif and compact pill/badge where appropriate.

Use it for:

- Coach reward labels;
- wallet chip;
- reward costs;
- XP activity feed;
- quest-completion acknowledgement;
- level/theme-unlock presentation.

Do not use the XP color for warnings or ordinary monetary/nutrition values.

## 8. Today page hierarchy

Nutrition becomes the first-load hero.

### Desktop / wide tablet

Use an intentional asymmetric first section rather than equal-weight cards.

Preferred structure:

- Today/date at top left;
- Ask Health + Refresh as compact header actions, not their own row;
- primary content grid around **2fr / 1fr**:
  - left: Nutrition hero;
  - right: compact Coach mission card, then Training;
- normal secondary content follows below.

Nutrition should visually own the page without becoming enormous.

### Mobile

Order should be:

1. Today header
2. Nutrition hero
3. Coach compact missions
4. Training
5. only then the less immediate daily/secondary surfaces

A normal Stretch Quest must never push Nutrition below a large block of Coach prose.

### Needs attention

Do not let ordinary pending items become another giant competing hero.

Use a compact attention strip/list after the first high-priority area, except for a truly blocking/error state that legitimately needs to interrupt.

## 9. Coach on Today becomes a compact mission summary

The existing Coach state/lifecycle stays authoritative. H4 changes presentation, not task-generation logic.

### The key behavior change

**Daily Quest is always visible when it exists.**

An offered or active Stretch Quest must never visually replace/hide the Daily Quest on Today.

The old `selectPrimaryCoachItem` priority may continue to be useful for inbox/attention logic, but Today must no longer render only one giant “winner.”

### Default compact card

The default Coach surface should look like a small mission list, not a detailed brief.

Render up to the relevant rows in this order:

1. **Today** / Daily Quest
2. **Stretch**
3. **This week** / Weekly Focus

Lab due items may appear as a compact count/badge/link rather than displacing those rows.

Each row should contain roughly:

- concise type label/icon;
- one-line mission title or generic summary;
- colored XP badge;
- compact state/progress/expiry metadata;
- chevron/disclosure cue.

Avoid multiple explanatory paragraphs in the default card.

Target: no more than about two text lines per mission row.

### Daily Quest treatment

Daily is the most immediate commitment.

If active, it should be the first row and visually strongest mission in Coach.

A single obvious fast action such as `Log` may remain directly accessible when it genuinely saves a frequent tap. Secondary actions/details stay in the disclosure panel.

If completed today, keep a compact completed/check state rather than hiding it immediately.

### Stretch treatment

On the collapsed Today card, do not print:

- e1RM explanation;
- baseline paragraphs;
- target explanation paragraphs;
- verification explanation;
- full expiry explanation;
- Accept + Pass + other action cluster.

Collapsed example semantic shape:

`Stretch · Bench Press · +100 XP`
`Beat 122.5 lb e1RM · Offer ends Oct 1`

Tap/open reveals the existing detailed explanation, baseline, target, rules, and actions.

### Weekly treatment

Always show the weekly mission when one exists, beneath Daily/Stretch, in one concise row.

Do not allow Weekly to become a second long card.

### Disclosure

Use a sheet/dialog/drawer with the full task detail and existing safe actions.

Progressive disclosure should preserve all information currently available; it simply moves explanation behind intent.

The existing Coach inbox may be redesigned/reused rather than creating several competing modal systems.

### Completion behavior

When a mission completes:

- show a brief celebratory state;
- show the XP earned;
- collapse it to a compact completed row or acknowledgement;
- do not leave a large prose block occupying Today after the meaningful action is over.

## 10. Card hierarchy and “noise budget”

Create a small shared surface vocabulary rather than treating every white rectangle equally.

At minimum support semantic visual roles such as:

- `hero`
- `standard`
- `compact`
- `quiet`
- `attention`

Use them on high-frequency surfaces first.

Do not start a giant rewrite of every historical page.

The goal is for shared tokens/primitives to improve secondary pages naturally while H4 hand-tunes only:

- shell;
- Today;
- Coach;
- Rewards/progression;
- Progress/Goal-aware trend signals;
- Settings Theme Studio.

Reduce repetitive all-caps metadata and unnecessary nested headings where they add noise.

---

# H4C — Personalized trend semantics

## 11. Direction is not inherently good or bad

Do not make “up” green or “down” red globally.

A Health trend is only favorable/unfavorable relative to an explicit owner intent.

Examples:

- increasing strength can be toward a strength Goal;
- decreasing pace seconds/mile can be toward a pace Goal;
- decreasing waist can be toward a waist Goal;
- decreasing bodyweight can be toward a loss Goal but away from a gain Goal;
- a weight increase with no owner Goal/preference is simply higher, not bad.

Use labels like:

- toward goal;
- away from goal;
- neutral/no preference;
- within target / target satisfied where existing Goal status already knows that.

Avoid moralized “good/bad” health language.

## 12. Active Goals are the strongest semantic authority

Build shared deterministic trend-intent logic from existing active Goals.

For a matching active Goal:

### `at_least`
- higher trend = toward goal
- lower trend = away from goal

### `at_most`
- lower trend = toward goal
- higher trend = away from goal

This correctly handles pace because a faster pace is a lower sec/mi value.

### `range`
Use the current canonical value relative to the target range:

- below range: higher is toward, lower is away;
- above range: lower is toward, higher is away;
- inside range: do not treat either generic direction as automatically favorable; use neutral/within-target presentation unless an existing Goal-status rule says otherwise.

### Ambiguity
If several active matching Goals imply conflicting directions, fail neutral.

Do not invent a winner.

## 13. “Personalize trend colors” questionnaire

The owner previously expected a questionnaire-like way to personalize arrow color even where no formal active Goal exists. H4 should make this discoverable without creating a second canonical Health-goal system.

Add a short **Personalize trend colors** presentation questionnaire, reachable from Settings and from Progress when no relevant personalization exists.

It is presentation-only.

Suggested initial preferences:

- Bodyweight: Lower / Maintain-neutral / Higher / No preference
- Body fat: Lower / Maintain-neutral / Higher / No preference
- Waist: Lower / Maintain-neutral / Higher / No preference
- Strength: Higher / No preference
- Activity steps: Higher / No preference

Do not add simplistic “more is always better” preferences for metrics such as sleep duration unless a supported explicit Goal exists.

Store this in versioned local presentation storage such as `health-trend-intent-v1`.

It is not:

- canonical Health data;
- a Coach target;
- a Goal;
- backup data;
- portable export data.

**Precedence: active formal Goal > trend-color preference > neutral.**

This gives the owner the originally expected personalization without letting a questionnaire silently override a real Goal.

Provide Reset/Clear.

## 14. Shared trend signal component

Create a shared `TrendSignal` / direction presentation used by high-frequency Progress and Today trend surfaces.

It must combine:

- arrow/direction;
- semantic intent state;
- accessible text/label;
- semantic color.

Suggested semantic tokens:

- toward-goal
- away-from-goal
- neutral
- within-target

Do not rely on color alone.

Apply it first to the current places where arrows/trend-direction copy are visible, including:

- Today “What changed” direction arrows;
- Progress Overview trend/arrow presentation;
- relevant Body/Strength compact trend indicators where the underlying metric can be matched safely.

Do not recolor a metric if identity/Goal matching is uncertain.

---

# H4D — Lively motion, progression moments, Rewards polish, and final personality

## 15. Motion philosophy

The current G5 motion system is the foundation, not something to discard.

Expand it with **event-driven motion**, not constant motion.

The app should feel alive when something meaningful happens and calm while the owner is reading data.

### Good motion targets

- opening/closing Coach details;
- compact mission row expansion;
- XP earned;
- mission completed;
- Spendable XP changing after redeem/refund;
- level up;
- theme unlocked;
- theme selected;
- reward redeemed;
- progress-to-next-level meter update.

### Avoid

- infinite bouncing;
- looping pulsing on ordinary cards;
- continuously moving backgrounds;
- animated Health measurement counters;
- confetti on routine page loads;
- animation merely because a number changed during a refresh.

Health numbers remain stable. XP/progression is allowed to animate because it is game state, not a Health measurement.

## 16. Celebration grammar

Create a small reusable celebration vocabulary rather than custom one-off animations.

### XP earn
On a confirmed Coach completion:

- compact `+25 XP` / `+100 XP` toast or chip;
- quick scale/fade or glow;
- wallet chip can pulse once;
- no modal for routine XP.

### Mission complete
- check/reward accent;
- brief border/surface wash;
- then settle into compact completed state.

### Reward redemption/refund
- Spendable XP transitions visually;
- redeemed reward gets a short confirmation;
- refund gets a clear but quieter return animation.

### Level up
This is rare enough to deserve a larger moment:

- small overlay/sheet/banner;
- “Level N”;
- Lifetime XP context;
- newly unlocked theme(s);
- action to preview/open Theme Studio.

### Theme unlock
Use a short themed radial wash/glow/spark treatment.

Do not use heavy JS particles. CSS pseudo-elements or a tiny bounded DOM treatment are enough.

### Reduced motion
With `prefers-reduced-motion: reduce`:

- no travel/scale/spark animation;
- state changes still appear immediately;
- celebration copy and color remain;
- no action is delayed waiting for an animation.

## 17. Optional theme personality

Themes may vary subtle decorative personality through tokens, for example:

- gradient direction;
- glow strength;
- card tint;
- chart palette;
- XP glow;
- abstract motif.

Do not make interaction timings radically different per theme. Motion grammar should stay predictable.

Do not use copyrighted logos, character art, faction marks, or sound clips.

No audio in H4.

## 18. Rewards page progression polish

Keep H3's wallet accounting and reward CRUD unchanged.

Improve the top of `/rewards` so the page explains the two economies:

### Spendable
Primary wallet number.

### Lifetime / Level
Progression number that never decreases when rewards are redeemed.

Add:

- current Level;
- Lifetime XP;
- progress to next Level;
- next theme unlock;
- link to Theme Studio.

Reward costs use the XP semantic color.

Recent XP activity should be easier to scan by entry type without relying on color alone.

## 19. Theme-selection moment

Selecting a theme should feel immediate:

- preview/apply without page reload;
- brief restrained transition between surface/accent tokens;
- no flash to default;
- current theme clearly marked.

Mode and pack remain independent:

- System/Light/Dark determines resolved color mode.
- Theme pack determines personality.

Changing System/Light/Dark must preserve the chosen pack.

## 20. App personality without clutter

H4 should make the app feel intentionally designed, not merely colorful.

Use:

- stronger spacing hierarchy;
- deliberate card roles;
- a small, consistent icon/motif vocabulary where useful;
- concise labels;
- theme-tinted surfaces;
- reward identity;
- meaningful motion;
- progressive disclosure.

Avoid:

- emoji-heavy UI;
- gimmicky gamer terminology everywhere;
- gradients on every card;
- excessive shadows;
- permanent glow around ordinary Health data;
- turning every module into a mini-game.

The app is still a serious personal Health tool. The personality comes from hierarchy, reward/progression moments, and selectable themes.

---

# Shared architecture expectations

## 21. New shared presentation/domain modules

Exact names may vary, but prefer shared code for concepts such as:

- progression rules / levels / unlocks;
- theme pack catalog;
- XP badge/amount;
- wallet summary hook/resource;
- semantic Surface/Card primitive;
- TrendSignal;
- trend-intent resolution;
- presentation questionnaire storage;
- progression/XP UI event notification.

Do not duplicate progression math in React components.

Do not duplicate Goal-direction logic in Today and Progress.

## 22. Wallet summary read

If the existing `GET /api/rewards` response is unnecessarily heavy for global shell usage, add a small owner-only read route such as:

`GET /api/rewards/summary`

It may return only:

- Spendable XP;
- Lifetime XP.

Level/theme unlocks remain deterministic shared-domain derivations.

The summary route must keep H3 reconciliation/idempotency semantics and owner auth.

No machine token access.

## 23. Presentation event coordination

The header wallet should react when:

- Coach creates a new XP award;
- a reward is redeemed;
- a reward is refunded.

Use a small explicit event/resource invalidation contract. Do not add a polling loop.

A page refresh must never be required merely to see the updated XP chip.

---

# Accessibility and UX safety

## 24. Color

- Maintain readable contrast in every theme and both light/dark modes.
- Goal intent may not be communicated by color alone.
- XP may not be communicated only by gold color; include `XP` text/icon.
- Semantic danger/warning/success remain recognizable across themes.
- Locked/unlocked themes need text/icon state, not only opacity.

## 25. Motion

- Respect `prefers-reduced-motion`.
- No animation may block a mutation from completing.
- No animation may block navigation.
- No essential information appears only during a transient animation.
- Avoid vestibular large-distance motion.

## 26. Keyboard/touch

- Mission rows and theme cards must have clear focus states.
- Disclosure remains keyboard accessible.
- Mobile targets remain at least the existing comfortable size.
- Do not replace actual buttons with non-semantic clickable divs.

---

# Demo behavior

The anonymous demo should inherit the selected theme/mode and general motion vocabulary because those are presentation.

It must not:

- fetch owner XP;
- expose owner level;
- fetch reward history;
- show a private wallet chip;
- write trend-intent preferences on behalf of the owner unless the user explicitly changes local demo presentation controls.

Demo Coach remains synthetic/read-only.

---

# Scope boundaries

H4 explicitly does **not** add:

- new Coach task-generation rules;
- new XP issuance sources;
- XP penalties;
- spendable-XP theme purchases;
- new Health analytics;
- new AI prompts/providers;
- notifications/push/email;
- audio;
- copyrighted franchise art/assets;
- a full custom theme editor;
- social/leaderboard mechanics;
- badges/streak mechanics unless required only as tiny presentation labels for existing state;
- a new database migration.

Theme unlocks are Lifetime-XP progression. Real-life reward purchases remain Spendable-XP wallet behavior.

---

# Validation requirements

Because H4 is visual, automated validation alone is not sufficient.

## 27. Domain tests

At minimum prove:

### Progression
- Level 1 at 0 XP;
- Level 2 at 100;
- Level 3 at 250;
- Level 4 at 450;
- Level 5 at 700;
- threshold math continues correctly;
- Spendable XP does not affect level;
- expected theme ids unlock at the expected levels;
- existing five themes are always available.

### Trend semantics
- `at_least` + higher => toward;
- `at_least` + lower => away;
- `at_most` + lower => toward;
- `at_most` + higher => away;
- below-range + higher => toward;
- above-range + lower => toward;
- inside-range => neutral/within target;
- conflicting active Goals => neutral;
- no active Goal uses questionnaire preference;
- active Goal overrides questionnaire preference;
- no goal/preference => neutral.

## 28. Theme tests

Prove:

- every catalog id resolves;
- every pack has the required token set;
- current legacy palette ids remain valid;
- System/Light/Dark remains independent from pack;
- stored invalid pack falls back safely;
- theme selection does not mutate Health/XP data;
- locked-state calculation derives from Lifetime XP;
- reduced-motion rules still override new animations.

## 29. Today / Coach tests

Prove:

- Nutrition renders before Coach on mobile document/order contract;
- desktop structure gives Nutrition the hero span;
- Daily Quest is visible even when Stretch is offered;
- Daily Quest is visible even when Stretch is active;
- Stretch details are not dumped into collapsed card;
- full Stretch detail remains available through disclosure;
- Weekly remains represented when present;
- completed tasks settle into compact acknowledgement;
- XP badges use the reward presentation;
- Lab cannot replace/hide Daily on the compact Today card.

Do not alter underlying Coach completion tests except where presentation expectations intentionally change.

## 30. Shell / Rewards tests

Prove:

- owner header shows Spendable XP chip;
- chip links to `/rewards`;
- mobile keeps it visible;
- demo/anonymous does not fetch owner wallet;
- redemption/refund/award invalidates wallet summary without polling;
- Rewards page displays Spendable and Lifetime/Level distinctly;
- theme unlock never spends wallet XP.

## 31. Motion tests

Static/source tests should ensure:

- reduced-motion disables all new travel/scale/particle animations;
- no new `infinite` animation is used for ordinary UI;
- Health numeric values are not count-up animated;
- XP/progression celebration is bounded;
- no `setInterval` polling loop is introduced for wallet/progression.

## 32. Full regression

Run and pass:

- `npm test`
- `npx tsc -b`
- `npx eslint .`
- `npm run build`

No production database test writes.

---

# Mandatory visual acceptance

H4 is not complete merely because tests pass.

Perform an explicit visual QA pass before closing the task.

At minimum inspect:

### Desktop
- approximately 1440–1600 px wide;
- dark mode;
- light mode;
- Today with active Daily + offered Stretch + Weekly;
- Rewards;
- Theme Studio;
- Progress with toward/away/neutral trend signals.

### Mobile
- approximately 390 px wide;
- Today first viewport must show Nutrition before a large Coach detail block;
- Coach rows must not overflow;
- XP chip must remain discoverable;
- detail disclosure must fit viewport/safe areas;
- Theme Studio cards must remain usable.

### Representative themes
At minimum visually inspect:

- Classic
- Aura
- Super Saiyan Gold
- Bonfire
- Silver Instinct

Check both readability and distinct personality.

The owner should be able to look at two different theme screenshots and immediately recognize that they are different themes, not just different button colors.

---

# Documentation / completion

On successful implementation:

- add `docs/ai/H4_REPORT.md`;
- update `docs/ai/DEV_STATE.md`;
- update `docs/ai/ROADMAP.md`;
- update `HEALTH-PLATFORM-DESIGN-MANUAL.md` with the final experience-system contract;
- update `docs/ai/DECISIONS.md` with durable decisions:
  - Nutrition is the Today first-load hero;
  - Daily Quest cannot be displaced by Stretch on Today;
  - Coach uses progressive disclosure;
  - Lifetime XP drives progression/theme unlocks;
  - theme unlocks do not spend XP;
  - active Goals outrank visual trend preferences;
  - trend questionnaire is presentation-only;
  - event-driven celebration motion only;
  - theme packs cannot change semantic danger/warning/success meaning;
- document any new browser-storage keys;
- confirm schema head remains 0039;
- reset this file to:
  - `# Current task`
  - blank line
  - `No active implementation task.`

Do not claim production deployment until the owner actually deploys and visually accepts the result.

---

# Definition of done

H4 is complete only when all of the following are true:

1. Today opens with Nutrition as the clear primary surface.
2. Daily Quest is always visible when it exists, even with active/offered Stretch.
3. Coach default presentation is compact and detail is progressively disclosed.
4. Coach/Rewards XP is visually distinct from ordinary metadata.
5. Spendable XP is globally discoverable beside Settings/on the mobile header.
6. Rewards clearly separates Spendable XP from Lifetime/Level progression.
7. progression is deterministic from Lifetime XP and never falls when rewards are spent.
8. existing five appearance options remain valid.
9. the new full theme-pack system materially changes surfaces/charts/accent/reward personality, not only button color.
10. the full initial progression theme catalog is present and future themes are cheap to add.
11. meaningful XP/completion/level/theme events have bounded celebratory motion.
12. reduced-motion gets the same information without travel/scale/particle animation.
13. goal-aware trend colors correctly mean toward/away/neutral relative to owner intent.
14. the presentation questionnaire is discoverable and never overrides an active formal Goal.
15. no generic up/down direction is automatically labeled favorable/unfavorable without owner intent.
16. the app has a stronger visual hierarchy and less first-load text noise.
17. no new schema migration, paid service, provider, polling loop, or background job is introduced.
18. full automated regression passes.
19. desktop + mobile visual acceptance passes across representative themes.
20. the owner can describe the app as feeling more alive and having a recognizable personality without sacrificing the seriousness/readability of a personal Health tool.


---

# Visual QA addendum — 2026-09-29

The owner's first desktop/mobile visual pass accepted the overall H4 direction and identified the following required closeout refinements. These requirements supersede any conflicting wording above.

## A. Stable Coach loading geometry

The Today Coach loading state must reserve approximately the same vertical footprint as the normal compact mission card so Nutrition/Training do not visibly jump when Coach finishes loading.

- Use a structured mission-card skeleton rather than an unrelated short rectangle.
- Skeleton and loaded card must share a stable minimum height at the Today breakpoint.
- Do not add a fake delay.
- Do not add polling merely to make the skeleton disappear sooner.
- Local Coach generation may be slower than production; layout stability is the required fix.

## B. Theme Studio previews follow resolved light/dark mode

Theme preview cards must visually match the currently resolved color mode.

- Dark mode shows dark theme previews.
- Light mode shows light theme previews.
- System follows the actual system-resolved mode.
- Preview remains a miniature theme sample and may show its gradient/glow/reward identity even when the theme is locked.
- The preview must not temporarily activate the locked theme.

## C. Conservative motivating defaults supplement Goal semantics

The earlier rule “no goal/preference => always neutral” is too restrictive.

Formal Goals still have highest precedence. Presentation preferences still apply next where configured. After those, H4 may use a **small explicit motivational-default allowlist** for metrics whose product meaning is intentionally unambiguous for this personal app.

Initial defaults:

- activity steps higher => positive/toward-like motivating signal
- activity steps lower => negative/attention signal
- exercise minutes higher => positive; lower => negative when surfaced as a comparison
- estimated strength improving/higher => positive
- estimated strength decreasing/lower => negative
- Training frequency higher => positive
- Training frequency lower => negative
- a new canonical performance best / PR => positive
- logged-day protein average higher => positive
- logged-day protein average lower => negative
- calories higher/lower => neutral unless an explicit Goal applies
- sleep duration higher/lower => neutral unless an explicit Goal applies
- bodyweight/body composition remains Goal/preference driven unless a future explicit product rule is added

These are presentation signals, not medical judgments and not new Health analytics.

Precedence becomes:

**active formal Goal > explicit trend-color preference > conservative motivational default > neutral**

Do not expand the default allowlist by guessing.

UI copy for these defaults should not falsely say “Toward goal” when no Goal exists. Use accessible wording such as “Positive signal” / “Needs attention” while retaining the arrow and semantic color.

## D. Cross-domain pattern tone

Where an existing deterministic pattern directly compares a motivational-default metric, the pattern can inherit a conservative presentation tone.

Required example:

- `activity_training:steps`: if Training-day steps are lower than other completed Activity days, show an attention/negative treatment; if higher, show a positive treatment.

Other associations stay neutral unless their meaning is explicitly defined. Color must not imply causation.

## E. Human-readable date-only presentation

Date-only values shown to the owner should not expose raw `YYYY-MM-DD` unless they are inside a native date input.

Preferred standalone format:

- `Sep 29, 2026`

Preferred ranges:

- same month/year: `Sep 22–28`
- cross month/same year: `Sep 22–Oct 28`
- cross year: include years where required for clarity

Use the shared calendar-date formatting module. Do not construct date-only values through local-time `new Date('YYYY-MM-DD')` parsing that can shift calendar days.

Audit high-visibility Goal, Progress, Insights, Today, Coach, Lab, and comparison copy for raw date-only output.

## F. Training Goal persistence bug is a schema-repair exception

Visual QA exposed an older H2D schema defect: Training Goal kinds can validate in application code but fail when inserting `goal_versions` because the 0028 `goal_versions_unit_known` database constraint was never expanded for H2D's new canonical Goal units.

The repair requires migration:

`0040_goal_training_units_fix.sql`

It must expand the allowed Goal-version units to include:

- `sec`
- `mi`
- `sec/mi`
- `completion`

This is an H2D persistence bug fix discovered during H4 QA, not a new H4 data model. It is the explicit exception to the earlier “no H4 migration” requirement.

After this repair:

- repository/backup schema head becomes 0040;
- Distance / Duration / Pace / Skill Goal creation must persist successfully;
- existing Goal kinds remain valid;
- production owner must apply migration 0040 before relying on these Goal kinds.

Add a disposable PostgreSQL regression proving the new units satisfy the actual database constraint.

## G. Local Nutrition date-query parity

Local Vite GET `/api/nutrition/day?date=...` currently loses the query parameter because the handler reads only the Vercel `req.query` shape.

Use the shared request-query helper that supports both:

- Vercel `req.query`;
- query parameters parsed from the local Node/Vite request URL.

Add a regression that exercises the Vite-style URL shape with no `req.query`.

Production behavior must remain unchanged.

## H. Progression themes need stronger personality

The first H4 visual pass accepts the calmer base theme direction but confirms that progression themes should visibly earn their “unlock” status.

Progression theme packs should use their existing theme tokens more aggressively through restrained:

- ambient gradients;
- surface tint;
- glow around reward/progression chrome;
- themed hero/raised surfaces;
- chart supporting colors;
- bounded unlock/theme-selection animation.

No infinite ambient animation.

Base themes may remain calmer.

A locked Theme Studio preview should make these personality differences visible so the owner can see what they are working toward.

## I. Closeout gate

Do not close H4 until:

- the Goal POST bug is fixed and migration 0040 validated;
- local Nutrition date navigation works;
- Coach skeleton no longer causes a visible geometry jump;
- dark-mode Theme Studio previews look dark;
- motivational positive/negative signals are visible in the approved allowlisted cases;
- raw date-only strings are removed from high-frequency owner-facing presentation;
- progression-theme preview/personality is visibly stronger;
- full automated validation passes again;
- the owner gets one more visual QA pass.


## J. Motivational signal must decorate, not replace, the finding

Final owner QA caught that the semantic signal label could replace the useful Detail text in Progress “What changed.”

Required behavior:

- keep the actual finding detail visible, e.g. `Heaviest load`, `Most reps at this load`, `Estimated strength improved`, or `3 more workouts than previous`;
- apply the positive/attention arrow + semantic color to that specific phrase;
- generic accessibility meaning such as “Positive signal” / “Needs attention” may remain in an aria-label or supplemental copy;
- do not replace the finding itself with generic “Positive signal.”

The semantic indicator exists to draw attention to the fact, not to erase the fact.

## K. Mobile Nutrition Add Food action must be viewport-bounded

The mobile screen recording showed the fixed Add Food action contributing to unstable/overflowing geometry.

Required behavior:

- the mobile fixed CTA is bounded by explicit left/right safe gutters;
- it must not inherit a full-width class that extends beyond the viewport;
- no horizontal page overflow or sideways shift while scrolling;
- it stays above the bottom navigation/safe-area;
- the desktop Add Food action remains unchanged.

These two items are part of H4 closeout and must pass before H4 is closed.
