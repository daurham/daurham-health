# Current task

## Objective

Implement **V2-H2B — Stretch Quests** on top of the existing H2A Coach engine.

Stretch Quests are rare, explicitly accepted performance challenges that are intentionally difficult enough that the owner may fail them.

H2B must add:

- deterministic Stretch Quest eligibility/generation
- explicit offer → accept → complete / pass / fail lifecycle
- one offered/active Stretch Quest at a time
- fresh, canonical Training baselines
- strength e1RM challenges
- canonical reps challenges where Training already records reps cleanly
- canonical duration challenges where Training already records duration cleanly
- exact completion provenance
- “new PR, quest not conquered” progress behavior
- Today/Coach-inbox integration
- bounded safety/context suppression

H2B does **not** add XP yet.

It also does **not** add native distance, pace, skill, calisthenics Goal kinds, or the broader Training measurement/routine expansion. Those are deliberately reserved for **H2D — Goals + Training Measurement Expansion + Lightweight Routines**. H2B should be architected so H2D can add distance/pace/skill Stretch strategies without replacing the Stretch Quest lifecycle.

## Product intent

A Stretch Quest is different from a Daily Quest.

Daily Quests are routine actions the Coach can assign automatically.

Stretch Quests are **offers**:

> **STRETCH QUEST**  
> Break your recent Bench Press estimate  
> Current e1RM: 120 lb  
> Target: 122.5 lb  
> Any valid weight × rep combination counts.  
> Accept · Pass

The owner must explicitly accept before the challenge becomes active.

A Stretch Quest is allowed to beat the owner.

Failure is not punished.

Passing an offer, ending an accepted challenge, or expiring without success:

- awards nothing
- loses nothing
- breaks no streak
- does not immediately reroll another Stretch Quest

A failed attempt may still be meaningful progress.

Example:

> **NEW PR**  
> 121.8 lb e1RM  
> Stretch target: 122.5 lb  
> Quest not conquered.

That is a valid outcome and must not be mislabeled as success.

## Current baseline

Start from the V2-H2A tree described in `docs/ai/DEV_STATE.md`.

Relevant existing architecture:

- migration head is `0035_coach_tasks.sql`
- `coach_tasks` persists frozen Coach assignments
- `coach_task_events` is append-only lifecycle/evidence history
- event vocabulary already includes `accepted`, but H2A does not use it yet
- H2A task kinds are `weekly_focus` and `daily_quest`
- H2A task statuses are `active`, `completed`, `passed`, and `expired`
- Today has one combined Coach surface and a compact Coach inbox
- Daily Quest/Weekly Focus generation is deterministic and provider-free
- canonical Training contains programmed/ad-hoc/experiment sessions and working sets
- loaded-rep strength analytics already use the Epley formula and high-confidence rep ceiling
- `sessionStrengthPoint` / `sessionStrengthHistory` are the current strength authority
- Training sets also canonically store bilateral/per-side reps and duration
- generic owner-created reps/duration exercises currently use `performance_type = other`
- Training does not yet have first-class distance/pace/skill measurement families
- H2A run/hike distance remains Coach evidence only, not Training performance authority
- Apple/Health Auto Export workouts remain Activity and must not satisfy Training Stretch Quests
- no XP ledger exists yet

## Core lifecycle

### 1. Extend Coach task/event schema for Stretch Quests

Add the next ordered migration after `0035_coach_tasks.sql`.

Extend the existing Coach model rather than creating a separate Stretch table.

The migration must support:

### Task kind

Add:

- `stretch_quest`

### Stretch lifecycle

Stretch needs a state that distinguishes an unaccepted offer from an accepted challenge.

Extend task status with the equivalent of:

- `offered`
- `active`
- `completed`
- `passed`
- `failed`
- `expired`

Existing Weekly Focus / Daily Quest behavior must remain unchanged. They continue to be created directly as `active`.

Stretch semantics:

