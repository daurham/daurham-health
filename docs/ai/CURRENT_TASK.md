# Current task

## Status

No active implementation task.

I0C — Fresh-Instance Bootstrap + Owner-Specific Seed Separation is complete and validated for merge.

Repository schema head after I0C:

`0042_instance_seed_scope.sql`

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Completed I0C outcome

- Historical A/B/C 1.3.1 templates are classified as `legacy_owner` seeds.
- Beginner Calisthenics is explicitly classified as a `product_builtin`.
- A fresh database automatically deactivates the original A/B/C family when no historical Training session references it.
- An established database preserves the A/B/C family when canonical Training history references it.
- Historical templates and sessions are never deleted or rewritten.
- Owner-created routines remain untouched.
- `npm run instance:check` reports migration currency, legacy-routine state, product built-ins, exercise-catalog availability, and active owner-routine count without printing secrets.
- `docs/SINGLE_OWNER_DEPLOYMENT.md` documents the second-owner setup path: separate Neon/auth/database, separate Vercel project/env, optional providers, migration/validation, and first-use checks.
- The repository now has one generic branch validation workflow instead of stale H4/H5/I0B branch-specific validation workflows.

## Validation

GitHub Actions run `37545271735` passed:

- `npx tsc -b`
- `npx eslint .`
- `npm test`
- `npm run build`

The first I0C validation run caught one TypeScript-only initialization error in the new instance checker; that was fixed in a single corrective commit before the successful run above.

## Deployment note

Vercel Hobby deployment creation is currently rate-limited because earlier I0B work produced too many remote commits.

I0C was therefore developed with the new batched workflow:
- dormant Git objects first;
- one feature branch;
- minimal corrective commits;
- generic GitHub Actions validation;
- one merge.

Production deployment may remain blocked until Vercel's rolling limit clears. The Git repository state is independent of that temporary deployment quota.

## Next planning slice

**I1 — Health Profile + Flexible Training Intent**

Expected focus:

- canonical Health Profile;
- DOB-derived age;
- height;
- bounded persistent owner context;
- baseline training frequency/sequence/preferences;
- current-week overrides and movable rest/training days;
- sequence-first programmed session intent;
- no punitive missed-day semantics.

Draft the I1 contract before implementation.
