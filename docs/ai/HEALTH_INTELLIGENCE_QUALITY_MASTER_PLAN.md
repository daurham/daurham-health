# Daurham Health — Personal Intelligence Quality Program

> **MASTER IMPLEMENTATION CONTRACT · durable project memory · not an implementation report**  
> **Created:** 2026-10-14 · **Updated:** 2026-10-14 (deferred polish addendum) · **Status:** Proposed / not implemented  
> **Repository:** `daurham/daurham-health` · **Canonical proposed path:** `docs/ai/HEALTH_INTELLIGENCE_QUALITY_MASTER_PLAN.md`  
> **Working title:** **PIQ** (Personal Intelligence Quality) · **Roadmap:** PIQ-0 through PIQ-7 (core) + PIQ-8 (deferred, non-gating polish)  
> **Owner deployment:** single-owner Daurham Health; preserve multi-instance portability  
> **Operating rule:** Read this contract at the start of **every** planning, implementation, debugging, QA, and release session touching this program.

---

# 0. How to use this file (MANDATORY FOR FUTURE ASSISTANTS)

**This document is the continuity anchor, not a one-time suggestion list.** It preserves the user's intent and the acceptance conditions. It is intentionally more explicit than a normal roadmap because execution will span sessions, branches, migrations, and tool limits.

## 0.1 Session startup protocol

Before making any code change, the assistant or coding agent SHALL:

1. Read **§1–§4** (mission, outcomes, constraints, inventory), **§5** (execution protocol), the relevant core phase (§7–§14), deferred polish (§14A) only if in scope, and **§17–§21** (evaluation, safety, rollout, handoff).
2. Read the **latest** `docs/ai/CURRENT_TASK.md`, `docs/ai/DEV_STATE.md`, `docs/ai/DECISIONS.md`, `docs/ai/PROJECT.md`, and `docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`. This file does **not** automatically override newer facts recorded in the repository.
3. Inspect the **current branch**, git status, base/main divergence, latest migrations, and relevant code. Do not treat the code references and observations captured on 2026-10-14 as permanently current.
4. Check `docs/ai/PIQ_PROGRESS.md` if it exists; otherwise create it **only when implementation begins**. Progress is separate from this relatively stable master contract.
5. Choose **one** bounded PIQ task with explicit dependencies, files, design decisions, tests, and acceptance criteria. Avoid the all-at-once implementation trap.
6. State in the handoff: **phase/task ID, current state, why this task serves the North Star, exact behavior changing, behavior staying unchanged, validation, deployment/migration implications, and next step**.
7. Implement, test, review, and record the outcome; never mark a task complete merely because an agent reported completion.
8. At the end, update progress/decision records and leave a concrete resumption instruction. Never silently rewrite this master plan to make failing work look successful.

## 0.2 Hierarchy of authority

When sources disagree:

1. User's latest explicit request and approved design decisions.
2. Security, clinical-safety and factual integrity constraints in this contract.
3. **Actual verified deployed/runtime data** and latest code/schema (not guessed from documentation).
4. Stable architectural invariants in `PROJECT.md` / `DECISIONS.md` and existing tests.
5. This master plan's original intent and acceptance tests.
6. Legacy roadmaps, dormant branch status notes, and older conversation assumptions.

Resolve disagreements explicitly; document what changed and why. Do **not** silently optimize away an objective because its implementation is inconvenient.

## 0.3 Scope guard: what 'done' means

A phase is not complete until the intended user-facing outcome **works on the real owner workflow**, not just in a synthetic test. A code merge is not evidence of production readiness. A model returning valid JSON is not proof it answered the question. Passing unit tests is not proof its recommendation was timely or useful. A live model result is not proof its facts were grounded.

**Default development stance:** design → contract → bounded task → implementation → automated validation → realistic scenario evaluation → owner mobile QA → gated release → observe → record. One task at a time.

---

# 1. Product North Star and why this program exists

## 1.1 Unambiguous objective

> **Daurham Health must become an evidence-aware, personalized health analyst and coach that meaningfully answers the owner's question, identifies what matters, recommends proportionate next steps, and learns from outcomes — while remaining truthful about uncertainty, respecting the owner's autonomy, and using the data already collected.**

**A great experience:** The owner should rarely need an external AI to connect dots that Daurham Health could have connected from its own records plus established general knowledge.

**Not the objective:** Maximize cards, metric count, features, AI calls, token usage, correlations, warnings, question prompts, daily quests, or the number of times the word “intelligence” appears.

## 1.2 Friction that triggered the program (preserve these cases)

The owner encountered:

- Coach recommended reducing calories by ~150 kcal/day on a supposed plateau, displaying observed maintenance ~1,884 kcal/day with moderate confidence, without clearly substantiating meal-log completeness or presenting competing explanations.
- Coach displayed an orphaned **“Or change activity instead of changing both levers”** option after the parent calorie recommendation was gone.
- Goal Overview repeatedly promoted the obvious action **“complete your planned workout,”** even after a workout was completed.
- Training UI displayed **2/3 qualified training days**, while Coach described **two programmed sessions remaining**; the systems may use different semantics, but the interface did not reconcile/explain them.
- Coach's “Review” click was implemented using the response value `do_this`, potentially creating a false accepted intervention and a stale follow-up.
- Coach follow-up text could persist and reference a prior decision without clearly labeling it as historical.
- Owner reported low recorded plain-water intake (~30–40 oz/day), Bristol type 1 hard stools, lower fiber, resistance training, and daily creatine; Coach did not intelligently connect those signals or prioritize discussing the issue before a calorie adjustment.
- Ask Health frequently responded with **insufficient data**, despite the owner asking answerable general health, nutrition, or training questions. Its pipeline can exit before Gemini for packets lacking substantive personal evidence.
- Owner wants sex recorded as **male** as a structured permanent health-profile fact and consistently available in Health AI/Coach where relevant. Do not ask him to re-establish this at each query. Future instances configure their own owner data rather than hardcoding this user's identity in application code.
- Long, visually crowded Today/Coach cards and frequent prompts provide more noise than guidance; app's extensive stored data has not translated into proportionately better advice.

Treat these as **golden regression scenarios**, not just anecdotes. Do not remove or dilute them during implementation.

## 1.3 Functional success hierarchy

Every proposed feature must clear these questions in order:

1. **Truth:** Is the data correctly represented, with event date, source, completeness, quality, and uncertainty?
2. **Relevance:** Does this address an actual owner question, risk, goal, or decision?
3. **Interpretation:** Does it appropriately connect the relevant domains and competing explanations?
4. **Decision:** Is the action appropriate, proportionate, safe, feasible, and aligned to owner priorities?
5. **Outcome:** Can we establish what happened afterward, using a valid evaluation method?
6. **Usability:** Can the owner understand/use it quickly on mobile, without excessive burden?
7. **Efficiency:** Is the result achieved with minimum reasonable provider spend, latency, and infrastructure change?

**Reject** features with no persuasive answer to “What better decision can Health make because of this?”

## 1.4 Fundamental distinction

- **Tracker:** What was recorded?
- **Analyst:** What changed, compared with what and under which assumptions?
- **Coach:** What (if anything) should the owner consider doing next, and why?
- **Personal Lab:** What uncertainty is worth testing, how, and what outcome would count?
- **Ask Health:** What is the best useful answer to this particular question, based on personal evidence **and** general established knowledge?

These roles must consume **one shared derived understanding**, not produce contradictory independent answers.

---

# 2. Non-negotiable guardrails

## 2.1 Clinical and epistemic safety

1. Never diagnose a condition from sparse logs or claim a relationship proves causality. Discuss possible explanations with clear degrees of certainty.
2. Provide useful, general, evidence-consistent information even without sufficient personal data. Do not use “insufficient data” as a blanket refusal when a qualified answer is possible.
3. Separate **observed personal fact**, **owner report**, **calculated estimate**, **observational association**, **general medical knowledge**, **retrieved external research**, **hypothesis**, and **recommendation**. These may appear in one answer but must never be conflated.
4. Health targets, supplement doses, medication changes, training prescriptions and experiment enrollment are never silently mutated by model output.
5. Do not reward actions or suggest experiments that create incentives for extreme calorie restriction, overtraining, excessive water intake, risky supplementation, or symptom minimization.
6. For urgent symptoms and safety flags, advise appropriate professional care instead of routine optimization. Build explicit escalation contracts and clinical review for the safety language; avoid false reassurance.
7. Do not infer dehydration from recorded water alone, equate no logging with zero intake, or infer constipation diagnosis from an isolated Bristol type 1 entry. Logged plain water is **not total fluids**; creatine is context, not proof of dehydration.
8. Give uncertainty local to each claim, not one broad “high confidence” badge for the entire card.
9. Respect sensitive owner data: least-privilege storage and retrieval, no exposure through anonymous demo, provider payload minimization, no raw medical content in routine logs/analytics, consent for external research and any new transmission.
10. Never use a generic statistical model's physiological estimate as an absolute safe minimum or an automatic basis for reducing intake.

## 2.2 Canonical-data architecture

Preserve the core Daurham rule: **Health stores canonical facts; sources provide observations; deterministic code validates, calculates, and derives; AI interprets, compares and explains; missing stays missing.**

