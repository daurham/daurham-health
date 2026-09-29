# Dev state

Snapshot recorded 2026-09-29 after **V2-H2C — Personal Lab + Coach Polish**, on top of V2-H2A Coach Core + Today and V2-H2B Stretch Quests. This is the current health application.

## Git and runtime

- Branch: `main`; package version remains 1.0.0.
- H2C extends the deployed H2A/H2B Coach tree and reuses the existing Personal Lab retest and Experiment Suggestion authorities.
- No new runtime dependency, provider request type, scheduler, or Vercel function was added.
- H2B validation/publication details remain in `docs/ai/H2B_REPORT.md`; H2C details are in `docs/ai/H2C_REPORT.md`.

## Schema and deployment

- Migration head: `0037_coach_lab_snoozes.sql`.
- H2B adds `stretch_quest`, `offered` / `failed`, nullable `accepted_at`, and the frozen `stretch` difficulty/reward band to the existing Coach ledger.
- `coach_task_events` supports failed events. State changes and Stretch events are atomic and deduplicated by lifecycle key.
- A partial unique index enforces one offered/active Stretch for the single owner.
- Existing one-Daily-per-date and one-Weekly-per-week indexes remain unchanged.
- The owner applied `0035_coach_tasks.sql`, `0036_stretch_quests.sql`, and `0037_coach_lab_snoozes.sql`. Production schema is now at migration head `0037_coach_lab_snoozes.sql`.
- `coach_lab_snoozes` stores Coach-only presentation state: Lab item kind, stable source key, exact source fingerprint, Phoenix `snoozed_until`, and timestamps. It does not store Lab suggestion content or canonical evidence.
- Backup and portable export include Coach task/event history plus `coach_lab_snoozes`; inventory schema head is `0037_coach_lab_snoozes.sql`.

## Existing H2A behavior

- One frozen Daily Quest per Phoenix date and one Weekly Focus per Monday–Sunday Coach week; passing consumes its period and never rerolls.
- Existing Goal, Body cadence, Activity, Nutrition, Training, and explicit self-report rules remain provider-free.
- Canonical automatic completions reread their domain authority. Missing Nutrition evidence remains missing.
- Manual physical quests save normal `ad_hoc` Training. Run/hike optional distance remains Coach evidence only.
- Meal prep and journaling remain explicit self-report; they do not create eaten food or mutate Daily Context.
- Manual unloaded Training presets now emit the existing valid `bodyweight` load state; the former `none` value was rejected by the real Training parser. Regression coverage uses that real parser.

## Stretch lifecycle and timing

- First independently eligible offer may appear immediately; all subsequent offers wait at least eight Phoenix calendar days from the prior offer date, regardless of its outcome.
- An offer includes its creation date plus two further dates. Acceptance creates a seven-date inclusive challenge window. Refresh/retry extends neither window.
- Offer → explicit accept → active → canonical completion or neutral ended/unmet (`failed`). Pass is available only before acceptance; an unaccepted closed window is `expired`.
- Accept/pass/end and repeated reconciliation are idempotent. There is no reroll endpoint, reward, streak, penalty, or XP amount.
- Reads/ensure/mutations reconcile; there is no background scheduler.
- Generation takes a transaction-scoped advisory lock followed by a guarded insertion with a fresh READ COMMITTED snapshot; the current-row index and global cooldown guard cover concurrent and terminal-state races.

## Performance authority

- Shared helpers in `src/domain/progress/stretch-performance.ts` support only canonical `programmed`, `ad_hoc`, and `experiment` working sets.
- Eligible baselines require two qualifying session/exercise appearances, latest age at most 21 Phoenix days, all counted appearances within age 42 days. The baseline is the best eligible single set in that window.
- Strength uses the existing high-confidence Epley authority. The frozen pounds target is baseline × 1.02 rounded upward to 0.5 lb. Any valid high-confidence load × reps may reach it; the target is an estimate, not a prescribed bar load.
- Reps/duration use existing unloaded/bodyweight set semantics. Per-side results use the minimum of both completed sides.
- Reps target is +5%, rounded upward to whole reps, minimum +1. Duration target is +5%, rounded upward to five-second increments, minimum +5 seconds. If rounding/minimum exceeds 110% of baseline, the candidate is suppressed. The conflicting contract example 20→25 sec is not emitted.
- Canonical workout date and session creation timestamp must both fit the accepted window. The timestamp must be strictly after acceptance and before the next Phoenix midnight after challenge expiry. Work captured after the window with a backdated date cannot qualify.
- Full PostgreSQL microsecond timestamps are preserved for exact source guards/provenance. No performed instant per set exists; session capture time is the conservative available authority.
- Source session, session-exercise, set, raw load/reps/duration/sides, formula/confidence, derived value, target, and exercise classification are frozen as provenance.
- Offered baselines fail closed after deletion or edits, including raw edits that keep e1RM numerically unchanged. Accepted targets never rebase.
- Completion transitions recheck source identity/raw values/timestamp/classification in SQL to prevent a deleted/edited source between evaluation and transition from winning completion.
- Completed historical provenance stays intact after later canonical deletion; current Training analytics still recompute from existing canonical data. H3 will decide reward-reconciliation policy.
- A best post-acceptance attempt above baseline but below target is progress (`New PR`) and remains active without a completion event.

## Selection and context

