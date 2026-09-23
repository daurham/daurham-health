# Daurham Health Platform — Complete Architecture & Data Systems Design Manual

**Canonical document:** `HEALTH-PLATFORM-DESIGN-MANUAL.md`  
**Manual version:** 1.0.6  
**System:** `health.daurham.com`  
**Status:** **v1.0.0 frozen.** Owner acceptance passed; final automated release verification passed; a fresh production backup was created and verified; package metadata is 1.0.0; release commit `7124ca513efa6c833457303ee6ff79d78344fce6` is tagged locally with annotated tag `v1.0.0`. The tag/commit have not been pushed. Backup/export/recovery was previously physically exercised against a disposable PostgreSQL restore target during Phase 15A.  
**Canonical calendar timezone:** `America/Phoenix`  
**Created / last updated:** `2026-09-22T21:02:16-07:00`  
**Timestamp policy:** every semantic, schema, provider, routing, security, or workflow update to this manual must add a new ISO-8601 America/Phoenix timestamp to the Revision Ledger.  
**Audience:** the owner, future maintainers, Cursor/coding agents, and any future AI asked to understand, rebuild, audit, or extend the platform.

---

## 0. How to use this manual

This is the durable blueprint for the Daurham Health Platform. It is intended to answer four questions without requiring access to the original design conversation:

1. **What is the product supposed to do?**
2. **Which system owns each kind of data and behavior?**
3. **What are the canonical data and analytics semantics?**
4. **How should a future developer or AI change the system without corrupting historical meaning?**

This document deliberately describes the **current retained architecture**. Intermediate approaches that were replaced during development are not part of the blueprint. Historical phase notes explain how the retained design was built, but a historical note never overrides a newer canonical rule.

### 0.1 Authority order

When sources disagree, use this order:

1. A **newer dated amendment in this manual**.
2. The **current repository implementation, migration, schema, and tests**, if they are newer than the manual.
3. Current machine-readable domain contracts such as workout schemas/templates.
4. Older design documents and project handoffs.
5. Conversational recollection.

If code or production data contradicts this manual, **do not silently choose one**. Determine which source is newer, identify whether the mismatch is a bug or an intended change, and update the manual with a dated revision explaining the resolution.

### 0.2 Required update discipline

Update this manual in the same development cycle whenever any of the following changes:

- canonical database schema or migration semantics;
- interpretation of NULL, zero, missing, partial, or provisional data;
- source identity or deduplication logic;
- API security or auth behavior;
- canonical timezone or date assignment;
- AI provider, model, prompt contract, fallback policy, or review policy;
- provider ownership boundaries;
- analytics algorithms or thresholds;
- data-retention or backup/restore behavior;
- user flow that changes what becomes canonical data;
- public/demo isolation rules.

Every update must add a Revision Ledger entry containing:

- timestamp in America/Phoenix;
- new manual version;
- affected sections;
- summary of change;
- data migration/recomputation impact;
- compatibility notes if historical records are affected.

### 0.3 Guiding architectural rule

> **Health owns the canonical record. Sources provide observations. AI provides interpretations or estimates. Deterministic code validates, calculates, and derives. Humans review consequential AI interpretations before they become canonical.**

This rule is the center of the entire architecture.

---

# 1. Product vision and scope

## 1.1 Product goal

`health.daurham.com` is a private, single-owner personal health platform that unifies:

- daily nutrition logging;
- paper-first strength-training capture;
- body weight and body-composition history;
- Apple Health / Health Auto Export activity and sleep observations;
- deterministic progress analytics;
- cross-domain evidence analysis;
- a daily command center;
- optional AI-assisted interpretation where it materially reduces friction.

The product is intentionally designed for **low-friction real use**, not for maximizing the number of available metrics. Every workflow should prefer trustworthy, understandable data over false precision.

## 1.2 Single-owner scope

The v1 system is personal and single-owner.

Consequences:

- canonical tables do **not** carry a `user_id` merely for hypothetical multi-tenancy;
- authorization is still mandatory because the data is private;
- APIs distinguish the authenticated owner from anonymous or authenticated non-owner callers;
- the schema uses stable IDs and clean domain boundaries so multi-user identity could be introduced later if scope changes.

## 1.3 Explicit non-goals for v1

Unless a later dated amendment says otherwise, v1 does not attempt to be:

- a medical-record/EHR system;
- a diagnostic or treatment system;
- a multi-user/social/coaching platform;
- a native iOS/Android app;
- a smartwatch app;
- a generalized public health API;
- a readiness/recovery-score product;
- a system where AI writes canonical health facts without review;
- a platform that ingests every possible HealthKit metric;
- an offline-first replicated database system.

---

# 2. System ownership and deployment topology

## 2.1 Domain ownership

### Health (`health.daurham.com`) owns

- the primary user interface and navigation;
- authentication/authorization boundaries for health data;
- canonical health data in Neon Postgres;
- Nutrition catalog/logs/targets and review workflows;
- Training templates/sessions/exercises/sets and transcription review;
- Body measurement sessions and metrics;
- Apple Health / HAE ingestion, provenance, reconciliation, and compact canonical views;
- Sleep nightly materialization;
- deterministic Progress analytics;
- deterministic cross-domain evidence analysis;
- Today command-center aggregation;
- user-facing imports, validation, deduplication, and error recovery.

### Home-AI (`ai.daurham.com`) owns

- local Ollama/model execution;
- the specialized workout-sheet transcription pipeline;
- optional local Nutrition interpretation when the user explicitly selects **Try local AI**;
- local/private experimentation or background compute that should not be required for normal Health availability.

### Home Dashboard (`home.daurham.com`) owns

- lightweight/read-only summaries of Health information;
- links/deep links into Health;
- home-automation presentation.

It is a consumer of Health, never the canonical owner of Health records.

## 2.2 Availability invariant

Core Health must continue to function when:

- the Beelink home server is offline;
- Cloudflare Tunnel is unavailable;
- Home-AI/Ollama is unavailable;
- Gemini is unavailable;
- Open Food Facts or USDA is unavailable.

Provider-specific features may degrade, but the application must not become generally unusable.

## 2.3 Deployment topology

```text
daurham.com
└── Portfolio

health.daurham.com
└── Vercel
    ├── React + Vite + TypeScript UI
    ├── single physical serverless API entrypoint: api/index.ts
    ├── domain routers/services
    ├── auth enforcement
    ├── import adapters
    ├── deterministic validation/analytics
    └── external provider clients
            │
            ▼
        Neon Postgres
      canonical Health DB

ai.daurham.com
└── Cloudflare Tunnel
    └── Beelink / Home-AI
        ├── Ollama
        ├── workout v1.3.x transcription jobs
        └── optional Nutrition local fallback

home.daurham.com
└── Cloudflare Tunnel
    └── Home Dashboard
```

The Vercel Hobby function-count constraint is handled by using **one physical `api/index.ts` dispatcher** while keeping conceptual routes and domain code separated. The physical consolidation must not become a monolithic domain architecture.

## 2.4 Cost philosophy

The platform was designed to reuse existing infrastructure and keep required recurring cost near zero where practical:

- Vercel for the web application;
- Neon for canonical Postgres;
- existing domain/DNS and Cloudflare Tunnel;
- home server for optional local compute;
- low-cost paid Gemini API for interactive Nutrition AI when cloud quality/latency is materially better than local inference.

Cost optimization must not justify poor UX or weak data quality. Local AI is used when locality provides actual value, not simply because the hardware exists.

---

# 3. Technology and repository architecture

## 3.1 Frontend

- React
- Vite
- TypeScript
- Tailwind CSS
- mobile-first responsive UI

The primary mobile navigation has five destinations:

- Today
- Nutrition
- Training
- Body
- Progress

Activity and Sleep live under Progress rather than becoming extra bottom-navigation tabs.

## 3.2 Backend

- Vercel serverless runtime
- one physical `api/index.ts` dispatcher
- domain-specific route handlers/services behind the dispatcher
- parameterized SQL against Neon
- Zod/shared deterministic schemas where practical
- explicit repository migrations; no lazy `CREATE TABLE IF NOT EXISTS` inside request handlers

## 3.3 Database

- Neon Postgres
- UUIDs for new canonical entities unless a retained domain contract requires another stable identifier
- `TIMESTAMPTZ` for real instants
- `DATE` for canonical calendar dates
- JSONB for bounded evidence/provider metadata, not as a substitute for queryable canonical fields

## 3.4 Conceptual code structure

The exact folder tree may evolve, but dependency direction should remain similar to:

```text
src/
├── app/                  # routing, shell, navigation
├── features/             # Today/Nutrition/Training/Body/Progress UI
├── domain/               # pure domain rules + analytics
│   ├── nutrition/
│   ├── training/
│   ├── body/
│   ├── activity/
│   ├── sleep/
│   ├── progress/
│   └── intelligence/
├── server/
│   ├── db/
│   ├── routes/
│   ├── services/
│   └── auth/
├── integrations/
│   ├── fit-profile/
│   ├── apple-health/
│   ├── health-auto-export/
│   ├── open-food-facts/
│   ├── usda/
│   ├── gemini/
│   └── home-ai/
└── shared/
    ├── components/
    ├── hooks/
    ├── schemas/
    ├── types/
    └── utils/
```

Do not mechanically create empty folders. This is an architecture map, not a directory mandate.

---

# 4. Security, authentication, and secrets

## 4.1 Owner authentication

Health uses managed Neon Auth / Better Auth semantics with same-origin auth routes.

Current rules:

- sessions are cookie-based;
- bearer tokens are not stored in browser `localStorage`;
- owner identity is restricted through server-side `HEALTH_OWNER_USER_ID`;
- anonymous access to private APIs returns `401`;
- authenticated non-owner access returns `403`;
- owner access proceeds normally;
- sign-up is disabled for the private application;
- password bootstrap/recovery uses the auth system rather than direct SQL mutation of Better Auth credentials.

## 4.2 Auth navigation behavior

The app preserves the in-app destination when a private request returns `401`, returns the user to the signed-out screen, and after successful sign-in navigates back to the original safe in-app path.

External URLs and auth URLs are not accepted as arbitrary return destinations.

Unknown application paths show a controlled **Page not found** state with navigation back to Today.

## 4.3 Machine ingestion authorization

Health Auto Export uses a dedicated high-entropy bearer token:

`APPLE_HEALTH_SYNC_TOKEN`

This token is **write-only in capability**. It authorizes Apple Health ingestion and must not grant owner read/export privileges.

## 4.4 External provider secrets

Server-only environment variables include, as applicable:

- `DATABASE_URL`
- `HEALTH_OWNER_USER_ID`
- `HOME_AI_BASE_URL`
- `HOME_AI_API_KEY`
- `GEMINI_API_KEY`
- `GEMINI_NUTRITION_MODEL`
- task-specific Gemini model overrides where configured
- `APPLE_HEALTH_SYNC_TOKEN`
- `USDA_FDC_API_KEY`

No secret may be exposed through a `VITE_` variable.

## 4.5 Error sanitization

User-facing API errors must not expose:

- SQL statements;
- database URLs;
- secrets/keys;
- stack traces;
- raw provider responses containing private data.

Suspicious/internal error text is replaced with generic failure copy such as `Request failed.`

