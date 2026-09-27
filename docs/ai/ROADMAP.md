# Roadmap

This file records only what the repository already states. The current application is the health-app tree that includes Ask Health, Proactive Insights, Weekly Coach, and migration `0030_ai_usage.sql`. The v2 authority is `HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md`. The design manual is `HEALTH-PLATFORM-DESIGN-MANUAL.md` at version 1.0.33. `docs/V2-ROADMAP.md` keeps the older backlog and now marks the slices the blueprint has implemented.

## Completed / existing functionality

Frozen v1.0.0, then the v2 slices the blueprint marks implemented:

- V2-A Data Capture Foundations: Supplements, Body measurement capture, ad-hoc Training, Daily Context
- V2-B Personal Lab: protocols, benchmark results, derived retest scheduling, experiment result summaries
- V2-C Recipes: immutable versions, consumption logging, in-builder ingredient creation
- V2-D Goals: goal identity, deterministic projections, status and reminders
- V2-E Sleep: night detail, stage analytics, overnight vital sample storage with no metric enabled, personal baselines, source attribution
- V2-F1 Ask Health
- V2-F2 Proactive Insights
- V2-F3 Weekly Coach Brief

Also present from v1 and the import work: Nutrition, Training, Body, Progress, Activity, Sleep, Timeline, Compare, checkpoints, Apple Health archive import, Health Auto Export ingest, Gemini nutrition capture, Home-AI transcription, backup and portable export, and the public demo.

## Current work

No active implementation task. See `CURRENT_TASK.md`.

## Known planned work

Named by the current manual or blueprint, and not marked implemented:

- V2-F4 experiment suggestions
- V2-F5 literature retrieval
- The blueprint ordering line says “V2-F4 and later” without a separate specification in that list. The names above come from design-manual section 53 and the F3 blueprint amendment. A fuller F4 or F5 contract is not in the ordering section.
- Overnight vital metrics remain disabled until a payload is verified.
- External retest notifications remain deferred (`docs/V2-ROADMAP.md` and the blueprint).
- Nested recipes, batch inventory, and recipe fiber remain deferred.
- Ongoing Apple workout-object ingestion is recorded as something v2 should evaluate. It is not marked implemented. Historical workout objects already exist; ongoing sync focuses on daily Activity summaries.
- Notifications, push, email, and background model calls for Weekly Coach are deferred.
- Nutrition Gemini is not on the `ai_usage` ledger yet.

`docs/V2-ROADMAP.md` also lists theme packs, motion, shortcut or share-sheet ingestion, richer meal photos, more health sources, and a Health Inbox. The file itself calls these post-v1 ideas, not promises. How many of those ideas are still wanted is unknown. Do not treat that file as the build order.

## Unknown

- Whether any planned item besides F4, F5, disabled vitals, and the deferred items above has an accepted specification.
- Whether the external Home-AI service runs Ollama. This repository only calls Home-AI over HTTP.
- Whether the local annotated tag `v1.0.0` has been pushed. The tag exists locally and points at `7124ca513efa6c833457303ee6ff79d78344fce6`. No remote was contacted, and local metadata has no remote-tracking tag ref, which does not prove the remote state.
