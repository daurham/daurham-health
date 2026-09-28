# Daurham Health Platform — Complete Architecture & Data Systems Design Manual

**Canonical document:** `HEALTH-PLATFORM-DESIGN-MANUAL.md`  
**Manual version:** 1.0.40  
**System:** `health.daurham.com`  
**Status:** **v1.0.0 frozen.** Owner acceptance passed; final automated release verification passed; a fresh production backup was created and verified; package metadata remains 1.0.0; release commit `7124ca513efa6c833457303ee6ff79d78344fce6` is tagged locally with annotated tag `v1.0.0`. The tag/commit have not been pushed. Backup/export/recovery was previously physically exercised against a disposable PostgreSQL restore target during Phase 15A. **Post-v1 extensions:** V2-A1 Supplements (`0017_supplements.sql`, section 31), V2-A2 Body measurement capture (`0018_body_measurement_cadence.sql`, section 32), V2-A3 ad-hoc Training (`0019_training_session_types.sql`, section 33), V2-A4 Daily Context (`0020_daily_context.sql`, section 34), V2-B1 Personal Lab (`0021_personal_lab_protocols.sql`, section 35), V2-B2 Benchmark Results (`0022_benchmark_results.sql`, section 36), V2-B3 Retest Scheduling (derived, no new migration, section 37), V2-B4 Experiment Result Summaries (`0023_experiment_results.sql`, section 38), V2-C1 First-Class Recipes (`0024_recipes.sql`, section 39), V2-C2 Recipe version editing (same schema, section 40), V2-C3 Recipe consumption logging (`0025_recipe_consumption.sql`, section 41), V2-C4 in-builder ingredient creation (`0026_nutrition_food_usda_source.sql`, section 42), V2-D1 First-Class Goals (`0028_goals.sql`, section 43), V2-D2 Deterministic Goal Projections (derived, section 44), and V2-D3 Goal-Aware Status and Reminders (derived, section 45). V2-A Data Capture Foundations is complete. V2-B Personal Lab Core is complete. V2-C1 adds immutable recipe versions composed from reusable foods. V2-C2 edits the current formulation by creating the next immutable version. V2-C3 logs a portion of an exact Recipe Version as one ordinary nutrition entry. V2-C4 creates a missing ingredient from My Foods, USDA, a barcode, a nutrition label, a manual food, or one AI-assisted description without leaving the recipe draft. V2-C Recipes / Batch Meals is complete. USDA identity for a reusable food is a `source_record_links` row, and a text estimate uses `description_ai` (`0027_nutrition_food_ai_source.sql`). The portable owner export copies that USDA identity as a provider key, FDC id, and serving fingerprint, without the database source id. V2-D1 stores a Goal as a stable selector and lifecycle, with each target change kept as the next immutable version. V2-D2 derives a projection for active body and strength goals from the observed Theil–Sen trend. It does not persist that projection or let AI choose the date. V2-D3 derives target state, deadline state, and low-noise in-app attention from the current goal, current evidence, and that projection. It does not store status, complete a goal, or coach the owner. V2-D Goals + Projections is complete. V2-E1 adds a read-only detail view for one canonical Sleep night (section 46). V2-E2 derives stage composition from those canonical nights (section 47). V2-E3 stores timestamped overnight vital samples on `0029_sleep_vital_samples.sql` (section 48). No candidate metric is enabled, because no inbound payload verified its name, unit, timestamp, and source. V2-E4 derives a personal Sleep-duration baseline from prior same-source nights (section 49). It is a recent median, not a sleep score. V2-E5 explains stored Sleep source selection and continuity (section 50). V2-E Rich Sleep + Overnight Vitals is complete. V2-F1 Ask Health explains a bounded evidence packet (section 51). Its monthly budget is database-backed. It does not query the database for evidence, write canonical records, or retrieve literature. V2-F2 Proactive Insights are derived on read (section 52). V2-F3 Weekly Coach Brief is implemented (section 53). V2-F4 Experiment Suggestions are implemented (section 54). Goal-observation suggestions are deferred (section 55). V2-F5 Literature-Backed Evidence Drawer is implemented (section 56). V2-F Ask Health + Proactive Intelligence is complete. V2-B1 records experiment and benchmark protocol identity. V2-B2 stores deterministic benchmark results linked to canonical evidence. V2-B3 derives retest guidance from the current protocol version and the latest valid result. V2-B4 records a deterministic experiment result under the frozen protocol. These extensions do not rewrite frozen v1 semantics. V2-G2 stages an iPhone Shortcut Body capture in `body_capture_inbox` (`0032_body_capture_inbox.sql`). That intake does not write a measurement. Owner review saves one ordinary manual Body session. An untouched review keeps the staged capture instant. Only an explicit time edit replaces it, and that edit keeps the entered seconds. V2-G3 adds browser-local Appearance: System, Light, or Dark, plus palettes Classic, Forest, Ocean, Sunset, and Plum. Palettes change accent chrome. Danger, warning, and success stay semantic. Those preferences are not stored in PostgreSQL, backup, or portable export.  
**Canonical calendar timezone:** `America/Phoenix`  
**Created / last updated:** `2026-09-27T18:12:06-07:00`  
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

Health Auto Export workout objects use a narrower rule. The same provider workout id is an exact duplicate and matches the existing `activity_workouts` row. A different source matches only when the start instant, the end instant, and the activity identity are the same after formatting normalization, such as `HKWorkoutActivityTypeRunning` and `Running`. Overlap alone does not match. More than one candidate fails closed for that workout. A repeated id whose start, end, or activity identity disagrees with the linked row fails closed and does not move or rename history. Optional fields such as energy and distance do not create a second workout. Omitting a workout from a later rolling payload does not delete it. There is no general correction lifecycle for these rows.

## 5.4 Historical snapshot invariant

Historical facts remain historical.

Examples:

- a consumed Nutrition entry keeps the nutrition values that were accepted at logging time;
- a Recipe Version keeps the food name, serving basis, and nutrition values snapshotted when that version was created;
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
- `0016`: canonical nightly sleep summaries (`0016_sleep_nightly_summaries.sql`)
- `0017`: post-v1 V2-A1 Supplements (`0017_supplements.sql`)
- `0018`: post-v1 V2-A2 Body cadence and measurement correction timestamps (`0018_body_measurement_cadence.sql`)
- `0019`: post-v1 V2-A3 Training session type and optional session name (`0019_training_session_types.sql`)
- `0020`: post-v1 V2-A4 Daily Context (`0020_daily_context.sql`)
- `0021`: post-v1 V2-B1 Personal Lab protocols (`0021_personal_lab_protocols.sql`)
- `0022`: post-v1 V2-B2 Benchmark Results (`0022_benchmark_results.sql`)
- `0023`: post-v1 V2-B4 Experiment Result Summaries (`0023_experiment_results.sql`)
- `0024`: post-v1 V2-C1 First-Class Recipes (`0024_recipes.sql`)
- `0025`: post-v1 V2-C3 Recipe consumption logging (`0025_recipe_consumption.sql`)
- `0026`: post-v1 V2-C4 USDA reusable-food source (`0026_nutrition_food_usda_source.sql`)
- `0027`: post-v1 V2-C4 USDA source links and text-AI food source (`0027_nutrition_food_ai_source.sql`)
- `0028`: post-v1 V2-D1 First-Class Goals (`0028_goals.sql`)
- `0029`: post-v1 V2-E3 overnight vital samples (`0029_sleep_vital_samples.sql`)
- `0030`: post-v1 V2-F1 provider cost ledger (`0030_ai_usage.sql`)
- `0031`: post-v1 V2-F4 experiment origin (`0031_experiment_origins.sql`)
- `0032`: post-v1 V2-G2 Body capture inbox (`0032_body_capture_inbox.sql`)

Current schema head: `0032_body_capture_inbox.sql`. Exact filenames must still be read from `migrations/` before adding another migration.

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

Post-v1 V2-A2 adds manual quick entry for a controlled metric set, canonical circumference storage in centimeters, and opt-in per-metric cadence. It does not change the Theil–Sen trend rules above. See section 32. Fit Profile import remains the deterministic XLSX path in section 8.2.

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

Ad-hoc Training, added in section 33, is a second way to record canonical sets. It does not replace this paper-first programmed workflow.

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

Nutrition keeps **food definitions**, **recipe preparations**, and **consumed snapshots** separate.

`nutrition_foods` is a reusable food or product. `recipes` is a reusable preparation. `nutrition_entries` is what was actually consumed on a date. A recipe is not a food row, and creating a recipe does not log intake. `nutrition_foods.catalog_kind = 'recipe'` remains the older quick-add catalog kind. It is not the recipe model in section 39.

Editing a reusable food later does not rewrite historical intake or an existing Recipe Version.

Canonical concepts include:

- `nutrition_foods`
- `nutrition_entries`
- `nutrition_targets`
- `recipes`
- `recipe_versions`
- `recipe_version_ingredients`
- durable capture jobs
- optional meal grouping where a workflow genuinely needs grouped component entries

A logged day exists only when at least one Nutrition entry exists. An unlogged day is unknown intake, not zero intake.

## 10.2 Legacy migration result

Legacy NutriTrack data was migrated into Health with preserved historical semantics and provenance. Technical duplicate history identified during migration was not duplicated into canonical Health.

The migration verified existing live production data rather than assuming repository DDL exactly matched production.

## 10.3 Daily Nutrition UX

Primary route:

`/nutrition?date=YYYY-MM-DD`

Recipe management is secondary to daily logging:

- `/nutrition/recipes`
- `/nutrition/recipes/new`
- `/nutrition/recipes/:id`
- `/nutrition/recipes/:id/edit`
- `/nutrition/recipes/:id/versions/:version`

Recipes are not a primary navigation item. The edit route loads the current version. A historical version page reads that version's snapshots. `/demo` has no recipe route.

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
- `/progress/sleep/:sleepDate`
- `/progress/timeline`
- `/progress/compare`

The private Progress overview links to `/lab`. That is not a sixth primary destination. `/demo/progress` does not link to the private lab.

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
- complete and partial Sleep observations;
- owner-recorded Daily context annotations;
- valid Benchmark Result annotations;
- valid Experiment Result annotations.

Date-only source facts remain date-only. The application does not invent timestamps. Daily context is date precision only. `created_at` and `updated_at` are record-management times and are not used as an occurrence time. On a shared calendar day, a context annotation is ordered before the day's other events so it can be read with them. Context is not a plotted series. See section 34.

Apple activity workouts never become Training sessions or PR sources. A Health Auto Export workout that matches a historical archive workout remains one Timeline event because the event id is the canonical `activity_workouts` id.

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

Ongoing Health Auto Export workout objects also write `activity_workouts`. They do not create a second workout table, and they do not change the daily Activity summary. Workout energy is not added to active energy. Workout duration is not added to exercise minutes. The stored activity type is the provider's workout name. `source_name`, `source_version`, and `device_name` stay empty. The Health Auto Export transport is provenance, not an observing source. Route geometry and nested workout telemetry are not stored. The calculation version is `hae-workout-v1`.

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

A third automation on the same endpoint sends JSON v2 `data.workouts`. A payload may contain workouts alone, daily metrics alone, or both, including Sleep. Metric parsers run only when `data.metrics` is an array. A workouts array that is present but not an array is invalid. An empty workouts array is valid. The provider workout id is the idempotency key, stored as `health_auto_export|workout|v2|<id>` and as `source_record_links.external_id`. Historical XML rows stay in place. An exact semantic match adds a Health Auto Export provenance link to that existing row. Settings shows the workout sync beside Activity and Sleep. Today can list a few current-day Activity workouts. They remain Activity.

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

A sleep episode from late Sep 21 into the morning of Sep 22 belongs to `2026-09-22`. Night Detail for that date reads the stored nightly summary. See section 46.

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
- Supplements, when at least one supplement definition exists, between that row and the Activity, Sleep, and Body row;
- desktop secondary row: Activity + Sleep + Body;
- optional Daily context after that secondary row and before What Changed;
- optional Personal Lab experiments, only when one is scheduled or active, after Daily context;
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

### Supplements

Post-v1 V2-A1. See section 31. Today includes supplement occurrences inside the same `GET /api/today` payload. The card lists only doses scheduled today under an active lifecycle. `unknown` means not yet recorded. Checkbox sets taken or clears back to unknown. Skip is a separate action. Paused, discontinued, and unscheduled definitions are omitted from the checklist. If no supplement definitions exist, the card is omitted. `/supplements` is reached from the card and from Settings, not from a sixth primary tab.

Post-v1 V2-A2. See section 32. The same Today payload may include one Body measurement reminder when the owner has enabled a cadence. Current measurements produce no reminder. The reminder does not create a measurement.

### Sleep

If a complete night ending today exists, show it. A partial is explicitly labeled partial. If no current sleep observation exists, the page may show the latest complete night only as clearly historical context; it must never be called last night's sleep.

### Body

Shows latest measurement and age/staleness. It does not imply an old measurement is today's weight.

### Needs attention

Shows recoverable/pending review work only, such as a ready Nutrition capture or workout transcription review. A day with no Daily context is not Needs Attention. An existing Experiment is not Needs Attention and does not create a due reminder.

### Daily context

Post-v1 V2-A4. See section 34. The same `GET /api/today` payload includes today's context, or a recorded-false snapshot when none exists. The card is optional. An empty day offers Add context and does not show the tag catalog. A recorded day shows catalog labels, the note, and Edit. There is no streak, score, or reminder. `/context` is an editor route, not a primary tab.

### Personal Lab

Post-v1 V2-B1. See section 35. The same `GET /api/today` payload includes scheduled and active experiments. Accepted, abandoned, and superseded experiments are omitted. The card names the experiment and its date window and links to Personal Lab. It does not say the experiment is due or incomplete. On `window_end` the card can say the experiment ends today. Ready to review, including the Needs Attention item “Experiment ready to review,” begins on the next Health calendar day, when the inclusive window is closed. V2-B3 adds at most one Benchmark retest to the same payload when the current protocol is in `due` state. The copy says retest suggested. It does not say overdue, and the retest is not a Needs Attention item. See sections 37 and 38.

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
- Supplements
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
- `/demo/progress/sleep/:sleepDate`
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
- `recipes`
- `recipe_versions`
- `recipe_version_ingredients`
- `body_measurement_sessions`
- `body_metrics`
- `progress_checkpoints`
- `activity_samples`
- `activity_workouts`
- `sleep_intervals`
- `supplements`
- `goals`
- `goal_versions`
- `supplement_schedules`
- `supplement_status_events`
- `supplement_adherence`
- `body_measurement_cadences`
- `daily_context`
- `daily_context_tags`
- `lab_protocols`
- `lab_protocol_versions`
- `lab_protocol_requirements`
- `lab_protocol_context_controls`
- `benchmark_definitions`
- `experiments`
- `experiment_benchmarks`
- `experiment_supplements`
- `benchmark_results`
- `benchmark_result_values`
- `benchmark_result_evidence`
- `experiment_results`
- `experiment_result_requirements`
- `experiment_result_evidence`

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

`schema_migrations` is represented in the manifest rather than exported as a normal user-data table. The schema head at manual 1.0.33 is `0030_ai_usage.sql`. `sleep_vital_samples` is canonical raw evidence. Restore inserts it after `data_sources` and `import_jobs`. A nightly vital median is not a backup row. A personal baseline median is not a backup row. A source transition is not a backup row. An Ask Health conversation is not a backup row. A proactive insight card is not a backup row. A weekly coach brief is not a backup row. An unaccepted experiment suggestion is not a backup row. Accepted experiment origin fields and `experiment_goals` are canonical backup rows. The schema head at manual 1.0.34 is `0031_experiment_origins.sql`. `ai_usage` is an operational backup row and is not in the portable export. It stores no question, answer, or evidence packet. Portable Sleep nights include the canonical logical source key. Goal status and reminders are derived and have no backup table. Sleep Night Detail is a read of `sleep_nightly_summaries` and has no backup table. Restore inserts `exercise_definitions`, `supplements`, `lab_protocol_requirements`, and `benchmark_definitions` before `goals`, and `goals` before `goal_versions`. A Goal keeps its selector and every target version. Portable export adds `selector_label` and `source_key` for reading outside Health. Those labels are not restored. A recipe may have several versions. Exactly one is current. Restore keeps each version id, integer, snapshot, nutrition, current flag, and archive state. Restore inserts `nutrition_foods` before `recipes`, `recipe_versions`, and `recipe_version_ingredients`, and those versions before `nutrition_entries`. A recipe-derived entry keeps its version id and portion. Older entries keep the recipe columns null. Ingredient `food_id` may be null after a food is removed. The name, serving basis, and nutrition snapshots still restore. Recipe calories and macros keep their numeric precision, including null macros. V2-B3 retest state is derived from protocol versions and benchmark results, so it has no backup table. Experiment results are stored and restored as written. Restore does not recalculate them. `lab_protocol_requirements.criteria` travels with the requirement row. The v1.0.0 acceptance schema remains the historical anchor `0016_sleep_nightly_summaries.sql` recorded in section 23. `workout_sessions.session_type`, `session_name`, `experiment_id`, and `benchmark_protocol_version_id` travel with that table. Restore inserts `experiments` and `lab_protocol_versions` before `workout_sessions`, supplements before `experiment_supplements`, and `benchmark_results` before `benchmark_result_values` and `benchmark_result_evidence`. A result that names `supersedes_result_id` is inserted after the result it replaces. Owner-created exercise definitions are rows in `exercise_definitions`, which is already portable. Restore replaces that seeded table from the archive, so custom rows survive beside seeded rows when the archive contains both. `daily_context.source_id` references `data_sources`. `daily_context_tags.context_id` references `daily_context`, and restore inserts the parent before the tags.

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
- provenance/link tables and their database foreign keys;
- capture-job history.