---

# 5. Canonical data philosophy

## 5.1 Source → Canonical → Derived

Every domain follows three conceptual layers.

### Source / evidence

What an external system, user input, image, paper sheet, spreadsheet, device, or model actually supplied.

### Canonical

Normalized data whose semantics are controlled by Health.

### Derived

Reproducible calculations over canonical records.

Derived analytics must never masquerade as directly measured facts.

## 5.2 Provenance is first-class

Health must be able to answer, when relevant:

- where the value came from;
- when it occurred or was measured;
- when it was imported;
- which import produced it;
- which external ID/fingerprint identified it;
- whether it was user-entered, device-observed, vendor-derived, AI-interpreted, AI-estimated, or deterministically derived.

## 5.3 Exact duplicate vs semantic duplicate

These are different concepts.

### Exact duplicate

The same source observation has already been imported.

Action: skip/match idempotently.

### Semantic duplicate

Different source records may represent the same real-world event.

Action: apply domain-specific reconciliation while preserving source evidence.

There is no universal fuzzy-dedup algorithm.

## 5.4 Historical snapshot invariant

Historical facts remain historical.

Examples:

- a consumed Nutrition entry keeps the nutrition values that were accepted at logging time;
- a completed workout set is not rewritten because a future routine/template changes;
- a body measurement remains the imported/measured observation;
- Apple Health source observations remain evidence even if later derived algorithms change.

Derived analytics may be recomputed when algorithms change.

## 5.5 NULL, zero, missing, partial, provisional

This distinction is mandatory across the entire app.

- `NULL` / absent = unknown or not observed.
- explicit `0` = a real observed zero where the domain permits it.
- **partial** = some evidence exists but not enough to represent the whole intended observation.
- **provisional** = the observation is real but the period is still open, such as today's Activity row.

Never convert missing to zero for visual convenience.

## 5.6 Calendar timezone

Canonical Health calendar logic uses:

`America/Phoenix`

This applies to:

- Today date;
- Nutrition `log_date`;
- Training local date;
- Activity `summary_date`;
- Sleep `sleep_date` wake-date assignment;
- Progress `asOf` and ranges;
- Compare periods;
- Checkpoints;
- cross-domain date alignment.

Real instants remain `TIMESTAMPTZ`.

---

# 6. Shared import and provenance subsystem

## 6.1 Core tables

The foundation uses shared provenance tables including:

### `data_sources`

Represents a data origin, such as Health, legacy Nutrition, Fit Profile, Apple Health, manual entry, workout image, Home-AI, or HAE transport.

### `import_jobs`

Represents one ingestion attempt and stores safe operational metadata such as source, filename/version, status, row counts, content hash, and bounded metadata.

### `source_record_links`

Links deterministic source fingerprints/external IDs to canonical entities so repeated imports can be idempotent without forcing all data into a generic EAV store.

## 6.2 Idempotency

Importing identical or overlapping data repeatedly must not repeatedly create canonical records.

Use stable external IDs where possible; otherwise generate deterministic fingerprints from stable source semantics.

## 6.3 Preview → commit

Structured imports that can materially change canonical data should use a preview/validation step when practical.

Known examples:

- Fit Profile XLSX body import;
- workout transcription review;
- Nutrition label review;
- AI meal/description estimate review.

---

# 7. Database and migration map

The repository uses versioned migrations. Exact filenames after the last confirmed migration number must be verified from the current repository rather than invented.

Confirmed migration purposes through the implemented project include:

- `0001`: `data_sources`, `import_jobs`, `source_record_links` provenance foundation
- `0002`: Body measurement sessions + body metric storage
- `0003`: Training relational model
- `0004`: workout transcription job persistence
- `0005`: exercise performance metadata
- `0006`: unilateral rep-mode support
- `0007`: `progress_checkpoints`
- `0008`: Nutrition (`nutrition_foods`, `nutrition_entries`, `nutrition_targets`)
- `0009`: barcode normalization / nullable uniqueness/index behavior
- `0010`: `nutrition_capture_jobs`
- `0011`: meal grouping support (`meal_group_id`)
- `0012`: Apple-derived raw foundation (`activity_samples`, `sleep_intervals`, `activity_workouts`)
- `0013`: `activity_daily_summaries`
- `0015`: Nutrition Gemini/capture evolution (`0015_nutrition_gemini.sql`)
- later migration(s): `sleep_nightly_summaries` and subsequent hardening/backup work; **read the repository for exact numeric filenames before modifying them**.

The manual treats the semantics below as authoritative even when a table's exact migration number is not recorded here.

---

# 8. Body domain

## 8.1 Canonical model

Body data is organized as measurement sessions with one or more metrics.

### Measurement session

Represents one weighing/measurement event with:

- measurement instant/date context;
- source/provenance;
- device metadata where relevant;
- notes.

### Metrics

Use controlled metric keys for values such as:

- weight;
- body-fat percentage/mass;
- fat-free mass;
- skeletal muscle metrics;
- water metrics;
- visceral/subcutaneous fat;
- bone/protein/BMR/metabolic age;
- segmental metrics;
- manual circumference measurements.

Metrics carry value/unit and a value kind such as measured, device-estimated, vendor-derived, or manual.

## 8.2 Fit Profile XLSX import

The Fit Profile XLSX adapter is deterministic; AI is not used to parse a known structured spreadsheet.

Pipeline:

```text
XLSX upload
→ parse known structure
→ normalize optional missing sentinels
→ map vendor headings to controlled metric keys
→ normalize units
→ classify value kind
→ generate source fingerprints
→ duplicate detection
→ preview
→ commit
```

Important missing-value rule:

Vendor sentinels such as `- -`, `--`, dash-like placeholders, or `NA` represent **missing**, not zero. Legitimate negative numeric values must remain legitimate numeric values.

## 8.3 Body analytics

Body trends use a robust Theil–Sen slope.

A trend is available only when there are at least:

- 5 measurements;
- spanning at least 14 days.

Missing measurements are never forward-filled into fake daily body values.

Body UI is intentionally sparse/progressive: show what is actually observed rather than implying continuous measurements.

---

# 9. Training domain

## 9.1 Product philosophy

Training is **paper-first** because paper is faster and less distracting during the workout.

Canonical workflow:

```text
printed workout sheet
→ user writes minimal actual performance
→ photo
→ specialized transcription
→ structural + semantic validation
→ focused human review when needed
→ canonical workout session / exercises / sets
→ derived analytics
```

The transcription system's job is to **transcribe, not coach**.

## 9.2 Stable identity

Two identifiers must never be conflated:

- stable global exercise ID, e.g. `EX03`;
- routine slot ID, e.g. `A03` or `B03`.

A canonical workout exercise retains both because the same exercise can occupy different routine positions.

Historical workouts also retain the `template_version` used at the time.

## 9.3 Canonical set semantics

A set records actual work, not planned targets.

Rules:

- blank entire row = no set object;
- blank is not zero;
- actual reps/time outside the planned range remain actual data;
- extra/fewer sets are legal observations;
- warm-up/activation checklist items are not working-set volume;
- unilateral left/right measurements remain separate;
- timed and repetition measurement families are not mixed;
- ambiguous visible handwriting creates `REVIEW_REQUIRED` rather than an invented value.

### Load semantics

- Barbell: recorded load means total external load including bar.
- Dumbbell: recorded load means one dumbbell; never double it.
- Cable: recorded load means selected machine setting; never correct for the user's 2:1 pulley ratio.
- Carry: one-hand load unless the exercise definition says otherwise.
- Bodyweight: external load remains null unless explicitly recorded.

### Current paper shorthand

Within the **same exercise only**, a completed later set whose weight cell is blank may inherit the previous explicit load state. Inheritance never crosses exercises and never looks forward.

- explicit numeric load → `load_state=external`
- `BW` → `load_state=bodyweight`, `weight_lb=null`
- first completed set with no recoverable load → `load_state=unknown`, `weight_lb=null`

A partial handwritten date never receives an invented year; it becomes review-required until confirmed.

## 9.4 Validation layers

Training uses separate layers:

1. JSON/schema validation for local structure and field families.
2. Semantic validation for cross-object rules such as:
   - routine/slot prefix;
   - slot → exercise mapping;
   - template version;
   - unique set numbers;
   - legal measurement family for the exercise;
   - left/right semantics.

A messy or partial workout is not invalid merely because it deviates from the plan.

## 9.5 Home-AI workout transcription v1.3.1

The current specialized pipeline is intentionally not replaced by Gemini.

High-level pipeline:

```text
photo
→ EXIF/orientation handling
→ ArUco registration / sheet structure
→ routine identity
→ deterministic checkbox/blank interpretation
→ Granite 3.2 Vision 2B numeric/header reading
→ JS candidate assembly
→ schema + semantic validation
→ human review
→ canonical commit
```

Home-AI endpoints:

- `POST /api/workouts/v1.3/jobs`
- `GET /api/workouts/v1.3/jobs/:id`

Characteristics:

- durable filesystem-backed jobs;
- FIFO, one-at-a-time processing;
- persists across Home-AI restart;
- Health authenticates with protected API key;
- Health stores durable cross-device pending/review state;
- human review is mandatory where the vision result can silently substitute digits.

## 9.6 Training analytics

Canonical workout/set data is the source of truth. Analytics are derived.

Current Progress semantics include:

- Epley e1RM where appropriate;
- 1–12 reps = high-confidence e1RM range;
- 13–15 reps = lower-confidence/contextual e1RM;
- >15 reps excluded from e1RM;
- timed carries do not receive e1RM;
- unilateral strength uses the weaker/min(left,right) side for comparable strength evidence;
- volume uses the actual performed sides;
- Pareto performance frontier for load/repetition performance;
- first appearance of an exercise is a baseline, not a PR;
- later genuine bests become PR events;
- exercise trend uses last six appearances, comparing median of recent three vs prior three;
- ±2% is the current neutral/change threshold;
- fewer than six appearances = insufficient trend data;
- relative strength pairs performance with nearest bodyweight within ±3 days;
- consistency includes workout count, workouts/week, median gap, and longest gap.

Analytics return explicit states such as `available`, `insufficient_data`, `unsupported`, or `not_applicable` rather than fabricating values.


## 9.7 Canonical workout correction and deletion

Completed canonical workouts remain historical records, but owner-entered or transcription mistakes are correctable.

Workout detail exposes **Edit workout**. Edits use `PATCH` against the existing workout/session identity rather than deleting and recreating an unrelated session. The edit path may correct the current canonical workout fields supported by the application, including date, duration, effort, pain, notes, bodyweight, exercises, sets, repetitions, unilateral side values, timed values, load/load state, and set notes.

Edits pass the same structural and semantic Training validation used for canonical ingestion. Existing invariants therefore remain in force: slot/exercise identity, template history, unilateral separation, measurement-family validity, and load semantics cannot be bypassed by the edit UI.

Workout detail also exposes **Delete workout** with explicit destructive confirmation. Deletion is transactional: the canonical session is removed and owned workout-exercise/set rows cascade safely. Apple Activity workouts are never affected.

For workouts originally created from durable transcription jobs, deletion detaches `workout_transcription_jobs.workout_session_id` before the canonical session is removed while preserving the job's committed/dealt-with state. A later attempt to recommit that same transcription is rejected with `409` rather than silently recreating the deleted workout.

