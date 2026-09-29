# Current task

## Objective

Implement **V2-H2A — Coach Core + Today**, the first slice of the post-V2 coaching/progression system.

Build a deterministic, persistent Coach task engine and one compact Today Coach surface that can present:

- one frozen **Weekly Focus**
- at most one frozen **Daily Quest**
- a small Coach inbox for the currently active items

H2A must support two fundamentally different kinds of completion:

1. **Canonical/automatic completion** when Health can already prove the task from canonical data.
2. **Manual-but-structured completion** when the owner did a real health action that Health cannot otherwise observe.

Physical manual quests must not degrade into a checkbox. When the action is Training-like, the completion flow should create/use a real canonical `ad_hoc` Training session so the work becomes part of Training history.

Non-Training actions such as meal prep or health journaling may use a self-reported Coach completion event, because writing a fake Nutrition entry or other canonical measurement would be worse than explicitly recording owner-reported evidence.

This task establishes the task/evidence architecture that later Stretch Quests and the XP ledger will consume. It does **not** implement XP or Stretch Quests yet.

## Product intent

Today should behave like a small operating system for attention, not another dashboard pile.

Near the top of Today, directly under the existing page header/date area, render one combined Coach surface:

- compact **Focus this week** strip when a Weekly Focus exists
- one primary Daily Quest when one exists
- a compact `Coach · N` / inbox control for remaining active Coach items

Do not create separate large cards for Weekly Focus, Daily Quest, Lab, and future quest types.

A task that is completed should resolve/collapse instead of continuing to consume Today real estate. Do not immediately replace a completed or passed Daily Quest with another quest on the same Phoenix calendar date.

If nothing worthwhile exists, Coach may be absent/quiet. Do not generate filler solely to keep the surface populated.

## Background and current authority

The implementation starts from the V2-H1 tree described in `docs/ai/DEV_STATE.md`.

Relevant existing facts:

- Phoenix calendar semantics are canonical.
- Goal status, Body cadence, Nutrition totals, Activity totals, Training history, Sleep, and Personal Lab each already have deterministic authorities.
- Training supports `programmed`, `ad_hoc`, and `experiment` sessions.
- Owner-created Training exercises already exist.
- A manual Training session currently requires at least one exercise and one set.
- Owner-created exercises can represent reps, duration, reps-per-side, or duration-per-side using existing Training semantics.
- Training does not yet have a first-class distance measurement family.
- Apple/Health Auto Export workouts remain Activity, not canonical Training.
- Daily Context exists and may contain context such as sickness/travel/stress.
- The existing Weekly Coach is a deterministic packet plus optional Gemini phrasing. H2A must not duplicate those health calculations.
- No XP/reward ledger exists yet.

H2A may persist the selected task and its lifecycle/evidence. That persistence is **task history**, not a second copy of the underlying health fact.

## Core architecture

### 1. Add persistent Coach tasks

Add the next ordered migration after the current head (`0034_nutrition_micros_goal_archive.sql`) with a durable Coach task model.

Use names consistent with the repository, but the canonical model must provide the equivalent of:

### `coach_tasks`

Required concepts:

- stable task id
- task kind:
  - `weekly_focus`
  - `daily_quest`
- deterministic `rule_key`
- `rule_version`
- domain/category
- frozen display title/detail
- Phoenix `starts_on`
- Phoenix `expires_on`
- stable period/source fingerprint used for idempotency
- nullable linked `goal_id` where a Goal caused the task
- verification/completion mode
- nullable target value/unit and baseline/context needed to render the task
- difficulty/reward band metadata for future H3 use
- lifecycle status:
  - `active`
  - `completed`
  - `passed`
  - `expired`
- completed/closed timestamps as applicable
- metadata JSON for bounded rule-specific data
- created/updated timestamps

Required invariants:

- only one Daily Quest may be generated for one Phoenix calendar date
- only one Weekly Focus may be generated for one canonical Coach week
- refresh/retry must not reroll the selected task
- passing a task must not create a replacement for the same period
- task selection/target must stay frozen after creation even if rankings later change
- generation must be idempotent under concurrent/repeated calls

