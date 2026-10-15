# PIQ deterministic decision goldens — baseline registry

> Development-only, fully synthetic cases. Companion executable: `tests/piq0-golden-coach-decisions.test.ts`.
> Implemented on `piq/00-baseline-20261014`. No Gemini calls, private health records, migrations, production owner data, or runtime mutations.

## What the harness evaluates

Every case constructs a 28-completed-day, America/Phoenix-local synthetic history with explicit provenance, full-day confirmations, recorded weight, daily wellness, owner context, active goal direction, profile-screen result, training/goal conflict evidence, experiments, target/revision settings, and optionally an upstream weekly-focus candidate. It passes the exact same evidence through:

`buildHealthIntelligenceSnapshot` → `buildMaintenanceState` → `buildGoalControlState` → `buildCoachRecommendationDrafts` → `keepVisibleCoachDependencies`.

A golden passes only when the estimated-data availability, plateau state (when specified), independent calorie-action safety, seven-day Nutrition confirmation floor, main Goal Control action (when specified), final Coach card kinds, required reason, and no orphan calorie/activity alternative all agree. These are **decision-output assertions**, not generated prose snapshots, diagnoses, or evidence of a live mobile pass. Passing a fixture does not authorize lowering an owner's intake. No target edits occur.

## Golden scenario inventory

| ID | Contradiction or signal | Expected decision behavior |
|---|---|---|
| G01 | Flat multiweek weight, 28 confirmed days, normal recovery, coherent target | At most an **optional manual** calorie review; dependent activity choice only beside its parent |
| G02 | High-quality food entry per day but no owner-confirmed complete day | Withhold empirical estimate/numeric cut |
| G03 | Many confirmed prior days but only 3 confirmed recent days | May report estimate/plateau, but no new Coach calorie action |
| G04 | Owner says plateau, but comparable weight actually falling | Follow the observed trend, never cut to “fix” a nonexistent stall |
| G05 | Explicit maintenance-weight phase | Keep course, no loss-specific calorie cut |
| G06 | Repeated low energy | Recovery review, not a cut |
| G07 | Repeated high hunger | Recovery review, not a cut |
| G08 | Poor sleep opportunity recorded | Treat as context, not proven cause; avoid a new cut |
| G09 | Declining comparable Bench Press strength | Training/recovery conflict blocks cut |
| G10 | Running experiment | Avoid a confounding nutrition intervention |
| G11 | New target still above already-reported intake | Review behavior/target coherence before a numerical cut |
| G12 | New target below empirical maintenance uncertainty range | Withhold cut despite passing generic floor |
| G13 | Age/height missing | Physiology unknown, no numeric cut |
| G14 | Owner reports active/unknown clinical condition | Individualized review, no numeric cut |
| G15 | Low body mass relative to height | Individualized review, no numeric cut |
| G16 | Goal/target/experiment revision changed during reads | Withhold stale-calorie action |
| G17 | A stale weekly packet gives unsafe numeric cut top priority | Current Maintenance vetoes weekly candidate at Goal Control and Coach |
| G18 | A stale weekly packet promotes an “Or increase activity” option | Never present an orphan primary alternative |
| G19 | An anomalous food log exists only on provisional today | Exclude it from the completed-day estimate |
| G20 | No recent recovery check-ins | Unknown is not well; do not assume safety |
| G21 | Urgent unmet strength goal conflicts with further restriction | Review competing goal, no numeric cut |
| G22 | Source full-day verification read fails | Don't misrepresent unavailable verification as user refusal or eligibility |

The fixtures are intentionally **non-identifying**. Their adult ages, heights, weights, calories, source IDs, symptom ratings and dates are artificial; none represents the owner's private health record.

## Evaluation rubric and scope

This automated gate is a **P0 decision-integrity subset** of the PIQ-0.2 evaluation rubric, measuring: grounding to available records, completeness-aware confidence, temporal scope, proportionate recommendations, goal consistency, recovery/safety behavior, and prevention of stale/orphan actions. Each golden asserts machine-verifiable output rather than matching exact explanatory wording; explanations are checked only for critical reason fragments. It does **not** yet objectively score directness, nuanced physiological correctness, narrative usefulness, or human-perceived brevity on the plan's 0–4 rubric. Those require separately reviewed answer and owner test sets.

**Failure rule:** A golden that demonstrates a real unsafe action is a P0 blocker. Fix the shared derivation or presentation boundary before greenlighting any release. Never change a golden's expected result solely to make CI green; reconcile it against canonical source semantics, and record genuine unresolved behavior.

**Cost:** No provider calls or Vercel builds beyond existing validation workflows. CI runs deterministic fixture tests. Do not add raw user health content to logs or commits.

**Unmet owner/release gates:** Real-user mobile acceptance, source tracking commencement, production schema head/migration `0053`, as-known-then historical profile, stale multi-tab response ordering, clinical review of provisional cut-screen thresholds, authenticated API scenario checks, and human-scored question quality. Whole PIQ program remains **0/9 fully accepted**.
