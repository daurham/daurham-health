# Training Plan 2.0 / Unified Daily Log — implementation progress

**Updated:** 2026-10-11  
**Source contract:** `docs/ai/TRAINING_DAILY_LOG_V2_DESIGN.md`  
**Development branch:** `feature/training-daily-log-v2`  
**Draft PR:** https://github.com/daurham/daurham-health/pull/14  
**Release status:** WIP, **not ready for main or production**.

## Completed in this first increment

### Training: weekly qualification
- `src/domain/training-qualification.ts` computes one qualified training day from at least three **distinct actually performed exercise definitions** across all saved canonical Training sessions for the calendar date. Duplicate sets, duplicate logged sessions, empty templates and warmup-only sets do not inflate the count.
- `server/training/plan-service.ts` queries performed exercise evidence over the **entire calendar week through asOf**, not beginning at plan creation. Includes qualifying prior Monday workouts when the owner configures the plan midweek.
- `TrainingPlanView.weekTraining` exposes seven day facts plus the derived weekly completed count. The legacy `completedProgrammedSessions` remains for backward compatibility but is no longer used by the new weekly UI.
- `TrainingPlanCard` has a themed seven-day strip, actual qualified weekly progress (including 4/3), accessible labels, and the next suggested routine.
- `TrainingPlanPage` uses the evidence-based qualified-days summary.
- Added `tests/training-qualification.test.ts` for interrupted workouts, distinctness, same-day combining, historical midweek work, corrections, and over-target weeks.

### Training: independent block domain foundation (NOT LIVE)
- `src/domain/training-blocks.ts` adds a **pure** replay algorithm for A/B/C routine block generations, work-ahead credit, current pointer, early block ending, as-of reads and deterministic historical correction.
- `tests/training-blocks.test.ts` covers B 5/6 + C 1/6, finishing B, starting new B generation, transitioning into the next cycle, early closing without fabricated sessions, duplicate day suppression and historical reads.
- **Important:** The active planner still uses the old strict next-slot logic. Do not claim that independently credited blocks are live or correct in the current app until storage, history anchoring, API and UI integration are complete.

### Daily Check-in: localized saves and supplement history
- `DailyCheckInPage.tsx`: hydration, bowel, no-BM and wellness actions now update the selected day's local state from the result of the relevant canonical API, rather than triggering a full day refetch/loading skeleton.
- `DailySupplementsSection.tsx`: selected-date historical supplement doses are shown on the same Check-in date. Taken/Skipped/Clear mutations use the existing canonical API and refresh only that section. Scheduled state is resolved from historical schedules and lifecycle events, including paused/unscheduled suppression.
- Old-date response protection added to supplement navigation; no data migration required for this portion.

## Required verification before expansion/merge

- Run `npm ci && npx tsc -b && npx eslint . && npm test && npm run build` on the exact branch.
- Verify the newly added TypeScript compiles and unit tests pass. **Not verified yet**: no runnable local repository checkout or dependency install was available to this session, and GitHub PR-triggered Actions were not reported.
- Vercel status has reported failure on one WIP branch commit. The Vercel connector could not inspect the deployment because the linked token was denied access to the `daurhams-projects` team (403). Do not assume the failure is a code error or that the preview succeeded.
- Run interactive QA on selected-date supplements and a real interrupted workout (two ad-hoc logs, three combined distinct exercises).
- Ensure the existing I0-I10/migration rollout protections remain intact; **no database changes or main promotion authorized**.

## Remaining implementation work

1. Verify tests and debug any failing CI checks before continuing feature scope.
2. Design/migrate durable block-instance generations, explicit closure and reviewed starting anchor. Update owner backup/export and relevant fixtures.
3. Replace the strict next-routine calculation and expose per-routine block summaries, work-ahead and histories via API; ship A/B/C colored segmented bars in the real Training UI.
4. Add onboarding/history reconciliation and explicit correction/finish-early UX.
5. Refactor Daily Context to inline date-centered editing without losing unsaved drafts. Make Today share the same selected-date components.
6. Replace mobile-overflowing date fields with a reusable responsive date control across Training, Context, Daily Log and remaining forms.
7. Perform all theme/light/dark/24-palette checks, mobile Safari QA, database restore tests, XP idempotency tests, and approval-gated deployment.

## Explicit implementation guardrails

- Treat workout facts as canonical, not plan-creation events.
- Aggregate weekly evidence by distinct exercise and by Health date, with one weekly credit per date.
- Keep independently progressing routine generations distinct from the currently selected rotation pointer.
- Unknown supplement adherence stays unknown, never automatically skipped.
- Preserve XP and owner-data audit semantics.
- Keep `main` and production schema untouched until migration/readiness, CI and owner QA are approved.

## Training rotation visual bridge (2026-10-11)
- Canonical Training evidence for *performed* attributed exercises now produces independent, per-routine day credits; unclassified ad-hoc exercise work can qualify a week but will not silently advance A/B/C.
- A reusable theme-aware A/B/C segmented bar is wired into TrainingPlanCard and TrainingPlanPage. The server exposes a read-only `rotationPreview` from performed evidence saved after the version's creation.
- **Provisional only:** this is not yet a historical owner-approved starting anchor, does not persist early-end actions, and does not replace the authoritative next-session planner. Do not present as full rotation completion until migration/anchor/reconciliation are done.
- The iOS Safari date-field source assertion is updated to verify the new shared control rather than stale inline markup.

