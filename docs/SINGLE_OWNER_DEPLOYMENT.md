# Single-Owner Daurham Health Deployment

This guide creates a second private Health instance for another owner without turning the app into a multi-tenant service.

Recommended architecture:

> one codebase → separate Vercel project → separate Neon project/database/auth → separate environment values → one owner

A GitHub fork is optional.

## 1. Choose repository strategy

### Recommended for family use: same repository, separate Vercel project

Use the same GitHub repository for both owners.

Benefits:
- one codebase to maintain;
- fixes/features can reach both instances;
- health data remains isolated because each deployment uses its own database/auth/secrets.

Trade-off:
- both instances normally follow the same application releases.

### Optional: fork the repository

Fork only if the second owner expects independent code customization or release timing.

A fork adds an upstream-sync chore. It is not required for data isolation.

## 2. Create a separate Neon project

Create a new Neon project for the new owner.

Do not reuse the existing Health database.

The new instance needs:
- its own PostgreSQL database / `DATABASE_URL`;
- its own Neon Auth configuration;
- its own owner account.

Configure the deployment domain as a trusted auth domain when required by Neon Auth.

## 3. Clone/connect the code

For local setup:

```bash
git clone <health-repository-url>
cd daurham-health
npm ci
cp .env.example .env.local
```

Do not search-and-replace `health.daurham.com`, `daurham.com`, or Phoenix in source code. Instance differences belong in configuration.

## 4. Required environment

Fill the required values in `.env.local` and later in the new Vercel project.

### Database/auth

```env
DATABASE_URL=...
NEON_AUTH_BASE_URL=...
NEON_AUTH_COOKIE_SECRET=...
HEALTH_OWNER_EMAIL=owner@example.com
```

`HEALTH_OWNER_USER_ID` may be used instead of/in addition to the email once the stable auth user id is known.

### Instance presentation

Example:

```env
HEALTH_APP_NAME=Health
HEALTH_EXTERNAL_HOME_URL=
HEALTH_PUBLIC_DEMO_ENABLED=false
HEALTH_CALENDAR_TIMEZONE=America/Phoenix
```

Use the owner's real IANA timezone if different.

## 5. Provider configuration

### Gemini

For Gemini-backed features:

```env
GEMINI_API_KEY=...
```

Model-specific variables may be left at application defaults unless intentionally overridden.

The second deployment should use its own API key where practical so quotas/costs/troubleshooting stay independent.

### USDA FoodData Central

For USDA lookup:

```env
USDA_FDC_API_KEY=...
```

### Open Food Facts

No private API key is required.

Optional overrides:

```env
OPEN_FOOD_FACTS_BASE_URL=https://world.openfoodfacts.org
OPEN_FOOD_FACTS_USER_AGENT=Health/1.0 (personal nutrition app; owner@example.com)
```

### Training photo import / Home-AI

If the owner does not want workout-photo transcription:

```env
HEALTH_FEATURE_TRAINING_PHOTO_IMPORT=false
```

Leave `HOME_AI_BASE_URL` and `HOME_AI_API_KEY` unset.

Normal manual Training remains available.

### Apple Health / Health Auto Export

Optional.

If enabled, generate a unique write token for this instance:

```env
APPLE_HEALTH_SYNC_TOKEN=...
```

Use this deployment's own `/api/...` ingest URL in Health Auto Export.

### Body Shortcut

Optional.

If enabled:

```env
BODY_CAPTURE_TOKEN=...
```

Use this deployment's own domain when building the Shortcut.

## 6. Validate configuration before migration

Run:

```bash
npm run config:check
```

This reports required/optional configuration without printing secrets.

## 7. Apply migrations

Run against the new Neon database:

```bash
npm run migrate
```

Fresh-instance behavior after migration:
- the shared exercise catalog is available;
- Beginner Calisthenics remains a product built-in;
- the original owner's historical A/B/C paper routines are hidden;
- no goals, supplements, nutrition history, measurements, experiments, or owner-created routines are copied from another owner.

Then run:

```bash
npm run instance:check
```

A clean new instance should report:
- schema current;
- legacy A/B/C hidden;
- Beginner Calisthenics active;
- exercise catalog available.

## 8. Create the Vercel project

Create a new Vercel project connected to the chosen repository/fork.

Configure the same environment values in Vercel.

The deployment should use its own production domain or Vercel domain.

No API endpoint source edits are required because browser calls use relative `/api/...` routes.

## 9. Sign in as the owner

Sign in using the owner identity configured by:

- `HEALTH_OWNER_USER_ID`; or
- `HEALTH_OWNER_EMAIL`.

The application remains one-owner-per-deployment.

## 10. Optional integrations

Configure only what the owner wants.

A missing optional provider should not break ordinary Health usage. Capability-driven UI hides/disables unavailable workflows such as workout-photo import.

## 11. First-use checklist

After deployment:

1. Sign in.
2. Confirm Training opens normal manual workout entry.
3. Confirm the original A/B/C owner routines are absent on a fresh database.
4. Confirm Beginner Calisthenics/exercise library are available.
5. Add an owner-created Saved Routine if desired.
6. Test Nutrition search.
7. Test Gemini only if configured.
8. Configure Apple/Body ingest only if wanted.
9. Create a backup after initial setup.

Health Profile onboarding will become part of first-run setup when that roadmap phase lands.

## 12. Development/deployment discipline

Vercel may create a Preview Deployment for each pushed branch commit.

For this project:
- batch implementation into a small number of remote commits;
- validate locally/GitHub Actions;
- avoid dozens of tiny branch pushes;
- merge once a slice is green.

This keeps Hobby-plan deployment usage predictable.

## What should never be shared between owners

Do not share:
- `DATABASE_URL`;
- auth cookie secrets;
- ingest bearer tokens;
- owner auth identity;
- private backup archives.

Provider keys may technically be shareable in some systems, but separate keys are preferable when available.

## What should not require source edits

A normal new instance should not edit source code for:
- domain name;
- app name;
- timezone;
- owner identity;
- database;
- auth endpoint;
- Gemini;
- USDA;
- Home-AI availability;
- Apple ingest token;
- Body Shortcut token;
- public demo availability.

If ordinary deployment still requires source search-and-replace for one of those, treat that as a portability bug.