The full archive preserves raw canonical source links. The portable owner export projects external USDA provenance into provider-neutral semantic identifiers so source identity survives without database-specific foreign keys. A USDA food row keeps its reviewed serving and nutrition, and adds `external_provenance` with `provider = usda_fooddata_central`, the FDC `external_id`, and the serving-basis `external_fingerprint`. That block does not include a `data_sources` UUID, and it is not restored. Portable export is still not a second disaster-recovery archive.

V2-A1 adds the four canonical supplement tables to both the full archive and the portable export: `supplements`, `supplement_schedules`, `supplement_status_events`, and `supplement_adherence`. V2-A2 adds `body_measurement_cadences` to both, and adds `updated_at` on `body_measurement_sessions` and `body_metrics`. V2-A4 adds `daily_context` and `daily_context_tags` to both. The 15-table portable count above is the 2026-09-22 v1 acceptance anchor, not the post-v1 inventory.

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

## Post-v1 — V2-A1 Supplements

After the v1.0.0 freeze, V2-A1 added canonical supplement identity, effective-dated schedules, lifecycle history, and explicit adherence. Missing adherence stays unknown. See section 31. V2-A2 adds manual Body capture and opt-in cadence without changing the frozen weight-trend algorithm. See section 32. V2-A3 adds ad-hoc Training. See section 33. V2-A4 adds optional daily context. See section 34. V2-B1 adds Personal Lab protocol identity. See section 35. V2-B2 adds Benchmark Results. See section 36. V2-B3 derives Benchmark retest scheduling without a new migration. See section 37. V2-B4 records experiment result summaries on `0023_experiment_results.sql`. See section 38. V2-C1 records first-class recipes on `0024_recipes.sql`. See section 39. V2-C2 records immutable recipe editing on that same schema. See section 40. V2-C3 logs consumption from an exact recipe version on `0025_recipe_consumption.sql`. See section 41. V2-C4 adds in-builder ingredient creation on `0026_nutrition_food_usda_source.sql`, with USDA source links and `description_ai` on `0027_nutrition_food_ai_source.sql`. See section 42. V2-D1 records first-class Goals on `0028_goals.sql`. See section 43. V2-D2 derives body and strength projections without a new migration. See section 44. V2-D3 derives goal status and in-app attention without a new migration. See section 45. V2-E1 reads one canonical Sleep night without a new migration. See section 46. V2-E2 derives stage composition from those nights without a new migration. See section 47. V2-E3 records overnight vital samples on `0029_sleep_vital_samples.sql` and enables none of them until a payload is verified. See section 48. V2-E4 derives a personal baseline on read. See section 49. V2-E5 derives Sleep source attribution on read. See section 50. V2-F1 explains a bounded evidence packet on read. Its provider budget is `ai_usage` on `0030_ai_usage.sql`. See section 51. Frozen v1 Nutrition logging, Training, Activity, and Sleep semantics are unchanged.

---

# 22. Current domain status matrix

| Domain / subsystem | Status | Canonical owner | Notes |
|---|---|---|---|
| Auth/owner security | Implemented | Health | 401/403 owner boundary, cookie session |
| Body | Implemented/frozen, extended by V2-A2 | Health | Fit Profile and weight trends stay frozen. V2-A2 adds manual quick entry, circumference keys, and opt-in cadence. See section 32. |
| Training | Implemented, extended by V2-A3 and V2-B1 | Health | Paper-first, Home-AI transcription v1.3.x; canonical workout edit/delete supported. V2-A3 adds ad-hoc sessions and owner exercises. V2-B1 lets an experiment session reference an active Experiment or a Benchmark protocol version. See sections 33 and 35. |
| Nutrition | Implemented / release candidate, extended by V2-C1 through V2-C3 | Health | Gemini primary, reviewed estimates, barcode/label/manual; reusable foods can be saved without logging. V2-C1 adds immutable recipe versions. V2-C2 creates the next version when the current formulation changes. V2-C3 logs one nutrition entry from an exact recipe version. See sections 39 through 41. |
| Progress Strength/Body | Implemented | Health | Deterministic analytics. Daily context does not change these calculations. |
| Activity | Implemented/frozen | Health | HAE daily summary canonical |
| Sleep | Implemented/frozen | Health | XML/HAE intervals → nightly summaries; Night Detail reads the stored summary (section 46) |
| Apple activity workouts | Implemented | Health Activity context | Never Training canonical |
| Timeline | Implemented, extended by V2-A4, V2-B2, and V2-B4 | Health Progress | Real chronological observations, plus date-only Daily context, valid Benchmark Result annotations, and valid Experiment Result annotations. No numeric Benchmark or Experiment lane. See sections 34, 36, and 38. |
| Compare | Implemented | Health Progress | Coverage-aware normalized comparisons |
| Checkpoints | Implemented | Health Progress | Domain-specific interval/baseline semantics |
| Cross-domain intelligence | Implemented engine | Health | Zero surfaced findings currently |
| Today | Implemented | Health | One coherent `/api/today` payload. V2-A1 adds scheduled supplement occurrences. V2-A2 adds at most one Body cadence reminder. V2-A4 adds optional daily context and does not treat absence as Needs Attention. V2-B1 adds scheduled and active experiments without a due reminder. V2-B4 adds Ready to review on the Health day after `window_end`. |
| Supplements | Post-v1 V2-A1 implemented | Health | Canonical schedules, lifecycle history, and explicit taken/skipped adherence. Missing stays unknown. See section 31. |
| Daily context | Post-v1 V2-A4 implemented | Health | One optional owner annotation per America/Phoenix date. Missing means no context was recorded. See section 34. |
| Personal Lab | Post-v1 V2-B complete | Health | Experiments, Benchmark definitions, immutable protocol versions, evidence-linked Benchmark Results, derived retest scheduling, and deterministic Experiment Results. A result reports observations. It does not claim the intervention caused the change. See sections 35 through 38. |
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

## Post-v1 extension

After the v1 sequence above, V2-A1 adds supplement capture on `0017_supplements.sql`. See section 31. V2-A2 adds Body measurement capture and cadence on `0018_body_measurement_cadence.sql`. See section 32. V2-A3 adds ad-hoc Training on `0019_training_session_types.sql`. See section 33. V2-A4 adds Daily Context on `0020_daily_context.sql`. See section 34. V2-B1 adds Personal Lab protocols on `0021_personal_lab_protocols.sql`. See section 35. V2-B2 adds Benchmark Results on `0022_benchmark_results.sql`. See section 36. V2-B3 derives retest scheduling from that schema. See section 37. V2-B4 adds experiment result summaries on `0023_experiment_results.sql`. See section 38. V2-C1 adds first-class recipes on `0024_recipes.sql`. See section 39. V2-C2 adds recipe version editing without a new migration. See section 40. V2-C3 adds recipe consumption logging on `0025_recipe_consumption.sql`. See section 41. V2-C4 adds in-builder ingredient creation on `0026_nutrition_food_usda_source.sql`, with USDA source links and `description_ai` on `0027_nutrition_food_ai_source.sql`. See section 42. V2-D1 adds first-class Goals on `0028_goals.sql`. See section 43. V2-D2 derives body and strength projections without a new migration. See section 44. V2-D3 derives goal status and in-app attention without a new migration. See section 45. V2-E1 reads one canonical Sleep night without a new migration. See section 46. V2-E2 derives stage composition from those nights without a new migration. See section 47. V2-E3 adds overnight vital samples on `0029_sleep_vital_samples.sql`. See section 48. V2-E4 derives a personal baseline without a new migration. See section 49. V2-E5 derives Sleep source attribution without a new migration. See section 50. V2-F1 records provider cost reservations on `0030_ai_usage.sql`. See section 51. V2-F2 derives proactive insights without a new migration. See section 52. Do not renumber the frozen v1 steps to include these extensions.

---

# 28. Current known deferred work

Deferred work is not forgotten work. It is intentionally outside the current v1 core unless a later revision promotes it. The numbered list below is that frozen v1 backlog, not the v2 implementation order. V2-A Data Capture Foundations is recorded in `HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md` and is complete: V2-A1 Supplements (section 31), V2-A2 Body measurement capture (section 32), V2-A3 ad-hoc Training (section 33), and V2-A4 Daily Context (section 34). V2-B1 Personal Lab protocol identity is implemented (section 35). V2-B2 Benchmark Results are implemented (section 36). V2-B3 Retest Scheduling is implemented as derived state (section 37). V2-B4 Experiment Result Summaries are implemented (section 38). V2-B Personal Lab Core is complete. V2-C1 First-Class Recipes are implemented (section 39): identity, immutable v1, and snapshotted ingredients. V2-C2 Recipe version editing is implemented (section 40). V2-C3 Recipe consumption logging is implemented (section 41). V2-C4 in-builder ingredient creation is implemented (section 42). V2-C Recipes / Batch Meals is complete. V2-D1 First-Class Goals are implemented (section 43). V2-D2 derives projections for active body and strength goals (section 44). V2-D3 derives goal status and in-app attention (section 45). V2-D Goals + Projections is complete. V2-E1 Rich Sleep Night Detail is implemented (section 46). V2-E2 Stage Analytics is implemented (section 47). V2-E3 overnight vital storage is implemented (section 48), with no metric enabled. V2-E4 personal baselines are implemented (section 49). V2-E5 Sleep source attribution is implemented (section 50). V2-E Rich Sleep + Overnight Vitals is complete. V2-F1 Ask Health conversational analysis is implemented (section 51). Its monthly budget and provider-call rate limit are rows in `ai_usage`, not process memory. V2-F2 Proactive Insights are implemented (section 52). V2-F3 Weekly Coach Brief is implemented (section 53). Experiment suggestions, literature retrieval, and other later Ask Health work remain deferred. Notifications and AI proposals remain deferred. `docs/V2-ROADMAP.md` still records the older v1 ordering.

Highest-priority v2 work:

