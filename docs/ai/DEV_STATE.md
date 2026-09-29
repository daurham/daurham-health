# Dev state

Snapshot recorded 2026-09-29 after **V2-H2B — Stretch Quests**, on top of V2-H2A Coach Core + Today. This is the current health application.

## Git and runtime

- Branch: `main`; package version remains 1.0.0.
- H2B extends the H2A tree whose implementation contract was `6bb3b4ed5000ca79fa6b4535cf084d265cd94d56`.
- No new runtime dependency, provider request type, scheduler, or Vercel function was added.
- Implementation validation and publication details are in `docs/ai/H2B_REPORT.md`.

## Schema and deployment

- Migration head: `0036_stretch_quests.sql`.
- H2B adds `stretch_quest`, `offered` / `failed`, nullable `accepted_at`, and the frozen `stretch` difficulty/reward band to the existing Coach ledger.
- `coach_task_events` supports failed events. State changes and Stretch events are atomic and deduplicated by lifecycle key.
- A partial unique index enforces one offered/active Stretch for the single owner.
- Existing one-Daily-per-date and one-Weekly-per-week indexes remain unchanged.
- The owner applied `0035_coach_tasks.sql` before H2B implementation and applied `0036_stretch_quests.sql` after H2B review. Production schema is now at migration head `0036_stretch_quests.sql`.
- Backup and portable export include `accepted_at`, frozen metadata, every Stretch state, and exact completion history. No table was added to the inventory.

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

## Today and Coach inbox

- One combined Coach surface; Weekly Focus remains the compact top strip.
- Active Stretch, then offered Stretch, then Daily Quest occupy the primary action slot. A newly completed Stretch can be acknowledged with Got it and collapses to a compact result.
- The inbox orders Stretch / Today / This week and keeps the Daily Quest actionable while Stretch owns the primary slot.
- Offer displays baseline, target, timing, measurement explanation, Accept / Pass. Active displays best attempt, target, expiry, Open Training / End quest.
- Ending confirms that the quest closes without a reward and Training PRs remain. Terminal labels are neutral.
- Accomplishment motion uses existing CSS; reduced motion stays globally controlled and numbers do not animate.
- Public demo remains synthetic, read-only, anonymous, and isolated from owner APIs/providers.

## Validation and manual QA

- Full final Linux/Postgres checks and exact counts are recorded in `H2B_REPORT.md`. Post-implementation review verified that the production/test code blobs on `main` match the successful validation tree; only documentation and the temporary validation workflow differ.
- Local Windows typecheck, ESLint, build, domain/service/API/UI/backup checks passed. Vite runner mode avoids the sandbox's native config-bundler ancestor traversal restriction.
- Real PostgreSQL tests exercise actual migration constraints, concurrent generation, canonical microsecond accept/completion guards, idempotency, cooldown, and deletion behavior in disposable databases.
- Browser QA used an in-memory synthetic fixture at desktop and 390×844: acceptance, end confirmation, neutral result, below-target PR, completion acknowledgement, inbox priority, and per-side duration presentation.
- The synthetic browser fixture called no owner API/database/provider. Authenticated production click-through and real owner data were not used. Reduced-motion behavior is covered by the shared CSS regression and Coach UI tests.

## Retained invariants and next phases

One-owner auth, Phoenix calendar, single Vercel function, canonical Goal/version semantics, Apple workouts as Activity only, Personal Lab, Body, Sleep, Nutrition, Supplements, backup/export integrity, Appearance and shared motion remain intact.

- H2C: Personal Lab integration and Coach polish.
- H2D: Goals + Training measurement expansion (distance/pace/skills and richer reps/duration Goal kinds) + lightweight routines. The Stretch strategy interface is reusable for these later additions.
- H3: XP / reward wallet, lifetime and spendable XP, purchases.
- H4: themes and progression polish.
