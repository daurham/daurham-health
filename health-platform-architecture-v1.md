# Health Platform Architecture v1

**Status:** Architecture baseline\
**Purpose:** Source of truth for the initial implementation of
`health.daurham.com`\
**Scope:** Personal, single-user health platform combining nutrition,
strength training, body measurements/composition, Apple Health imports,
and derived progress analytics.

------------------------------------------------------------------------

## 1. Product boundary

Health is the canonical application for personal health data and
user-facing health workflows.

### Health owns

-   Health UI and navigation
-   Nutrition logging and food catalog
-   Training templates, workout sessions, exercises, and sets
-   Body weight, measurements, and body-composition observations
-   Apple Health import and normalized activity/biometric observations
-   Import validation, normalization, provenance, deduplication, and
    matching
-   Health targets
-   Progress analytics and projections
-   Authentication/authorization for health data
-   Canonical structured health data in Neon

### Home AI owns

-   Ollama and local model execution
-   Workout-sheet image interpretation
-   Optional OCR/vision/AI processing
-   Expensive or privacy-sensitive AI analysis
-   Optional background computation that is not required for basic
    Health availability

### Home Dashboard owns

-   Read-only or lightweight summaries of Health data
-   Links/deep links into Health
-   It is a consumer of Health, not the owner of Health records

### Availability rule

Core Health functionality must continue to work when the home server,
Cloudflare Tunnel, or local AI is unavailable.

------------------------------------------------------------------------

## 2. Deployment topology

``` text
daurham.com
└── Portfolio

health.daurham.com
└── Vercel
    ├── React/TypeScript Health UI
    ├── Health API
    ├── import adapters
    ├── validation
    ├── normalization
    ├── deduplication/matching
    └── analytics
            │
            ▼
          Neon
      canonical structured
          health data

ai.daurham.com
└── Cloudflare Tunnel
    └── Home server
        ├── Ollama
        ├── workout-image interpretation
        └── optional AI/compute

home.daurham.com
└── Cloudflare Tunnel
    └── Home Dashboard
        └── consumes Health summaries
```

The initial infrastructure goal is to reuse the existing Vercel, Neon,
Cloudflare, domain, and home-server environment without introducing a
required new recurring service.

------------------------------------------------------------------------

## 3. Core design principles

### 3.1 Raw → Canonical → Derived

Health data has three conceptual layers.

**Source/raw:** what an external source actually supplied.

**Canonical:** normalized concepts controlled by Health.

**Derived:** calculations produced from canonical data.

Examples:

``` text
Fit Profile XLSX
    ↓
raw import
    ↓
weight = 192 lb
body_fat = 29.6 %
    ↓
30-day weight trend
body-fat trend

Apple Health JSON
    ↓
raw import
    ↓
step_count / heart_rate / workout observation
    ↓
daily activity totals / training context

Workout image
    ↓
Ollama candidate JSON
    ↓
validated workout + sets
    ↓
volume / estimated 1RM / strength trend
```

Derived values must never be confused with measurements or imported
observations.

### 3.2 Provenance is first-class

Imported or generated records must retain enough information to
answer: - Where did this value come from? - When was it measured? - When
was it imported? - Which import produced it? - What external/source
identifier was supplied? - Was it measured, device-estimated,
user-entered, AI-interpreted, or derived?

### 3.3 Imports are idempotent

Importing the same source data repeatedly must not repeatedly create
canonical records.

The ingestion system should prefer stable external identifiers when
available. Otherwise it should generate deterministic fingerprints from
source, metric/workout type, timestamps, values, and other stable source
fields.

### 3.4 Deduplication does not require destroying provenance

Two source records may represent the same real-world observation.

Example:

``` text
Fit Profile XLSX ─────┐
                      ├── canonical weigh-in
Apple Health ─────────┘
```

Health may link or select a canonical observation while preserving both
source records.

### 3.5 Historical snapshots stay historical

A logged food records the nutrition consumed at that time. Later catalog
edits must not rewrite historical intake.

Likewise: - completed workout sets are historical records; - imported
scale observations are historical records; - Apple Health source
observations are historical records.

Derived analytics may be recomputed when algorithms improve.

### 3.6 AI produces candidates, not authority