- Candidates are generated and ranked deterministically: independently eligible matching active strength Goal relevance, freshness, appearance count, recently trained adjustment, prior challenge penalty, then stable strategy/exercise IDs.
- Avoid the same exercise/strategy inside 30 days whenever an eligible non-repeated alternative exists; an only eligible candidate can repeat after the eight-day cooldown.
- All new Stretch offers are suppressed for `sick`, `pain`, `rest_day`, `unusual_physical_labor`, `unusual_stress`, `poor_sleep_opportunity`, or `baby_night_interruption`.
- Existing challenges stay frozen. Absence of a suppression tag does not imply medical readiness.

## Personal Lab Coach integration

- Personal Lab eligibility remains derived. Coach calls the existing benchmark-retest and Experiment Suggestion authorities; it does not copy suggestions into `coach_tasks`.
- Coach can surface current `due` and `available` benchmark retests plus existing deterministic `benchmark_missing_baseline` / `benchmark_retest_due` Experiment Suggestions.
- A direct actionable retest suppresses the equivalent due-retest Experiment Suggestion only inside Coach presentation; the Lab Suggestions page remains unchanged.
- Experiment Suggestion listing remains provider-free. Today/Coach does not call Gemini, Home-AI, Europe PMC, or reserve `ai_usage`. The existing explicit `Draft proposal` action remains the only suggestion-AI path.
- Derived Lab attention carries stable source identity/fingerprint, title/detail, urgency, attention reason, href, and benchmark/suggestion ids as appropriate.
- `Not now` persists only the exact current fingerprint for seven Phoenix calendar days. It hides while current date is earlier than `snoozed_until` and may resurface on that date if still eligible.
- A changed canonical result, protocol, retest state, or Experiment Suggestion fingerprint is not hidden by an older snooze.
- Snooze mutations rederive the current item and return a stale conflict when the supplied fingerprint is no longer current. Identical retries are idempotent and do not extend the original snooze.
- Lab surfacing, opening, snoozing, and accepting a suggestion are not rewardable Coach completions and issue no XP.

## Coach priority and polish

- Primary action order is: accepted active Stretch → due Lab retest → offered Stretch → active Daily Quest → available Lab retest → Experiment Suggestion → bounded current-period completion acknowledgement.
- Weekly Focus remains a compact strip outside primary competition. Displaced Daily Quest remains actionable in the Coach inbox.
- Inbox hierarchy is Stretch / Today / Lab / This week. Lab presentation is bounded to three visible items total; overflow links to Personal Lab.
- The former standalone Today retest card is removed to avoid duplicate retest attention. Scheduled/active/review-ready Experiment status remains as a lower Today surface.
- Coach dialogs share keyboard/focus behavior: Escape closes, Tab is contained, focus is restored when feasible, and route changes close overlays. Existing app-prefix routing is preserved.
- Shared reduced-motion classes remain authoritative; Coach does not animate health/performance numbers.
- Canonical owner mutations publish one coalesced in-app change signal so Today and Coach refresh after relevant Training, Nutrition, Body, Activity/import, Goal, Context, Supplement, and Lab changes without polling.

## Today and Coach inbox

- One combined Coach surface; Weekly Focus remains the compact top strip.
- The finalized primary ordering includes derived Personal Lab attention as documented above; a due retest can outrank an offered Stretch, while an accepted Stretch remains highest priority.
- The inbox orders Stretch / Today / Lab / This week and keeps Daily Quest actionable when Stretch or Lab owns the primary slot.
- Offer displays baseline, target, timing, measurement explanation, Accept / Pass. Active displays best attempt, target, expiry, Open Training / End quest.
- Ending confirms that the quest closes without a reward and Training PRs remain. Terminal labels are neutral.
- Accomplishment motion uses existing CSS; reduced motion stays globally controlled and numbers do not animate.
- Public demo remains synthetic, read-only, anonymous, and isolated from owner APIs/providers.

## Validation and manual QA

- H2C validation at `af009ad9d5580e535d6542041967c0ee313d5e94` passed on Linux/Node 22/PostgreSQL 14: **1,241 passed, 1 skipped across 128 test files**, plus typecheck, ESLint, and production build. The same production/test code was fast-forwarded to `main`; the temporary validation workflow was removed afterward.
- Local Windows typecheck, ESLint, build, domain/service/API/UI/backup checks passed. Vite runner mode avoids the sandbox's native config-bundler ancestor traversal restriction.
- Real PostgreSQL tests exercise H2B lifecycle constraints plus H2C `coach_lab_snoozes` constraints, concurrent snooze upserts, idempotency, seven-day resurfacing, and changed-fingerprint behavior in disposable databases.
- H2C source/UI regression covers primary/inbox hierarchy, mobile-safe markup, overlay navigation cleanup, focus containment/restoration, Escape behavior, and reduced motion. No authenticated production browser click-through was performed during this completion pass.
- Tests and synthetic rendering call no owner production database or provider; authenticated production click-through and real owner data remain a manual QA limitation.

## Retained invariants and next phases

One-owner auth, Phoenix calendar, single Vercel function, canonical Goal/version semantics, Apple workouts as Activity only, Personal Lab, Body, Sleep, Nutrition, Supplements, backup/export integrity, Appearance and shared motion remain intact.

- H2D: Goals + Training measurement expansion (distance/pace/skills and richer reps/duration Goal kinds) + lightweight routines. The Stretch strategy interface is reusable for these later additions.
- H3: XP / reward wallet, lifetime and spendable XP, purchases.
- H4: themes and progression polish.