- `offered`: challenge exists but owner has not accepted it
- `active`: owner explicitly accepted it
- `completed`: canonical Training evidence met/exceeded target after acceptance
- `passed`: owner declined the offer
- `failed`: owner accepted, then explicitly ended it or its accepted challenge window closed unmet
- `expired`: an unaccepted offer window closed

Add nullable `accepted_at` (or repository-equivalent) to the task if needed.

Extend event vocabulary as needed so append-only history can represent:

- offered
- accepted
- completed
- passed
- failed
- expired

Do not overload `passed` to mean an accepted challenge failed.

### Reward classification

Extend difficulty/reward-band constraints with a frozen Stretch classification, e.g.:

- `stretch`

Do not assign XP in H2B.

### One current Stretch

Enforce that the owner cannot have more than one current Stretch Quest in `offered` or `active` state at a time.

Use an application invariant plus a database constraint/index where PostgreSQL can express it safely.

## Offer cadence

### 2. Stretch Quests are rare

H2B should not create a Stretch offer every day.

Use a deterministic, versioned cooldown. For H2B:

- first eligible Stretch may be offered immediately
- after any Stretch offer is created, do not create another for at least **8 Phoenix calendar days**
- passing, failing, completing, or allowing the offer to expire does not bypass the cooldown
- no reroll endpoint exists

Keep the cooldown in deterministic configuration/domain code so later tuning is explicit and testable.

If no eligible candidate exists when cooldown permits an offer, generate nothing. Do not substitute filler.

## Offer / accepted windows

### 3. Offer and challenge expiration

Use explicit deterministic windows.

Recommended H2B behavior:

- an unaccepted offer remains available for **3 Phoenix calendar days**, including the offer date
- when accepted, its challenge window becomes **7 Phoenix calendar days**, including the acceptance date
- acceptance may update the task’s effective challenge expiration while leaving original offer metadata/history intact
- a refresh cannot extend either window
- an offer that expires unaccepted becomes `expired`
- an accepted challenge that reaches its challenge end unmet becomes `failed`

Store enough metadata to explain:

- offered date
- original offer expiry
- accepted date
- challenge expiry

Do not use a background scheduler. Reconcile on normal Coach reads/ensure/mutations just as H2A does.

## Stretch candidate authority

### 4. Training only in H2B

Every H2B Stretch Quest must be proven from canonical Training.

Supported H2B strategies:

1. loaded-rep **strength e1RM**
2. **reps**
3. **duration**

Do not generate Stretch Quests from:

- Activity workouts
- owner self-report alone
- H2A optional run/hike distance evidence
- Nutrition
- Body
- Sleep
- Personal Lab
- Goals without matching canonical Training evidence

Future H2D may add distance/pace/skill strategies.

### 5. Create shared deterministic Stretch baseline helpers

Do not hide performance-baseline logic in SQL inside the Coach service.

Add or extend shared deterministic Training/progress domain helpers that can answer:

- eligible canonical performance observations for an exercise
- best recent baseline
- latest qualifying observation date
- exact source session/exercise/set
- best post-acceptance attempt

H2B may add narrow reps/duration best helpers to `src/domain/progress`, because the canonical measurements already exist.

However, do **not** turn this into the H2D general measurement-model redesign.

The helpers should be reusable by H2D later.

## Baseline eligibility

### 6. Require a recent credible baseline

Stretch generation must fail closed when the baseline is stale or thin.

For H2B, require all of the following:

- at least **2 qualifying Training appearances** for the same exercise/strategy
- latest qualifying appearance no more than **21 Phoenix calendar days** before the offer date
- both qualifying appearances must fall within the previous **42 Phoenix calendar days**
- baseline is the best qualifying performance in that 42-day window
- baseline source session/set must still exist at offer generation time

Do not use a performance older than the window just because it is an all-time PR.

Do not generate from only one historical attempt.

### 7. Eligible sessions

Only canonical Training sessions count:

- `programmed`
- `ad_hoc`
- `experiment`

Exclude:

