# Dev state

Snapshot recorded 2026-09-27, immediately before the local baseline checkpoint on `main`. No implementation task is active. This tree, not the parent commit, is the current health application.

## Git

- Branch: `main`
- Parent of this checkpoint: `c81df61587b5a6c299bcfc7f5cab1d6a66e33756` (“sleep tracking upgraded”, 2026-09-27 12:30:08 -0700)
- This checkpoint adds Ask Health, Proactive Insights, Weekly Coach, migration `0030_ai_usage.sql`, the manual and blueprint updates through 1.0.33, and the AI workflow docs
- The checkpoint is local. It was not pushed
- Local annotated tag `v1.0.0` points at `7124ca513efa6c833457303ee6ff79d78344fce6`. Whether that tag exists on the remote is unknown. No remote was contacted, and there is no remote-tracking tag ref in the local clone

## Schema

- Migration head in the working tree: `0030_ai_usage.sql`
- Design manual version in the working tree: 1.0.33
- Package version: 1.0.0
- The live blueprint header names `0030_ai_usage.sql` as the schema head. Historical amendments and manual ledger rows that say the head was `0029_sleep_vital_samples.sql` at the time of V2-E3 through V2-F1 stay as history.

## Implemented

V2-A through V2-E, plus V2-F1 Ask Health, V2-F2 Proactive Insights, and V2-F3 Weekly Coach Brief, are in this application. Details are in `PROJECT.md` and `ROADMAP.md`.

Weekly facts and coach prose are derived. They are not stored. Ask Health transcripts are session-only. Insights are derived on read.

## Partial

- Overnight vital storage exists (`0029_sleep_vital_samples.sql`). Every production vital metric is `enabled: false` until a payload is verified.
- Nutrition Gemini capture works and is not charged to `ai_usage`.
- Weekly Coach has no scheduler, notification, or persisted prose.
- Signed-in browser QA of owner routes was blocked by the owner sign-in wall during F3. Demo routes were exercised.

## TODOs

No `TODO` or `FIXME` comments were found in `*.ts`, `*.tsx`, or `*.md`.

## Validation

Recorded 2026-09-27 against this tree, before the baseline commit. There is no separate typecheck script. `npm run build` runs `tsc -b` and then `vite build`.

- `npm test`: exit 0. 102 files passed, 859 tests passed. Duration 32.71s.
- `npx eslint .`: exit 0. No findings.
- `npm run build`: exit 0. `tsc -b` completed, then Vite reported `built in 9.83s`. Vite warned that some chunks are larger than 500 kB. The warning did not fail the build.

## Debt relevant to the next task

- The production client bundle still has a large chunk. That warning is known and is not a failed build.
- Server imports use `.js` specifiers. New server files need the same.
- ESLint does not treat a leading underscore as an unused-variable exception.
- Domain code is shared with the client. New client code should not rely on `Array.prototype.at` unless the existing client target is confirmed.
- Do not point tests at the owner's `DATABASE_URL`. Ledger tests use ephemeral Postgres.

## Handoff

Read `AGENTS.md`, then `PROJECT.md`, `DECISIONS.md`, this file, and `CURRENT_TASK.md`. Inspect the code the task touches. The next task has not been defined.
