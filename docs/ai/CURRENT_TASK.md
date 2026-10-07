# Current task

## I7 — Observed Maintenance + Plateau Engine

### Status

Implementation prepared as a dormant batched Git commit on top of dormant I6 commit `ed97ff7a9753650fd705504129b5ec958700a96c`.

Do not move a feature branch ref while the Vercel rolling deployment limit remains active.

I7 adds one schema migration:

`0047_maintenance_calibration_experiment_origin.sql`

The migration only extends accepted Experiment provenance to permit the owner-reviewed `maintenance_calibration` trigger. It adds no new canonical table.

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Product intent

I7 estimates observed maintenance from the owner's own logged intake and weight response, distinguishes a likely plateau from normal scale noise or an insufficient observation window, and feeds that result into the existing I6 Goal Control authority.

It does not silently revise calorie targets.

## Observed-maintenance estimator

`maintenance-engine-v1` uses the most complete supported trailing window in this order:

- 28 completed days;
- 21 completed days;
- 14 completed days.

For current-day requests, today is excluded because Nutrition and daily signals may still be incomplete.

The estimate uses:

- a robust calorie average;
- a Theil–Sen body-weight slope;
- an approximate energy-balance conversion of 7,700 kcal per kilogram of body-mass change.

Observed maintenance is:

`robust average intake − daily weight slope × 7,700`

This is an empirical energy-balance estimate from the logged period. It is not a direct BMR, TDEE, or metabolic measurement.

Implausible results are withheld instead of displayed.

## I7 evidence floor

A window is estimate-eligible only when it has:

- sufficiently reliable calorie evidence on at least `max(10, ceil(windowDays × 0.65))` days;
- at least five reasonably comparable weight measurements;
- at least 12 days between the first and last weight used.

Nutrition days marked estimate-heavy or unknown do not satisfy the reliable-day requirement.

For body weight:

- `usual` measurements are preferred;
- `different_conditions` measurements are not used to establish the trend;
- `unknown` measurements may supplement the series when there are not enough usual measurements.

High confidence requires a stronger multi-week window: at least 21 days, at least 80% reliable calorie coverage, at least 70% higher-confidence calorie days, at least seven used weight measurements spanning at least 18 days, and at least 70% usual-condition weigh-ins.

The returned observed-maintenance range is deliberately wider at lower confidence.

## Plateau semantics

I7 distinguishes:

- `insufficient_evidence`;
- `not_applicable`;
- `trend_in_goal_direction`;
- `trend_away_from_goal`;
- `stable_at_maintenance`;
- `noise_obscured`;
- `possible_plateau`;
- `plateau_likely`.

A flat trend is not automatically a plateau.

A likely plateau requires:

- an active, unmet directional body-weight Goal;
- a multi-week sufficiently complete evidence window;
- a robust weight trend close to flat;
- moderate or high confidence.

When no unmet directional weight Goal exists, a flat weight trend is described as stability rather than failure.

Historical maintenance snapshots do not apply the owner's present-day Goal direction to the past.

## Short-term scale-noise context

I7 can surface recent changes in:

- sodium;
- carbohydrate;
- logged water;
- bowel frequency;
- Daily Context such as travel, alcohol, late meal, unusual stress, poor sleep opportunity, night interruption, sickness, or unusual physical labor.

These items explain why a short scale window may be less comparable.

They remain observational:

- logged water is not total hydration status;
- bowel records do not diagnose constipation;
- sodium/carbohydrate/context timing does not prove the cause of a scale change.

I7 extends the shared I5 evidence frame with `nutrition.carbs_g` so carbohydrate context uses the same provenance and Nutrition-quality semantics as other Nutrition evidence.

## Candidate interventions

I7 may suggest:

- hold the current plan;
- improve Nutrition evidence;
- improve weigh-in consistency;
- review the current Goal/plan;
- review one modest intake adjustment;
- review one modest activity adjustment.

For a likely plateau, the calorie candidate is approximately 7.5% of observed maintenance, rounded to 25 kcal and constrained to roughly 100–250 kcal/day in the Goal direction.

This is a review candidate only.

I7 never writes `nutrition_targets`, Goal versions, or Training Plan rows.

## Goal Control integration

I7 does not create a competing recommendation surface.

I6 remains the primary weekly decision authority.

If Weekly Coach already has a higher-priority deterministic focus, it wins. Otherwise a strong I7 evidence-gap / away-from-goal / likely-plateau intervention can become Goal Control's primary opportunity.

Possible/noise-obscured plateaus normally recommend holding course rather than manufacturing a target change.

Today's existing **Goal overview** may show the observed-maintenance estimate inline.

Weekly Coach's existing **Weekly decision** adds a **Weight response** summary and scale-noise disclosure.

## Personal Lab calibration

When evidence is meaningful but still too uncertain for a strong plateau decision, I7 may expose an existing-style Suggested Experiment:

**Weight-response calibration**

Initial protocol:

- 14-day observation;
- at least 10 calorie-log days;
- at least five comparable body-weight measurements;
- observe carbohydrate plus relevant Daily Context;
- keep the intended calorie/activity plan stable when practical;
- continue scale-noise context tracking;
- do not deliberately manipulate hydration or sodium.

The candidate is deterministic and owner-reviewed.

Accepting it uses the existing stale-fingerprint and Experiment creation flow. The migration only permits `maintenance_calibration` as an Experiment origin trigger.

An open Experiment already covering the same Goal suppresses the duplicate calibration suggestion.

## Owner API

`GET /api/intelligence/maintenance?asOf=YYYY-MM-DD`

- owner-authenticated;
- rejects future dates;
- derived-only;
- no background AI call;
- no automatic target mutation.

## Explicit non-goals

I7 does not:

- claim observed maintenance is a directly measured metabolism value;
- diagnose metabolic adaptation;
- diagnose constipation, fluid retention, or other causes of scale change;
- use one or two noisy weigh-ins to declare a plateau;
- change calorie/macronutrient targets automatically;
- deliberately recommend dehydration or sodium manipulation;
- change intake and activity simultaneously as a default intervention;
- auto-create a Personal Lab experiment.

## Validation before publication

Once the dormant stack is exposed to one branch:

1. apply migrations through `0047_maintenance_calibration_experiment_origin.sql`;
2. run `npx tsc -b`;
3. run `npx eslint .`;
4. run `npm test`;
5. run `npm run build`.

Focused I7 coverage is staged for:

- observed-maintenance math;
- robust weight trend;
- Nutrition-quality gating;
- body-comparability gating;
- current-day incomplete-data exclusion;
- directional/non-directional plateau semantics;
- sodium/carbohydrate/hydration/bowel/context scale-noise handling;
- candidate calorie-intervention bounds and no automatic mutation;
- Goal Control integration;
- owner route/auth boundary;
- maintenance-calibration Lab proposal;
- duplicate open-Experiment suppression;
- Experiment origin migration/schema-head coverage.

Do not merge until the exact published branch head is green.

## Next roadmap slice

I8 — Training Progression / Preservation Goals.
