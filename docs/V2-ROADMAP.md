# V2 roadmap

Current completion status and implementation order live in `HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md`. The schema head is `0032_body_capture_inbox.sql`.

Implemented: V2-A Data Capture Foundations, V2-B Personal Lab Core, V2-C Recipes / Batch Meals, V2-D Goals + Projections, V2-E Rich Sleep + Overnight Vitals, V2-F1 Ask Health, V2-F2 Proactive Insights, V2-F3 Weekly Coach Brief, V2-F4 Experiment Suggestions for due Benchmark retests and missing Benchmark baselines, V2-F5 Literature-Backed Evidence Drawer, V2-G1 ongoing Apple workout ingestion, V2-G2 Body Inbox and Shortcut capture, V2-G3 Theme Packs and Appearance, and V2-G4 Nutrition Gemini durable cost safety. Goal-observation suggestions are deferred. Overnight vital metrics stay disabled until a payload is verified. V2-F is complete. Native share-sheet targeting is deferred. Motion and micro-interactions remain deferred. The schema head is `0032_body_capture_inbox.sql`.

This file began as a post-v1 idea list. It was not part of frozen v1. The numbered sections below keep that older backlog. Sections the blueprint now marks implemented say so. The remaining sections are still ideas, not promises. External retest notifications remain deferred. Nested recipes, batch inventory, and recipe fiber remain deferred.

## Priority order

### 1. Recipes / batch meals

Implemented as V2-C. The original scope was a first-class recipe/meal model:

- named recipe
- reusable ingredients
- ingredients sourced from saved foods
- USDA lookup
- manual foods
- barcode / label foods
- AI-assisted ingredient creation where useful
- whole-recipe nutrition
- yield / servings
- logging a fraction such as 1/6
- logging servings
- potentially logging by finished weight
- historical consumed snapshots independent of future recipe edits

Nested recipes, batch inventory, and fiber were not part of that completed slice.

### 2. Body ingestion / Health Inbox

Make Body intake substantially easier, especially from a phone.

Explore:

- quicker manual entry
- file / share / Shortcut workflows
- Health Inbox
- supported device sources
- reduced Save-to-Files friction

Do not replace the verified XLSX import unless the new workflow is better.

### 3. Goals + deterministic projections

Implemented as V2-D. The original scope was first-class goals such as:

- bodyweight
- circumference
- strength target
- workout frequency
- activity
- Nutrition consistency

Projection architecture:

canonical observations → deterministic trend/projection → uncertainty/evidence → optional AI explanation.

AI must not invent the projection.

### 4. Goal-aware / cross-domain explanations

Ask Health (V2-F1) explains deterministic evidence. Proactive Insights (V2-F2) surface accepted cross-domain findings. Gemini still may not invent causality. Experiment suggestions (V2-F4) are implemented. Literature retrieval (V2-F5) is an explicit Europe PMC search and is not stored.

### 5. Theme packs / personalization

Implemented as V2-G3. System, Light, and Dark stay independent of Classic, Forest, Ocean, Sunset, and Plum. Palettes change accent chrome. Danger, warning, and success stay semantic. Preferences stay in the browser.

### 6. Motion / micro-interactions

More polished transitions once core functionality is stable.

### 7. Cross-domain intelligence UI

Implemented as V2-F2 Proactive Insights. The Phase 11 engine remains the calculation. Insight cards are derived on read.

### 8. Additional health sources / metrics

Potential:

- more Apple Health metrics
- richer sleep sources
- Oura / Circular evaluation
- other justified sources

#### Ongoing Apple workout ingestion

Implemented as V2-G1. Historical Apple workout objects and ongoing Health Auto Export JSON v2 `data.workouts` both live in `activity_workouts`. The same endpoint and write-only bearer token accept a separate Workouts automation. Accepted summary fields are id, name, start, end, duration, and optional active energy, distance, location, and indoor flag. Route geometry and nested workout metrics are not stored. A provider id is idempotent. An exact start, end, and formatted activity identity can attach Health Auto Export provenance to an existing archive row. Today can show a few current-day lines under Activity, such as Walking · 42 min. Timeline keeps one Activity event per canonical row.

Training remains a separate structured domain. Apple Watch / HealthKit workouts must not become canonical Training sets, volume, performance, PRs, or consistency.

### 9. Shortcut / share-sheet ingestion

Frictionless mobile capture/import where technically possible.

### 10. Richer meal estimation

Potential:

- multi-angle photo support
- recipe assistance
- richer contextual estimation