AI/OCR/vision output must pass deterministic schema validation before
becoming canonical Health data.

Where interpretation is uncertain or consequential, the UI should
provide review/correction before commit.

### 3.7 Database domains do not dictate navigation

The data model can contain Nutrition, Training, Body,
Activity/Biometrics, Imports, and Analytics without requiring six
top-level tabs.

UX will be designed separately around actual workflows.

### 3.8 Optimize for a personal platform

v1 is intentionally single-user. Do not add `user_id` to every table
solely for hypothetical multi-tenancy.

Use stable primary keys and clean domain boundaries so identity can be
added later if the project changes scope.

------------------------------------------------------------------------

## 4. Domain model

``` text
Health
├── Nutrition
│   ├── food catalog
│   ├── ingredients
│   ├── recipes/meals
│   ├── food logs
│   ├── log groups
│   └── nutrition targets
│
├── Training
│   ├── exercise definitions
│   ├── workout templates
│   ├── template exercises
│   ├── workout sessions
│   ├── workout exercises
│   └── workout sets
│
├── Body
│   ├── measurement sessions
│   ├── body metrics
│   └── manual circumference measurements
│
├── Activity / Biometrics
│   ├── metric observations
│   ├── Apple Health workouts
│   └── workout enrichment/linking
│
├── Imports
│   ├── import jobs
│   ├── source records
│   └── canonical links
│
└── Analytics
    ├── trends
    ├── aggregates
    └── projections
```

------------------------------------------------------------------------

## 5. Shared conventions

### IDs

Prefer UUID primary keys for new Health entities. Existing integer
Nutrition IDs can be mapped during migration rather than forcing all new
domains to use serial integers.

### Timestamps

Store instants as `TIMESTAMPTZ`.

For events that are interpreted by calendar day, preserve an explicit
timezone or timezone context rather than relying on the browser's
current timezone.

Recommended shared fields where relevant: - `created_at` -
`updated_at` - `occurred_at` / domain-specific equivalent - `timezone`

### Units

Canonical records should store an explicit unit where a metric is not
intrinsically unitless.

Normalize internally to a documented canonical unit where useful, while
preserving source unit/value in source records.

Examples: - body mass: kg internally, UI may display lb - circumference:
cm internally, UI may display in - energy: kcal - macros: g - duration:
seconds - distance: m

The exact normalization policy should be encoded centrally rather than
repeated across importers.

### Metadata

JSONB is appropriate for source-specific details that are not queried as
core domain fields.

Do not use `metadata` as a substitute for important canonical columns.

------------------------------------------------------------------------

## 6. Import and provenance subsystem

### 6.1 `data_sources`

Represents an origin of data.

Suggested fields:

``` text
id UUID PK
key TEXT UNIQUE
display_name TEXT
source_kind TEXT
created_at TIMESTAMPTZ
```

Initial keys may include:

``` text
health_app
legacy_nutrition
fit_profile_xlsx
apple_health
manual
workout_image
home_ai
```

`source_kind` may distinguish application, device export, manual entry,
AI, etc.

### 6.2 `import_jobs`

One ingestion attempt.

Suggested fields:

``` text
id UUID PK
source_id UUID FK -> data_sources
imported_at TIMESTAMPTZ
source_filename TEXT NULL
format_version TEXT NULL
status TEXT
record_count INTEGER
inserted_count INTEGER
matched_count INTEGER
skipped_count INTEGER
error_count INTEGER
content_hash TEXT NULL
metadata JSONB
created_at TIMESTAMPTZ
```

A unique content hash can prevent accidental reprocessing of
byte-identical exports while record-level idempotency handles
overlapping exports.

### 6.3 Source-record identity

Do not necessarily create a gigantic generic `source_records` table for
every Apple Health sample in v1.

Instead, every imported canonical table should support provenance
through fields or a lightweight shared link model such as:

``` text
source_record_links
-------------------
id UUID PK
source_id UUID FK
import_job_id UUID FK NULL
external_id TEXT NULL
external_fingerprint TEXT
entity_type TEXT
entity_id UUID
source_payload JSONB NULL
created_at TIMESTAMPTZ
```

Recommended uniqueness:

``` text
UNIQUE(source_id, external_fingerprint)
```

If an external source provides a stable ID, the fingerprint can be based
primarily on that ID. Otherwise the adapter generates a deterministic
fingerprint.

This keeps provenance generic without forcing all health data into an
entity-attribute-value database.

------------------------------------------------------------------------

## 7. Nutrition

The existing NutriTrack repository establishes `food_logs` as the
canonical "I consumed this food at this time" record. Preserve that
concept.

### 7.1 Nutrition migration strategy

**Keep/adapt:** - historical `food_logs` - `food_log_groups` -
ingredients - composed/standalone reusable meals - packaged foods -
barcode/Open Food Facts flow - USDA resolution - quantity
parsing/scaling - Quick Log workflow - AI estimate draft → review →
log - nutrition snapshots on consumed records

**Replace during migration:** - unauthenticated public CRUD -
client-side AI passcode - localStorage as canonical target storage -
legacy `LoggedMeal` representation - browser-current-timezone day
semantics - loose integer-only `source_id` - lazy
`CREATE TABLE IF NOT EXISTS` migrations - multiple competing DB access
layers

### 7.2 `food_logs`

Adapt the existing model rather than redesigning consumption from
scratch.

Recommended conceptual fields:

``` text
id UUID PK
logged_at TIMESTAMPTZ
timezone TEXT NULL
group_id UUID NULL
display_name TEXT
source_type TEXT
catalog_entity_type TEXT NULL
catalog_entity_id UUID NULL
external_source_id TEXT NULL
quantity NUMERIC
serving_description TEXT NULL
weight_grams NUMERIC NULL
calories_kcal INTEGER
protein_g NUMERIC NULL
carbs_g NUMERIC NULL
fat_g NUMERIC NULL
confidence TEXT NULL
calorie_low_kcal INTEGER NULL
calorie_high_kcal INTEGER NULL
original_input TEXT NULL
metadata JSONB
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

The important rule is that the nutrition values are snapshots.

### 7.3 Catalog

Preserve the useful conceptual split: - ingredients - reusable
composed/standalone meals or recipes - packaged foods

Do not force these into one generic table during the first migration
unless implementation evidence shows a clear simplification.

A unified search layer can search across the catalog types without
requiring a unified storage table.

### 7.4 Targets

Create first-class dated targets.

Suggested table:

``` text
nutrition_targets
-----------------
id UUID PK
effective_from DATE
effective_to DATE NULL
calories_kcal INTEGER NULL
protein_g NUMERIC NULL
carbs_g NUMERIC NULL
fat_g NUMERIC NULL
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

This permits historical analytics to use the target that was active at
the time.

------------------------------------------------------------------------

## 8. Training

Training needs to represent both planned workouts and what actually
happened.

### 8.1 `exercise_definitions`

``` text
id UUID PK
name TEXT
normalized_name TEXT
category TEXT NULL
equipment TEXT NULL
movement_pattern TEXT NULL
metadata JSONB
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Avoid hard-coding every exercise property before it is needed.

### 8.2 `workout_templates`

``` text
id UUID PK
name TEXT
version TEXT NULL
notes TEXT NULL
is_active BOOLEAN
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Templates should be versionable or snapshot into sessions so editing a
future template does not rewrite historical workouts.

### 8.3 `workout_template_exercises`

``` text
id UUID PK
template_id UUID FK
exercise_id UUID FK
slot_id TEXT NULL
position INTEGER
prescription JSONB
notes TEXT NULL
```

`prescription` can initially represent target sets/reps/rest/load
guidance without prematurely modeling every programming method.

### 8.4 `workout_sessions`

``` text
id UUID PK
template_id UUID NULL
template_name_snapshot TEXT NULL
template_version_snapshot TEXT NULL
started_at TIMESTAMPTZ NULL
ended_at TIMESTAMPTZ NULL
timezone TEXT NULL
duration_seconds INTEGER NULL
effort NUMERIC NULL
pain_level NUMERIC NULL
notes TEXT NULL
status TEXT
created_at TIMESTAMPTZ
updated_at TIMESTAMPTZ
```

Suggested status vocabulary: - `planned` - `in_progress` - `completed` -
`cancelled`

