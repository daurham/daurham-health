# V2-H2C Personal Lab + Coach Polish completion report

Completed 2026-09-29 from the partial Codex branch and reviewed/published by ChatGPT.

## Files changed

Production implementation:

- `migrations/0037_coach_lab_snoozes.sql`
- `server/backup/inventory.ts`
- `server/coach/lab.ts`
- `server/coach/service.ts`
- `server/handlers/coach.ts`
- `server/dispatch.ts`
- `src/domain/coach-lab.ts`
- `src/domain/coach.ts`
- `src/features/coach/CoachCard.tsx`
- `src/features/coach/CoachDialog.tsx`
- `src/features/coach/api.ts`
- `src/features/coach/presentation.ts`
- `src/features/today/TodayPage.tsx`
- `src/lib/health-api.ts`
- `src/lib/health-changes.ts`

Focused/new regression coverage includes:

- `tests/coach-lab.test.ts`
- `tests/coach-lab-service.test.ts`
- `tests/health-changes.test.ts`
- updated Coach API/client/service/UI/backup tests
- updated Today/Lab retest tests
- real PostgreSQL coverage in `tests/stretch-service-db.test.ts`

No runtime dependency or package-lock change was introduced.

## Migration and deployment

Migration head is `0037_coach_lab_snoozes.sql`.

The migration creates `coach_lab_snoozes` with:

- UUID id
- item kind: `benchmark_retest` or `experiment_suggestion`
- stable source key
- 64-character lowercase hex source fingerprint
- Phoenix calendar `snoozed_until`
- created/updated timestamps
- unique item-kind/source-key/fingerprint identity
- validation constraints and an expiry index

The migration was applied to disposable PostgreSQL 14 during validation and was subsequently applied by the owner to the production database. Production is now at migration head `0037_coach_lab_snoozes.sql`.

## Derived Lab attention

Lab remains the authority. Coach does not persist Experiment Suggestion content or duplicate retest state into `coach_tasks`.

H2C maps:

- due benchmark retests
- available benchmark retests
- existing deterministic `benchmark_missing_baseline` suggestions
- existing deterministic `benchmark_retest_due` suggestions

A direct retest item suppresses the equivalent due-retest suggestion inside Coach only. The Lab Suggestions page is unchanged.

Retest fingerprints include canonical benchmark/protocol identity, protocol version, current retest state, anchor result identity/date, and retest interval/date inputs. Experiment Suggestions use their existing candidate fingerprints.

## Seven-day Not-now semantics

Snoozing on Phoenix date D stores `snoozed_until = D + 7`.

The exact fingerprint is hidden while current date is earlier than `snoozed_until`; it may surface again on D+7 if still eligible. Repeated identical snoozes are idempotent and do not keep extending the date before it naturally resurfaces.

Before saving, the server rederives all current eligible Lab opportunities and requires the submitted kind/key/fingerprint to still exist. A stale identity returns conflict. A changed fingerprint is not hidden by an older snooze.

Snooze state is presentation only. It does not mutate benchmarks, results, Experiments, Goals, or suggestion eligibility.

## Priority and inbox

Primary Coach order is:

1. accepted active Stretch
2. due Personal Lab retest
3. offered Stretch
4. active Daily Quest
5. available Personal Lab retest
6. Experiment Suggestion
7. bounded same-period resolved acknowledgement

Weekly Focus remains the compact top strip.

Inbox section order is Stretch / Today / Lab / This week. Lab state is bounded to three visible items total; overflow links to Personal Lab. Daily Quest remains actionable when displaced from primary.

## Provider / XP boundary

Coach Lab reads and ensures call only deterministic Lab authorities. They do not call Gemini, Home-AI, Europe PMC, or reserve `ai_usage`.

The existing explicit `Draft proposal` action on the Lab Suggestion review page remains the only Experiment Suggestion AI path.

Surfacing, opening, snoozing, reviewing, or accepting a Lab suggestion does not award XP and is not modeled as a Coach completion.

## Today and UI polish

The duplicate standalone owner Today retest card is removed. Existing scheduled/active/review-ready Experiment status remains lower on Today.

Coach dialogs now share:

- Escape-to-close
- focus containment
- focus restoration when feasible
- body scroll lock
- overlay click close
- mobile-height constraints
- existing reduced-motion panel/scrim vocabulary

Route changes and Coach navigation close open Coach overlays. Existing app-prefix routing is preserved.

## Cross-domain refresh

Successful canonical mutations now emit one coalesced client event for Today/Coach invalidation. Relevant Training, Nutrition, Body, Activity/import, Goal, Context, Supplement, and Lab mutations re-read canonical Today/Coach state without continuous polling.

Preview/draft calls, failed mutations, Coach ensure, and Lab snooze do not emit this canonical-change signal.

## Backup/export

Backup inventory schema head is `0037_coach_lab_snoozes.sql`.

Both full and portable archives round-trip the exact snooze identity, `snoozed_until`, and timestamps. No model prose or AI draft is stored by H2C.

## Validation

The implementation was validated at commit `af009ad9d5580e535d6542041967c0ee313d5e94` in GitHub Actions run `36634855025` on Ubuntu/Node 22/PostgreSQL 14 with America/Phoenix semantics.

Results:

- `npm test`: **128 test files passed; 1,241 tests passed, 1 skipped**
- `npx tsc -b`: passed
- `npx eslint .`: passed
- `npm run build`: passed

Real PostgreSQL tests covered migration constraints, concurrent fingerprint snoozes, idempotent retry dates, seven-day resurfacing, changed fingerprints, and the existing Stretch database paths.

The validated production/test code was fast-forwarded to `main`. The temporary H2C validation workflow was removed afterward.

## Manual QA / limitations

No authenticated production browser click-through was performed during this completion pass. UI regression/static rendering covers the Coach priority/inbox states, narrow/mobile-safe markup, route cleanup, Escape/focus behavior, and reduced-motion contract. Production schema migration `0037` has now been applied.

## Follow-up

H2D remains the next planned product slice:

- Goal kinds for reps/duration/distance/pace/skills
- native Training distance/pace measurement
- richer calisthenics/skill records
- lightweight saved routine builder
- Stretch strategies that reuse those new canonical measurement families

H3 remains XP/reward wallet after H2D.
