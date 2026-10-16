# PIQ-4.1 – 0/1/2-day digestive pairing readiness

**Code-only screening, not a user-specific correlation.** App-only PIQ branch; never feed a correlation coefficient or consequential recommendation from this data.

## Input contract

- Only after a bounded, canonical count-reconciled Bristol window is marked available.
- Candidate stool days are recorded bowel-event days where *every* event has valid saved Bristol 1–7 (typedCount === eventCount); explicit zero days and absent logs do not enter stool-type pairing.
- Today is excluded from both stool observations and exposures.
- For each stool date, the exposure date must be the same date or exactly 1 or 2 days EARLIER. Date matching is performed within the exact selected/requested history. Never borrow a day from outside its bounds.
- Fiber exposure requires a source-reliable, high-confidence, owner-confirmed verified whole-day fiber observation, and the completeness service must be available; low-quality or partial entries never become zero.
- Water exposure is **only the presence of an explicitly logged event total**. Even if 90 days are observed, that is not verified total fluid consumption; never qualify a water/stool association from it.
- Each lag is reported separately; shared bowel dates mean lags are not independent replications. No rho or causal claim is calculated or returned.

## Maturity gate

12 aligned date pairs across >= 4 distinct Monday-start calendar weeks form an initial *candidate for future controlled review*, not an association or decision. Below either requirement is insufficient. The current screen does not assert completeness of bowel tracking, total fluid, fixed confounders, effect sizes, statistical significance, medical meaning, or independent window replication. Full causal/associational output remains blocked until mature/confounder-reviewed data and clinical owner QA. Existing generic intelligence relationships over `bowel.count` must not be confused with these Bristol-specific pair counts.

## Synthetic acceptance

Same-day and 1/2-day directionality, selected-window boundaries, verified/unverified fiber, available/unavailable completeness service, non-independent short span, partial Bristol coding and provisional today, insufficient or missing rows, logged water only, General Only and unrelated-question isolation. No new SQL, migration, owner row write, Gemini request or production deploy.

## 2026-10-16: Evidence contrast and daily-context-tag review gate

The initial 12-pair/4-distinct-week threshold is **not enough** to warrant further analysis if stool hardness or fiber never varies across paired dates. Candidate eligibility additionally requires a >=0.2 between-date difference in proportion of saved type 1–2 among fully typed stool events and >=2g difference in high-quality, owner-complete whole-day logged fiber. The comparison still computes no correlation, significance, effect or cause. An entire week of type 1–2 records with invariant fiber therefore means no contrast, regardless of pair count.

Reuse daily context tags already loaded by the Ask Health caller, in date range only: illness, travel, alcohol, late meals, unusual stress, poor sleep, night interruptions, pain, supplement starts, medication changes and unusually demanding physical work. They are recorded flags, **not verified diagnoses, actual medication administration or claims of causation**. Count matched pairs whose same-day/0–2-day interval intersects a relevant tag; any such flagged pair forces manual context review before an eligibility label. Do not read free-text context notes in this stage. Absence of a tag is never proof that a confounder did not occur. Recorded water that changes during fiber variation is a *co-changing logged exposure* and forces context review; it is not verified total hydration and never permits hydration-stool association. Readiness status remains **non-substantive**, and AI must not infer a personal relationship from it.

Tests cover all-hard Bristol with variable fiber, variable Bristol with fixed fiber, combined water/fiber changes, supplement or medication-change context, travel in the temporal lag interval, incomplete fiber, note-only or rest-day tags and provisional today. No extra database read, migration, owner data mutation or paid AI call.

## 2026-10-16: Optimistic independent-source recheck

For Bristol-plus-fiber/water/Deep Dive reasoning only, `server/ask-health/digestive-consistency.ts` issues **three bounded read-only rechecks** once canonical bowel ID+date verification has succeeded:
1. Existing revision-checked, owner-confirmed complete-day nutrition SQL (no new definition of complete), grouped for same-day source IDs, calories and fiber; rejects altered, missing, added or ineligible days.
2. Grouped water event IDs and summed milliliters (water events remain incomplete fluid intake).
3. Saved date+tag keys in the bounded window (no context note text or diagnosis inference).

The pure `digestivePairingSourcesAgree` rejects mismatched IDs, values, days, newly added/removed tags, duplicated rows, unavailable SQL, or stale completeness. On a conflict, bowel-only verified evidence is kept but derived cross-domain pairing and cross-domain sample evidence are suppressed with a neutral limitation. These rereads are **not one repeatable-read transaction** and cannot detect a modification after the final query; broader snapshot atomicity is a separate release gate. All source reread rows are server-side; no new raw identifiers or notes enter the model's packet.

### Historical context boundary

The original Ask Health context loader selects the entire progress period. The optimistic recheck compares ONLY tags within the exact requested bowel window, excluding provisional today; unrelated earlier/later tags are not an inconsistency. Synthetic tests exercise full range, narrower historical window, outside records and today. This does not assert absence of unrecorded confounders.

## 2026-10-16: Whole-packet digestive invalidation and stool-type semantic boundary