Training edit/delete remains owner-only; anonymous callers receive `401`, authenticated non-owners receive `403`, and the Apple Health machine-ingest token has no Training mutation authority.

---

# 10. Nutrition domain

## 10.1 Canonical principles

Nutrition keeps **food definitions** separate from **consumed snapshots**.

Editing a reusable food later does not rewrite historical intake.

Canonical concepts include:

- `nutrition_foods`
- `nutrition_entries`
- `nutrition_targets`
- durable capture jobs
- optional meal grouping where a workflow genuinely needs grouped component entries

A logged day exists only when at least one Nutrition entry exists. An unlogged day is unknown intake, not zero intake.

## 10.2 Legacy migration result

Legacy NutriTrack data was migrated into Health with preserved historical semantics and provenance. Technical duplicate history identified during migration was not duplicated into canonical Health.

The migration verified existing live production data rather than assuming repository DDL exactly matched production.

## 10.3 Daily Nutrition UX

Primary route:

`/nutrition?date=YYYY-MM-DD`

Calendar semantics use America/Phoenix.

Daily view supports:

- current totals;
- effective-dated targets;
- remaining/over copy;
- search/recent foods;
- quick one-serving add;
- quantity review/edit;
- manual entry;
- save-as-food where appropriate;
- delete/undo;
- capture actions for barcode, label, meal photo, and description.

The mobile experience uses >=16px inputs to avoid iOS focus zoom and preserves browser pinch-zoom.

## 10.4 Atomic date loading

Date changes use a committed/pending resource pattern:

- old coherent date + payload remains visible while new data loads;
- range/date header and payload commit together;
- superseded requests abort or lose generation ownership;
- failed refresh preserves the last valid payload;
- adjacent dates may be prefetched with bounded caching.

This prevents a header from claiming one date while the content still belongs to another.

## 10.5 Barcode workflow

Client scanning uses ZXing with UPC/EAN formats; QR is not the food barcode workflow.

Flow:

```text
scan barcode
→ local Health lookup first
→ if unknown, server-side Open Food Facts provider
→ structured candidate
→ human review
→ save canonical food if accepted
→ log consumed snapshot
```

Barcode strings preserve leading zeroes and normalize UPC/EAN equivalents.

Open Food Facts is not authoritative after a product is accepted into Health.

## 10.6 Nutrition-label photo

Normal interactive provider: Gemini.

Flow:

```text
photo + optional context
→ Health server
→ Gemini label interpretation
→ flat JSON candidate
→ Health normalization/validation
→ human review
→ save canonical food + consumed entry
```

Visible label numbers are the evidence. Optional context may clarify package/serving details but must not silently overwrite conflicting visible label values.

The workflow supports high image resolution for small text where needed.

## 10.7 Meal Photo v2

Meal Photo is explicitly an **AI estimate workflow**, not a catalog-matching workflow.

Flow:

```text
choose/take photo
→ preview
→ optional context
→ Analyze meal
→ Gemini estimates meal identity, visible components/assumptions, calories/macros
→ simple editable review
→ optional ±25% / ±10% / original / +10% / +25% whole-meal scaling
→ user may edit individual nutrition values
→ save ONE consumed snapshot
```

The context field exists so the user can tell AI what the image actually represents, including ingredients, portions, sauces, substitutions, or otherwise invisible facts.

Canonical provenance records that the entry was:

- `source = meal_photo_ai`
- provider/model identified;
- estimated;
- reviewed;
- user-adjusted or not;
- original AI estimate preserved separately from final reviewed values.

Daily totals use the **reviewed values**.

The image-estimate path does not require Health catalog matching, USDA selection, or per-component canonical food creation.

## 10.8 Food Description v2

Description logging uses the same core mental model as Meal Photo: **user-reviewed AI estimate**, but text provides stronger quantity evidence.

Example input:

`half a lb of ground wagyu beef, a quarter diced onion and a cup of broccoli`

Gemini returns useful high-level components with natural units and estimated nutrition. Health deterministically sums the returned component nutrition into the meal total. The review shows component cards so the user can understand what AI interpreted, but those cards are **explanation/evidence**, not mandatory database matches.

Rules:

- preserve natural user units such as lb, cup, slice, whole;
- never force the user to manually convert to grams;
- optional estimated gram equivalents are supporting evidence only;
- recognizable composite foods stay composite when appropriate, e.g. `2 slices supreme pizza` should not explode into crust/sauce/cheese/toppings;
- user can edit the final meal-level calories/macros;
- save one `description_ai` consumption snapshot;
- no catalog/USDA resolution is required for this path.

## 10.9 Gemini Nutrition provider architecture

Gemini is the default interpreter for:

- Food Description;
- Meal Photo;
- Nutrition Label.

Home-AI is an explicit **Try local AI** fallback, not an automatic prerequisite.

### Current routing

- Description → `gemini-3.5-flash-lite`
- Meal → `gemini-3.5-flash`
- Label → `gemini-3.5-flash`

Environment overrides remain supported.

### Request style

- server-side only;
- paid API tier;
- JSON MIME mode;
- minimal thinking;
- no provider-enforced response schema in the interactive path;
- bounded task-specific output limits/timeouts;
- Health performs deterministic normalization and semantic validation after parsing.

Provider output types are intentionally smaller than canonical Health domain types. The model should not need to understand internal IDs, provenance envelopes, or persistence details.

## 10.10 Nutrition failure behavior

Provider failure does not lose the capture job or source input.

Typical actions:

- Retry Gemini
- Edit context
- Try local AI
- Continue/build manually

Normal logging and existing catalog data remain usable when Gemini or Home-AI is unavailable.


## 10.11 Reusable-food save versus consumption

Reusable-food review flows distinguish the user's intent from the persistence model.

Where a capture naturally represents a reusable food definition—currently Nutrition Label, manual/new reusable food, and packaged/barcode-style food flows—the review offers two user-facing outcomes:

- **Save for later**: create or update the reusable `nutrition_foods` definition without creating a consumed `nutrition_entries` row.
- **Add to Today** or **Add to <date>**: create/reuse the food definition and also create the consumed nutrition snapshot for the active Nutrition date.

The date-aware action must never claim "Today" while the user is reviewing a historical date.

This distinction preserves the core snapshot invariant: later changes to the reusable food definition do not rewrite historical consumed entries. Retry/double-submit protection must prevent unintended duplicate catalog foods or duplicate consumption rows.

Meal Photo v2 and Food Description v2 remain one-off reviewed consumption-estimate workflows in v1 and are not forced into reusable-food semantics merely for consistency.

---

# 11. Progress and deterministic analytics

## 11.1 Progress philosophy

Progress answers:

> **What is happening? → Where? → Show evidence.**

There is no opaque overall health score.

Progress calculations are deterministic; AI is not required to establish the facts.

## 11.2 Shared range semantics

Supported ranges:

- `30d`
- `90d`
- `6m` = 183 days
- `1y` = 365 days
- `all`

Every range has an explicit `asOf`.

## 11.3 Primary routes

- `/progress`
- `/progress/strength`
- `/progress/strength/:exerciseId`
- `/progress/body`
- `/progress/activity`
- `/progress/sleep`
- `/progress/timeline`
- `/progress/compare`

## 11.4 Timeline

Timeline contains real chronological observations/events, not arbitrary summary findings.

Event families include:

- canonical Training workouts;
- genuine performance bests/PRs nested with source workout context;
- Body measurement sessions;
- Nutrition daily summaries;
- Progress checkpoints;
- Activity daily observations;
- Apple activity workouts as Activity context;
- complete and partial Sleep observations.

Date-only source facts remain date-only. The application does not invent timestamps.

Apple activity workouts never become Training sessions or PR sources.

## 11.5 Compare

Compare supports arbitrary periods, including unequal durations.

Rules:

- normalize Activity to observed completed-day averages rather than raw cumulative totals;
- Nutrition averages use logged days and expose coverage;
- Sleep averages use analysis-eligible nights and expose coverage;
- Body/Training use their own domain semantics;
- factual deltas are shown without claiming one period was healthier/better overall.

## 11.6 Checkpoints

`progress_checkpoints` provide dated labels/notes.

Since-checkpoint logic is domain-specific:

- Body baseline: nearest measurement within ±3 days, tie favoring earlier;
- exercise baseline: latest on/before checkpoint, max 14 days old;
- Nutrition: summarize interval after checkpoint; no fake intake baseline;
- Activity: summarize interval averages/coverage, excluding provisional current day;
- Sleep: summarize interval of analysis-eligible nights; no single-night baseline.

---

# 12. Activity domain and Health Auto Export

## 12.1 Why compact daily Activity is canonical

Apple's raw export contains very large overlapping time-series data. Health does not materialize millions of raw Activity samples into Neon for v1.

Canonical compact Activity lives in:

`activity_daily_summaries`

Current materialization/version semantics:

- `calculation_version = hae-daily-v2`
- evidence basis is `daily_summary`
- evidence source is `health_auto_export`
- `activity_samples` exists from the Apple foundation migration but remains intentionally unpopulated for the compact v1 strategy; the raw Apple export is archive/evidence rather than millions of Neon rows.

Important columns include:

- `summary_date`
- `timezone`
- `steps_count`
- `active_energy_kcal`
- `exercise_minutes`
- `walking_running_distance_m`
- `resting_heart_rate_bpm`
- `calculation_version`
- `evidence`
- provenance IDs / timestamps

## 12.2 Current canonical source policy

Health Auto Export daily summaries are canonical for:

- Step Count
- Active Energy
- Apple Exercise Time
- Resting Heart Rate

Walking/running distance is **unsupported for canonical v1 Activity** because real-world validation showed source contamination/disagreement. Its canonical column remains null rather than pretending the value is trustworthy.

Raw Apple XML remains archival/source evidence for historical context, sleep, and Apple workouts rather than becoming the canonical daily Activity computation path.

## 12.3 HAE ingest endpoint

`POST /api/ingest/apple-health`

Authorization:

`Authorization: Bearer <APPLE_HEALTH_SYNC_TOKEN>`

Activity automation characteristics:

- HAE JSON v2;
- daily summary;
- supported metric allowlist only;
- idempotent/updating canonical daily summary behavior;
- omitted metrics do not null already stored good values.

Two Activity automations have distinct operational roles:

1. **Recent-history reconciliation** — HAE `Previous 7 Days`, which means the seven completed calendar days preceding today. On 2026-09-22 this resolved to 2026-09-15 through 2026-09-21. This automation catches late HealthKit reconciliation without treating the current incomplete day as finalized history.
2. **Current-day sync** — a separate HAE current-day export using the same endpoint and supported metrics so the Today command center receives provisional same-day Activity updates.

The four canonical Activity metrics on both paths are Step Count, Active Energy, Apple Exercise Time, and Resting Heart Rate. Both write to the same canonical daily-summary pipeline. A repeated current-day summary updates the same logical daily row rather than creating a second Activity day.

The distinction is transport-level, not an analytics change: the current day remains provisional and the completed-day reconciliation feed remains the basis for finalized recent-history correction.

## 12.4 Current-day provisional semantics