Do not persist a derived Goal status or Nutrition/Activity total inside the task as an independent authority. Store only the frozen task definition and the minimum baseline/target snapshot needed to explain what was assigned.

### 2. Add append-only Coach task events

Add a `coach_task_events`-style append-only lifecycle/evidence table.

It must support at least:

- `offered`
- `completed`
- `passed`
- `expired`

The event model must be extensible to future `accepted` / Stretch-Quest events without needing to redesign H2A.

Each event needs:

- event id
- task id
- event kind
- occurred timestamp
- verification/evidence kind
- optional canonical source type/id
- bounded evidence JSON
- idempotency key where needed
- created timestamp

Evidence kinds must distinguish at least:

- deterministic canonical evidence
- canonical Training session evidence
- owner self-report

Do not blur owner self-report into automatically verified evidence.

The event/evidence model must be sufficient for H3 to later issue an XP transaction once per completed task and to identify the underlying completion source.

### 3. Backup/export

Coach tasks/events are owner data.

- Include them in the appropriate full backup inventory.
- Include portable data needed to preserve Coach history.
- Self-reported notes, if stored, are private owner data and must never appear in demo fixtures or provider prompts.
- Do not add a provider call merely because Coach data now exists.

## Coach generation

### 4. Add an idempotent deterministic generation endpoint/service

Opening Today needs a stable task without using Gemini.

Implement an owner-only, idempotent ensure/generate flow. Prefer an explicit mutation such as an idempotent `POST /api/coach/ensure` (or the repository-equivalent) rather than making an ordinary GET silently create rows.

The ensure operation should:

1. resolve the current Phoenix date/week
2. reconcile/expire prior active tasks whose period ended
3. create the current Weekly Focus if none has ever been selected for that week
4. create the current Daily Quest if none has ever been selected for that date
5. re-evaluate automatic completion for active current tasks
6. return/read the current Coach state

Repeated calls must return the same tasks for the same period.

No Gemini, Home-AI, external provider, or `ai_usage` reservation is allowed in this generation path.

### 5. Candidate scoring

Build deterministic candidates first, then choose one using a stable scoring/tie-break rule.

The selection model should consider:

- explicit active Goal relevance
- due/overdue urgency from an existing deterministic authority
- whether the owner is behind pace for a Goal/window
- usefulness/actionability today
- recent repetition penalty
- bounded safety/context suppression

Do not use random generation that changes on refresh.

If bounded variation is useful for ties, derive it deterministically from a stable period fingerprint so the selected result remains fixed.

### 6. Repetition control

Coach should not repeatedly assign the same low-level action unless it remains materially more important than alternatives.

At minimum:

- penalize recently used `rule_key` values
- strongly avoid repeating the same optional/general Daily Quest on consecutive days
- urgency/explicit Goal relevance may override the repetition penalty
- passing a task consumes that period and is not a reroll mechanism

Persist enough history that this logic works across browsers.

## Weekly Focus

### 7. Generate at most one Weekly Focus

A Weekly Focus should be tied to a meaningful existing deterministic concern, not generic wellness copy.

Initial H2A candidate families should prioritize existing supported domains such as:

- active Training-frequency Goal pace
- active Activity-steps Goal
- active Nutrition-protein Goal/consistency
- a due/overdue Body measurement when it is materially the most actionable item
- another existing Goal kind only when the repository already has a deterministic observation that cleanly maps to a week-long focus

Do not invent a new Goal type just to create a Weekly Focus.

Freeze the selected focus and target for the week.

Weekly Focus completion should be automatic from current canonical evidence whenever possible.

Examples:

- `Complete 3 training sessions · 1/3`
- `Average at least your step target on completed days` only if that exact rule can be supported deterministically
- `Get the overdue chest measurement back up to date`

Do not use vague copy such as “Focus on fitness.”

Allow the owner to dismiss/pass the Weekly Focus for the remainder of the week. Passing has no punishment and must not generate a replacement focus in that same week.

## Daily Quest generation

### 8. Generate at most one Daily Quest

Daily Quests may be either:

- **auto-verifiable tasks** based on existing canonical data
- **structured manual action tasks** that Health cannot observe without owner input

Priority should generally be:

1. an explicit active Goal with a useful action today
2. a due/overdue deterministic action
3. a safe general health action from the fixed registry

