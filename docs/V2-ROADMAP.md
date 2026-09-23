# V2 roadmap

These are post-v1 ideas, not promises. They are recorded so owner-accepted
deferred workflows are not lost. None of this is implemented in v1.

## Priority order

### 1. Recipes / batch meals

Highest-priority v2 Nutrition feature. A first-class recipe/meal model:

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

This deserves its own architecture. Do not start recipe tables or UI during v1.

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

First-class goals such as:

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

Use deterministic evidence-engine outputs. Gemini may explain computed
findings. No unsupported causality.

### 5. Theme packs / personalization

Beyond Light / Dark, potential palettes such as Classic, Forest, Ocean,
Sunset, and Plum. Keep semantic tokens and accessibility.

### 6. Motion / micro-interactions

More polished transitions once core functionality is stable.

### 7. Cross-domain intelligence UI

The Phase 11 engine already exists. Surface findings as real owner data
becomes sufficient.

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
