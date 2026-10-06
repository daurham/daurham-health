# Current task

## I0C — Fresh-Instance Bootstrap + Owner-Specific Seed Separation

### Status

Implementation prepared as one batched commit object on top of `main`.

Do not move a Git branch ref until the current Vercel deployment-rate window clears.

Repository schema head after I0C:

`0042_instance_seed_scope.sql`

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Product intent

A normal second-owner deployment should begin as **their** Health instance, not as a copy of Jake's owner state.

The codebase may contain shared product/reference seeds, but schema migration history must not make a clean database look like the original owner's account.

### Seed classes

**Product/reference seeds**
- data-source definitions;
- canonical exercise catalog;
- exercise guidance/metadata;
- Beginner Calisthenics built-in.

These may exist on every instance.

**Legacy owner seed**
- original A/B/C 1.3.1 paper routine family from migration 0003.

These exist for historical compatibility but are not universal product defaults.

**Owner state**
- owner-created routines;
- goals;
- supplements;
- nutrition history;
- body measurements;
- experiments;
- Coach/XP history;
- Daily Context;
- Health Profile/preferences.

These start empty on a fresh deployment.

## Implementation contract

### 1. Migration 0042 classifies historical Training seeds

Add metadata:
- A/B/C 1.3.1 → `seed_scope = legacy_owner`;
- CAL-BEG 1.0.0 → `seed_scope = product_builtin`.

Do not delete historical templates.

### 2. Fresh databases hide A/B/C automatically

If no historical Training session references the original A/B/C family:
- mark A/B/C inactive.

No environment flag is required.

### 3. Established databases preserve history

If any Training session references the A/B/C family by:
- snapshotted `routine_code`; or
- `workout_template_id`;

then migration 0042 must not deactivate that legacy family.

Do not reactivate a template that the owner had already intentionally deactivated.

### 4. Product built-ins remain

Fresh instances must retain:
- active exercise catalog;
- Beginner Calisthenics built-in.

Owner-created routines are untouched.

### 5. Instance doctor

Add:

`npm run instance:check`

It must report, without printing secrets:
- migration currency;
- fresh/established legacy-routine state;
- Beginner Calisthenics availability;
- exercise-catalog availability;
- owner-created routine count.

### 6. Deployment guide

Add:

`docs/SINGLE_OWNER_DEPLOYMENT.md`

The guide must cover:
- same-repo vs fork choice;
- separate Neon project/database/auth;
- Vercel project;
- required env;
- Gemini;
- USDA;
- Open Food Facts;
- optional Home-AI/photo import;
- optional Apple/Body ingest;
- migration/config/instance checks;
- first-use smoke tests;
- batching Git pushes to avoid preview-deployment exhaustion.

A normal setup must not require source search-and-replace.

## Non-goals

I0C does not:
- create multi-tenancy;
- copy Jake data into another owner instance;
- implement Health Profile;
- redesign Training routines;
- make built-in routines editable;
- alter historical workout sessions;
- share databases or auth between owners.

## Validation before branch publication

Once Vercel's deployment window clears, expose this batched commit on one branch and run:

- `npm run config:check`;
- `npm run migrate` against a disposable/test database as appropriate;
- `npm run instance:check`;
- `npx tsc -b`;
- `npx eslint .`;
- `npm test`;
- `npm run build`.

Do not merge unless the fresh-instance and established-instance migration scenarios both pass.