Do not generate a quest when no candidate is worthwhile.

### 9. Initial auto-verifiable quest families

Use existing authorities. Examples include:

- take a currently due Body measurement
- complete a Training session when needed to stay on pace for an active training-frequency Goal
- reach the current protein target for a Nutrition-protein Goal
- reach an Activity step target for an Activity-steps Goal

Completion must come from the canonical domain record/calculation.

An auto-verifiable task must not offer a plain “I did it” override merely because completion has not appeared yet.

If a task naturally asks the owner to create the canonical fact (for example a measurement), its action should route/open the existing logging flow.

## Manual-but-structured Daily Quests

### 10. Physical/movement quests must log canonical Training

Support Daily Quests whose behavior Health cannot otherwise prove, such as:

- 100 jumping jacks
- 10–20 minutes of yoga/mobility
- 10–20 minutes of shadow boxing
- a short cardio session
- a run
- a hike
- another bounded movement action from the fixed H2A registry

For these tasks, the primary action should be **Log it** (or an equivalent explicit action), not a generic checkbox.

The completion flow must create or attach to a real canonical `ad_hoc` Training session.

#### Reps-based example

For a quest such as `100 jumping jacks`:

- use/reuse an appropriate owner-created Training exercise
- represent the performed work as canonical reps using existing Training set semantics
- record the actual reps the owner reports
- complete the quest only if the saved canonical Training evidence satisfies the target
- the task event references the canonical Training session (and exercise/set where practical)

Do not create a duplicate `Jumping Jacks` exercise definition every time the quest appears.

Reuse a compatible existing owner-created exercise when possible. If the fixed Coach registry needs an exercise that does not exist, create it once through the existing owner-exercise architecture rather than bypassing Training invariants.

#### Duration-based example

For yoga, mobility, shadow boxing, or similar work:

- use/reuse a compatible duration-based owner exercise
- create an `ad_hoc` Training session
- record actual duration using canonical Training duration semantics
- require the saved duration to meet the quest target before completion

#### Running/hiking

H2A must support run/hike/cardio quests without quietly redesigning Training distance analytics.

Current Training sets do not have a first-class distance family. Therefore:

- log the physical session canonically in Training using the existing duration-capable model
- allow the Coach completion evidence to include an optional owner-reported distance and unit for explanation/history
- do not make that optional distance a Training PR/Goal observation
- if existing Activity evidence independently proves a specific quest target, the rule may use canonical Activity completion instead
- distance-native Training sets/Goals remain deferred to the later Goal/routine expansion

Do not stuff a distance number into reps or another incompatible Training field.

### 11. Physical completion must be transactionally/recoverably linked

The app must not end up in a state where the quest says completed but no intended Training log exists.

Use the cleanest repository-compatible design to ensure the canonical Training save and Coach completion link are atomic or safely recoverable/idempotent.

Requirements:

- one owner action must not create duplicate Training sessions on retry
- one Training session must not reward/complete the same task twice
- completion event must reference the canonical Training session
- if a matching canonical session was logged through the normal Training UI first, Coach should be able to recognize/use it when the rule can be verified
- deleting or editing Training later must not create a second historical source of truth inside Coach; Coach evidence is provenance to the canonical source

H2A does not implement XP reversal, but the provenance must make later reconciliation possible.

### 12. Non-Training manual health actions

Support a small fixed registry of useful health actions that do not map honestly to an existing canonical Health domain.

Initial examples should include at least:

- **Meal prep one protein-forward dish for a future meal**
- **Journal about your health for 10 minutes**

These are self-reported completions.

For this completion mode:

- show a dedicated `Log it` / completion sheet
- record the actual duration when the action has a duration target
- allow a short optional owner note
- store the evidence on the Coach task event with `owner_self_report` semantics
- do not create a fake Nutrition entry, future meal consumption, Body measurement, or other canonical health fact
- meal prep may optionally record a short description/name of what was prepared, but must not imply it was eaten
- journaling notes remain private Coach evidence; do not send them to Gemini or automatically overwrite Daily Context

The owner’s explicit report is sufficient evidence for this task class. The UI should not pretend it was sensor/canonical verified.

