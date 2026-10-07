# Current task

## I10 — Passive Recovery + Clinical Context Expansion

### Status

Implementation prepared as a dormant batched Git commit on top of I9 commit `8ae302247f56814d5f623d223706f807573ab374`.

Do not move a feature branch ref while the Vercel rolling deployment limit remains active.

Schema head advances to:

`0049_passive_recovery_clinical_context.sql`

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Delivered

- Canonical Apple Health resting heart rate is now a first-class shared intelligence signal.
- Resting HR uses completed Health days, preserves missing-vs-zero semantics, and receives the same auditable coverage/confidence/personal-baseline treatment as other shared signals.
- Recovery and heart-rate Ask Health routing can select resting HR without creating a universal readiness or recovery score.
- Health Profile gains structured owner-entered known conditions, allergies, and medications.
- The Health Profile editor supports add/edit/remove for those structured facts alongside the existing durable context fields.
- Ask Health receives current-date profile clinical context as explicitly owner-entered evidence and keeps the existing prohibition on automatic medication/supplement changes. Historical `asOf` packets omit the current profile until medication/condition history is date-versioned.
- Full/portable backup inventory includes the new clinical profile fields using the existing serialized-JSON backup representation.
- Existing unverified overnight-vital ingestion remains disabled. HRV, respiratory rate, oxygen saturation, and wrist temperature are not enabled without a real payload audit.
- Heart-rate recovery/cardio-fitness observations, structured clinical lab results, and progress-photo checkpoints remain deferred until there is a trustworthy source/workflow.
- Fixed two missing separators in the dormant Ask Health system-prompt array found during the I10 compatibility pass.
- Post-I10 integration audit tightened I9 Weekly Coach: model-authored experiment ideas are ignored, deterministic Coach logic alone authorizes a Personal Lab handoff, and the handoff prefills only title/rationale on the owner-reviewed New Experiment form.

## Validation

Focused I10 deterministic/profile/Ask Health/backup tests are staged. The integration audit also adds regression coverage for the deterministic Personal Lab handoff and model-authored experiment rejection.

Full TypeScript, ESLint, Vitest, migration execution, backup round-trip, mobile visual QA, and production build remain deferred until the dormant I0–I10 stack is exposed to one validation branch.

## Next slice

The numbered intelligence roadmap is complete through I10.

Next: expose the dormant stack once, run the full validation matrix, fix integration failures, apply migrations through `0049`, then promote only after the stack is green.
