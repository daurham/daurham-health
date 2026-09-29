# Current task

## Objective

Implement **V2-H2C — Personal Lab + Coach Polish** on top of the deployed H2A/H2B Coach system.

H2C has two goals:

1. Surface meaningful **existing Personal Lab opportunities** through the same Coach attention system so the owner does not have to remember to inspect Lab separately.
2. Polish Coach prioritization, inbox hierarchy, resolved states, navigation/focus behavior, and cross-domain refresh behavior before H2D expands Training/Goals.

H2C must reuse the existing deterministic Personal Lab authorities.

It must **not** create a second retest engine, a second experiment-suggestion engine, or an AI-generated Coach recommendation system.

The core rule is:

> **Lab decides what is eligible. Coach decides when/how to surface it.**

## Current baseline

Start from the H2B tree described in `docs/ai/DEV_STATE.md`.

Production schema is at:

- `0036_stretch_quests.sql`

Relevant existing behavior:

- Coach already persists Weekly Focus, Daily Quest, and Stretch Quest assignments.
- Stretch lifecycle is offer → accept → complete/pass/fail/expire.
- Coach selection/generation is deterministic and provider-free.
- Today has one combined Coach surface and compact Coach inbox.
- Weekly Focus is a persistent compact strip.
- Active/offered Stretch currently outranks Daily Quest in the primary Coach slot.
- Personal Lab retest status is already deterministic in `src/domain/lab-retests.ts`.
- `listBenchmarkRetests()` is the server authority for current benchmark retests.
- Current retest states are:
  - `unconfigured`
  - `no_baseline`
  - `waiting_minimum`
  - `available`
  - `due`
- `prominentRetests()` already defines `due` and `available` as actionable retest states.
- Experiment Suggestions are already deterministic in `src/domain/experiment-suggestions`.
- `listExperimentSuggestions()` derives eligible candidates and makes **no Gemini call**.
- Suggestion candidates already have:
  - stable candidate id
  - candidate fingerprint
  - kind
  - deterministic title/question/rationale/protocol/evidence
- Current emitted suggestion kinds are:
  - `benchmark_retest_due`
  - `benchmark_missing_baseline`
- `goal_observation` remains reserved and is not currently emitted.
- Gemini is used only if the owner explicitly requests `Draft proposal` in the existing Lab flow.
- Accepting an Experiment Suggestion rechecks its fingerprint and creates a canonical accepted Experiment.
- Today currently has a separate `LabRetestCard` for a due retest and a separate Experiment status card for scheduled/active/review-ready Experiments.
- H2C should remove redundant **retest attention** from Today once Coach owns it, but it does not need to eliminate the lower-page Experiment status/history surface.

## Architectural rule: Lab opportunities stay derived

### 1. Do not persist Lab suggestions as Coach tasks

Existing Experiment Suggestions are deliberately derived until accepted.

H2C must preserve that decision.

Do **not** copy an Experiment Suggestion or benchmark retest into `coach_tasks` as though it were a frozen Health fact or accepted commitment.

Instead, extend Coach state with a derived Personal Lab attention model, for example a repository-consistent equivalent of:

- `CoachLabItem`
- `labItems`

The exact naming may follow current conventions, but the model must distinguish at least:

- `benchmark_retest`
- `experiment_suggestion`

Each derived Lab item should expose the minimum stable presentation/action data Coach needs:

- kind
- source key
- source fingerprint
- title
- detail
- attention reason
- urgency
- href
- optional benchmark/protocol ids
- optional suggestion candidate id/fingerprint
- snoozed state if relevant

Coach must rederive current Lab eligibility from the existing Lab authorities on read/ensure.

### 2. Persist only Coach-specific snooze state

Add the next ordered migration after `0036_stretch_quests.sql`.

Create a small owner-state table for Lab snoozes, e.g. `coach_lab_snoozes`.

Required concepts:

- stable row id
- Lab item kind
- stable source key
- source fingerprint
- `snoozed_until` Phoenix calendar date
- created/updated timestamps
- unique identity suitable for idempotent upsert

This table is **Coach presentation state**, not Lab evidence.

It must not change:

- benchmark retest state
- benchmark results
- suggestion eligibility
- candidate fingerprint
- Experiment lifecycle
- Goal state

### 3. Fingerprint-sensitive snooze

`Not now` snoozes the **current fingerprint**, not the conceptual topic forever.

Use a 7-day deterministic snooze:

- snoozing on date D sets the next normal resurfacing date to D + 7 Phoenix calendar days
- while current date < that resurfacing date, the same fingerprint is hidden
- on/after the resurfacing date, it may surface again if still eligible
- if the underlying Lab fingerprint materially changes before then, the old snooze does not hide the new item

Examples of meaningful change:

- new benchmark result changes retest anchor
- protocol version changes
- retest state/fingerprint changes
- Experiment Suggestion candidate fingerprint changes

There is no permanent dismiss in H2C.

## Personal Lab candidate families

### 4. Benchmark retest Coach items

Use existing `listBenchmarkRetests()` / deterministic retest views.

Eligible Coach retests:

- `due`
- `available`

Do not surface:

- `unconfigured`
- `waiting_minimum`

A `no_baseline` benchmark should normally come through the existing Experiment Suggestion system rather than being invented as a direct retest item in H2C.

Ranking inside retests must reuse existing ordering semantics where possible:

- due before available
- existing due ordering / days-beyond-suggested behavior
- stable title/id tie-break

### 5. Retest fingerprint

Build a deterministic Coach fingerprint from canonical retest identity/state sufficient to make snooze invalidation correct.

At minimum include:

- benchmark definition id
- protocol version id/version
- retest status
- anchor/latest valid result id when present
- relevant minimum/suggested date or equivalent state inputs

Do not use current display prose as the fingerprint authority.

### 6. Retest actions

Coach retest item should route into the existing benchmark/retest workflow.

For a Training-domain benchmark, existing Lab already knows how to offer:

- Run benchmark
- Record from existing data

Coach does not need to reproduce the whole benchmark form.

Primary Coach action may be:

- `Review`
- `Open benchmark`

and route to the current benchmark page.

Do not create a new benchmark-result path.

### 7. Existing Experiment Suggestions

Use `listExperimentSuggestions()` directly or extract a shared deterministic helper used by it.

Coach must **not** call:

- `draftExperimentSuggestion()`
- Gemini
- `ai_usage`

Opening Today/Coach must remain free.

The Coach item should carry:

- candidate id
- candidate fingerprint
- kind
- deterministic title/why
- existing review href

Primary action:

- `Review experiment`

This opens the existing Suggestion review page.

The owner may still choose `Draft proposal` there; that remains the explicit paid-AI action and is outside Coach generation.

### 8. Do not auto-accept Lab suggestions

Coach must never create an Experiment merely because a suggestion was surfaced or opened.

Only the existing Lab review flow may accept/create it.

Acceptance must continue to:

- recheck candidate fingerprint
- use existing Lab commit logic
- preserve existing origin/provenance semantics

H2C does not add a Coach “Accept experiment” shortcut.

## Lab deduplication

### 9. Avoid duplicate retest + suggestion attention

Today must not show two Coach items that are effectively asking about the same benchmark state.

A direct actionable benchmark retest takes precedence over a `benchmark_retest_due` Experiment Suggestion for the same benchmark/protocol state.

Therefore:

- derive both systems independently from their authorities
- suppress the redundant Experiment Suggestion in Coach when a direct retest item represents the same benchmark/protocol
- do **not** change or delete the suggestion from the Lab Suggestions page
- `benchmark_missing_baseline` remains a valid Coach Experiment Suggestion because there is no direct prominent retest item for `no_baseline`

This is presentation deduplication only.

## Attention model and priority

### 10. Add an explicit attention reason