### 13. General health-action registry

Keep optional/manual quest generation in a fixed deterministic registry, not freeform AI generation.

Each rule should declare enough metadata to drive:

- title/detail
- domain/category
- verification mode
- target type/value/unit
- Training preset when applicable
- safety/context eligibility
- difficulty
- reward band
- repetition behavior

Version the rules so future tuning does not mutate historical task meaning.

Goal-linked actions should be preferred when relevant. General health actions are fallback options, not an excuse to ignore explicit Goals.

H2A does not add the future high-level Health Objective/Profile model. Cardio-specific personalization beyond what existing Goals/Activity/Training can express remains a later Goal/objective task.

## Safety/context rules

### 14. Conservative physical quest eligibility

Daily Quest generation must fail closed for physical tasks when context makes the task inappropriate or the rule lacks enough information.

Use existing context only when its semantics are clear.

At minimum:

- do not generate calorie-starvation, fasting, dehydration, sleep-deprivation, medication-change, or supplement-change quests
- do not generate literal max/1RM attempts
- do not generate pain-through-it language
- suppress optional impact/high-exertion manual quests when existing current context clearly indicates sickness/injury/pain or another repository-supported reason to avoid them
- lower-intensity alternatives may remain candidates when appropriate
- all manual/general quests can be passed with no punishment

Do not claim medical safety or readiness from absence of data.

## Today Coach UX

### 15. Add one compact Coach surface near the top of Today

The Today page should render one combined Coach surface directly below the main Today header/date area.

Structure:

1. optional compact `Focus this week` strip
2. one primary Daily Quest
3. compact inbox affordance when additional active Coach items exist

The Coach surface must visually distinguish:

- Weekly Focus
- Daily Quest
- automatically verified versus owner-logged action where relevant
- completed/resolved state
- passed/dismissed state only when still useful to show

Do not add several equally weighted full-size cards.

### 16. Task actions

Depending on rule type, support the appropriate action:

- `Open` / `Measure` / domain-specific route for canonical tasks
- `Log it` for manual structured completion
- `Pass` for Daily Quest
- `Not this week` / equivalent for Weekly Focus

Passing:

- appends a task event
- closes the task for that period
- has no negative score/streak consequence
- does not immediately generate a replacement

### 17. Completion interaction

When a task becomes complete:

- show a brief existing-motion-vocabulary acknowledgement
- then collapse it out of the primary actionable area
- do not animate health numbers
- respect `prefers-reduced-motion`

For the rest of that day/week, a very compact resolved line is acceptable if needed to explain why no new task appears. Do not refill the slot with another same-period task.

### 18. Coach inbox

Add a compact sheet/panel opened from the Coach surface.

It should list current Coach items in a simple hierarchy such as:

- Today
- This week

H2A has only Daily Quest and Weekly Focus, but the component/data model should be extensible to future Stretch Quest and Personal Lab items.

Do not build a large permanent Coach page or history browser in H2A.

## Deterministic completion

### 19. Automatic task reconciliation

Whenever current Coach state is read/ensured, active auto-verifiable tasks should be checked against current canonical evidence.

If satisfied:

- append exactly one completed event
- set task completed
- attach minimal source/provenance sufficient to explain completion
- repeated reads must not append duplicate completion events

Examples:

- Body measurement id/session id
- Training session id
- Nutrition calendar date/observation basis
- Activity calendar date/observation basis

Do not copy an entire Health record into Coach event JSON.

### 20. Evidence labeling

The API/UI model must expose enough information to distinguish:

- `verified by Health`
- `logged in Training`
- `reported by you`

This is primarily for transparency and future XP auditing. Keep the Today copy light; the detailed evidence may live in the inbox/detail sheet.

## Difficulty / future reward readiness

### 21. Persist reward classification, not XP

Every generated task must carry a frozen difficulty/reward classification suitable for H3.

For example, use a small deterministic enum/scale such as:

- routine/easy
- standard
- weekly

Exact naming may follow repository conventions.

Do **not**:

- create XP balances
- convert XP to dollars
- assign random XP amounts
- create purchases/rewards
- unlock themes

H3 will translate the frozen task classification into the XP economy.