- Apple/Activity workouts
- deleted sessions
- non-working sets
- malformed/incomplete sets
- sets that do not match the exercise’s measurement semantics

Existing Training analytics semantics remain authoritative where they already exist.

## Strength e1RM Stretch strategy

### 8. Strength eligibility

A strength Stretch candidate requires an exercise that already qualifies for loaded-rep strength analytics.

Use the existing:

- exercise classification
- working-set rules
- Epley formula
- high-confidence rep ceiling
- canonical source-set semantics

Do not implement a second e1RM formula in Coach.

### 9. Strength target

For H2B, target a **2% improvement** over the frozen recent baseline e1RM.

Present in pounds for the owner UI, consistent with the existing Goal presentation.

Freeze a human-usable target:

- calculate from canonical e1RM
- convert to pounds using existing unit helpers
- round **up** to the nearest **0.5 lb**
- never round down below the unrounded 2% challenge

The task stores:

- baseline e1RM
- target e1RM
- display unit
- exercise id/name
- baseline session id
- baseline set id
- baseline date
- strategy/rule version

Any later valid high-confidence weight × rep combination may satisfy the target.

Never tell the owner to put the target e1RM itself on the bar.

UI copy must explicitly say that any valid weight × rep combination counts.

Example:

> Current e1RM 120 lb  
> Target 122.5 lb  
> Any valid weight × rep combination counts.

### 10. Strength completion

After acceptance, evaluate canonical Training sets for that exercise.

A completion source must:

- belong to canonical Training
- be a valid high-confidence e1RM observation
- be created/performed after acceptance according to the cleanest reliable Training timestamp semantics
- meet or exceed the frozen target

Store exact completion provenance:

- session id
- session-exercise id
- set id
- performed load
- reps
- calculated e1RM
- target
- formula/confidence

Do not accept a manual “I did it” action.

## Reps Stretch strategy

### 11. Reps eligibility

Support a narrow canonical reps strategy for exercises whose existing Training definition uses:

- `measurement_kind = reps` or `reps_per_side`
- a non-external load family appropriate to bodyweight/unloaded performance
- canonical working-set reps

Do not create a reps Stretch for loaded-rep strength exercises where e1RM is the appropriate strategy.

For per-side exercises, use the repository’s established “minimum of both completed sides” strength-style interpretation rather than summing sides.

### 12. Reps baseline/target

Baseline:

- best qualifying single working-set rep result in the 42-day baseline window

Target:

- increase by **5%**
- round upward to the next whole rep
- minimum increase: **1 rep**
- target must never exceed **110%** of baseline due only to rounding/minimum logic

Examples:

- baseline 10 → target 11
- baseline 42 → target 45

Freeze baseline/target and source provenance on the Stretch task.

### 13. Reps completion

Any later qualifying canonical working set for the same exercise that reaches target completes the quest.

Record exact session/set/reps evidence.

A below-target canonical attempt may still become the owner’s new best.

If it beats the frozen baseline but not the Stretch target:

- task stays active
- Today/inbox may show **New PR**
- copy must still say the Stretch target was not conquered

Do not append a completed event.

## Duration Stretch strategy

### 14. Duration eligibility

Support a narrow duration strategy for exercises whose existing Training definition uses:

- `measurement_kind = duration` or `duration_per_side`
- unloaded/bodyweight semantics appropriate to holds, yoga positions, mobility, shadow-boxing intervals, etc.
- canonical working-set duration

For per-side duration, use the existing minimum-completed-side interpretation.

Do not use H2A session-level `duration_min` alone as a Stretch performance observation when a canonical exercise set duration is absent.

### 15. Duration baseline/target

Baseline:

- best qualifying single working-set duration in the 42-day window

Target:

- 5% improvement
- round upward to the next **5 seconds**
- minimum increase: **5 seconds**
- target must not exceed **110%** of baseline solely because of rounding/minimum logic

Examples:

- baseline 20 sec → target 25 sec
- baseline 95 sec → target 100 sec