### 8.5 `workout_exercises`

``` text
id UUID PK
workout_session_id UUID FK
exercise_id UUID FK
exercise_name_snapshot TEXT
slot_id TEXT NULL
position INTEGER
notes TEXT NULL
```

### 8.6 `workout_sets`

``` text
id UUID PK
workout_exercise_id UUID FK
set_number INTEGER
set_type TEXT
weight_value NUMERIC NULL
weight_unit TEXT NULL
reps NUMERIC NULL
duration_seconds INTEGER NULL
distance_meters NUMERIC NULL
rpe NUMERIC NULL
rir NUMERIC NULL
load_state TEXT NULL
notes TEXT NULL
completed_at TIMESTAMPTZ NULL
```

The schema should allow bodyweight, weighted, duration-based, and
distance-based work without requiring all fields.

### 8.7 Workout image import

``` text
image
  ↓
home-ai / Ollama
  ↓
structured candidate JSON
  ↓
schema validation
  ↓
review if needed
  ↓
workout session + exercises + sets
```

The original image does not need to be stored in Neon. Large/raw
binaries should remain local unless a future requirement changes that
decision.

------------------------------------------------------------------------

## 9. Body

### 9.1 `body_measurement_sessions`

A measurement event groups metrics that came from the same
weighing/measurement session.

``` text
id UUID PK
measured_at TIMESTAMPTZ
timezone TEXT NULL
source_id UUID FK
import_job_id UUID NULL
device_name TEXT NULL
notes TEXT NULL
created_at TIMESTAMPTZ
```

### 9.2 `body_metrics`

``` text
id UUID PK
measurement_session_id UUID FK
metric_key TEXT
value NUMERIC
unit TEXT
value_kind TEXT
metadata JSONB
created_at TIMESTAMPTZ
```

Suggested `value_kind`: - `measured` - `device_estimated` -
`vendor_derived` - `manual`

Initial metric keys can include: - `weight` - `body_fat_percentage` -
`body_fat_mass` - `fat_free_mass` - `skeletal_muscle_percentage` -
`skeletal_muscle_mass` - `muscle_mass` - `body_water_percentage` -
`body_water_mass` - `visceral_fat` - `subcutaneous_fat` - `bone_mass` -
`protein_percentage` - `protein_mass` - `bmr` - `metabolic_age`

Segmental metrics can use explicit keys such as: -
`left_arm_muscle_mass` - `right_arm_muscle_mass` -
`left_leg_muscle_mass` - `right_leg_muscle_mass` - `trunk_muscle_mass` -
corresponding fat mass/percentage keys

Use a controlled application vocabulary for metric keys rather than
accepting arbitrary spreadsheet headings directly.

### 9.3 Manual measurements

Manual circumference measurements can use the same
measurement-session/body-metric system with keys such as: -
`waist_circumference` - `chest_circumference` - `hip_circumference` -
`neck_circumference` - `left_arm_circumference` -
`right_arm_circumference` - `left_thigh_circumference` -
`right_thigh_circumference`

This avoids a second parallel measurement architecture.

### 9.4 Fit Profile XLSX adapter

The adapter should: 1. recognize the expected export format/version; 2.
parse rows deterministically; 3. map vendor headings to canonical metric
keys; 4. normalize units; 5. classify metrics as
measured/device-estimated/vendor-derived; 6. generate deterministic
source fingerprints; 7. detect already-imported records; 8. present an
import preview; 9. commit only validated records.

Do not use AI to parse a known structured XLSX format.

------------------------------------------------------------------------

## 10. Activity and biometrics / Apple Health

Apple Health is an external observation source, not the canonical owner
of Health data.

### 10.1 Initial allowlist

Do not ingest every possible HealthKit metric in v1.

Initial useful metrics: - steps - active energy - resting energy - heart
rate - resting heart rate - walking/running distance - exercise time -
VO2 max - workouts - weight - body fat

Sleep can be added after the core import pipeline is stable.

### 10.2 `metric_observations`

For time-series metrics that do not naturally belong to Body or
Training:

