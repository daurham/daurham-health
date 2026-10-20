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
| Vercel project | Connected Vercel lookup returns actual deployment IDs and branch-alias resolution (see section 5) | **PASS: deployed source identity; NOT runtime isolation** |
| Vercel PIQ Preview branch configuration | Read-only `filter_project_envs(decrypt=false)` returned branch-scoped entries for `DATABASE_URL`, QA Auth URL, `NEON_AUTH_COOKIE_SECRET`, `HEALTH_OWNER_USER_ID`, `HEALTH_PIQ_PREVIEW_TEST_OWNER_USER_ID`, `HEALTH_PIQ_PRODUCTION_OWNER_USER_ID`, and binding flags/identities | **Presence and scope confirmed, values/effective runtime NOT verified** |
| Preview candidate SHA setting | Current read-only Preview branch-scoped setting equals validated code SHA `6c487e659a184c0706a28cbe16820eeee7ae98d5`; branch alias serves a docs-only successor SHA `335f0c2` with code-equivalent tree (12 commits, only docs changed) | **PASS: configured code pin; deployment SHA differs, runtime attestation blocked** |
| PIQ owner API lock | `server/piq-preview-access.ts` locks PIQ marker/ref APIs by code; older deployed Previews cannot be assumed to run that commit | **Source gate exists, actual Preview response NOT attested** |
| Owner acceptance | No verified protected QA session or mobile sign-offs; PIQ phase acceptance remains **0/9** | **BLOCKED** |

**Data handling:** This audit read GitHub repository source, GitHub Actions metadata, Vercel variable **names/scope/timestamps** (without decryption) and Neon project/Auth/schema-migration metadata only. It did not read owner health rows, Auth sessions, production database connectivity, secret values, application private API responses, or personal photos. It did not write to Vercel, Neon, production, or owner data.

## 2. Remaining release blockers (in dependency order)

1. **Preview deployment identity — source metadata resolved.** Vercel now confirms READY deployments for both the tested SHA and the docs-only successor. The current branch alias resolves to the docs-only successor. Source diff confirms application-code equivalence only, not deployed process equivalence or runtime isolation. Do not disable deployment protection.
2. **Exact code/SHA pin consistency — configuration corrected, still not an exact deployment SHA match.** Branch-scoped expected-SHA is already the tested code commit `6c487e6`; serving branch alias SHA is newer docs-only `335f0c2`. Compare was docs-only. Do not change the Preview setting, alias or deploy merely to make a check green. A future approved runtime attestation must pin one immutable deploy and its exact SHA.
3. **Effective independent DB/Auth binding.** Independently verify the *deployed process* connects to the separate empty-origin QA Neon project/root and Better Auth tenant with the disposable QA owner, not a production-derived branch or production sessions. Existing configured variable entries and Neon project provenance do **not** attest the runtime. Verify owner identity **difference** without exposing the IDs, secret or PHI; verify a usable QA-only login in the protected, approved workflow. Missing/incorrect metadata remains fail-closed.
4. **Authentication/security.** Confirm effective strong independent Preview cookie secret, working disposable QA owner, preview-owner exact match, production-versus-QA owner mismatch, and bounded authorized access. Presence of encrypted environment values does not validate their contents. Do not unlock owner routes before these checks pass and before a distinct explicit owner approval.
5. **Migration/backup/recovery release safety.** Current QA migration filenames are 60/60, and isolated PG16/18 rollback/restore tests passed; real production schema head, live encrypted backup/restore, and deployment rollback remain unverified. A deployment rollback does not reverse database migrations.
6. **Controlled owner acceptance.** Only after independent runtime isolation and explicit unlock approval: execute `PIQ_OWNER_ACCEPTANCE_RUNBOOK.md` A1–A10 and P1–P4 and the targeted PIQ-3 question matrix on a disposable QA profile. Record case ID, status, device/browser and exact tested SHA—no private answers in GitHub. **0/9 is phase-owner acceptance**, not a count of the mobile checklist.
7. **Explicit release decision.** Final risk and rollout review must independently authorize any migration, API lock change, `main` merge and production deployment. None is implied by this audit.

## 3. Smallest next permitted action

Continue **read-only** qualification of effective Preview process DB/Auth and QA-owner identity using an approved, exact immutable deployment. Permissioned deployment metadata and static host/project/branch binding configuration are now verified, but they do not attest the injected runtime secrets or authenticated session separation. Until those remain independently attested, do not request owner mobile testing, modify persistent QA/prod rows, remove the 503 hardlock, deploy, or merge `main`.

