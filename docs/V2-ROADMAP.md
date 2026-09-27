# V2 roadmap

Current completion status and implementation order live in `HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md`. The schema head is `0030_ai_usage.sql`.

Implemented: V2-A Data Capture Foundations, V2-B Personal Lab Core, V2-C Recipes / Batch Meals, V2-D Goals + Projections, V2-E Rich Sleep + Overnight Vitals, V2-F1 Ask Health, V2-F2 Proactive Insights, and V2-F3 Weekly Coach Brief. Overnight vital metrics stay disabled until a payload is verified. V2-F4 and later are not implemented.

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

Ask Health (V2-F1) explains deterministic evidence. Proactive Insights (V2-F2) surface accepted cross-domain findings. Gemini still may not invent causality. Experiment suggestions and literature retrieval are V2-F4 and V2-F5, and they are not implemented.

### 5. Theme packs / personalization

Beyond Light / Dark, potential palettes such as Classic, Forest, Ocean,
Sunset, and Plum. Keep semantic tokens and accessibility.

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

Current state: historical Apple workout objects exist in `activity_workouts`
from Apple Health history, while ongoing HAE Activity synchronization currently
focuses on daily Activity summaries.

V2 should evaluate ongoing HAE / HealthKit workout-object ingestion for:

- walking
- running
- hiking
- cycling
- yoga
- other Apple Watch workout categories

Potential Today presentation under Activity, not Training:

- 7,400 steps so far
- Walk · 42 min
- Hike · 1h 13m

Training remains a separate structured domain. Timeline should continue
treating these as Activity events. Apple Watch / HealthKit workouts must not
become canonical Training sets, volume, performance, PRs, or consistency.

### 9. Shortcut / share-sheet ingestion

Frictionless mobile capture/import where technically possible.

### 10. Richer meal estimation

Potential:

- multi-angle photo support
- recipe assistance
- richer contextual estimation