1. **Recipes / Batch Meals** — V2-C1 stores the recipe identity, immutable v1, ordered ingredient snapshots, and whole-recipe nutrition. V2-C2 stores later immutable versions of the same recipe. V2-C3 logs servings, a fraction of the recipe, or finished-weight grams from an exact version. V2-C4 creates a missing ingredient inside the recipe draft. V2-C Recipes / Batch Meals is complete. Nested recipes, batch inventory, and fiber remain deferred.
2. **Body ingestion / Health Inbox** — substantially easier phone-first body-data intake, including quicker manual capture and investigation of share/Shortcut/device-source workflows while retaining the verified XLSX path.
3. **Goals + deterministic projections** — V2-D1 stores the goal identity, structured selector, lifecycle, and immutable target versions (section 43). V2-D2 derives a Theil–Sen crossing window for active body and strength goals (section 44). V2-D3 derives target state, deadline state, and capped Today attention (section 45). Aggregate and benchmark goals are not projected. On track means the entire projection window falls on or before the owner-chosen date. AI explanation remains deferred. V2-D is complete.
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
| 2026-09-26T21:24:40-07:00 | 1.0.7 | 7, 16, 17, 20, 22, 28, 31 | Recorded post-v1 V2-A1 Supplements: migration `0017_supplements.sql`; effective-dated schedules with an ISO weekday mask; lifecycle events; explicit taken/skipped adherence; unknown when no row exists; Today checklist inside `GET /api/today`; `/supplements` outside the five-item primary nav; backup and portable export of all four canonical tables. Package version stays 1.0.0. Automated suite: 540 tests. | New canonical tables. No change to frozen v1 Nutrition, Training, Body, Activity, or Sleep semantics. Historical v1 backup counts remain historical. Restore still requires an empty destination on the current schema head. No AI dependency. |
| 2026-09-26T21:49:02-07:00 | 1.0.8 | 7, 8, 16, 17, 20, 21, 22, 27, 28, 32 | Recorded post-v1 V2-A2 Body measurement expansion: migration `0018_body_measurement_cadence.sql`; controlled manual metrics with circumference canonical centimeters; manual session create/correct/delete; imported Fit Profile sessions stay read-only; opt-in per-metric cadence; Today shows at most one reminder. Package version stays 1.0.0. Automated suite: 552 tests. | New cadence table and `updated_at` on existing Body session/metric rows, backfilled from `created_at`. No recomputation of historical measurements. Weight trend thresholds are unchanged. No AI dependency. |
| 2026-09-26T22:13:01-07:00 | 1.0.9 | 7, 9, 16, 17, 20, 21, 22, 27, 28, 33 | Recorded post-v1 V2-A3 ad-hoc Training: migration `0019_training_session_types.sql`; `session_type` (`programmed`, `ad_hoc`, `experiment`) orthogonal to `source_kind`; optional `session_name`; historical backfill from template identity; owner-created exercises on `exercise_definitions` with conservative analytics. Package version stays 1.0.0. Automated suite: 563 tests. | Existing workout rows gain `session_type` from template identity, otherwise `ad_hoc`. No session, exercise, set, template snapshot, or `source_kind` rewrite. `experiment` is reserved and cannot be created until a linked Experiment or Benchmark exists. No AI dependency. |
| 2026-09-26T22:34:28-07:00 | 1.0.10 | 7, 11, 16, 20, 21, 22, 28, 34 | Recorded post-v1 V2-A4 Daily Context: migration `0020_daily_context.sql`; one optional context row per America/Phoenix date; twelve frozen tags in `daily_context_tags`; optional note of at most 500 characters; absence means no context was recorded. Today and Timeline read it without a second browser request. Package version stays 1.0.0. Automated suite: 579 tests. | New canonical tables. No diagnosis, no causal claim, and no change to Supplement, Training, Sleep, Nutrition, Body, or Activity calculations. Future dates are rejected. Empty editor state is not stored. No AI dependency. |
| 2026-09-26T23:03:14-07:00 | 1.0.11 | 7, 11, 16, 20, 21, 22, 28, 35 | Recorded post-v1 V2-B1 Personal Lab: migration `0021_personal_lab_protocols.sql`; shared immutable protocol versions for separate Experiment and Benchmark objects; structured evidence requirements and observe-only context controls; supplement and benchmark links; experiment Training sessions. Package version stays 1.0.0. Automated suite: 591 tests. | New canonical tables. No result rows, no copied observations, no due reminders, and no causal claim. Existing ad-hoc workouts stay ad-hoc. Protocol version content is not rewritten in place. No AI dependency. |
| 2026-09-26T23:38:19-07:00 | 1.0.12 | 7, 11, 16, 20, 21, 22, 28, 35, 36 | Recorded post-v1 V2-B2 Benchmark Results: migration `0022_benchmark_results.sql`; immutable evidence-linked results; deterministic evaluators; owner attestation when the source does not already name the protocol; invalidation instead of rewrite. Package version stays 1.0.0. Automated suite: 608 tests. | New canonical tables. Result values are derived from canonical observations and are not typed by the client. Same-protocol results can show a numeric delta. Different protocol versions are not directly compared. No experiment completion, no retest reminder, and no causal claim. No AI dependency. |
| 2026-09-26T23:55:51-07:00 | 1.0.13 | 7, 16, 20, 21, 22, 28, 36, 37 | Recorded post-v1 V2-B3 Retest Scheduling. Retest state is derived from the current protocol version and the latest valid same-version result. No new migration. Package version stays 1.0.0. Automated suite: 621 tests. | No schedule table. Minimum interval does not block a result. Only the suggested interval creates `due`. Today shows at most one due retest and does not say overdue. No notifications, snooze, or AI timing. |
| 2026-09-27T00:29:14-07:00 | 1.0.14 | 7, 11, 16, 20, 21, 22, 28, 37, 38 | Recorded post-v1 V2-B4 Experiment Result Summaries: migration `0023_experiment_results.sql`; deterministic classifications; owner protocol and safety attestations; immutable results. Package version stays 1.0.0. Automated suite: 637 tests. V2-B Personal Lab Core is complete. | A result reports observations under one frozen protocol version. It does not say the intervention caused the change. Unknown adherence is not skipped. Context absence is not negative evidence. No AI classification. |
| 2026-09-27T00:36:13-07:00 | 1.0.15 | 16, 22, 38 | Ordinary Experiment Result finalization waits until the Health calendar day after `window_end`. The inclusive final day stays open. Early safety and protocol-invalid stops are unchanged. Schema head stays `0023_experiment_results.sql`. Package version stays 1.0.0. Automated suite: 638 tests. | A committed ordinary result includes only closed historical days. The current Activity day is not frozen because the planned window ends today. |
| 2026-09-27T00:52:31-07:00 | 1.0.16 | 5, 7, 10, 16, 20, 22, 28, 39 | Recorded post-v1 V2-C1 First-Class Recipes: migration `0024_recipes.sql`; immutable recipe version 1; ingredient nutrition snapshots; deterministic whole-recipe nutrition. Package version stays 1.0.0. Automated suite: 654 tests. | A Recipe Version stays fixed to the foods, quantities, and nutrition values used when it was created. Later food edits do not rewrite version 1. |
| 2026-09-27T08:11:37-07:00 | 1.0.17 | 10, 16, 20, 22, 28, 39, 40 | Recorded post-v1 V2-C2 Recipe version editing. No new migration. Schema head stays `0024_recipes.sql`. Editing the current formulation creates the next immutable version after preview. Package version stays 1.0.0. Automated suite: 663 tests. | Historical recipe versions are not rewritten. A new version re-resolves live foods only after the owner reviews the difference. |
| 2026-09-27T08:38:26-07:00 | 1.0.18 | 10, 16, 20, 22, 28, 40, 41 | Recorded post-v1 V2-C3 Recipe consumption logging: migration `0025_recipe_consumption.sql`. A portion of an exact recipe version becomes one nutrition entry. Package version stays 1.0.0. Automated suite: 669 tests. | The consumed entry keeps the recipe version, portion, and nutrition accepted at logging time. Later recipe versions do not rewrite it. |
| 2026-09-27T09:02:35-07:00 | 1.0.19 | 10, 16, 20, 22, 28, 39, 42 | Recorded post-v1 V2-C4 in-builder ingredient creation: migration `0026_nutrition_food_usda_source.sql` adds `usda` as a reusable-food source. A recipe draft can select or create a canonical food without leaving the builder. Package version stays 1.0.0. Automated suite: 682 tests. | Every recipe ingredient is still a `nutrition_foods` row. Creating that food does not log a nutrition entry or save the recipe. |
| 2026-09-27T09:18:47-07:00 | 1.0.20 | 6, 16, 22, 28, 42 | Recorded the V2-C4 provenance correction: migration `0027_nutrition_food_ai_source.sql`. USDA identity is a `source_record_links` row. A reusable text estimate uses `description_ai`. Package version stays 1.0.0. Automated suite: 683 tests. | FDC identity is not stored in notes or brand. Recipe versions are not recalculated. Ordinary Food Description and Meal Photo stay unchanged. |
| 2026-09-27T09:27:03-07:00 | 1.0.21 | 20, 42 | Recorded portable USDA provenance: the owner export adds `external_provenance` with provider `usda_fooddata_central`, the FDC id, and the serving fingerprint. The full archive still stores raw source links. Package version stays 1.0.0. Schema head stays `0027_nutrition_food_ai_source.sql`. Automated suite: 684 tests. | No migration. Portable export is not restored. Notes and brand stay independent of FDC identity. |
| 2026-09-27T09:57:21-07:00 | 1.0.22 | 7, 16, 20, 22, 28, 43 | Recorded post-v1 V2-D1 First-Class Goals: migration `0028_goals.sql`. A Goal keeps a structured selector and lifecycle. Each target change is the next immutable version. Package version stays 1.0.0. Automated suite: 699 tests. | No projection, reminder, or AI commit. Completion is an owner action. Missing evidence stays null. D2 and D3 are not implemented. |
| 2026-09-27T10:16:35-07:00 | 1.0.23 | 8, 16, 22, 28, 43, 44 | Recorded post-v1 V2-D2 deterministic goal projections. No new migration. Schema head stays `0028_goals.sql`. Active body and strength goals can show a derived Theil–Sen window. Package version stays 1.0.0. Automated suite: 721 tests. | Projections are not stored. Aggregate and benchmark goals are not projected. No on-track judgment, reminder, or AI date. D3 is not implemented. |
| 2026-09-27T10:36:03-07:00 | 1.0.24 | 8, 16, 22, 28, 43, 44, 45 | Recorded post-v1 V2-D3 goal-aware status and reminders. No new migration. Schema head stays `0028_goals.sql`. Status is derived as `goal-status-v1`. Package version stays 1.0.0. Automated suite: 750 tests. | Target state stays separate from deadline state. On track and off track compare the whole projection window with the owner date. No coaching, AI, or notification delivery. V2-D is complete. |
| 2026-09-27T10:53:43-07:00 | 1.0.25 | 11, 13, 19, 20, 21, 22, 28, 46 | Recorded post-v1 V2-E1 rich Sleep night detail. No new migration. Schema head stays `0028_goals.sql`. Night Detail reads `sleep_nightly_summaries`. Package version stays 1.0.0. Automated suite: 759 tests. | Actual sleep, stage evidence, and completeness stay observations. No overnight vitals, sleep score, or medical interpretation. The stage timeline is deferred. V2-E2+ is not implemented. |
| 2026-09-27T11:17:28-07:00 | 1.0.26 | 13, 20, 21, 22, 28, 46, 47 | Recorded post-v1 V2-E2 Sleep stage analytics. No new migration. Schema head stays `0028_goals.sql`. Stage composition is derived as `sleep-stage-analytics-v1` from `sleep_nightly_summaries`. Package version stays 1.0.0. Automated suite: 766 tests. | Only stage-qualified nights enter composition. Unspecified sleep stays in the pool. Recent comparison requires one source and four nights in each week. No score, reference range, or overnight vitals. V2-E3+ is not implemented. |
| 2026-09-27T11:43:50-07:00 | 1.0.27 | 7, 13, 20, 21, 22, 28, 46, 48 | Recorded post-v1 V2-E3 overnight vital samples. Migration `0029_sleep_vital_samples.sql`. Package version stays 1.0.0. Automated suite: 780 tests. | No candidate metric is enabled. The capability audit found no verified unaggregated payload. Activity resting heart rate stays a day summary. No baseline, score, or medical reading. V2-E4+ is not implemented. |
| 2026-09-27T12:05:32-07:00 | 1.0.28 | 13, 20, 21, 22, 28, 47, 48, 49 | Recorded post-v1 V2-E4 personal baselines and deviations. No new migration. Schema head stays `0029_sleep_vital_samples.sql`. Calculation version `sleep-personal-baseline-v1`. Package version stays 1.0.0. Automated suite: 794 tests. | Sleep duration uses the median of seven or more prior analysis-eligible same-source nights. The target night is excluded. Partial and in-bed nights are not duration evidence. Disabled vital metrics produce no cards. No population range, anomaly label, readiness score, or AI. V2-E5 is not implemented. |
| 2026-09-27T12:25:19-07:00 | 1.0.29 | 13, 20, 21, 22, 28, 49, 50 | Recorded post-v1 V2-E5 Sleep source attribution and continuity. No new migration. Schema head stays `0029_sleep_vital_samples.sql`. Calculation version `sleep-source-attribution-v1`. Package version stays 1.0.0. Automated suite: 803 tests. | Attribution explains stored source selection. It does not rerun arbitration, rank devices, or calibrate providers. V2-E Rich Sleep + Overnight Vitals is complete. V2-F is not implemented. |
| 2026-09-27T12:54:47-07:00 | 1.0.30 | 13, 20, 21, 22, 28, 50, 51 | Recorded post-v1 V2-F1 Ask Health conversational analysis. No new migration. Schema head stays `0029_sleep_vital_samples.sql`. Packet version `ask-health-evidence-v1`. Prompt version `ask-health-v1`. Package version stays 1.0.0. Automated suite: 815 tests. | The model explains a bounded evidence packet. It does not query the database, write canonical Health records, invent correlations, or retrieve literature. Conversation history is not persisted. V2-F2 and later are not implemented. |
| 2026-09-27T13:17:21-07:00 | 1.0.31 | 7, 20, 21, 22, 28, 51 | Moved Ask Health monthly budget and provider-call rate limiting onto `ai_usage`. Migration `0030_ai_usage.sql`. Schema head is `0030_ai_usage.sql`. Packet version stays `ask-health-evidence-v1`. Prompt version stays `ask-health-v1`. Package version stays 1.0.0. Automated suite: 821 tests. | Process memory is not the spending authority. Reservations are locked in Postgres before Gemini. Unfinalized and uncertain calls keep their reserved cost. The ledger stores no question, conversation, packet, or answer. Nutrition Gemini is not on this ledger. V2-F2 and later are not implemented. |
| 2026-09-27T13:41:43-07:00 | 1.0.32 | 20, 22, 28, 51, 52 | Recorded post-v1 V2-F2 Proactive Insights. No new migration. Schema head stays `0030_ai_usage.sql`. Calculation version `proactive-insights-v1`. Package version stays 1.0.0. Automated suite: 841 tests. | Insights are derived on read from existing analytics. They are not stored, exported, or sent to Gemini. Ask Health remains an explicit owner action. V2-F3 and later are not implemented. |
| 2026-09-27T14:13:17-07:00 | 1.0.33 | 20, 22, 28, 52, 53 | Recorded post-v1 V2-F3 Weekly Coach Brief. No new migration. Schema head stays `0030_ai_usage.sql`. Packet `weekly-coach-evidence-v1`. Prompt `weekly-coach-v1`. Package version stays 1.0.0. Automated suite: 859 tests. | The brief is derived on read. Gemini may only select and phrase server candidates after an explicit generate action, through the shared `ai_usage` ledger. Coach prose is not stored. V2-F4 and V2-F5 are not implemented. |
| 2026-09-27T15:09:44-07:00 | 1.0.34 | 20, 22, 28, 35, 54 | Recorded post-v1 V2-F4 Experiment Suggestions. Migration `0031_experiment_origins.sql`. Schema head is `0031_experiment_origins.sql`. Calculation `experiment-suggestions-v1`. Packet `experiment-suggestion-evidence-v1`. Prompt `experiment-suggestion-v1`. Package version stays 1.0.0. | Eligibility is deterministic. Gemini may only phrase an already eligible candidate after an explicit draft. Acceptance revalidates the fingerprint and writes one canonical Experiment through the existing Personal Lab model. Unaccepted suggestions are not stored. V2-F5 is not implemented. |
| 2026-09-27T15:43:21-07:00 | 1.0.35 | 54, 55 | Corrected V2-F4 Goal suggestions to fail closed. No new migration. Schema head stays `0031_experiment_origins.sql`. Package version stays 1.0.0. | Accepted F4 suggestions are due Benchmark retests and missing Benchmark baselines. Goal-observation suggestions are deferred because current Lab requirements do not evaluate Goal thresholds and windows. `experiment_goals` stays. V2-F5 is not implemented. |
| 2026-09-27T16:22:35-07:00 | 1.0.36 | 51, 56 | Recorded post-v1 V2-F5 Literature-Backed Evidence Drawer. No new migration. Schema head stays `0031_experiment_origins.sql`. Calculation `literature-retrieval-v1`. Prompt `literature-synthesis-v1`. Package version stays 1.0.0. | External research is an explicit Europe PMC search. It is not personal Health evidence. Literature queries, abstracts, and synthesis are not stored. V2-F is complete. Goal-observation suggestions remain deferred. |
| 2026-09-27T16:55:27-07:00 | 1.0.37 | 5.3, 11.4, 12.2, 12.3 | Recorded post-v1 V2-G1 ongoing Health Auto Export workout ingestion. No new migration. Schema head stays `0031_experiment_origins.sql`. Calculation `hae-workout-v1`. Package version stays 1.0.0. | Apple and Health Auto Export workouts stay in `activity_workouts` and stay out of Training. Provider id is the exact duplicate key. Cross-source match requires the same start, end, and formatted activity identity. Route data and nested workout telemetry are not stored. The transport is not an observing source. |
| 2026-09-27T17:24:03-07:00 | 1.0.38 | 8, 11, 16, 20, 22, 28 | Recorded post-v1 V2-G2 Body Inbox and Shortcut capture. Migration `0032_body_capture_inbox.sql`. Schema head is `0032_body_capture_inbox.sql`. Contract `body-capture-v1`. Package version stays 1.0.0. Automated suite: 922 tests. | `POST /api/ingest/body` only stages `body_capture_inbox`. `BODY_CAPTURE_TOKEN` cannot read or save Body data. Owner review commits one manual `body_measurement_sessions` row and a `body_shortcut` provenance link. Pending and discarded captures are not observations. Native share-sheet targeting is not implemented. |
| 2026-09-27T18:00:05-07:00 | 1.0.39 | 8, 32 | Corrected V2-G2 review so an untouched save keeps the staged capture instant. No new migration. Schema head stays `0032_body_capture_inbox.sql`. Package version stays 1.0.0. Automated suite: 923 tests. | Opening the review page is not an edit. Changing weight, other metrics, or notes does not truncate seconds or fractions. An explicit time edit uses America/Phoenix and keeps the entered seconds. The server still revalidates `measuredAt`. |
| 2026-09-27T18:12:06-07:00 | 1.0.40 | — | Implemented V2-G3 Appearance. No migration. Schema head stays `0032_body_capture_inbox.sql`. Package version stays 1.0.0. Automated suite: 927 tests. | Color mode is System, Light, or Dark. System is the absence of `health-theme`. Palettes are `classic`, `forest`, `ocean`, `sunset`, and `plum` in `health-palette`. They change accent chrome only. Danger, warning, and success stay semantic. Preferences are not Health data, backup, or portable export. |
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

---

# 31. Post-v1 extension — Supplements (V2-A1)

This section records a post-v1 extension. It does not mean v1 always contained Supplements. Frozen v1 rules in the earlier sections still apply: Health owns canonical facts, sources provide observations, deterministic code derives state, missing evidence is not manufactured, and AI does not commit these rows. V2-A1 uses no AI.

Implemented schema head: `0017_supplements.sql`.

Package version remains `1.0.0`. This extension does not create a v2 release tag.

## 31.1 Canonical tables

| Table | Role |
|---|---|
| `supplements` | Persistent identity and descriptive metadata |
| `supplement_schedules` | Effective-dated dose, unit, slot, and weekday mask |
| `supplement_status_events` | Effective-dated `active`, `paused`, or `discontinued` |
| `supplement_adherence` | Explicit `taken` or `skipped` observations only |

Provenance uses the existing `data_sources.key = 'manual'` row from `0001_health_foundation.sql`. Ordinary checkbox actions do not create `import_jobs`.

## 31.2 Schedule recurrence

Weekday mask, Monday = bit 0 through Sunday = bit 6. `127` is every day. A normal plan change closes the prior row with `effective_through` and inserts a new row. It does not rewrite a historically operative dose. A future schedule that has not taken effect and has no adherence may be edited in place.

V2-A1 does not implement RRULEs, monthly schedules, PRN medication, reminders, or unit conversion. `1 serving` is not treated as a mass.

## 31.3 Lifecycle and missingness

The state on a date is the latest status event with `effective_date <= that date`. Creating a supplement also creates its first `active` event.

Resolved occurrence order:

1. paused lifecycle → `paused`
2. not active → `not_scheduled`
3. schedule interval and weekday mask
4. explicit `taken` or `skipped`
5. otherwise `unknown`

No adherence row means unknown, not skipped. The app does not insert skipped rows after midnight. Paused and discontinued periods do not manufacture misses. Clearing an observation deletes that row and returns the occurrence to unknown.

`taken_at` is set only when the owner supplies an instant. `created_at` is when Health recorded the fact.

Future adherence dates are rejected. Actual dose amount and unit must both be present or both be absent. A positive actual amount does not change the planned schedule.

## 31.4 Today and management

`GET /api/today` remains the only Today payload. It includes scheduled active occurrences for the Phoenix date. Counts keep `unknown` separate from `skipped`. Primary adherence is `taken / scheduled`. Capture coverage is `(taken + skipped) / scheduled`.

`/supplements` manages definitions, schedules, pause/resume/discontinue, and backfill. The five primary destinations stay Today, Nutrition, Training, Body, and Progress. Settings links to `/supplements`.

`/demo` does not receive a supplement fixture and does not call supplement APIs.

## 31.5 Backup

All four tables are canonical, parent-before-child, included in the full archive and the owner portable export, and covered by the restore round-trip tests. Auth secrets remain excluded.

## 31.6 Intentionally deferred

Experiments, benchmarks, Ask Health, supplement advice, interaction warnings, notifications, prescriptions, Recipes, Body Inbox, ad-hoc Training, context tags, and goals are not part of V2-A1. Manual Body capture and cadence are recorded later in section 32.

---

# 32. Post-v1 extension — Body measurement capture (V2-A2)

This section records a post-v1 extension. It does not mean v1 always had circumference quick entry or measurement cadence. Frozen Body sessions, EAV metrics, Fit Profile import, missing-sentinel rules, kilogram weight storage, pound display, and the Theil–Sen trend thresholds remain as written in section 8.

Implemented schema head: `0018_body_measurement_cadence.sql`.

Package version remains `1.0.0`. This extension does not create a v2 release tag.

## 32.1 Controlled manual metrics

Manual capture uses the existing `body_measurement_sessions` and `body_metrics` tables. There is no parallel measurement store.

Canonical keys:

```text
weight
body_fat_percentage
waist_circumference
hip_circumference
chest_circumference
neck_circumference
left_upper_arm_circumference
right_upper_arm_circumference
left_forearm_circumference
right_forearm_circumference
left_thigh_circumference
right_thigh_circumference
left_calf_circumference
right_calf_circumference
```