The current America/Phoenix Activity row is real but incomplete.

Example behavior:

- today's current HAE step total can appear on the Today page and Activity chart as `so far`; a verified 2026-09-22 current-day manual export updated the live row from an older 129-step snapshot to 3,688 steps without ingestion changes;
- today's values are excluded from completed-day averages;
- today's values are excluded from period coverage denominator;
- today's values are excluded from 7-vs-7 comparisons;
- today's values are excluded from Compare/checkpoint/cross-domain completed-day analytics.

For an `asOf` in the past, the ending day is historical and treated normally.

## 12.5 Activity analytics

Per-metric coverage is independent because a day can contain steps while RHR or exercise minutes are absent.

- steps/active energy/exercise → average over observed completed days;
- resting HR → median over observed completed days;
- missing day remains missing;
- explicit observed zero remains zero.

Short-term comparison uses latest seven **completed** calendar days vs the previous seven, requiring at least four observed days in each window.

---

# 13. Sleep domain

## 13.1 Raw evidence

Historical sleep intervals originate from Apple Health XML and live in:

`sleep_intervals`

Ongoing Sleep Analysis arrives through a second Health Auto Export automation using the same ingest endpoint but an **unaggregated** sleep path.

Aggregated HAE daily sleep totals are not accepted as canonical raw evidence because the nightly arbitration engine requires individual intervals.

## 13.2 Source identity

Sleep providers are alternative observations of the same night, not additive components.

Logical source families include:

- Apple Watch
- Circular
- Sleep Cycle
- iPhone
- stable unknown fallback when source metadata is genuinely absent

Transport source and logical observing source are separate concepts. `health_auto_export` describes how data entered Health; Apple Watch/Circular/etc. describe who observed it.

Volatile HKDevice pointer/version strings are not logical source identity.

## 13.3 Stage vocabulary

Canonical normalized stage vocabulary:

- `in_bed`
- `awake`
- `asleep_unspecified`
- `core`
- `deep`
- `rem`

Unknown future stages must not silently become sleep.

## 13.4 Episode sessionization

Intervals are processed within one logical source.

`SLEEP_SESSION_GAP_MINUTES = 90`

Intervals separated by no more than 90 minutes can belong to the same episode; larger gaps begin another episode.

Overlapping intervals use interval-union math rather than naive duration summation.

## 13.5 Night assignment

`sleep_date` is the America/Phoenix local calendar date on which the selected episode **ends**.

A sleep episode from late Sep 21 into the morning of Sep 22 belongs to `2026-09-22`.

## 13.6 Completeness classification

`MIN_ANALYSIS_SLEEP_MINUTES = 240`

This is a **data-completeness threshold**, not a health recommendation.

- `analysis_eligible`: total actual sleep >= 240 minutes
- `partial_observation`: actual sleep >0 but <240 minutes
- `in_bed_only`: no actual sleep but valid in-bed evidence

Partial observations are preserved but excluded from nightly sleep averages/trends.

## 13.7 Source arbitration

Selection order:

1. analysis-eligible actual-sleep candidates;
2. partial actual-sleep candidates;
3. in-bed-only candidates.

Among eligible candidates, source priority is:

1. Apple Watch
2. Circular
3. Sleep Cycle
4. iPhone

Then a narrow completeness override applies when a preferred eligible source appears materially truncated:

- chosen duration < 60% of the longest eligible alternative;
- AND the alternative is >90 minutes longer.

When triggered, the longer eligible alternative is selected with `selection_reason = completeness_override`.

If no eligible source exists, select the longest partial observation for evidence; it remains excluded from analytics.

Providers are never stage-spliced into one synthetic night.

## 13.8 Stage eligibility

Specific stage coverage is:

`union(core + deep + rem) / totalSleep`

`MIN_STAGE_COVERAGE_PCT = 90`

A night is stage-analysis-eligible only when:

- the night is analysis-eligible;
- stage coverage >=90%;
- exclusive-stage conflict minutes = 0.

Stage minutes may still be stored below the threshold, but the UI must not present misleading stage percentages/trends.

## 13.9 Canonical nightly table

`sleep_nightly_summaries` stores one finalized row per `(sleep_date, timezone)`

Current nightly calculation version: `sleep-night-v1`.

It with fields conceptually including:

- selected logical source;
- start/end;
- total sleep;
- time in bed where actually observed;
- awake where actually observed;
- core/deep/rem/unspecified minutes;
- stage coverage/conflict;
- observation status;
- analysis eligibility;
- stage-analysis eligibility;
- selection reason;
- calculation version;
- bounded selection evidence.

Raw intervals remain the underlying evidence.

## 13.10 Ongoing HAE sleep ingestion

A separate HAE Sleep automation sends:

- Sleep Analysis only;
- JSON v2;
- Previous 7 Days for ongoing operation;
- summarization OFF;
- individual intervals.

The same exact segment is idempotent, including when the same underlying observation was already imported from XML. Same timestamp/stage from different logical sources remains distinct.

Only HAE-owned rows in the rolling export window are eligible for HAE reconciliation/removal. Historical XML evidence is never deleted because a later HAE payload omits it.

After raw ingestion, the existing shared nightly materializer recomputes canonical nights. HTTP success occurs only after both raw persistence and nightly materialization succeed.

---

# 14. Apple activity workouts

Historical Apple workouts live separately from canonical Training.

They provide Activity context such as:

- walking;
- running;
- hiking;
- yoga;
- Apple-recorded strength workouts;
- other HealthKit workout categories.

Invariant:

> An Apple workout is never converted into canonical Training sets, volume, exercise performance, or PRs.

They can appear in Timeline under the Activity filter with their actual timestamps/durations.

---

# 15. Cross-domain intelligence

## 15.1 Purpose

The deterministic intelligence engine asks:

> **What patterns coexist in the canonical data?**

It does not claim causality and does not generate a health/readiness score.

## 15.2 Allowed relationships

The engine evaluates only an explicit allowlist rather than a giant correlation matrix.

Current relationships include:

- Sleep duration ↔ Activity metrics (steps, active energy, exercise, RHR)
- Sleep ↔ canonical Training dates / observed effort or pain where available
- Nutrition on Training days vs other logged Nutrition days
- Nutrition ↔ Activity (selected pairs such as calories/protein vs steps/active energy)
- Body ↔ preceding 14-day Nutrition window, conservatively gated
- steps on Training days vs non-Training completed Activity days

Sleep stages are not used for cross-domain intelligence in v1.

## 15.3 Spearman semantics

Continuous paired relationships use Spearman rank correlation with correct tie handling.

Minimum paired observations for a surfaced correlation:

`n >= 20`

Product heuristic for absolute rho:

- `<0.20`: do not surface
- `0.20–0.39`: weak
- `0.40–0.59`: moderate
- `>=0.60`: strong

These are product surfacing heuristics, not claims of medical/statistical significance.

The engine does not perform p-value theater on a single-person observational dataset.

## 15.4 Missingness gates

- current provisional Activity day excluded;
- unlogged Nutrition days excluded, never zero-filled;
- partial Sleep excluded;
- Apple activity workouts do not become Training dates;
- sparse Body data is not daily-forward-filled.

## 15.5 Current real-data state

As of the manual timestamp, the real production dataset correctly surfaces **zero cross-domain findings**. This is an accepted result, not a defect.

Phase 11B presentation/Gemini explanation is intentionally deferred until actual deterministic findings exist.

---

# 16. Today command center

## 16.1 Route and API

Root route:

`/`

Owner-only API:

`GET /api/today`

The page loads one coherent America/Phoenix current-date payload rather than making independent browser calls for every domain.

## 16.2 Product purpose

Today answers:

1. What is happening today?
2. What is currently known?
3. What can I do next?

It is not a miniature version of every Progress chart.

## 16.3 Section semantics

Current presentation hierarchy:

- desktop primary row: Nutrition + Training;
- desktop secondary row: Activity + Sleep + Body;
- What Changed below those cards;
- Needs Attention and Patterns appear only when real state requires them;
- mobile collapses to a single vertical stack while preserving the same semantic order.

Cards size to their content instead of forcing empty equal-height panels. Primary transactional actions (`Add food`, `Log workout`, `Add measurement`) are visually treated as actions, while domain navigation links remain secondary.

### Activity

Shows current provisional values such as steps `so far` and clearly marks the day in progress. Step count is the strong primary fact; active energy and exercise minutes are current provisional values. Resting heart rate is displayed as the available daily observation and is **not** labeled `so far` because it is not cumulative.

When `activity_daily_summaries.updated_at` is available, Today may show `In progress · synced <time>` using America/Phoenix formatting. This is the canonical Activity-row update time, not the browser fetch time. If no trustworthy update timestamp exists, the sync clock is omitted rather than invented.

### Nutrition

Shows today's logged totals/targets/remaining or over. No logged food means `No food logged yet`, not zero intake.

### Training

Only a canonical Training workout counts. Apple activity workouts do not satisfy Training status.

### Sleep

If a complete night ending today exists, show it. A partial is explicitly labeled partial. If no current sleep observation exists, the page may show the latest complete night only as clearly historical context; it must never be called last night's sleep.

### Body

Shows latest measurement and age/staleness. It does not imply an old measurement is today's weight.

### Needs attention

Shows recoverable/pending review work only, such as a ready Nutrition capture or workout transcription review.

### Patterns

Only appears if the deterministic intelligence engine actually surfaces findings. With zero findings, the section is omitted rather than filled with AI commentary.

### What changed

May show meaningful deterministic Progress facts already computed elsewhere. It does not invent a generic narrative. Machine-oriented dates/precision are reformatted into concise human evidence such as `6,285/day · Sep 15–21 vs 5,298/day · Sep 8–14`; the underlying deterministic calculation does not change.

## 16.4 No AI dependency

Today has no Gemini narrative dependency. It remains useful when external AI providers are unavailable.

## 16.5 Presentation policy: dates, units, and theme

These are presentation contracts, not canonical-storage changes.

### Human-readable calendar dates

User-facing calendar dates are formatted from the `YYYY-MM-DD` date parts directly rather than passing date-only values through `new Date("YYYY-MM-DD")`, avoiding UTC/local-day shifts. Examples:

- `2026-09-22` → `Sep 22, 2026` where a full date is useful;
- Today header → `Tuesday, Sep 22`;
- same-month range → `Sep 15–21`;
- cross-month → `Aug 29–Sep 4`;
- cross-year → `Dec 29, 2025–Jan 4, 2026`.

Machine interfaces remain ISO: API payloads, URL date query parameters, database DATE values, backups, and logs are not reformatted.

### Body-mass display

Canonical normalized body storage remains kilograms. Owner-facing body mass is formatted through the shared `formatBodyMass` presentation helper and displayed in pounds, normally to one decimal place. Example: `86.6 kg` → `190.9 lb`. Today, Body, Progress, Compare, Timeline, and other bodyweight labels reuse the same formatter rather than reimplementing conversion. Fit Profile import/storage semantics remain unchanged.

### Persistent appearance theme

The app supports light and dark modes across sign-in, owner routes, Settings, and `/demo`. Explicit preference is stored locally as `health-theme = light | dark`; without a stored choice, the app follows `prefers-color-scheme`. A minimal pre-React bootstrap applies the theme before first paint to avoid a light-to-dark flash. Theme is a local presentation preference, not Health data and not a database setting.