Historical tasks must not change reward class if rule tuning changes later.

## API/auth/demo boundaries

### 22. Owner-only API

All Coach mutation/read routes are owner-authenticated through the existing single `/api` function/dispatcher.

The public demo:

- must remain provider-free
- must not call owner Coach APIs
- may render synthetic Coach content if useful to demonstrate the Today layout
- must never expose real task/history/note data

### 23. No AI/provider calls

H2A generation/completion is deterministic and local to existing canonical data.

- no Gemini calls
- no Home-AI calls
- no Europe PMC calls
- no new `ai_usage` request type
- opening Today must not spend money

Future AI phrasing can be layered on top of deterministic Coach tasks in a later contract.

## Non-goals

Do not implement in H2A:

- Stretch Quests
- performance challenges above a recent PR/e1RM
- Personal Lab proposals in the Coach inbox
- XP, spendable XP, lifetime XP, dollars, reward wallet, purchases, streak punishment, levels, ranks, or unlocks
- random XP values
- theme unlocks or expanded theme catalog
- high-level Health Objective/Profile questionnaire
- new Goal kinds
- distance-native Training set measurement
- running-distance Goals
- custom routine builder / saved routine builder
- broad Training analytics redesign
- Mind tab
- meditation timer
- a general journal product/history screen
- push notifications/background scheduling
- AI-generated quests
- automatic provider calls from Today

## Existing behavior that must remain unchanged

- one-owner authentication
- Phoenix calendar semantics
- public demo isolation
- canonical Health facts remain owned by their existing domains
- Goal status remains deterministic and is not persisted in Coach
- Training session types remain `programmed`, `ad_hoc`, and `experiment`
- Apple/Health Auto Export workouts remain Activity, not Training
- Personal Lab experiment semantics remain unchanged
- supplement occurrence states remain distinct
- Nutrition missing evidence stays missing
- shared motion/reduced-motion contract remains
- existing Weekly Coach deterministic packet and optional Gemini generation remain unchanged unless a small shared helper extraction is required
- no existing Goal is silently rewritten to support Coach

## Edge cases

Cover at least:

### Generation

- repeated ensure calls on the same date/week
- concurrent ensure attempts
- app reload does not reroll
- pass then reload does not create replacement
- no eligible candidate
- same optional rule used yesterday receives a repetition penalty
- urgent Goal/due task may legitimately repeat
- week boundary and Phoenix date boundary

### Automatic completion

- evidence already existed before task generation
- evidence appears after task generation
- repeated reads after completion
- canonical source deleted later
- canonical source edited so it no longer matches
- task expires without completion
- archived/deleted Goal linked from historical Coach task

Do not create duplicate completion events.

### Manual Training completion

- owner logs exactly the target
- owner logs more than target
- owner logs less than target
- retry after network failure
- compatible owner exercise already exists
- Coach-created/reused exercise is not duplicated on the next occurrence
- existing normal Training session already satisfies the task
- reps-based task
- duration-based task
- run/hike with duration and optional self-reported distance
- owner edits/deletes the Training session later

### Manual non-Training completion

- duration meets target
- duration is below target
- optional note absent
- optional note present
- meal-prep completion does not create Nutrition consumption
- journal completion does not overwrite Daily Context
- repeated submit does not create duplicate events

### UI

- Weekly Focus only
- Daily Quest only
- both
- neither
- task passed
- task completed
- manual Log-it sheet at approximately 390 px width
- reduced-motion mode

## Tests required

Add focused tests for every new domain/service/API path.

At minimum:

1. **Coach generation domain tests**
   - deterministic ranking
   - repetition penalty
   - one task per period
   - stable/frozen fingerprint
   - no reroll after pass/completion
   - safety/context suppression

2. **Persistence/service tests**
   - idempotent ensure
   - concurrent/duplicate insertion handling
   - lifecycle/event append semantics
   - expiry
   - event idempotency
   - linked Goal deletion/archive behavior remains safe

3. **Automatic completion tests**
   - Body
   - Training-frequency/session evidence
   - Nutrition protein
   - Activity steps
   - no duplicate completion event

