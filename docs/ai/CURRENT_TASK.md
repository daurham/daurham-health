# Current task

## I5 — Shared Health Intelligence Engine + Ask Health Context

### Status

Implementation prepared as a dormant batched Git commit on top of dormant I4 commit `09f305f51c7c4da945fe3a3f771a17f683ed7896`.

Do not move a feature branch ref while the Vercel rolling deployment limit remains active.

I5 is derived-only and adds no schema migration. Repository schema head remains:

`0046_evidence_semantics_change_watchdog.sql`

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Product intent

I5 creates one deterministic evidence layer that can increasingly become the common interpretation input for Ask Health, Progress, Coach, Today, and Personal Lab.

It does not replace canonical Health tables. It aligns existing observations by Health date, preserves missingness, applies owner Data Quality exclusions before analysis, calculates coverage/baselines/relationships/change context, and then routes only relevant evidence to a consumer.

## Shared evidence frame

`health-intelligence-v1` defines a typed signal registry and sparse daily frame for:

- Activity: steps, active energy, exercise minutes;
- Sleep: eligible nightly duration;
- Nutrition: calories, protein, fiber, sodium;
- Training: session count and perceived effort;
- Body: canonical weight in kilograms;
- Daily Signals: logged water, bowel count / explicit no-BM, energy, hunger, soreness, and stress.

Missing owner-tracked signals remain missing. The only synthesized zero is completed-day Training session count, because no canonical Training session on a completed date is itself a real zero-session observation.

Current-day totals that require a complete day remain provisional and are excluded from complete-day coverage, baselines, relationships, and intervention comparisons.

## Quality, provenance, and exclusions

The shared loader applies I4 `excluded_from_analysis` reviews before building daily evidence.

The original Health row is never deleted or rewritten.

Coverage records include:

- observed versus eligible days;
- owner exclusions;
- coarse provenance counts;
- descriptive confidence.

Nutrition keeps I4 provenance and unknown-nutrient semantics. Body keeps comparability context. No universal Health score, device score, readiness score, or recovery score exists.

## Personal baselines and relationships

The snapshot derives recent personal baselines and a curated relationship catalog.

Initial relationship families include:

- Sleep ↔ energy/hunger/soreness;
- Sleep ↔ steps;
- hydration ↔ bowel tracking;
- fiber ↔ bowel tracking;
- protein ↔ next-day soreness;
- steps ↔ next-night sleep.

Both same-day and selected one-day-lag relationships are supported.

Relationships require minimum paired observations and use deterministic Spearman rank association. They are observational only and never presented as causal findings.

## Change context

Confirmed/explicit I4 Change Ledger entries can be compared with surrounding Health evidence.

I5 calculates bounded seven-day before/after summaries when each side has enough observations. These are context comparisons, not proof the intervention caused the difference.

## Question routing and drill-down

The snapshot can route evidence by question/lens instead of sending every available signal to every consumer.

Structured evidence carries:

- signal identity;
- period;
- coverage;
- confidence;
- provenance;
- evidence dates;
- detail destinations.

This supplies the basis for consequential `Why?` drill-down without requiring model-generated provenance.

## Ask Health

Ask Health packet version is now `ask-health-evidence-v2`; prompt version is `ask-health-v4`.

Ask Health keeps its existing direct Goal/Body/Nutrition/etc evidence but consumes the shared I5 layer for:

- Daily Signals;
- personal baselines;
- personal relationships;
- intervention comparisons;
- owner Data Quality exclusions;
- question-specific context.

The owner UI gains a collapsed **What Health knows / Missing context that matters** summary. Sparse relationships become explicit limitations rather than invented patterns.

Gemini still phrases/explains only after owner action. Deterministic evidence remains authoritative.

## Timeline

The I2-deferred Daily Signals Timeline integration is included.

Timeline receives one **Daily check-in** event per Health date containing the day's water total, bowel state/count, and entered wellness ratings. It does not create one Timeline event per glass or bowel event.

Explicit no-BM remains different from missing bowel evidence.

## Shared owner API

`GET /api/intelligence/snapshot?range=...&asOf=...` exposes the owner-authenticated derived snapshot.

The endpoint does not create a second canonical Health store.

## Consumer boundary

I5 establishes the engine and converts Ask Health first.

I6 Goal Control / Weekly Decision Engine is the next phase that should move consequential Today/Coach decision logic onto this shared layer rather than duplicating it inside I5.

## Explicit non-goals

I5 does not:

- add a database table or migration;
- mutate canonical observations;
- infer missing hydration, bowel, Nutrition, Body, or wellness values as zero;
- infer causality;
- create a readiness/recovery/source-quality score;
- automatically change goals, calories, macros, supplements, or Training;
- make background AI calls;
- replace existing deterministic Goal/Lab authorities.

## Validation before publication

Once this dormant commit is exposed to one branch:

1. apply migrations through existing schema head 0046;
2. run `npx tsc -b`;
3. run `npx eslint .`;
4. run `npm test`;
5. run `npm run build`.

Focused I5 regression coverage is staged for missing-vs-zero semantics, current-day provisional rules, lagged relationships, exclusion accounting, intervention comparisons, question routing, Ask Health context, Daily Signals Timeline integration, and API routing.

Do not merge until the exact published branch head is green.

## Next roadmap slice

I6 — Goal Control / Weekly Decision Engine.
