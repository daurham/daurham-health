# Dev state

Snapshot recorded 2026-09-29 after **V2-H2A — Coach Core + Today**. This is the current health application.

## Git

- Branch: `main`
- V2-H2A implementation is committed and pushed.
- H2A implementation contract commit: `6bb3b4ed5000ca79fa6b4535cf084d265cd94d56`.
- Package version remains 1.0.0.
- No new runtime dependency was added.

## Schema

- Migration head: `0035_coach_tasks.sql`.
- H2A migration is committed but was **not applied to the owner's production database by the implementation workflow**.
- `coach_tasks` stores frozen Weekly Focus / Daily Quest assignments, their period, rule/version, verification mode, action type, optional Goal link, target/baseline metadata, difficulty/reward band, lifecycle state, and timestamps.
- `coach_task_events` is append-only lifecycle/evidence history with idempotency keys and explicit evidence kinds.
- Only one Daily Quest may exist for a Phoenix date and only one Weekly Focus for a Coach week.
- Backup/portable inventory includes Coach tasks/events and the migration head is `0035_coach_tasks.sql`.

## Coach authority

- Coach generation is deterministic and provider-free.
- Opening Today does not call Gemini, Home-AI, Europe PMC, or create `ai_usage` reservations.
- Coach persists the selected assignment so refresh/retry does not reroll it.
- Passing a Daily Quest or Weekly Focus closes that period and does not generate a replacement for the same period.
- Candidate ranking considers explicit Goal relevance/urgency, due Body cadence, general fixed-registry health actions, and recent repetition penalties.
- Urgent deterministic work may override repetition penalties.
- Current Coach week is Monday through Sunday in Phoenix calendar semantics.
- Historical tasks keep their frozen rule version, target, difficulty, and reward band for future XP accounting.

## Current H2A Coach families

### Weekly Focus

Current deterministic Weekly Focus candidates include:

- active Training-frequency Goals
- active Activity-steps Goals
- active Nutrition-protein Goals
- due/stale Body cadence

Weekly Focus is frozen once selected and may be dismissed with “Not this week”.

### Daily Quest

Current automatic Daily Quest candidates include:

- complete a Training session for an active Training-frequency Goal
- reach an Activity step target
- reach a Nutrition protein target
- record a due/stale Body measurement

Current fixed manual registry includes:

- 100 jumping jacks
- 10 minutes yoga
- 10 minutes shadow boxing
- 15 minutes general cardio
- 15 minute run
- 20 minute hike
- prep one protein-forward dish
- journal about health for 10 minutes

General/manual quests are deterministic registry entries, not AI-generated copy.

## Automatic completion

- Active Coach tasks reconcile on Coach ensure/read and after Today changes that can affect completion.
- Canonical completion evidence is read from the existing domain authority.
- Training-frequency completion reads canonical Training sessions only.
- Activity-step completion reads Activity daily summaries.
- Protein completion reads Nutrition entries and preserves unknown-protein semantics.
- Body completion reads canonical Body measurements after the task baseline.
- Completion appends exactly one Coach event and closes the task.
- Repeated reads are idempotent.

## Manual Training completion

Physical manual quests use the existing Training model instead of a parallel Coach-only workout store.

- Compatible owner-created exercises are reused by name + measurement/load family.
- If a compatible exercise does not exist, Coach creates one through the existing owner-exercise architecture.
- Reps quests create canonical `ad_hoc` Training sessions with real reps.
- Duration quests create canonical `ad_hoc` Training sessions with duration sets.
- Run/hike are duration-based in Training because distance-native Training sets are still deferred.
- Optional run/hike distance is stored only as Coach completion evidence and is not treated as a Training PR/Goal metric.
- One client-generated submission UUID is reused as the Training session id for idempotent retry behavior.
- Session insertion and Coach completion are committed together when the logged work meets the target.
- Below-target work may still be logged to Training but does not falsely complete the quest.
- Completion evidence references the canonical Training session.

## Manual non-Training completion

- Meal-prep and health-journal quests use explicit `owner_self_report` evidence.
- Meal prep may record an optional description/note but does not create a Nutrition consumption entry.
- Health journaling records duration/note on Coach evidence only and does not overwrite Daily Context.
- Self-report submissions use idempotency keys and remain distinct from canonical/sensor evidence.

## Context / safety

- Optional moderate physical quests are suppressed when current Daily Context includes sickness, pain, rest day, unusual physical labor, unusual stress, poor sleep opportunity, or baby/night interruption according to rule intensity.
- Lower-intensity movement rules use the smaller impact-suppression set.
- H2A does not generate fasting, starvation, dehydration, medication/supplement changes, sleep-deprivation, max-lift, or pain-through-it quests.
- Lack of context is not treated as proof of medical readiness.

## Today Coach UI

- Today now has one combined Coach surface near the top of the page.
- Weekly Focus appears as a compact strip.
- Daily Quest is the primary actionable item.
- `Coach · N` opens a compact inbox when multiple current Coach items exist.
- Automatic tasks route to their canonical logging/detail surface.
- Manual tasks use a mobile-friendly `Log it` sheet.
- The sheet supports reps, duration, optional run/hike distance, meal-prep description, and optional notes as appropriate.
- Completed/passed items collapse to compact resolved states instead of being replaced in the same period.
- Evidence labels distinguish:
  - Verified by Health
  - Logged in Training
  - Reported by you
- Existing motion vocabulary is reused and reduced-motion behavior remains controlled globally.

## XP readiness

- H2A does **not** implement XP.
- Each generated task freezes a difficulty and reward band.
- Task completion provenance and idempotency are sufficient for H3 to issue one XP ledger entry per completed task.
- Spending, lifetime XP, dollars, purchases, theme unlocks, ranks, and streak penalties do not exist yet.

## Validation

Final H2A validation ran in GitHub Actions with `TZ=America/Phoenix`.

- `npx tsc -b` passed.
- `npx eslint .` passed.
- `npm run build` passed.
- `npm test`: **996 passed, 1 skipped across 119 test files**.
- The temporary H2A validation workflow was removed after the green run.

## Manual QA / deployment note

- No authenticated deployed owner runtime was available through the GitHub implementation tooling, so post-change click-through QA at desktop and approximately 390 px was not performed.
- Responsive/interaction behavior is covered by Coach UI tests plus the full build/type/lint/test gates.
- The owner previously applied H1 migration `0034_nutrition_micros_goal_archive.sql`.
- H2A migration `0035_coach_tasks.sql` still needs to be applied to the production database before deployed Coach code is used.

## Existing behavior retained

- One-owner auth and public demo isolation.
- Phoenix calendar semantics.
- Goal status remains deterministic and owned by the Goal domain.
- Apple/Health Auto Export workouts remain Activity, not Training.
- Personal Lab, Nutrition, Body, Sleep, Activity, Supplements, recipes, Ask Health, Weekly Coach, Appearance, and shared motion remain intact.
- Coach does not create a second source of truth for health measurements.
- No new AI/provider call is triggered by Today Coach.

## Deferred post-V2 work

H2A intentionally leaves these for later contracts:

- Stretch Quests
- Personal Lab proposals in Coach
- XP / spendable XP / lifetime XP / reward wallet
- real-world reward purchases
- levels/ranks/theme unlocks
- high-level Health Objective/Profile questionnaire
- new Goal kinds for reps, distance, duration, skills, and calisthenics
- distance-native Training measurement
- saved routine / generic routine builder
- expanded theme catalog
- Mind tab / meditation product
