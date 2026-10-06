# Current task

## Status

No active implementation task.

I0B — Dynamic Instance Identity + Canonical Timezone is complete and is being merged to `main`.

Repository schema head remains:

`0041_exercise_library_calisthenics.sql`

No database migration was added for I0B.

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Completed I0B outcome

- `HEALTH_CALENDAR_TIMEZONE` is the runtime Health-calendar authority for owner flows.
- Shared deterministic date/domain helpers accept an explicit IANA timezone; `America/Phoenix` remains only the backward-compatible/default owner value.
- Today, Activity, Sleep, Progress, Ask Health/intelligence, Goals, Coach, Weekly Coach, Lab evidence, Nutrition, Training defaults, Body capture/review, backups, and Apple/HAE runtime paths use the configured instance calendar where applicable.
- DST-observing regression coverage was added, including `America/New_York` spring-forward/fall-back boundaries.
- App chrome consumes public instance configuration for display name, external home link, public-demo capability, and calendar timezone.
- Owner pages wait for instance configuration before initializing date-sensitive browser state.
- Public-demo links/content fail closed when the capability is disabled.
- Body Shortcut setup is deployment-neutral.
- Open Food Facts fallback identity is neutral; env override remains supported.
- Existing stored timezone/provenance rows were not rewritten.
- Current Jake deployment defaults remain `Daurham Health`, `https://daurham.com`, and `America/Phoenix` unless deployment env overrides them.

## Validation

Independent final validation workflow run `37541015943` passed:

- `npx tsc -b`
- `npx eslint .`
- `npm test`
- `npm run build`

No source changes were made after that validation other than documentation/workflow cleanup.

## Next planning slice

Next candidate portability slice:

**I0C — Fresh-instance bootstrap + owner-specific seed separation**

Expected focus:

- prevent legacy Jake-specific routine/owner seed state from appearing as owner-created data in a fresh instance;
- preserve historical references in Jake's existing database;
- document/verify a clean first-run deployment path;
- keep one-owner-per-deployment architecture.

Draft the I0C contract before implementation.
