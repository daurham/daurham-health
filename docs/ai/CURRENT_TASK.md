# Current task

## I0–I10 integrated rollout

### Status

The numbered intelligence roadmap is complete through I10 and the combined stack is now exposed on:

`validate-i0-i10`

Last fully validated application commit:

`eac16edaa595929b51ec942e402acbd2c7378ee1`

Repository schema head:

`0049_passive_recovery_clinical_context.sql`

`main` has not been promoted.

## Integrated validation — green

GitHub Actions run `37579440908` passed the complete branch validation matrix:

- `npm ci`
- `npx tsc -b`
- `npx eslint .`
- `npm test`
- `npm run build`
- 1,479 Vitest tests passed
- Vercel preview deployment completed successfully

The integrated pass also fixed compatibility issues found only after I0–I10 were exercised together, including stale migration-head contracts, backup fixture evolution, Health Profile test inputs, Training substitution semantics, Weekly Coach target-change wording guards, Nutrition source assertions, and the legacy Stretch SQL test fixture.

## Database rollout gate

Production migration state has not yet been verified or changed.

A temporary read-only GitHub Actions probe attempted to run `npm run instance:check`, but the repository has no `DATABASE_URL` secret, so the check stopped before opening a database connection.

The connected Neon tooling is currently unscoped and requires the Health project's non-secret Neon project ID. The connected Vercel tooling cannot currently read project environment metadata under the project's team scope.

No production migration has been executed from this validation work.

## Next operation

1. Resolve production database access using either the existing Health Neon project ID or an approved database connection path.
2. Run the read-only `npm run instance:check` equivalent and compare `schema_migrations` with repository migrations through `0049`.
3. Test any pending migrations against a Neon branch / production-like copy before applying them to the production database.
4. Apply only the pending migrations after explicit approval.
5. Re-run the instance readiness check.
6. Perform owner mobile QA on Today, Training, Health Profile/Settings, Coach, Weekly Coach, Ask Health, and Personal Lab handoff.
7. Promote the validated stack to `main` only when database readiness and owner QA are green.

## Guardrails

- Do not promote `main` before the database migration gate is resolved.
- Do not copy Health data between owners.
- Do not enable unverified overnight vitals.
- Keep Personal Lab experiment creation owner-reviewed; deterministic server logic may prefill title/rationale only.
