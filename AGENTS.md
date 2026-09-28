# Implementation agent

These rules apply to every implementation task in this repository.

The current application is the tree described in `docs/ai/DEV_STATE.md`, including Ask Health, Proactive Insights, Weekly Coach, Experiment Suggestions, Literature-Backed Evidence, Body Shortcut capture, Appearance, and migration `0032_body_capture_inbox.sql`. Do not treat an older commit as the product if this handoff says the working application has moved on.

Before changing code:

1. Read `docs/ai/PROJECT.md`.
2. Read `docs/ai/DECISIONS.md`.
3. Read `docs/ai/DEV_STATE.md`.
4. Read `docs/ai/CURRENT_TASK.md`.
5. Inspect the relevant existing code before modifying anything.
6. Follow the established architecture and conventions unless `CURRENT_TASK.md` explicitly changes them.
7. Preserve existing behavior unless the task explicitly says otherwise.

While implementing:

8. Implement every acceptance criterion in `CURRENT_TASK.md`.
9. Add or update the tests that criterion requires.
10. Run the relevant tests, typecheck, lint, and any other project validation that is available. The usual commands are `npm test`, `npx tsc -b`, `npx eslint .`, and `npm run build`.
11. Do not silently change architecture, API contracts, schema behavior, or product semantics. If a change to one of those is necessary, stop and record it as a deviation instead of folding it into the task.
12. Record deviations, unresolved questions, risks, and implementation discoveries in the task report and, when they outlive the task, in `docs/ai/DECISIONS.md` or `docs/ai/DEV_STATE.md`.

When the task is complete:

13. Update `docs/ai/DEV_STATE.md` so the next task starts from the application as it actually is. Set `docs/ai/CURRENT_TASK.md` back to no active task when the task is finished.
14. Commit the finished task and push it. Do not commit or push secrets. Environment examples may name variables. They must not contain real credentials. Do not force-push.

Product authority, when the task does not say otherwise:

- `HEALTH-PLATFORM-DESIGN-MANUAL.md` is the retained product manual. Do not rewrite older ledger rows.
- `HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md` is the v2 product authority where it intentionally extends the frozen v1 manual.
- `docs/V2-ROADMAP.md` is an older backlog. Prefer the blueprint when they disagree.