`waist_circumference` is not `waist_hip_ratio`. Left and right limb keys stay separate.

| Metric | Canonical unit | Manual input | Owner display |
|---|---|---|---|
| weight | kg | lb or kg | lb, 0.1 |
| body fat | percent, not a fraction | percent | %, 0.1 |
| circumferences | cm | in or cm | in, 0.1 |

`1 in = 2.54 cm`. Conversion is not rounded until display. A blank field is omitted. It is not stored as zero. A manual session needs at least one metric. Weight and circumferences must be greater than zero. Body fat must be from 0 through 100.

## 32.2 Manual sessions

A manual session uses `data_sources.key = manual`, `import_job_id = NULL`, `value_kind = manual`, and timezone `America/Phoenix`. Quick entry uses the actual current instant. A date-only value is rejected. Future instants are rejected. Ordinary form saves do not create import jobs.

`POST /api/body/measurements` creates a session. `PATCH` replaces that session's manual metrics and can correct notes or an explicit instant. `DELETE` removes the session; metrics cascade. Sessions with an import job, or any source other than `manual`, stay read-only.

`updated_at` on sessions and metrics was backfilled to `created_at` for rows that already existed. There is no separate audit log.

## 32.3 Cadence

`body_measurement_cadences` stores one mutable owner preference per metric: interval days from 1 to 3650, and `enabled_from`. No cadence is created automatically. Deleting the row turns the reminder off. Changing a cadence does not rewrite measurements.

Group buttons such as Arms or Full measurements only write the individual metric rows. They are not a second stored model.

The resolver is calendar-based in America/Phoenix, using each session's own timezone to date an observation:

```text
no row                         no reminder
age < interval                 current
interval <= age < 2 * interval due
age >= 2 * interval            stale
no observation yet             initial_due
```

`initial_due` is not called overdue. A future observation does not satisfy the current date. Any valid observation of that exact key can satisfy the cadence, including Fit Profile weight. Waist does not satisfy hips. Left does not satisfy right.

## 32.4 Today

`GET /api/today` still returns one payload. It surfaces at most one reminder, ranked stale, then `initial_due`, then due, then days past due, then catalog order. `dueCount` lets the card say how many others are due without listing them. The Measure link opens `/body?action=measure&metric=...`. A cadence before its `enabled_from` date is not shown.

## 32.5 Backup and demo

`body_measurement_cadences` is canonical and included in the full archive and the portable export. Restore keeps ids, dates, timestamps, nulls, and centimeter values.

`/demo` stays synthetic and read-only. It does not show owner cadence or open the manual capture form.

## 32.6 Intentionally deferred

Body Inbox, Shortcut ingestion, Apple Health body ingestion, photo tape-measure capture, circumference projections, goals, medical ranges, body scores, notifications, Experiments, and Benchmarks are not part of V2-A2. Cadence asks for a measurement. It never invents one.

---

# 33. Post-v1 extension — Ad-hoc Training (V2-A3)

This section records a post-v1 extension. It does not mean v1 workouts were always labeled programmed or ad-hoc. Frozen exercise identity, slot identity, template snapshots, set families, load rules, blank-is-missing, paper load inheritance, transcription, and derived analytics remain as written in section 9.

Implemented schema head: `0019_training_session_types.sql`.

Package version remains `1.0.0`. This extension does not create a v2 release tag.

## 33.1 Session intent

`workout_sessions` gains `session_type` and nullable `session_name`.

`session_type` is what kind of Training session this is: `programmed`, `ad_hoc`, or `experiment`. `source_kind` remains how Health received it (`manual` or `imported_candidate`). Those dimensions stay orthogonal. There is no `source_kind = ad_hoc`.

Historical rows are classified `programmed` when `workout_template_id`, `routine_code`, `template_version`, or `template_name` is present. Otherwise they are `ad_hoc`. The column is added nullable, backfilled, then set `NOT NULL` with a check. It has no permanent default. Existing session ids, exercises, sets, template snapshots, and `source_kind` are unchanged.

`session_name` is an optional human label for a non-template session. Blank is stored as NULL. It is not `template_name`. A missing name displays as “Ad-hoc workout”. That fallback is not written back.

A new programmed session requires a real template. The server still resolves routine, version, template name, and exercise name. An ad-hoc session stores `workout_template_id`, `routine_code`, `template_version`, `template_name`, and exercise `slot_id` as NULL. Ordinary create of `experiment` returns 409: “Experiment sessions require a linked Experiment or Benchmark.” No experiment id or benchmark name is invented. Session type does not change during a normal edit.

Photo transcription still commits `session_type = programmed` and `source_kind = imported_candidate`. Recommit protection after deletion is unchanged.

## 33.2 Owner exercises

Ad-hoc work uses the same `exercise_definitions`, `workout_session_exercises`, and `workout_sets` tables. The owner can create a reusable exercise with name, measurement family (`reps`, `duration`, `reps_per_side`, `duration_per_side`), and a load type already used by the catalog (`bodyweight`, `barbell`, `dumbbell`, `kettlebell`, `dumbbell_or_kettlebell`, `cable`, `machine`, `band`, `other`, `none`). Unilateral must match the family: per-side measurements are unilateral, and the other two are not. Distance is not a set field.

New owner exercises use `performance_type = other`, `analytics_load_type = none`, and `analytics_rep_mode = per_side` only for a per-side family. Otherwise the rep mode is `standard`. Sets are stored. Unsupported analytics stay unsupported. Provenance for these definitions is metadata `{ "origin": "owner", "created_via": "ad_hoc_training" }`. That metadata is not a health observation. Seeded catalog rows are not archived or semantically rewritten through this API.

An unused owner exercise can still correct name, measurement family, load type, and unilateral. After a workout references it, measurement family, unilateral, and load type stay fixed. A name correction does not rewrite historical `exercise_name` snapshots. Delete archives the definition with `is_active = false`. Inactive definitions leave the picker. Historical workouts still load.

## 33.3 Today, analytics, backup, demo

`GET /api/today` remains one payload. Training items include `sessionType` and a resolved name: programmed uses the template snapshot, then the routine, then “Workout”; ad-hoc uses `session_name`, then “Ad-hoc workout”; experiment uses a future title, then “Experiment workout”. The current template name is not looked up over the snapshot. When nothing is logged, “Log workout” still opens `/training/import`, and “Ad-hoc workout” opens `/training/new?type=ad_hoc`.

An ad-hoc session counts as Training. Sets for an already classified exercise participate in that exercise’s analytics. Apple Activity workouts stay outside Training.

`session_type` and `session_name` are in the `workout_sessions` backup inventory. Owner-created definitions are included with `exercise_definitions` in the full archive and the portable export. `/demo` stays synthetic and read-only. It does not offer ad-hoc creation or the owner exercise API.

## 33.4 Intentionally deferred

Experiment and Benchmark tables, experiment foreign keys, protocol versions, retest intervals, Personal Lab, context tags, goals, distance, pace, heart rate, power, rounds, per-set RPE, GPS routes, Apple workouts as Training, and automatic exercise classification are not part of V2-A3. A benchmark-like session logged now is an ad-hoc workout that a later version can reference. Daily context arrived in V2-A4. See section 34.

---

# 34. Post-v1 extension — V2-A4 Daily Context

V2-A4 records owner-declared circumstances for one America/Phoenix calendar date. It is not a diagnosis, a journal, a symptom tracker, or a causal explanation. A missing row means no context was recorded. It does not mean the day was ordinary, and a tag left off a recorded day is not a negative clinical finding.

The tag catalog lives in `src/domain/context.ts`. The frozen keys are `sick`, `travel`, `alcohol`, `late_meal`, `unusual_stress`, `poor_sleep_opportunity`, `baby_night_interruption`, `pain`, `rest_day`, `new_supplement`, `medication_change`, and `unusual_physical_labor`. Custom tags are not accepted. The optional note is trimmed, blank becomes null, and the maximum is 500 characters. Responses return tags in catalog order.

## 34.1 Schema and API

`daily_context` has one row per `context_date`, a nullable note, and `source_id` pointing at the existing manual data source. `daily_context_tags` stores tag membership with `ON DELETE CASCADE` and a check constraint for the frozen keys. `created_at` and `updated_at` describe the database row, not when the circumstance happened. There is no import job and no AI inference.

A write must contain at least one tag or a nonblank note. Clearing both deletes the row. A later correction updates the same `id` and `created_at`, replaces tag membership, and changes `updated_at`. Future dates are rejected. Past dates and today are allowed.

Owner routes:

- `GET /api/context/days?start=YYYY-MM-DD&end=YYYY-MM-DD`
- `GET /api/context/days/:date` returns `{ context: null }` when nothing was recorded
- `PUT /api/context/days/:date`
- `DELETE /api/context/days/:date` is idempotent when the date has no row

The range is required, ordered by date, and capped at 3660 days. Anonymous callers receive 401. A signed-in non-owner receives 403. The Apple Health ingest token has no context authority.

`/context?date=YYYY-MM-DD` is a private editor. It is not a primary tab, a Settings destination, or a demo route. Omitted date means today in America/Phoenix.

## 34.2 Today, Timeline, and other domains

`GET /api/today` includes `context` for today's Health date. The card sits after Activity, Sleep, and Body and before What Changed. Absence never enters Needs Attention. The demo surface omits context and does not show Add or Edit.

Progress loads context with the timeline request. The event kind is `daily_context`, domain `annotation`, time precision `date`, with no invented `occurredAt`. The card links Edit to `/context?date=...` on the private app. Timeline focus `context` shows only those annotations and has no numeric lane. All includes them. Training, Body, Nutrition, Activity, Sleep, and Performance Bests do not. On a shared day, context sorts before the other events.

Context does not change body trends, strength analytics, activity averages, Nutrition totals, or sleep calculations, and it does not exclude a day from those calculations. `new_supplement` does not create a Supplement. `rest_day` does not forbid Training. `pain` does not replace a workout pain score. Sleep and Nutrition measurements are not converted into tags.

A date-and-tag query reads `daily_context_tags`. It does not parse notes. V2-A4 did not add Personal Lab. V2-B1 does, in section 35. Causal interpretation is still not implemented.

## 34.3 Backup and deviations

Both tables are canonical and portable. Restore preserves ids, dates, notes, tag membership, source ids, and timestamps, and it does not create a second row for the same date.

Deviations from the implementation handoff:

- Duplicate submitted tags are deduped into catalog order.
- A missing detail is HTTP 200 with `{ context: null }`. A missing delete is HTTP 200 with `{ deleted: false }`.
- The public range is limited to 3660 days.
- All-time Timeline can show a context day on or before the as-of date even when that day is earlier than the first other observation. That does not move analytics windows.
- The database check constrains note shape and tag keys. The no-empty-row rule is enforced by the write path, because a parent row is inserted before its tags.
- `/demo` shows no context annotations.

Signed-in owner smoke of the private editor was not run in this pass. Local private routes still require an owner session.

---

# 35. Post-v1 — V2-B1 Personal Lab

V2-B1 adds the objects later result collection will use. It does not store results and does not say what an experiment proved.

An Experiment is one bounded question. A Benchmark definition is a reusable measurement. A Protocol is the exact instructions and evidence requirements for one of those objects. Observations stay in their existing canonical tables. A Result, which would interpret those observations, is deferred.

## 35.1 Shared protocol versions

`lab_protocols` identifies an experiment protocol or a benchmark protocol. `lab_protocol_versions` stores version number, instructions, optional retest day counts, and exactly one current version. `lab_protocol_requirements` stores ordered evidence expectations. `lab_protocol_context_controls` stores tags to observe.

Version content is immutable. A change inserts the next version and marks it current. Older versions stay readable. Product UI does not delete a protocol version.

Requirement roles are `primary_outcome`, `secondary_outcome`, `adherence`, `context`, and `safety`. Domains are `training`, `body`, `nutrition`, `activity`, `sleep`, `supplements`, `context`, and `benchmark`. Selectors are validated in `src/domain/lab.ts` for the domain and requirement kind. Unknown body keys, context tags, metric names, training measures, and missing supplement, exercise, or benchmark ids are rejected. The owner edits structured fields. The owner does not type selector JSON.

Context controls support only `observe`. They do not write Daily Context and they do not exclude a day.

Text limits used by the write path, and not specified in the phase handoff, are 200 characters for titles and requirement labels, 2000 for an experiment question, 4000 for hypothesis, rationale, and description, and 8000 for instructions.

## 35.2 Experiments

`experiments` stores title, question, optional hypothesis and rationale, origin, status, the exact `protocol_version_id`, an optional America/Phoenix date window, and the manual source. There is no goal id and no literature table.

Origins are `owner_created`, `ai_assisted`, `evidence_gap`, `goal_plateau`, `stale_benchmark`, `repeated_pattern`, and `external_research`. The owner UI creates `owner_created` with status `accepted`. `createProposedExperiment` is a separate service path for a future proposal. It starts at `proposed` and does not accept or start the experiment. Owner acceptance is `POST /api/lab/experiments/:id/accept`.

B1 transitions are: `proposed` to `accepted`, `abandoned`, or `superseded`; `accepted` to `scheduled`, `abandoned`, or `superseded`; `scheduled` to `accepted`, `active`, `abandoned`, or `superseded`; `active` to `abandoned`. `abandoned` and `superseded` are terminal. `completed` and `inconclusive` are rejected because they belong to a later result workflow. There is no generic status patch.

`accepted` has no dates. `scheduled` requires `window_end >= window_start`. Returning to `accepted` clears the window. Starting requires `scheduled` and a window, then freezes `protocol_version_id`, `window_start`, and `window_end`. Protocol editing before `active` creates the next version and points the experiment at it. Protocol editing after `active` is rejected. A fundamental protocol change after start means abandon or supersede the experiment and create another one.

`experiment_supplements` links canonical supplement ids as `intervention` or `tracked`. More than one intervention may be stored. That storage does not claim the design isolates any one supplement. Deleting or discontinuing a supplement does not cascade-delete the experiment. `experiment_benchmarks` links benchmark definitions as `primary` or `secondary`, with at most one primary. An experiment does not require a benchmark.

An untouched `accepted` experiment with no Training session may be deleted. After it is scheduled, active, or linked to a workout, the owner abandons or supersedes it.

## 35.3 Benchmarks

`benchmark_definitions` owns one `lab_protocols` row whose kind is `benchmark`. The visible name is the protocol title. Domains are `training`, `body`, `activity`, `sleep`, and `other`. A new protocol edit creates the next version. Archive sets `is_active` false and keeps the history. A definition with protocol history is not deleted.

## 35.4 Training

`workout_sessions.experiment_id` and `benchmark_protocol_version_id` are nullable. A programmed or ad-hoc session must leave both null. An experiment session needs at least one. A benchmark protocol version must belong to `protocol_kind = benchmark`. If both parents are set and the experiment has a primary benchmark, the version must belong to that benchmark's protocol. The experiment must be `active`. An archived benchmark cannot be run.

Creation starts from Personal Lab: `/training/new?type=experiment&experimentId=` or `&benchmarkProtocolVersionId=`. Training home does not offer Experiment as a third generic workout type. Sets stay canonical. Existing ad-hoc workouts are not reclassified. Deleting a workout does not delete the experiment. Abandoning an experiment does not delete its workouts. Session type and the lab parents stay fixed on an ordinary edit.

## 35.5 Surfaces, Today, and Timeline

Private routes are `/lab`, `/lab/experiments/new`, `/lab/experiments/:id`, `/lab/benchmarks/new`, and `/lab/benchmarks/:id`. The five primary destinations stay Today, Nutrition, Training, Body, and Progress. Progress overview links to Personal Lab. `/demo` has no lab route and does not call owner lab APIs.

`GET /api/today` remains one payload. It includes scheduled and active experiments, including a future scheduled window. It does not invent a due action.

Timeline does not gain `experiment_started`, `experiment_abandoned`, or `experiment_superseded` events in this phase. The experiment detail shows the date window. Benchmark result events arrive in section 36.

A protocol requirement does not create a body measurement, a cadence, a supplement schedule, or a context tag.

## 35.6 API, backup, and deviations

Owner routes, all behind owner auth:

- `GET` and `POST /api/lab/experiments`
- `GET`, `PATCH`, and `DELETE /api/lab/experiments/:id`
- `POST /api/lab/experiments/:id/schedule|start|abandon|supersede|accept|protocol-version`
- `GET` and `POST /api/lab/benchmarks`
- `GET` and `PATCH /api/lab/benchmarks/:id`
- `POST /api/lab/benchmarks/:id/protocol-version|archive`

Anonymous is 401. A signed-in non-owner is 403. The Apple Health token has no lab authority. The wrong method is 405.

The lab tables are canonical and portable. Restore preserves protocol ids, version numbers, the current-version flag, requirement selectors, context controls, experiment status and windows, supplement and benchmark links, and Training parent ids.

Deviations:

- Requirement kind names are the catalog names in section 35.1, including `training_measure`, `body_metric`, `nutrition_metric`, `activity_metric`, `sleep_metric`, `supplement_adherence`, `context_tag`, and `benchmark_definition`.
- Text length caps are those in section 35.1.
- Duplicate context tags are deduped into catalog order.
- Timeline lifecycle events are deferred. The window is visible on the experiment.
- `/demo` omits Personal Lab.
- `POST .../accept` exists so a future proposal can be accepted only by an owner action. The owner create path does not use it.
- Signed-in owner smoke was not run. Private routes still require an owner session.

Benchmark outcome roles are tightened on new benchmark protocol writes in section 36. Stored B1 rows stay readable.

# 36. Post-v1 — V2-B2 Benchmark Results

A Benchmark Result is a Personal Lab record. It is not another observation table. Training sets, body measurements, nutrition entries, activity summaries, and sleep nights stay canonical. The result stores the deterministic values those observations produced under one immutable protocol version.

## 36.1 Tables and lifecycle

`benchmark_results` stores the benchmark definition, the protocol version, the evidence-derived result date, an optional experiment, status `valid` or `invalidated`, protocol confirmation `linked_protocol` or `owner_attested`, the evidence fingerprint, the manual source, optional `supersedes_result_id`, and invalidation metadata.

`benchmark_result_values` stores one numeric value per resolved primary or secondary outcome. The unit is the canonical unit from the evaluator. `value_kind` is `observed` when the value is the canonical metric itself and `derived` when deterministic code computes it. A missing observation is not stored as zero.

`benchmark_result_evidence` stores a bounded `evidence_ref` and `evidence_snapshot` for `training_session`, `body_metric`, `nutrition_day`, `activity_day`, or `sleep_night`. The snapshot is provenance for the committed result. Later edits to the source observation do not change it.

A committed result is immutable. The owner invalidates it and may commit a replacement. There is no un-invalidate action and no product hard-delete. Invalidated results stay readable and in backup. Default history, the latest-valid helper, and the default Timeline omit them.

`latestValidBenchmarkResult(benchmarkDefinitionId, protocolVersionId)` returns the latest valid result for that pair. Retest scheduling uses that anchor in section 37.

## 36.2 Evaluation

Evaluators are centralized by requirement kind. A preview is `eligible`, `missing_primary`, `ambiguous`, `unsupported`, `duplicate`, or `conflicting_dates`. Preview writes nothing. Commit re-reads canonical evidence and rejects client-supplied numbers and a client-supplied result date.

Training measures use canonical set helpers. Qualifying sets are `set_type = working` with a performed value. Warmup, drop, other, and blank sets are omitted. `total_reps` and `largest_set_reps` apply to reps families and use `volumeRepsForSet`. `duration` is the sum of `timedDurationSecForSet` in seconds for duration families. `working_sets` counts qualifying sets. A family that does not fit is `unsupported`.

Body, activity, and eligible sleep values are `observed`. Nutrition day totals are `derived`. Activity and sleep use the America/Phoenix daily identity. A body result date uses the measurement session timezone, or America/Phoenix when the session has none. Every resolved outcome in one result must share one Health date.

If the workout's `benchmark_protocol_version_id` equals the selected version and every outcome is that training evidence, confirmation is `linked_protocol`. Otherwise the owner must attest that the observation followed the protocol. An ad-hoc workout stays `session_type = ad_hoc`. A result does not change experiment status. An experiment id is taken from the training session, and a requested experiment id must match it.

The same benchmark, protocol version, and evidence fingerprint cannot be inserted twice, including after invalidation. The API returns 409 and the existing result id. A different observation on the same date is a different fingerprint.

Same-protocol valid results may show an absolute delta and a percent delta. The percent is omitted when the previous value is zero. The UI does not label the change better or worse. Results from different protocol versions are retained and are not directly compared. Multiple primary values stay separate.

New benchmark protocol writes require a result-capable primary outcome. Primary and secondary outcomes must be `training_measure`, `body_metric`, `nutrition_metric`, `activity_metric`, or `sleep_metric`. Experiment protocols are unchanged. Existing stored rows stay readable.

## 36.3 Surfaces

Benchmark detail groups results by protocol version and hides invalidated results until the owner asks to see them. Record-from-existing-data and review-after-workout both open a preview. Result detail shows the values, evidence, protocol confirmation, optional experiment link, and Daily Context for the result date. No context row reads "No context was recorded." A context control is highlighted when that tag is present. It does not invalidate the result.

Timeline kind `benchmark_result` is domain `annotation`, precision `date`. Valid results appear. Invalidated results do not. There is no numeric lane. Today is unchanged.

Result values are not fed back into Training, Body, Activity, Sleep, or Nutrition analytics.

## 36.4 Backup and deviations

The three result tables are canonical and portable. Evidence JSON is compared by parsed content. Restore keeps ids, the fingerprint, units, value kind, refs, snapshots, and invalidation fields.

Deviations:

- Preview adds `conflicting_dates` when outcome evidence does not share one Health date.
- Invalidation reasons are at most 500 characters.
- `supersedes_result_id` is stored. The replaced result must already be invalidated and must belong to the same benchmark.
- `duration` means the sum of performed working-set duration seconds. B1 named the selector and did not define that total.
- A preview without a date, workout, or measurement asks the owner to choose evidence. It does not scan all history.
- The request `date` is a selector. It is stored only when it is the evidence date.
- `/demo` still omits Personal Lab. Signed-in owner smoke for the result screens was not run.

# 37. Post-v1 — V2-B3 Retest Scheduling

Retest state is derived. Health does not store `next_retest_date`, `retest_due`, or a snooze. Schema head remains `0022_benchmark_results.sql`.

## 37.1 State

The states are `unconfigured`, `no_baseline`, `waiting_minimum`, `available`, and `due`.

`minimum_retest_days` is the earliest suggested repeat. Before that date the state is `waiting_minimum`. The owner can still run the benchmark or record a result. The new valid result becomes the anchor.

`suggested_retest_days` is the date when Health says a retest is suggested. `due` exists only when that interval is set and today is on or after the suggested date. A protocol with a minimum and no suggested interval becomes `available` after the minimum. It never becomes `due`. A protocol with neither interval is `unconfigured`. Health does not invent a cadence.

A current protocol with guidance and no valid result for that exact version is `no_baseline`. An older version's result does not schedule the current version. Invalidated results do not anchor the schedule. A replacement result anchors on its `result_date`, not on `created_at`. Two valid results on the same date share one schedule date.

Dates are calendar addition in America/Phoenix. The boundary day is included: today equal to the minimum date is no longer `waiting_minimum`, and today equal to the suggested date is `due`.

Archived benchmarks stay readable and are omitted from the active retest list and from Today.

## 37.2 Surfaces

Personal Lab lists `due` retests, then `available` ones, each labeled with its protocol version. `waiting_minimum`, `no_baseline`, and `unconfigured` stay on the benchmark detail.

Today receives retest data inside `GET /api/today`. It shows at most one `due` retest, chosen by days past the suggested date, then the oldest anchor date, then benchmark title and id. Other due retests are counted, not listed. A scheduled or active experiment linked to that benchmark through `experiment_benchmarks` suppresses the standalone Today card. An accepted experiment does not. The experiment card remains. The retest is not a Needs Attention item, and the copy does not say overdue.

`GET /api/lab/retests` and `GET /api/lab/benchmarks/:id/retest` are owner-only reads. `asOf` defaults to the Phoenix date and must be a calendar date.

## 37.3 Deviations

- `experiment_benchmarks` identifies the benchmark definition and does not store a protocol version. A scheduled or active link suppresses the current-protocol Today retest. A future versioned link would need an explicit match.
- Same-day display still uses the existing latest-valid ordering when `created_at` differs. The schedule date does not.
- An archived benchmark's detail says automatic scheduling is off. It does not say retest suggested.
- There is no notification, snooze, or persisted dismissal.
- `/demo` still omits Personal Lab. Signed-in owner smoke was not run.

# 38. Post-v1 — V2-B4 Experiment Result Summaries

An Experiment Result is a historical record of what the frozen protocol observed. Its migration is `0023_experiment_results.sql`. Package version stays 1.0.0. V2-B Personal Lab Core is complete. Current schema head is recorded in section 7.

## 38.1 Classification

The classifications are `completed_interpretable`, `completed_low_adherence`, `incomplete`, `inconclusive`, `invalid_protocol`, and `stopped_safety`. None of them means the intervention worked or failed.

Precedence is centralized:

1. An explicit safety stop is `stopped_safety`.
2. An owner attestation that the material protocol was not followed is `invalid_protocol`.
3. An ordinary review on or before `window_end` cannot be committed. The inclusive window closes on the next Health calendar day.
4. A required non-context requirement that is missing or insufficient is `incomplete`.
5. A required essential requirement that is unsupported, or an uncertain protocol attestation, is `inconclusive`.
6. A configured adherence threshold that fails after coverage is sufficient is `completed_low_adherence`.
7. Otherwise the result is `completed_interpretable`.

`completed_interpretable` and `completed_low_adherence` set `experiments.status` to `completed`. The other four set it to `inconclusive`. Those statuses are written only by result commit. Invalidating the current valid result, with no replacement, returns the experiment to `active` so it can be reviewed again. The planned window and protocol stay frozen. Abandoned and superseded experiments are not finalizable.

## 38.2 Window, attestations, and criteria

Experiment windows are inclusive calendar-date windows. Ordinary result finalization becomes available on the first Health calendar day after `window_end`, when the full planned observation window is closed. On `window_end` the preview stays in progress and says the final observation day is still open. Early finalization remains available for a safety stop or a material protocol deviation, including on `window_end`, with an `effective_end_date` inside the planned window and not after today. `experiments.window_end` is not overwritten.

The owner attests `followed`, `not_followed`, or `uncertain`. Safety is an explicit attestation plus a reason of at most 500 characters. Pain tags, poor sleep, and low performance do not infer a safety stop. An optional owner note of at most 2000 characters is commentary.

`lab_protocol_requirements.criteria` is part of the immutable protocol version. Existing rows keep `{}`, which means the minimum evidence rule for that kind and invents no historical threshold. Supplement adherence may set `minimumAdherencePercent` and `minimumCoveragePercent`. When an adherence percent is set and coverage is not, resolved coverage must be 100% before the threshold is applied. Coverage below the gate is insufficient, which leads to `incomplete`, not low adherence.

Adherence counts scheduled days as taken, skipped, and unknown. Adherence percent is taken divided by resolved days. Unknown is not skipped. Paused and unscheduled days are not scheduled opportunities. Zero scheduled days on a required adherence requirement is insufficient, not 0%.

Context requirements and observe controls record which tags were present. Absence does not mean the factor did not occur, does not make the result incomplete, and does not invalidate it.

## 38.3 Evidence

All evaluators use the same inclusive effective window. Benchmark outcomes use valid results linked to the experiment. New experiment protocols pin `benchmarkProtocolVersionId`. Older selectors that name only the definition stay readable. If those in-window results use more than one protocol version, the requirement is unsupported. A prior same-version result strictly before `window_start` can show a numeric delta. No prior result is stated as unavailable. It is not treated as zero, and the comparison does not say improved or worsened.

Training evidence is limited to sessions with `experiment_id` set to this experiment. Body, nutrition, activity, and sleep summaries use each domain's existing missingness rules. Missing nutrition is not zero intake. Ineligible sleep is not zero-duration sleep. Ordinary finalization cannot include the current Health day, so a window that ends today does not freeze Activity's provisional row, an open Nutrition day, unresolved supplement adherence, or a Daily Context note that can still change. Activity keeps its existing completed-day rule. There is no separate Activity finalization flag.

Commit re-reads canonical evidence, classifies on the server, and stores bounded evidence snapshots plus a SHA-256 fingerprint. The client cannot submit a classification or calculated outcomes. A committed result is not patched. Correction is invalidate, review again, and commit a replacement that names the invalidated result. At most one valid result exists per experiment.

## 38.4 Surfaces

The result screen shows the classification, question, hypothesis, observations, adherence, recorded context, limitations, and protocol version. The footer says these are recorded personal observations and do not establish causality. The hypothesis is not marked supported or refuted.

Today keeps the existing experiment card before `window_end`. On `window_end` an active experiment can say it ends today and does not say Ready to review. On the next Health day, an active experiment without a valid result says Ready to review. Completing or closing the experiment removes that prompt. Invalidation brings it back. Timeline adds a date-only `experiment_result` annotation on `effective_end_date` for valid results. There is no numeric lane.

`experiment_results`, `experiment_result_requirements`, `experiment_result_evidence`, and requirement criteria are portable. Restore writes the stored result and does not recalculate it. `/demo` does not call the result API and does not show an owner result on the fictional Timeline.

There is no AI call, causality score, confidence score, confounder score, or invented baseline window.

# 39. Post-v1 — V2-C1 First-Class Recipes

A Recipe is a reusable preparation. It is not a `nutrition_foods` row and it is not a consumed `nutrition_entries` row. Creating or archiving a recipe does not log intake. Schema head is `0024_recipes.sql`. Package version stays 1.0.0.

## 39.1 Identity and immutable v1

`recipes` holds identity, the manual source, and whether the recipe is active. The name, notes, yield, ingredients, and nutrition belong to `recipe_versions`. C1 creates version 1 and marks it current. A partial unique index allows at most one current version per recipe. The same shape can hold a later version. C1 exposes no PATCH of version content.

`yield_servings` and `finished_weight_g` are optional and must be greater than zero when present. They are stored so a later consumption log can use them. C1 does not calculate per-serving calories unless a serving yield exists, and the list shows the serving count rather than inventing a per-serving calorie figure.

## 39.2 Ingredient snapshots and calculation

Ingredients are existing reusable `nutrition_foods` only. There are no nested recipes and no loose USDA ids. Each line stores the owner's amount and unit, the scale factor against the food's canonical serving basis, and a snapshot of the food name, source kind, barcode when present, serving basis, and calories, protein, carbs, and fat.

The server resolves the unit, snapshots the food, and calculates the line. The client does not send calories or a scale factor. `serving` and `servings` mean that many of the whole serving basis. An exact normalized match to the food's serving unit scales by the serving quantity. Grams, ounces, and pounds scale by the food's serving weight, using 28.349523125 grams per ounce and 453.59237 grams per pound. Cups, tablespoons, and other units do not convert by guessed density. An unsupported unit, a weight without a weight basis, or a non-positive amount rejects the whole create. Nothing is inserted.

Line calories are the snapshotted base calories times the scale factor, without intermediate rounding. Protein, carbs, and fat follow the same multiplication when known. If any ingredient is missing one of those macros, the whole-recipe value for that macro is null. The other macros still sum. Calories stay required. The stored calculation version is `recipe-v1`.

`food_id` uses `ON DELETE SET NULL`. The snapshot remains if the food row is later removed. The product UI does not hard-delete foods. Later edits to a food's name or calories do not change version 1.

The same food may appear on more than one line. `position` preserves owner order.

## 39.3 Surfaces

Owner routes are `GET` and `POST /api/nutrition/recipes`, `GET /api/nutrition/recipes/:id`, and `POST` archive and restore. Anonymous callers receive 401, other authenticated users receive 403, and the Apple ingest token has no authority. Archive hides the recipe from the active list and leaves the version readable. Restore returns it to the list. Archive does not change version 1.

Nutrition links to Recipes beside Add food. Quick Log stays the primary daily action. The builder searches the existing food catalog. A local estimate can show before save. The saved response is the server calculation. Unknown macros display as not fully known, not as zero. Editing the current version is section 40. C1 itself does not patch version content.

`/demo` does not mount recipe pages or call the recipe API.

## 39.4 Backup

`recipes`, `recipe_versions`, and `recipe_version_ingredients` are canonical portable tables. Restore order is foods, then recipe identity, then versions, then ingredients. Numeric precision, null macros, snapshots, archive state, the current flag, and ingredient order round-trip.

## 39.5 Deferred

C2 recipe version editing is section 40. C3 consumption logging is section 41. C4 in-builder ingredient creation is section 42. Fiber, sodium, and micronutrients are not added. Legacy `meal_combos` are not revived.

# 40. Post-v1 — V2-C2 Recipe version editing

A semantic edit of a Recipe creates the next immutable version of the same `recipes.id`. Version 1 is not rewritten. Schema head stays `0024_recipes.sql`. Package version stays 1.0.0. The stored calculation version stays `recipe-v1`. A recipe version number and the calculation version are different things.

## 40.1 Lifecycle

Only the current version can be edited. Historical versions stay readable from their snapshots, including a line whose `food_id` is null. The owner cannot edit version 1 while version 3 is current.

The server loads the current version, resolves every surviving food against the current `nutrition_foods` row, recalculates line and whole nutrition with the C1 unit resolver, and inserts version N+1 in one transaction. That transaction locks the recipe and its current version, demotes that version, and inserts `version + 1` only while no current version remains. The unique current-version index still applies. A committed success has exactly one current version. `recipes.updated_at` moves. Historical version rows, including `created_at`, do not.

An identical formulation whose live food bases still match the current snapshots does not create a version. A formulation that is unchanged except for a live food-basis correction does create a version. Ingredient order and yield are part of the formulation, so changing either creates a version.

