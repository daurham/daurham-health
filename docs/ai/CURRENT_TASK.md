# Current task

## I8 — Training Progression / Preservation Goals

### Status

Implementation prepared as a dormant batched Git commit on top of dormant I7 commit `af588c6c93531c60424a433eb0f7a9f3ad6b0fbf`.

Do not move a feature branch ref while the Vercel rolling deployment limit remains active.

No schema migration is added. Schema head remains:

`0047_maintenance_calibration_experiment_origin.sql`

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Delivered

- Derived `training-progression-v1` exact-exercise progression states: insufficient evidence, progressing, stable, stalled, declining, and confounded.
- Loaded-rep performance uses an exact-exercise e1RM estimate; bodyweight-relative strength is descriptive context only.
- Explicit RIR/RPE/failure evidence determines hard-set proximity where available.
- A lower performance exposure is not called a true decline when recent effort became materially harder or the session records fatigue, pain, illness, time, equipment, or other limitation context.
- Recent movement-pattern and muscle exposure are derived from canonical working sets without rewriting Training history.
- Exercise relationships distinguish the same exercise, a comparable substitute, and merely the same primary muscle group.
- Substitute exercises never merge into the original exercise strength/performance series.
- Active exercise-linked Goals receive a preservation view. Comparable substitutes can support preservation context, but they do not count as exact-goal progression.
- I8 feeds I6 Goal Control as a lower-priority deterministic opportunity and appears inside the existing Weekly Decision Training context.
- Added owner-only `GET /api/intelligence/training-progression`.

## Validation

Focused deterministic I8 tests are staged.

Full TypeScript, ESLint, Vitest, migration execution, and production build remain deferred until the dormant I0–I8 stack is exposed to one validation branch.

## Next slice

**I9 — Coach Intelligence / Next Best Actions + Deep Health Review**