Give current Coach items a small deterministic attention classification.

At minimum support the equivalent of:

- `challenge`
- `goal`
- `due`
- `lab`
- `general`

This may live on the view/presentation model rather than require persistence for old task rows.

Use the existing rule/task metadata to classify persisted Coach tasks.

Do not invent a health-risk score.

### 11. Primary Coach priority

Finalize primary action ordering as:

1. **Accepted active Stretch Quest**
2. **Due Personal Lab retest**
3. **Offered Stretch Quest**
4. **Active Daily Quest**
5. **Available Personal Lab retest**
6. **Experiment Suggestion**
7. Current-period resolved acknowledgement only when it is still intentionally waiting for owner acknowledgement

Weekly Focus remains the compact persistent strip and does not compete for the primary slot.

If a newly completed Stretch acknowledgement is shown, it must not indefinitely block a genuinely due Lab item. Use bounded/local acknowledgement semantics consistent with H2B.

### 12. Daily Quest remains accessible

When a Stretch or Lab item occupies the primary slot:

- the Daily Quest remains accessible from Coach inbox
- it does not disappear
- it does not reroll
- its completion/reconciliation continues normally

### 13. Coach inbox hierarchy

Use one compact inbox with sections/order:

- **Stretch**
- **Today**
- **Lab**
- **This week**

Only render sections that have content.

Lab may contain more than one derived item, but keep the list compact and bounded.

Use the existing deterministic list limits/order; do not dump an unbounded Lab backlog into Today.

A reasonable H2C maximum is:

- 1 primary Lab item
- up to 2 additional Lab items in the inbox

If more exist, provide `Open Lab` / `See more in Lab` rather than rendering all of them.

## Snooze / “Not now”

### 14. Add owner-only snooze mutation

Add a repository-consistent Coach mutation for a derived Lab item.

The mutation must receive enough identity to safely snooze the exact current item:

- item kind
- source key
- source fingerprint

Before writing snooze state:

- rederive/revalidate the current Lab item
- require the supplied fingerprint to still match
- return 409/stale if the item is no longer current

Then upsert the 7-day snooze.

Repeated identical snooze requests must be idempotent.

### 15. Snooze UI

Derived Lab items may show:

- `Review`
- `Not now`

`Not now`:

- removes it from Coach attention for the snooze window
- does not change Lab itself
- has no punishment
- awards nothing
- does not create a replacement of the same item
- may allow the next independently eligible Coach item to become primary

Use neutral copy such as:

> Hidden from Coach until Oct 6. It is still available in Personal Lab.

Do not use “dismissed forever.”

## XP / reward boundary

### 16. Surfacing/reviewing Lab is not rewardable completion

H2C does not award XP.

More importantly, future H3 must not interpret these actions as achievement:

- Lab item surfaced
- Lab item opened
- Lab item snoozed
- Experiment Suggestion reviewed
- Experiment Suggestion accepted/created

H2C should preserve enough item/source identity for H3 to later reward a **real benchmark result or completed experiment outcome** if that is designed later.

Do not assign a Coach reward band to derived Lab attention just because it appears in Coach.

## Today cleanup

### 17. Remove duplicate standalone retest attention

Once Coach successfully surfaces due retest attention, remove the separate owner `LabRetestCard` from Today so the same retest does not appear twice.

Do not remove the underlying Today/Lab data if other consumers still need it.

Do not remove the benchmark page’s Retest section.

### 18. Existing Experiment status card

The existing Today Experiment card for scheduled/active/review-ready Experiments may remain as a lower-page status surface in H2C.

It is not the same as a derived Experiment Suggestion.

H2C does not need to redesign the entire active Experiment lifecycle into Coach.

However:

- avoid duplicate “Personal Lab” attention copy where Coach already owns the same retest/suggestion
- preserve review-ready Experiment actions
- preserve existing Lab routes and result finalization

## Coach polish

### 19. Resolve primary-slot transition quirks

