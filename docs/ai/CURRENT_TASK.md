# Current Task — V2-F4 Acceptance Correction: Goal Suggestions Must Fail Closed

Status: ready_for_implementation

Baseline commit:

`749c4a3f937f37c710f5cd82898b4848d8257328`

This is a narrow acceptance correction for V2-F4 Experiment Suggestions.

The benchmark-suggestion path, explicit owner acceptance, deterministic fingerprints, origin migration, shared `ai_usage`, backup/export work, and provider boundary are retained.

Do not redesign F4.

---

## Objective

Correct Goal-derived Experiment suggestions so F4 obeys the original fail-closed contract:

> A Goal may produce an Experiment candidate only when current evidence exists and the existing Personal Lab evaluator can represent the Goal's metric, target, and evaluation semantics exactly.

The current implementation does not meet that requirement.

---

## Review findings

### 1. Missing current Goal evidence currently leaks through

D3 uses:

`targetState = unknown`

when the current Goal evidence is missing.

The current F4 compiler rejects `satisfied`, but it does not reject `unknown`.

That means a Goal with no current observation can currently become an Experiment suggestion.

This violates the F4 requirement:

`current evidence exists`

### 2. Current B4 evaluators do not encode most Goal target semantics

The current F4 compiler reports these Goal kinds as supported:

- `body_metric`
- `activity_steps`
- `nutrition_protein`
- `sleep_duration`
- `supplement_adherence`

But the existing Personal Lab evaluator does not represent their complete Goal semantics.

Specifically:

- Body requirements evaluate observation presence/count and change. They do not evaluate the Goal threshold/range.
- Activity/Nutrition/Sleep requirements evaluate observations, coverage, and summary values. Their `criterionStatus` remains `not_configured`; they do not evaluate the Goal threshold/range.
- Supplement adherence can evaluate `minimumAdherencePercent`, but the Goal's required `evaluationWindowDays` is not structurally pinned/enforced by the accepted Experiment. The owner can later schedule a different window.

Therefore these candidates do not satisfy the original rule that existing Lab semantics must represent the Goal target exactly.

The fact that the Goal target appears in F4 question/instruction text or is linked through `experiment_goals` is not sufficient.

Canonical Experiment result semantics must be able to evaluate what the suggestion claims it is testing.

---

## Required correction

Do **not** extend or redesign B4 in this patch.

Do **not** add a second Goal evaluator to F4.

Instead, fail closed.

For the accepted initial F4 release:

- `benchmark_retest_due` remains active.
- `benchmark_missing_baseline` remains active.
- Goal-observation suggestion generation is deferred until Personal Lab can encode the complete Goal target/window semantics canonically.

It is acceptable to keep the existing `goal_observation` type, migration vocabulary, `experiment_goals` table, and future compiler scaffolding if useful.

But no current Goal may produce a surfaced F4 candidate.

---

## Compiler behavior

`compileGoalToExperimentCandidate(...)` must return unsupported for current Goal kinds under the current B4 contract.

The reason should accurately explain that Personal Lab cannot yet represent the complete Goal target/evaluation semantics.

Do not claim that Body, steps, protein, Sleep, or supplement adherence are F4-supported Goal candidates.

Also make the missing-evidence boundary explicit:

- `targetState = unknown` must be unsupported.
- A future Goal compiler must not treat missing evidence as merely "not satisfied."

Keep this explicit even if all current Goal kinds are otherwise unsupported.

---

## Candidate registry

The surfaced initial candidate inventory is therefore effectively:

1. `benchmark_retest_due`
2. `benchmark_missing_baseline`

Do not weaken Benchmark behavior.

Preserve:

- B3 `due` authority
- exact Benchmark protocol-version pinning
- current-protocol missing-baseline behavior
- duplicate/nonterminal Experiment suppression
- deterministic IDs/fingerprints
- stale-candidate protection
- explicit owner acceptance
- AI presentation-only behavior

If `goal_observation` remains in the machine enum as reserved future vocabulary, document clearly that it is currently dormant/unsupported and cannot be emitted by the registry.

---

## Schema

No new migration.

Schema head remains:

`0031_experiment_origins.sql`

Do not roll back `experiment_goals`.

That table is already applied and is a legitimate future canonical relation.

It may remain unused by the currently surfaced F4 candidate families.