An archived recipe is read-only. Restore sets `is_active` true and does not create a version. The same current version stays current.

## 40.2 Preview and commit

`POST /api/nutrition/recipes/:id/versions/preview` writes nothing. The body carries `sourceVersionId` and the owner fields: name, notes, yield, finished weight, and ordered ingredients (`foodId`, amount, unit). Calculated calories, macros, and scale factors are rejected.

The response compares the current version with the candidate: metadata, yield, ingredient changes, food-basis changes, both whole-nutrition figures, a neutral delta, warnings, `canCommit`, the next version number, and a `previewFingerprint`. Change categories include added, removed, reordered, amount changed, unit changed, food replaced, food basis changed, and unchanged. A line whose food is gone is unresolved until the owner replaces or removes it. A basis change compares name, serving amount, serving unit, serving weight, calories, protein, carbs, and fat. Usage counts and timestamps are not part of that comparison. If either side of a macro is unknown, that delta is unavailable rather than zero.

`POST /api/nutrition/recipes/:id/versions` commits. It reloads foods and recalculates. If the source version is no longer current, the response is 409 `stale_version` (“Recipe changed since editing began.”). If the recomputed fingerprint differs, the response is 409 `stale_preview` (“Recipe ingredients changed since preview.”). No changes, a missing food, an unsupported unit, an invalid amount or yield, and an archived recipe return structured errors. Neither path writes a nutrition entry.

`GET /api/nutrition/recipes/:id/versions/:version` returns that historical version from snapshots. The list and the default detail use the current version. History is ordered by the version integer, newest first.

The private edit route is `/nutrition/recipes/:id/edit`. Review states that saving creates the next version and that the previous version remains unchanged. Historical pages are `/nutrition/recipes/:id/versions/:version` and have no edit action. The builder still searches existing foods. USDA, barcode, label, manual food creation, and AI food description stay in C4. Nested recipes stay rejected.

## 40.3 Backup and export

The same three recipe tables already hold every version. Full backup and portable export include the version chain: identity, each integer version, which one is current, and each ingredient snapshot. Restore keeps those ids and values and still leaves exactly one current version.

## 40.4 Deferred

C3 consumption logging is section 41. A logged entry keeps the recipe version it was calculated from. C4 in-builder ingredient creation is section 42. `/demo` still has no recipe management.

# 41. Post-v1 — V2-C3 Recipe consumption logging

Logging a Recipe creates one ordinary `nutrition_entries` row. The Recipe Version stays the reusable formulation. The entry is the consumed snapshot. Later recipe edits do not change that entry. Schema head is `0025_recipe_consumption.sql`. Package version stays 1.0.0.

## 41.1 Provenance

A recipe-derived entry stores `recipe_version_id`, `recipe_portion_kind` (`servings`, `fraction`, or `grams`), `recipe_portion_amount`, and `recipe_fraction`. All four are present, or all four are null. Ordinary food entries keep them null. The foreign key points at `recipe_versions`, not merely the recipe identity, so leftovers from version 1 can be logged after version 2 exists. The legacy `nutrition_foods.catalog_kind = 'recipe'` quick-add kind is unchanged and is not this model.

The owner action uses the manual source kind. The entry name is the recipe version name at logging time. The portion description is stored on the entry, for example `1 serving · Recipe v2`, `0.5 recipe · Recipe v1`, or `475 g · Recipe v3`. Daily totals, targets, Today, and Progress read the entry. They do not recalculate it from the recipe or its ingredients.

## 41.2 Portion math

One resolver handles the three modes. Servings require `yield_servings` and use amount divided by that yield. Fraction mode is available on every version and uses the amount itself, including values above 1. Grams require `finished_weight_g` and use grams divided by that weight. Amounts must be greater than zero. There is no inventory ceiling and no batch remaining balance.

Consumed calories and macros are the stored whole-recipe totals times that fraction, using the same nutrient scaling as other nutrition entries. There is no per-serving rounding step. A null macro stays null. Nutrition entries remain numeric; the day list still displays calories with the existing calorie formatter.

`POST /api/nutrition/recipe-entries` requires `recipeVersionId`, `logDate`, `portionKind`, and `amount`. It does not reload ingredient foods. Archived recipes stay out of active search, and a direct log of a historical version still succeeds. Two deliberate logs can create two entries. Delete removes the entry and leaves the recipe version untouched. Generic entry correction keeps the recipe provenance columns and does not rewrite the recipe version.

## 41.3 Surfaces

Quick Log search shows the current version of active recipes beside saved foods. Choosing one opens a portion chooser. Historical versions are not search results. They are logged from version history with `Log this version`. The button uses the selected Nutrition date, so a past date says `Add to Sep 20` rather than Today. The same date rules as other nutrition logs apply.

## 41.4 Backup

`nutrition_entries` remains a portable table and now references `recipe_versions`. Restore inserts foods, recipe identity, versions, and ingredient lines before entries. Older entries restore with the recipe columns null. A recipe-derived entry restores its version id, portion, fraction, name, description, nutrition, date, and source.

## 41.5 Deferred

C4 in-builder ingredient creation is section 42. There is no batch inventory. `/demo` does not log recipes.

# 42. Post-v1 — V2-C4 In-builder ingredient creation

A recipe draft stays in the builder while an ingredient is selected or created. The draft holds the name, notes, yield, finished weight, and ingredient lines. Opening, cancelling, or failing a food flow does not discard it. Saving the food does not save the recipe. The builder returns the saved or reused `nutrition_foods.id` and adds that line. Refresh warns through the browser before an unsaved draft is dropped. There is no recipe draft table.

Every committed ingredient still references `nutrition_foods.id`. USDA, Open Food Facts, a nutrition label, and an AI description are candidates until the owner reviews them and they are saved as reusable foods. Search alone does not create a food.

My Foods search selects an existing food. USDA search uses FoodData Central portions that include a gram weight. The saved food is `source_kind = 'usda'`. Its FDC id and reviewed serving are a `source_record_links` row for entity type `nutrition_food`, source `usda_fooddata_central`: `external_id` is the FDC id, and `external_fingerprint` includes that id plus the serving amount, unit, and gram weight. The same source, FDC id, and serving reuses the food. A different serving of the same FDC food may be another food. A different FDC id stays a different food. `notes` and `brand` are not the identity. Barcode lookup reuses a local food. A new product is reviewed and saved with `log: false`. Nutrition label capture uses the existing capture jobs. Inside a recipe, the action is `Save & add to recipe` and it does not create a nutrition entry. Manual entry uses the same reusable-food validation. AI description is a separate reusable-food intent: one food, then review. A description that looks like a composite meal asks the owner to add ingredients or explicitly save one food. It does not build recipe lines by itself. The saved food is `description_ai`, not a photo source. Bounded provenance on the source link records provider, model, `inputKind = description`, the original description, the original estimate, the reviewed values, and whether the owner adjusted them. The estimate uses the existing description endpoint and its Gemini budget. Ordinary Food Description still writes a consumption entry. Meal Photo stays `meal_photo_ai`. USDA lookup outside the builder does not save a catalog food.

Recipe preview and commit still reload canonical foods, calculate, and fingerprint. A food created during an edit is part of the next version only after the owner saves that version. Earlier versions stay unchanged. A later correction of the food follows the existing food correction rules.

`nutrition_foods.source_kind` allows `usda` and `description_ai`. Nutrition entry sources are unchanged. USDA foods are excluded from the name/brand uniqueness index so two reviewed servings of one FDC food can both exist without using brand as a key. No new backup table was added. The full archive already includes `source_record_links`, so a USDA food and its FDC id, fingerprint, and food UUID restore together. The portable owner export projects that same identity onto the food row as `external_provenance`: provider `usda_fooddata_central`, the FDC id, and the serving fingerprint. It does not export the seeded source UUID. Notes and brand stay human attributes. The reviewed serving remains on the food row. Recipe versions are not recalculated when provenance is corrected. Owner authentication still guards the new food endpoints. `/demo/nutrition/recipes` stays unavailable. Package version stays 1.0.0. Schema head is `0027_nutrition_food_ai_source.sql`.

## 42.1 Deferred

Nested recipes, batch inventory, fiber, and meal-photo ingredient capture are not part of C4. V2-C Recipes / Batch Meals is complete. Later product work is not marked implemented.

# 43. Post-v1 — V2-D1 First-Class Goals

A Goal is owner intent. It names the metric being pursued, how success is expressed, when the owner says it began, which target revision is current, and whether the goal is active, paused, or completed. It is not an observation, so it does not appear on the Health Timeline and it does not add a reminder to Today.

`goals` holds identity. `goal_versions` holds targets. Creating a goal writes both in one transaction: status `active` and version 1 current. Changing the target, range, target date, evaluation window, or notes inserts version N+1 and demotes the previous current version. Exactly one version is current. The revision request names `sourceVersionId`. If that version is no longer current, the write returns 409 `stale_version` and does not create another version. Historical version fields are not patched. Pause, resume, complete, and reopen update lifecycle timestamps only. They do not create a version. Reopening clears `completed_at`. Pausing sets `paused_at`. Resuming clears it. Completing from paused clears `paused_at` because D1 stores the current state, not a history of pause intervals.

`started_on` is a Health calendar date in America/Phoenix. It may be today or earlier. It is not a time of day. An optional `target_date` must be on or after `started_on` at creation. A later revision may set a target date of today or later, or clear it. A target date is not a reminder.

The owner chooses `at_least`, `at_most`, or `range`. The current observation does not infer the direction. `at_least` stores `target_min` only. `at_most` stores `target_max` only. `range` stores both, with the minimum less than or equal to the maximum. Values must be greater than zero. Adherence cannot exceed 100.

Supported kinds are `body_metric`, `strength_e1rm`, `benchmark_result`, `training_frequency`, `activity_steps`, `nutrition_protein`, `sleep_duration`, and `supplement_adherence`. Broader nutrition consistency, sleep consistency, and general activity goals stay unsupported until each has a deterministic evaluator. Exactly one selector shape is allowed:

- Body metric: `body_metric_key` from the existing manual body vocabulary. Weight uses `lb`, circumference uses `in`, and body fat uses `%`. Observations stored in kilograms or centimeters are converted with the existing body unit helpers. The goal does not invent a second conversion system.
- Strength e1RM: `exercise_definition_id`. The unit is `lb`. The current estimate is read from the existing strength history. It is not stored on the goal.
- Benchmark result: `benchmark_definition_id`, `benchmark_protocol_version_id`, and `benchmark_requirement_id`. The requirement must be a primary or secondary outcome that the existing result evaluator can score. The unit comes from that outcome. A client unit cannot replace it. A newer protocol version is not substituted later.
- Training frequency: at least N canonical programmed, ad-hoc, or experiment sessions in a fixed 7-day window. The unit is `sessions/week`. Apple Activity workouts are not training sessions. Zero sessions is a real count.
- Activity steps: average canonical step count across observed completed days. The unit is `steps/day`. The window is 7, 14, or 30 days, default 7. Today may be shown as provisional steps so far. It is not part of the closed average. A day with no summary is not zero.
- Protein: average daily protein on logged days with a known total. The unit is `g/day`. The window is 7, 14, or 30 days, default 7. A missing nutrition day is not a zero-protein day.
- Sleep duration: average `total_sleep_minutes` on analysis-eligible nights. The unit is `min/night`. The window is 7, 14, or 30 days, default 7. A partial observation stays evidence and is excluded from the average.
- Supplement adherence: `supplement_id`. The unit is `%`. The window is 7, 30, or 90 days, default 30. The ratio is taken divided by taken plus skipped. Unknown stays unknown. A day with nothing resolved has no current percent.

Point metrics leave `evaluation_window_days` null. Aggregation windows belong to the version because changing the window changes what the target means. The selector cannot be edited. A different metric is a new goal. Several goals may exist at once, including two for the same selector. The create response can warn that another active goal uses that selector. It does not merge them.

Current evidence is derived when the goal is read. It is not copied into the goal. If none exists, the current value is null and the page says no observation yet. A goal may be created before any observation exists. Crossing the target does not set status to completed. The owner completes it.

There is no normal delete. Archiving an exercise, benchmark, or supplement leaves the goal readable and says the underlying record is archived or discontinued. Goal references do not cascade-delete those records. The source is the existing manual data source. There is no AI goal endpoint.

`/goals` and `/goals/:goalId` are private routes. They are linked from Settings and Progress. They are not a sixth primary navigation item. `/demo/goals` is not a route. Owner APIs require the owner session. Anonymous requests are 401, another signed-in user is 403, and the wrong method is 405. The Apple ingest token has no goal authority.

Backup and portable export include `goals` and `goal_versions`. Restore writes them after the selector tables they reference. Portable rows add `selector_label` and `source_key` so a goal can be read without only a UUID. The full archive does not add those fields, and portable export is still not a restore path.

Package version stays 1.0.0. Schema head is `0028_goals.sql`. Deterministic projections are section 44. Goal status and reminders are section 45.

# 44. Post-v1 — V2-D2 Deterministic Goal Projections

A projection is derived. It is not a canonical health fact, a Goal Version, or a backup row. Every response carries `calculationVersion` `goal-projection-v1`. That name is the algorithm version, not Goal v1.

Only active `body_metric` and `strength_e1rm` goals are projected. Benchmark, training frequency, steps, protein, sleep, and supplement adherence return `not_applicable`. Paused and completed goals return `not_applicable_lifecycle`. The calculation always uses the current Goal Version. Historical versions do not receive a fresh ETA.

The slope is the existing Theil–Sen median of pairwise daily slopes. Same-day pairs are excluded. The 25th and 75th percentiles of those slopes, using Hyndman–Fan type 7 interpolation, are slope dispersion. They are not a confidence interval. An available projection requires the central slope and both percentiles to move toward the owner-chosen boundary. A flat or opposite central slope is `trend_not_toward_target`. Dispersion that crosses zero or reverses is `unstable_trend`. There is no ETA in either case.

The anchor is the same current canonical value D1 displays, converted into the goal unit with the existing body helpers. The regression intercept is not the current value. Crossing days are `(boundary - current) / slope`. The displayed date is `asOf` plus `ceil` of that day count, as an America/Phoenix calendar date, with no hour. The three directional slopes become a window. The dates are sorted. The central slope's date is the central estimate.

Body evidence is the trailing 90 days, prepared with the same one-observation-per-calendar-date rule as Body Progress, and still requires at least 5 measurements spanning 14 days. Strength evidence is the trailing 180 days of canonical e1RM appearances: one high-confidence point per exercise appearance, at least 6 appearances spanning 28 days. Sets above 15 reps, 13–15-rep estimates, timed carries, and Apple Activity workouts stay out, matching Progress. The recent-three versus prior-three strength trend is unchanged.

The horizon is `min(365, max(90, evidenceSpanDays * 4))`. The central crossing and both dispersion crossings must fall inside it. A central crossing past the horizon is `beyond_projection_horizon`. A central crossing inside the horizon whose dispersion runs past it is `unstable_trend`. If the current value already meets `at_least`, `at_most`, or the range, the state is `target_currently_satisfied` and there is no future date. A range projects to the near edge, not the midpoint.

`target_date` is returned with the projection and does not change the slope or the dates. The projection does not say on track or off track, does not complete or revise the goal, and does not call a model. `GET /api/goals/:id/projection` accepts an optional `asOf` on or before today. Goal detail shows the window, the central estimate, the weekly trend, and the evidence count. Aggregate goals say projection is not applicable. Paused and completed goals omit it. `/demo/goals` stays unavailable. D2 does not add Today reminders. Section 45 does. Nothing is written to backup.

Package version stays 1.0.0. Schema head stays `0028_goals.sql`. Goal status is section 45. The projection itself still does not say on track or off track.

# 45. Post-v1 — V2-D3 Goal-Aware Status + Reminders

Status is derived on read. It is not a Goal Version, a stored row, or a backup snapshot. The calculation version is `goal-status-v1`. That name is separate from `goal-projection-v1` and from Goal v1, v2, or v3. There is no migration. Schema head stays `0028_goals.sql`.

Three facts stay separate. `targetState` is how the current D1 evidence sits against the current target: `satisfied`, `below_target`, `above_target`, `outside_range_low`, `outside_range_high`, or `unknown`. Missing evidence is `unknown`. It is not zero, below target, or failed unless zero is an actual canonical observation. Equality meets the target. A satisfied target does not complete the goal. The owner still marks it complete.

`deadlineState` compares the optional America/Phoenix target date with today and, when D2 returns an available window, with that whole window. No target date is `none`. A past date is `passed_satisfied` or `passed_unmet`. Today with an unmet target is `due_today`. A future date without an available window is `future_no_projection`. The entire window on or before the date is `projected_before_deadline`. The entire window after the date is `projected_after_deadline`. A date inside the window is `projected_overlaps_deadline`. The central estimate does not decide that comparison.

On track means only that the goal is active, the target is not already met, the date is in the future, D2 is available, and `estimatedWindowEnd` is on or before the target date. It does not mean healthy, good, or recommended. Off track means only that the available window starts after the target date. A noisy trend, missing evidence, an unavailable projection, or a current value below target is not off track. Overlap is timing uncertainty. Aggregate goals use current-window language, such as “Current window below target,” and never on track or off track, because a rolling window is not a crossing forecast.