``` text
id UUID PK
metric_key TEXT
start_at TIMESTAMPTZ
end_at TIMESTAMPTZ NULL
value NUMERIC
unit TEXT
source_id UUID FK
source_device TEXT NULL
external_id TEXT NULL
import_job_id UUID NULL
metadata JSONB
created_at TIMESTAMPTZ
```

Indexes should support: - `(metric_key, start_at)` - source/external
identity used for deduplication

Do not use this generic table for food logs, workout sets, or other rich
domain entities merely because it can hold numbers.

### 10.3 Apple Health body overlap

If Apple Health contains a weight/body-fat record originating from the
same scale measurement represented by the Fit Profile XLSX, do not
blindly create two user-facing weigh-ins.

Matching can consider: - metric type - close/exact timestamps -
normalized value - device/source metadata - known source relationship

Preserve both provenance records if useful while selecting/linking a
single canonical body observation.

### 10.4 Apple Health workout overlap

A Health Training session and an Apple Health workout can represent the
same physical workout.

Match candidates using: - date/time overlap - workout/activity type -
duration - source metadata

After confirmation or sufficiently deterministic matching:

``` text
Canonical Training Workout
├── Health-owned details
│   ├── exercises
│   ├── sets
│   ├── reps/load
│   ├── effort
│   ├── pain
│   └── notes
└── Apple Health enrichment
    ├── duration
    ├── heart rate
    ├── active energy
    └── other activity metrics
```

Do not discard either source merely because they overlap.

------------------------------------------------------------------------

## 11. Deduplication and matching

Use two distinct concepts.

### Exact duplicate

The same source record has already been imported.

Action: skip automatically.

### Possible semantic duplicate

Two different source records may represent the same real-world event.

Action: match/link according to domain-specific rules.

Examples: - identical Apple Health export imported twice → exact
duplicate - scale XLSX weight + Apple Health mirrored weight → semantic
duplicate - Health strength session + Apple Watch strength workout →
semantic duplicate

Do not build one universal fuzzy-dedup algorithm. Each domain has
different semantics.

------------------------------------------------------------------------

## 12. Analytics

Analytics should read canonical data and produce derived values.

Initial candidates: - daily/weekly calorie and macro totals - calorie
target adherence - weight moving average - weekly/monthly weight
change - body-measurement trends - scale-estimated composition trends -
workout frequency - weekly training volume - exercise volume - estimated
1RM trends where applicable - PR detection - steps/activity trends -
resting-heart-rate trends

Later candidates: - estimated TDEE from intake + weight trend - strength
change while gaining/cutting - calorie/protein intake vs performance -
waist vs weight trend - body-composition trend confidence - weight
projections

Derived metrics should be reproducible. Prefer computing inexpensive
aggregates on demand initially rather than persisting every derived
result.

Persist/cache derived data only when performance or algorithm versioning
gives a concrete reason.

------------------------------------------------------------------------

## 13. API boundaries

Organize APIs by domain rather than creating a single giant dispatcher
conceptually.

Suggested surface:

``` text
/api/nutrition/*
/api/training/*
/api/body/*
/api/activity/*
/api/imports/*
/api/progress/*
```

Vercel implementation may still consolidate physical serverless
entrypoints if platform constraints make that useful; routing structure
and domain code should remain separated.

### Import endpoints

Conceptual flow:

``` text
POST /api/imports/preview
POST /api/imports/commit
GET  /api/imports
GET  /api/imports/:id
```

Preview should parse and validate without silently committing
questionable data.

### Validation

Use shared Zod schemas at API/domain boundaries where practical. Avoid
maintaining incompatible frontend, API, and DB representations without
explicit adapters.

------------------------------------------------------------------------

## 14. Authentication and security

The existing calorie tracker has unauthenticated CRUD and a client-side
AI passcode. These must not become Health's security model.

Before exposing real Health APIs broadly: - implement real
authentication; - require authentication on private Health routes; -
keep database credentials and AI secrets server-side; - validate
uploaded/imported content; - set practical upload limits; - never trust
client-provided canonical IDs or ownership context.

Because v1 is single-user, authentication can remain conceptually
simple. Multi-tenant authorization is not required.

The exact authentication provider is intentionally **not selected in
this architecture document**. Choose it as a separate implementation
decision after evaluating what is already available in the Vercel/Neon
environment.

------------------------------------------------------------------------