---

## Documentation correction

The current F4 implementation docs overstate Goal support.

Because design-manual ledger rows are historical, do not rewrite the existing 1.0.34 ledger row as though it never happened.

Add a correction amendment/version.

Expected design manual version after this patch:

`1.0.35`

Document explicitly:

- initial accepted F4 supports due Benchmark retests and missing Benchmark baselines;
- Goal-observation suggestions are deferred;
- existing B4 Body/Activity/Nutrition/Sleep requirements do not evaluate Goal target thresholds;
- supplement adherence does not yet lock the Goal evaluation window into Experiment scheduling;
- therefore all Goal suggestions fail closed for now;
- `experiment_goals` remains canonical future infrastructure;
- no new migration was needed.

Update the live v2 blueprint status accordingly without rewriting historical amendment text.

Update:

- `docs/ai/DEV_STATE.md`
- `docs/ai/DECISIONS.md`
- `docs/ai/ROADMAP.md`
- `docs/V2-ROADMAP.md` only if its live F4 description currently claims Goal suggestions are supported.

V2-F4 may still be marked implemented once this correction is complete, with the bounded candidate scope documented.

V2-F5 remains unimplemented.

---

## Required tests

Add or revise focused tests proving:

1. `targetState = unknown` cannot compile to a Goal Experiment candidate.
2. An unmet `body_metric` Goal does not produce an F4 candidate.
3. An unmet `activity_steps` Goal does not produce an F4 candidate.
4. An unmet `nutrition_protein` Goal does not produce an F4 candidate.
5. An unmet `sleep_duration` Goal does not produce an F4 candidate.
6. An unmet `supplement_adherence` Goal does not produce an F4 candidate under the current Lab/window contract.
7. A suggestions input containing only Goals returns no suggestions.
8. Benchmark due-retest behavior is unchanged.
9. Benchmark missing-baseline behavior is unchanged.
10. Ranking/cap behavior remains deterministic for Benchmark candidates.
11. Existing stale-candidate and duplicate-accept behavior remains unchanged.
12. Migration `0031` remains the schema head.
13. Backup/restore/export tests for Experiment origin and `experiment_goals` continue to pass.
14. F1/F2/F3 regressions remain green.
15. Demo remains provider-free/read-only and does not invent a Goal suggestion.

Run:

- `npm test`
- `npx tsc -b`
- `npx eslint .`
- `npm run build`

No new migration should be applied.

---

## Acceptance criteria

This correction is complete only when:

- no Goal with missing evidence can become an F4 suggestion;
- no current Goal kind is surfaced as an F4 Experiment candidate unless the current B4 evaluator can encode its complete target/window semantics;
- under the current repository semantics, Goal-observation suggestions are fail-closed/deferred;
- Benchmark suggestion behavior remains intact;
- no B4 evaluator redesign was introduced;
- no second Goal evaluator exists inside F4;
- schema remains `0031_experiment_origins.sql`;
- `experiment_goals` is retained rather than rolled back;
- AI boundaries remain unchanged;
- explicit owner acceptance remains the only canonical creation path;
- tests pass;
- typecheck passes;
- lint passes;
- production build passes;
- docs accurately describe the narrower accepted F4 scope.

---

## Required completion report

Update `docs/ai/DEV_STATE.md` with:

- baseline commit
- resulting commit / working-tree state
- exact Goal compiler change
- active F4 candidate families
- dormant/deferred Goal behavior
- confirmation that `targetState = unknown` fails closed
- confirmation that B4 was not expanded
- schema head
- migration status
- Benchmark regression status
- backup/export status
- tests/count
- typecheck/lint/build
- manual/demo QA
- documentation version
- deviations
- F5 still deferred

When finished, reset this file to the standard "No active implementation task" template, commit, and push according to `AGENTS.md`.

---

## Final invariant

F4 may suggest:

> Your Push-up Capacity retest is due under the existing pinned protocol.

It may also suggest:

> This Benchmark has no valid baseline yet.

It must not currently claim:

> Your Bodyweight / steps / protein / Sleep / supplement Goal can be tested as an Experiment

when the canonical Personal Lab result evaluator cannot yet evaluate that Goal's complete target semantics.

Unsupported is better than a Lab Experiment whose stored result means something weaker than its proposal.
