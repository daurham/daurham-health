# Current task

## I9 — Coach Intelligence / Next Best Actions + Deep Health Review

### Status

Implementation prepared as a dormant batched Git commit on top of I8 commit `0f3ab2407f5e613daad288661b6a54771377a066`.

Do not move a feature branch ref while the Vercel rolling deployment limit remains active.

Schema head advances to:

`0048_coach_intelligence_recommendations.sql`

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Delivered

- A separate `coach-intelligence-v1` payload keeps the existing Coach mission endpoint responsive.
- Coach derives at most three Next Best Actions from Goal Control, maintenance, Training progression, and evidence limitations.
- Training recommendations respect planned rest days and never create extra work simply to satisfy Coach.
- The maintain state is explicit: no recommendation is generated when current evidence supports staying the course.
- Recommendation memory is durable and portable: `do_this`, `not_now`, `not_relevant`, and `turn_into_experiment`.
- `not_now` is suppressed for a week; `not_relevant` and experiment handoffs stop the same recommendation from resurfacing.
- Accepted recommendations receive a later outcome check with helped / no change / worse / unclear.
- Uncertainty-driven follow-up questions are limited to one question per three-day budget window.
- The existing Coach card renders compact Next Best Actions without replacing Daily Quest, Stretch, weekly focus, or Lab.
- Weekly Coach prompt v2 receives the structured deterministic intelligence packet and can return a deeper review with competing explanations, evidence-improvement guidance, and an optional Personal Lab handoff.
- AI synthesis cannot mutate targets, prescribe medication/supplements, diagnose, or override deterministic no-change/rest logic.
- Added owner-only `GET /api/intelligence/coach` plus response/outcome POST endpoints.
- Full backup/portable backup inventory includes owner recommendation memory.

## Validation

Focused I9 deterministic, routing, and deep-review validation tests are staged.

Full TypeScript, ESLint, Vitest, migration execution, backup round-trip, and production build remain deferred until the dormant I0–I9 stack is exposed to one validation branch.

## Next slice

**I10 — Passive Recovery + Clinical Context Expansion**