Freeze the exact baseline/target/source.

### 16. Duration completion

Any later qualifying canonical working set for the same exercise that reaches target completes the Stretch Quest.

A post-acceptance best that exceeds baseline but misses target is a PR/progress result, not quest completion.

## Candidate ranking

### 17. Deterministic ranking

Create all eligible Stretch candidates first, then rank deterministically.

Suggested scoring inputs:

- active matching `strength_e1rm` Goal relevance
- baseline freshness
- number of recent qualifying appearances
- whether the exercise was recently trained
- recent Stretch repetition penalty for the same exercise/strategy

Do not use AI.

Do not use true randomness.

Stable tie-breaker should use deterministic identifiers such as strategy + exercise id.

### 18. Goal relevance

H2B may explicitly link/prioritize an active `strength_e1rm` Goal when:

- Goal exercise matches the candidate exercise
- canonical baseline is independently eligible

The Goal does not create evidence by itself.

Current Goal model has no reps/duration performance Goal kinds, so reps/duration Stretch candidates are Training-driven in H2B.

Do not add new Goal kinds here.

### 19. Exercise repetition

Avoid repeatedly challenging the same exercise/strategy.

At minimum:

- strong penalty if the previous Stretch Quest used the same exercise + strategy
- avoid the same exercise + strategy for **30 days** when another eligible candidate exists
- if it is the only eligible candidate after the global 8-day cooldown, it may be offered again

Persist/query Stretch history so this works across browsers.

## Safety/context suppression

### 20. Stretch is stricter than Daily Quest

Do not create a Stretch offer when current deterministic context contains a clear reason to avoid a performance challenge.

At minimum suppress all Stretch candidates when current Daily Context includes:

- sick
- pain
- rest_day
- unusual_physical_labor
- unusual_stress
- poor_sleep_opportunity
- baby_night_interruption

Reuse exact existing context vocabulary.

Do not invent a “readiness score.”

Absence of a suppression tag is not a medical safety claim.

### 21. Strength-specific guardrails

H2B must never generate:

- “test your 1RM”
- “put 102%/110% of your max on the bar”
- forced max singles
- language instructing the owner to train through pain

The target is a derived performance threshold, not a prescribed load.

### 22. No overlapping Stretch challenges

If a Stretch task is currently `offered` or `active`:

- do not create another
- do not surface another candidate
- do not change its target

## Acceptance

### 23. Explicit accept

Add an owner-only accept mutation.

Accepting an offered Stretch Quest:

- verifies the offer is still current
- appends exactly one `accepted` event
- records `accepted_at`
- changes status to `active`
- sets/freezes the 7-day challenge window
- does not modify baseline or target
- is idempotent on retry

If the offer already expired, fail cleanly and reconcile it to `expired`.

### 24. Pass before acceptance

An offered Stretch Quest can be passed.

Passing:

- appends one `passed` event
- closes the offer
- does not award anything
- does not create a replacement
- does not reset the 8-day cooldown

### 25. End an accepted challenge

An accepted active Stretch Quest can be ended.

Use a clear action such as:

- `End quest`
- confirmation copy that the quest will close without a reward

Ending:

- sets status to `failed`
- appends one `failed` event
- has no penalty
- does not remove any canonical Training PR achieved during the attempt
- does not reroll another Stretch Quest

## Reconciliation

### 26. Reconcile Stretch on normal Coach reads

Extend H2A Coach reconciliation.

For a Stretch task:

### Offered

- if offer window is still open: leave offered
- if offer window ended: mark expired

### Active

- check canonical Training evidence after acceptance
- if target met: complete
- if target not met and challenge window ended: mark failed
- otherwise remain active

Repeated reads must be idempotent.

### 27. Canonical source deletion/edit

Coach evidence must not become a second performance authority.

While a Stretch Quest is still active:

