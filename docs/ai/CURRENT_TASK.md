# Current task

## I0B — Dynamic Instance Identity + Canonical Timezone

### Status

Active implementation slice on branch `i0b-instance-identity-timezone`.

Repository schema head remains:

`0041_exercise_library_calisthenics.sql`

No database migration is planned for I0B.

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Product intent

Finish the deployment-level portability work started in I0A so a second single-owner instance can use a different name, domain, feature set, and IANA calendar timezone without changing source code.

The design rule is:

> Deployment configuration owns instance identity and canonical calendar timezone. Shared domain code receives timezone explicitly; it does not read server environment state.

## Deliverables

### 1. Canonical timezone configuration

- Rename the hard-coded Phoenix value conceptually to a backward-compatible default, not the universal authority.
- `HEALTH_CALENDAR_TIMEZONE` from instance configuration becomes the server runtime authority.
- Shared deterministic date functions accept a timezone explicitly, while retaining a Phoenix default only where backwards-compatible tests/demo fixtures require it.
- Today, Activity, Sleep, cross-domain intelligence, Ask Health, Progress, and ingest/date bucketing must not silently use a different timezone from the configured instance.
- `ai_usage` billing months remain UTC.

### 2. DST-aware correctness

Add tests using at least one DST-observing timezone (for example `America/New_York`) covering:
- UTC/calendar-date boundaries;
- spring-forward/fall-back behavior where relevant;
- historical/as-of reads;
- no future-day leakage.

### 3. Dynamic instance presentation

Consume I0A public instance config in application chrome:
- app display name;
- optional external/home link;
- public demo availability.

Default values must preserve the current Jake deployment unless env is changed.

### 4. Demo capability behavior

When public demo is disabled:
- do not advertise demo from locked/public chrome;
- direct demo navigation must fail closed to a neutral unavailable/not-found experience rather than showing synthetic demo content.

No auth/private data behavior may change.

### 5. Deployment-neutral external setup

Update setup documentation and generated/external URL guidance so it does not require:
- `health.daurham.com`;
- `daurham.com`;
- Phoenix as a literal deployment assumption.

Body Shortcut / Health Auto Export instructions should use placeholders or safe instance-derived values.

### 6. Neutral provider identity

Remove Jake-specific provider fallback branding where practical (for example Open Food Facts default User-Agent) while preserving env overrides.

## Non-goals

I0B does not:
- make timezone an ordinary editable owner preference;
- rewrite historical stored timezone/provenance fields;
- implement multi-tenancy;
- solve Jake-specific routine seeds (I0C);
- add Health Profile or intelligence features;
- add a schema migration.

## Validation

Focused tests plus:
- `npx tsc -b`
- `npx eslint .`
- `npm test`
- `npm run build`

## Completion

When green:
- update DEV_STATE and DECISIONS;
- set CURRENT_TASK to no active task / I0C next;
- merge to main;
- record any remaining portability gaps.