Audit and clean up transitions among:

- active Stretch
- offered Stretch
- completed Stretch acknowledgement
- Daily Quest
- Lab item
- no primary item

Requirements:

- a terminal task does not block a higher-priority current action indefinitely
- passing/snoozing immediately reveals the next eligible item from the already returned/current state where possible
- no accidental same-period reroll
- no flicker from briefly selecting stale state before reconciliation completes
- no duplicate primary + inbox presentation of the same item unless the inbox intentionally mirrors all current items

### 20. Empty/quiet states

Coach should be quiet when nothing meaningful needs action.

Do not invent filler to keep the primary slot populated.

If Weekly Focus exists but there is no primary action:

- show the compact Weekly Focus without a large empty quest body

If Coach truly has no current content:

- it may render nothing

Do not add generic motivational wellness copy.

### 21. Navigation behavior

All Coach links/actions must preserve current app-prefix behavior.

Opening a route from:

- primary Coach
- Coach inbox
- Lab item
- Stretch
- Daily Quest

must close the relevant sheet/inbox and not leave an overlay behind after navigation.

Reuse the route-change close behavior pattern already established elsewhere in the app.

### 22. Dialog/sheet accessibility

Polish Coach inbox, Log it, End Stretch, and any Lab detail/snooze confirmation surfaces.

At minimum:

- sensible dialog labels
- Escape closes non-destructive sheets/dialogs
- initial focus enters the dialog or first meaningful control
- focus returns to the invoking control when feasible
- background overlay does not trap pointer interactions incorrectly
- buttons retain >=44 px/min-h-11 touch targets
- approximately 390 px viewport does not horizontally overflow

Do not add a UI framework solely for this.

### 23. Reduced motion

Continue using the existing motion vocabulary.

- no count-up animations
- no animated health/performance numbers
- reduced motion removes panel/scrim/notice movement
- Lab Coach items use the same motion semantics as existing Coach

## Cross-domain reconciliation

### 24. Refresh Coach after actions that can change Coach truth

H2A/H2B already reconcile after several canonical changes.

H2C must audit and ensure Coach refreshes after owner actions that can affect:

- Daily Quest completion
- Stretch completion
- Lab retest eligibility
- Experiment Suggestion eligibility/fingerprint

At minimum consider:

- Training save/edit/delete
- Nutrition log/update/delete
- Body measurement save/edit/delete
- Activity refresh/import if current UI can trigger it
- benchmark result create/invalidate
- benchmark protocol version change/archive
- Experiment Suggestion acceptance
- Experiment lifecycle changes that cover/uncover a benchmark

Prefer a shared invalidation/refresh mechanism over scattered ad-hoc duplicate state logic if the current app architecture allows it.

Do not poll continuously.

## API/auth/demo boundaries

### 25. Owner-only Coach/Lab state

Snooze mutation is owner-authenticated through the existing single `/api` function.

Preserve:

- anonymous 401
- non-owner 403
- method validation
- current Lab auth
- current Coach auth

### 26. Public demo

Demo remains:

- anonymous
- synthetic
- read-only
- provider-free

If demo shows synthetic Personal Lab attention, it must be compiled/static demo data and must not call:

- owner Coach API
- Lab API
- database
- Gemini

## Provider boundary

### 27. Coach Lab surfacing is free

Opening Today, Coach, or Coach inbox must not:

- call Gemini
- reserve `ai_usage`
- call Home-AI
- call Europe PMC

Only the existing explicit `Draft proposal` action on the Lab Suggestion review page may invoke Gemini under the existing AI ledger/gate.

Do not add a new AI request type.

## Backup/export

### 28. Snooze persistence

Add the new snooze table to the appropriate backup/portable inventory.

The snooze is owner preference/state, not a Health measurement.

Round-trip:

- item kind
- source key
- source fingerprint
- snoozed-until date
- timestamps as appropriate

Do not export model prose or AI drafts; none should be stored by H2C.