The final validated code candidate above is **frozen** pending release gates. Fix newly reproduced correctness defects on separate PIQ branches only. The earlier user-reported Nutrition Label delete-persistence fix ([PR #47](https://github.com/daurham/daurham-health/pull/47)), Pantry→Log atomic transition ([PR #48](https://github.com/daurham/daurham-health/pull/48)), and first-time label atomic save ([PR #49](https://github.com/daurham/daurham-health/pull/49)) are **automated-development validated but not live-owner accepted**.

## 4. Follow-up: permissioned Vercel deployment metadata (2026-10-19 Phoenix)

The previously blocked deployment-identity lookup was repeated read-only using the connected Vercel project and deployment metadata endpoints, **without** changing the Preview API lock, secrets, aliases, owner data or environment variables.

- Project `daurham-health` resolves as `prj_KNUk1CcJbYjQbSkADSHSuynhpZJU` under the `daurhams-projects` account; these are provider-returned identifiers, not inferred deployment targets.
- Deployment `dpl_DwZhZ1EaYNq6PJcm7piXdyBcuRef` is **READY**, on `piq/00-baseline-20261014`, at exact validated code SHA `6c487e659a184c0706a28cbe16820eeee7ae98d5`. This closes the *existence / source identity* part of release blocker 1 for that immutable deployment only, not process isolation or functional QA.
- The newer **READY** deployment `dpl_4oJ1pgq4tP3JqCysCe2AhEPorREN` is on the same branch at `335f0c2116377cc91b66132c8a3a8c6980f4e240` with a docs-only `[skip ci]` message. Vercel reports the **same branch alias** for both deployment records, so the effective alias must be treated as potentially serving the newer docs-only SHA; immutable deployment URL and branch alias are not interchangeable release evidence.
- Project SSO/deployment protection is enabled for non-custom domains. No protected application route, owner login, effective runtime database/Auth binding or cookie secret has been exercised or attested. No unlock is justified.

**Revised smallest next gate:** use the immutable validated-code deployment ID to read-only inspect effective Preview configuration and, only through an approved safe identity attestation method, demonstrate the process connects to the independent QA project/Auth tenant. Resolve the Preview expected-SHA mismatch against the *serving* deployment without blindly changing it. Until then owner acceptance remains **0/9**, and `main`/Production remain unchanged.

## 5. Follow-up: branch alias and independent configured QA binding (2026-10-19 Phoenix)

Provider metadata was checked read-only. These findings supersede historical blocked/mismatched *metadata* statements above; they do **not** declare runtime/owner acceptance.

1. **Effective alias resolution (Vercel control plane):** GET deployment by `daurham-health-git-piq-00-baseline-20261014-daurhams-projects.vercel.app` resolves to READY deployment `dpl_4oJ1pgq4tP3JqCysCe2AhEPorREN`, commit `335f0c2116377cc91b66132c8a3a8c6980f4e240` on `piq/00-baseline-20261014`. Alias listing confirms it is linked to this successor deployment, not the older READY immutable validated-code deployment `dpl_DwZhZ1EaYNq6PJcm7piXdyBcuRef` at `6c487e659a184c0706a28cbe16820eeee7ae98d5`.
2. **Source equivalence:** GitHub compare `6c487e6...335f0c2` shows 12 subsequent commits with only four documentation files affected (`docs/ai/CURRENT_TASK.md`, `docs/ai/PIQ4_QA_CREDENTIAL_SETUP.md`, `docs/ai/PIQ_OWNER_ACCEPTANCE_RUNBOOK.md`, and this release-readiness report). This qualifies the code tree as unchanged, **not** the live environment/session.
3. **Preview pin corrected:** The presently configured, non-secret, branch-scoped `HEALTH_PIQ_EXPECTED_PREVIEW_SHA` equals `6c487e659a184c0706a28cbe16820eeee7ae98d5`. It equals tested **code** SHA but not the serving **deployment** SHA; no Vercel variable was changed in this audit. Both `HEALTH_DB_BINDING_ENFORCE` and `HEALTH_AUTH_BINDING_ENFORCE` are configured `true` for this Preview branch.
4. **Independently corroborated QA project endpoint metadata:** Configured `HEALTH_PIQ_EXPECTED_NEON_PROJECT_ID` and `DATABASE_NEON_PROJECT_ID` match separate Neon QA project `lively-wave-25801832`; configured `HEALTH_PIQ_EXPECTED_PREVIEW_BRANCH_ID` matches QA root `br-crimson-cloud-akrf5kuo`, with no parent ID; configured `HEALTH_DB_PREVIEW_ENDPOINT_HOST` matches Neon QA compute `ep-soft-sun-akxjo2f3.c-3.us-west-2.aws.neon.tech`. Preview host differs from configured Production host. QA database is `neondb` and PostgreSQL 18. Preview and Production database **names need not differ** if the hosts/project/branch are distinct; they are currently configured with equal names.
5. **QA Auth provider metadata:** Neon reports `better_auth` integration on this QA root. Its mere presence does not prove a distinct owner-account universe, a usable disposable QA login, separate cookies, or correct effective runtime Auth URL; Auth URL values and secrets were **not decrypted**. Neon returns an `init_source` field of `parent-data` even for this QA root, without a parent branch ID; root identity alone does not certify an empty user dataset. Do not infer absence of copied private rows from project/root names.
6. **Safety boundary:** No hosted owner APIs or authenticated sessions called; no secrets decrypted, no real DB query or mutation, no Vercel edits, no API unlock, no release/promote/main changes. Application CI/PG synthetic tests remain the code qualification; formal owner acceptance remains **0/9**.

**Next strictly required evidence:** provider- and deployment-bound read-only attestation of effective `DATABASE_URL` and `NEON_AUTH_BASE_URL` inside an **exact** protected Preview function, plus separate QA tenant/session and owner-account isolation proofs, using an approved path that does not expose credentials or owner health records. If protected runtime access is unavailable, stay blocked rather than equating control-plane configuration with runtime proof.