The dark theme uses neutral backgrounds/surfaces, readable chart/progress colors, visible focus states, and dark safe-area coverage without changing health-domain meaning.

---

# 17. API and integration boundaries

## 17.1 Conceptual API domains

Even though one physical Vercel function dispatches requests, APIs remain conceptually separated:

- auth
- Nutrition
- Training
- Body
- Progress
- Today
- Apple Health ingestion
- capture/review jobs
- Settings/status

## 17.2 Important machine/provider routes

### Apple Health ingestion

`POST /api/ingest/apple-health`

- write-token authorization
- supports both daily Activity summary and unaggregated Sleep Analysis parse paths
- Activity and Sleep logic remain explicitly separate

### Home-AI workout jobs

- `POST /api/workouts/v1.3/jobs`
- `GET /api/workouts/v1.3/jobs/:id`

### Nutrition Home-AI fallback

Protected local fallback routes remain available for Nutrition meal/label interpretation where implemented, but they are not the default interactive path.

## 17.3 Transaction rule

An endpoint must not return successful acceptance before the persistence work that defines success has committed.

Examples:

- HAE sleep HTTP 200 requires raw interval persistence and nightly materialization;
- canonical Nutrition commit occurs after review;
- capture job completion must not imply canonical food/workout creation until that commit actually occurs.

---

# 18. Durable job architecture

## 18.1 Why jobs exist

Long-running or cross-device AI capture cannot be treated as a transient browser request.

Health therefore persists job state for:

- workout transcription;
- Nutrition capture/review.

## 18.2 General job states

Conceptually:

- pending
- processing
- completed / review-ready
- failed / retryable
- committed where applicable

Stale processing work can be reclaimed according to domain-specific lease semantics.

## 18.3 Job invariants

- refresh/navigation must not lose recoverable work;
- retry must not duplicate canonical entities;
- cross-device review should be possible;
- provider failures remain attached to the durable job;
- source photo/context survives long enough to complete review according to retention policy;
- canonical commit is idempotent.

---

# 19. UI, loading, mobile, and resilience conventions

## 19.1 Mobile bottom navigation and safe area

The five-item bottom nav is fixed on mobile.

Interactive Save/Continue actions must never be hidden behind:

- bottom nav;
- iPhone safe area;
- browser toolbar;
- software keyboard.

Shared shell/action-region spacing is preferred over page-specific magic padding.

## 19.2 Keyboard behavior

Viewport uses:

`interactive-widget=resizes-content`

Inputs likely to trigger Safari focus zoom remain at least 16px. Browser pinch zoom is not disabled.

Dialogs/sheets move focus to the dialog container rather than immediately focusing a text field and popping the keyboard.

## 19.3 Atomic loading

When date/range/metric selection changes, preserve the old coherent payload until the new key+payload is ready, then commit them together.

Superseded requests must not overwrite newer results.

## 19.4 Refresh failure

On Today, Activity, Sleep, Progress, Timeline, and workout views:

- first-load failure shows an error rather than fake zeroes;
- refresh failure with a previous valid payload keeps that payload visible and offers Retry.

## 19.5 Chart semantics

Charts must tolerate:

- no data;
- one point;
- sparse gaps;
- explicit zero;
- partial Sleep;
- provisional current-day Activity;
- large ranges.

Axes ignore non-finite values. Missing data must not be visually interpolated as if observed.

Activity's current day and Sleep partial observations are represented distinctly from complete historical values.

## 19.6 PWA status

There is currently **no manifest and no service worker**. A full offline PWA is intentionally deferred.

Therefore a full browser refresh while offline is not a supported acceptance expectation. Degraded-network testing should use the already-loaded app and trigger an in-app refresh; the last coherent payload should remain visible with Retry.

## 19.7 Bundle/performance state after Phase 13A

Lazy loading materially reduced first-load bundle size.

Dated Phase 13A result:

- first load: ~801.56 kB / 225.86 kB gzip
- Progress chunk: ~490.79 kB / 135.05 kB gzip on open
- barcode scanner: ~458.22 kB / 118.90 kB gzip on open
- Nutrition: ~101.55 kB / 23.46 kB gzip
- Training: ~30.38 kB / 8.55 kB gzip

The remaining entry chunk warning is accepted for v1 unless a measured problem justifies further splitting.

---

## 19.8 Public demo architecture

The public portfolio demo is available under the dedicated `/demo` namespace. It is an anonymous, read-only presentation of the Health product using **deterministic compiled fictional data**, not a privileged view of owner data.

### Isolation model

The demo data source lives under `src/demo/` and does not import:

- the database layer;
- owner repositories;
- `healthFetch`;
- owner Health APIs;
- Gemini, Home-AI, Open Food Facts, or USDA provider calls.

There is no `/api/demo` data service in v1. Ordinary demo browsing is served from compiled fixture data. If a demo fixture is absent, the demo renders an empty state; it never falls through to owner data.

The shell may make the normal `/api/auth/get-session` probe so it can distinguish a signed-in owner from an anonymous visitor. This probe is authentication state only and is not a health-data read.

### Demo routing

Primary routes are namespaced beneath `/demo`, including:

- `/demo`
- `/demo/nutrition`
- `/demo/training`
- `/demo/body`
- `/demo/progress`
- `/demo/progress/strength`
- `/demo/progress/body`
- `/demo/progress/activity`
- `/demo/progress/sleep`
- `/demo/progress/timeline`
- `/demo/progress/compare`

Normal demo navigation remains inside this namespace so an anonymous visitor is not accidentally dropped into owner-only routes. The signed-out lock screen keeps **Owner Sign In** as the primary action and exposes **Explore demo** as the secondary portfolio path.

### Deterministic synthetic dataset

Current fixture contract:

- `DEMO_DATA_VERSION = "1.0"`
- `DEMO_AS_OF = 2026-09-15`
- fixture history begins 2026-01-06

The fixed as-of date is intentional. Demo screenshots and behavior remain reproducible instead of becoming stale as the real calendar advances. The data is fictional and must not copy production UUIDs, real source-device identifiers, actual meals, exact owner measurements, or production provenance blobs.

Current accepted fixture counts:

- 109 canonical workouts / 1,310 sets
- 18 weight observations / 4 body-fat observations
- 216 logged Nutrition days / 1,551 Nutrition entries
- 251 Activity days / 8 synthetic walks
- 249 Sleep nights
- 2 checkpoints

The synthetic dataset intentionally exercises missingness and edge cases: unlogged Nutrition days remain unlogged, demo-day Activity is provisional, Sleep includes complete nights, partial observations, a low-stage-coverage example, and missing nights.

### Reuse of real deterministic logic

The demo reuses the production presentation and deterministic analytics wherever safe. Synthetic canonical observations flow through the same Progress, Compare, Since Checkpoint, Strength, Activity, Sleep, Timeline, and cross-domain intelligence logic.

This creates an additional integration surface: demo findings must satisfy the real sample-size and association gates. Findings are never injected directly merely to make the portfolio look interesting.

### Read-only product contract

Anonymous demo visitors cannot mutate canonical data or invoke paid/private providers. Mutating owner actions are hidden or replaced with prepared, deterministic examples. In particular, the demo cannot:

- add food;
- log a workout;
- add/import Body measurements;
- upload photos or labels;
- scan a barcode;
- create checkpoints;
- call Gemini;
- call Home-AI;
- invoke Apple Health ingestion;
- access backup export.

Prepared sample capture/review states may demonstrate Meal Photo, Nutrition Label, description, or workout-sheet workflows without making provider requests.

### Security invariant

> **The public demo may reuse Health presentation and analytics code, but it must never read, infer, proxy, or mutate owner Health data.**

Security tests must continue to assert that anonymous demo access does not grant access to private Today, Nutrition, Training, Progress, backup/export, ingestion, or capture endpoints.

### Performance

The demo fixture is lazy-loaded as its own bundle chunk. At Phase 14 acceptance it was approximately 59.5 kB / 17 kB gzip and did not pull the barcode scanner or provider capture code into ordinary demo browsing.

# 20. Backup, export, and recovery

**Status:** Phase 13B is implemented and Phase 15A physically exercised the real production archive against a disposable PostgreSQL 14.13 database. Migration replay, restore, row/value/reference comparison, regenerated-backup verification, and cleanup all passed. The production Neon database was never restored or mutated by the smoke test.

## 20.1 Recovery philosophy

A backup is not trustworthy merely because a ZIP can be created. Health therefore separates four concerns:

1. **authoritative full backup** for disaster recovery;
2. **offline verification** of archive integrity;
3. **safe restore** with dry-run and explicit destructive intent;
4. **owner-facing portable export** for data portability.

The production database is never overwritten as part of backup acceptance.

## 20.2 Authoritative full-backup format

Canonical extension:

`*.health-backup.zip`

Archive structure is versioned and includes machine-readable table data plus integrity metadata. Conceptually:

```text
manifest.json
README.txt
tables/
  <table>.ndjson
```

The manifest records, at minimum:

- backup format/version;
- creation timestamp;
- `America/Phoenix` calendar timezone;
- schema migration level;
- table file names;
- row counts;
- per-table SHA-256;
- safe bounded metadata required for verification/recovery.

NULL, date-only values, timestamp instants, UUIDs, booleans, JSON evidence, and numeric text/precision must survive a round trip without semantic coercion.

## 20.3 Implemented backup inventory

### Must back up

- `data_sources`
- `exercise_definitions`
- `workout_templates`
- `workout_template_exercises`
- `workout_sessions`
- `workout_session_exercises`
- `workout_sets`
- `nutrition_foods`
- `nutrition_entries`
- `nutrition_targets`
- `body_measurement_sessions`
- `body_metrics`
- `progress_checkpoints`
- `activity_samples`
- `activity_workouts`
- `sleep_intervals`

`activity_samples` is intentionally included even though it currently contains zero rows. Canonical compact Activity history is currently represented by daily summaries rather than raw sample retention.

### Derived/materialized state, backed up alongside evidence

- `activity_daily_summaries`
- `sleep_nightly_summaries`

These are reproducible derived/materialized tables, but backing them up improves recovery completeness and makes state comparison easier. They must never be the only copy of the source evidence required to rebuild them.

### Operational provenance included in the full CLI archive

- `import_jobs`
- `source_record_links`
- `workout_transcription_jobs`
- `nutrition_capture_jobs`

Gemini capture image bytes that live in `nutrition_capture_jobs` are included in the full archive. Source photos that exist only on Home-AI disk are not included. There is no separate lease table.

### Schema metadata

`schema_migrations` is represented in the manifest rather than exported as a normal user-data table. The accepted production schema at this revision is `0016_sleep_nightly_summaries.sql`.

### Never exported

- auth users/accounts/sessions;
- verification data;
- password hashes;
- API keys;
- database credentials;
- `APPLE_HEALTH_SYNC_TOKEN` or other machine bearer secrets.

Managed owner authentication is recovered separately from Health-owned data.

## 20.4 Real full-backup acceptance — 2026-09-22

A full archive was created from the real Health database at:

`backups/health-2026-09-22.health-backup.zip`

The `backups/` path is gitignored. Safe acceptance metadata:

- archive size: **5,558,072 bytes**;
- exported tables: **22**;
- total rows: **34,258**;
- verification: **passed**;
- schema: `0016_sleep_nightly_summaries.sql`.

Largest tables at acceptance:

- `source_record_links`: 15,677 rows;
- `sleep_intervals`: 14,707;
- `sleep_nightly_summaries`: 1,621;
- `activity_daily_summaries`: 987;
- `activity_workouts`: 846.

These counts are historical acceptance anchors, not permanent expected production counts.

## 20.5 Verification semantics

`backup:verify` operates without mutating a database. It validates:

- supported archive/manifest format;
- required files;
- SHA-256 checksums;
- declared row counts;
- NDJSON parseability;
- unsupported format versions;
- representative identifier/reference sanity.

Acceptance tests prove that malformed NDJSON, checksum corruption, and unsupported format version `2` fail verification.

## 20.6 Restore policy and safety gates

Default restore behavior is **dry run**.

Canonical commands:

```bash
npm run backup:create -- ./backups/health-2026-09-22.health-backup.zip

npm run backup:verify -- ./backups/health-2026-09-22.health-backup.zip

npm run backup:restore -- ./backups/health-2026-09-22.health-backup.zip

HEALTH_BACKUP_RESTORE=yes npm run backup:restore -- ./backups/health-2026-09-22.health-backup.zip --apply
```

Actual writes require **both**:

- `--apply`;
- `HEALTH_BACKUP_RESTORE=yes`.

Restore additionally requires:

- destination schema migration level matches the archive;
- user/canonical destination tables are empty.

If conflicting canonical rows already exist, restore stops. v1 does not implement merge restore or silent overwrite.

Seed source/exercise/template rows may be replaced during an empty-database recovery so original IDs survive. Canonical UUIDs are preserved rather than regenerated.

A dry run against the live production database detected non-empty user tables, emitted no restore statements for conflicting data, and wrote nothing.

## 20.7 Round-trip validation status

Automated round-trip tests exercise:

```text
source data
→ archive creation
→ archive verification
→ empty-destination restore model
→ identity/type/reference comparison
```

The test process verifies preservation of:

- original IDs;
- NULL values;
- dates;
- timestamps;
- numeric text/precision;
- foreign-key relationships.

A non-empty destination containing Nutrition rows produces no restore statements.

### Phase 15A physical restore acceptance

The remaining Phase 13B limitation was closed during Phase 15A. The real verified `backups/health-2026-09-22.health-backup.zip` archive was restored into an ephemeral PostgreSQL 14.13 database named `health_restore` over a local Unix socket after replaying all 16 migrations. The production Neon database (`neondb` on the configured us-east-1 pooler) and the disposable target were explicitly confirmed to be different.

The restored result matched the archive at 22 tables / 34,258 rows with 0 row-count mismatches, 0 ID mismatches, 0 null mismatches, 0 value mismatches, and 0 invalid foreign keys. Representative domain counts included 86 Body metrics across 3 sessions, 5 Training sessions / 83 sets, 11 Nutrition entries / 1 target, 987 Activity days / 846 Activity workouts, 14,707 Sleep intervals / 1,621 nightly summaries, 15,677 provenance links, and 0 checkpoints, matching the archive.

A second full backup built from the restored rows verified at the same 22-table / 34,258-row logical state. The portable export generated from the restored data also verified. The disposable cluster, logs, and temporary client tools were then deleted; no second persistent database copy remains.

The production-facing Neon HTTP restore CLI was deliberately not pointed at production. Because that client cannot open a local Unix socket, the disposable apply used the same product restore planner against the local PostgreSQL target after a no-write dry-run inspection. This difference is documented; it does not change the proven archive/schema/data round trip.

## 20.8 Owner-facing portable export

Settings exposes:

`Data & Backup → Export my Health data`

The UI explicitly states that the file contains private health information.

The full archive exceeds the deployed web download limit of approximately 3.5 MB, so the browser receives a smaller portability archive rather than the authoritative disaster-recovery archive.

Accepted portable export on 2026-09-22:

- size: **443,022 bytes**;
- tables: **15**;
- rows: **3,824**;
- verification: **passed**.

The portable copy contains canonical NDJSON and useful CSVs for:

- Nutrition;
- Training;
- Body;
- Progress checkpoints;
- daily Activity;
- nightly Sleep summaries;
- Activity workouts.

It intentionally omits large/internal recovery-only data such as:

- raw `sleep_intervals`;
- provenance/link tables;
- capture-job history.

The CLI archive remains the authoritative full recovery artifact.

## 20.9 Export security

Web export uses normal owner authorization:

- anonymous → rejected;
- authenticated non-owner → rejected;
- Apple Health machine-ingest token → **no read/export capability**.

No secret or managed-auth material is placed in either export format.

## 20.10 Operational documentation

Repository recovery documentation lives at:

`docs/BACKUP.md`

It documents create, verify, dry-run restore, explicit apply restore, and the separation between Health data recovery and owner-auth recovery.

## 20.11 Release acceptance status

Disaster-recovery smoke testing is now fully exercised for v1 at the database/archive level. The real archive was verified, migrations were replayed from zero, the archive was physically restored to a disposable PostgreSQL target, restored state was compared to the manifest/source expectations, a second backup verified, and the disposable database was removed.

The production database must still never be used merely to prove the restore path. Owner authentication recovery remains separate from Health-owned data recovery.

---

# 21. Historical implementation path and current status

This section documents how the retained system was built. It is chronology, not a source of superseded semantics.

## Phase 0 — Architecture and shell

Established:

- product boundaries;
- single-owner scope;
- Vercel/Neon/Home-AI topology;
- five primary UI areas;
- raw → canonical → derived model;
- provenance and idempotency principles;
- decision to keep basic Health independent from the home server.

## Phase 1 — Data foundation

Established:

- one intentional Postgres access strategy;
- repository migrations;
- shared provenance/import infrastructure;
- canonical timezone/unit conventions;
- validation patterns;
- owner auth/security boundary.

## Phase 2 — Body vertical slice

Implemented deterministic Fit Profile XLSX import, preview, dedupe, provenance, canonical body metrics, and Body history/trend foundations.

## Phase 3 — Training vertical slice

Implemented canonical Training model, paper-first contracts, workout image transcription pipeline, durable jobs, review/commit, and deterministic performance analytics.

## Nutrition implementation milestone (current execution label: Phase 9)

Implemented:

- canonical Nutrition migration;
- daily logging UX;
- barcode/Open Food Facts;
- Nutrition label capture;
- Gemini provider architecture;
- Meal Photo v2 reviewed estimate;
- Food Description v2 reviewed estimate;
- Progress Nutrition integration.

Nutrition is frozen for v1 except actual bug fixes.

## Apple Health / Activity / Sleep milestone (Phase 10)

Implemented:

- Apple XML historical evidence import;
- compact HAE daily Activity canonical summaries;
- current-day provisional semantics;
- historical Apple workouts;
- sleep interval candidate engine;
- frozen source arbitration/completeness policy;
- `sleep_nightly_summaries` materialization;
- ongoing HAE unaggregated sleep ingestion;
- Activity/Sleep Progress pages;
- Timeline/Compare/Checkpoint integration.

Phase 10 is frozen for v1 except actual bug fixes.

## Phase 11A — Cross-domain evidence engine

Implemented deterministic allowlisted associations, coverage/sample gates, Spearman logic, and non-causal evidence structures.

Current real data surfaces zero findings. Phase 11B AI/presentation is deferred until meaningful evidence exists.

## Phase 12 — Today command center

Implemented root Today view with one coherent owner-only payload aggregating current Nutrition, Training, provisional Activity, current/historical Sleep context, Body, pending work, and deterministic changes.

No Gemini narrative is used.

## Phase 13A — Product hardening

Implemented auth-return handling, controlled 404s, coherent refresh failures, request cancellation, mobile keyboard/dialog fixes, chart robustness, sanitized error text, route lazy loading, and manual QA checklists.

## Phase 13B — Backup/export/recovery

Implemented:

- versioned `.health-backup.zip` full archive;
- checksums, row-count verification, NDJSON validation;
- dry-run-first restore with explicit two-part apply guard;
- empty-destination/conflict safety rules;
- owner Settings portable export;
- backup/restore documentation;
- automated round-trip recovery tests.

Phase 15A subsequently closed the remaining physical-restore acceptance item by restoring the real archive into a local disposable PostgreSQL 14.13 database, verifying logical equality, creating/verifying a second archive, and deleting the disposable cluster. Production was not used as a restore target.

## Phase 14 — Public portfolio demo

Implemented and accepted for anonymous browsing.

The public demo lives entirely under `/demo` and uses deterministic compiled fictional fixtures from `src/demo/`. The current fixture contract is `DEMO_DATA_VERSION=1.0` with fixed `DEMO_AS_OF=2026-09-15`. No demo data path imports the database, owner repositories, or `healthFetch`, and there is no `/api/demo` fallback.

The demo reuses existing presentation and deterministic analytics for Today, Nutrition, Training, Body, Progress, Strength, Activity, Sleep, Timeline, Compare, checkpoints, and approved cross-domain Patterns. Anonymous writes/uploads/provider calls are disabled.

Phase 14 acceptance passed anonymous navigation, deep-route reload/back/forward, route containment under `/demo`, private-API rejection, and no provider/write activity. A signed-in owner regression pass remains part of Phase 15 release acceptance.

## Phase 15 — v1 release/freeze

**Phase 15A release-candidate verification is complete. Phase 15B owner acceptance/freeze remains.**

Phase 15A proved:

- 16-migration replay from an empty disposable PostgreSQL database;
- physical restore of the real 34,258-row production backup into that disposable database;
- logical data/foreign-key equality and regenerated-backup verification;
- repository secret/privacy scan and auth/demo isolation;
- production build/test/lint release-candidate state.

A subsequent owner QA/polish pass improved Today presentation, persistent dark mode, human-readable dates, pounds display, and Activity freshness without changing ingestion/analytics.

The final Phase 15B-2 acceptance-fix implementation then closed the concrete workflow issues uncovered by owner testing:

- Today **Add food** opens the existing Add Food sheet immediately rather than requiring a second click;
- Today **Log workout** defaults to the paper/photo import route;
- canonical Training workouts can be edited in place and deleted safely;
- reusable-food review can **Save for later** without logging or **Add to <date>** with a consumed snapshot;
- interaction affordances were standardized across clickable controls;
- restrained semantic/accent color and first-load placeholder/fade polish were added without changing canonical semantics;
- `docs/V2-ROADMAP.md` records deferred Recipes/Meals, Body ingestion, Goals/Projections, theme packs, and other post-v1 work.

Remaining final work:

- run the final automated test/lint/build freeze pass;
- confirm no uncommitted release blockers or secret/private artifacts;
- update release/version metadata as appropriate;
- tag/freeze v1.0.0;
- make no further v1 feature changes unless a concrete regression is found.

---

# 22. Current domain status matrix