## 15. Database access and migrations

Health should use one intentional Postgres access layer.

Do not carry forward the existing mixture of: - `@vercel/postgres` -
`pg` - unused/partial Neon clients - lazy table creation in request
handlers

Requirements: - one DB access strategy; - versioned migrations; - no
production schema mutation as a side effect of ordinary API requests; -
migrations committed to the repository; - schema changes reproducible
locally and in production.

Before migrating NutriTrack production data, inspect the live schema.
The repository inventory explicitly cannot guarantee that live Neon
exactly matches repository DDL.

------------------------------------------------------------------------

## 16. Repository architecture

Keep feature/domain code discoverable.

Conceptual structure:

``` text
src/
├── app/
│   ├── routing/
│   └── shell/
│
├── features/
│   ├── today/
│   ├── nutrition/
│   ├── training/
│   ├── body/
│   └── progress/
│
├── domain/
│   ├── nutrition/
│   ├── training/
│   ├── body/
│   ├── activity/
│   └── imports/
│
├── server/
│   ├── db/
│   ├── routes/
│   ├── services/
│   └── auth/
│
├── shared/
│   ├── components/
│   ├── hooks/
│   ├── schemas/
│   ├── types/
│   └── utils/
│
└── integrations/
    ├── apple-health/
    ├── fit-profile/
    ├── open-food-facts/
    ├── usda/
    └── home-ai/
```

Do not mechanically create every folder before code needs it. This is a
dependency-direction guide, not a requirement for empty directories.

------------------------------------------------------------------------

## 17. UI boundary

Initial top-level product areas remain:

``` text
Today
Nutrition
Training
Body
Progress
```

This is provisional navigation, not a commitment to equal visual
prominence.

### Workflow principle

The Today experience should eventually prioritize what the user needs
now.

Examples: - nutrition logging is short and frequent; - an active workout
is a sustained session and should become prominent while running; - body
measurements are occasional; - progress is analytical rather than
transactional.

Detailed UX is intentionally postponed until the data foundation is
stable enough to know what actions and states actually exist.

------------------------------------------------------------------------

## 18. Nutrition migration sequence

Do not rewrite NutriTrack all at once.

### Phase N1 --- Preserve

-   Verify live production schema.
-   Export/back up existing canonical nutrition data.
-   Document row counts and constraints.

### Phase N2 --- Establish Health nutrition schema

-   Create Health migrations.
-   Introduce first-class targets.
-   Introduce explicit timezone handling.
-   Normalize provenance/source identifiers.
-   Keep consumption snapshots.

### Phase N3 --- Migrate

Recommended priority: 1. ingredients 2. meal combos/recipes and junction
data 3. packaged foods 4. food log groups 5. food logs 6. targets
reconstructed from current settings where appropriate

Maintain legacy IDs in migration metadata or mapping tables until
verification is complete.

### Phase N4 --- Port workflows

Move/rebuild: - Quick Log - Today's nutrition totals - food history -
barcode lookup - USDA lookup - nutrition-label OCR - AI estimates -
catalog management

### Phase N5 --- Verify

Compare old and new: - daily calorie totals - macro totals - historical
dates - group membership - catalog counts - representative
edited/AI/barcode records

Only retire the old tracker after equivalence is established.

------------------------------------------------------------------------

## 19. Implementation phases

### Phase 0 --- Application shell

Already suitable to begin independently: - routing - responsive shell -
placeholder Today/Nutrition/Training/Body/Progress pages - no real data
implementation

### Phase 1 --- Data foundation

-   select DB access layer
-   establish migration system
-   create shared source/import infrastructure
-   implement core Body and Training schemas
-   create first-class targets
-   establish timezone/unit conventions
-   establish validation patterns

### Phase 2 --- Body import vertical slice

Use Fit Profile XLSX as the first import implementation because: - the
source fixture already exists; - it is deterministic structured data; -
it exercises imports, provenance, normalization, units, deduplication,
preview, and canonical metrics without AI.

Deliver: - XLSX upload - preview - duplicate detection - commit - Body
history/trend view

### Phase 3 --- Training vertical slice

-   exercise definitions
-   templates
-   workout sessions
-   sets
-   manual workout logging
-   history
-   basic progress calculations

