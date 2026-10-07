# Current task

## I6 — Goal Control / Weekly Decision Engine

### Status

Implementation prepared as a dormant batched Git commit on top of dormant I5 commit `6fff0fc874a4fa6deee752bcc403b46d37a36bf0`.

Do not move a feature branch ref while the Vercel rolling deployment limit remains active.

I6 is derived-only and adds no schema migration. Repository schema head remains:

`0046_evidence_semantics_change_watchdog.sql`

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Product intent

I6 turns Weekly Coach evidence plus the I5 shared Health Intelligence frame into one deterministic goal-control authority.

The engine answers three questions:

1. Is one concrete thing worth attention now?
2. Is the correct decision to stay the course?
3. Is the evidence too limited to justify changing course?

The state is explicit:

- `act`;
- `maintain`;
- `insufficient_evidence`.

`maintain` is a successful decision, not an empty fallback.

## Authority model

Weekly Coach remains the deterministic evidence/candidate generator.

`goal-control-v1` sits above it and selects the weekly decision. It does not create a second set of Goal formulas.

Goal Control also consumes I5 for:

- coverage;
- provenance;
- descriptive confidence;
- mature personal relationships;
- Data Quality exclusions already applied at the I5 loader boundary.

Weekly Coach and Today render this same Goal Control decision rather than selecting independent primary recommendations.

The gamified Coach remains a mission/reward system. New weekly goal missions are limited to goals that actually need weekly attention; ordinary on-track goals do not automatically become a competing weekly focus.

## Evidence window

Goal Control uses:

- the Weekly Coach's last seven completed days as the evidence period;
- the Training Plan effective at the requested historical/current `asOf` date;
- the I5 30-day evidence frame for coverage, confidence, baselines, and mature relationships.

Historical `asOf` requests must not leak future plan versions or future Health evidence.

## Primary opportunity

The primary opportunity is the deterministic Weekly Coach `focus` candidate.

Goal Control does not invent an alternate action after Weekly Coach has already selected one.

Supported focus families include existing due/past goals, off-track goals, Body cadence, due Lab retests, ready Experiment reviews, pending review captures, Nutrition coverage, and plan-aware Training review/actions.

If no primary opportunity is justified, Goal Control may explicitly recommend no change.

## Explicit no-change state

When evidence is sufficient but no deterministic focus is justified:

> No change recommended this week. Current evidence does not justify changing your targets or plan.

This prevents the product from manufacturing a recommendation merely to fill a card.

## Nutrition evidence floor

The last seven completed days are assessed separately from the Nutrition target itself.

Initial floor:

- at least four logged days;
- at least four sufficiently reliable days;
- estimate-heavy or unknown-source days do not satisfy the reliable-day threshold.

Failing the floor creates an explicit limitation:

> intake-based changes should wait for better coverage.

I6 still does not mutate calorie, macro, fiber, sodium, or other Nutrition targets. I7 owns observed-maintenance/plateau intervention logic.

## Rest-aware Training adherence

Training Plan intent is authoritative for daily pressure.

Goal Control distinguishes:

- weekly target already met;
- planned Training day;
- intentional rest/non-Training day with enough planned days remaining;
- schedule that no longer has enough planned Training days for the weekly target.

An intentional Rest, Active recovery, Flexible, moved-away, or paused/away day is not a missed workout.

The persistent Coach daily `training_frequency` quest is only created when:

- no Training Plan is configured; or
- today is `training_preferred`; or
- today is `training_moved_here`.

If such a quest already exists and the owner later changes that date to a non-Training intent, the quest expires without an XP award. Existing completed/passed history is not rewritten.

## Goal status and confidence

Goal Control carries active Goal state as:

- meeting;
- on track;
- needs attention;
- unknown.

Overall confidence is derived from Weekly Coach substantive-domain coverage plus I5 signal coverage relevant to active Goals.

Sparse evidence produces limitations instead of aggressive recommendations.

## Personal relationships

Only I5 relationships that are:

- available;
- relevant to an active Goal;
- and at least moderate confidence

may appear in Goal Control.

They remain observational and do not become causal justification.

## Today

Today loads Goal Control as its own owner resource rather than expanding the already-large `/api/today` payload.

The compact **Goal overview** card appears after the Nutrition/Coach/Training cluster and before Daily Check-in.

It shows:

- decision headline;
- short explanation;
- confidence;
- one action when applicable;
- explicit Stay the course state;
- rest-aware note when useful;
- compact Why/limitations disclosure.

Health data change events refresh Today, Coach, and Goal Control.

## Weekly Coach

Weekly Coach responses now include the same deterministic `decision`.

The weekly page renders **Weekly decision** with:

- decision headline/summary;
- confidence;
- active-goal status counts;
- primary action when present;
- Training adherence;
- Nutrition evidence quality;
- mature personal relationships;
- limitations.

When Goal Control is present, the old standalone **Focus this week** section is suppressed.

AI commentary may still phrase deterministic evidence after owner action, but its intro/focus wording is not rendered as a competing authority.

## Owner API

`GET /api/intelligence/goal-control?asOf=YYYY-MM-DD`

- owner-authenticated;
- rejects future dates;
- derived-only;
- no target mutation;
- no background AI call.

## Explicit non-goals

I6 does not:

- automatically change calories, macros, Goals, supplements, or Training Plan;
- estimate maintenance calories;
- declare a plateau;
- infer causality;
- create a readiness/recovery score;
- make every active goal into a weekly mission;
- penalize planned rest;
- award XP for an automatically expired Training quest.

## Validation before publication

Once the dormant stack is exposed to one branch:

1. apply migrations through existing schema head 0046;
2. run `npx tsc -b`;
3. run `npx eslint .`;
4. run `npm test`;
5. run `npm run build`.

Focused I6 coverage is staged for:

- act / maintain / insufficient-evidence states;
- explicit no-change behavior;
- Nutrition quality floor;
- rest-aware Training adherence;
- Training-plan focus generation;
- mature personal-relationship filtering;
- shared weekly-attention semantics;
- owner API/auth boundary;
- Today and Weekly Decision presentation;
- Coach source-contract alignment and stale daily-quest retirement.

Do not merge until the exact published branch head is green.

## Next roadmap slice

I7 — Observed Maintenance + Plateau Engine.
