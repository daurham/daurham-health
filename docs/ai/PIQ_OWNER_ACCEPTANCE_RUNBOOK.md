> **2026-10-19 Phoenix / 2026-10-20 UTC release snapshot:** Latest code candidate `6c487e659a184c0706a28cbe16820eeee7ae98d5` passed exact-SHA [application CI](https://github.com/daurham/daurham-health/actions/runs/39359003775) and [isolated PostgreSQL 16/18 CI](https://github.com/daurham/daurham-health/actions/runs/39359003848). Read-only independent QA Neon migration head is 60/60. Later Vercel read-only PIQ Preview env inventory confirms the formerly missing secret and owner-comparison **keys are present**, but does **not** attest values or runtime. The expected Preview SHA differs from latest validated code, while actual Vercel deployment responses remain unavailable (403 scoped, empty unscoped). Thus the release/owner runbook below remains **NOT RUN**; 0/9 formal PIQ phases and A1–A10/P1–P4 device checks are all unsigned. Do not disable the Preview 503 lock or promote Production. Refer to [PIQ_RELEASE_READINESS_20261020.md](./PIQ_RELEASE_READINESS_20261020.md) for one current, consolidated handoff instead of redoing credential setup.

# PIQ controlled owner acceptance and release runbook


## CURRENT RELEASE SNAPSHOT — 2026-10-19 (supersedes older statuses below)

**Owner acceptance is still blocked.** The often-reported **0/9** is a high-level *PIQ phase acceptance* counter, **not** nine mobile acceptance steps. The owner/device scenarios below are A1–A10; PIQ8 adds P1–P4. None has been manually signed off.

| Gate | Verified current state | Remaining constraint |
| --- | --- | --- |
| Development code | `piq/00-baseline-20261014` with full-application CI per exact commit | A `READY` Preview does not count as owner acceptance |
| Isolated QA PostgreSQL | Separate Neon project `lively-wave-25801832`, root `br-crimson-cloud-akrf5kuo`, `neondb`, PG 18.6, **60/60 migrations** | This is not the production DB and must never receive copied owner records |
| QA application content | Inventory-only check found **76 non-seeded app tables empty**, with 70 legitimate migration seeds across four tables | Does not certify external Auth users/sessions or encrypted backup recovery |
| QA Vercel Preview | Project `prj_KNUk1CcJbYjQbSkADSHSuynhpZJU`; only the PIQ Git branch has the 37 Preview QA overrides; QA `DATABASE_URL` configured | New deployment's effective DB connection and protected API responses **not** attested |
| QA Auth | Separate Neon `better_auth`; exact PIQ Preview branch origin added to its trusted origins | Current test identity has no usable sign-in; cookie secret replacement unverified; independently checked production-versus-QA owner IDs still missing |
| Release hard stop | PIQ owner/Auth/Health endpoints have a deliberate **503 API hard lock** in the development branch | Do not remove lock without a separate explicit user authorization after safe runtime isolation evidence |
| Restore proof | PG16/18 synthetic fresh-schema export, mid-restore failure rollback, full table parity, and backup inventory/DDL drift checks | Not an approved restore of real owner data or encrypted/offsite disaster recovery |
| Owner-device acceptance | **Not run** on iPhone or iPad | First prove Auth/DB isolation and explicitly authorize narrowly scoped owner testing |

**Do not follow older instructions below that say the independent QA root is only at 0056, credentials are all placeholders, or the candidate parent-data preview is safe for login.** Those dated notes document earlier investigations and are retained for traceability, not as the current plan. The correct QA target is the independent project above—not the parent-data child in the production Neon project. Do not migrate the independently upgraded QA root again.

### Additional PIQ8 real-device smoke checks (not part of the 0/9 phase count)

Run only after the authenticated isolated QA environment has independently passed its isolation gates. These are **pending**, not inferred from Vitest or Vercel READY status.

| ID | Owner action on a disposable QA profile | Acceptance condition |
| --- | --- | --- |
| P1 — Body dimensions | Enter `31 1/2 in`, `31.5 in`, `31½ in` and `80.01 cm`; switch units; save and reopen all 12 circumference fields on narrow iPhone Safari | Same canonical physical value; no 1/16-inch truncation, lost draft or unintended weight/percentage change; usable at 320–390 px |
| P2 — Prestige themes | From unlocked QA levels 20–23, inspect new theme previews, light/dark mode, focus and reload, XP wallet unchanged | Unlocks only at intended XP thresholds; selected theme persists; readable cards and charts without flashing or spending XP |
| P3 — Settings disclosures | Open `/settings` ordinarily, then `#theme-studio`, `#trend-colors`, `#health-profile`, `#ai-usage` and an Ask Health owner-note correction link | All top-level topics start collapsed unless explicitly targeted; deep link opens correct topic; no lost in-progress draft or focus trap |
| P4 — Approved photo queues | Approve Nutrition Meal and Label photos, save one meal only to Pantry, approve a Training photo; refresh and revisit Today and source pages | Only *persisted* approved job disappears from active queues permanently, no duplicate canonical log or ghost card; failed/unapproved jobs stay recoverable |

**Record only case IDs, PASS/FAIL, tested device/build SHA and non-sensitive defect references.** Never attach raw photos, body values, health prompts or account secrets to the repository.


**State: PREPARED, NOT RUN.** Work branch: piq/00-baseline-20261014. The current QA-only migration occurred under explicit approval; no production migration, owner login or iPhone/iPad acceptance is implied. Phase-owner acceptance remains unconfirmed (0/9).

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

**No sign-off is granted by writing this checklist.** PIQ8 polish has development implementations, but owner mobile acceptance and the core PIQ7 release gate remain pending. PIQ8 is not a substitute for core intelligence acceptance.