Passed and due-today copy stays factual. A passed unmet date says the target date passed and the current target is not met. It does not say the owner failed, and it does not invent whether the target was met on the historical date. A goal due today is not described as already impossible.

Reminders are in-app Today state. There is no push, email, SMS, cron, or notification preference. A goal may add context to an action that already exists. It does not invent a cadence. A body reminder appears only when the A2 cadence for that exact metric is due, stale, or initially due. No cadence means no overdue claim. The existing Today body item is annotated, “Supports your … goal,” and is not repeated. A benchmark reminder uses the protocol version pinned on the goal, and only when that exact version’s B3 state is `due`. `available` is not due. Strength goals have no measurement cadence. Training, steps, protein, and sleep goals do not generate coaching such as train today, walk more, eat more protein, or go to bed earlier. A supplement goal does not add a second checklist row. Its denominator stays taken divided by taken plus skipped.

Deadline attention is allowed because the date is owner intent. Unmet passed dates and unmet dates that are today can appear. A date 1 through 7 calendar days away is `deadline_soon`. Eight days is not. A projectable goal in that window enters Needs Attention only when the projection is after the date, overlaps it, is unavailable, or current evidence is unknown. A window entirely before the date does not create a soon item. Aggregate and other non-projectable goals can show a factual soon item when the target is unmet. A satisfied target suppresses soon and today reminders. If a cadence or retest action already exists, that action replaces the generic soon item.

Today computes this on the server inside `GET /api/today`. Pending capture and transcription review stays ahead of goal items. Goal-derived attention is capped at two items, ordered by passed date, date today, measurement or retest due, then soon, then earlier target date, older due date, and goal id. Dedupe keys are `body_metric_due:<metric>`, `benchmark_retest_due:<benchmark>/<protocol>`, and `goal_deadline:<goalId>`. The domain item stays primary. A deadline item links to the goal and does not mutate it. Paused and completed goals drop goal annotation and deadline items. An independent body cadence or lab retest remains. There is no card per active goal.

Goal list cards show the compact target and deadline labels. Paused and completed cards show that lifecycle instead of a live on-track badge. Goal detail includes the status section and reuses the D2 projection. `GET /api/goals` and `GET /api/goals/:id` carry the derived status. The projection route remains. No new mutation route exists. `/demo/goals` stays unavailable, and demo Today does not call owner goal APIs. Owner auth is unchanged. Nothing here calls a model.

Package version stays 1.0.0. V2-D Goals + Projections is complete.

# 46. Post-v1 — V2-E1 Rich Sleep Night Detail

Night Detail is a read of one stored `sleep_nightly_summaries` row for an America/Phoenix `sleep_date`. The route is `/progress/sleep/:sleepDate`. The owner API is `GET /api/progress/sleep/:sleepDate`. E1 adds no migration and no mutation. The calculation version already stored on the night, `sleep-night-v1`, is shown only in an Evidence section. Overnight samples, when a metric is enabled, are section 48.

The nightly row decides the selected logical source, episode start and end, actual sleep, in-bed and awake minutes, stage totals, observation status, analysis eligibility, stage-analysis eligibility, and selection reason. The detail read does not recompute those facts from `sleep_intervals` and does not rerun source arbitration. A night is the Phoenix date on which the selected episode ends. An episode that starts late on Sep 22 and ends on the morning of Sep 23 is the Sep 23 night.

The observing source is the stored logical source name: Apple Watch, Circular, Sleep Cycle, iPhone, or Unknown source. Health Auto Export and Apple Health XML are transport. Transport is shown only as “Received through …” when that name differs from the observing source. The primary duration is total actual sleep, formatted by the existing duration formatter. The episode span is not labeled sleep. Null time in bed and null awake stay unavailable. An explicit stored zero may be shown. Missing values are not serialized as zero.

`analysis_eligible` means the night is included in Sleep averages and trends. The 240-minute gate is completeness, not a health recommendation. `partial_observation` shows the real observed sleep and says it is excluded from those averages. `in_bed_only` says no actual-sleep intervals were observed and may show in-bed evidence. It does not say the owner slept zero hours.

Stage labels stay Awake, REM, Core, Deep, and Unspecified sleep. Unspecified sleep is not folded into Core. Stage percentages for REM, Core, and Deep use total actual sleep as the denominator and appear only when `stage_analysis_eligible` is true: analysis eligible, specific-stage coverage at least 90 percent, and exclusive-stage conflict minutes equal to zero. Awake is not part of that denominator. Percentages are not stored. Below that coverage, observed stage minutes may remain visible and percentages stay hidden. Conflict minutes above zero hide percentages and say the stage intervals conflict. Coverage is data quality, not sleep quality.

A stage timeline is not drawn. The existing engine unions intervals for totals and measures exclusive overlap. It does not produce one non-overlapping display timeline, and Night Detail does not add a second stage-arbitration path. `stageTimeline` is null.

Selection reasons stay the stored values: `source_priority`, `completeness_override`, `partial_only`, and `in_bed_only`. The page states the reason in plain language. Competing sources appear only when the stored evidence already lists them. Rank, ratio, and threshold stay out of the primary view.

Today’s Sleep card links to the canonical night it is showing, including a latest complete night on that night’s own date. Progress Sleep rows and chart points open that `sleep_date`. Timeline sleep events open the same route. Previous and next move among stored nightly rows. A missing date is not found. A future date is rejected. A night that ends today is a real night once it is materialized.

The public demo route is `/demo/progress/sleep/:sleepDate`. It uses compiled fictional fixtures only. It does not call owner APIs, the database, or Health Auto Export. The demo does not invent heart rate, HRV, respiratory rate, SpO2, or temperature values, and it has no sleep, recovery, or readiness score. Longitudinal stage composition is section 47. Overnight vital samples are section 48. No metric is enabled.

Package version stays 1.0.0.

# 47. Post-v1 — V2-E2 Sleep Stage Analytics

Stage analytics are derived on read from `sleep_nightly_summaries`. The calculation version is `sleep-stage-analytics-v1`. That name is separate from `sleep-night-v1`. There is no stage-analytics migration, cache, or backup table. The schema head after E2 was `0028_goals.sql`. The same Progress Sleep response carries the stage summary. Progress ranges and `asOf` stay the existing ones. A canonical night whose `sleep_date` is today is included once it exists. Activity’s provisional current day does not apply.

Only nights with stored `stage_analysis_eligible` enter composition, the nightly stage chart, and source counts. The analytics do not recompute coverage, conflict, or source arbitration. Partial nights, in-bed-only nights, low-coverage nights, and conflict nights stay out of composition and still count in the coverage report. Stage-qualified nights divided by analysis-eligible nights is the stage-detail ratio. Calendar coverage for ordinary Sleep duration stays a separate figure. The duration average still uses every analysis-eligible night. It does not shrink to the stage-qualified subset.

A period composition requires at least three stage-qualified nights. One or two nights stay visible as individual evidence and do not become a period summary. Composition is pooled: each stage’s minutes summed across those nights, divided by summed actual sleep, for REM, Core, Deep, and Unspecified. The four shares describe the observed sleep. REM, Core, and Deep are not rescaled to hide Unspecified. Awake is not in that denominator. Average stage minutes use the same qualified nights. An explicit stored zero participates. A null stage minute is missing and is not treated as zero. The nightly chart plots only qualified nights. Dates without a night, and nights without stage qualification, are gaps. Nothing is forward-filled or interpolated. Each point keeps its selected logical source and opens that night’s detail.

The range shows how many qualified nights came from each logical source. More than one source is labeled as mixed sleep sources. That is evidence context. E2 does not fit a long-term stage slope and does not implement the broader source-attribution work reserved for E5.

Recent comparison is the latest seven Phoenix dates through `asOf` against the seven dates before that. Each window needs at least four stage-qualified nights, and every qualified night in both windows must share one logical source. Mixed sources or a source change produce no stage delta. When the comparison is available, the change is current pooled percent minus previous pooled percent, in percentage points, plus the change in average minutes per qualified night. Higher and lower describe the direction. They do not mean better or worse.

There is no stage score, provider score, reference range, or medical reading. Compare, cross-domain intelligence, Sleep Goals, and Today stay on their existing Sleep rules. Today remains a compact duration card. Night Detail can link back to the stage section. The demo Sleep page uses the same derived summary on fictional nights, including a fixed bedside-sensor mix, and does not call an owner API. Overnight vital samples are section 48. No metric is enabled. Personal baselines are section 49.

Package version stays 1.0.0. Source attribution is section 50.

# 48. Post-v1 — V2-E3 Overnight Vital Samples

E3 stores timestamped physiological observations that can be associated with a canonical Sleep episode. The table is `sleep_vital_samples` in `0029_sleep_vital_samples.sql`. Schema head is `0029_sleep_vital_samples.sql`. Package version stays 1.0.0. There is no nightly median table and no owner column. A sample's identity is the metric, the canonical value and unit, the observation instant, and the logical source. The night it belongs to is derived: `episode_start <= observed_at < episode_end` on the selected Sleep episode. A calendar date is not the join. If the selected episode bounds change, Night Detail recomputes and the sample rows stay as stored.

The calculation version for a displayed group is `sleep-vital-observation-v1`. That name is separate from `sleep-night-v1` and `sleep-stage-analytics-v1`. The displayed statistic is the median of the samples in one episode for one metric and one logical source. The sample count is shown. Sources are never averaged together. An explicit zero stays zero. A missing metric is omitted. It is not shown as zero. A partial night can show the readings and says they were observed during a partial Sleep observation. An in-bed-only night does not present those samples as overnight sleep vitals. The raw rows can remain. Activity `resting_heart_rate_bpm` is not overnight heart rate.

Candidate keys are `heart_rate`, `hrv_sdnn`, `respiratory_rate`, `oxygen_saturation`, and `sleeping_wrist_temperature`. Arbitrary keys are rejected. None of those keys is enabled.

The capability audit inspected the Health Auto Export parser, the JSON fixtures in the test suite, the Activity and Sleep automation notes, and the Apple Health quantity map. No captured unaggregated vital export is in the repository.

| Candidate | Inbound name seen | Payload | Unit | Timestamp | Source | Enabled |
| --- | --- | --- | --- | --- | --- | --- |
| Heart rate | `heart_rate` | Synthetic daily fixture only | `bpm` on that fixture | `date` at midnight, the day-summary shape | Absent | No |
| HRV (SDNN) | None | Not observed | Unknown | Unknown | Unknown | No |
| Respiratory rate | None | Not observed | Unknown | Unknown | Unknown | No |
| Oxygen saturation | None | Not observed | Unknown | Unknown | Unknown | No |
| Wrist temperature | None | Not observed | Unknown | Unknown | Unknown | No |

`resting_heart_rate` remains the Activity day summary. The daily `heart_rate` fixture stays ignored by that parser. A day summary is not an overnight sample. Public Health Auto Export vocabulary includes names such as `heart_rate_variability`, `respiratory_rate`, `blood_oxygen_saturation`, and `apple_sleeping_wrist_temperature`. Those names were not observed in a payload here, so they are not enabled. `heart_rate_variability` does not say SDNN, and this implementation does not relabel it. Wrist temperature is not body temperature and not a deviation from baseline.

When a future payload does enable a metric, an interval with start and end keeps both bounds and uses the start as the observation instant. A point with only a calendar `date` stays a summary and is not stored. An unrecognized unit fails closed. The logical family is Apple Watch, Circular, Sleep Cycle, iPhone, or Unknown source. Health Auto Export is transport. A device string that does not match a known family stays Unknown source. The fingerprint uses the metric, family key, instants, canonical value, and unit. It does not use a device pointer, firmware, or token. Repeating a payload matches that fingerprint. Reconciliation may remove Health Auto Export rows for a metric the payload actually covered, inside that payload's window. It does not delete another metric, an older row outside the window, or a row from another import path. An omitted category does not erase good data.

Night Detail renders Overnight vitals only for enabled metrics that have samples in the episode. The demo does not invent those readings. Personal baselines are section 49. There is no reference range, readiness score, or model call in E3. Stage analytics, Sleep duration, Sleep Goals, Compare, cross-domain intelligence, and Today are unchanged by E3. Today stays a compact duration card.

Backup and portable export include `sleep_vital_samples`. The portable CSV carries the metric, value, unit, timestamps, and logical source family. Derived medians are not exported as extra facts. `npm run` audit of a saved payload is `tsx server/apple-health/vital-audit-cli.ts <payload.json>`. It prints names, units, timestamp-field presence, known source families, and whether the metric is enabled. It does not print quantities, tokens, or raw device strings.

No Sleep Vitals automation is configured. Do not add these metrics to the existing Activity daily automation or the Sleep Analysis automation. A separate unaggregated automation is the intended path after a metric is verified. That setup is not documented here until a real export confirms the Health Auto Export controls.

Source attribution is section 50.

# 49. Post-v1 — V2-E4 Personal Baselines + Deviations

E4 answers how an observed value compares with the owner's recent comparable history. It does not say whether the value is medically normal, and it does not score recovery. There is no migration and no baseline table. Schema head stays `0029_sleep_vital_samples.sql`. Package version stays 1.0.0. The calculation version is `sleep-personal-baseline-v1`, separate from `sleep-night-v1`, `sleep-stage-analytics-v1`, and `sleep-vital-observation-v1`.

The live metric is Sleep duration, because canonical nights already exist. For a target `sleep_date` D, the window is the 30 prior America/Phoenix calendar days, D−30 through D−1. The target night is excluded. A historical night does not use observations dated after it. The center is the shared median. An even count averages the two middle values. Outlying nights stay in the evidence. Fewer than 7 comparable observations returns `insufficient_history` and no deviation. A missing night is not zero minutes.

Duration evidence is an analysis-eligible night with a stored `total_sleep_minutes`, from the same selected logical source as the target night. Apple Watch history is not used to fill a Circular night. An unknown source is not treated as one comparable device. A partial target night has no duration deviation. An in-bed-only night has no actual-sleep value to compare. The deviation is current minutes minus the median. The page says above, below, or matches the recent median. It does not say better, worse, healthy, or optimal, and it does not show a percent.

Progress Sleep shows this for the latest analysis-eligible night on or before the selected date and inside the selected range. Night Detail keeps the observed duration primary and the baseline as secondary context. Sleep Goals keep their own window. Today stays compact. A deviation does not create a Needs Attention item and is not yet evidence in the cross-domain engine.

Future vital baselines are implemented for `heart_rate`, `hrv_sdnn`, `respiratory_rate`, and `sleeping_wrist_temperature`, and they stay dormant while those E3 registry entries are disabled. Oxygen saturation is not a baseline metric. Each vital baseline uses one E3 nightly median per metric and source on an analysis-eligible night, then the median of those nightly values. A dense sample night counts once. Activity resting heart rate cannot satisfy an overnight heart-rate baseline. HRV keeps SDNN wording. A temperature difference is only relative to that personal median. The production allowlist is unchanged, so the product and the public demo show no vital baseline cards.

Nothing in E4 is stored, exported, or backed up as its own fact. The next read recomputes. There is no population range, z-score, anomaly label, readiness score, or model call. Source attribution is section 50.

# 50. Post-v1 — V2-E5 Sleep Source Attribution + Continuity

E5 explains the source decisions Health has already stored. It does not choose a new winner. There is no migration and no source-history table. Schema head stays `0029_sleep_vital_samples.sql`. Package version stays 1.0.0. The calculation version is `sleep-source-attribution-v1`.

The logical observing source stays Apple Watch, Circular, Sleep Cycle, iPhone, Unknown source, or another stored logical family. Transport, such as Health Auto Export, stays separate. A transport change does not create a Sleep source transition. Unknown stays unknown. Volatile device strings do not become a source family. The existing priority order is unchanged and is not described as an accuracy ranking.

Night Detail shows the stored selection reason and only the bounded alternative evidence already kept with the night. A completeness override can show the stored competing durations. It does not rerun the override thresholds. A missing selection reason stays unavailable.

Progress Sleep reports, for the selected range, how many canonical, complete, and stage-qualified nights each selected source contributed. Those counts reconcile with their denominators. A gap with no canonical night is not assigned a source. A transition is the change between consecutive observed canonical nights. The gap between those dates is kept. A run is the first and last observed night of one source, with its observed-night count. It does not mean every date in between had data.

E2 still requires stage-qualified nights, four nights in each window, and one shared source before it compares stages. E4 still requires seven prior analysis-eligible nights from the same source. A source switch can explain why that baseline is unavailable. It does not fill the baseline from the other source. When a vital metric is later enabled, its source stays independent of the selected Sleep source. No vital metric is enabled now, so the product shows no vital-source cards.

There is no source quality score, device ranking, provider score, cross-source calibration, source preference editor, or manual relabel. Today, Needs Attention, Timeline, Goals, and cross-domain intelligence are unchanged. Derived transitions are not backed up or exported. Portable Sleep nights include the canonical logical source key. The demo uses its fictional Wrist tracker and Bedside sensor labels. V2-E Rich Sleep + Overnight Vitals is complete. Ask Health conversational analysis is section 51.