## Non-goals

Do not implement in H2C:

- XP / reward wallet
- spendable XP / lifetime XP
- reward dollars
- levels/ranks/streaks
- theme unlocks
- Personal Lab result XP
- automatic acceptance of Experiment Suggestions
- AI-generated Coach tasks
- persistent Experiment Suggestion content in `coach_tasks`
- Goal observation Experiment Suggestions
- new Lab protocols
- new benchmark algorithms
- new Goal kinds
- distance/pace Training
- reps/duration/skill Goal expansion
- routine builder
- saved routines
- Mind tab
- notifications/background jobs

Those belong to H2D/H3 or later.

## Existing behavior that must remain unchanged

- H2A Weekly Focus / Daily Quest generation and lifecycle
- H2A manual Training and self-report completion
- H2B Stretch lifecycle, cooldown, provenance, and safety rules
- one current Stretch invariant
- Goal authority/version semantics
- canonical Training authority
- benchmark retest state authority
- Experiment Suggestion fingerprint/acceptance semantics
- Experiment Suggestion GET remains provider-free
- Draft proposal remains an explicit owner-triggered AI action
- Apple workouts remain Activity, not Training
- Personal Lab Experiment/Result immutability rules
- Phoenix calendar semantics
- demo isolation
- backup/export integrity
- shared motion/reduced-motion behavior

## Edge cases

Cover at least:

### Lab derivation

- due retest
- available retest
- waiting-minimum retest excluded
- unconfigured retest excluded
- no-baseline suggestion
- due-retest Experiment Suggestion deduplicated against direct retest
- multiple due retests ordered by existing authority
- suggestion disappears after acceptance
- benchmark becomes archived
- protocol version changes
- benchmark result changes fingerprint

### Snooze

- first snooze
- repeated identical snooze
- hidden before resurfacing date
- resurfaces on/after D + 7
- fingerprint changes during snooze and item resurfaces immediately
- stale fingerprint mutation returns conflict
- snooze does not mutate Lab rows
- snoozing primary reveals next eligible item

### Priority

- active Stretch + due retest + Daily Quest
- due retest + offered Stretch
- offered Stretch + Daily Quest
- Daily Quest + available retest
- available retest + Experiment Suggestion
- completed Stretch acknowledgement + due retest
- no primary but Weekly Focus
- nothing meaningful

### Refresh

- benchmark result creation removes/changes Lab item
- benchmark result invalidation changes Lab item
- Experiment Suggestion acceptance removes suggestion
- Experiment state covering a benchmark removes suggestion
- Training save completes Stretch and Coach updates
- Nutrition/Body changes still reconcile Daily Quest

### UI

- Lab primary card
- Lab item in inbox while another item is primary
- Not now
- stale-snooze conflict
- inbox section order
- route closes inbox
- dialog Escape behavior
- focus behavior
- approximately 390 px
- reduced motion
- no duplicate standalone Today retest card

## Tests required

Add focused tests for every new path.

At minimum:

1. **Lab attention domain tests**
   - retest mapping
   - deterministic fingerprint
   - suggestion mapping
   - deduplication
   - priority
   - bounded inbox selection

2. **Snooze persistence/service tests**
   - 7-day semantics
   - idempotent upsert
   - fingerprint-sensitive visibility
   - stale mutation conflict
   - no Lab mutation
   - Phoenix dates

3. **Coach service tests**
   - derived Lab items in read/ensure
   - no Lab persistence in `coach_tasks`
   - primary ordering
   - snooze reveals next item
   - existing H2A/H2B lifecycle unaffected

4. **Lab integration tests**
   - due/available retests
   - no-baseline suggestion
   - due-retest dedupe
   - acceptance changes Coach eligibility
   - protocol/result changes change fingerprint

5. **API/auth tests**
   - owner snooze
   - anonymous 401
   - non-owner 403
   - wrong methods
   - stale fingerprint 409