4. **Manual Training quest tests**
   - owner exercise reuse/create semantics
   - reps quest creates valid canonical `ad_hoc` Training data
   - duration quest creates valid canonical Training data
   - below-target log does not complete
   - completion event references canonical session
   - retry/idempotency
   - run/hike optional distance remains Coach evidence rather than fake Training distance

5. **Manual health-action tests**
   - self-report evidence kind
   - duration validation
   - meal prep does not write a Nutrition entry
   - journal does not mutate Daily Context
   - duplicate submit protection

6. **API/auth tests**
   - owner access
   - anonymous 401
   - non-owner 403
   - wrong methods
   - Today ensure/read/pass/log flows
   - demo does not hit owner Coach endpoints

7. **UI tests**
   - one combined Coach surface
   - Weekly Focus strip
   - Daily Quest
   - correct action by verification mode
   - pass/no replacement behavior
   - resolved collapse
   - Coach inbox
   - mobile rendering
   - reduced motion

8. **Backup/export tests**
   - Coach tasks/events round-trip
   - private notes remain owner data
   - migration head updated

9. Full regression:
   - `npm test`
   - `npx tsc -b`
   - `npx eslint .`
   - `npm run build`

Do not use or mutate the owner's production database in tests.

## Acceptance criteria

V2-H2A is complete when all are true:

1. Today has one compact combined Coach surface near the top.
2. At most one Weekly Focus is selected per canonical week and it does not reroll.
3. At most one Daily Quest is selected per Phoenix day and it does not reroll.
4. Passing a task closes that period without punishment or replacement.
5. Coach generation is deterministic, versioned, persistent, and provider-free.
6. Goal relevance/urgency outranks generic wellness filler.
7. Recent optional quests are penalized from immediate repetition.
8. Automatic quests complete only from their canonical domain evidence.
9. Physical manual quests use a structured `Log it` flow and produce/reuse canonical `ad_hoc` Training data.
10. Reps actions such as jumping jacks are stored as real Training reps when logged through Coach.
11. Duration actions such as yoga/shadow boxing are stored as real Training duration when logged through Coach.
12. Run/hike actions are representable through canonical Training duration in H2A; optional self-reported distance is not misrepresented as a Training distance metric.
13. Manual non-Training actions use explicitly self-reported Coach evidence rather than fake canonical Health facts.
14. Meal-prep completion never creates an uneaten Nutrition entry.
15. Health-journal completion never silently overwrites Daily Context.
16. Every completion is auditable as canonical, Training-logged, or owner-reported.
17. Task/event persistence is idempotent and ready for one-time H3 XP issuance.
18. Difficulty/reward classification is frozen on the task, but no XP system exists yet.
19. No AI/provider call occurs simply from opening Today or generating Coach tasks.
20. Demo/auth/backup/motion and existing Health domain invariants remain intact.
21. All required tests, typecheck, lint, and production build pass.

## Required completion report

When finished, report:

1. Files changed.
2. Migration added, exact filename, whether it was applied anywhere, and resulting migration head.
3. Coach task schema and event schema.
4. Generation rules and deterministic ranking/tie-break behavior.
5. Weekly Focus candidate families and freeze/pass behavior.
6. Daily Quest candidate families and repetition behavior.
7. Manual Training completion architecture:
   - how exercises are reused/created
   - how reps/duration are stored
   - how run/hike are represented
   - how retries/idempotency are handled
8. Manual non-Training evidence behavior:
   - meal prep
   - journaling
   - duration/note handling
9. Automatic completion authorities and source provenance.
10. Today Coach layout/inbox behavior at desktop and approximately 390 px.
11. Reduced-motion behavior.
12. Backup/export changes.
13. Tests added/updated and final counts.
14. Results of:
    - `npm test`
    - `npx tsc -b`
    - `npx eslint .`
    - `npm run build`
15. Manual QA performed.
16. Deviations, unresolved questions, risks, or deferred follow-up.
17. Documentation updated (`DEV_STATE.md`, `DECISIONS.md`, and any durable manual/roadmap amendment that is actually required).
18. Final commit SHA and confirmation that it was pushed.

When implementation is complete, update `docs/ai/DEV_STATE.md` to the actual resulting product state, reset this file to `No active implementation task`, commit, and push per `AGENTS.md`.
