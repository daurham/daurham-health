# Roadmap

This file records only what the repository already states. The current application is the health-app tree that includes Ask Health, Proactive Insights, Weekly Coach, Experiment Suggestions, Literature-Backed Evidence, ongoing Health Auto Export workouts, Body Shortcut capture, Appearance, multi-angle meal photos, recipe text drafts, optional meal-photo clarifications, and migration `0033_nutrition_capture_images.sql`. The v2 authority is `HEALTH-PLATFORM-V2-LAB-BLUEPRINT.md`. The design manual is `HEALTH-PLATFORM-DESIGN-MANUAL.md` at version 1.0.45. `docs/V2-ROADMAP.md` keeps the older backlog and now marks the slices the blueprint has implemented.

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
- V2-F4 Experiment Suggestions: due Benchmark retests and missing Benchmark baselines. Goal-observation suggestions are deferred.
- V2-F5 Literature-Backed Evidence Drawer: explicit Europe PMC search, separate from personal Health evidence. Literature is not stored.
- V2-G1 Ongoing Apple workout ingestion: Health Auto Export JSON v2 workout objects write `activity_workouts`. They stay Activity and never become Training.
- V2-G2 Body Inbox and Shortcut capture: `POST /api/ingest/body` stages a capture. The owner review saves one manual Body measurement and keeps the staged instant unless the owner edits the time. Native share-sheet targeting is deferred.
- V2-G3 Appearance: System, Light, and Dark, plus Classic, Forest, Ocean, Sunset, and Plum. Preferences stay in the browser.
- V2-G4 Nutrition Gemini durable cost safety: description, meal-photo, and label attempts share `ai_usage`. Home-AI stays outside it.
- V2-G5 Motion and micro-interactions: short press, lift, entry, notice, pending, and meter motion. Reduced motion removes it. Health numbers do not animate.
- V2-G6 Multi-Angle Meal Photo Estimation: one to three photos of the same meal go to Gemini as one request and one `ai_usage` reservation. Home-AI stays one photo. The saved Nutrition entry is still the reviewed value.
- V2-G7 Recipe Text Draft Assistant: pasted recipe text can become a transient Gemini ingredient draft. The owner resolves each food. Recipe nutrition stays deterministic. Health does not fetch recipe pages.
- V2-G8 Meal Clarification Refinement: a Gemini meal estimate may include up to three optional questions. Refine estimate reuses the same job and stored photos for one new `nutrition_meal_photo` attempt. Home-AI does not accept those answers. The saved meal is still the reviewed value.
- V2-H1 Nutrition Micronutrients + Goal/Progress hardening: fiber and sodium preserve unknown evidence, strength Goals use canonical Training e1RM evidence, and mistaken Goals have explicit correction semantics.
- V2-H2A/H2B/H2C Coach: persistent deterministic Weekly/Daily assignments, accepted Stretch Quests, Personal Lab attention, snoozes, priority/inbox polish, and canonical-change refresh.
- V2-H2D Goals + Training Measurement Expansion + Lightweight Routines: distance, pace, skills, Training Goals/bests, Running/Hiking, distance/pace Stretch, and versioned owner Saved Routines.
- V2-H3 XP / Reward Wallet: Coach-completion XP, Lifetime/Spendable balances, append-only accounting, owner reward catalog, concurrency-safe redemption, refunds, and backup/export support.
- V2-H4 Experience System: Nutrition-first Today hierarchy, compact progressive-disclosure Coach, XP/Level progression, full Theme Studio, goal-aware/motivating trend semantics, readable dates, and bounded reduced-motion-safe celebration.
- V2-H5 Pantry + Exercise Library + Flexible Programmed Workouts: saved-food management, exercise-library management/guidance, one-session programmed extras, and beginner calisthenics support.
- I0A Instance Configuration Foundation: typed deployment config, safe capability discovery, config diagnostics, optional-feature degradation, and one-owner-per-deployment portability foundation.
- I0B Dynamic Instance Identity + Canonical Timezone: configured instance identity/timezone in live owner flows, DST-aware calendar behavior, deployment-neutral setup docs, and dynamic demo capability behavior.
- I0C Fresh-Instance Bootstrap + Owner-Specific Seed Separation: data-aware legacy-owner seed handling, fresh-instance routine cleanup, deployment doctor, single-owner deployment guide, and generic branch validation.

Also present from v1 and the import work: Nutrition, Training, Body, Progress, Activity, Sleep, Timeline, Compare, checkpoints, Apple Health archive import, Health Auto Export ingest, Gemini nutrition capture, Home-AI transcription, backup and portable export, and the public demo.

## Current work

I7 — Observed Maintenance + Plateau Engine is prepared as a dormant batch on top of dormant I6 commit `ed97ff7a9753650fd705504129b5ec958700a96c`.

I7 adds `maintenance-engine-v1`: a quality-gated observed-maintenance estimate, explicit plateau states, scale-noise context, review-only interventions, I6 Goal Control integration, and an owner-reviewed Personal Lab Weight-response calibration suggestion.

No branch ref is moved while the Vercel rolling deployment limit remains active. Schema head is `0047_maintenance_calibration_experiment_origin.sql`.

## Known planned work

- I8 Training Progression / Preservation Goals.


Named by the current manual or blueprint, and not marked implemented:

- Overnight vital metrics remain disabled until a payload is verified.
- External retest notifications remain deferred (`docs/V2-ROADMAP.md` and the blueprint).
- Nested recipes, batch inventory, and recipe fiber remain deferred.
- Notifications, push, email, and background model calls for Weekly Coach are deferred.

`docs/V2-ROADMAP.md` also lists shortcut or share-sheet ingestion, richer meal photos, more health sources, and a Health Inbox. Theme packs are implemented as V2-G3. Motion is implemented as V2-G5. Multi-angle meal photos are implemented as V2-G6. Recipe assistance is implemented as V2-G7. The bounded meal-clarification loop is implemented as V2-G8. The file itself calls the remaining items post-v1 ideas, not promises. How many of those ideas are still wanted is unknown. Do not treat that file as the build order.

## Unknown

- Whether any planned item besides F5, disabled vitals, and the deferred items above has an accepted specification.
- Whether the external Home-AI service runs Ollama. This repository only calls Home-AI over HTTP.
- Whether the local annotated tag `v1.0.0` has been pushed. The tag exists locally and points at `7124ca513efa6c833457303ee6ff79d78344fce6`. No remote was contacted, and local metadata has no remote-tracking tag ref, which does not prove the remote state.
