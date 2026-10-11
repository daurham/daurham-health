# Training Plan 2.0 + Unified Daily Log — release QA matrix

Status: **Not yet approved for production**. Development branch: \`feature/training-daily-log-v2\`.
Design contract: \`docs/ai/TRAINING_DAILY_LOG_V2_DESIGN.md\`.

## Automated gates (CI)

- [x] TypeScript, lint, full Vitest, production build passed on prior branch commit.
- [x] Migration 0051 constraints tested against disposable PostgreSQL 14.
- [x] Full backup archive verification, restore planning, and actual SQL replay of rotation anchor/early-end records into disposable PostgreSQL.
- [ ] Latest UI batch CI green (check GitHub branch validation after commit).
- [ ] Production-like **Neon branch** using current owner schema and representative scrubbed history.
- [ ] XP idempotency when logging, deleting or editing qualifying workouts / check-ins.

## Training — manual scenarios

- [ ] Monday workout logged before Wednesday plan setup still qualifies that week.
- [ ] Three distinct strength exercises spread across interrupted sessions count as **one** day.
- [ ] Two exercises + a walk/run do not qualify as three strength exercises.
- [ ] B 5/6 + C 1/6: B remains current, C displays work ahead.
- [ ] B reaches 6/6, C stays partially credited, and a later B starts B block 2 without erasing previous 6/6.
- [ ] Ending B at 4/6 does not add two fictional sessions; reopen reverses only the closure.
- [ ] Editing/deleting a backdated workout recalculates the block and flags stale early-end decisions.
- [ ] History proposal **does not save** until explicitly confirmed.
- [ ] Changing only training weekdays/frequency/note preserves confirmed rotation; changing block lengths/order asks for confirmation.
- [ ] Unconfigured plan, missing routine template and confirmed-vs-preview states are truthful.

## Daily Log / Today — manual scenarios

- [ ] Today "Add context" opens /check-in?date=YYYY-MM-DD#daily-context, scrolls, and expands Context.
- [ ] Water, bowel and wellness quick actions update the correct section without a full-page loading skeleton.
- [ ] Water and bowel delete actions update only the selected Health date.
- [ ] Historical supplement taken/skipped/clear only changes selected date; missing remains **unknown**.
- [ ] Unsaved Context/wellness warns when navigating date, returning to Today, using app bottom/side navigation, browser back/forward, or reloading.
- [ ] Failed save preserves the draft; don't award XP on a failed mutation.
- [ ] Date change while another quick action saves is disabled, to avoid cross-day UI writes.
- [ ] Existing /context and /check-in deep links continue working.

## Mobile and visual matrix

Check **320, 375, 390, 430 px** iPhone widths (Safari) and desktop, **both light and dark**. Use every one of the **24 saved palettes**, including series-inspired themes.

- [ ] No horizontal scroll in Training Plan A/B/C editor, Routine bars, weekly strip, Daily Log date input, supplements, or Context.
- [ ] Long routine names wrap; Times field, reorder, Remove and Add remain comfortably tappable.
- [ ] Categorical A/B/C tones remain different under all palettes; count text and statuses readable without reliance on color.
- [ ] Complete, active, work-ahead, next-generation, early-ended and historical-conflict statuses are legible.
- [ ] Normal, focus, disabled, loading and error states remain legible in all themes.
- [ ] Keyboard date input and previous/next day buttons work; native date picker stays within viewport.
- [ ] Reduced motion setting is honored.

## Deployment / migration gate

1. Confirm deployed environment's **actual schema head** and reconcile any I0–I10 pending migrations.
2. Take a verified encrypted owner backup before applying migration 0051.
3. Run 0051 and owner-data backup/restore tests on a production-like isolated Neon branch; do not run on production first.
4. Ensure access to Vercel team or resolve failed preview checks. GitHub validation green does not mean the Vercel preview is live.
5. Complete owner-led iPhone/theme QA and consolidate fixes on the feature branch.
6. Only then, with explicit approval, coordinate production migration and merge to main.
7. Keep Vercel build/deployment quota for **final preview + production + post-release bug fixes**, not one push per UI tweak.

This matrix distinguishes test coverage from work that requires a real device/database. Do not check off a manual gate using only static source tests.
