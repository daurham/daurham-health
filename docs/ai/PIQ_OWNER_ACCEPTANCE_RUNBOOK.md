# PIQ controlled owner acceptance and release runbook

**State: PREPARED, NOT RUN.** Work branch: piq/00-baseline-20261014. No owner approval, database migration, production release or actual iPhone tests are implied by this document. All nine PIQ program phases remain unaccepted.

## What automated validation already proves

- TypeScript, ESLint, Vitest and build run on the work branch. Passing code checks does not prove authenticated iPhone navigation, owner data correctness or production availability.
- Disposable PostgreSQL 16 replays migrations 0001–0056 and checks nutrition completeness, Coach concurrency and Health Profile two-client version conflicts. It is not the owner's Neon project.
- Migration preflight checks only database catalog metadata and applied migration filenames. The production migration command now blocks broken histories instead of silently replaying later migrations.
- Synthetic Ask Health correction tests check whether a changed profile height invalidates an earlier cached explanation, whether unrelated profile edits are not unnecessarily billed, and whether clearing the last personal fact removes its old evidence. No Gemini request or owner data access occurs.

All gates must pass on the **exact candidate commit**. A green check on another SHA is not release evidence.

## Production identity gate — currently blocked

- [x] Verify the correct Vercel project and live domain deployment. Read-only domain lookup confirmed `health.daurham.com` serving `main` commit `dbc3fcb68324d75d30a96132b725456ec7e45d49`. This **does not** complete the database isolation gate.
- [ ] Verify the actual Neon project, branch and database attached to that deployment. Do not paste URLs, connection strings or authentication secrets into chat or the repository.
- [ ] With an authorized read-only database role and verified target, run: npm run migration:preflight. Retain only status and migration filenames; PENDING is not approval to migrate, and BLOCKED requires investigation.
- [ ] Confirm a verified, encrypted owner backup and an isolated restore rehearsal against the correct schema head. Rolling back Vercel does not roll back the database.
- [ ] Confirm an isolated preview deployment, DB **and auth/session tenant** are truly separated. Vercel preview branches can still point to production data if configured incorrectly; never infer isolation from a preview URL.
- [ ] Review the grouped migrations 0053–0056 and explicitly authorize each production action, separately from approving tests.

**2026-10-16 Vercel identity correction (remaining release gates BLOCKED):** The **existing** Vercel connection works using unscoped project/deployment reads; explicit team-scoped reads gave misleading 403 responses. No reconnection is necessary. The production domain `health.daurham.com` resolves to a **READY** production deployment on `main`, commit `dbc3fcb68324d75d30a96132b725456ec7e45d49`. Environment variable **metadata** (not decrypted values) shows a `DATABASE_URL` configuration targeted at both production and preview with no branch-specific record in that list. Native Neon integration injection may choose distinct per-deployment values, so this **does not prove** that the runtimes share or differ in their database/branch destinations. The Neon marketplace integration is present in Vercel, and Neon confirms the PIQ child `preview/piq/00-baseline-20261014` was **created by Vercel** and initialized from default `main` parent data in candidate project `neon-rose-kettle` (the same 85 Health table names are present). The child is write-isolated from its parent but can contain private copied owner records. One manual October 11 snapshot exists; verified encrypted backup/restore and the exact deployment-to-database binding are outstanding. Do not run owner-data QA, a migration preflight against an assumed target, owner-data writes or releases without confirming isolation and actual DB identity. See the [updated read-only environment discovery](./PIQ3_ENVIRONMENT_READONLY_DISCOVERY_20261016.md).

**PIQ-3 database binding engineering guard prepared (not deployed/enabled):** The repo now includes [a credential-safe endpoint/branch preflight and opt-in runtime fail-closed guard](./PIQ3_DATABASE_BINDING_GUARD.md). Never run it against an assumed target or treat a local pass as an attestation of the serving Vercel runtime. Only authorized same-deployment execution plus independently confirmed Neon endpoint metadata could establish the effective binding. The guard is disabled until expressly configured; no owner access or release gate was approved. Additional guard hardening (expected database name plus strict TLS) was validated on exact code/test SHA `50bf9b6940a4c48340cc87bee3b64493a51bbdeb` ([Actions 38932688326](https://github.com/daurham/daurham-health/actions/runs/38932688326)); this does **not** verify any deployed runtime connection or preview Auth tenant.

## iPhone owner QA — only after the isolated target is verified

Use 375–390 px Safari first; check a narrower 320 px viewport and a wider 430 px viewport where possible. The write scenarios belong on a disposable test owner instance. Do not mutate your actual clinical history to make a test pass.

| ID | Action | Expected result |
| --- | --- | --- |
| A1 | Open Ask Health → What Health knows about me; compare with Settings | Age derived from DOB; height and physiological context reflect saved values; unset clinical facts never invented |
| A2 | Ask a question citing a saved profile fact → Something wrong? → Open canonical source | Navigates to the correct Settings Health Profile with a visible return banner and working scroll |
| A3 | Edit and save a test profile fact; use Return to Ask Health | Original question, lens and range restored as an unsent draft; no Gemini call until explicitly submitted; new answer cites current saved data |
| A4 | On isolated test profile, open two sessions with the same version and save conflicting changes | Exactly one writer succeeds; second receives conflict, preserves draft and requires explicit reload |
| A5 | With logged but unconfirmed test food days, ask about a personal diet trend | At most one relevant optional clarification; no forced intake questionnaire |
| A6 | Test Skip, Ask later, Never ask again and re-enable | Respect choices without storing health prose in preferences |
| A7 | Use a Nutrition evidence correction link; update a test entry and review day completeness | Original Nutrition source changes; stale prior completion cannot qualify silently |
| A8 | Cite a calculated or imported evidence item → Something wrong? | No fake canonical editor; inspect source or draft an interpretation follow-up |
| A9 | With unconfirmed nutrition days, inspect Goal Control and Weekly Coach | No unsupported calorie cut, no automatic numerical target change, source uncertainty clearly labeled |
| A10 | Navigate away and back during editing; check phone scrolling, focus, and buttons | No silent draft clobber, wrong Health date or inaccessible controls |

For PIQ-3, use the [controlled 13-case context/privacy/citation/cost question matrix](./PIQ3_OWNER_QUESTION_ACCEPTANCE.md) only **after** the identity and isolation gates above are satisfied. It is a prepared runbook, not proof that owner QA ran. Record redacted case IDs/status and human rubric scores only; do not put raw clinical prompts, logs or replies in GitHub.

## Owner answer-quality acceptance

After a safe target and identity are verified, the owner selects a small number of **genuine** questions, privately checks the supporting evidence and scores whether answers are direct, useful, cautious about causation and time, and free of invented claims. Avoid pasting medical records, production connection details or raw personal logs into GitHub issues. Only issue explicit permission for a limited Gemini test batch if needed; there is no automated paid-model acceptance run.

## Release decision record (all deliberately unchecked)

- [ ] Release candidate SHA and branch confirmed: ____
- [ ] Application and disposable PostgreSQL checks pass on that SHA
- [ ] Live serving SHA, database identity, migration history and encrypted backup verified
- [ ] Isolated migration, restore and rollback rehearsal accepted
- [ ] Owner performed and accepted A1–A10, defects repaired
- [ ] Owner reviewed genuine answer quality, safety and AI spending
- [ ] Owner separately approved exact migrations, merge and deployment actions

**No sign-off is granted by writing this checklist.** PIQ-8 finishing polish remains deferred.
