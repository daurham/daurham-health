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
