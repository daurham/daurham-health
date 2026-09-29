# V2-H2B Stretch Quests completion report

Completed 2026-09-29 against the prepared V2-H2B contract. Stretch Quests now extend the existing deterministic Coach ledger and Today surface with explicit acceptance and canonical Training completion.

## Files changed

Production changes:

- `migrations/0036_stretch_quests.sql`
- `server/backup/inventory.ts`
- `server/coach/service.ts`
- `server/handlers/coach.ts`
- `src/domain/coach.ts`
- `src/domain/coach-stretch.ts`
- `src/domain/progress/stretch-performance.ts`
- `src/features/coach/CoachCard.tsx`
- `src/features/coach/api.ts`
- `src/features/coach/presentation.ts`

New focused test files:

- `tests/coach-client.test.ts`
- `tests/coach-stretch.test.ts`
- `tests/coach-stretch-service.test.ts`
- `tests/stretch-performance.test.ts`
- `tests/stretch-migration-db.test.ts`
- `tests/stretch-service-db.test.ts`

Updated regression files:

- `tests/coach-api.test.ts`, `tests/coach-backup.test.ts`, `tests/coach-service.test.ts`, `tests/coach-ui.test.tsx`
- `tests/api-module-graph.test.ts` normalizes Windows path separators.
- Migration-head expectations: `tests/body-capture.test.ts`, `tests/experiment-suggestions.test.ts`, `tests/goal-status.test.ts`, `tests/lab-retests.test.ts`, `tests/motion.test.ts`, `tests/nutrition-gemini-usage.test.ts`, `tests/nutrition-meal-clarifications.test.ts`, `tests/recipe-assist.test.ts`, `tests/sleep-baseline.test.ts`.

Documentation: `AGENTS.md`, `docs/ai/DEV_STATE.md`, `docs/ai/DECISIONS.md`, `docs/ai/CURRENT_TASK.md`, and this report. No package or lockfile changed.

## Migration and ledger

The exact new migration is `0036_stretch_quests.sql`; inventory/schema head is 36. It was applied only in disposable PostgreSQL 14 databases in Linux CI. The owner's production database was neither read nor mutated by H2B implementation. The owner had already applied `0035_coach_tasks.sql` before H2B began; only `0036_stretch_quests.sql` remains pending for the deployed H2B code.

Existing `coach_tasks` gains `stretch_quest`, offered/failed statuses, nullable `accepted_at`, and the frozen stretch difficulty/reward band. Existing `coach_task_events` gains failed events. Constraints enforce Stretch acceptance/state coherence and prohibit Stretch-only fields/states on Daily/Weekly tasks. A partial unique index permits one offered/active Stretch. Existing Daily/Weekly indexes remain. No extra table or Vercel function was introduced.

Transitions and events are atomic. Lifecycle keys deduplicate events. Generation takes a transaction-scoped advisory lock, then performs a guarded insert in a fresh READ COMMITTED snapshot; the insert checks both current-task existence and cooldown across every prior outcome.

## Timing and lifecycle

All calendar rules use America/Phoenix. A first eligible offer may appear immediately. Later offers require at least eight calendar days from the previous offer date, including passed, expired, failed, and completed outcomes. No terminal outcome permits an immediate replacement.

Offers remain available for three inclusive dates: creation date through creation date +2. Accept explicitly freezes a seven-date challenge: acceptance date through acceptance date +6. Refresh, retries, passing, ending, and completion never extend either window.

Accept moves offered to active; pass closes only an unaccepted offer; End quest moves active to neutral failed/ended. Unaccepted expiry is expired; accepted expiry is failed/unmet. Duplicate accept/pass/end and repeated reconciliation are idempotent. Current source deletion or edits invalidate an unaccepted baseline. Accepted targets remain frozen. Source deletion before completion removes that attempt from current evaluation. Deletion after completion retains historical Coach provenance; current canonical Training analytics still recompute.

## Canonical baselines and completion

Only canonical programmed, ad_hoc, or experiment working sets qualify. Baselines need two qualifying session/exercise appearances, latest no older than 21 Phoenix days, and counted appearances no older than 42 days. The best qualifying single set supplies the frozen baseline and source identity.

Completion requires an existing qualifying working set captured strictly after acceptance, with both canonical workout date and session creation instant inside the challenge window. The capture instant cannot be in the future or after the closing Phoenix midnight. This prevents a later backdated capture from qualifying. Session creation is the conservative available timestamp because canonical sets lack separate performed instants.

Before a state transition, SQL rechecks exact source identity, raw values, creation timestamp, and exercise classification. PostgreSQL microsecond timestamps are preserved rather than truncated through JavaScript Date serialization. Raw edits that preserve the same derived numeric score cannot silently win acceptance/completion.

Completion evidence preserves session, session-exercise and set IDs, capture timestamp, raw load/reps/duration/sides, classification, derived performance, baseline, target, formula/confidence, and reward classification. H3 can consume this provenance later; H2B issues no XP, wallet entry, streak, or penalty.

## Measurement strategies

Strength reuses the existing estimatedStrengthForSet high-confidence Epley authority. Canonical kilograms are converted to pounds. Target = baseline ×1.02 rounded upward to the nearest 0.5 lb. Any qualifying high-confidence load × reps may satisfy the estimate; the source load, reps, formula, confidence, and result are retained. UI explicitly explains that the target is estimated strength and is not the bar load to attempt.

Reps supports existing unloaded/bodyweight reps exercise semantics, excluding generic loaded-rep scoring. Target = baseline ×1.05 rounded up to a whole rep, at least +1 rep. Per-side exercises require both sides and use their minimum completed value; an asymmetric stronger side cannot inflate performance.

