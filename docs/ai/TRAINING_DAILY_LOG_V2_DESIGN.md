# Training Plan 2.0 + Unified Daily Log — Detailed Design and Implementation Contract

**Status:** DESIGN ONLY — approved product direction; no implementation authorized by this document  
**Version:** 1.0  
**Date:** 2026-10-11  
**Repository:** daurham/daurham-health  
**Design branch:** design/training-daily-log-v2-20261011  
**Owner decision:** Preserve existing health history and domain ownership; redesign the experience and calculations instead of resetting records.

> This document is a repo-local implementation specification, not evidence that features have shipped. Follow migration, testing, and deployment gates before making production changes. Do not change the application, migrations, production environment, or main branch merely because this document was written.

## 1. Purpose and product outcome

Training currently treats the planned A/B/C sequence too much like a strict schedule beginning when the plan feature was created. The owner actually trains flexibly: six sessions of A, then six B, then six C, repeating, usually three days per week. The feature was activated in the middle of B and in the middle of a week. Historical workouts must count, interrupted workouts must combine intelligently, and starting C early must not falsely finish B.

Daily Check-in currently feels assembled from separate modules: water and bowel trigger full refreshes; wellness has its own Save action; Context is another page; historic supplement adherence is hidden in supplement-management details; and some native date fields overflow on mobile. The goal is one date-centered, fast, theme-rich Daily Log, while preserving the underlying domain records.

**Outcome:** The product adapts to actual recorded behavior, presents rich, understandable progress views, respects uncertainty, and keeps data correction safe.

### Decisions explicitly approved

1. Weekly training progress is separate from routine block progress. A qualifying ad-hoc day can complete a 3/3 weekly target without advancing B.
2. A qualifying training day has at least **three distinct performed exercises across all canonical Training logs for the same local calendar date**, even if those exercises were entered in multiple ad-hoc workouts.
3. A/B/C blocks each have independent progress. If B is 5/6 and C is trained, B remains 5/6 and C becomes 1/6; the current pointer remains on B.
4. A full B 6/6 completion visibly completes B and makes C current; working B again begins a *new B block* at 1/6 rather than permanently remaining 6/6.
5. A block may be explicitly ended early; no unperformed workouts should be fabricated.
6. Existing historical workout data should be used to propose the initial progress position, with owner review and correction.
7. All derived counts should reflect current canonical data, including later historical corrections.
8. Preferred training weekdays are flexible guidance, not compulsory rest/training classifications.
9. Daily Log has one selected Health date across hydration, bowel, wellness, supplements, and Context.
10. Historical supplement dose actions are first-class; taken/skipped/unknown remain distinct.
11. Water, bowel, and supplements are fast inline actions; wellness and notes use intentional Save flows; no whole-page visual refresh after each tap.
12. Reusable date controls must work on narrow mobile viewports, including workout forms and Context.
13. Use the existing theme system to deliver genuinely colorful, palette-aware interfaces in light and dark mode.
14. Preserve the existing canonical database domains, XP ledger invariants, historical plan versions, and read-only demo boundaries.

## 2. Current state and integration points (reviewed 2026-10-11)

- **src/domain/training-plan.ts:** versioned plan schema; repeated A/B/C blocks (1–12), preferred weekdays, optional overrides, strict next-expected routine replay helper, progress in a single current sequence position.
- **server/training/plan-service.ts:** weekly completed-programmed-session count begins no earlier than the new plan's effective date; rotation progression queries only programmed sessions created after the plan version timestamp. This causes the reported midweek/historical mismatch by construction.
- **src/features/training/TrainingPlanCard.tsx:** current summary emphasizes programmed sessions this week, one next routine, and today's scheduling intent.
- **src/features/training/TrainingPlanPage.tsx:** baseline editor plus per-day override and moving controls. Owner wants less day-by-day bureaucracy.
- **migrations/0050_training_plan_repeat_blocks.sql:** permits repeated sequence slots and a start-position anchor. Do **not** assume this is sufficient for independent multi-block progress.
- **src/domain/training.ts:** canonical Training session kinds are programmed, ad_hoc, and experiment; exercise records have identifiers and sets/measurements. Apple Activity workouts are not canonical Training sessions.
- **src/domain/daily-signals.ts:** separate hydration events, bowel events, and daily wellness; unknown values are supported. Events already carry date and creation timestamps.
- **src/features/daily-signals/DailyCheckInPage.tsx:** mutations await a refetch of the entire selected day; water/bowel actions trigger a jarring loading state.
- **src/features/context/ContextPage.tsx:** date-scoped daily tags and notes live behind separate navigation.
- **src/features/supplements/SupplementsPage.tsx:** past doses can already be entered per supplement in an expanded management view; this capability needs a date-centered entry point.
- **src/index.css:** already implements **24 palette definitions**, light/dark presentation, semantic color tokens, chart colors, XP/reward color and reduced-motion support. New views must reuse this system.