| Domain / subsystem | Status | Canonical owner | Notes |
|---|---|---|---|
| Auth/owner security | Implemented | Health | 401/403 owner boundary, cookie session |
| Body | Implemented/frozen | Health | Fit Profile + manual metrics, robust trends |
| Training | Implemented / release candidate | Health | Paper-first, Home-AI transcription v1.3.x; canonical workout edit/delete supported |
| Nutrition | Implemented / release candidate | Health | Gemini primary, reviewed estimates, barcode/label/manual; reusable foods can be saved without logging |
| Progress Strength/Body | Implemented | Health | Deterministic analytics |
| Activity | Implemented/frozen | Health | HAE daily summary canonical |
| Sleep | Implemented/frozen | Health | XML/HAE intervals → nightly summaries |
| Apple activity workouts | Implemented | Health Activity context | Never Training canonical |
| Timeline | Implemented | Health Progress | Real chronological events |
| Compare | Implemented | Health Progress | Coverage-aware normalized comparisons |
| Checkpoints | Implemented | Health Progress | Domain-specific interval/baseline semantics |
| Cross-domain intelligence | Implemented engine | Health | Zero surfaced findings currently |
| Today | Implemented | Health | One coherent `/api/today` payload |
| Hardening 13A | Implemented | Health | Mobile/resilience/performance |
| Backup/recovery 13B | Implemented and physically restore-tested | Health | Full archive + verify + safe restore + portable export; real archive restored to disposable PostgreSQL and verified during Phase 15A |
| Public demo | Implemented | Compiled deterministic demo fixtures | `/demo`, fixed synthetic dataset, read-only, no owner-data/API fallback |
| v1 release | Owner acceptance passed / freeze pending | Health | Phase 15A recovery/security verification passed; Phase 15B-2/15B-3 acceptance fixes are owner-tested; final automated freeze/tag remains |

---

# 23. Dated acceptance anchors

These anchors exist to detect accidental semantic drift. They are **historical acceptance facts**, not guaranteed current production counts forever.

## 2026-09-22 — Apple/Activity/Sleep acceptance

- historical Apple export archive SHA-256: `62c1a272b4ee575061f9765d4b7d76c0f3a809378ba38652ff1f3b193d7782d3`
- Apple XML parser acceptance version: `1.1.0`
- historical raw sleep intervals: 14,707 after dedupe/classification
- canonical nightly rows after first frozen backfill: 1,621
- analysis-eligible sleep nights: 371
- partial observations: 83
- in-bed-only: 1,167
- stage-analysis-eligible nights: 168
- historical Apple activity workouts: 846
- activity canonical data present through 2026-09-22
- current-day Activity row treated as provisional and excluded from completed-day aggregates
- walking/running distance remains unsupported canonical v1

## 2026-09-22 — Cross-domain intelligence acceptance

- deterministic engine surfaced 0 findings on 30d, 90d, 6m, 1y, and all-time ranges
- this result was accepted as correct; thresholds must not be weakened merely to populate the UI

## 2026-09-22 — Hardening baseline

- test suite: 471 tests passing at the end of Phase 13A
- lint passed
- production build passed
- first-load bundle reduced to ~225.86 kB gzip

## 2026-09-22 — Backup/recovery baseline

- test suite: 478 tests passing at the end of Phase 13B
- lint passed
- production build passed
- full archive: 5,558,072 bytes, 22 tables, 34,258 rows
- `backup:verify`: passed
- portable owner export: 443,022 bytes, 15 tables, 3,824 rows, verification passed
- live-database restore dry run: safe stop/no writes
- automated round-trip restore semantics: passed in test process
- physical restore into disposable PostgreSQL: completed during Phase 15A; 22 tables / 34,258 rows restored with 0 logical mismatches; regenerated full backup verified; disposable target deleted afterward

Future updates should add new anchors rather than silently replacing these historical ones.

---

## 2026-09-22 — Public demo acceptance

- anonymous demo root: `/demo`
- demo dataset version: `1.0`
- fixed demo as-of date: `2026-09-15`
- compiled fixture range begins `2026-01-06`
- 109 workouts / 1,310 sets
- 18 weight observations / 4 body-fat observations
- 216 logged Nutrition days / 1,551 entries
- 251 Activity days / 8 synthetic walks
- 249 Sleep nights
- 2 checkpoints
- anonymous walkthrough passed Today, Nutrition, Training, Body, Progress, Strength, Activity, Sleep, Timeline, and Compare
- ordinary demo walkthrough made no health API reads; only the auth-session probe was observed
- private owner endpoints remained inaccessible anonymously
- no anonymous write, upload, Gemini, Home-AI, Open Food Facts, or USDA workflow was enabled
- automated suite passed with 488 tests plus lint and production build
- signed-in owner regression remains a Phase 15 manual acceptance item

## 2026-09-22 — Phase 15A release-candidate / Today polish acceptance

- empty PostgreSQL 14.13 migration replay: all 16 migrations passed; 23 base tables including `schema_migrations`, 26 foreign keys, 61 indexes
- real production backup physically restored to disposable `health_restore`; production Neon was not a restore target
- restored archive comparison: 22 tables, 34,258 rows, 0 count/ID/null/value mismatches, 0 invalid foreign keys
- second backup from restored database verified and disposable cluster was removed
- release-candidate automated suite initially 488 tests; after Today/theme/date/unit polish, suite passed **498 tests**, lint, and production build
- Today live HAE manual current-day export demonstrated same-day canonical update from an old 129-step snapshot to **3,688 steps**, **373 active kcal**, **22 exercise min**, and **56 bpm RHR** without ingestion changes
- root cause of stale Today Activity was operational: HAE `Previous 7 Days` excludes the current day; architecture now documents a separate current-day Activity automation plus the completed-day reconciliation automation
- Today presentation now uses content-sized cards, prioritized Nutrition/Training, human-readable deterministic What Changed copy, current Activity sync time when available, owner bodyweight display in pounds, and persistent light/dark theme
- final signed-in iPhone + desktop owner acceptance is still required before tag/freeze


## 2026-09-22 — Phase 15B-2 final acceptance-fix implementation

- Today `Add food` now opens the existing Add Food workflow immediately; `/nutrition?date=…&action=add` can also deep-link into the same sheet.
- Today `Log workout` now targets the paper/photo import path (`/training/import`), while manual template starts remain under Training.
- canonical Training workout detail now supports in-place edit and transactional delete; edits preserve session identity and reuse canonical validation.
- deleting a transcription-created workout detaches the canonical session reference while preventing later recommit of the same committed transcription (`409`).
- reusable Nutrition food reviews now distinguish **Save for later** (catalog only) from **Add to Today/Add to <date>** (catalog + consumed snapshot); Meal Photo v2 and Description v2 remain unchanged.
- app-wide clickable affordances now use consistent pointer/hover/focus/selected behavior on pointer-capable devices.
- restrained accent/success/warning/danger/info tokens were added for Light and Dark without implementing global up=green/down=red semantics.
- Training and Body first-load presentation now uses stable placeholders and a short reduced-motion-aware page-enter fade; refresh continues to preserve coherent prior data.
- `docs/V2-ROADMAP.md` records post-v1 priorities headed by Recipes/Batch Meals, easier Body ingestion/Health Inbox, Goals + deterministic projections, goal-aware explanations, theme packs, and additional ingestion/intelligence improvements.
- schema remains at `0016_sleep_nightly_summaries.sql`; no migration was required.
- automated suite: **508 tests passing across 58 files**; lint passed; production build passed.
- v1 remains untagged until owner manual QA confirms these final workflows.


## 2026-09-22 — Phase 15B-3 final owner acceptance

- Today Nutrition now refreshes the coherent Today payload after a successful consumed-food commit; owner testing confirmed Nutrition totals update without manual refresh.
- **Save for later** remains catalog-only and does not alter Today intake totals.
- Training empty-state wording now distinguishes structured Training from Apple/Activity workouts by saying **No training session logged today**.
- Apple Watch walks/runs/hikes remain Activity context, never canonical Training; ongoing workout-object ingestion/presentation is explicitly deferred to v2.
- Nutrition first-load presentation now matches the stable placeholder/fade treatment used by Training and Body.
- Light/Dark appearance controls retain equal stable width when selected.
- a generic Health heart favicon/web icon was added without introducing a service worker or PWA manifest solely for icon support.
- owner production/manual QA of the final fixes passed on 2026-09-22.
- v1 remains untagged until the final automated freeze pass completes.


## 2026-09-22 — v1.0.0 final freeze acceptance

- owner manual acceptance: **PASSED** across desktop, iPhone, Today/Nutrition/Training/Body/Progress, auth/demo, HAE current-day Activity, and previous-seven-day reconciliation.
- final automated suite: **512 tests passing across 60 files**.
- lint: **PASSED**.
- production build: **PASSED**.
- latest migration: `0016_sleep_nightly_summaries.sql`; ordered migration inventory remains `0001`–`0016` with no gap and no Phase 15B/15C schema change.
- final authoritative backup: `backups/health-2026-09-22-v1.0.0.health-backup.zip`.
- final backup size: **7,201,803 bytes**.
- final backup profile/schema: `full` / `0016_sleep_nightly_summaries.sql`.
- final backup contents: **22 tables / 34,245 rows**.
- final backup verification: **PASSED**.
- final owner portable export: **441,250 bytes**, **15 tables / 3,789 rows**, verification passed, under the 3,500,000-byte web limit.
- final client secret/privacy scan: **PASSED**; configured secret values and connection strings were absent from production `dist/`.
- release version metadata: `1.0.0`.
- release commit: `7124ca513efa6c833457303ee6ff79d78344fce6`.
- annotated local tag: `v1.0.0` (`Daurham Health v1.0.0`) pointing to the same commit.
- working tree: clean on `main`; one local release commit ahead of `origin/main`.
- commit/tag intentionally not pushed; no GitHub release created.
- **FINAL RESULT: V1.0.0 FROZEN = YES.**


# 24. Environment and integration checklist for a rebuild

A clean rebuild of the current architecture requires the following categories of configuration. Exact secret values must never be stored in this manual.

## Health/Vercel

- production domain `health.daurham.com`
- Neon database connection
- owner-auth configuration
- `HEALTH_OWNER_USER_ID`
- canonical timezone configuration / constant (`America/Phoenix`)
- Gemini key + Nutrition model configuration
- HAE write token
- HAE Activity completed-day reconciliation automation (`Previous 7 Days`)
- HAE Activity current-day automation (same supported metrics, current-day range)
- HAE Sleep automation (unaggregated Sleep Analysis intervals)
- USDA key
- Home-AI base URL/key

## Home-AI

- `ai.daurham.com` Cloudflare Tunnel
- Ollama/model installation
- workout transcription v1.3.x route/job system
- durable local job/image storage
- protected Health API key validation

## Health Auto Export

### Activity automation

- REST API to `/api/ingest/apple-health`
- JSON v2
- Previous 7 Days
- summarized daily metrics
- Step Count
- Active Energy
- Apple Exercise Time
- Resting Heart Rate
- distance excluded
- bearer token header

### Sleep automation

- same endpoint/token
- Sleep Analysis only
- JSON v2
- Previous 7 Days
- summarization OFF
- individual intervals

## Cloudflare/Home-AI fallback

Allow only the narrow protected API prefixes required by Health. Do not broadly bypass WAF/security for all of `ai.daurham.com`.

---

# 25. Testing philosophy