- Canonical source rows and derived results have separate ownership.
- Keep versioned historical intent (goals, plans, targets) and calendar-time semantics.
- Store profile facts and approved interventions with provenance and effective dates.
- Derived recommendations are **advisory artifacts**; they never become actual owner behavior merely because they were viewed.
- Don't fabricate or backfill historical completions, hydration, calorie totals, symptoms, or intervention adherence.
- Keep the single-owner separate-deployment model portable for additional users (e.g., spouse's own deployment).

## 2.3 Cost, performance and UI boundaries

- Prefer deterministic preprocessing, quality gates, materialized summaries/caches, and incremental recompute. Use Gemini when language reasoning/retrieval selection/synthesis actually adds value.
- Maintain explicit monthly provider caps, request classification, token/cost visibility, caching and graceful degraded behavior. Avoid repeated background provider calls on rerender/refresh.
- Limit expensive literature calls to questions for which they add concrete value. Disclose source and recency. Never invent a research citation.
- Optimize for mobile Today screen; one meaningful Coach insight is better than several long generic action cards. Keep existing five primary tabs unless owner explicitly approves a navigation redesign.
- Preserve XP/quests but separate **gamification**, **training schedule**, and **health recommendations**. A quest is not medical guidance.
- Keep timezone derived from instance configuration (`HEALTH_CALENDAR_TIMEZONE`); original owner uses `America/Phoenix`, but avoid hardcoded owner constants.
- Don't deploy or run migrations just to create documents or because CI is green. Maintain a deliberate rollout gate.

## 2.4 Always protect user's authority

- The owner decides which suggestions to follow.
- A recommendation can be ignored, dismissed, deferred, read, accepted, converted into an experiment, superseded or completed; these states are not interchangeable.
- Ask before saving a conversation-derived long-lived medical fact to the profile.
- The user can inspect/edit/remove owner-entered facts and see what data informed an answer.
- “No change needed” is a valid, often desirable result.

---

# 3. Current-state evidence register (snapshot as of 2026-10-14)

**IMPORTANT:** These are observed repository facts, not proof of production runtime or migrated database state. Reverify each line against the current commit before implementation. Relevant source file paths are intended as anchors, not permanent APIs.

| ID | Observed code/document behavior | Evidence / inspection anchor | Program implication |
|---|---|---|---|
| E01 | `nutritionDayQuality()` grades entry-source makeup, not whether a day's food log is complete. | `src/domain/nutrition/quality.ts` | Explicit nutritional day completeness is needed before strong energy-balance conclusions. |
| E02 | Maintenance eligibility considers source-quality and number of logged days/weight observations; estimated maintenance uses logged intake and weight trend. | `src/domain/maintenance.ts` | Prevent missing meals masquerading as maintenance estimates. |
| E03 | Health profile schema has DOB, height, persistent context, training limitations, dietary context, conditions, allergies, medications; no structured sex field. | `src/domain/health-profile.ts`, `server/profile/service.ts` | Add portable, owner-set male profile data for this instance. |
| E04 | Ask Health clinical profile conversion omits DOB/height and sends profile only when `asOf === today`. | `src/domain/ask-health/clinical-profile.ts` | Send appropriate stable/current/historical context consistently. |
| E05 | Ask Health has an early return when packet lacks “substantive evidence,” yielding a generic insufficiency response without calling Gemini. | `server/ask-health/service.ts` | General questions must be answered; personal coverage deficiencies become scoped limitations. |
| E06 | Evidence routing uses question term regex and selected lens, with bounded fixed-size packet and trim priorities. | `src/domain/intelligence/shared.ts`, `src/domain/ask-health/packet.ts` | Intent-aware retrieval, relevant windows, explicit omissions and retrieval quality tests. |
| E07 | AI prompt already allows general knowledge and demands cautious grounded claims, but response composition and gates undermine it. | `src/domain/ask-health/prompt.ts` | Fix pipeline/retrieval/evaluation, not merely prompt wording. |
| E08 | Shared signal registry includes hydration totals and bowel counts; it does not include stool consistency in this snapshot. | `src/domain/intelligence/shared.ts`, `server/intelligence/snapshot.ts` | Route Bristol types and symptom qualifiers into GI analysis. |
| E09 | Shared relationships include hydration↔bowel count, fiber↔bowel count, sleep↔hunger, and others; min paired observations can be ~10. | `src/domain/intelligence/shared.ts` | Curated, mature, context-aware associations; beware multiple comparisons. |
| E10 | Goal Control prioritizes weekly focus over maintenance/training progression by a static coalescing order. | `src/domain/goal-control.ts` | Rank meaningful insights above rote reminders. |
| E11 | Coach recommendation drafts use fixed priorities, including 100/80/70; alternative actions can appear separately. | `src/domain/coach-intelligence.ts` | Cohere related advice; add dependency/supersession semantics. |
| E12 | In Coach UI, “Review” invokes `do_this`; backend creates follow-up on acceptance after seven days. | `src/features/coach/CoachCard.tsx`, `server/intelligence/coach-intelligence.ts` | Separate inspect from accept; repair stale historical follow-ups. |
| E13 | Coach's intelligence fetch effect is dependent on `state?.date`, not all same-day owner mutations. | `src/features/coach/CoachCard.tsx` | Centralized invalidation/revalidation. |
| E14 | Week training progress and weekly focus use different qualifying concepts/paths in places. | `server/training/plan-service.ts`, `server/weekly-coach/load.ts`, `src/domain/weekly-coach/build.ts` | Define common training-progress semantics or explicitly name differences. |
| E15 | Existing owner literature research is a separate action backed by Europe PMC. | `server/literature/service.ts`, `src/features/ask-health/ExternalResearch.tsx` | Integrate targeted research selectively without converting literature to personal fact. |
| E16 | Changes in goals, nutrition targets, plan and other events already feed a unified change ledger, and personal lab has experimentation infrastructure. | `server/intelligence/change-ledger.ts` and lab modules | Extend rather than duplicate intervention tracking. |
| E17 | Current `docs/ai/CURRENT_TASK.md` describes an older `0049` validation gate, while default branch contains later migration files including `0052`. | `docs/ai/CURRENT_TASK.md`, `migrations/` | Reconcile authoritative deployed schema, branch and documentation **before** coding. |
| E18 | Multiple prior phases I0–I10 describe much of the intended intelligence design but do not guarantee owner-realized usefulness. | `docs/ai/NEXT_INTELLIGENCE_ROADMAP.md` | Implement the unfinished *behaviors*, not a competing platform. |

### 3.1 Unknown until verified (DO NOT GUESS)

- Which branch/commit is serving the actual owner production domain and which DB schema migrations are applied.
- Which personal sex/height/DOB fields are filled in production.
- The actual completeness of historical calorie logging and exact recent weight history.
- Whether current screenshots reflect pre- or post-mutation refresh/caching races.
- What share of “insufficient data” answers stem from early exits, weak retrieval, unavailable domains, prompt/composition, or genuine gaps.
- Which supplements are actively recorded, doses, and adherence; owner mention of daily creatine is not necessarily a canonical DB record.
- Current AI usage quota, budget, provider prices/model, and production quality baselines.
- Whether some earlier roadmap goals were implemented in a branch but not promoted or migrated.

Verification must use read-only code/API/DB checks before drawing production conclusions. Never manufacture a status for missing access.

### 3.2 Explicitly out of scope for this program

- New unrelated consumer trackers, a wholesale UI redesign, social/community features, autonomous medical treatment, unsafe dosing, automatic clinical diagnosis, a generalized readiness score, building a new model, new subscription services by default, full multi-tenancy, arbitrary AI SQL access, and automatic training/goal changes without owner consent.
- Rewriting already-good Training, Nutrition or Rewards modules simply because they could be refactored. Touch them only where this program requires an integration, integrity fix, or measurable usability improvement.

---

# 4. Target system architecture

## 4.1 The shared intelligence pipeline

```
Owner profile + goals + constraints (canonical, dated, private)
      |               
Canonical observations from Nutrition / Training / Body / Activity / Sleep /
Hydration / Bowel / Wellness / Supplements / Context / Personal Lab
      |
Source provenance + event time + completeness + comparability + exclusions
      |
Deterministic metric / trend / safety / relationship engines
      |
Versioned PERSONAL EVIDENCE MODEL: facts, quality, context, uncertainty,
contradictions, changes, hypotheses and decision candidates
      |
  +----------------------+-------------------------+
  |                      |                         |
Question-driven      Coach triage              Personal Lab
retrieval & answer    and ranking              interventions/outcomes
  |                      |                         |
General knowledge / selective grounded research   |
  +----------------------+-------------------------+
                        |
              Decision/recommendation memory
                        |
   Today / Progress / Coach / Ask Health / Lab (same facts)
                        |
                User feedback and new facts
```

**One authority per concept**: no parallel, inconsistent plateau classifier for Coach versus Ask Health; no duplicated weekly training count logic; no model-written derived numeric facts in database.

## 4.2 Proposed conceptual contracts (evolve existing types, do not duplicate blindly)

### `OwnerPhysiologicalContext`

- Owner-configured `sexForPhysiology`: `male | female | other_or_intersex | undisclosed` **or** a similarly explicit clinically appropriate typed model; for this owner's data, value is `male`.
- DOB, height, weight/as-of-date, active conditions, medication/supplement status, relevant restrictions, goals, activity context.
- Field provenance (`owner_entered`, imported, unknown), effective date/validity where necessary, change history, override behavior, privacy classification.
- Distinguish a *stable fact* (birth date) from *time-varying* records (weight, medication list, dietary phase). Do not apply current medication history to a past event without effective dates.
- A general statement about gender identity must not be used as a substitute for the clinically relevant sex field, or vice versa. The owner needs a simple Male setting, consistently available when relevant.
- No reliance on `.env` for owner-entered medical facts; `.env`/instance configuration controls deployment identity and capabilities, while the private owner database holds profile data.

### `EvidenceItem`

Minimum fields: stable evidence ID, semantic key/domain, value+unit or text, time span, observation vs derived distinction, source/provenance, quality, completeness, confidence *specific to inference*, temporal/comparability flags, exclusions, missingness state, direct detail link, calculation version, effective schema/version. Evidence for recent history and historical as-of should be reproducible.

### `DecisionCandidate`

- `candidateId`, scope/goal, observed trigger, relevant supporting evidence, counterevidence, uncertainty, potential action, expected benefit/effort/burden, risks and contraindications, dependencies, alternatives, action ownership, optional experiment protocol, novelty and cooldown.
- **Hard gates**: unsafe, stale, already completed, active conflicting experiment, contradicts owner priority, invalid source quality, absent required evidence. No score can override a hard gate.
- Then **ranking**: impact on goals, urgency, evidence quality, actionability, novelty, owner feedback, opportunity cost and recommended change burden.
- May result in **no action**, one insight, or one critical question.

### `RecommendationRecord`

Separate `proposed`, `viewed`, `accepted`, `implemented`, `deferred`, `dismissed`, `not_relevant`, `converted_to_experiment`, `superseded`, `expired`, `evaluated`. Track source evidence fingerprint, rationale version, owner action date and time, follow-up due date, outcome type, and reference to canonical plan change or experiment (if any).

### `AskHealthAnswer`

Must support: **direct answer**, personalized observations, general explanation, possible interpretations, practical next steps, uncertainty/limitations, safety advisories where indicated, and **evidence-backed citations** for owner-specific assertions. Sections are optional when not relevant; never force a verbose template for a trivial query.

### `EvidenceRetrievalManifest`

Persist or expose (privacy-safe) question classification, selected domains, effective range, relevant evidence IDs, available vs missing data, source exclusions, truncation details, packet-generation version, token size, and optional research source IDs. This is diagnostic infrastructure and a trust feature.

## 4.3 Cross-surface rules

- **Today**: action/logging surface, very concise, a maximum of one meaningful prioritized Coach finding normally.
- **Goal Overview**: status, constraints, confidence specific to conclusions, short rationale and link to deep evidence.
- **Coach**: decision-worthy actions/hypotheses, not copied calendar reminders or XP tasks.
- **What Changed / Progress**: details and evidence behind conclusions.
- **Ask Health**: answer the current question using retrieved personal evidence and general knowledge.
- **Personal Lab**: owner-approved attempts to reduce uncertainty, with outcomes and limitations.
- **XP/Rewards**: motivational and transparent; no financial/reward incentives for unhealthy behavior.
- **Profile**: stable or explicitly time-anchored information, owner-managed, consistently attached to relevant views.

---

# 5. Work management and drift prevention

## 5.1 Non-negotiable task template

Every phase is decomposed into `PIQ-X.Y` bounded tasks. Each task in `PIQ_PROGRESS.md` MUST contain:

```md
## PIQ-X.Y — <specific user-visible behavior>
State: proposed | ready | in_progress | blocked | implemented | validated | deployed | owner_accepted
Depends on: <task IDs or none>
Why: <concrete North-Star failure being corrected>
Files: <read/modify candidates, after actual inspection>
Contract: <inputs / outputs / source-of-truth / hard safety rules>
UX: <exact states and expected interactions>
Test: <unit / integration / regression / scenario / security / performance>
Migrations: none | exact migration identifier and reversible/risk plan
Provider cost: no-call | capped and cached | measured plan
Release: staging -> migrations -> production check -> owner mobile QA
Evidence: <commit, CI, runtime observations and changed behavior>
Outstanding: <open risk or decision>
Next: <one smallest next action>
```

**State transitions:** `implemented` does not imply `validated`; `validated` does not imply `deployed`; `deployed` does not imply `owner_accepted`.

## 5.2 Phase boundary rule

Do not start a later dependent phase because it sounds interesting while the earlier evidence-integrity or safety contracts remain broken. Parallelize independent documentation/tests only when it doesn't create simultaneous conflicting migrations or branches.

## 5.3 Continuation packet (append to progress after every session)

```
DATE / REPO / BRANCH / HEAD / WORKTREE / MIGRATION HEAD / PROD SCHEMA STATUS
ACTIVE TASK ID + STATE
DONE WITH EVIDENCE (files, commit, tests, owner observation)
NOT DONE / BLOCKERS (do not hide)
DECISIONS MADE + RATIONALE (update DECISIONS.md)
KNOWN RISKS / DATA MIGRATION / PROD DEPENDENCIES
PRECISE NEXT COMMAND OR TOOL ACTION
WHICH GOLDEN SCENARIOS SHOULD STILL BE RE-RUN
```

Avoid a 5,000-word session recap that another assistant must re-evaluate. Provide clear paths to durable state. Master contract holds the why; progress file holds where we are.

## 5.4 Change control

- New requirement? Assess against North Star and guardrails, add a scoped task, note dependency, and keep existing promises intact.
- Discovery invalidates a design assumption? Record evidence and propose explicit design adjustment. Do not silently change scope.
- Tests fail? Fix/regress only the bounded slice; do not waive checks to complete a milestone.
- User reports broken prod? Pause feature expansion, investigate rollback/repair safely, add scenario to regression pack.
- Provider budget exhausted? Continue deterministic/local work, tests, and docs; do not change budget cap silently.
- Vercel deployment limit? Avoid repeated pushes; batch preview-ready changes and gate production promotion.
- Migration unclear? Read-only inspection first, migration sandbox/Neon branch, explicit production authorization before applying.
- File says “complete” but code disagrees? Treat as unverified; update discrepancy record.

# 6. Execution order, dependencies and measurable outcomes

## 6.1 Task graph (not merely a numbered wishlist)

```
PIQ-0 Baseline & evaluation harness
   |
   +-- PIQ-1 Trust / data integrity --------------------------+
   |       |                                                   |
   |       +-- PIQ-1 completeness -----------------+            |
   |       +-- PIQ-1 freshness/recommendation state |            |
   |                                               v            |
   +-- PIQ-2 Owner context/profile --------------> PIQ-3 Ask Health
   |                                               |            |
   +----------------------------------------------+            |
                                                   v            |
                                          PIQ-4 Cross-domain reasoning
                                                   |
                                                   v
                                          PIQ-5 Coach decision quality
                                                   |
                                                   v
                                          PIQ-6 Outcomes / Personal Lab
                                                   |
                                                   v
                                          PIQ-7 Productionization,
                                          calibration, cost, owner acceptance
```

PIQ-0 precedes feature work. PIQ-1 and PIQ-2 may be designed in parallel but do not ship unsafe decision recommendations while PIQ-1 is incomplete. PIQ-3 may build on PIQ-2 before all PIQ-4 relationships exist; retrieval can progressively acquire richer signals. PIQ-7 quality/cost telemetry starts during PIQ-0 and expands continuously. **PIQ-8 is deliberately outside this dependency graph**: it begins only after core PIQ-7 owner acceptance unless the owner explicitly reprioritizes it. PIQ-8 cannot delay or redefine the core intelligence North Star. A confirmed import data-integrity defect, however, must be escalated to PIQ-1 immediately rather than misclassified as cosmetic.

## 6.2 Program scoreboard

The exact targets are **proposed** and should be established/baselined before hard release gates are enforced. They are outcome measures, not incentives to fabricate certainty.

| Measure | Desired direction / provisional acceptance target | How measured |
|---|---|---|
| Useful answer rate | ≥ 85% on a curated realistic question suite after iteration | Human-scored response rubric; questions from owner plus synthetic fixture cases |
| Direct answer rate | ≥ 95% for safe, answerable general questions, even with zero personal data | Automated + reviewed golden prompts |
| Unsupported personal claims | 0 in gated safety/regression fixture set | Evidence/ref validation and human claim audit |
| Unsafe advice / inappropriate treatment | 0 in reviewed red-flag suite | Clinical-safety test suite and targeted reviews |
| False “already completed” action | 0 in deterministic scenarios | Mutation->recompute UI/integration tests |
| False acceptance on review-only navigation | 0 | DB service tests + E2E acceptance lifecycle |
| Orphaned alternate recommendations | 0 | Parent/dependency/supersession tests |
| Conflicting plan/Coach weekly counts | 0 unexplained conflicts | Shared aggregation/semantic integration tests |
| Unlogged day treated as true zero/complete | 0 | Completeness and missingness tests |
| Owner-perceived useful Coach advice | Material improvement over baseline, with much fewer rote reminders | Weekly owner feedback and de-duplicated log |
| Provider budget | No unapproved increase in monthly ceiling | Usage-ledger breakdown per task type and user-visible meter |
| Latency | Hold or improve baseline p50/p95 on mobile; define concrete thresholds after profiling | Tracing + sampled/QA device timing |
| Cost per useful answer | Down or flat after quality improvement | Usage cost ÷ owner-rated useful answers |
| Owner burden | No requirement for large daily questionnaires | Prompt count, log steps, dismissals, mobile QA |
| Reproducibility | Same inputs and versions => same numeric results | Fixture replay / deterministic unit tests |

**Optimize for accuracy *and* usefulness.** A blanket “cannot answer” policy can score safe but fails the primary product objective. A plausible hallucinated answer can score satisfying but fails the trust contract. Both are failures.

## 6.3 Release lanes

- **Lane A — P0 safety / trust:** fix source-of-truth, wrong state, false commitments, unsafe calorie math. Can ship independently after focused validation.
- **Lane B — Ask Health quality:** profile + retrieval + answer-first behavior; ship with live provider tests within approved budget.
- **Lane C — Insight quality:** shared GI/recovery/energy/training synthesis; ship with rigorous validation, no premature correlation claims.
- **Lane D — Learning loop / enhancements:** owner acceptance, Personal Lab, calibration, polished UI and telemetry.

No lane may overwrite canonical owner data or apply production schema change without an approved migration plan.

---

# 7. PIQ-0 — Establish verified baseline and an intelligence evaluation harness

**Objective:** Make it impossible to get lost in the phase, misattribute a bug, or mistake a better-looking answer for a better answer.

## PIQ-0.1 — Repository/runtime truth audit

**Work:**

1. Read `package.json`, relevant routes, `docs/ai` status documents, migration index, tests, configured timezone, latest change ledger, and current branch status.
2. Determine **main, current development branch, deployed Vercel commit, owner production DB schema migration head**. Mark as `unknown` where access is absent; never infer deployment solely from main.
3. Map all canonical data streams and which fields reach: `Health Intelligence`, `Goal Control`, `Coach`, `Ask Health`, `Weekly Coach`, and `Personal Lab`.
4. Identify stale documents (especially `CURRENT_TASK.md` migration head mismatch) and record a reconciliation plan.
5. List owner-visible defects already reported and determine reproducible steps on a safe fixture environment.
6. Document baseline AI spend, request counts, cache hit rates, provider errors, evidence-packet size, and response latency if available. Never copy or display API keys.

**Artifact:** A small `PIQ_PROGRESS.md` baseline section with dated commits, schema/release status, source map, unanswered questions and prioritized defects. Keep raw personal health data out of git.

**Acceptance:** No team member must guess what code or DB state is currently running. Unknowns are labeled, not concealed.

## PIQ-0.2 — Golden question suite and scoring rubric

Create deterministic fixture histories plus test prompts. Distinguish:

1. **General** (no owner evidence): “What does creatine do?”, “What is RIR?”, “What does Bristol type 1 usually indicate?”
2. **Personal descriptive**: “How much weight have I lost in the past month?”, “What's my recent average protein?”
3. **Personal explanatory**: “Why might my weight be flat?”, “Could fluid/fiber intake contribute to hard stools?”
4. **Decision**: “Should I cut calories?”, “Should I add a fourth lifting day?”, “What should I prioritize this week?”
5. **Contradictory**: “Why am I losing no weight?” when recorded comparable weight is falling.
6. **Sparse evidence**: no food logs, incomplete water logs, limited body measurements; require an *answer plus scoped uncertainty*.
7. **Unsafe**: acute severe symptoms, extreme calorie-restriction suggestions, supplement dose-change requests; require safety guardrail.
8. **Historical**: “What were my goals in July?” with as-of filtering and stable profile facts.
9. **Change evaluation**: “Did increasing water help?” without enough controlled evidence.
10. **Recovery vs plan**: completed workout; a deliberate rest day; travel week; alternative workout dates.

**Rubric, 0–4 on each axis:** directness, personal relevance, retrieval completeness, physiological accuracy, evidence grounding, calibrated uncertainty, actionability, source transparency, proportionality, safety, consistency with owner goals, and brevity. Score “N/A” when an axis is not relevant. Track both human and automated assessments. Provider-model prose is not snapshotted verbatim; test *claims, referrals and structure*.

**Acceptance:** Owner-provided question suite represented; answers versioned with evidence fixtures; objective scoring repeatable. Baseline failures measured before changing prompts.

## PIQ-0.3 — Observability and request diagnosis

Add privacy-safe development tracing for:

```
request_id, local_health_date, task_class, selected_lens/range,
retrieval_domains, retrieved_evidence_count, omitted_evidence_count,
missing_domains, completeness_state, insufficiency_reason,
model_invoked?, cache_hit?, model_name, input/output token counts,
cost, duration, validation_repair_count, final_response_class
```

- Do not log raw user questions or detailed health/clinical values to routine production logs.
- Enable explicit local-only redacted diagnostics for owner troubleshooting, with source IDs but not secrets.
- Separate genuine lack of personal evidence from retrieval failure, early exit, provider failure, and output validation failure.
- Provide diagnostic codes rather than an undifferentiated “insufficient data” message.

**Acceptance:** Given a bad answer, a developer can identify whether missing data, routing, truncation, provider behavior or validation caused it **without guessing**.

## PIQ-0.4 — Regression infrastructure

- Add fully synthetic, non-identifying fixtures; do not check real owner medical records into git.
- Test exact calendar and timezone boundaries, null/unknown/zero semantics, exclusions, provenance, partial days, and modified historical observations.
- Add an inexpensive provider-stub evaluation path; production Gemini calls only for a small, explicitly capped smoke subset.
- Add CI gates for core evidence correctness and model contract validity.
- Define a release scorecard compared against baseline, including safety, useful answers, cost, latency.

**PIQ-0 EXIT:** The team can reproduce important owner complaints, quantify improvement, and know which code/database version it is evaluating.

---

# 8. PIQ-1 — Trust, data integrity and recommendation lifecycle (CRITICAL)

**Objective:** Fix bugs/assumptions that undermine every later intelligence claim. Do this before relying on the plateau engine or Coach advice.

## PIQ-1.1 — Nutrition **source quality** vs **day completeness**

Current pitfall: measured/owner-entered nutrition items can produce `high_confidence` source-quality status even when an entire meal was never logged.

**Design two orthogonal states:**

- `entry_evidence_quality`: source measured/owner-entered/AI estimate/legacy unknown.
- `day_completeness`: `confirmed_complete | probably_complete | partial | unknown` (or equally explicit semantics). A user's confirmation is owner report, not proof.

Optional complementary attributes: time completed, reason partial, source of confirmation, manual corrections, night-shift/fasting context, event history.

**UX:** unobtrusive “Was your food log reasonably complete yesterday?” prompt *only when necessary for a decision*, preferably at most once; easy mark as partial, unknown, or complete. Do not force daily confirmation to continue normal food logging. A current day is provisional, not incomplete by default.

**Analytics:**

1. Retain general macro reporting from all recorded food, with proper unknown fields.
2. Treat confirmed/credible complete days differently for estimates of actual daily intake and maintenance.
3. Exclude or significantly down-weight partial/unknown days in energy balance, *without retroactively deleting logs*.
4. Display count of confirmed days, number of total eligible days, and remaining uncertainty; never call logging coverage synonymous with completeness.
5. Review sampling bias: only complete high-intake days or only diet-adherent days can bias averages. An estimator may return “not enough trustworthy complete days.”
6. Backlog: historical days default unknown unless explicit owner confirmation exists. Never auto-mark past days complete just because records exist.
7. Handle missing macros and fiber/sodium separately from calories; an absent nutrient is not zero.

**Tests:** 1 logged meal/3 eaten; all logged meals but AI-estimate-heavy; fasting day explicitly complete; zero-food day explicitly logged vs empty day; edited historical day invalidates previous completeness; excluded source entries; timezone rollover.

**Acceptance:** A sparse partial meal log cannot produce a confident maintenance estimate or new calorie cut. “High-confidence food sources” is never visually mistaken for “whole day complete.”

## PIQ-1.2 — Maintenance/plateau engine validation and decision gates

- Re-examine `buildEstimate()` and weight-slope logic in `src/domain/maintenance.ts` after completeness change.
- Keep observed expenditure an empirical estimate, not a metabolic measurement; display date window, average complete logged intake, sample sizes, weight slope and estimate range.
- Review potential mismatches between trimmed calorie means and body-weight slope: calculate over **comparable aligned windows**, minimize bias from uneven logging and missing days.
- Evaluate effects of scale variability (hydration, GI transit, sodium/carbs, exercise-induced water shifts, creatine context, menstruation where relevant to other owner instances) as *possible* explanations without asserting cause.
- Evaluate minimum safe conditions before suggesting lower intake. Consider owner goal, existing logged target, estimated intake reliability, plausible energy needs, strength/performance, recovery, hunger, symptoms, and any current experiment. Do not apply a new cut automatically.
- If an existing calorie target is already low or data incomplete, prefer “review context / confirm intake completeness” rather than further reduction.
- Evidence should support the *decision*, not merely the presence of a weight trend.
- Show **maintenance estimate confidence** separately from Goal Overview/weekly confidence and from plateau classification confidence.

**Tests:** confirmed falling weight, stationary weight with complete logs, stable weight with partial intake, post-creatine weight shift, unusual sodium/late meal context, strength drop and low calories, weigh-in inconsistency, sparse data, intentional weight-maintenance phase.

**Acceptance:** A 150-kcal-down recommendation cannot emerge on the strength of “source quality only” food totals or contradict recovery safety rules. Owner may still choose a controlled experiment after informed review.

## PIQ-1.3 — Training event semantics: one shared interpretation

- Trace how a day qualifies (three distinct performed strength exercises across logs) vs `completedProgrammedSessions`, session count and preferred weekday state.
- Design an explicit `TrainingProgressSummary` with **qualified days**, **programmed session completions**, **weekly target**, **routines rotated**, **today status**, and any differences.
- In coaching prose say “qualified strength days” when that's what is counted; never call them sessions unless actually sessions.
- A qualified training day may occur through multiple ad-hoc/workout logs; don't accidentally discard it or double-count.
- Rescheduled sessions, late entries, same-day edits, partial sessions, and current day provisional status need invariant logic.
- Training plan's preferred weekday is flexible, not an automatic miss or guilt state.

**Tests:** 2/3 qualified days but only 1 fully programmed session; a single day with 2 logs that collectively qualify; retroactive saved set; no session yet; planned rest; 3/3 met; correct A/B/C routine sequence.

**Acceptance:** Coach and Training do not contradict without explicit, comprehensible distinction; no “two sessions remain” when 2/3 qualified days means one target day remains.

## PIQ-1.4 — Mutation invalidation: source event -> all dependent views

- Replace date-only/refetch-on-mount assumptions with a shared revalidation contract keyed to canonical mutations.
- Invalidate appropriate derived caches when changing Training logs, Routine/Plan, Nutrition, Body, goals, check-in, supplements, profile, explicit quality decisions, and experiments.
- Resolve loading races: latest owner mutation wins; stale server responses must not overwrite newer UI state. Use request versions/mutation tokens as appropriate.
- Avoid refetching or invoking Gemini unnecessarily; automatic refresh of deterministic derived state must not create billable model requests.
- Distinguish sync/read failures from genuine absence; preserve last known state with a visible, small stale indicator when necessary.
- Include cross-tab/mobile navigation and offline retry semantics where applicable.

**Tests:** complete workout -> Training and Coach update same date; edit calories -> estimate invalidates; set Bristol type -> GI signal updates; change goal -> recommendation reranks; cached stale request resolves last -> cannot regress state.

**Acceptance:** User does not have to wait until tomorrow or reload the entire app to make Coach realize a workout was completed.

## PIQ-1.5 — Recommendation state machine and dependency groups

**Fix immediately:** current UI “Review” must **not** call `do_this`. Define navigation-only `viewed`; separately present `Accept`/`Try this`/`Start experiment` after explanation. A follow-up is not scheduled by viewing.

- Define parent decision group: `possible_plateau_response` with alternative options: calorie adjustment vs activity adjustment vs wait/collect better data.
- If a parent or preferred option disappears, the “Or ...” alternate must be reworded as a standalone alternative or superseded too.
- Persist reason for suppression with fingerprint keyed to decision context; don't resurrect identical advice daily after explicit dismissal.
- Implement `superseded/expired` when facts change; historical feedback remains attributable to a *past* accepted decision, with dates and title.
- “How did this go?” only for a real `accepted`/`implemented` change with enough elapsed observation time; do not automatically ask after arbitrary “Review.”
- Enforce at most one active major intervention in the same domain when simultaneous changes would undermine interpretation, except explicitly approved factorial designs.
- Properly distinguish suggestion, action approval, real implementation, adherence, and self-reported subjective outcome.

**Tests:** orphan alternate; review-only no followup; accepted-but-never-implemented; “not relevant” suppression; real accepted change with planned review; intervention superseded; old follow-up dated and correctly labeled; exact fingerprint reuse; no accidental DB update on read.

**Acceptance:** Coach never claims you tried a change that you only inspected; recommendations make sense in isolation, after dismissals, and across days.

## PIQ-1.6 — Confidence and explanation correctness

- Each numerical estimate/decision has its own confidence and explanation panel.
- `Goal Overview: high` must never be visually implied to mean `maintenance estimate: high` when estimate says moderate.
- Evidence drill-down links show actual source range, sample size, quality, missingness and known confounders.
- Avoid confident rhetoric from weak or contradictory supporting evidence.
- Where counts change after owner edits, recompute and show which data changed.

**PIQ-1 EXIT:** Golden P0 regressions pass, nutrition completeness matters, review/accept actions are semantically correct, post-log Coach refresh is reliable, and maintenance advice is proportionate and explainable.

---

# 9. PIQ-2 — Complete private owner context and goal hierarchy

**Objective:** The app must know relevant stable facts about its owner and their intent, without asking repeatedly or guessing.

## PIQ-2.1 — Structured physiological/sex information

- Introduce a user-editable structured `sexForPhysiology` or medically appropriate equivalent, with `male` recorded for this owner (subject to owner saving/validating the stored profile value).
- The owner specifically requests that male be permanent and present in his health context. Satisfy it directly; do not bury it inside optional freeform notes.
- Do **not** hardcode `male` in source logic, generic seeds or public demo. New owner's instance defaults unset, then explicitly configured; this preserves portability for a different owner.
- Provide clear field semantics and coverage: when reference ranges/calculations use sex, which ones, what to do when unset, and how corrections work. Avoid conflating identity labels with a formula's physiologically relevant input.
- Add migration + backward-compatible defaults + profile UI + validation + API + backup/export/restore + demo fixture + relevant documentation.
- Ensure owner records aren't leaked into cross-instance bootstrap seed data.

**Tests:** male value persists and is passed to relevant context; unset on new instance; valid correction; export/import parity; no public demo leak; historical queries use appropriate dated context.

**Acceptance:** Ask Health can say “Your Health Profile lists male” when relevant without owner repeating it; relevant calculators can consume it when scientifically appropriate.

## PIQ-2.2 — Fix missing stable profile fields in Ask Health

- Ensure `dateOfBirth` and `heightCm` appear in the authorized internal evidence context. Derive age on the requested as-of date; do not store age as an independently editable stale fact.
- Permanent profile facts should be included in today's question and historical questions where valid; time-varying clinical values must obey effective-dated semantics.
- Preserve distinction between current conditions/medications versus historical/as-of claims. If historical medication coverage is unknown, say so.
- Profile updates must invalidate Ask Health evidence fingerprint/relevant caches, not necessarily every unrelated result.
- Provide `What Health knows about me` panel listing fields, source and last updated date, with edit link.

**Tests:** DOB/height included where relevant; no future-dated profile leak into historical facts; general education query does not unnecessarily transmit all clinical fields.

## PIQ-2.3 — Goal hierarchy and owner intent

Add versioned (or extend existing goal model to represent) the following concepts:

- **Primary objective:** e.g. fat loss while preserving strength.
- **Secondary objectives:** digestion, fiber adequacy, consistent training, sleep/recovery, activity.
- **Non-negotiable constraints:** active training limitations, existing symptoms needing review, available training time, equipment, budget/effort, owner preferences.
- **Trade-offs:** acceptable rate of change, tolerance for extra training volume, appetite/fatigue burden, conservative/aggressive experimental preferences.
- **Current phase:** cut, maintenance, strength emphasis, recovery/deload, travel or illness interruption (owner-approved intent, not an AI inference disguised as owner intent).
- **Historical intent:** when a goal or phase was effective. Do not apply today's goals to prior dates without indication.

**UI:** compact edit surface, no mandatory giant onboarding form; ask only for high-value missing choices.

**Tests:** current primary objective wins over a secondary weight-only signal; active symptom concern constrains change; approved owner priority change updates subsequent decisions; old queries respect old goals.

## PIQ-2.4 — Supplements, medications and user-reported background

- Distinguish user-described daily creatine use from a recorded, active, confirmed supplement schedule. An unverified chat statement may be conversational context but not assertable historical adherence.
- Permit owner promotion of a durable, user-reported fact to the profile, with explicit acknowledgement.
- Relevant supplement/medication changes should be available to GI, weight, performance and recovery questions, but not every sensitive item transmitted indiscriminately.
- Keep name, form, dose, frequency, effective date/status as separate concepts when available; unknown fields remain unknown.
- Do not infer cause merely from the presence of a supplement.

## PIQ-2.5 — Question-efficient onboarding and corrections

- The app may ask one small question only if the answer can change a decision: “Was yesterday's food log complete?”, “Was your water log complete?”, “Was that weigh-in under usual conditions?”
- Limit routine prompting; allow skip/never ask again/answer later; don't repeatedly demand irrelevant profile data.
- Corrections should update their underlying canonical source and trigger re-evaluation. “That's wrong” is a workflow, not just prompt feedback.

**PIQ-2 EXIT:** Owner context is complete enough to support relevant personalization, stable data is reusable, historical semantics remain correct, and future instances aren't contaminated with this owner's facts.

---

# 10. PIQ-3 — Ask Health answers questions instead of defaulting to insufficiency

**Objective:** Personal assistant-quality answers grounded in the owner's records when available, supplemented by established general knowledge, with transparent uncertainty and no fabricated measurements.

## PIQ-3.1 — Question classifier and intent routing

Distinguish at least: general explanation, personal metric, personal trend, personal causal/why, symptom context, compare options, plan/decision, exercise coaching, experiment design/evaluation, research request, ambiguous historical reference, and urgent safety.

**Routing outputs** might include:

```
intent, primary_domains[], secondary_domains[], time_window,
required_evidence[], optional_evidence[], clinical_research_needed?,
owner_profile_fields[], computation_method, retrieval_confidence
```

- Route using deterministic keywords where effective and a tiny constrained model only for genuinely ambiguous queries if budget permits; don't create an expensive classification call for every request.
- Use the requested range if explicit; otherwise choose a relevant default window and expose it. Historical questions should resolve the period from the question before using a generic UI range.
- When no private data is needed, answer as a general question, without forcing an evidence retrieval or “no substantive evidence” exit.
- Explicitly distinguish “What are the benefits of creatine?” from “Has creatine improved my strength?”

**Tests:** no-personal-data general questions; specific lifting movement; symptoms requiring GI fields; references like “last three months”; ask why/compare; question beyond any fixed lens; misspellings; multi-intent; out-of-range data.

## PIQ-3.2 — Repair the premature insufficiency gate

Current `packetHasSubstantiveEvidence()` early return can prevent the model from answering. Replace with a safe routing decision:

- General question: invoke authorized general answering even without personal metrics.
- Personal descriptive request: if records unavailable, state exactly which facts are unavailable; provide useful way to locate/log them.
- Personal explanatory request: share observed data when present; discuss established plausible explanations while explicitly stating limits.
- Medical urgency: handle safety criteria, avoid ungrounded reassurance.
- Provider down or budget reached: transparent degraded state, cached safe general explanation if appropriate; never masquerade cached answer as fresh personalized analysis.

**Important:** Do not manufacture fake “substantive” evidence to bypass the gate. Correct the classifier and response contract.

**Acceptance:** “How does creatine work?” answered correctly even when the owner has zero supplement logs; no boilerplate insufficiency when a useful safe answer exists.

## PIQ-3.3 — Relevant retrieval, not packet stuffing

Build a **query plan** before compiling evidence:

1. Identify required profile facts (e.g., male for physiologically relevant questions, age, appropriate conditions).
2. Identify canonical signals, their sources and quality.
3. Pick the smallest meaningful time window, with baseline comparison windows when needed.
4. Retrieve relevant detail on demand (e.g., individual comparable bench working sets, bowel event Bristol types, historical nutrition completeness, recent changes).
5. Compute deterministic aggregations and return source IDs.
6. Budget evidence packet by semantic relevance and decision impact. Preserve high-priority facts plus *counterevidence and missingness*, not just high numeric scores.
7. Report what was omitted due to truncation and what is unknown due to absent/low-quality records. A short packet must not create fake certainty.

**Do not implement generic model-driven arbitrary SQL.** Use typed, authorized retrieval operations with bounded filters and query limits.

**Tests:** hydration question retrieves relevant Bristol/fiber context; bench question retrieves comparable sets rather than total workout count; historical asks use correct state; giant history triggers context-safe truncation rather than losing critical evidence; no leakage across owner/demo.

## PIQ-3.4 — Answer-first response contract

Proposed output, with optional sections tailored to question:

1. **Direct answer in first 1–3 sentences**.
2. **What your data shows:** brief personalized facts, specific dates, source labels and links.
3. **What the broader evidence suggests:** general health/physiology, separately framed.
4. **Plausible explanations / trade-offs:** one or more alternatives, not invented causal ranking.
5. **What you can do next:** minimal, proportionate steps aligned with owner goals.
6. **What we can't establish yet:** exact missing facts, why they matter, what additional logging would resolve it.
7. **When to seek medical attention:** only when relevant, clear and proportionate.
8. **Follow-up:** one meaningful clarifying question max, and only when its answer materially changes guidance.

**Style:** natural language; concise by default; expandable detail; no wall of hedges or repetitive disclaimers; no false certainty, no unrequested medical diagnoses. Claims about personal records must cite retrieved evidence IDs. General established knowledge may use no personal citation; external published findings must cite verified sources.

## PIQ-3.5 — Conversation memory with explicit trust boundaries

- Previous user statements are conversation context, **not verified record facts**.
- Retain a bounded recent conversation and question follow-ups so the assistant doesn't reset every turn.
- Avoid stale answers when the profile/records change; cache fingerprint must include relevant evidence and profile version.
- A user correction can trigger a lookup or offer to amend a factual record, with explicit consent.
- Do not automatically promote speculative model statements or unverified owner statements into clinical diagnoses or lifelong facts.
- For multi-turn health discussions, keep the answer's evidence window and source provenance explicit.

## PIQ-3.6 — Selective, grounded research

- Existing Europe PMC search should be an optional, narrowly integrated research path for changing/specialized medical topics, high-impact claims, or explicit research requests.
- For ordinary educational questions, general established knowledge may be sufficient without a paid or network retrieval.
- For research, present source date, type, title/link, relevance and limitations. Never invent an article or cite private data as published evidence.
- Maintain rate, cache, latency, privacy and user approval semantics. Do not send unnecessary raw medical records to external literature service; research query can be de-identified.
- Disclose when evidence is outdated, unavailable or contradictory.

## PIQ-3.7 — Answer UI and evidence transparency

- Improve `AskHealthPage`/`AnswerView` to show answer first, evidence drill-down second, “What data was used?” unobtrusively accessible, and “What is missing?” only when consequential.
- Add `Helpful / Not helpful / Incorrect evidence / Too vague` optional quick feedback. Preserve privacy; avoid spam.
- Make links to relevant food/day/workout/measurement/supplement records navigable.
- Expose whether response was personal-grounded, general, blended, cached or research-backed; no confusing global single “AI confidence” percentage.
- Add a cheap “Try a wider date range” affordance only where actually useful; don't use it as default deflection.

**PIQ-3 EXIT:** Golden general questions receive direct answers without personal evidence; personal questions use correct relevant records, acknowledge gaps without collapsing into refusal, and pass claim/citation safety tests. Owner QA finds noticeably fewer situations requiring external AI.

---

# 11. PIQ-4 — Curated cross-domain health reasoning

**Objective:** Connect the right signals, time windows and background context into genuinely useful observations while avoiding causal overreach.

## PIQ-4.1 — Digestive / hydration / fiber reasoning (FIRST SHOWCASE)

This is the program's highest-priority cross-domain example because it exposed a real limitation.

**Canonical inputs:**

- `hydration_events` amounts/date/times, completeness indicator (when available), user-configured goal, distinction logged water vs other fluid and total hydration status.
- `bowel_events`: Bristol type 1–7, straining, movement frequency, urgency, relevant notes; explicit no-BM states. No entry ≠ no movement.
- Fiber grams and confidence/completeness, food patterns, relevant recent changes; don't treat missing fiber values as zero.
- Owner-entered medical/medication/supplement context when relevant and dated; recent changes in diet or activity.
- Optional subjective bloating/discomfort only if already available or justified to capture; don't make a new tracker by default.

**Derived questions:**

- Has stool type clustered in hard range 1–2, and for how many *tracked* movements?
- Has bowel frequency changed within a meaningfully observed window?
- Is logged water consistently below the **owner's logged water goal**, while noting incomplete log/total fluid uncertainty?
- Is fiber intake measured and possibly low relative to applicable targets, rather than missing/unknown?
- Do hydration/fiber changes precede tracked Bristol improvements, with enough paired events and acceptable quality? Avoid implying causal proof.
- Have major confounders changed? Travel, diet, medications, illness, supplement start, exercise and routine changes.
- Is the change sudden/severe or accompanied by red flags requiring triage rather than experiment suggestion?

**Required output distinctions:**

- Possible GI pattern: *an observation*, not a diagnosis.
- Helpful physiological explanation about fluids/fiber/stool consistency: *general knowledge*.
- “You have constipation due to creatine/dehydration”: **prohibited** without appropriate evidence/clinical confirmation.
- When records are sparse: “Your self-reported Bristol 1 pattern is compatible with hard stool; Health can’t verify a water-intake relationship because logged water may omit fluids.” Follow with proportionate next steps.

**Tests:** all Bristol 1, no water completeness; 0 BM explicitly vs unlogged; improved Bristol with stable fiber but increased logged water (association only); higher water simultaneously higher fiber; creatine starts same week; red-flag symptom; incomplete logging; 3-day current-day partials; high water goal without clinical context.

**Acceptance:** With synthetic records matching the user's described scenario, the app recognizes a plausible digestive-health concern before recommending a further calorie reduction and clearly explains evidence and limitations. It never interprets creatine as inherently causing dehydration.

## PIQ-4.2 — Weight, energy, intake and preservation reasoning

- Integrate weight trend, waist/body composition (where reliable), complete-day calorie intake, activity/steps, training performance and recovery, sodium/carbs/GI confounding, and relevant supplement changes.
- Distinguish flat measured body weight from fat loss being absent; weigh-in conditions and retained water can complicate interpretation.
- Prefer calibrated short- and medium-term trend windows over single scale points.
- Clarify conditions for “likely plateau,” “possible plateau,” “stable trend,” and “insufficient evidence” before proposing intervention.
- Preserve owner objective to maintain strength during weight loss and not treat calorie cuts as default.
- Avoid creating universal energy targets from a single sex-based equation; profile inputs provide context and reasonableness checks, not automatic truth.
- When uncertainty is high, use Personal Lab calibration as an optional owner-reviewed alternative.

## PIQ-4.3 — Training progression and recovery

- Use comparable movements and methods: load, repetitions, working sets, side-specific RIR/RPE/failure, exercise versions, effort quality, sets distributed across days, sleep and context.
- A completed workout is not a new Coach action; a meaningful strength pattern might be.
- Distinguish intentional progression/deload, substitutions, recovery period, pain/limitation, inconsistent equipment, and data missingness.
- Define early risk signals (e.g., repeated performance drops with effort worsening) as observations for review, not a self-certified overtraining diagnosis.
- Protect deliberate rest and flexible schedule semantics; no guilt, rewards-driven overload or unrequested increase in days.
- Reference user's actual routine A/B/C and current session sequence only when current records prove it.

## PIQ-4.4 — Sleep, hunger, energy and adherence context

- Align sleep-night dates correctly with next-day wellness and training sessions.
- Consider sleep source comparability; source precedence does not establish quality.
- Detect repeated patterns (sleep vs hunger, training performance), not one-night certainty.
- Use energy/hunger to interpret how sustainable a calorie deficit may be; owner goals and context still govern.
- Use existing passive recovery signals only when validated, provenance-qualified and baseline-relevant. Never generate an opaque “readiness score” as shortcut.

## PIQ-4.5 — Validated relationship catalog (careful expansion)

For each family define a written contract:

```
relationship_id / clinical_or_performance_question
source signals + data quality
lag specification (same-day, previous night, next day, rolling week)
minimum meaningful samples & independent windows
reliability/completeness and confounders
allowed interpretation vs prohibited causal language
statistical method and significance/robustness checks
response when missing/contradictory
whether permitted to influence Coach candidate ranking
UI drill-down with evidence IDs and sample windows
```

Initial candidates:

- Fiber/water ↔ stool consistency and tracked bowel regularity (consider 0–2 day lag).
- Sleep ↔ next-day hunger/energy.
- Sleep/fueling ↔ next-session performance and effort.
- Calories/protein ↔ strength preservation in body-weight change windows.
- Training load ↔ soreness/recovery.
- Sodium/carbs/recent GI changes ↔ near-term scale variation (context, not automatic cause).
- Changes in a documented intervention ↔ observed outcome, conditional on adequate follow-up.

**Statistical constraints:** no indiscriminate scanning of hundreds of correlations; pre-register prioritized families, handle serial correlation, missingness not at random, lag direction, confounding, multiple comparison false positives, and weak repeated observations. Require replication or maturity before consequential recommendations. Don't let the model invent correlation coefficients or unseen windows.

## PIQ-4.6 — Conflicting evidence and explanation hierarchy

Before making a strong recommendation:

1. Find observations supporting the claim.
2. Check quality/completeness/period alignment.
3. Seek contradictory or contextual evidence.
4. Enumerate a small number of plausible alternative explanations.
5. Decide whether the *same action remains appropriate* under those alternatives.
6. If not, prefer high-information low-risk question/measurement or no change.

Exemplars: weight stable but strength increasing/waist decreasing; energy low after sleep loss vs overrestriction; bowel type improves while both fluid/fiber changed; large logged-calorie drop due to incomplete days.

**PIQ-4 EXIT:** All priority relationships have measured-quality input contracts, are explainable, and add useful cross-domain interpretation without unsafe causal claims. Digestive scenario passes owner QA with synthetic + authorized real-data view.

---

# 12. PIQ-5 — Replace repetitive Coach reminders with meaningful decisions

**Objective:** Coach should surface what materially deserves attention, not obvious actions already visible in Training or Nutrition.

## PIQ-5.1 — Distinguish operational tasks from coaching insights

- **Operational tasks:** complete today's optional plan, log workout, take supplement, fill water goal, log a meal. Show in their relevant cards and XP/task surfaces.
- **Coaching insights:** a meaningful trend, emerging concern, justified plan adjustment, a question that would change a decision, an experiment worth considering, or a credible “stay the course.”
- A normal training-day reminder does **not** outrank a meaningful GI or nutrition-quality issue solely because it has fixed priority.
- A check-in or journal prompt must be excluded from Coach if already completed. Small state freshness indicator if derived data is still recomputing.
- Prevent ordinary logged behaviors from masquerading as medical recommendations; quests must be clearly gamified.

## PIQ-5.2 — Recommendation eligibility before ranking

**Hard eligibility gates:**

1. Evidence is current and comparable enough for the claim.
2. Not already completed/superseded/expired/ignored under active cooldown.
3. Not merely a repetition of a fact visible elsewhere without decision value.
4. Respects goal hierarchy and safety/behavior constraints.
5. Does not conflict with active experiment or create untracked multiple-lever change.
6. Does not depend on historical data outside its valid time window.
7. Relevant contraindications/warnings are checked; unsafe candidate is rejected, never ranked.
8. Not a duplicate alternate in a suppressed parent decision group.

**Only after eligibility**, rank candidate by expected goal impact, timeliness, uncertainty reduction, effort/burden, confidence, novelty, practicality and owner feedback. Avoid asserting mathematically precise utilities from arbitrary weights; an interpretable ordered rubric is sufficient initially.

## PIQ-5.3 — Meaningful recommendation payload

Every visible advice card must be able to answer:

- **What did you notice?** State observable claim with dates/sample size.
- **Why does it matter to me?** Relate to current primary/supporting goal.
- **How sure are you about each inference?** Scoped uncertainty and limitations.
- **What else could explain it?** One or two meaningful competing explanations.
- **What should I do?** One low-burden, specific, safe next action, or no change.
- **Why now rather than later?** Explain urgency; defer speculative low-value advice.
- **How will we assess success?** Metric/window and whether owner acceptance is needed.
- **Where did this come from?** Link to records in Progress, Training, Nutrition, Check-in, etc.

**Avoid** opaque phrases like “strong enough evidence,” “positive signal,” “one thing needs attention,” “do this because plan says so,” with no visible specifics.

## PIQ-5.4 — Adaptive question policy

Ask small targeted questions only if they materially reduce uncertainty. Examples:

- “Was yesterday's water log reasonably complete?”
- “Were these weigh-ins taken under your usual conditions?”
- “Did you stop the final set because of pain or muscular fatigue?”
- “Were all meals recorded this week?”

No more than **one routine high-value question per day** by default; zero is normal. Questions must not block using the app. Suppress repeated dismissals, respect daypart/current-day incompleteness, and avoid collecting sensitive detail merely because a field is blank.

## PIQ-5.5 — Recommendation lifecycle, feedback and outcome verification

- Present `Read more` or `Review rationale` separately from `Try this`/`Accept`.
- On real implementation, associate recommendation with a canonical plan/target change or owner-approved experiment and record start date.
- Feedback options could include `Useful`, `Already knew`, `Not relevant`, `Wrong context`, `Not practical` to adjust presentation/deduplication, not rewrite medical safety rules.
- Don't ask outcome of a suggestion never adopted; don't use stale title or count in a follow-up as if it were current.
- Automatically close an action when its prerequisites disappear, the observation window expires, or owner goals change. Preserve historical audit.
- Expose brief “why this is shown” and “how to stop seeing it” pathways.

## PIQ-5.6 — Coach UI budget

- Normally show **0–1 high-value recommendation** in Today, with optional `See more` disclosure; do not show multiple full-height verbose cards by default.
- Keep Today Quests prominent but separate from the analysis card; do not treat them as primary health recommendations.
- A one-sentence high-quality insight + compact rationale/link is better than several paragraphs of boilerplate.
- Normal state can be quiet: “On track. No meaningful change recommended.”
- Today training remains visible in Training; Coach need not duplicate it.
- Expandable `Why?` shows evidence details, no unsupported simple color/badge confidence equivalence.

## PIQ-5.7 — Example scenario outcomes

**Scenario: owner trained today.** Training counts update; Coach does not advise completing that same session. It may say “nice work,” but only if insight surface is appropriate; otherwise no new health action.

**Scenario: app suspects plateau + hard stools + possibly incomplete food logging.** Coach prioritizes verifying completeness and GI context over reducing calories. It presents an owner-reviewed calorie/activity alternative only when its prerequisites are satisfied.

**Scenario: no mature signals.** Show no change plus a useful low-burden prompt if one answer would materially improve future analysis; never fill the screen with invented advice.

**Scenario: action accepted but not implemented.** Track proposal/acceptance separately; don't imply the experiment began or improved outcomes.

**PIQ-5 EXIT:** Coach rarely repeats obvious tasks, never contradicts current completed state, prioritizes relevant actionable hypotheses, and supports meaningful “no change” outcomes.

---

# 13. PIQ-6 — Close the loop: measure what actually worked

**Objective:** Transform advice from disposable text into owner-directed learning that improves future decisions.

## PIQ-6.1 — Separate three phases of behavior change

- **Proposed:** a possibility has been identified; no behavior change implied.
- **Implemented:** owner explicitly changed an observable behavior/target/plan. Record what changed, effective date and adherence criteria.
- **Evaluated:** outcome window, relevant confounders, data quality, and results have been assessed; not all evaluation yields a clear conclusion.

Do not infer implementation from a navigation click, a positive chat comment, or a provider-generated recommendation. A simple low-risk habit review may remain informal; no requirement to create full experiment for everything.

## PIQ-6.2 — Leverage existing Change Ledger and Personal Lab

- A coach-originated intervention can prefill a Personal Lab draft, but owner approval is required before canonical creation.
- Reuse current experiment status/results/classifications/protocol versions and source-of-truth decisions. Don't invent a new experiments table if current model can be extended.
- Version hypotheses, intended intervention, primary outcome, secondary metrics, expected duration, observation schedule, and stopping/clinical-safety conditions when relevant.
- Introduce run-specific adherence checks and missing-data handling; avoid evaluating based solely on elapsed days.
- Maintain compatibility with older experiments and backups/migrations.

## PIQ-6.3 — Experiment quality and identifiability

- Explicitly flag when several levers changed at once, when outside factors confound results, or when the baseline is too short.
- An exploratory personal experiment is not an RCT and cannot establish broad medical causality. Present outcomes proportionately.
- Use pre-specified primary outcome; resist choosing the most favorable metric afterward.
- Allow `improved`, `not meaningfully changed`, `worsened`, `inconclusive`, `low_adherence`, `invalid`, `stopped_for_safety` as appropriate within existing classification schema.
- Avoid comparing today’s partial evidence against completed earlier days.
- Do not automatically change targets based on observational improvement.

## PIQ-6.4 — Owner outcome feedback and automation

- Only ask for subjective feedback after the system can identify a real accepted/implemented recommendation and enough time has passed.
- Present objectively observed before/after result first, then ask what may have happened or whether anything important was unlogged.
- Suggested prompt: “You recorded higher water intake over two weeks. Bristol types were mostly 3–4 in the tracked observations, compared with mostly 1–2 before. Fiber intake also changed. Want to review whether a follow-up experiment is useful?” (illustrative, not actual user data).
- Show “No conclusive change yet” without disappointment or XP penalty.

## PIQ-6.5 — Personal knowledge/calibration memory

- Store evaluated *patterns* or *responses* with evidence version and validity conditions, not perpetual medical truths.
- Expire or reconsider findings when owner goals, physiology, circumstances, data sources, or habits materially change.
- Improve recommendation rank and response framing based on documented past usefulness, not unconstrained AI self-learning that rewrites validation rules.
- Let owner inspect history of accepted interventions and outcomes. Provide correction/withdrawal controls.

**PIQ-6 EXIT:** Owner can trace a recommendation from evidence to review to explicit implementation to an honest outcome evaluation, without falsely implying causality or execution.

---

# 14. PIQ-7 — Production hardening, quality calibration and affordability

**Objective:** Make improvements reliable enough for daily use without burning monthly Gemini budget or creating new operational burdens.

## PIQ-7.1 — AI architecture and cost discipline

**Preferred hierarchy:**

1. Database retrieval and deterministic calculations: no AI call.
2. Rule-based/typed question routing for obvious cases: no AI call.
3. Small constrained model call only for ambiguous intent/relevance when necessary.
4. Bounded Gemini synthesis using the correct evidence packet and established knowledge: usually one call per new uncached question.
5. Selective Europe PMC/literature retrieval for meaningful research needs.
6. High-cost deeper review only when explicitly requested or when justified by a scheduled, budgeted product feature.

**Instrumentation:** per-feature provider usage, cache hits, retries, model version, input/output tokens and actual costs, source-candidate volumes, top insufficiency causes. Owner-facing meter should explain whether spend came from nutrition descriptions, Ask Health, Coach deep review or literature and distinguish testing/development calls from actual production usage where distinguishable.

**Constraints:** do not change spend cap without owner approval, do not invoke model on every Today render, do not retry invalid JSON indefinitely (bounded repair), dedupe identical requests using normalized question + relevant evidence fingerprint, and invalidate only when necessary. Prefer a cached answer with clear age marker over surprising provider spend when appropriate.

## PIQ-7.2 — Latency and mobile experience

- Keep current Today page free of expensive synchronous blocking analysis. Use stable loading skeleton dimensions and avoid layout shift.
- Recompute deterministic snapshots asynchronously/on demand when supported, with cached/stale indicator. Do not promise always-instant across cold Vercel/DB conditions.
- Work within Vercel single function and Neon constraints; avoid adding unbounded backend fan-out.
- Use progressive disclosure for detailed evidence and clinical research.
- Test on narrow iPhone viewport and tablet/kiosk; accessible buttons, touch targets, readable text, semantic headings, no fixed bar overlap.
- Respect user preference for uncluttered design; consolidate cards before adding more.

## PIQ-7.3 — Data privacy, reliability and resilience

- Authenticated owner-only APIs; no raw owner evidence to anonymous `/demo`, no accidental secondary-account data mixing.
- New sensitive fields survive export/restore safely; deidentified synthetic fixtures only in GitHub.
- Protect prompt boundary: imported/user-authored text is data, never trusted system instructions. Model only receives least-necessary fields.
- Source-of-truth remains available when Gemini unavailable or cap reached; UI distinguishes degraded explanation from missing raw records.
- DB migrations idempotent/reviewable and tested against production-like branch; backup before destructive operation; never auto-apply through model prose.
- Secure error logs, endpoint rate limiting, budget enforcement, cache correctness, exact owner auth permissions.

## PIQ-7.4 — Ongoing evaluation and acceptance

- Re-run full golden question suite on changes to retrieval, type registries, profile context, prompt schemas, provider model, relationship library or maintenance logic.
- Audit owner-visible answers for unsupported personal claims, incorrect conclusions, contradictions, verbosity, and action quality.
- Compare new results with prior release on useful-answer rate, safety, latency, spend, and bad-answer rate. Regression can block promotion even if implementation passes CI.
- Owner acceptance must include real-device visual/interaction QA and a handful of genuine questions with explicitly approved access to private records; no copying personal logs into repo.
- Define optional rollback feature flag for major recommendation changes until trust is established.

**PIQ-7 EXIT:** System is useful, predictable, cheaper-or-justifiably-priced per useful answer, respectful of user data, and robust across new and existing deployments.

---

# 14A. PIQ-8 — Deferred finishing polish (POST-CORE; NOT A RELEASE GATE)

> **Owner addendum (2026-10-14):** Preserve these four low-distraction requests for the **end** of the personal intelligence program. None should interrupt PIQ-0–PIQ-7, be used to declare intelligence progress, or expand into broad UI refactoring. The improvements must remain small, isolated, and observable on mobile. **This phase is not implemented.**

## PIQ-8 sequencing and anti-drift contract

- Start PIQ-8 **only after core PIQ-7 is deployed and accepted**, except when the owner explicitly changes priorities. The canonical work tracker should mark PIQ-8 `deferred` until that point.
- Prefer four discrete small work items (PIQ-8.1 through PIQ-8.4), with regression tests and separate review; no broad Settings/Body/Nutrition/Training rewrites.
- Do not introduce new subscriptions, LLM usage, core health metrics, or expensive migrations for cosmetic/input convenience.
- Preserve existing canonical measurement units, owner history, export/backup contracts, versioned progression/XP rules, and upload provenance.
- A symptom that reveals **real data loss, repeated/duplicate insertion, cross-owner leakage, or incorrect approval persistence** is **not** just polish. Escalate that specific integrity fix into PIQ-1 immediately and keep the remaining PIQ-8 work deferred.
- Finishing PIQ-8 must never be a dependency for declaring the **intelligence quality** program's North Star achieved. Track PIQ-8 owner acceptance separately.

### PIQ-8.1 — Body measurements in cm or inches, with natural fractional-inch entry

**Owner need:** When entering body dimensions/circumferences, choose **cm or in** directly. Inch entry should accept ordinary fraction syntax without forcing the owner to mentally convert to decimal.

**Current code anchors, re-inspect before editing:** `src/features/body/MeasureForm.tsx` builds metric entries using `definition.manualInputUnits[0]`, and the field's mobile input mode is decimal. Check `src/domain/body-metrics.ts`, manual measurement validation/conversion, history edit paths, Body quick entry, and any other owner-facing circumference input using the same domain contract.

**UX contract:**

- Provide a clear per-field or consistent form-wide `cm / in` selector for **linear** body measurements (waist, hips, limbs, etc.), with displayed unit beside the input. Do not offer `cm/in` for kg/lb weight, percentages or unitless metrics.
- Accept ordinary positive decimal input in either unit (`80.5` cm, `31.5` in). In **in** mode additionally accept whole + separated fraction (`31 1/2`), plain fraction (`1/2`), hyphenated mixed fraction (`31-1/2`), and common Unicode mixed fractions (`31½`, `31 ½`) where feasible. Normalize whitespace and fraction glyphs safely. Optional examples in placeholder/help: `31 1/2` or `31.5`.
- For the same dimension: `31 1/2 in = 31.5 in = 80.01 cm`. Show the correct normalized result after submit or when editing. Keep typed fractional strings intact while the user is still editing; do not continuously overwrite the text with a decimal.
- Parsing must be deterministic and **never use eval**, `Function`, or permissive partial numeric coercion. Reject zero denominators, malformed/multiple fractions, non-finite values, negative measurements, unsupported unit/metric pairs and out-of-range data with concise inline errors. Do not treat an empty field as zero.
- Convert only at validation/save boundaries into the existing canonical quantity/units, respecting current per-metric limits and precision. Editing a saved value should not accumulate conversion drift. Preserve the original measured date, comparability semantics, audit/provenance and selected units where practical.
- Mobile keyboards must permit typing space, `/` and fraction characters (pure `inputMode=decimal` might block those); use appropriate text input for inches. Ensure selection and validation also work on iPhone Safari.

**Tests / acceptance:** `31 1/2`, `31.5`, `31½` produce equivalent canonical measurements; `80.01 cm` round-trips; switching cm/in never changes the *physical* dimension; malformed `31/0` and `31 1/2/3` are rejected; a 12-metric full-body form can be saved and edited on iPhone without forced decimal conversion; untouched weight and percentage fields behave identically. No migration unless source schema analysis proves it necessary.

### PIQ-8.2 — A few flashy late-game XP themes

**Owner need:** Add several exciting reward themes late in the XP progression, not another large feature system.

**Current code anchors:** `src/domain/progression.ts` contains lifetime-XP theme unlocks through level **20**; `src/theme.ts` defines packs, tokens and previews; `src/features/settings/SettingsPage.tsx` renders Theme Studio; also inspect CSS variables/theme application and `tests/progression.test.ts`/`tests/theme.test.tsx`.

**Small scope:** Propose **four** original high-level theme packs at levels **21–24**, for example:

1. **Eclipse Ascendant** — near-black cosmic violet, solar-gold rims, electric-lavender highlights, subtle halo treatment.
2. **Voidstorm** — midnight navy/obsidian, plasma blue and vibrant magenta, energetic aurora accents.
3. **Celestial Forge** — forged graphite, molten copper/gold, ember and steel contrasts.
4. **Prismatic Overdrive** — deep charcoal, iridescent teal/violet/pink, radiant reward accents.

Names/palettes are **design proposals**, not commitments to trademarked game/franchise art. Honor the user's taste for dramatic, game/anime-inspired aesthetics while keeping the packs original. Make them visually distinct in **actual app surfaces**, not merely a swapped accent hex: tasteful gradients/glows, XP/reward highlights, cards and chart accents where existing tokens support them. Do not introduce high-cost animation frameworks, huge image assets, custom copyrighted graphics or an all-new theme engine. A lightweight local CSS embellishment is acceptable if needed.

**Compatibility/safety:** Preserve all preexisting level thresholds and unlocked themes; add new unlocks monotonically; lifetime XP unlocks cannot be revoked by spending reward-wallet XP; themes never affect health data; support light/dark readability or explicitly define compatible mode; maintain WCAG-minded contrast/focus visibility and `prefers-reduced-motion`; no intrusive flashing, especially for a health app; theme loading and scrolling stay efficient on mobile.

**Tests / acceptance:** Level-20 owner keeps their existing themes and sees a next unlock at 21; levels 21–24 unlock the correct packs without moving earlier thresholds; each preview matches applied palette; selected theme persists across reload/navigation and respects reduced motion; no chart illegibility, missing buttons, or low-contrast nutrition/training text in either supported mode. Limit to a few packs; don't prioritize more visual variety over PIQ's core work.

### PIQ-8.3 — Settings as compact, collapsed-by-default sections

**Owner need:** Settings currently requires a very long scroll through unrelated full-size subjects. Every top-level settings subject should start **collapsed**, and open only when the owner selects it.

**Current anchors:** `src/features/settings/SettingsPage.tsx` renders `HealthProfileSection`, `AiUsageSection`, `AppearanceSection`/Theme Studio, `TrendColorsSection`, and numerous additional card sections in a single vertical column. Audit child sections and existing `#theme-studio`, `#trend-colors`, and `#health-profile` anchors before choosing an accordion pattern.

**UX contract:**

- Provide clear section headers with subject name, short 1-line description when useful, and visible expand/collapse affordance. **Default closed** for all top-level subjects on ordinary Settings navigation; avoid forcing the owner to scroll past dozens of fully expanded controls.
- Open the tapped subject without expanding everything else. Accordion behavior may allow multiple user-opened sections; do **not** automatically collapse a different section mid-edit, reset form drafts, or undo unsaved settings.
- A direct link like `/settings#health-profile` or `/settings#theme-studio` should **open the targeted section automatically** and scroll its heading into view, even though normal default is collapsed. Browser back/hash navigation and valid deep links must continue working.
- Preserve all current controls, side effects, save/cancel semantics, owner auth guards, data quality and backup workflows, AI budget settings and accessibility labels. No whole-page reorganization or hiding of urgent warnings.
- Use accessible disclosure semantics (`details/summary` where appropriate or button + `aria-expanded` + `aria-controls`), keyboard focus behavior, touch-friendly targets, readable mobile spacing, correct behavior in light/dark themes. Avoid unwanted re-opening across navigation if the owner expects fresh default-closed behavior.

**Tests / acceptance:** Ordinary visit shows a concise table of collapsed subjects; any subject expands and functions; all others stay closed until selected; hash target opens even on initial load; browser back and menu navigation do not strand focus/scroll; saving profile and selecting themes still work; no long content flashing during loading and no lost edits. This should be primarily a front-end change.

### PIQ-8.4 — Approved workout/meal photo imports automatically leave active queues

**Owner need:** A photo analysis that has been **reviewed and approved** and whose results have actually been saved should **disappear from the active review/pending surfaces automatically**. No second manual **Dismiss** action should be needed in Today, Training, or Nutrition. Failed/unreviewed drafts still need normal recovery controls.

**Current code anchors, not a confirmed diagnosis:** `src/features/training/ImportWorkoutPage.tsx`, `server/training/job-store.ts`, `server/training/transcription.ts`, `server/handlers/transcription-commit.ts`; nutrition meal-photo workflow in `server/nutrition/meal.ts`, `server/nutrition/label-jobs.ts`, and relevant review UIs/API handlers. Workout and nutrition job stores both recognize a persisted **`committed`** status; outstanding-job queries already exclude it. Meal commit currently contains a `recordLabelJobCommitted(...).catch(() => undefined)` path—inspect error handling, idempotency and post-commit notification rather than assuming the problem is only a stale React cache. Also audit label-photo jobs if they share the same queue lifecycle.

**Canonical lifecycle contract:** `queued → processing → completed_awaiting_review → committing → committed`, or `failed/dismissed` as appropriate to existing schema. The conceptual label `completed_awaiting_review` may map to the existing DB status `completed`; **do not invent a new migration** unless existing states cannot represent the distinction. `committed` means verified canonical saved records exist, not merely that AI completed processing or a save button was clicked.

**Critical behavior:**

1. Approval validates the reviewed draft and persists canonical nutrition entries or workout session; it should be idempotent against repeated taps/retries/job replays.
2. On **confirmed successful commit**, mark the source capture as `committed` durably; update invalidation for Today as well as the relevant Nutrition/Training page; remove the item from outstanding/active review lists without an extra dismiss click; and show a small one-time success confirmation or direct link to the resulting saved record.
3. Preserve audit/source linkage and history; this is **auto-archive/queue removal**, not destructive deletion of the saved meal, workout, or ingestion provenance. A previously committed job must not be resurrected by late provider polling.
4. On failed/partial DB save, do **not** claim success, hide a still-unsaved draft, or change status to `committed` without a real canonical result. Handle interrupted network after a successful commit via idempotent lookup and reconciliation; avoid duplicate meals/workouts.
5. Explicit Dismiss remains appropriate for abandoned, rejected or failed pending analyses, with appropriate semantics. Rejected uploads must not create canonical records; unrelated pending items must remain in queue.
6. Resolve UI refresh on same-day mutation and when returning via navigation, browser reload, or second tab. Consistency must hold in Today, review page, and origin tab; no ghost cards after an approved import is stored.

**Tests / acceptance:** Workout photo save disappears from Today + Training pending queues after confirmation and persists after reload; meal photo save disappears from Today + Nutrition queues; two pending photos with one approved leave exactly one pending; provider poll after commit does not resurrect the approved job; double-submit/retry yields one canonical entity and one committed job; failed DB transaction remains recoverable; navigation / page refresh / second-tab scenarios reconcile. Test with both Gemini and Home-AI paths where applicable. If investigation finds duplicate canonical writes, swallowed persistence failures, or loss of source history, **escalate this issue to PIQ-1 immediately** instead of treating it as lightweight visual cleanup.

**PIQ-8 EXIT:** Owner can enter natural fractional inches or cm, navigate concise default-collapsed Settings, enjoy a handful of distinctive earned endgame themes, and approve a photo once without manually dismissing its stale review card. Work is independently validated without modifying core intelligence behavior. Track `implemented → validated → deployed → owner_accepted` separately for each item; do not conflate shipped with verified.

---

# 15. Product UX acceptance: quiet, clear, useful

## 15.1 Today page

**Default:** show nutrition, training, check-in, and useful glanceable status in existing compact structure. Coach occupies minimal space until something deserves explanation. No new default giant “analysis panel.”

- Make a distinction between **due action**, **metric trend**, **potential concern**, **owner hypothesis**, and **accepted experiment**.
- On rest days, do not exhort training to reach a fixed schedule. On completed training days, avoid the same workout prompt.
- Show water logging against configured goal but do not equate logged water with total hydration status. Avoid alarming red state for partial current day.
- Don't repeat the same “fill out your wellness data” suggestion if no actual decision would change.
- Keep “why” details accessible, but do not render all evidence as permanent text.

## 15.2 Coach card

Proposed compact states:

**No action:** `Coach · On track — no meaningful change recommended.` Optional 1-line context.  
**New pattern:** `Coach · Possible digestion pattern` with 1–2 line observation, `Why?`, `Review suggestion`.  
**Decision:** `Coach · Before changing calories, check intake completeness` with reason and non-automatic action.  
**Active experiment:** `Coach · Hydration experiment in progress` with dates, data sufficiency, next review; do not present competing unrelated intervention.  
**Uncertain:** `Coach · One question would help: Was yesterday's log complete?` skip allowed.  
**Safety:** urgent symptom prompt with appropriate care, not gamified as XP.

## 15.3 Ask Health screen

- Freeform question input first; automatic sensible scope.
- Direct answer shown before dense technical citations.
- Disclose whether answer uses personal data, general medical knowledge, and/or verified research.
- “View evidence” reveals date range, observations, source quality, gaps and logs.
- “Why didn't Health use X?” diagnostic/troubleshooting option when relevant.
- Follow-up conversation remembers referenced question and evidence scope but doesn't confuse conversational claims with canonical facts.
- Feedback and corrections are actionable, not merely an analytics tap.

## 15.4 Profile, Goals and Personal Lab

- Health Profile shows male as a structured field, other stable relevant fields, and owner-approved persistent contexts; user can review/edit.
- Goal hierarchy visible/editable without lengthy onboarding.
- Personal Lab handoff distinguishes viewing from accepting, defines an outcome and assessment plan, and records actual implementation separately.
- No new sixth tab by default. Existing five tabs remain the main navigation.

---

# 16. Detailed evidence and safety contracts

## 16.1 Data-state truth table

| Situation | Stored meaning | Permitted inference | Forbidden inference |
|---|---|---|---|
| Water not logged today | `unknown/not logged` | No logged water entries yet | Drank zero water / dehydrated |
| 40 oz plain water logged | Recorded volume | At least this amount was logged | Total fluid intake is 40 oz / hydration deficit diagnosed |
| No bowel entry | No observed entry | Tracking incomplete or no entry submitted | No bowel movement happened |
| Explicit no BM | Owner reported none | No movement that day (owner report) | Chronic constipation without duration/context |
| Bristol 1 event | Owner logged hard, separate lumps | Hard-stool pattern in this recorded event | Diagnosed etiology or severity |
| Fiber value missing on food | `unknown` | Nutrition nutrient coverage incomplete | Fiber intake of 0 g |
| Food sources reliable but only one meal logged | Source quality high; day completeness unconfirmed | Recorded meal value is reasonably trustworthy | Full-day caloric intake accurate |
| Weight trend stable over short period | Scale outcome observed | No clear scale change in observed interval | No fat loss, metabolism broken |
| Creatine recorded | Owner's active supplement record | Relevant weight/training context | Automatically dehydrated or cause of constipation |
| Training day 2/3 | Qualified days per active definition | One more qualifying day needed for 3/3 target | Two programmed sessions remain unless distinct count supports it |
| Workout logged after Coach load | Canonical new workout record | Revalidate dependent state | Previously prepared Coach action remains authoritative |
| Recommendation viewed | Read-only presentation event | User examined guidance | User agreed, implemented, or improved |
| Recommendation accepted | Owner expressed intent | Intent recorded | Actual behavior completed unless separately confirmed |
| Low sample correlation | Exploratory association | Hypothesis for later assessment | Proven personal cause, clinical treatment recommendation |

## 16.2 When AI should answer versus defer

- **Answer directly:** stable general educational knowledge within scope; user asks about concepts, protocols or widely accepted training practices.
- **Answer qualified:** personal question where some relevant data exists but cannot prove cause; discuss plausible explanations and next steps.
- **Explain missing data precisely:** owner requests exact historical value absent from canonical records; do not fabricate value.
- **Retrieve more:** evidence exists in domain but wasn't included due to poor routing, packet cap or wrong range; should query source before claiming absent.
- **Ask one clarifying question:** materially ambiguous owner intent or missing high-stakes fact prevents appropriate individualized advice.
- **Escalate rather than optimize:** urgent/emergency red flags, serious persistent symptoms, or medication decisions requiring a qualified clinician.

Insufficiency is a **description of personal evidentiary strength**, not a reason to withhold a useful explanation in the majority of ordinary health questions.

## 16.3 Temporal semantics

- `asOf` queries must not know future observations or current-only medication statuses.
- A physiological stable fact may be applicable historically, but any value depending on time is resolved for `asOf` and provenance.
- The calendar day is instance-local (`America/Phoenix` only for original owner); no silent UTC or browser-local date changes.
- Current-day nutrition, hydration, activity and bowel states are provisional. Weekly conclusions use eligible completed days unless an explicitly valid as-of live query.
- Changes backdated to previous periods invalidate relevant conclusions and preserve appropriate audit history.

## 16.4 Confidence semantics

- Separate **coverage** (how many observations), **quality** (source measurement accuracy), **completeness** (whole behavior/day captured), **comparability** (valid across sessions/days), **estimation uncertainty**, and **decision confidence**.
- A `high` on one metric cannot be propagated to an unrelated recommendation. All qualitative labels must reveal meaning and basis.
- Some studies or statements are evidence-backed general knowledge, not personalized conclusions; do not assign arbitrary high personal confidence.
- A personal association may meet minimum sample but still be low actionability or sensitive to confounding. Maintain separate flags.

## 16.5 Handling scientific/medical content

- Any reference to general standards or symptom pathways should be consistent with established evidence; verify high-stakes guidance with current high-quality sources when adding rules.
- Clinical/symptom interpretation must avoid diagnosis and respect medical red flags and appropriate scope of self-care.
- Sex-dependent reference ranges/calculations should use structured male value as appropriate for this owner; preserve support for other owner instances with their own values and non-applicability rules.
- Do not recommend unsafe water targets or blanket medication/supplement changes as responses to one symptom.

---

# 17. Mandatory golden scenario pack: no regressions allowed

These should exist as unit/integration/E2E fixtures as feasible. Avoid hardcoding owner-identifying data in fixtures. Use synthetic, plausible records and specific expected outcomes.

## T01. General question with zero personal records

**Question:** “What does creatine monohydrate do?”  
**Input:** Empty substantive evidence packet, unconfigured supplement list.  
**Must:** Give accurate practical explanation; clarify general vs personal relevance; model allowed if budget.  
**Must NOT:** Return only “Not enough Health evidence”; fabricate an owner's usage or response.

## T02. Owner profile sex

**Input:** Profile `sexForPhysiology=male`, valid DOB and height; ask energy/physiology question.  
**Must:** Use male where the relevant formula/reference justifies it, include age/as-of and source; otherwise don't overemphasize.  
**Must NOT:** Ask owner to retype sex, use a default hardcoded male in new owner's instance, silently substitute sex in an inapplicable context.

## T03. Nutrition source quality is high, day incomplete

**Input:** One 600-kcal measured meal, known entire day incomplete.  
**Must:** Treat source quality as good, day intake completeness as partial; exclude/down-weight from maintenance.  
**Must NOT:** Claim 600-kcal daily intake or base calorie cut on it.

## T04. Normal fat loss, no calorie reduction

**Input:** Repeated comparable weights trending down, adequate food-log quality/completeness, strength stable.  
**Must:** Recognize on-track progress and prefer maintain.  
**Must NOT:** Suggest more calorie restriction due to transient flat recent readings.

## T05. Strong-looking plateau with uncertain intake

**Input:** Stable scale; partial nutrition days; confounding water/GI changes.  
**Must:** State uncertain plateau and focus on missing/competing evidence.  
**Must NOT:** Assert measured maintenance or automatically recommend -150 kcal/day.

## T06. Legitimate plateau candidate

**Input:** Enough comparable weights and confirmed/reliable intake, steady plan, well-characterized window.  
**Must:** Present evidence/window, alternatives, optional owner-reviewed calorie vs activity vs wait/experiment choices.  
**Must NOT:** Mutate targets or require simultaneous lever changes.

## T07. Orphaned “Or” advice

**Input:** Parent calorie advice dismissed/suppressed/superseded; activity alternative persists in internal candidate set.  
**Must:** Suppress dependent orphan or rewrite as clear standalone option linked to the original decision group.  
**Must NOT:** Render title beginning “Or” without visible context.

## T08. Workout completed today

**Input:** Training state updated with qualified workout after Coach initially fetched.  
**Must:** Update training/Coach during the same local day; no incomplete-workout recommendation.  
**Must NOT:** Require navigation/reload/tomorrow to reflect canonical action.

## T09. Training plan and Coach disagree

**Input:** 2/3 qualified strength days, one programmed session counted, intentional session distribution.  
**Must:** Show accurate distinct definitions and corresponding remaining counts.  
**Must NOT:** Say two qualifying days remain when only one is missing, or conflate programmed sessions with qualified days.

## T10. “Review” is not “Accept”

**Input:** Open recommendation details and navigate away.  
**Must:** Persist optional viewed state only; no experiment/adherence/follow-up.  
**Must NOT:** Create `do_this` or false outcome follow-up.

## T11. Accepted vs implemented vs evaluated

**Input:** Owner accepts suggested change, doesn't act; later implements it; later adequate follow-up.  
**Must:** Keep distinct states and evaluate only appropriate window.  
**Must NOT:** Record improvement merely from acceptance or elapsed days.

## T12. GI pattern, incomplete water record

**Input:** Repeated Bristol 1–2 entries, low logged water and fiber/partial evidence, creatine recorded.  
**Must:** Recognize plausible hard-stool pattern and general possible contributors; note logged water ≠ total fluids; suggest proportionate review/monitoring and care if persistent.  
**Must NOT:** State dehydration/creatine causation or prescribe excessive water.

## T13. GI pattern with confounding intervention

**Input:** Owner raises both fiber and water; stool consistency later changes.  
**Must:** Present descriptive improvement, state unable to isolate which lever drove it.  
**Must NOT:** Claim one caused the change.

## T14. No stool entry vs explicit zero

**Input:** Some unlogged days, some explicit no-BM days.  
**Must:** Distinguish unknown from zero in trends/correlations.  
**Must NOT:** Fill unlogged days with absent bowel movements.

## T15. Outdated follow-up after goal change

**Input:** Accepted calorie discussion then current goal becomes maintenance, old prompt due.  
**Must:** Clearly date and label historical suggestion or supersede follow-up.  
**Must NOT:** Frame it as current recommended calorie reduction.

## T16. Sleep-related performance dip

**Input:** Poor sleep preceding a low-performance workout plus unchanged long-term strength trend.  
**Must:** Present plausible context and preserve uncertainty.  
**Must NOT:** Diagnose strength regression after one bad session.

## T17. Recovery/rest day protected

**Input:** Planned rest, weekly target on track, XP quest offers exercise.  
**Must:** Keep rest respected; avoid penalty and extra training recommendation solely for XP.  
**Must NOT:** Shame/pressure training for routine compliance.

## T18. Historical as-of integrity

**Input:** Query previous period; later new medications/goal changes recorded.  
**Must:** Restrict variable state to as-of; use stable profile if applicable.  
**Must NOT:** Inject future medications/plans into historical answer.

## T19. Data quality contradiction

**Input:** Weight down; waist up; intake incomplete; strength flat.  
**Must:** Report mixed evidence with alternative explanations; avoid forced narrative.  
**Must NOT:** call unambiguous fat loss or fat gain.

## T20. Low provider budget / provider unreachable

**Input:** Cache miss, Gemini cap reached.  
**Must:** Show accurate budget/degraded notice and available deterministic facts; allow safe retry later where supported.  
**Must NOT:** secretly spend beyond cap or present ungenerated personalized answer as fresh.

## T21. Evidence truncation

**Input:** Large health history and question needing two specific comparable workouts + recent medication change.  
**Must:** Include essential records and counters; disclose omitted context.  
**Must NOT:** cut key evidence because generic volume filled packet first.

## T22. Privacy: separate deployments and public demo

**Input:** Owner data, anonymous `/demo`, second owner's instance.  
**Must:** Distinct sealed data boundaries, owner-specific profile defaults, synthetic demo only.  
**Must NOT:** transfer owner's male setting, symptoms or training history into another person's instance.

## T23. Owner correction, explicit trust promotion

**Input:** Conversation: “I usually drink 30–40 oz”; AI offers save as owner-reported baseline; user declines.  
**Must:** Use conversation context appropriately; do not write canonical profile; respect decline.  
**Must NOT:** invent a week of hydration events.

## T24. Scientific citation and external search

**Input:** Specialized medical research question; Europe PMC results retrieved.  
**Must:** Cite actual returned source IDs/URLs, date and relevance; distinguish publication from personal records.  
**Must NOT:** invent citations or silently present older research as current definitive guidance.

## T25. No change is good coaching

**Input:** Current goals on track, no strong concern or safe actionable opportunity.  
**Must:** Show appropriate “no meaningful change recommended” or stay quiet.  
**Must NOT:** surface generic workout reminder merely to fill Coach card.

## T26. Negative feedback changes ranking, not biology

**Input:** Owner marks suggestion irrelevant multiple times.  
**Must:** suppress/adjust recurrence and respect owner intent; safety rules remain stable.  
**Must NOT:** permit a model to disable clinical guardrails because user dislikes a warning.

## T27. Backdated data correction

**Input:** Owner adds missing food to a prior day or corrects a weigh-in.  
**Must:** Invalidate relevant estimates/caches, preserve audit and recompute conclusions.  
**Must NOT:** leave an old estimate unmarked as if nothing changed.

## T28. AI repair retries and cost

**Input:** Invalid provider JSON and failed evidence IDs.  
**Must:** Bounded validation repair only; meter attempt and actual costs; fail transparently.  
**Must NOT:** drop unsupported personal-citation failures into uncited personal claims or infinite retry loop.

## T29. Fractional-inch equivalence

**Input:** Body waist: `31 1/2 in`, `31.5 in`, `31½ in`, `80.01 cm`.  
**Must:** Normalize these to the same canonical length (within permitted precision), maintain value after edit, and allow normal text entry on mobile.  
**Must NOT:** Demand manual decimal conversion or round-trip drift.

## T30. Body field unit/malformed input rules

**Input:** Form unit toggle between cm/in; `31/0`, `31 1/2/3`, blank field; unrelated percent/weight metrics.  
**Must:** Correctly convert valid lengths; reject malformed fractions; respect metric-specific units and previous data.  
**Must NOT:** Save partial/NaN values, reinterpret blank as zero or mislabel weight as inches.

## T31. Endgame themes, progression and accessibility

**Input:** Owner at levels 20–24, historic unlocked themes, dark/light preference, reduced-motion preference.  
**Must:** Only append unlocks, preserve prior earned packs, render flashy but readable original themes and respect accessibility.  
**Must NOT:** Reprice XP, change old unlock levels, flash excessively, or let reward-wallet spending remove a lifetime unlock.

## T32. Default-collapsed Settings and direct-link access

**Input:** Open `/settings` and `/settings#health-profile` or `#theme-studio` on mobile.  
**Must:** Normal visit shows collapsed subjects; a hash opens its target, focuses/scrolls appropriately and all controls work.  
**Must NOT:** Force long scrolling, trap focus or silently discard edits.

## T33. Workout photo approved, no ghost queue card

**Input:** One processed paper workout photo; owner reviews and saves a canonical workout.  
**Must:** Persist one workout, commit source job, remove pending views in Today/Training and remain removed after reload.  
**Must NOT:** Require a second Dismiss or resurrect on polling.

## T34. Meal photo approved, no ghost queue card

**Input:** One reviewed meal photo; owner approves/saves its nutrition entries.  
**Must:** Persist proper entries once, mark job committed and remove from Today/Nutrition active queues after refresh.  
**Must NOT:** Hide an unsaved draft or keep a misleading pending card.

## T35. Photo approval crash/retry/parallel queue safety

**Input:** Two pending jobs, one accepted; repeated Save tap; network failure after DB commit; provider status arrives late.  
**Must:** Preserve the other pending job and one canonical result, support recovery and idempotent refresh, retain provenance.  
**Must NOT:** Duplicate data, delete committed history, or mark an unsuccessful save as committed.


### 17.1 Required test layers

| Layer | Minimum responsibility |
|---|---|
| Pure domain unit | Mathematics, completeness, evidence provenance, timeline, confounders, ranking gates, state machines |
| API/service integration | Owner auth, database rows, statuses, migration compatibility, cache invalidation, evidence linking |
| Rendering/component | Correct message wording, no orphan actions, mobile accessible controls, no unrelated badge conflation |
| End-to-end browser | Log → revalidation → Coach/Training; Review vs Accept; Ask Health answer; Lab transition |
| Provider contract | Prompt + response schema, citation checking, repair/cost cap, general answer without personal data |
| Golden synthetic fixture | Meaningful insight correctness across domains and clinical-safe behavior |
| Owner UAT | Real-world usefulness, no repeated obvious recommendations, readable on device, accurate details |

**Quality policy:** A newly added golden failure case remains in tests after the immediate bug is fixed. Existing 1000+ tests are a starting point, not a replacement for these scenario tests.

---

# 18. Database, branching, rollout and backwards-compatibility contract

## 18.1 Branch discipline

- Do not assume docs describing an older validation branch are current. Compare latest main, deployed build, feature branches and current worktree **at the time of implementation**.
- Prefer small reviewable changes with isolated functional areas. Avoid 20 unrelated features in one untestable commit.
- Keep schema/app code deployable in the correct sequence. Migrations and corresponding code should be forward-compatible during rollout where possible.
- Preserve current Training and Nutrition production flows; protect the daily-use app against speculative intelligence code.
- If using a feature flag, default new high-impact recommendation behavior off until all integrity/safety acceptance gates are green.
- Do **not** merge unfinished experimental behavior into main merely to preview; use safe preview strategy and owner's explicit promotion preference.

## 18.2 Schema/migration requirements

Potential schema work must be scoped per task. Likely candidates include:

- Structured physiological sex for private owner Health Profile.
- Nutrition day completeness and event history, without reclassifying legacy days as complete.
- More explicit recommendation lifecycle, dependency/supersession, implementation and outcome links.
- Owner goal hierarchy/constraints if not representable by existing versioned goals.
- Source-accurate Bristol/wellness signals in derived intelligence (may require no new table; use existing event columns).
- Retrieval diagnostics and AI quality events (privacy-safe, retention-limited).

**For each migration:**

1. Determine actual highest applied migration and migration naming order from production through read-only check. Never assume local `migrations/` head equals production.
2. Draft additive/backward-compatible schema when feasible. Default unknown rather than fabricated fact. Include constraints and indexes based on actual query patterns.
3. Test against fresh database + realistic upgraded historical database/Neon branch.
4. Confirm old API/backup schema compatibility or provide versioned restoration upgrade.
5. Add unit/integration tests for data import/export and migration idempotence as supported.
6. Document rollback approach. If irreversible data change, require an extra explicit checkpoint/backup and owner approval.
7. Apply production migration only after owner authorization for that step and verified target DB; verify resulting `schema_migrations`.
8. Deploy app version in compatible order, run narrow owner-realistic smoke tests, monitor errors, then close gate.

**Never** run production migrations to satisfy a documentation-only task.

## 18.3 Release qualification gate

No high-impact PIQ release is eligible until:

- [ ] Current production code/schema/target instance positively identified.
- [ ] Schema migration path tested on clone/branch; no hidden destructive edit.
- [ ] TypeScript, lint, unit/integration tests and build pass (use actual repo scripts).
- [ ] Golden regression suite relevant to task passes.
- [ ] Safety/clinical language reviewed when relevant.
- [ ] Owner/demo isolation verified and no leaked sensitive data.
- [ ] Existing UI flows (logging nutrition/training/body/check-in, Auth, Rewards) smoke tested.
- [ ] Provider request costs/caps/cache behavior measured and approved.
- [ ] Same-day mutation/refetch stable where relevant.
- [ ] Mobile UAT on actual screen widths; actions obvious and no text overflow.
- [ ] Documentation/progress records accurate; no claimed but unverified QA.
- [ ] Owner informed of schema/env changes and any action they must perform.
- [ ] Production promotion/merge specifically requested or approved; never imply push equals production success.

## 18.4 Post-release monitoring

- Watch error codes, malformed packet/validation failures, low-utility feedback, contradictory states, stale UI requests, high latency and provider spend.
- Keep a release-specific rollback path for recommendation behavior independent of underlying canonical records when feasible.
- Log issues with a precise scenario and status in `PIQ_PROGRESS.md` so follow-up agents do not rediscover the same bug.
- Where real user data isn't available to a developer, say clearly that feature behavior is validated with synthetic fixtures only and needs owner QA.

---

# 19. Scope discipline and anti-patterns

## 19.1 Tempting but wrong approaches

| Anti-pattern | Why it fails | Preferred alternative |
|---|---|---|
| “Just write a stronger prompt” | Model cannot retrieve missing records or correct wrongly constructed evidence | Fix retrieval, quality, provenance, answer contract and evaluations |
| “Increase Gemini model budget” | More tokens amplify low-quality inputs and unhelpful outputs | Measure cost per useful answer and target intelligent, bounded synthesis |
| “Add more trackers” | More input burden without better decisions | Make existing water, bowel, nutrition, training and context data usable first |
| “Force all questions into a 30-day packet” | Historical/specific questions need different windows | Question-driven time selection with explicit boundaries |
| “Treat fewer logged calories as a real deficit” | Partial-day logging biases energy estimate | Explicit completeness and compare only valid windows |
| “The model should calculate everything” | Non-reproducible errors/hallucinations | Deterministic math + model reasoning/clear explanation |
| “High-confidence” as single badge | Conflates coverage, estimate quality and safety | Per-claim evidence, uncertainty and rationale |
| “A significant correlation means a cause” | Confounding, autocorrelation, multiple comparisons | Curated relationship contracts + observational phrasing |
| “Always give 3 next actions” | Pushes irrelevant interventions and UI clutter | Zero or one meaningful action, expandable only as needed |
| “More reminders = smarter Coach” | Rewards superficial compliance over information value | Separate operational tasks from insights |
| “Opening Review means accepting” | Corrupts follow-ups and personal lab learning | Explicit Viewed -> Accepted -> Implemented states |
| “Use user's current context for past events” | Historical anachronisms and false associations | As-of profile/context and effective dates |
| “Mark all old logs complete by default” | Retrospective fictitious precision | Unknown unless owner specifically confirms |
| “All symptom questions need disclaimer and refusal” | Leaves user uninformed while sounding safe | Answer general physiology, scope uncertainty, red flags proportionately |
| “AI knows everything in the database” | Reality: packets exclude, summarize and truncate | Explicit retrieval manifest and query-aware data access |
| “Finish phase when CI green” | Green tests may assert wrong behavior | Golden scenarios + owner real-world QA + post-release check |

## 19.2 Decision thresholds for new features

Before approving any extension, record:

- Which currently unsolved *user question or decision* does it serve?
- What existing canonical information can answer it already?
- If new data is proposed, what precise decision changes when available?
- Is there an inexpensive deterministic path before using a model?
- What safety/confounding/quality requirements apply?
- Does it enlarge daily logging burden or clutter Today?
- Can we build/test it as a small independent task?
- Is it needed in this phase, or should it be explicitly deferred?

Unanswered questions block approval of feature scope, not ordinary bug fixes.

## 19.3 Deferred possibilities (not current commitment)

- Advanced personalized energy-expenditure or body-composition estimation, after log completeness and strong calibration.
- Wearable HRV/clinical lab integration beyond validated currently available signals.
- Counterfactual “what-if” planner after reliable observed response data exists.
- More elaborate adaptive quest scheduling after reward incentives and recovery safeguards are validated.
- Multi-device ingestion expansions, family profile sharing, universal clinical reference ranges.
- Broad multi-armed autonomous intervention selection.

**Defer until** a demonstrated user need, evidence method, privacy boundary and test suite justify them.

---

# 20. Risk register and mandatory mitigations

| Risk | Why likely | Severity | Mitigation / detection |
|---|---|---|---|
| Incorrect calorie advice from incomplete log | Source quality mistaken for full-day intake | Critical | PIQ-1.1 gate and T03–T06; explicit complete-day evidence |
| Health AI plausible but fabricated owner facts | General knowledge mixed with sparse personal records | Critical | Evidence refs, routing manifest, claim validation and audited golden cases |
| Clinical overconfidence / inappropriate self-treatment | Model tries to be helpful with symptoms | Critical | Safety routing, claim-type distinctions, red-flag suite, human clinical review as appropriate |
| Broken canonical facts after migration | Data model spans many domains | Critical | Additive migrations, backups, cloned rehearsal, historical tests, owner approval |
| Wrong owner data reaches provider or demo | New structured clinical/profile fields | Critical | Auth-isolation tests, minimal context, no public demo calls or seed copies |
| Acceptance mistaken for action | Review button behavior already ambiguous | High | Explicit state machine and no write on inspect |
| Stale Coach after owner log | Current refetch dependencies weak | High | Mutation invalidation and stale response rejection |
| Statistical noise surfaced as “pattern” | Small n and many potential relationships | High | Curated families, robustness/multiplicity checks, mature evidence requirements |
| Repeat/unhelpful recommendations | Static priorities, little feedback integration | High | Hard eligibility, cooldowns, goal ranking, owner feedback |
| Prompt stuffing reduces relevance | Fixed packet cap and indiscriminate domain data | High | Query plan and manifest with omissions/counterevidence checks |
| Old plan or medication applied retroactively | Profile/historical fallback wrong | High | As-of test T18, effective dates/provenance |
| Provider spend spikes | Model or repair called repeatedly | Medium–High | Cached deterministic route, budgets, usage telemetry, capped retries |
| Long latency or layout shift | Multi-domain remote calls + long cards | Medium | Progressive computation, stable rendering, perf tests, compact mobile UI |
| User burdensome questionnaires | Need for more complete logs | Medium | Triggered one-question policy, unknown stays valid, no forced daily forms |
| Overfitting personal intervention history | Small samples and multiple concurrent changes | High | Predefined outcome, alternative explanations, confidence and non-causal language |
| Docs drift / assistant gets lost | Cross-session work, long roadmap, branches | High | Startup protocol, task IDs, progress handoff, verified state, small change batches |
| Test green but user dissatisfied | Structural correctness not meaningful utility | High | Owner-golden questions and rubric, real-world mobile UAT |
| Creatine incorrectly identified as dehydration cause | Common misleading health interpretation | High | Explicit GI scenario, physiology review, careful wording |

**Risk escalation rule:** A new critical regression blocks the next phase until addressed or explicitly rolled back. Do not hide it behind future work.

---

# 21. Practical handoff prompts for future sessions

These are suggested **short instructions** the owner can use because the master contract contains the detailed context. They are *not* authorizations to merge or migrate automatically.

## 21.1 Start planning

> Read `docs/ai/HEALTH_INTELLIGENCE_QUALITY_MASTER_PLAN.md` in the `daurham/daurham-health` repo, plus `CURRENT_TASK.md`, `DEV_STATE.md`, `DECISIONS.md` and `PIQ_PROGRESS.md` if present. First reconcile verified repository/deployed state; then propose the next smallest ready PIQ task with file paths, tests, risk, and exit criteria. Preserve the North Star. Do not implement or deploy yet.

## 21.2 Implement the approved task

> Implement the single approved PIQ task from `PIQ_PROGRESS.md`, following the master contract. Maintain canonical data, clinical-safety, portability, AI budget and regression boundaries. Run relevant tests, add golden scenarios, and report exact changed files, commits, migration/deployment requirements, and blocked QA. Do not silently start the next task or promote production.

## 21.3 Review the completed task

> Audit the implemented PIQ task against the master contract. Verify runtime/API/UI semantics, tests, new missingness and state behavior, privacy, and provider cost. Update `PIQ_PROGRESS.md` with verified evidence, unresolved risks and precise next step. Do not mark owner acceptance before the owner sees it.

## 21.4 Resume a sealed or different chat

> We are continuing the Daurham Health PIQ program. Read the master plan and current progress from the GitHub repo. Reconcile branch/main/prod status before any edit. Identify the one next task and any blockers. Do not re-design already-approved objectives or skip validation stages.

## 21.5 Diagnose a disappointing AI answer

> Trace this Ask Health question end to end: classification, requested time range, retrieved records, completeness/quality, omitted evidence, early exits, provider/model response, citation validation and UI. Identify why it failed the answer-quality rubric. Add a golden regression scenario and fix the narrowest root cause rather than only changing prompt wording.

## 21.6 Promotion approval

> The PIQ slice has passed automated and mobile QA. Verify deployed schema compatibility, model spend, release checklist and rollback. Provide exact migrations/env steps, then promote only the approved commits to main/production as authorized. Verify live behavior and record results in PIQ_PROGRESS.

---

# 22. Project closure conditions — the North Star acceptance gate

The PIQ program can be called a success only when all statements below are demonstrably true:

1. Health has a reliable **structured, owner-set male physiology profile** for the original owner and consistently applies it where relevant, with portable defaults for other owners.
2. A safe general health/training/nutrition question receives a useful direct answer even if no related personal observations exist.
3. Most personal questions make appropriate use of relevant owner data without manual lens hunting and without fabricating missing evidence.
4. The owner can see **why** an important conclusion was reached and what data/limitations it depended upon.
5. Food-source quality does not masquerade as full-day logging completeness; maintenance/plateau advice uses valid evidence and avoids premature cuts.
6. Important signals cross domain boundaries when appropriate, especially water + fiber + Bristol symptoms and weight + performance + recovery.
7. Coach knows when the owner has already acted, avoids stale/orphaned alternatives and treats suggestions vs commitments honestly.
8. Coach rarely repeats training schedule items as its main “insight” and is comfortable recommending no change.
9. Proposed changes are never silently executed. Real interventions can be tracked, evaluated, and interpreted without causality overclaims.
10. The Today experience becomes clearer, not busier, and most added reasoning is behind compact disclosures.
11. AI costs remain explicit, capped, measurable, and justified by improved usefulness.
12. No user-owned sensitive information leaks to demo/another owner, and historical facts remain temporally accurate.
13. Every regression in the golden suite has tests and an explicit owner-realistic outcome.
14. A new assistant can resume work solely by reading this master plan, verified repo state, and `PIQ_PROGRESS.md`—without reinventing intent or asking the owner to restate the program.
15. The owner reports that Health AI is now *meaningfully more useful than asking an external AI to interpret data already stored inside Daurham Health*, while appropriately still acknowledging matters it cannot establish.

**Do not optimize merely for a checklist pass.** If the user still routinely leaves the app because answers are evasive, repetitive, factually inconsistent or unhelpful, this program has not yet met its central objective.

---

# 23. Compact assistant self-audit before every response or implementation

Answer each explicitly in the working notes:

- **Goal:** Does the change improve *truth, understanding, decision quality or learning*?
- **Reality:** Did I verify current branch, schema, runtime and existing contracts rather than rely on outdated docs?
- **Evidence:** Do I distinguish data logged, data complete, actual physiological state, statistical estimate, plausible mechanism and causation?
- **Owner context:** Am I using relevant structured profile, current goals, constraints and history correctly?
- **Question:** Am I answering the asked question first instead of hiding behind “insufficient data”?
- **Priorities:** Is this the most relevant feasible insight, or an obvious reminder?
- **State:** Will old actions, accepted recommendations and current UI update correctly after canonical mutations?
- **Safety:** Could this induce inappropriate calorie restriction, training pressure, unsafe fluids/meds/supplements, or delayed medical attention?
- **Spend:** Is there an avoidable AI call or unnecessary broad packet/retry?
- **UX:** Is it concise, explainable and usable on a narrow phone?
- **Tests:** Which golden scenario would fail if my implementation is wrong? Did I run it?
- **Continuity:** Did I record exact work done, evidence, open items, and next task for the future assistant?

If the answer to any critical question is unknown, disclose the unknown and keep the relevant task open. Never fill the gap with invented confidence.

---

# Appendix A — Key source paths to re-open during implementation

```
docs/ai/CURRENT_TASK.md
docs/ai/DEV_STATE.md
docs/ai/DECISIONS.md
docs/ai/PROJECT.md
docs/ai/NEXT_INTELLIGENCE_ROADMAP.md
src/domain/health-profile.ts
server/profile/service.ts
src/features/settings/HealthProfileSection.tsx
src/domain/nutrition/quality.ts
src/domain/maintenance.ts
server/intelligence/maintenance.ts
src/domain/intelligence/shared.ts
server/intelligence/snapshot.ts
src/domain/goal-control.ts
server/intelligence/goal-control.ts
src/domain/coach-intelligence.ts
server/intelligence/coach-intelligence.ts
src/features/coach/CoachCard.tsx
src/features/goal-control/GoalControlCard.tsx
src/domain/weekly-coach/build.ts
src/domain/weekly-coach/prompt.ts
server/weekly-coach/load.ts
server/weekly-coach/service.ts
src/domain/ask-health/clinical-profile.ts
src/domain/ask-health/types.ts
src/domain/ask-health/packet.ts
src/domain/ask-health/prompt.ts
src/domain/ask-health/validate.ts
server/ask-health/load.ts
server/ask-health/service.ts
src/features/ask-health/AskHealthPage.tsx
src/features/ask-health/AnswerView.tsx
src/features/ask-health/ExternalResearch.tsx
server/literature/service.ts
src/domain/daily-signals.ts
server/daily-signals/service.ts
server/training/plan-service.ts
server/intelligence/change-ledger.ts
migrations/
tests/i5-ask-health-context.test.ts
tests/i5-health-intelligence.test.ts
tests/i6-goal-control.test.ts
tests/i7-maintenance.test.ts
tests/i8-training-progression.test.ts
tests/i9-coach-intelligence.test.ts
tests/i10-recovery-clinical-context.test.ts
```

Paths are an **as-inspected 2026-10-14 index**. New code may reorganize them; update the progress file with replacements rather than assuming paths remain stable.

# Appendix B — Design decision ledger seed

These are proposed decisions; they become final only when reviewed/approved and recorded in the repository's actual decision log.

| ID | Proposed decision | Rationale |
|---|---|---|
| PIQ-D01 | Answer-first, evidence-calibrated Ask Health | A lack of proof of personal causation should not block useful general education |
| PIQ-D02 | Structured owner-set male physiology fact | Relevant physiological context is foundational to this owner's health app |
| PIQ-D03 | Day completeness separate from nutrient/source quality | Maintenance intake inference otherwise risks systematic bias |
| PIQ-D04 | Coach never equates Review with Implement | Accurate recommendation memory and valid follow-up learning |
| PIQ-D05 | One shared evidence/decision authority across surfaces | Prevent contradictory Coach / Goal / Ask interpretations |
| PIQ-D06 | No change is a first-class recommendation | Avoid generating low-value work |
| PIQ-D07 | Cross-domain questions use curated, reproducible relationship contracts | Reduce false positives and causal overclaims |
| PIQ-D08 | New clinical context is private and owner-controlled, portable across separate deployments | Privacy and correct owner specificity |
| PIQ-D09 | Model explanations may use established general knowledge without personal citations; personal claims require source refs | Combine usefulness and truth |
| PIQ-D10 | Questions asked only for decision-relevant unknowns | Preserve daily usability and privacy |
| PIQ-D11 | Existing Personal Lab and Change Ledger remain authorities for experiments/interventions | Avoid new inconsistent parallel tables |
| PIQ-D12 | Production acceptance includes owner question quality and mobile QA, not CI alone | User benefit is the actual product outcome |

# Appendix C — Minimum phase completion report template

```md
# PIQ phase/task completion: <ID>
Date / branch / commit / prod build / database migration head:
Objective served:
Changes shipped:
Data semantics affected:
What was tested (commands + results):
Golden scenario IDs passed:
Model spend / cache / latency observations:
Safety & privacy checks:
Mobile/owner QA status:
Known limitations:
Migration/env steps required:
Release status (implemented/validated/deployed/accepted):
Next smallest task:
```

# Appendix D — Three quick North-Star comparisons

**Before:** “Plateau likely; lower calories 150/day.”  
**After:** “Weight trend appears stable over this documented window, but some food days are unconfirmed and recent stool/hydration context may affect scale readings. First verify logging completeness and consider monitoring; then review a modest one-lever adjustment if the evidence still supports it.”

**Before:** “Do your Full Body C workout today.” (already done.)  
**After:** “Today's qualified training is already recorded. No additional workout is needed for the plan. Here's one meaningful pattern, if supported—or no change recommended.”

**Before:** “Not enough Health evidence for your question.”  
**After:** “Here is the established answer to your question. Here is how your confirmed records may change its relevance to you. Here is the exact limit of what your data can show and, if worthwhile, the single most useful thing to clarify.”

---

**FINAL OPERATING INSTRUCTION:** Future assistants should be able to disagree with an individual proposed implementation detail on technical grounds, but **must not lose the objective**: the system should use the health data already recorded to produce trustworthy, individualized, genuinely useful understanding and guidance; be more willing to *answer* but no more willing to *invent*; and demonstrate its value in the owner's real workflow. If trade-offs are necessary, prioritize correctness of source facts, action-state integrity, quality of answers, and safety over novelty, quantity of features, flashy UI, or rapid deployment.