The source-reread guard must apply to the **entire Ask Health evidence selection**, not only to `digestive.focus.*`. The pure `digestive-packet-guard.ts` screens the routed intelligence stream and its `knows/missing` context before packet fingerprinting. After a cross-source conflict, remove snapshot-derived `nutrition.fiber_g`, `hydration.ml` and `bowel.count` coverage/baselines, every personal relationship touching those keys, their registered intervention comparisons and any matching intelligence summary context. Nutrition overview and daily context aggregates (loaded at different times) are withheld for that conflicted digest-specific question, while unrelated sleep/activity evidence remains available. A failed saved-bowel ID/date reconciliation independently removes obsolete bowel-focused examples and bowel-count intelligence. Never elevate generic `bowel.count` Spearman correlations to support a Bristol stool-type, constipation or diarrhea question even if other inputs are consistent. The packet and its cache hash must represent precisely the selected non-stale evidence.

Synthetic regression tests prove conflict filtering across focus, shared relationships, contextSummary and fingerprint; semantic Bristol-vs-frequency distinction; unrelated signal survival; and source-ID mismatch suppression. Still **not** an atomic read transaction; must not claim read-time owner-data consistency beyond verified source windows.

## 2026-10-16: Statement-level read snapshot for final recheck

The final optimistic reread is now **one read-only PostgreSQL statement**, not three independent parallel statements. A `WITH verified_nutrition / fiber_rows / water_rows / context_tag_rows` query gathers bounded grouped source facts and returns exactly one row containing three JSON arrays. Ordinary PostgreSQL statement-level MVCC makes those three groups consistent **with each other as of the statement's read point**. The existing owner-confirmed nutrition source-revision SQL is reused verbatim; no new definition of a complete food day. Bad/missing/multiple/malformed aggregate rows, unavailable schema, query failure or changed source data suppress cross-domain pairing; no silent replacement with zero. The server receives the limited ID/value aggregates; raw owner notes and source IDs are not forwarded to the model.

This is **not** a shared transaction across the earlier progress/intelligence snapshot, sample query, bowel ID+date reconciliation, or final model response. It cannot rule out a write AFTER the last read. CI adds synthetic injected-DB tests verifying one SQL call, bounded parameters, read-only statement shape, unchanged source qualification, and failure closed on malformed/inconsistent results. No live DB query was used.

## 2026-10-16: Non-overlapping observation windows and missing bowel-status coverage

A 12-pair/four-calendar-week series can still be *mostly one cluster* or have large unobserved gaps. The read-only screening adds two further heuristic gates **before** labeling `candidate_for_review`:

- Count exact-scope-start-anchored, non-overlapping 14-day calendar bins; require at least two bins containing **four distinct qualified bowel dates each**. A qualifying bin is NOT a statistically independent replicate, randomization, prospective study, control period or measured effect.
- Between the first and last **explicitly saved bowel status** in the requested scope (ignoring provisional today), at most seven consecutive dates may lack any bowel status. Explicit saved 0 days count as observed status but **never** as typed stool outcomes, recorded hard stools, exposure pairs or inferred zeros. All days outside this first/last span remain unverified. A failure means the owner diary's continuity is unknown, **not** that constipation/no movement occurred. The threshold is an engineering quality heuristic, not a clinical bowel-frequency threshold.

The packet exposes only aggregate `unknownBowelStatusDays`, `longestUnknownActiveStreakDays` and `qualifiedReviewWindows` with explicit missing-data disclaimers; it never emits raw event IDs or diagnoses. This guards against overinterpretation while preserving previously qualified date counts, lag direction, owner-tag review and snapshot source agreement. Passing still does **NOT** verify that every daily bowel movement or no-movement day was recorded. Synthetic tests cover uneven fortnight concentration, two far-separated clusters, explicit no-movement logs closing a status gap, and ordinary-but-incomplete bounded 90-day history. Clinical association remains prohibited.

## 2026-10-16 — final regression hardening (historical unknown, red flags, privacy)

On a fully unobserved yet successfully reconciled historical bowel window, the `digestive.window.bristol` evidence has a **null numeric outcome**, a null unit and an explicit "NO bowel status is saved" clarification. Aggregated internal 0 counted recorded events is not reinterpreted as a known 0 bowel movements or proof of no hard stool. A separately owner-saved explicit zero status still has its own observed day and a documented recorded 0. Synthetic tests distinguish a missing single day, an explicit zero and a recorded typed event without borrowing samples from other dates.

The existing General Only Ask Health service continues to bypass the private loader entirely; a new service regression confirms a first-person hard-stool historical request never calls the loader or model when classified as a private-metric question. The limited deterministic immediate-safety fast path adds **explicit, current first-person** reports of vomiting blood, severe abdominal pain or passing tarry stools, responding with immediate care advice before owner records, AI provider or usage-budget access. Historical, negated, educational and hypothetical wording is not asserted to be a current emergency. This is not a substitute for broader symptom triage or a clinical diagnosis. "Rabbit pellets/droppings" now routes to stool-type context and cannot upgrade bowel-frequency correlations to a personal stool-hardness relationship. No source data, SQL, migrations or paid calls changed.