## 25.1 Tests protect semantics, not just components

High-value tests assert rules such as:

- blank != zero;
- missing != zero;
- provisional current day excluded from completed-day analytics;
- partial Sleep excluded from nightly averages;
- source providers never spliced into synthetic sleep;
- AI cannot bypass review where review is part of the workflow;
- same import is idempotent;
- Apple workout never becomes Training;
- historical food snapshots do not mutate with catalog edits;
- current range/header and payload commit coherently;
- machine ingestion token cannot gain read privileges.

## 25.2 Real-data acceptance

Where possible, each major pipeline is accepted against real production-like data after unit/integration tests.

Examples:

- Fit Profile real XLSX
- real workout-sheet photos
- legacy Nutrition production migration
- real Apple `export.zip`
- real HAE activity payloads
- real HAE sleep payloads
- real iPhone Nutrition label/photo/description workflows

Do not tune algorithms merely to make one real sample look interesting; real data is for semantic validation, not threshold gaming.

---

# 26. Rules for future AI/developer modifications

A future AI or developer should follow these rules before changing the system:

1. **Read this manual first.**
2. Identify the domain and canonical owner.
3. Determine whether the change affects source, canonical, or derived data.
4. Determine whether historical snapshots must remain unchanged.
5. Determine missing/zero/partial/provisional semantics explicitly.
6. Determine provenance and idempotency behavior.
7. Keep provider output behind an adapter; do not leak provider-specific shapes into canonical domain types.
8. Add deterministic validation before persistence.
9. Add tests for semantic rules before changing persistence behavior.
10. Use versioned migrations for DB changes.
11. Never weaken auth or create test backdoors to make browser automation convenient.
12. Avoid storing large raw images in Neon unless a future requirement explicitly changes the retention policy.
13. Do not add scores, causal claims, or AI narrative merely because data exists.
14. Do not turn missing evidence into zero or a default.
15. After implementation, update this manual with a timestamp and compatibility note.

---

# 27. Rebuild blueprint — end-to-end

A new implementation can reproduce the current system in the following dependency order.

## Foundation

1. React/Vite/TypeScript shell and five primary mobile nav destinations.
2. Neon Postgres connection and versioned migration runner.
3. owner authentication/authorization.
4. shared `data_sources`, `import_jobs`, `source_record_links`.
5. canonical timezone helpers.
6. shared error/loading/request-cancellation patterns.

## Body

7. body measurement/session schema.
8. Fit Profile XLSX deterministic adapter.
9. preview/dedupe/commit.
10. Body views + Theil–Sen trends.

## Training

11. exercise/routine contracts and versioning.
12. workout session/exercise/set schema.
13. deterministic validators.
14. manual/history views.
15. Home-AI v1.3.x transcription jobs.
16. Health durable review/commit.
17. deterministic performance analytics.

## Nutrition

18. food/entry/target schema and legacy migration.
19. daily logger/search/recent/manual/undo.
20. barcode local-first + Open Food Facts review.
21. Gemini provider adapter.
22. Nutrition Label review.
23. Meal Photo reviewed estimate.
24. Food Description reviewed estimate.
25. Nutrition → Progress coverage-aware summaries.

## Progress

26. shared range/asOf infrastructure.
27. strength/body overview/detail.
28. Timeline/Compare/Checkpoints.

## Apple Activity/Sleep

29. Apple XML archive parser for historical sleep/workouts.
30. compact `activity_daily_summaries` HAE canonical pipeline.
31. current-day provisional semantics.
32. sleep interval normalization/sessionization.
33. nightly arbitration and materialization.
34. HAE live sleep interval ingestion.
35. Activity/Sleep Progress and Timeline/Compare/Checkpoint integration.

## Intelligence + Today

36. deterministic allowlisted cross-domain evidence engine.
37. Today one-payload command center.

## Hardening

38. auth-return/404/error sanitization.
39. atomic refresh + abort behavior.
40. mobile safe-area/keyboard/dialog fixes.
41. lazy-load heavy routes/scanner/charts.
42. backup/verify/restore round-trip, including Phase 15A physical disposable-Postgres recovery smoke test.

## Release

43. deterministic compiled anonymous `/demo` boundary with fixed versioned synthetic fixtures and no owner-data fallback.
44. release-candidate migration/security/restore verification.
45. Today presentation/theme/date/unit release polish.
46. final owner-acceptance fixes: direct Today actions, Training edit/delete, reusable-food save-without-log, interaction/color/loading polish.
47. full signed-in mobile/desktop owner acceptance.
48. architecture/manual final update.
49. final tests/lint/build + fresh backup/export/security verification.
50. release commit + local annotated `v1.0.0` tag.
51. v1 freeze.

---

# 28. Current known deferred work

Deferred work is not forgotten work. It is intentionally outside the current v1 core unless a later revision promotes it. The prioritized post-v1 roadmap is also maintained in `docs/V2-ROADMAP.md`.

Highest-priority v2 work:

1. **Recipes / Batch Meals** — first-class named recipes made from reusable foods/ingredients, whole-recipe nutrition, servings/fractions/finished-weight logging, and historical consumed snapshots that remain stable when the recipe later changes.
2. **Body ingestion / Health Inbox** — substantially easier phone-first body-data intake, including quicker manual capture and investigation of share/Shortcut/device-source workflows while retaining the verified XLSX path.
3. **Goals + deterministic projections** — first-class measurable goals with evidence-based trend/projection and uncertainty; optional AI may explain the deterministic result but does not invent the projection.
4. **Goal-aware / cross-domain explanations** — deterministic evidence first, optional Gemini explanation second, no unsupported causality.
5. **Theme packs / personalization** — additional accessible token-based palettes beyond the v1 Light/Dark pair.
6. **Motion / micro-interactions** after core behavior remains stable.
7. **Cross-domain intelligence UI** as real owner data reaches existing evidence gates.
8. **Additional Health sources/metrics**, including ongoing Apple Watch/HealthKit workout-object ingestion for walks/runs/hikes/cycling/etc. under Activity (never Training), justified Apple Health expansion, and possible Oura/Circular evaluation under frozen source-arbitration rules.
9. **Shortcut/share-sheet style ingestion** where platform capabilities allow lower-friction capture.
10. **Richer meal estimation**, potentially including multi-angle images and recipe assistance.

Other known deferred possibilities:

- Phase 11B AI explanation/presentation for cross-domain findings once real findings exist.
- richer meal recommendations based on known foods/remaining macros.
- native HealthKit app only if browser/HAE limitations justify it.
- full offline PWA.
- generalized multi-user architecture.

---

# 29. Revision Ledger

| Timestamp (America/Phoenix) | Manual version | Sections | Change | Data / compatibility impact |
|---|---:|---|---|---|
| 2026-09-22T15:44:00-07:00 | 1.0.0 | All | Created the complete current-state architecture/data-system manual from the retained platform architecture, workout handoff/contracts, and implemented Phase 0–13A state. Recorded Phase 13B as in progress rather than claiming acceptance. | Documentation only. No production data/schema change. Future semantic changes must append a row rather than silently rewriting history. |
| 2026-09-22T15:54:42-07:00 | 1.0.1 | 20, 21, 22, 23, 29 | Recorded implemented Phase 13B backup/export/recovery architecture, real archive and portable-export acceptance metadata, exact restore guards/commands, and the remaining external Postgres restore-smoke limitation. | No canonical Health data/schema change. Documentation now distinguishes automated restore validation from a real second-database restore; Phase 15 must perform that smoke test before declaring disaster recovery fully exercised. |
| 2026-09-22T16:28:30-07:00 | 1.0.2 | 19.8, 21, 22, 23, 27, 29 | Recorded completed Phase 14 public demo architecture: dedicated `/demo` route namespace, fixed versioned synthetic dataset, component/analytics reuse, strict owner-data isolation, read-only/provider-disabled behavior, accepted fixture counts, performance footprint, and anonymous QA/security baseline. | Documentation only. No canonical owner Health data/schema change. Demo fixtures are isolated from production data. Phase 15 must still perform signed-in owner regression and the real disposable-Postgres restore smoke test before v1 freeze. |
| 2026-09-22T17:41:03-07:00 | 1.0.3 | 12.3–12.4, 16, 20, 21–24, 27, 29 | Recorded Phase 15A release-candidate verification and physical disposable-PostgreSQL restore of the real production archive; closed the previous restore-smoke limitation. Recorded the final Today presentation contract: dual HAE Activity transport roles, live current-day update proof, canonical sync freshness display, content-sized command-center hierarchy, human-readable date-only formatting, owner-facing body mass in pounds, and persistent light/dark theme. | No canonical schema/analytics change. Activity ingestion code remained unchanged; the stale Today value was traced to HAE `Previous 7 Days` excluding the current day. Canonical body storage remains kg and date/API storage remains ISO. Signed-in owner acceptance and final v1 tag/freeze remain outstanding. |

| 2026-09-22T20:11:37-07:00 | 1.0.4 | 9.7, 10.11, 21–23, 27–29 | Recorded the final Phase 15B-2 owner-acceptance fixes: direct Today Add Food / photo-workout entry, canonical Training edit/delete with transcription recommit protection, reusable-food Save for later vs Add to date semantics, standardized interaction affordances, restrained semantic color, low-risk loading polish, and the prioritized v2 roadmap. | No schema migration or canonical analytics change. Training mutations preserve existing session identity/validation; deleting transcription-created workouts preserves recommit protection. Nutrition historical snapshots remain immutable. Final signed-in owner QA and v1 tag/freeze remain. |
| 2026-09-22T20:50:00-07:00 | 1.0.5 | 21–24, 28–29 | Recorded Phase 15B-3 final owner acceptance: reactive Today Nutrition after consumed-food commit, clarified Training-vs-Activity wording, Nutrition loading parity, fixed Light/Dark selector layout, generic Health favicon, and explicit v2 Apple Watch workout-object ingestion under Activity. | No schema, ingestion, or analytics change. Apple/HealthKit workouts remain outside canonical Training. Owner manual QA passed; only final automated freeze/tag remains. |

| 2026-09-22T21:02:16-07:00 | 1.0.6 | 21–24, 27, 29 | Recorded final Phase 15C release verification and v1.0.0 freeze: owner acceptance passed; 512 tests/lint/build passed; final 22-table/34,245-row production backup and 15-table/3,789-row portable export verified; final client secret scan passed; version set to 1.0.0; release commit `7124ca513efa6c833457303ee6ff79d78344fce6` tagged locally as annotated `v1.0.0`. | Documentation/release-state change only; no schema, ingestion, or analytics change. v1 is frozen. Commit/tag remain local and unpushed. |
---

# 30. Final system invariant

The Health Platform should always remain explainable in terms of ownership and evidence:

```text
SOURCE OBSERVATION / USER INPUT
        ↓
PROVENANCE + NORMALIZATION
        ↓
CANONICAL HEALTH RECORD
        ↓
DETERMINISTIC DERIVATION
        ↓
USER-FACING ANALYTICS / TODAY
```

AI can assist at the interpretation boundary, but it does not erase the distinction between evidence, canonical records, and derived conclusions.

That separation is what allows the platform to remain rebuildable, auditable, and trustworthy as providers, algorithms, devices, and UI evolve.