Duration supports existing unloaded/bodyweight duration exercises and exercise-set duration only. Target = baseline ×1.05 rounded up to five-second increments, at least +5 seconds. Per-side duration requires both sides and uses the minimum completed duration.

Both reps and duration reject candidates whose rounded/minimum increase would exceed 110% of baseline. The frozen contract's 20→25 sec example conflicts with that cap, so the explicit cap governs: 20 sec emits no candidate; 95→100 sec and 10→11 reps are valid. This interpretation is covered by tests and retained in DECISIONS.md.

Distance, pace, skills, richer measurement Goal kinds, and routines remain H2D follow-up. No fake canonical measurement or new Training measurement family was added.

## Selection and context

Ranking is deterministic: independently eligible matching active strength Goal relevance, freshness, appearance count, recently trained adjustment, prior challenge penalty, then stable strategy/exercise IDs. A repeated exercise/strategy inside 30 days is avoided whenever a qualifying non-repeated alternative exists. An only eligible candidate may repeat after the eight-day cooldown.

New offers are suppressed for sick, pain, rest_day, unusual_physical_labor, unusual_stress, poor_sleep_opportunity, and baby_night_interruption. Existing accepted challenges remain frozen. This is optional challenge suppression, not medical readiness certification. Generation/reconciliation makes no provider request and reserves no AI usage.

## Today, progress, and inbox

One existing Coach surface contains Weekly Focus as its compact top strip. Active Stretch, offered Stretch, and Daily Quest take the primary slot in that order. A newly completed Stretch can be acknowledged with Got it and collapses to a compact result. The inbox orders Stretch / Today / This week; the displaced Daily Quest remains actionable there.

Offered Stretch displays baseline, target, measurement explanation, expiry, Accept, and Pass. Active Stretch displays best attempt, target, expiry, Open Training, and End quest. Ending asks for confirmation and explains that Training PRs remain. Passed/expired/failed copy is neutral.

A canonical attempt above baseline but below target displays New PR progress while the quest stays active. It creates no completion event or reward. Current performance is derived from canonical evidence rather than persisted as a second Training authority.

Existing accomplishment CSS and global reduced-motion handling remain; numbers do not animate. The public demo remains synthetic, anonymous, read-only, and isolated from owner APIs/providers.

## Backup and H2A preservation

Backup/portable export inventory includes accepted_at, every Stretch state, frozen metadata, and completion/event evidence at migration head 36. Round-trip tests cover offered, active, completed, passed, failed, and expired tasks, including source provenance and stretch reward classification.

Daily/Weekly generation, period consumption, canonical completion, manual/self-report semantics, and broader Health regression remain intact. One integration defect was corrected: unloaded H2A presets now send the valid canonical bodyweight load state instead of the invalid none state. The yoga regression uses the actual Training parser. Exercise loadType semantics and API contracts are unchanged.

## Validation

The final code was tested at commit `c75aab2a650f9fad917c4c66cbf104fd41be71df` on the isolated validation branch, using Ubuntu 22.04, Node 22, PostgreSQL 14, and TZ=America/Phoenix.

[Successful Linux CI run](https://github.com/daurham/daurham-health/actions/runs/36629150505):

- `npm test`: **125 test files passed; 1,139 tests passed, 1 existing fit-profile test skipped**.
- `npx tsc -b`: passed.
- `npx eslint .`: passed.
- `npm run build`: passed; 1,484 modules transformed. Existing dependency annotation and large-chunk warnings remain nonfatal.

Focused coverage includes 41 Stretch domain tests, 46 performance tests, 23 Stretch service tests, 14 Coach UI tests, 6 API/auth tests, 4 client tests, 3 backup tests, and H2A regression. The eight migration and four service PostgreSQL tests also passed, exercising actual constraints, SQL source guards, precise timestamps, concurrent cold generation, idempotency, cooldown, and deletion. They start isolated temporary clusters and never use an owner DATABASE_URL.

Windows-local typecheck, ESLint, focused checks, and production Vite build also passed. Vite runner config mode avoids this sandbox's native config-bundler ancestor traversal restriction; no package scripts were changed. The required standard commands were validated in Linux CI. `git diff --check` passed.

Browser QA used synthetic in-memory fixtures at desktop and 390×844: offered acceptance, active End confirmation and neutral result, below-target PR, completion acknowledgement/collapse, inbox ordering with actionable Daily Quest, and per-side duration copy. No owner API, database, or provider was used; no browser console errors were observed. Reduced motion is covered by existing CSS regression and Coach UI tests; OS-level motion emulation and authenticated production click-through were not performed.

## Documentation, publication, and remaining limits

DEV_STATE now records the resulting H2B product, deployment prerequisite, test approach, and H2D/H3 follow-up. DECISIONS records canonical provenance, Phoenix timing, the rounded-target cap resolution, and the canonical unloaded-load-state fix. AGENTS describes the current H2B/schema-36 baseline. CURRENT_TASK is reset to No active implementation task. No product-manual rewrite or historical ledger amendment was needed.

The initial H2B publication was pushed to `main` as `2e2eb51d061ed709216efaffde899a911b017740`. A later review may add documentation-only commits without changing the validated H2B production/test code. The isolated validation workflow is not included in the final product tree; final code blobs match the passing validation commit.

Local Windows .git writes are denied in this session even after the repository write grant. Therefore publication uses the connected GitHub API without force-pushing. Local source files contain the completed implementation, but local HEAD/index remain at the original checkout until synchronized. Temporary synthetic QA files under work/h2b-qa are excluded from the product commit; sandbox policy blocked their cleanup. No deployment or production migration was performed.