## Confirmed rotation persistence: staged, not migrated to production

- Added schema migration 0051 with versioned owner-reviewed starting anchors and explicit early block close events.
- Added authenticated POST plan routes for confirming historical starting point, ending the current unfinished block, and reopening an early-ended block.
- Confirmed rotations replay performed evidence from anchor date rather than guessing mutable counters, and guide the next routine; unconfirmed plans continue to show an explicit preview.
- Training Plan UI now has a historical anchor confirmation form, “Finish block early” and “Reopen block.”
- **Deployment gate:** 0051 is NOT applied to production. This code requires migration and full DB/backup QA before release. Historical starting-point suggestions and version-to-version continuity still need additional work.

## Backup and UI scope (staged)
- Registered 0051 as the schema head and listed both owner-decision tables in full and portable backup inventory in dependency order.
- Moved the seven-day optional manual scheduler into a collapsed advanced section; the weekly goal now names *qualifying training days* instead of programmed sessions.
- No live data migration or deployment has been performed. CI, migration fixture compatibility, history preview and owner validation are mandatory gates.

## Rotation continuity and confirmation UX — October 11
- Carry forward confirmed rotation anchor and early-ended block history in the same SQL transaction when a new plan version changes only weekly frequency, preferred weekdays or notes. Do not copy rotation decisions if routine order or per-block repeat targets change.
- Populate historical rotation confirmation form from the saved starting routine, starting date and already-completed count; re-synchronize the fields after successful owner confirmation.
- Add a domain test for unchanged vs changed routine-sequence identity.
- Still gated: historical suggestions, full migration/backup roundtrip, conflicting retrospective edits, mobile QA, and production approval.

## Historical starting-point reconciliation (owner approval)
- The Training Plan now offers a **read-only list of qualifying routine days** from the 12 weeks before plan setup and a deliberately tentative starting-point suggestion.
- Selecting “Use suggested starting point” fills the anchor fields, but **does not save** or invent sessions; owner must explicitly confirm.
- Suggestion prefers the earliest routine with observed but incomplete progress; a fallback suggests the next routine after the last observed qualified routine. Multiple overlapping cycles remain ambiguous and require manual review.
- Changing the plan version re-synchronizes anchor input state so old unconfirmed form values do not persist.

## Rotation safety checkpoint (2026-10-11)
- Routine sequence/target changes now require an explicit owner acknowledgment when a previously confirmed rotation exists. Weekly-target, weekday and note edits continue to preserve the confirmed rotation.
- Historical edits that render a persisted early-ended block already completed (or remove its generation) are not silently ignored; the rotation view exposes an explicit reconciliation conflict with a clear-outdated-decision action.
- Only actual performed working strength exercises qualify a Training day. Distance/distance-duration and standalone skill activities are excluded at the evidence query boundary, so hikes/runs do not accidentally advance a 3-exercise strength day.
- Added schema, UI boundary, conflict and strength-evidence regression tests. Migration 0051 is still production-unapplied.

## Backup and Today/Daily Log QA increment
- Confirmed CI actually runs migration 0051 tests on disposable PostgreSQL rather than skipping them.
- Added an actual archive -> verify -> restore planner -> PostgreSQL replay regression test for owner rotation anchors and early-ended blocks (plus nonempty-destination guard).
- Today quick links now open the unified Daily Log with a Context anchor rather than splitting context entry into its old separate editor.
- The Daily Log protects unsaved Context and wellness against date changes, Today navigation and browser reload; date navigation is disabled during pending quick-action writes.
- Clearing already saved Context now confirms first if doing so would also discard unsaved edits.

## Today's route contract validation
- Updated two stale Today tests to require the user-facing 'Daily Log' label and the unified /check-in?date=...#daily-context route, matching the new UI; no backward-incompatible server route removal.
- The preceding CI run confirmed the new archive -> verification -> PostgreSQL restore test passed. Only the two Today label/link assertions required adjustment.

## Theme and phone layout QA batch (2026-10-11)
- Redesigned compact A/B/C segmented block rows with persistent per-routine palette accents. Current, working-ahead, prior completed block, and next-generation labels are explicit; a completed B 6/6 remains visible when the next B generation begins.
- Added theme-neutral, high-contrast count text, status words, informative progressbar labels and a visible warning when historical early-close decisions conflict with workout edits.
- Training Plan routine editing now stacks cleanly on narrow devices. Long routine names wrap, move/remove buttons have accessible names, and the add-routine selector no longer sets an overflowing 14rem minimum width.
- Weekly training strip includes a small legend differentiating qualified, today and optional preferred days.
- Theme matrix is 24 palettes each with light/dark definitions. Automated coverage checks and responsive source-level checks are in the new UI tests, but **visual Safari/device screenshots are still an owner QA gate**, not yet completed.

## Final internal navigation guard
- Added one React Router Data Router blocker for all internal route/query navigation whenever Context or wellness has unsaved edits, including mobile bottom navigation and browser back/forward.
- Removed duplicate manual Today/date confirmations in favor of the central guard; browser reload keeps a separate beforeunload warning.
- This is code-level coverage; manual iPhone back/forward/navigation testing remains in the release QA matrix.
- Vercel project metadata and preview ERROR statuses are visible, but inspecting failed build logs still returns a **403 forbidden team-scope authorization error**. Do not describe the build as quota-related without real log evidence.