# 51. Post-v1 — V2-F1 Ask Health Conversational Analysis

F1 lets the owner ask a question about Health evidence that is already calculated. There is still no conversation table. Migration `0030_ai_usage.sql` adds the operational `ai_usage` ledger. Schema head is `0030_ai_usage.sql`. Package version stays 1.0.0. The packet version is `ask-health-evidence-v1`. The prompt version is `ask-health-v1`.

The private route is `/ask-health`. It is not a primary navigation tab. Progress and Today link to it. The owner API is `POST /api/ask-health`. The model never receives a database connection, SQL, or credentials. Every turn rebuilds a compact packet from current canonical analytics for an explicit lens (`general`, `training`, `nutrition`, `recovery`, `experiments`), Progress range, and America/Phoenix `asOf`. A question cannot widen that range. Historical `asOf` excludes later observations. Missing values stay missing. Coverage is part of the packet.

Body trends, nutrition logged-day averages, completed-day activity, Sleep eligibility and source continuity, Training sessions, supplement taken/skipped/unknown counts, Goal status and projection state, experiment classifications, valid benchmark results, context tags, and already-accepted cross-domain findings are the evidence. The model does not calculate a new correlation, claim that one observation caused another, diagnose, recommend medication changes, invent a score, or cite literature. Each factual answer block must cite an evidence id that the packet supplied. Unknown citations are rejected. Prior chat turns are context, not evidence, and they are kept only in the browser session, bounded to the latest turns. They are not stored in PostgreSQL, backup, portable export, or `localStorage`.

Ask Health uses the server Gemini client and `AI_ASK_HEALTH_MODEL`, falling back to the nutrition text model. Before an uncached provider call, Health locks the operational ledger, reserves `AI_ASK_HEALTH_MAX_REQUEST_COST_USD` against `AI_MONTHLY_BUDGET_USD`, and commits that reservation before the network call. The billing month is UTC, not America/Phoenix. A completed call counts its calculated token cost, and that cost cannot exceed the reservation. A reservation that is never finalized, or a call whose billing is uncertain, keeps counting the reserved maximum. A failure that happens before Gemini is invoked, including a missing provider configuration, counts nothing. The provider-call rate limit is the existing 1.5 second minimum and 8 calls per minute, counted from `ai_usage` rows and shared by every isolate. There is no separate daily cap. `AI_WARNING_BUDGET_USD` is not a gate. The process-local cache can skip a repeated call inside one isolate. It is not the budget authority. The cache key includes the question, lens, range, `asOf`, packet fingerprint, prompt version, model, and conversation. A changed packet does not reuse an old answer. Only a hash of that key is stored. The ledger does not store the question, conversation, evidence packet, or answer. Nutrition Gemini is not on this ledger yet. If the packet has no substantive evidence, Health returns a deterministic insufficient-evidence response and does not reserve usage or call the provider. The public demo renders compiled fictional answers and does not call Gemini or write `ai_usage`. V2-F2 and later, including experiment suggestions and literature retrieval, are not implemented.

# 52. Post-v1 — V2-F2 Proactive Insights

F2 surfaces a short list of deterministic observations on Progress. There is no migration and no insight table. Schema head stays `0030_ai_usage.sql`. Package version stays 1.0.0. The calculation version is `proactive-insights-v1`.

`GET /api/progress/insights` is owner-only. The handler derives the list from current canonical data and returns at most five cards. It does not reserve `ai_usage`, call Gemini, or write a canonical Health row. Anonymous callers receive 401, another signed-in user receives 403, and a non-GET method receives 405. An ingest token has no authority.

The registry is explicit: already-surfaced cross-domain findings, the accepted Body weight Theil–Sen trend, the accepted six-appearance Strength trend, Sleep duration change, Activity change, Nutrition change, and logged Training-frequency change. React does not decide eligibility. A detector returns an eligible card or no card.

Cross-domain findings come from the existing allowlisted engine. Spearman still requires 20 pairs and the existing rho thresholds. Group comparisons, coverage, and missingness gates are unchanged. Zero findings remains a valid result. F2 does not correlate every metric with every other metric.

Within-domain cards use fixed windows relative to America/Phoenix `asOf`, even when the selected Progress range is longer or shorter. Activity compares the latest 21 completed days with the previous 21. The current provisional Activity day is excluded. A metric needs 14 observed days in each window and an absolute relative change of at least 10 percent, and only the largest qualifying Activity metric is shown. Sleep compares 14 Phoenix dates of analysis-eligible nights with the previous 14. Each window needs 7 nights, both windows must share one known logical source, and the average duration must differ by at least 30 minutes. Nutrition compares logged-day calorie and protein averages across two 14-day windows. Each window needs 7 logged days and at least 50 percent coverage. Calories need a change of at least 150 kcal/day and 10 percent. Protein needs at least 15 g/day and 10 percent. Copy says “on logged days.” Training frequency uses canonical `programmed`, `ad_hoc`, and `experiment` sessions over two 21-day windows and surfaces only when the rate changes by at least 1.0 logged session per week. Apple Activity workouts stay out of that count.

Body reuses `bodyWeightTrend`. The existing gate of 5 observations and 14 days stays. F2 shows weight only, and only when the absolute slope is at least 0.25 lb/week after the existing unit conversion. An active bodyweight Goal can add a View goal link. F2 does not create an on-track card or change Goal status. Strength reuses `estimatedStrengthTrend`. Stable and insufficient trends are not cards. At most one higher or lower exercise is shown, preferring the most recently observed exercise and then the exercise id. Wording says higher or lower.

These cutoffs are product surfacing heuristics. They are not medical, dietary, or training judgments. Cards say what changed or what pattern was observed. They do not say why, and they do not say healthy, unhealthy, good, bad, ideal, or concerning. Evidence gaps are not insight cards. When nothing qualifies, Progress says there is not enough comparable recent evidence.

Ranking is presentation order: cross-domain pattern, then Strength or Body trend, then Sleep, Activity, Nutrition, and Training frequency. Within a tier, a stronger accepted association comes first, then a larger change of the same kind, then more recent evidence, then the stable id. The id is derived from the comparison and `asOf`. It is not a stored identity. Correcting canonical evidence changes the next read. Historical `asOf` cannot see later observations.

Each card shows the values, counts, period, Explore, and Ask Health about this. Explore opens the existing Activity, Sleep, Body, Strength, Nutrition, Training, or Compare page. Ask Health opens `/ask-health` with a lens, range, and suggested question filled in. It does not submit. A later submit builds a fresh `ask-health-evidence-v1` packet. The card is not evidence.

Today and Needs Attention are unchanged. Timeline stays a record of observations. Goals stay under D3. Experiment suggestions stay F4. Weekly Coach stays F3. Literature stays F5. Backup and portable export are unchanged.

The public demo calculates one domain change and one cross-domain pattern from compiled evidence, and it shows the empty sentence when a second calculation qualifies nothing. It does not call Gemini or the owner API.

# 53. Post-v1 — V2-F3 Weekly Coach Brief

F3 summarizes the latest seven completed America/Phoenix dates. For `asOf` D, the week is D−7 through D−1 and the comparison is D−14 through D−8. The day of the request stays out of the summary, including provisional Activity. A sleep night uses `sleep_date`, so a night dated on `asOf` belongs to the next brief. This is a rolling completed week, not a Monday–Sunday calendar week. The page always shows both exact ranges. Historical `asOf` rebuilds that same week and cannot see later evidence.

There is no migration and no weekly brief, coach message, or recommendation table. Schema head stays `0030_ai_usage.sql`. Package version stays 1.0.0. The packet version is `weekly-coach-evidence-v1`. The prompt version is `weekly-coach-v1`. The AI request type is `weekly_coach`.

`buildWeeklyCoachEvidence` is the server and domain packet. React does not assemble the facts. Activity, Sleep, Nutrition, Training, supplements, and Body reuse the accepted range summaries, logged-day nutrition coverage, analysis-eligible sleep nights, canonical Training session types, supplement occurrence states, and the existing Body trend. A generic increase is higher, not automatically better. Missing nutrition days stay missing. Unknown supplement occurrences stay unknown. Apple Activity workouts stay outside Training. Goal status stays the D3 target and deadline states. Lab status stays the B-series retest and experiment-review rules. F2 insights are passed through; F3 does not run a second detector.

At least two of Activity, Sleep, Nutrition, Training, supplements, and Body must be substantive before Gemini may run. Activity needs four observed completed days on one supported metric. Sleep needs four analysis-eligible nights. Nutrition needs four logged days. Training needs one canonical session. Supplements need four scheduled days. Body needs a measurement in the week, or an existing eligible trend that belongs to an active body Goal. Fewer than two substantive domains returns `insufficient_evidence`, shows the coverage that exists, and does not call the provider.

Before any model call, Health builds a bounded candidate inventory. What went well is an owner goal that is satisfied or deterministically on track, a genuine Training performance best, a protein target met on at least 80 percent of logged days with known protein when at least four days are logged, or a benchmark or experiment milestone completed in the week. Worth watching is an F2 insight, a goal that is off track, overlapping its deadline, past and unmet, or without a projection, a factual coverage gap, or a sleep source change that blocks a same-source comparison. Focus is at most one pre-approved action: review a goal whose target date is today or has passed, record a measurement the existing cadence already says is due, complete a benchmark retest that is due, review an experiment result that is ready, resolve a completed workout capture that is still uncommitted, or log nutrition more consistently when the week has fewer than four logged days. The model cannot invent a fourth candidate, a calorie change, a training-volume change, a supplement, an experiment, a diagnosis, a cause, or a citation.

Gemini may order those candidates and add one sentence of commentary. The page renders the numbers from the packet. A candidate reference that is missing or in the wrong section rejects the whole response. The brief then shows the server-ranked facts and says coach wording is unavailable. What went well is capped at three, worth watching at two, and focus at one. If nothing qualifies for focus, that section is omitted.

`GET /api/progress/weekly` loads the deterministic brief and does not reserve `ai_usage` or call Gemini. `POST /api/progress/weekly` is the only generation path. Weekly Coach and Ask Health share `AI_MONTHLY_BUDGET_USD` and the existing provider rate gate. That rate gate counts every non-released `ai_usage` row. It is not split by request type. `AI_WEEKLY_COACH_MAX_REQUEST_COST_USD` defaults to $0.05. `AI_WEEKLY_COACH_MODEL` falls back to the Ask Health model, then the nutrition model. A process-local cache may reuse phrasing for the same packet, prompt, and model. It is not the budget authority. Generated prose is kept in the page session only. It is not written to PostgreSQL, backup, portable export, or `localStorage`. The only operational write is `ai_usage`.

The owner route is `/progress/weekly`. Progress offers it as a secondary card, not a primary tab. Each item links to its canonical screen and can open Ask Health with a question filled in. Ask Health does not submit until the owner does. Today and Needs Attention do not nag for a weekly brief. There is no schedule, push, email, or background model call.

The public demo is `/demo/progress/weekly`. It calculates the fictional week from the same builder and shows a compiled example labeled as not generated live. It does not call Gemini, the owner API, or `ai_usage`. V2-F5 literature retrieval is not implemented.

# 54. Post-v1 — V2-F4 Experiment Suggestions

F4 may suggest an experiment only from a deterministic registry. The calculation version is `experiment-suggestions-v1`. The three families are a benchmark with no valid comparable result, a benchmark retest that B3 reports as `due`, and an active unmet goal whose metric and target Personal Lab can already measure. `available`, `waiting_minimum`, and `unconfigured` do not become retest suggestions. A due suggestion pins the protocol version B3 associated with that retest. A newer protocol version is not substituted. Training frequency, strength e1RM, and benchmark-result goals stay unsupported. F2 patterns are not promoted into experiments. The registry does not suggest starting, stopping, or changing a supplement or medication.

A candidate id and SHA-256 fingerprint are derived. They are not stored until the owner accepts. Listing and opening a suggestion make no Gemini call and no `ai_usage` reservation. `POST /api/lab/experiment-suggestions/:candidateId/draft` is the only generation path. The packet version is `experiment-suggestion-evidence-v1`. The prompt version is `experiment-suggestion-v1`. The request type is `experiment_suggestion`. Gemini may return a title, a rationale, and evidence refs. It cannot change the protocol, the threshold, the unit, or the pinned version. Invalid, budget-blocked, or unavailable wording leaves the deterministic template usable.

`POST /api/lab/experiment-suggestions/:candidateId/accept` rederives the candidate, compares the fingerprint, and creates one Experiment. A mismatch is `409 stale_candidate`. An open fingerprint cannot be accepted twice. The new Experiment starts `accepted`, the same initial status as a manual experiment. Without a draft, `origin_kind` is `deterministic_candidate`. With a draft the owner used, `origin_kind` is `ai_assisted`. Both keep the same `origin_trigger`, fingerprint, and origin evidence. The legacy `origin` column stays for older rows. Existing rows become `owner_created` unless `origin` was already `ai_assisted` or `external_research`.

Personal Lab shows at most three suggestions, ranked due retest, missing baseline, then goal observation. The review screen shows the deterministic question, protocol, window, measurements, evidence, limitations, and linked goal or benchmark. A suggestion may be labeled Challenge. That label is not a separate record. Changing the protocol belongs in the manual experiment form.

Migration `0031_experiment_origins.sql` adds `origin_kind`, `origin_trigger`, `origin_fingerprint`, `origin_evidence`, and `experiment_goals`. Schema head is `0031_experiment_origins.sql`. Package version stays 1.0.0. Unaccepted suggestions are not backed up. Accepted origin fields and goal links are in the full archive and the portable export. The portable row adds an origin label and a trigger label so the export can say an AI-assisted experiment came from a due benchmark retest without depending on a source UUID. The demo at `/demo/lab` is compiled fiction, read-only, and provider-free. V2-F5 literature retrieval is not implemented.

# 55. Post-v1 — V2-F4 Goal suggestions fail closed

Section 54 recorded the first F4 implementation. That text treated an active unmet Goal as a suggestion when a Lab requirement could name the same metric. That was too wide. This correction does not add a migration and does not change B4.

Accepted F4 suggestions are a Benchmark retest that B3 reports as `due`, pinned to that protocol version, and a current Benchmark protocol with no valid comparable result. `goal_observation` stays in the suggestion vocabulary and in `origin_trigger`, and `experiment_goals` stays in the schema. The registry does not emit a Goal candidate.

`targetState = unknown` means the current Goal evidence is missing. Missing evidence is not an unmet target, so it cannot become a suggestion. Body, Activity, Nutrition, and Sleep requirements record observations and coverage. Their result criteria do not evaluate a Goal threshold or range. Supplement adherence can store `minimumAdherencePercent`, but the accepted Experiment does not lock the Goal `evaluationWindowDays` into its schedule. A linked goal row or a sentence in the question does not make the stored result mean the Goal target. Until Personal Lab can evaluate that complete target and window, every current Goal kind fails closed.

Schema head stays `0031_experiment_origins.sql`. Package version stays 1.0.0. Benchmark suggestion, fingerprint, stale acceptance, and Gemini wording behavior are unchanged. V2-F5 literature retrieval is not implemented.

# 56. Post-v1 — V2-F5 Literature-Backed Evidence Drawer

Ask Health still explains the owner's bounded personal evidence. External research is a separate view the owner opens and searches. Asking a Health question does not query Europe PMC and does not reserve `literature_synthesis`.

The owner sees and can edit the exact outbound query. Europe PMC receives that query plus the fixed filters `SRC:MED` and `HAS_ABSTRACT:Y`. It does not receive the Ask Health packet, notes, conversation, Goals, Experiments, supplements, or the generated answer. The server calls `https://www.ebi.ac.uk/europepmc/webservices/rest/search` with `format=json`, `resultType=core`, and a page size of 8. The browser does not call Europe PMC. At most five PubMed-indexed records with a PMID, title, and abstract are kept, in provider order, deduped by PMID and then by DOI. Source refs are `pubmed:<PMID>`. Study type is a descriptive label from publication-type metadata, with meta-analysis preferred over a broader review label. It is not a quality score.

Raw abstracts stay on the server for synthesis and are bounded to 3000 characters each and 18000 characters for the packet. They are not shown in the UI, stored, or exported. Gemini may paraphrase only those retrieved sources under prompt `literature-synthesis-v1`. Every block must cite a retrieved ref. Digits in model prose are rejected. Invalid, budget-blocked, rate-limited, unconfigured, or timed-out synthesis still shows the source cards. Zero valid sources means zero Gemini call. Synthesis shares `ai_usage`, `AI_MONTHLY_BUDGET_USD`, and the global rate gate. The Europe PMC request itself is not a Gemini call.

Personal evidence markers stay numbered. External sources use `[R1]`, `[R2]`, and so on. The product limitation says this is a targeted search, not a systematic review, and that it does not establish what applies personally. Literature does not create an Experiment, Goal, insight, coach brief, or Timeline row. `external_research` remains unused origin vocabulary. The demo drawer uses two verified PubMed records and does not call a provider.

Schema head stays `0031_experiment_origins.sql`. Package version stays 1.0.0. V2-F1 through V2-F5 are implemented. Goal-observation experiment suggestions remain deferred.






