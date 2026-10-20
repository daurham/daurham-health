# PIQ consolidated release-readiness evidence — 2026-10-19 Phoenix / 2026-10-20 UTC

> **Status: development code QUALIFIED; Preview runtime and owner acceptance BLOCKED.**
> This is a read-only evidence handoff, not permission to deploy, migrate, enable protected APIs, or inspect personal health records. Keep the approved Preview 503 lock active and `main` unchanged.
>
> This report supersedes *older configuration-status assertions* in `PIQ4_QA_CREDENTIAL_SETUP.md` and `PIQ_OWNER_ACCEPTANCE_RUNBOOK.md` where the Vercel branch-scoped entries were previously reported absent. It does **not** supersede the release-gate requirements themselves.

## 1. Independently checked in this session

| Gate | Evidence | Classification |
| --- | --- | --- |
| PIQ candidate code | `6c487e659a184c0706a28cbe16820eeee7ae98d5`, merged PRs [#49](https://github.com/daurham/daurham-health/pull/49) and [#50](https://github.com/daurham/daurham-health/pull/50) | **PASS: code validation only** |
| Full app verification | GitHub Actions [39359003775](https://github.com/daurham/daurham-health/actions/runs/39359003775): exact candidate SHA, completed SUCCESS, TypeScript, lint, Vitest, build | **PASS: automation** |
| SQL verification | GitHub Actions [39359003848](https://github.com/daurham/daurham-health/actions/runs/39359003848): exact candidate SHA, PG16 and PG18 both completed SUCCESS | **PASS: isolated synthetic tests** |
| PIQ working tip | `f18624f514d4ead1e7a7e8c424db4ce57326191e`, a subsequent docs-only `[skip ci]` checkpoint; code equals the candidate above | **Known; not a fresh validated code SHA** |
| GitHub `main` | `dbc3fcb68324d75d30a96132b725456ec7e45d49` | **Separate from PIQ; no promotion** |
| GitHub pull requests | No open PRs at audit start; both PRs #49/#50 merged to PIQ | **PASS: branch hygiene** |
| Independent QA Neon | Project `daurham-health-piq-isolated-qa`, its own root `main` branch, separate QA project, PostgreSQL 18 | **PASS: QA project identity/lineage metadata** |
| QA schema migration state | Read-only `SELECT COUNT(*), MAX(filename) FROM public.schema_migrations`: 60, `0060_experiment_outcome_feedback_events.sql` | **PASS: filename count and head; not owner-row/restore attestation** |
| QA Auth integration | Neon provider metadata reports `better_auth` on separate QA root | **Integration present, usable independent session not attested** |
| Vercel project | Unscoped project lookup returns `daurham-health`; explicit team-scoped deployment inspection returns 403; unscoped deployment list returned no deployment records | **Project known; serving deployments UNVERIFIED** |
| Vercel PIQ Preview branch configuration | Read-only `filter_project_envs(decrypt=false)` returned branch-scoped entries for `DATABASE_URL`, QA Auth URL, `NEON_AUTH_COOKIE_SECRET`, `HEALTH_OWNER_USER_ID`, `HEALTH_PIQ_PREVIEW_TEST_OWNER_USER_ID`, `HEALTH_PIQ_PRODUCTION_OWNER_USER_ID`, and binding flags/identities | **Presence and scope confirmed, values/effective runtime NOT verified** |
| Preview candidate SHA setting | Read-only, nonsecret expected-SHA value was a valid 40-hex SHA but **neither** the latest validated code SHA nor the docs-only tip; actual value deliberately omitted | **BLOCKED: exact-version mismatch** |
| PIQ owner API lock | `server/piq-preview-access.ts` locks PIQ marker/ref APIs by code; older deployed Previews cannot be assumed to run that commit | **Source gate exists, actual Preview response NOT attested** |
| Owner acceptance | No verified protected QA session or mobile sign-offs; PIQ phase acceptance remains **0/9** | **BLOCKED** |

**Data handling:** This audit read GitHub repository source, GitHub Actions metadata, Vercel variable **names/scope/timestamps** (without decryption) and Neon project/Auth/schema-migration metadata only. It did not read owner health rows, Auth sessions, production database connectivity, secret values, application private API responses, or personal photos. It did not write to Vercel, Neon, production, or owner data.

## 2. Remaining release blockers (in dependency order)

1. **Fresh Preview deployment identity.** Obtain permissioned Vercel deployment metadata for `daurham-health` and the precise PIQ Preview Git ref. Confirm which project, ref, source SHA, and READY deployment is actually serving. Existing team-scoped 403 cannot be treated as proof the runtime is deployed or isolated. Do not disable deployment protection.
2. **Exact code/SHA pin consistency.** After choosing the reviewed code commit and verifying a fresh deployment, align the **Preview-only** expected-SHA pin to that deployment; neither an outdated pin nor a docs-only branch tip is a substitute for the tested code identity. Do not modify Preview variables merely to make a static test green.
3. **Effective independent DB/Auth binding.** Independently verify the *deployed process* connects to the separate empty-origin QA Neon project/root and Better Auth tenant with the disposable QA owner, not a production-derived branch or production sessions. Existing configured variable entries and Neon project provenance do **not** attest the runtime. Verify owner identity **difference** without exposing the IDs, secret or PHI; verify a usable QA-only login in the protected, approved workflow. Missing/incorrect metadata remains fail-closed.
4. **Authentication/security.** Confirm effective strong independent Preview cookie secret, working disposable QA owner, preview-owner exact match, production-versus-QA owner mismatch, and bounded authorized access. Presence of encrypted environment values does not validate their contents. Do not unlock owner routes before these checks pass and before a distinct explicit owner approval.
5. **Migration/backup/recovery release safety.** Current QA migration filenames are 60/60, and isolated PG16/18 rollback/restore tests passed; real production schema head, live encrypted backup/restore, and deployment rollback remain unverified. A deployment rollback does not reverse database migrations.
6. **Controlled owner acceptance.** Only after independent runtime isolation and explicit unlock approval: execute `PIQ_OWNER_ACCEPTANCE_RUNBOOK.md` A1–A10 and P1–P4 and the targeted PIQ-3 question matrix on a disposable QA profile. Record case ID, status, device/browser and exact tested SHA—no private answers in GitHub. **0/9 is phase-owner acceptance**, not a count of the mobile checklist.
7. **Explicit release decision.** Final risk and rollout review must independently authorize any migration, API lock change, `main` merge and production deployment. None is implied by this audit.

## 3. Smallest next permitted action

Continue **read-only** metadata qualification and release document reconciliation. The first gate requiring a future operator action is permissioned access to actual Vercel Preview deployment metadata; until the correct serving SHA/DB/Auth can be independently attested, do not request owner mobile testing, modify persistent QA/prod rows, remove the 503 hardlock, deploy, or merge `main`.

The final validated code candidate above is **frozen** pending release gates. Fix newly reproduced correctness defects on separate PIQ branches only. The earlier user-reported Nutrition Label delete-persistence fix ([PR #47](https://github.com/daurham/daurham-health/pull/47)), Pantry→Log atomic transition ([PR #48](https://github.com/daurham/daurham-health/pull/48)), and first-time label atomic save ([PR #49](https://github.com/daurham/daurham-health/pull/49)) are **automated-development validated but not live-owner accepted**.