- if its frozen baseline source Training record was deleted before acceptance, the offer should fail closed / become invalid-expired rather than silently rebase its target
- after acceptance, do not silently change the frozen baseline/target
- completion is based on currently existing canonical qualifying evidence
- deleting/editing a post-acceptance attempt before completion means it cannot satisfy the quest
- if a completed Stretch’s source is deleted later, preserve the historical Coach completion event/provenance for future XP reconciliation; H2B does not reverse completion or XP because XP does not exist yet

Record this distinction in durable docs.

## Today / Coach UI

### 28. Integrate Stretch into the existing combined Coach surface

Do not create a separate permanent Stretch page/card.

Extend the current Coach Today/inbox design.

Weekly Focus remains the compact top strip.

Primary Coach action priority:

1. accepted active Stretch Quest
2. newly offered Stretch Quest
3. active Daily Quest
4. resolved Daily Quest only when useful as the current-period explanation

When Stretch occupies the primary slot, Daily Quest remains accessible from the Coach inbox.

Do not render two equally weighted primary cards.

### 29. Offered Stretch UI

Show:

- `STRETCH QUEST`
- exercise/challenge title
- baseline
- target
- expiry/offer timing
- concise explanation of how it is measured
- `Accept`
- `Pass`

Strength copy must explain:

- e1RM is estimated
- target is not the literal load to put on the bar
- any valid high-confidence weight × rep combination may count

### 30. Active Stretch UI

Show:

- current/best post-acceptance attempt
- frozen target
- time remaining / expiration date
- evidence source type
- `Open Training`
- `End quest`

If a new canonical PR exists but target is not reached:

> New PR: 121.8 lb  
> Target: 122.5 lb  
> Quest not conquered yet.

Equivalent copy for reps/duration.

Do not give consolation completion/XP.

### 31. Completed Stretch UI

On completion:

- use existing accomplishment motion vocabulary
- respect `prefers-reduced-motion`
- show exact achieved value and target
- show `Verified by Training` / existing evidence terminology
- collapse out of the primary slot after the acknowledgement
- retain it in appropriate compact current/history context as needed by existing Coach UX

Do not animate health/performance numbers.

### 32. Failed/passed/expired UI

Use neutral language.

Examples:

- Passed
- Challenge ended
- Offer expired

Do not use shame/failure language beyond factual status.

No negative score/streak messaging.

## Coach inbox

### 33. Extend inbox hierarchy

The compact Coach inbox should support:

- Stretch Quest
- Today
- This week

Show offered/active Stretch above ordinary Daily Quest.

The architecture should remain extensible for H2C Personal Lab items.

Do not build a full historical quest browser in H2B.

## API/auth/demo

### 34. Owner-only mutations

Add repository-consistent owner-authenticated routes/actions for:

- accept Stretch
- pass Stretch (existing pass action may be extended safely)
- end active Stretch

Existing Coach read/ensure routes should return Stretch state.

Preserve:

- anonymous 401
- non-owner 403
- method validation
- single Vercel function architecture

### 35. Demo

Public demo remains:

- anonymous
- synthetic
- read-only
- provider-free

If synthetic Coach content demonstrates Stretch, it must not call owner APIs or providers.

## No provider/AI use

### 36. Deterministic only

H2B must make zero new provider calls.

Do not call:

- Gemini
- Home-AI
- Europe PMC

Do not add an `ai_usage` request type.

Stretch title/copy may come from deterministic templates.

## XP readiness

### 37. Prepare, do not award

Stretch tasks must freeze:

- difficulty/reward band = Stretch-equivalent
- baseline
- target
- strategy
- source provenance
- completion evidence

This must be enough for future H3 to issue one reward transaction exactly once.

Do not implement:

- XP amount
- spendable XP
- lifetime XP
- dollars
- purchases
- streaks
- penalties
- theme unlocks

## Non-goals

Do not implement in H2B:

- Personal Lab items in Coach
- H2C Coach prioritization/polish beyond what Stretch integration requires
- XP/reward wallet
- native run/hike distance measurement
- distance PRs
- pace PRs
- running-distance Goals
- reps Goals
- duration Goals
- skill Goals
- handstand/HSPU Goal modeling
- generic skill milestones
- new exercise measurement families
- saved routines / routine builder
- high-level Health Objectives/Profile
- Mind tab
- AI-generated challenges
- notifications/background jobs
- a full quest history/profile page

These belong to H2C/H2D/H3 or later.

## Existing behavior that must remain unchanged

- H2A Weekly Focus and Daily Quest semantics
- one frozen Daily Quest per Phoenix date
- one frozen Weekly Focus per Coach week
- passing Daily/Weekly does not reroll
- H2A manual Training/self-report completion
- Goal authority/version semantics
- existing e1RM formula/confidence semantics
- canonical Training session types
- Apple workouts remain Activity only
- Nutrition missing evidence remains missing
- Personal Lab semantics remain unchanged
- provider/AI budget behavior remains unchanged
- shared motion/reduced-motion contract
- backup/portable export integrity
- demo isolation

## Edge cases

Cover at least:

### Generation

- first ever eligible Stretch
- cooldown not yet elapsed
- cooldown exactly elapsed
- no eligible baseline
- only one qualifying appearance
- latest appearance older than 21 days
- second appearance older than 42 days
- multiple eligible exercises
- matching active strength Goal
- same exercise used by prior Stretch within 30 days
- same exercise is the only eligible candidate
- current Daily Context suppression
- an offered/active Stretch already exists
- repeated ensure/read
- concurrent ensure attempts

### Strength

- baseline from high-confidence e1RM
- low-confidence high-rep set excluded
- target rounded upward to nearest 0.5 lb
- lower literal bar weight with more reps reaches target
- heavier literal weight still misses e1RM target
- exact target
- above target
- post-acceptance PR below target
- deleted baseline before acceptance
- deleted/edited attempt before completion

### Reps

- bilateral reps
- per-side reps uses minimum side
- loaded strength exercise does not get generic reps strategy
- target minimum +1
- 5% target rounding
- target cap at 110%
- post-acceptance new best below target

### Duration

- bilateral duration
- per-side duration uses minimum side
- target rounds upward by 5 sec
- minimum +5 sec
- target cap at 110%
- session duration without exercise-set duration does not qualify

### Lifecycle

- offered → accepted
- offered → passed
- offered → expired
- active → completed
- active → failed by End quest
- active → failed at challenge expiry
- duplicate accept
- duplicate end
- duplicate completion reconciliation
- pass does not reset cooldown
- fail does not reset cooldown
- complete does not produce immediate new offer

### UI

- Stretch offered + Daily Quest active
- Stretch active + Daily Quest active
- Stretch complete
- Stretch PR below target
- passed/failed/expired
- Coach inbox ordering
- mobile approximately 390 px
- reduced-motion mode

## Tests required

Add focused coverage for every new strategy/lifecycle path.

At minimum:

1. **Stretch domain tests**
   - cooldown
   - offer/challenge windows
   - deterministic ranking/tie-breaks
   - repetition penalty
   - context suppression
   - target rounding

2. **Performance baseline tests**
   - strength e1RM baseline/provenance
   - reps baseline/provenance
   - per-side rep interpretation
   - duration baseline/provenance
   - per-side duration interpretation
   - freshness/appearance requirements

3. **Coach service tests**
   - only one current Stretch
   - offer idempotency
   - accept idempotency
   - pass
   - fail/end
   - offer expiry
   - challenge expiry
   - canonical completion
   - PR-below-target remains active
   - baseline source deletion behavior
   - post-acceptance source deletion behavior
   - cooldown after every terminal outcome

4. **Strength completion tests**
   - source load/reps/e1RM evidence
   - high-confidence requirement
   - any valid weight × rep combination
   - no literal target-load requirement

5. **Reps/duration completion tests**
   - exact/above target
   - below target PR
   - loaded-rep exclusion from generic reps strategy
   - exercise-set duration required