Then connect workout-image → Ollama → validated candidate JSON.

### Phase 4 --- Nutrition migration

Port canonical NutriTrack data and workflows using the migration
sequence above.

### Phase 5 --- Apple Health import

-   implement documented JSON adapter
-   begin with allowlisted metrics
-   exact deduplication
-   body overlap matching
-   workout overlap/enrichment
-   activity views

A real sample export should be used as an implementation fixture before
declaring the adapter complete.

### Phase 6 --- Cross-domain progress

-   weight/body trends
-   nutrition trends
-   strength trends
-   activity trends
-   cross-domain analysis
-   projections

------------------------------------------------------------------------

## 20. Explicitly postponed

Do not build these merely because the architecture can support them:

-   multi-user/tenant support
-   social features
-   coaching accounts
-   medical-record/EHR functionality
-   every Apple Health metric
-   continuous Apple Health automation
-   sleep analysis
-   cloud storage of workout/progress photos
-   complex event sourcing
-   generic EAV storage for all Health entities
-   queues/background-worker infrastructure without a demonstrated need
-   persistent precomputed analytics without a demonstrated need
-   a public API
-   a native mobile app
-   smartwatch app
-   elaborate AI health recommendations
-   automatic AI writes to canonical data
-   full redesign of Today/Health UX before core workflows exist

------------------------------------------------------------------------

## 21. Decisions still requiring implementation-time validation

1.  **Authentication provider**
2.  **Single Postgres client/access library**
3.  **Migration tooling**
4.  **Exact existing production NutriTrack schema**
5.  **Final canonical unit policy for each metric**
6.  **Real Health Auto Export JSON fixture and version**
7.  **Final workout JSON → Training adapter contract**
8.  **Whether raw import payloads belong in Postgres, local storage, or
    are discarded after normalized provenance is retained**
9.  **How much Apple Health time-series heart-rate data is worth
    retaining long term**
10. **UX for resolving uncertain semantic duplicates**

These are deliberate open decisions, not missing architecture.

------------------------------------------------------------------------

## 22. First implementation recommendation

After the frontend shell, the first backend vertical slice should be
**Body + Fit Profile XLSX import**, not Nutrition migration and not
Apple Health.

It is small enough to implement safely but forces Health to establish
the foundational systems every later domain needs:

``` text
upload
  ↓
import job
  ↓
adapter
  ↓
validation
  ↓
canonical units
  ↓
provenance
  ↓
deduplication
  ↓
preview
  ↓
commit
  ↓
database
  ↓
history/trend UI
```

Once that pipeline is solid: - Apple Health becomes another adapter; -
workout-image JSON becomes another adapter; - legacy Nutrition migration
can reuse provenance/migration conventions.

This gives the project an end-to-end working feature while testing the
architecture before migrating the most mature existing system.

------------------------------------------------------------------------

## 23. Architecture acceptance criteria

Before considering the v1 foundation complete:

-   [ ] Health works independently of the home server for normal use.
-   [ ] Database schema is created through versioned migrations.
-   [ ] One Postgres access strategy is used.
-   [ ] Private Health APIs require real authentication before
    production data exposure.
-   [ ] All imported records have traceable provenance.
-   [ ] Re-importing identical data is idempotent.
-   [ ] Semantic duplicates can be linked without destroying source
    provenance.
-   [ ] Historical nutrition/workout/body records are snapshots.
-   [ ] Scale-derived composition is distinguishable from directly
    measured weight.
-   [ ] AI-generated records are validated before canonical persistence.
-   [ ] Apple Health does not create duplicate user-facing body/workout
    events when the same event is already represented elsewhere.
-   [ ] Analytics operate on canonical data, not vendor-specific payload
    shapes.
-   [ ] Raw large binaries are not required in Neon.
-   [ ] Nutrition migration preserves historical totals.
-   [ ] UX remains free to prioritize contextual workflows rather than
    mirroring database domains.

------------------------------------------------------------------------

## 24. Guiding rule

> **Health owns the canonical record. Sources provide observations. AI
> provides interpretations. Analytics provide derived conclusions.**

Keeping those responsibilities separate is the central architectural
rule for Health Platform v1.