Current docs and repo behavior are implementation inputs, not a statement about the owner's production database migration status. Confirm actual production schema before shipping.

## 3. Canonical definitions and calendar semantics

### 3.1 Qualifying training day

A **qualifying day** is determined from canonical Training records, not the number of forms submitted:

1. Group completed/saved Training session records by the app's configured Health calendar date, respecting HEALTH_CALENDAR_TIMEZONE (original owner deployment: America/Phoenix).
2. Collect *distinct exercise-definition identities* that have evidence of performance on that day across any number of Training logs. Require a meaningful recorded performance: a valid working set or completed reps/duration/distance/completion measurement; do not count unperformed template slots, placeholders, or purely empty drafts. A warmup-only placeholder does not qualify.
3. **Three or more distinct performed exercises = one qualifying training day.** The same push-up exercise logged twice that day contributes one distinct identity. Exercise aliases should resolve to canonical exercise identity where possible; do not de-duplicate unrelated exercises by fuzzy name alone.
4. The weekly target counts qualifying calendar days **once each**, not sessions. If two ad-hoc logs contain push-ups, crunches, and squats collectively, the day contributes one to the week.
5. All canonical Training session kinds can contribute performed exercises to the daily tally, provided they are ordinary logged training evidence. Apple Health/HAE Activity records, imports awaiting owner review, and speculative estimates never automatically qualify.
6. The display should say “Training days this week” or “Qualifying workouts this week”; never label them “programmed sessions” if ad-hoc sessions can qualify.
7. Monday–Sunday week boundaries use the configured Health timezone. Display 0/3, 3/3, 4/3 as recorded; no cap at target, and no missed-day penalty.
8. For future goal-specific strength/cardio filtering, retain a clean extensibility seam, but do not make selecting a workout category mandatory for this redesign.

**Examples:** Monday morning push-ups + crunches and evening squats = 3 exercises, **1/3 weekly**. Three separate logs of push-ups = one distinct exercise, **0/3**. Two B exercises plus one unrelated ad-hoc exercise = **1/3 weekly**, irrespective of B-block credit.

### 3.2 Routine-block credit (separate from weekly count)

A routine's **block progress** is a distinct calculation. To avoid an incidental single B exercise advancing B just because unrelated exercises made the day qualify:

- Default automatic block credit requires **three distinct performed exercises attributed to that routine code on the same Health date**, across all Training entries for that routine; at most one block credit per routine per day.
- Routine attribution comes from explicit saved workout routine/template association, not AI guesses based solely on exercise names.
- An ad-hoc-only day can qualify weekly without touching any A/B/C block.
- If one day's total qualifies weekly but routine-specific performed work is below three, show a small optional **Count toward routine…** reviewed override when the owner legitimately finished a shortened programmed session. Do not award that block credit silently.
- If separate complete A and C workouts, each with at least three performed routine-attributed exercises, occur on the same day, both blocks may earn one credit; the weekly counter still increases only once.
- Explicit credit/override actions must be idempotent, reversible, and tied to the actual Health date and routine block instance; never create fake workouts.

This per-routine threshold and override behavior is a recommended implementation interpretation of the approved three-exercise principle. If the detailed workout UI reveals a more natural attribution, preserve the higher-order guarantees: **one weekly day credit**, no accidental block credits, clear owner correction.

### 3.3 Three separate plan concepts