6. **API/auth tests**
   - owner accept/end/pass
   - anonymous 401
   - non-owner 403
   - wrong methods
   - invalid lifecycle transitions

7. **UI tests**
   - primary priority ordering
   - offered Stretch
   - accepted Stretch
   - new PR but unmet
   - completion
   - fail/pass/expiry
   - inbox ordering
   - mobile
   - reduced motion

8. **Backup/export tests**
   - new Stretch task states/fields round-trip
   - migration head updated

9. Full regression:
   - `npm test`
   - `npx tsc -b`
   - `npx eslint .`
   - `npm run build`

Do not use or mutate the owner's production database in tests.

## Acceptance criteria

V2-H2B is complete when all are true:

1. Stretch Quest is a first-class extension of the existing Coach task/event system.
2. Stretch offers require explicit acceptance.
3. Only one Stretch can be offered/active at a time.
4. New offers respect the deterministic 8-day cooldown.
5. Passing/failing/completing never creates an immediate replacement.
6. Baselines require at least two qualifying appearances, latest within 21 days, both within 42 days.
7. Strength Stretch uses existing high-confidence Epley e1RM authority.
8. Strength target is 2% above baseline and rounded upward to the nearest 0.5 lb.
9. UI never implies the e1RM target is the literal bar load to attempt.
10. Canonical reps Stretch works for eligible unloaded/bodyweight reps exercises.
11. Canonical duration Stretch works for eligible unloaded/bodyweight duration exercises.
12. Reps/duration targets use the defined bounded 5% strategy and rounding.
13. Distance/pace/skills are not faked into H2B and remain explicitly deferred to H2D.
14. Stretch completion uses canonical post-acceptance Training evidence only.
15. A new canonical PR below target is surfaced as progress without completing the quest.
16. Ending an accepted challenge produces a neutral failed/ended state with no punishment.
17. Expiration distinguishes unaccepted offer expiry from accepted challenge failure.
18. Exact source session/exercise/set and performed value are preserved in completion evidence.
19. Current context suppresses optional Stretch offers under the defined tags.
20. Stretch integrates into the single Today Coach surface/inbox without creating competing cards.
21. No XP is issued yet, but frozen reward classification/provenance is H3-ready.
22. No AI/provider call is made by Stretch generation or reconciliation.
23. Existing H2A Daily/Weekly semantics and all broader Health invariants remain intact.
24. All tests, typecheck, lint, and production build pass.

## Required completion report

When finished, report:

1. Files changed.
2. Migration added, exact filename, whether it was applied anywhere, and resulting migration head.
3. Stretch task/status/event schema changes.
4. Offer cooldown and expiration rules.
5. Baseline freshness/appearance requirements.
6. Strength strategy:
   - baseline authority
   - target math/rounding
   - high-confidence requirement
   - completion provenance
7. Reps strategy:
   - eligible exercise semantics
   - target math
   - per-side handling
8. Duration strategy:
   - eligible exercise semantics
   - target math
   - per-side handling
9. Candidate ranking and repeat-exercise behavior.
10. Context/safety suppression.
11. Accept/pass/end/expiry lifecycle and idempotency.
12. “New PR but target unmet” behavior.
13. Today Coach primary ordering and inbox integration.
14. Backup/export changes.
15. Tests added/updated and final counts.
16. Results of:
    - `npm test`
    - `npx tsc -b`
    - `npx eslint .`
    - `npm run build`
17. Manual QA performed at desktop and approximately 390 px.
18. Deviations, risks, unresolved questions, or H2D follow-up.
19. Documentation updated (`DEV_STATE.md`, `DECISIONS.md`, and any durable manual/roadmap amendment that is actually required).
20. Final commit SHA and confirmation that it was pushed.

When implementation is complete, update `docs/ai/DEV_STATE.md` to the actual resulting product state, reset this file to `No active implementation task`, commit, and push per `AGENTS.md`.