6. **UI tests**
   - one primary Coach attention item
   - Lab / Today / Stretch / This week inbox hierarchy
   - Review and Not now
   - no duplicate Today LabRetestCard
   - sheet close/navigation
   - keyboard/Escape where practical in current test stack
   - mobile markup/touch targets
   - reduced motion

7. **Provider-boundary tests**
   - Coach read/ensure with Lab items does not call Gemini
   - no `ai_usage` reservation
   - Draft proposal path remains the only existing suggestion-AI path

8. **Backup/export tests**
   - snooze table round-trip
   - migration head updated

9. Full regression:
   - `npm test`
   - `npx tsc -b`
   - `npx eslint .`
   - `npm run build`

Do not use or mutate the owner's production database in tests.

## Acceptance criteria

V2-H2C is complete when all are true:

1. Existing deterministic Personal Lab opportunities can appear inside Coach.
2. Lab eligibility remains derived from existing retest/suggestion authorities.
3. Experiment Suggestion content is not copied into `coach_tasks`.
4. Coach Lab surfacing causes zero provider/AI spend.
5. Due and available benchmark retests are supported.
6. Existing Experiment Suggestions are supported without auto-acceptance.
7. Direct retest attention deduplicates equivalent due-retest Experiment Suggestion attention.
8. `Not now` snoozes the exact current fingerprint for 7 Phoenix calendar days.
9. A changed fingerprint may resurface before an old snooze expires.
10. Snoozing never mutates benchmark/Experiment/Goal truth.
11. Primary order is active Stretch → due Lab retest → offered Stretch → Daily Quest → available Lab retest → Experiment Suggestion.
12. Weekly Focus remains compact and outside primary competition.
13. Daily Quest remains available in inbox when displaced.
14. Inbox hierarchy is Stretch / Today / Lab / This week.
15. Coach Lab list is bounded and provides an Open Lab path for overflow.
16. The standalone owner Today retest card is removed once Coach owns retest attention.
17. Existing scheduled/active/review-ready Experiment status behavior remains available.
18. Route/navigation does not leave Coach overlays open.
19. Dialog/sheet interaction is usable around 390 px and respects touch targets.
20. Reduced-motion behavior remains intact.
21. Coach refresh/reconciliation occurs after relevant Lab and Health mutations without continuous polling.
22. Lab surface/review/snooze/accept actions do not earn or define XP.
23. New snooze state is backed up/exported appropriately.
24. Existing H2A/H2B, Lab, Goal, Training, demo, provider, and calendar invariants remain intact.
25. All tests, typecheck, lint, and production build pass.

## Required completion report

When finished, report:

1. Files changed.
2. Migration added, exact filename, whether it was applied anywhere, and resulting migration head.
3. Lab snooze schema and 7-day/fingerprint semantics.
4. Derived Coach Lab DTO/model.
5. Retest candidate mapping and fingerprint.
6. Experiment Suggestion mapping and deduplication.
7. Final primary priority rules.
8. Inbox hierarchy/bounded overflow behavior.
9. Not-now mutation and stale handling.
10. Exact provider boundary / proof that Today Coach remains free.
11. Today retest-card cleanup.
12. Cross-domain refresh/invalidation changes.
13. Dialog/navigation/mobile/reduced-motion polish.
14. Backup/export changes.
15. Tests added/updated and final counts.
16. Results of:
    - `npm test`
    - `npx tsc -b`
    - `npx eslint .`
    - `npm run build`
17. Manual QA performed at desktop and approximately 390 px.
18. Deviations, unresolved questions, risks, or H2D follow-up.
19. Documentation updated (`DEV_STATE.md`, `DECISIONS.md`, and any durable manual/roadmap amendment actually required).
20. Final commit SHA and confirmation that it was pushed.

When implementation is complete, update `docs/ai/DEV_STATE.md` to the actual resulting product state, reset this file to `No active implementation task`, commit, and push per `AGENTS.md`.