- **Weekly target:** “Train on three qualifying days per week”; does not depend on routine order.
- **Rotation order:** A → B → C → A; each routine has an intended number of credits per block (six in the owner's case).
- **Preferred weekdays:** Monday/Wednesday/Friday guidance and optional hints, *not* mandatory schedule dates or pre-authored rest days. Missing workout evidence is “No workout recorded,” not “Rest completed.”

## 4. Independent blocks, cycles, and the current pointer

### 4.1 Required model

The existing single strict next-slot index is insufficient. Introduce explicit **routine block instances**, each with:

- a plan/version identity and an immutable routine-code snapshot;
- the intended target count (e.g. six);
- a monotonic generation/cycle identity so the next B block is distinguishable from the completed prior B block;
- a deterministic collection of attributed qualifying Health dates and linked Training evidence;
- derived progress (e.g. 5 of 6);
- a lifecycle state: upcoming, current, complete, or ended_early;
- an optional owner-reviewed early-ending decision with effective date/time and reason;
- change/audit timestamps and clear invalidation behavior.

Canonical Training workout/sets remain the source of performed exercises. The block-instance structure anchors which cycle credits belong to and records owner decisions; do not use a mutable “total completed” counter as the sole truth.

**Current routine** is a separate pointer to the earliest not-closed block in sequence order for the active traversal of the rotation. It does not prevent another routine from receiving valid progress.

### 4.2 Mandatory examples

| Action | B active block | C active block | Current pointer | Explanation |
|---|---:|---:|---|---|
| Start | 5/6 | 0/6 | B | B unfinished |
| Train valid C | 5/6 | 1/6 | B | C progress accrues independently |
| Train valid B | 6/6 completed | 1/6 | C | Finished B; C retains 1/6 |
| Train valid B again | 1/6 in **new B block** | 1/6 | C | Do not reactivate B's completed block |
| Complete C | new B still 1/6 | 6/6 completed | A in next cycle | Other early progress remains stored |

For ordinary sequential work: A goes 6/6 (completed) → current B; B goes 6/6 → current C; C 6/6 → new A block at its actual next-cycle count. Completed block history remains readable, but the active block for a routine becomes the new generation when post-completion training resumes.

### 4.3 Cycle allocation invariants

- Never reuse a closed block instance for later credits.
- A new routine block receives credits only from evidence legitimately assigned to that generation.
- Persist enough anchor/closure decisions to replay deterministically if a workout is backdated, edited, removed, or reclassified.
- Do not jump over an unfinished current routine because another routine has accrued credits.
- When current closes, advance to the next ordered block; if an already-finished future block exists, transition through it deterministically without double-completion.
- Plan edits changing block targets/sequence must version intent and explicitly reconcile existing active blocks; do not silently erase credited work.
- If a correction makes a previous closure contradictory, preserve the explicit decision but surface **Needs review** rather than silently inventing or deleting completion evidence.
- Show full/early completions distinctively: full 6/6 uses success styling; ended early reads “4/6 · Ended early” with a separate treatment (not a dishonest green 6/6).
- Unavailable/deleted routine templates must not delete historical block instances or evidence.

### 4.4 Finish block early

Accessible from the routine details menu, not a prominent daily prompt:

1. Show current count and target: “Finish B early at 4 of 6?”
2. Confirm that this closes the current block **without creating missing sessions**.
3. Optional short reason, e.g., injury, schedule change, recovery, or other. This is an owner annotation, not a medical recommendation.
4. Record a dated auditable close decision associated with the block generation.
5. Advance the current pointer as if that block were closed; preserve already-earned progress for the next routine.
6. Allow an explicit Undo/Reopen path. Reconciliation after historical corrections must not erase the owner's original decision.

### 4.5 Start midway and history reconciliation

An existing user must not have to start A 1/6 merely because plan tracking is newly enabled.

- Read historical canonical workout dates, routine codes, saved exercises, and evidence before plan creation.
- Calculate a **proposed** current routine, per-block counts, current weekly qualification, and confidence/evidence summary.
- Display a compact review: “We found B work before you created this plan. Suggested B 4/6; 2 qualifying training days this week.”
- Show which dates/entries contributed and which entries were not credited. Be transparent about incomplete or ambiguous history.
- Owner can accept, change the anchor position, and choose whether pre-plan sessions are included in a new routine-block history. This is a plan attribution decision, not new workout records.
- On a fresh/no-history instance, begin A 0/6 (next planned session A 1/6) or pick a manual starting position.
- Edits to a weekly target or preferred weekdays preserve routine-block state. Editing routine order/targets triggers an explicit migration/reconciliation preview.
- Historical plan views should use the version and evidence valid as of that date, avoiding future workouts leaking backward.

## 5. Training user experience

### 5.1 Training dashboard, not a day-by-day planning form

Implement the visual language from the reviewed mockups, adapted to the actual app layout.

    TRAINING                                      Edit plan
    This week                         2 / 3 days
    Mon ✓   Tue ·   Wed ✓   Thu ·   Fri ◯   Sat ·   Sun ·

    ROUTINE ROTATION
    A  6/6  [■■■■■■]   Completed
    B  5/6  [■■■■■□]   CURRENT
    C  1/6  [■□□□□□]   Working ahead

    NEXT PLANNED
    Routine B · Session 6 of 6
    [Start Routine B]        [Adjust progress]

- A compact weekly seven-day strip uses real qualification, not scheduled intent. Today's marker and preferred days may be indicated subtly, but should not look like misses.
- Colored segmented progress for each routine, with legible numeric fractions, status labels, and useful action routes.
- Once B completes, C becomes current; C's prior 1/6 remains visible.
- On later B activity, display the **new B block** separately rather than turning the old completed block back into unfinished.
- The page favors “Start next workout,” “View history,” and “Adjust progress” over repetitive scheduling buttons.
- Retain an advanced Plan Settings editor for target, sequence, repeat counts, preferred weekdays, and version notes.
- The plan card on Today should be a shorter summary reusing the same progression view/model.

### 5.2 Visual states

| State | Label | Progress behavior | Visual language |
|---|---|---|---|
| Current | Current | Active count / target | Accent border, primary text, visible “Current” |
| Working ahead | In progress | Independent count / target | Secondary accent progress, no false “Current” |
| Full completion | Completed | Final count / target | Theme success color, check icon, accessible label |
| Finished early | Ended early | Actual count / target | Warning/secondary styling, reason available; never display as 6/6 |
| Future/unstarted | Upcoming | 0 / target | Subdued track, still legible |
| Reconciliation conflict | Needs review | Preserve evidence pending correction | Semantic warning + explicit action |

### 5.3 Entry and correction behavior

- Start from recommended routine, or intentionally choose any other routine.
- Saved logs immediately update weekly and block progress if they meet qualification; show why if they do not.
- If workouts are split, aggregate across the day's logs without duplicating the weekly credit.
- If a session is edited, deleted, re-dated or reclassified, recalculate derived counts and affected generations.
- Corrections may legitimately decrease a visible count; explain with a small, non-blocking change detail.
- All planned/actual views must behave on historical dates and across plan version boundaries.

## 6. Unified Daily Log — interaction contract

### 6.1 One page, one Health date, separate canonical sources

Replace the fragmented Daily Check-in experience with a date-centered **Daily Log**. This is a **unified view/controller**, not a new monolithic database table.

    DAILY LOG                     ‹  Oct 11, 2026  ›
    [date picker]                 [Today]

    💧 Water                  24 oz logged      [+8 oz]
    ●  Bowel                  1 event · Type 2 [Expand]
    ♥  How you feel           3 ratings saved  [Expand]
    ◉  Supplements            3 / 5 recorded   [Expand]
    ✎  Daily context          2 tags, note     [Expand]

All sections use the same selected date, including when navigating directly from Today, Timeline, or a supplement reminder. The date persists via an inspectable route/query, e.g. /check-in?date=YYYY-MM-DD. Previous/next-day arrows and a native/accessible calendar are complementary; future dates are prevented for historical observations.

### 6.2 Section behavior

**Water**
- Compact total for selected day plus quick presets and custom amount.
- On successful post, update just this section from returned event data; avoid a full-page loading skeleton.
- Show undo/remove affordance for a mistaken tap. No hidden reset of the form or scroll position.
- Date-only historical logging does not invent a drink time; preserve recorded time separately.

**Bowel**
- Quick Bristol 1–7 selection; reference chart available without leaving the page.
- Optional detail expansion (urgency, straining, incomplete sensation, note) can be progressively disclosed without complicating a quick entry.
- “No bowel movement” is explicit and mutually exclusive with existing movement events.
- “Not logged” is not the same as zero events.

**How you feel**
- Energy, hunger, soreness, optional stress; load existing values for the selected day.
- Edit as a small draft with explicit Save or Cancel; show saved/unsaved status.
- Selecting a rating should not refresh the page or alter other sections.
- Protect unsaved text/ratings on date change or navigation.

**Supplements**
- Show **all doses scheduled for the selected date**, taking versioned schedules and lifecycle status into account.
- Actions: Taken, Skipped, Clear (unknown); support multiple doses/slots per day.
- A missed log remains unknown, not skipped. Paused/discontinued/not-scheduled items are not secretly counted as missed.
- Backlog prior days directly from Daily Log, including multiple dates in succession.
- Show confirmation inline and preserve the actual recorded-at instant. Do not pretend the owner tapped “Taken” on that historic day.
- Keep dedicated Supplements page for adding/changing supplements, doses, schedules, status, and history; surface a link rather than duplicate management forms.
- Refactor the existing buried “Record a past dose” flow to share the same canonical API/actions and selected-date component.

**Context**
- Display daily tags and optional notes inline, with a compact expandable editor and explicit Save/Cancel.
- Keep the existing Daily Context tables/API and link compatibility. Date edits should target exactly the selected Health date.
- If context contains deliberate rest/recovery tags, display them as retrospective owner reports; no automatic empty-day rest claims.

### 6.3 Saving and network experience

- **Quick actions:** Water, bowel, supplement. Optimistic/local section update where safe, in-flight lock/idempotent request key, server reconciliation, retry/error with rollback if failed.
- **Draft actions:** Wellness and Context. Load draft once for selected date; Save only its domain; no rerender of unrelated sections.
- Avoid GET-of-everything and top-level skeleton after every mutation. Prefer one domain refresh or returned server entity.
- Keep date-scoped request cancellation/ordering so a slow response from yesterday never overwrites today's visible state.
- Preserve scroll position, expansion state and focus on success; announce changes accessibly.
- Detect duplicate taps; retries must not duplicate hydration/bowel entries or XP.
- Preserve an explicit distinction between **effective Health date** and **recorded-at timestamp** across domains.

## 7. Shared Today and date-field patterns

- Today stays a fast overview with compact actions and links into Daily Log. Share components/domain hooks; avoid maintaining separate, drifting date-specific logic.
- Reuse a single selected-date contract everywhere in Daily Log, including supplements and Context.
- Introduce a reusable responsive HealthDatePicker/date-navigation component with min-width:0 containment, max-width:100%, correct input sizing, calendar fallback, and no clipped calendar icon.
- Audit date inputs in Daily Check-in, Context, Training workout create/edit, Supplements management/history, and other Health forms found in code search. Fix at shared-component level rather than a one-off CSS patch.
- Test narrow Safari/iPhone, dynamic text size, keyboard appearance, landscape, dates with long localized labels, and light/dark variants.
- The configured Health calendar timezone is authoritative; avoid implicit UTC conversions that shift the Health day.

## 8. Theme-rich visual system — REQUIRED, not decorative polish

The user explicitly wants the polished in-chat progress cards to **ship in the actual application** and to **show off theme colors**. Do not implement the new surfaces as mostly grayscale boxes with one blue button.

### 8.1 Existing theme architecture

- src/index.css defines 24 palette choices plus light/dark variants. Existing palettes include Classic, Forest, Ocean, Sunset, Plum, Aura, Saiyan Dawn, Grand Line, Hidden Leaf, Super Saiyan Gold, Spartan, Namek Sky, Wasteland, Bonfire, Clone Legion, Silver Instinct, Crimson Surge, Sun God, Sage Storm, Mjolnir Night, Vault Neon, Abyss Knight, Republic Red, and Cosmic Instinct.
- Use existing semantic tokens: --health-accent, --health-accent-secondary, --health-accent-muted, --health-accent-fg, --health-success, --health-warning, --health-danger, --health-info, --health-reward, --health-surface, --health-surface-soft, --health-text, --health-text-muted, --health-border, --chart-ink, --chart-secondary, --chart-tertiary.
- Theme and appearance are user preferences; do not persist new palette selection inside workout or daily observation rows.

### 8.2 Concrete visual requirements

1. **Routine series identity:** Show A, B and C with **three distinguishable hues** using a semantic, theme-derived series palette. Suggested initial mapping: A = chart-ink/accent, B = chart-secondary/secondary-accent, C = chart-tertiary/reward; add dedicated theme-responsive routine tokens if contrast/identity is insufficient. Never hard-code one universal blue/green/orange palette.
2. **State overlay:** Completed full block uses theme success semantics, early-ended uses theme warning semantics, current uses accent emphasis. Do not use only hue: preserve text labels, icons, numeric fractions, and progress shape.
3. **Weekly strip:** Actual completed day uses success/primary contrast; today and preference outlines use accent/secondary; blank days are neutral, *not red failed marks*.
4. **Daily Log domains:** Water uses info/aqua family; bowel a distinct contextual neutral/secondary hue; wellness uses a distinct softer accent; supplements a vivid second accent; Context a muted accent; XP uses reward/gold. Let each section have its own recognizable icon and tiny tinted rail/dot/chip without over-coloring the entire page.
5. **Cards and gradients:** Restrained tinted headers, subtle accent edges, segmented bars and small colored metric chips. Use palette-aware backgrounds/surfaces and non-distracting movement. Prefer one prominent primary action.
6. **Charts:** Use semantically distinct series colors and accessible legends for trend/history views. Keep color meaning consistent with existing Progress charts and theme unlocks.
7. **Responsive composition:** Mobile first. Three routine rows and seven-day strip must remain readable at iPhone widths without horizontal spill. More generous, balanced layout on desktop.
8. **Accessibility:** Test contrast at least 4.5:1 for normal text and ~3:1 for meaningful UI boundaries/graphics; focus indicators, no color-only meaning; honor prefers-reduced-motion; do not animate health measurements.
9. **Preview/test matrix:** At minimum inspect Classic, Forest, Ocean, Sunset, Plum, Aura and representative high-chroma progression themes in both light/dark; run automated token-based contrast checks where practical. Confirm that every existing palette remains functional.
10. **Styling discipline:** Use semantic Tailwind/CSS variables; avoid repeated hard-coded hex codes in React and ad-hoc one-off styles. New domain-specific tokens should derive from or be specified alongside the palette system.

### 8.3 Visual acceptance screenshots

Capture equivalent mobile/desktop QA screenshots or reproducible component stories for:
- weekly 0/3, 2/3, 4/3;
- B 5/6 current with C 1/6 working ahead;
- B full completion + new B block 1/6 after further B work;
- ended-early at 4/6;
- missing/unknown Daily Log data;
- historical date with 3/5 supplements recorded;
- light/dark theme comparison with visibly distinct routine/domain colors;
- narrow iPhone date selector with no overflow.

## 9. Data model, API and migration plan

### 9.1 Protect canonical data

Retain workout_sessions, workout exercises/sets, routine templates, existing training plan versions, hydration/bowel event records, daily wellness, Daily Context, supplement schedules/lifecycle/adherence, and the XP ledger. No deletion or re-import of historical data to initialize a new plan.

### 9.2 Proposed durable additions (inspect schema before naming the SQL migration)

Design the smallest migration that supports deterministic, replayable attribution:

- routine block identity/generation and stable linkage to its plan/program version and routine code;
- initial owner-confirmed historical anchor/attribution boundary;
- explicit ended-early/reopened decisions, optional reason, audit times;
- exceptional owner-reviewed routine-day credit assignments when automatic attribution is insufficient;
- uniqueness/idempotency for a routine block + Health date + credit source and for owner correction actions;
- a versioned, reconcilable transition rule when plan target/sequence changes.

Prefer deriving per-date exercise counts and progress from workout canonical evidence rather than storing an untrusted increment-only counter. Derived summaries may be cached but must be invalidated on all relevant history mutations.

Use the **next available numbered migration after inspecting repository and production schema heads**; do not assume migration 0050 is deployed. Update backup/restore, portable export, seed/demo fixtures and tests for any new owner data. Build a reversible or safe forward-only migration with a verified rollback/backup strategy. No production schema writes without explicit approval.

### 9.3 Suggested deterministic domain functions

Implement pure, well-tested builders, keeping UI thin:

- groupTrainingEvidenceByHealthDate(sessions, sets, timezone)
- eligibleExerciseIdentitiesForDate(evidence)
- buildWeeklyQualification(days, weeklyTarget, weekStart)
- buildRoutineBlockLedger(planVersions, anchors, evidence, ownerDecisions)
- reconcileHistoricalPlanEntry(existingHistory, proposedPlan)
- deriveRoutineStatesAndCurrentPointer(blockLedger, asOf)
- buildUnifiedDailyLogSnapshot(date, hydration, bowel, wellness, supplements, context)

Function names illustrative; favor repository naming conventions. The server must perform authoritative calculations, not depend on client-side guessed counts.

### 9.4 API behavior

- GET Training Plan summary should expose weekly qualified **days**, per-routine current block states/generations, completed-block history, recommended next routine, and evidence explanation for onboarding/corrections.
- Plan configuration changes should be versioned and keep prior intent inspectable.
- Explicit endpoints/actions for accepting historical anchor, ending/reopening a block, and exceptional routine credit attribution should enforce owner auth and idempotency.
- Existing Training session save/edit/delete paths must invalidate relevant derived week/block views.
- Daily Log should retrieve one consistent date snapshot or parallel domain data without making duplicate canonical stores, and mutate via existing domain-authoritative APIs.
- All date-specific endpoints validate configured calendar date; no future observation backfills.
- Maintain owner-only permissions, demo synthetic/read-only guarantees, clear API errors, and bounded queries.

## 10. Corrections, missingness, rewards and safety

- **History is truth:** editing/removing/re-dating a workout recomputes affected weeks and block-generation attribution; no phantom completed session after a deletion.
- **Owner decisions are truth:** explicit early-end and approved historical anchors are durable records, not inferred from workout count. Conflicts become reviewable rather than silently overwritten.
- **Unknown is unknown:** unlogged supplements are not skipped, unlogged bowel is not “zero movement,” no workout record is not proof of planned rest, and missing water is not asserted as zero consumption.
- **Event time vs entry time:** preserve the Health date and actual creation/update timestamps; do not misrepresent backdated records as contemporaneously logged.
- **XP:** adding/correcting/backlogging records must follow existing append-only/idempotent reward accounting, including existing limits for historical participation. No duplicate XP from a refetch, replay or repeated submit.
- **Performance and reliability:** no excessive full-page rerender, unexpected scroll-to-top, multi-request races or repeat provider/AI calls; do not introduce paid services.
- **Experiment and import boundaries:** experiment sessions count toward a weekly day only if they contain valid canonical Training exercises; preserve their experiment linkage. Unreviewed imports and Apple Activity do not rewrite Training or blocks.
- **Medical context:** injury notes may explain an early close but must not automatically declare an injury or prescribe training actions.

## 11. Phased implementation (do not begin under this design-only request)

### Phase A — Baseline audit and test fixtures
- Inspect actual DB schema and current migration status; back up appropriately.
- Inventory current training planner endpoints, workout edit/delete hooks, Daily Log/Today dependencies, theme tokens, and all native date inputs.
- Write failing domain tests for interrupted-day qualification, cross-routine progress, historical onboarding, and recomputation on corrections.
- Verify compatibility with current owner data and clean/demo deployments.

### Phase B — Training domain and storage
- Introduce routine-block generations and reversible owner decisions with safe migration.
- Replace strict next-expected replay with deterministic independently accruing block ledger.
- Implement daily qualification and separate weekly tally.
- Historical anchor preview/confirmation and migration/backup coverage.
- Test version boundaries, timezone, duplicate taps, concurrency, and deletes.

### Phase C — Training UI and themed visualization
- Build reusable theme-aware progress bars, compact weekly strip, routine-state chips and explanation affordances.
- Redesign TrainingPlanCard and TrainingPlanPage; simplify scheduling controls.
- Add adjustment/finish-early/reopen experiences and evidence inspection.
- Integrate on Today and Training; QA all states.

### Phase D — Unified Daily Log
- Assemble date-scoped hydration, bowel, wellness, supplements and Context while preserving existing tables/APIs.
- Build localized quick-action updates with error rollback and draft save protection.
- Surface backdated supplement adherence on selected date.
- Reuse concise sections on Today; maintain legacy links/route compatibility.

### Phase E — Shared date picker and final validation
- Audit every date input (especially Training forms and Context), unify responsive controls.
- Test narrow iPhone Safari, dark/light themes, all palette compatibility and reduced motion.
- Run TypeScript, ESLint, Vitest, production build, DB migration tests, backup/restore tests, and owner mobile QA.
- Validate on a test branch/preview and production-like Neon branch before any deployment.
- Only after approval, explicitly coordinate pending production migrations and main promotion.

## 12. Acceptance scenarios (minimum automated + manual suite)

| ID | Input / event | Required result |
|---|---|---|
| T01 | Plan created Wednesday, qualifying workout already logged Monday | Weekly count includes Monday; no plan-start truncation |
| T02 | One day: morning push-ups/crunches; evening squats; two ad-hoc logs | One qualifying day, three distinct performed exercises, one weekly credit |
| T03 | Multiple logs of push-ups alone | Not qualifying; duplicate exercise identity counts once |
| T04 | Two qualified B days plus one qualifying ad-hoc day | 3/3 weekly; B advances only twice |
| T05 | B 5/6, qualified C day | B 5/6 remains current; C 1/6 working ahead |
| T06 | After T05, qualified B day | B 6/6 full completion; pointer to C 1/6 |
| T07 | After T06, another qualified B day | Completed B stays historical; new B block 1/6; pointer stays C |
| T08 | B 4/6 finished early | Record “4/6 ended early,” no fake sessions; pointer advances |
| T09 | Correction/delete of an old routine workout | Derived progress recalculates; owner decisions remain auditable |
| T10 | Same day two qualified A/B workouts with 3 attributed exercises each | Weekly +1; each eligible routine block at most +1 |
| T11 | Tue workout instead of preferred Mon | Week qualifies normally; no required schedule override |
| T12 | Four distinct qualifying days in week | Display 4/3; not capped |
| T13 | Plan activation midway through B, prior history exists | Owner sees evidence-based proposal and can correct starting point |
| T14 | Change preferred weekdays or weekly target | Existing block counts/anchor unaffected |
| T15 | Plan edit shortens/changing sequence | Reviewable reconciliation, no silent history deletion |
| D01 | Select historical date in Daily Log | All sections display that date consistently |
| D02 | Friday supplement marked Taken on Sunday | Friday shows Taken; recorded-at remains Sunday; no false skip |
| D03 | Supplement schedule paused on historical date | Not counted as missed scheduled dose |
| D04 | Tap +8 oz / log Bristol Type 2 | Only relevant section changes; no page skeleton/scroll reset |
| D05 | Rapid double tap/retry after failure | No duplicate event or XP; clear error/undo |
| D06 | Wellness/Context unsaved draft then change date | Warn or retain draft, do not silently discard |
| D07 | No bowel log and no supplement action | Explicit unknown remains unknown |
| D08 | Legacy Context/check-in links | Correct date and domain actions still work |
| U01 | Narrow iPhone width/date field | No overflow horizontally, controls tappable |
| U02 | Theme switch across 24 palettes and light/dark | Different routine/domain colors, readable labels, no broken surfaces |
| U03 | Reduced motion enabled | No distracting motion/animating health measurements |
| U04 | Fresh owner instance/demo | Empty states are coherent; demo remains synthetic/read-only |
| O01 | Production migrations absent/pending | App feature deployment is gated; no assumption migrations auto-run |
| O02 | Existing backup/restore + export | Roundtrip preserves history, block decisions, and supplement logs |

## 13. Out-of-scope and release constraints

**Out of scope:** a fully prescriptive training calendar; automatic forced rest days; auto AI medical advice; unreviewed workout inference; new paid subscriptions/providers; large new analytics dashboards; redesigning exercise library; reworking entire theme studio; changing unrelated health goals.

**Release rules:** do not touch main or production schema until tested and approved; do not automatically deploy merely after creating this document. Preserve old historical views, run migrations on a branch or production-like copy first, update documentation as actual implementation evolves, and explicitly record any deviation from this contract.

## 14. Definition of done

- The owner can join midweek and mid-rotation without losing truthful historical counts.
- Daily 3-exercise qualification works across interrupted logs.
- B and C can progress independently with a truthful current pointer and block generations.
- Early ending and historical corrections work without fabricated workout data or duplicate rewards.
- The highly visual Training card (weekly strip + themed A/B/C segmented bars) is in the actual app, not only design mockups.
- Daily Log is date-centered, supplement backlog is obvious, inputs feel consistent, and per-section saves do not jarringly rerender the screen.
- Multiple palette hues are intentionally visible and accessible in both light/dark themes; tiny iPhone widths do not clip dates.
- Unit, integration, migration, backup, demo, visual and owner mobile QA pass; rollout follows approved gates.

---

**Design note:** This is intentionally comprehensive enough to become the implementation contract for future phases. It does not supersede docs/ai/CURRENT_TASK.md until the owner explicitly begins implementation. If a detailed code audit uncovers an incompatibility, document the precise change to this spec before modifying production behavior.
