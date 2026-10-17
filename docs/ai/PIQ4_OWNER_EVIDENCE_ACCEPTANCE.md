# PIQ-4.2 evidence-integrity owner acceptance matrix (PREVIEW ONLY)

**Status:** Draft, **NOT signed off**, formal phase owner acceptance **0/9**.
Maintained as a bounded companion to the canonical
`HEALTH_INTELLIGENCE_QUALITY_MASTER_PLAN.md`; it does not authorize
production, database migrations, new paid AI calls or treatment advice.

## Preconditions

- Use an isolated authorized owner preview and an explicitly checked DB
  schema/instance. No production `main` promotion, and no copying personal
  health records to another owner's environment.
- Prefer deterministic evidence-packet inspection rather than paid Gemini
  calls. For any authorized end-to-end answer, respect monthly provider cap,
  token visibility, private evidence-scope controls and cache policies.
- Set Health-local today and compare to chosen historical `asOf` dates.
  Distinguish recorded values, owner-complete days and absent/missing data.

## Acceptance scenarios (all pending owner-realistic QA)

| Scenario | Required outcome | Evidence gate |
| --- | --- | --- |
| General education in General Only | Helpful general answer; no private Health DB context retrieved or sent | Personal-data-free route |
| The PIQ preview is READY but the deployed SHA differs from current GitHub CI success, or the Neon child inherits parent rows | Block owner QA even with a working URL; independently match exact candidate/Actions/Vercel SHA and Neon empty-origin branch before any separate runtime attestation | Pure offline metadata gate; real environment still blocked by copied branch and unverified Auth/DB binding |
| A general-only answer block, limitation, or suggested follow-up asserts invented personal measurements or states | Withhold/retry fresh output and strip unsafe cached suggestions; preserve independent general education and conditional examples | General Only deterministic owner-claim guard, synthetic provider/cache regressions, no private reads |
| A legacy cached General Only answer contains an invented personal measurement or a claimed review of private logs | Redact the invented block at cache delivery; retain independent general education; no private evidence, no extra provider call | Synthetic poisoned-cache regression plus v2 general prompt/cache isolation |
| Current weight plateau with sparse food/scale records | No personal deficit, plateau or calorie reduction concluded; limited observations explained | Current focused Nutrition/weight/projection gates |
| Current answer invents an uncited owner metric (or cites a neutral source warning / unrelated domain) | Withhold the unsupported claim and disclose citation gap; keep independently useful general explanation; no extra model repair | Current-claim evidence boundary, synthetic offline tests; full semantic owner review remains |
| Current response cites a true measurement but changes its number, unit, nutrient, or one value in a mixed-domain sentence | Withhold the unsupported numeric claim; retain general education, preserve exact recorded-step, sleep-minute, protein/fiber and sodium-mg values | Deterministic current literal numeric/source agreement with saved-type distinction |
| Current response states an owner-configured goal target or planned Supplement dose, rather than an observed measurement | Preserve the configured value only if it matches the saved canonical target/regimen field; never turn a target into a measured weight or planned dose into confirmed ingestion | Canonical target/schedule text replay; no clinical ingestion proof |
| Current answer correctly quotes a configured goal target but claims the owner has met or completed it, or is on track, without matching Goal Control status | Withhold unsupported current owner goal status, keep configured-target explanation; do not equate satisfied target with owner-completed lifecycle | Current Goal Control targetState, lifecycle and deadlineState citation-check regression |
| Same-day sodium/carb food and weigh-in | Same-day order explicitly unknown; no causal water-retention claim | Scale chronology |
| Change Nutrition calories or same-calorie sodium/protein while Ask Health retrieves | Affected maintenance/food/weight claims withheld, not patched from stale averages | Late Nutrition source |
| Replace a weigh-in or edit its comparability state during read | Focused weight/goal/scale interpretation withheld | Late weight/Activity source |
| Change a Daily Context note or tag during read | Stale note text and tag counts absent, neutral explanation shown | Late Context records |
| Inconsistent Activity summary vs Intelligence activity record | Direct steps/resting-HR and Activity-linked shared correlations absent; unrelated sleep may remain | Dual Activity read |
| Replace/delete a Training session or edit effort between the Progress and Intelligence reads | No stale Training count/frequency, set trend, or Training-linked correlation; unrelated domains remain | Dual Training session identity/effort read (does not attest working-set versions) |
| Edit load/reps/side measurements under the same saved set ID during Ask Health retrieval, or insert/delete/reassign a set | No stale set appearance, strength trend, Training-linked relationship or cross-signal weight inference; neutral source-conflict boundary | Late canonical working-set content read (not atomic; no exercise-definition version attestation) |
| Edit exercise name, performance/load classification or rep mode while its sessions and sets stay identical | No stale estimated strength, exercise match clarification, or Training-linked intelligence; separate evidence survives | Late canonical exercise-definition effective-field read (not atomic) |
| Modify a saved medication, allergy, condition, height or training limitation while Ask Health loads owner context | Changed profile details, identity and status are withheld with a neutral warning; independently sourced metrics remain | Late canonical Health Profile revision/content comparison (not atomic) |
| Edit a supplement dose or weekday schedule; change status to paused or alter taken/skipped adherence during retrieval | All stale supplement names, dose/schedule statements and adherence totals absent; neutral source warning instead, other evidence stays | Late projected Supplements range comparison (four local read-only SQL queries; not atomic) |
| Select a previous date for Supplements and correct a backdated adherence or schedule while the answer loads | Withhold changed past-range facts, distinguish current corrected records from what was historically known, and avoid replacing missing with skipped/taken | Selected-as-of late Supplement range reread (not a historical versioned snapshot) |
| Request named yesterday/last week; correct a selected source during read | Historical weight/food amounts and coverage removed; no current value substituted | Historical source check |
| General packet after focused source failure | No stale body/nutrition/activity/goal/shared-Intelligence bypass | Packet precedence |
| Change selected goal/experiment version/priority | No stale goal status, conflict-free intervention or silent target mutation | Goal/experiment source gates |
| Ask about bowel hardness/water/fiber/creatine | No diagnosed cause from sparse notes or event count; no logged water assumed total fluid | Digestive source/cross-domain guard |
| Fast repeated questions / mobile Today-Ask Health | Compact useful answer, correct evidence refs; no duplicate uncapped paid calls or latency regressions | Owner mobile QA + billing ledger |

## Go/no-go

A full automated green matrix is necessary, **not sufficient**. An owner
preview must confirm the answers are useful, correct, visibly source-aware,
non-coercive, and responsive on mobile. Confirm production instance migration
readiness separately with a read-only check before asking for approval to
apply pending migrations. Never infer acceptance from CI, do not silently
merge to main, and never mark phase `accepted` without explicit owner signoff.

Known residual: current affirmative owner measurement claims now require substantive, matching-domain citations. The current numeric guard additionally checks supported literal quantities against cited structured recorded metrics and a restricted canonical goal-target/planned Supplement-regimen portion. It does not prove every derived value, independently verify raw ingestion, convert units, validate nonnumeric owner claims, or replace human answer review. The current cross-source reads are optimistic and not one
atomic snapshot. Generic training, sleep, supplements and clinical-profile
revision attestation remains incomplete. A provider can still reason about
a general mechanism with a cited limitation, but must not convert that into
a verified personal cause.
