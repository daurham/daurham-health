# PIQ-4.2 — Weight/intake descriptive Ask Health evidence (first bounded slice)

**Status:** Engineering implementation on PIQ branch only; requires exact full CI and human clinical/owner QA before release. This is NOT completion of PIQ-4.2 or PIQ-4.

## Problem and source authority

Ask Health can expose generic weight and calorie totals, but must not join an unconfirmed food-log mean to one scale point and conclude a stalled metabolism, measured TDEE, fat plateau, strength decline, or permission to lower calories.

The app already has `src/domain/maintenance.ts`, the audited engine for aligned 28/21/14d energy-balance windows, source-complete nutrition days, comparable weights, robust Theil–Sen trend, and tentative observed maintenance. **Reuse its calculation**, never fork its plateau thresholds. That engine's **owner-goal plateau**, current target, experiment/clinical check, and strength-performance decision gates must not be inferred from an Ask Health-only intelligence snapshot.

## Bounded first slice

For undated weight/plateau/energy questions or explicitly opted-in Deep Dive, derive a `focusedWeightEnergy` view from the already loaded shared intelligence snapshot. Qualify ONLY past dates with `nutrition.calories.dayCompleteness=verified_complete`, `quality=high_confidence`, nonempty/unique source IDs and an available completeness check, then pass that exact whitelist to the existing `buildMaintenanceState` estimator. Never use today as a complete day. No SQL, profile data, external AI or additional provider budget used.

- Emit **non-substantive** evidence explaining aligned nutrition+weigh-in quality and missingness.
- Only if the maintenance estimator says **available**, emit its already calibrated descriptive estimate, selected evidence dates, weight slope, intake mean and uncertain estimate range. This is *observed energy balance*, not measured BMR, TDEE, fat mass, confirmed deficit or safe calorie target.
- Always emit a **non-substantive decision boundary**: this read has NOT verified current active owner weight-goal version, configured target revision, imminent experiments, or comparable strength/e1RM. Training sessions and wellness ratings are logged context, not proof of strength preservation, safe recovery or adherence. Sodium, carbs, fluid, bowel and supplements are alternative explanations, not individual diagnoses. **Never emit** the maintenance engine's `review_intake_adjustment` interventions or infer a plateau from its no-goal label.
- A named historical day/week/month is intentionally excluded until that interval's own joined source can be screened. Deep Dive may include bounded context; General Only is still routed *without any private owner read* by the server, and packet builder independently refuses the focus in General Only.
- The selected packet and its cache fingerprint include only the bounded, selected evidence. No private source IDs/raw events/contexts/notes or entire owner history are forwarded.

## Acceptance boundaries and next tasks

Synthetic regression suite must cover observed available/insufficient evidence, absent/unverified source confirmations, uneven food dates, incomparable weigh-ins, selected historical dates, General Only/privacy, explicit Deep Dive breadth, and cache fingerprint. Next slice: separately version-verified active weight goal and preservation/strength evidence, historical-interval windows, sodium/carb/GI competing explanation quality controls and safety-gated owner-reviewed maintenance/calibration options. No generic calorie cuts or supplements changes. Formal PIQ phase acceptance is 0/9 pending owner-real evaluation and isolated Auth/Neon QA. No migration or release authorization.

## 2026-10-16 — Missing estimate must keep fallback quality window aligned

When the 28/21/14-day estimator cannot qualify an interval, it returns a **28-day fallback evidence-quality inventory**. The PIQ-4.2 focused Ask Health packet must count owner-confirmed days and logged Training/wellness context **only within those same recent 28 completed days** (clipped to the explicitly selected snapshot if narrower). A 90-day selection with 12 verified food days *outside* the fallback period must not report "12 of 28" current verified days or imply they support a current maintenance estimate. Added synthetic regression for that exact case. All completed-day and explicit historical question restrictions remain intact.

## 2026-10-16 — Second slice: source-qualified competing scale context

The **existing** maintenance engine already screens logged sodium/carbs as *possible* short-term scale-noise contributors on independently owner-complete, reliable food days, requiring identical calorie/nutrient source IDs, a baseline of >=4 of the previous seven dates, at least two of the most recent three, and meaningful absolute+relative rises (sodium >=500 mg and >=20%; carbs >=50 g and >=20%). `focusedWeightEnergy` now reuses **only** the engine's `sodium`/`carbohydrate` `noiseFactors` within the exact bounded selected Ask Health window; no new calculation, source SQL, owner notes or model work. The other existing `hydration`/`bowel` noise candidates are **not propagated** because sparse event-only data do not establish complete comparable status days. Similarly, incomplete, old, source-ID-mismatched, provisional or unverified nutrient logs never qualify.

A non-substantive `weight_energy.scale_context` evidence item includes source-qualified shift *descriptions* or the explicit state `no_qualified_comparison`. It NEVER treats lack of a qualifying shift as proof of unchanged intake, excludes other confounders, infers fluid retention/fat change, licenses calorie cuts, certifies muscle preservation or labels an owner plateau. This evidence is time-scoped, enters existing packet selection/cache fingerprint, is deliberately observational-only and preserves the independent goal/target/strength/experiment decision gate. Synthetic tests must exercise verified sodium+carb rises, incomplete-day/revision failure, mismatch of nutrient vs calorie IDs, current-day exclusion, water/bowel event shifts not promoted, General Only and historical scope.

## 2026-10-16 — Third bounded slice: single historical date, no invented daily deficit

One unambiguous past Health-local calendar date (ISO YYYY-MM-DD or "yesterday") in a weight/energy question now gets exact-date source observations from the already loaded `HealthIntelligenceSnapshot`, via `focused-weight-energy-history.ts`. The audited `digestDateSelection` parser prevents multiple dates, ambiguous formats and historical windows from silently becoming a one-day answer. Dates outside selected range/as-of return only non-substantive coverage and NEVER substitute later records; today is provisional.

A finite, positive scale-weight observation with a nonempty unique source ID set can be reported on that date only, with recorded usual/different/unknown weigh-in conditions. A dated calorie number is permitted ONLY with available nutrition source-completeness checking, verified-complete owner whole-day status, high-confidence quality, finite positive amount and nonempty unique source IDs. Unknown food intake stays unknown, not zero. Neither isolated observation is a measured deficit, energy balance, plateau, fat-mass change, medical fact, or recommendation for calorie reduction. These facts receive strict one-day `period` and the model sees no raw source IDs. No new SQL, current-target/goal claim, wider maintenance-estimator formula, model call, DB write or migration.

General Only is absent; Deep Dive must obey the same exact date. Named weeks/months and historical energy estimates remain deferred pending their own aligned-window contracts. Complete clinical/owner QA is not claimed.

## 2026-10-16 — Strict one-day packet projection

A focused single-day weight/intake question projects **only** the neutral selected-range label and `weight_energy.historical_day.*` dated evidence into the AI packet. All unscoped body/nutrition/goal, ongoing Coach and multiweek intelligence material is withheld from the selected packet and its cache fingerprint, and the intelligence `contextSummary` is empty. This intentionally favors correctness over generic Deep Dive breadth for *one-day* questions; future truly mixed-domain historical comparisons need a separately qualified same-date packet, not current-range substitute facts. Coverage uses the existing scalar metadata schema (`observed/unavailable` and `verified_complete/unavailable`), never booleans. The pre-projection drafts may contain existing application data but no private row or source ID is exported for this historical response.
