# Current task

## I0A — Single-Owner Instance Configuration Foundation

### Status

Active implementation slice on branch `i0a-instance-config`.

Repository schema head remains:

`0041_exercise_library_calisthenics.sql`

No database migration is planned for I0A.

The master program is:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Product intent

Prepare Daurham Health to run as multiple **separate single-owner instances** from the same codebase.

The target is:

> Same code. Different deployment configuration, database, auth owner, and optional providers. No source-code search-and-replace.

I0A establishes the shared configuration/capability contract. It does **not** make Health multi-tenant and it does not yet generalize all Phoenix calendar logic; timezone authority is I0B.

## Canonical boundaries

Deployment configuration belongs in environment/server configuration:

- database/auth secrets;
- owner identity selector;
- provider credentials and provider endpoints;
- optional feature enablement;
- safe instance presentation values.

Owner Health state belongs in PostgreSQL:

- profile;
- goals;
- routines;
- supplements;
- targets;
- measurements;
- preferences that are editable Health data.

Client code must never receive provider secrets, database credentials, auth cookie secrets, or ingest bearer tokens.

## Deliverables

### 1. Typed instance configuration

Add a server configuration authority for I0A that resolves:

- app display name;
- optional external/home link;
- public demo enabled;
- Gemini configured;
- USDA configured;
- Home-AI configured;
- training photo import enabled;
- Apple Health sync configured;
- Body Shortcut configured;
- configured Health calendar timezone for safe display/diagnostics.

A missing optional provider must not make the whole app unavailable.

Feature flags may explicitly disable an optional capability even when its provider credentials exist.

### 2. Safe public capability contract

Expose a safe non-secret instance/capability payload through the existing public health/config surface.

The client may receive booleans and presentation values only.

It must never receive secret values.

### 3. Capability-driven Training UX

The primary Training logging flow is manual/current-app entry.

Fix the current Today behavior:

- Today → Training → primary `Log workout` routes to `/training/new`, not `/training/import`;
- photo import is secondary;
- Training page hides the photo-import action when training-photo capability is disabled;
- Training page must not poll transcription jobs when that capability is disabled;
- ordinary workout logging must work independently of Home-AI.

### 4. Environment contract

Add a complete `.env.example` with placeholders only.

At minimum include current runtime variables, including variables that existing docs currently miss such as:

- `BODY_CAPTURE_TOKEN`;
- `GEMINI_NUTRITION_RECIPE_MODEL`.

Classify required vs optional and document the consuming feature.

No real credentials.

### 5. Configuration doctor

Add `npm run config:check` (or equivalent) that validates configuration without printing secrets.

For I0A it must at least report:

- required database/auth/owner configuration presence;
- timezone syntax validity;
- optional provider/capability readiness;
- feature/provider inconsistencies.

It may perform a safe database connectivity check if practical in the current architecture.

Output must be useful for a fresh deployment and must not echo secret values.

### 6. Documentation / workflow state

- reconcile `CURRENT_TASK.md` with actual `main`;
- update `DEV_STATE.md` to schema head 0041 and current program;
- record the single-owner-instance portability decision in `DECISIONS.md`;
- keep `NEXT_INTELLIGENCE_ROADMAP.md` as the master program.

## Non-goals

I0A does not:

- implement multi-tenancy;
- change canonical Health timezone behavior across domains;
- change existing owner data;
- modify schema;
- solve fresh-instance Jake-specific routine seeds;
- implement Health Profile;
- add intelligence features.

Those are later slices.

## Tests / validation

Add focused tests for:

- public capability resolution with and without optional providers;
- explicit training-photo disable override;
- no secret material in the public payload;
- Today primary Training action routes to `/training/new`;
- configuration validation;
- existing Training manual flow remains available.

Run:

- `npx tsc -b`;
- `npx eslint .`;
- `npm test`;
- `npm run build`.

## Completion report

When complete:

- update `DEV_STATE.md`;
- set `CURRENT_TASK.md` to no active task / I0B next;
- report validation results;
- note any discovered portability gaps for I0B/I0C;
- do not push secrets.
