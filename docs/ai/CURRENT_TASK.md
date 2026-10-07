# Current task

## I4 — Evidence Semantics, Effort, and Change Ledger

### Status

Implementation prepared as a dormant batched Git commit on top of dormant I3 commit `a615965bfa6a5547447be85e395f695d63050c7d`.

Do not move a feature branch ref while the Vercel rolling deployment limit remains active.

Repository schema head after I4:

`0046_evidence_semantics_change_watchdog.sql`

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Product intent

I4 makes later Health intelligence safer by improving the meaning, provenance, effort context, and change context of existing Health evidence before I5 builds a shared intelligence frame.

Canonical Health facts remain authoritative. I4 may derive change candidates and data-quality flags, but it does not silently correct source records or invent missing observations.

## Training evidence

- Existing session effort 1–5 and pain 0–3 remain the session-level subjective context.
- Working sets may optionally record either RIR 0–10 or RPE 1–10. A set cannot record both.
- Failure evidence is explicit: `reached_failure` or `failed_rep`. Ordinary hard effort is not inferred as failure.
- Independent-side exercises may record left/right failure separately.
- Exercise definitions gain `side_tracking_mode`: `shared`, `paired`, or `independent`.
- Existing per-side measurement families remain valid. Selected dumbbell movements become independent prospectively without rewriting historical shared-rep sets.
- Optional session limitation context records pain, fatigue, illness, time, equipment, or other constraints plus a bounded note.

## Nutrition evidence quality

Each Nutrition entry carries a coarse evidence class:

- `measured_reference`;
- `owner_entered`;
- `ai_estimate`;
- `legacy_unknown`.

The classification describes how the nutrition values were obtained. It is not a food-health score.

Nutrition day responses derive a calorie-weighted quality summary:

- `high_confidence`;
- `mixed`;
- `estimate_heavy`;
- `unknown`.

Missing historical quality is treated as unknown, never as measured evidence.

## Body comparability

Manual Body measurement sessions may be marked:

- `usual`;
- `different_conditions`;
- `unknown`.

Health Profile gains one optional owner-authored note describing usual body-measurement conditions. Different-condition measurements remain valid canonical observations; the marker exists for later interpretation.

## Event time vs entered time

I4 does not add redundant timestamps where the schema already represents both concepts.

Observed/effective time continues to use domain fields such as `measured_at`, `consumed_at`, Health dates, and version effective dates. Database `created_at` remains entry/storage time. Later intelligence must preserve that distinction.

## Change Ledger

Progress → Timeline gains an owner-only **Changes & interventions** panel.

The ledger is derived from existing canonical histories for:

- Nutrition target changes;
- Training Plan versions;
- Goal start/target/lifecycle changes;
- supplement status events;
- Experiment windows;
- selected Daily Context intervention/context tags.

I4 also detects a small first set of behavioral candidates:

- daily steps;
- Training frequency;
- logged-water pattern.

Detection compares the most recent seven completed days with the prior fourteen days and requires minimum coverage plus a meaningful magnitude. Hydration compares tracked days only; missing water logs are not converted to zero.

A candidate is not canonical intent. The owner may confirm or dismiss it. Confirmation records the detected change in the derived ledger; neither action rewrites source data.

## Data Quality watchdog

Settings → Data Quality runs deterministic review rules over recent data for:

- broadly implausible or unusual Body values;
- unusually large Nutrition entries/serving multipliers;
- possible duplicate Nutrition entries;
- future Body/Nutrition timestamps;
- substantially incomplete-looking Nutrition days, labeled as a possibility rather than assumed missing food;
- missing one side on an independent-side Training set;
- recent Body measurement source discontinuity.

Classification is conservative and review-oriented, including `needs_confirmation`, `plausible_but_unusual`, `possible_duplicate`, and `source_discontinuity`.

Owner review choices are:

- `confirmed_valid`;
- `excluded_from_analysis`.

Review decisions are durable annotations. They do not delete or mutate the source Health row.

## Intelligence boundary

I4 does **not** retrofit current Progress calculations to obey `excluded_from_analysis`. I5 owns the shared evidence frame and will consume these review annotations as part of provenance/coverage/confidence logic.

This preserves one analysis authority instead of adding ad-hoc exclusion logic to existing screens.

## Backup

Migration 0046 and backup inventory include:

- Training effort/failure/limitation fields;
- exercise side-tracking mode;
- Nutrition evidence quality;
- Body comparability and Health Profile measurement protocol;
- `change_candidates`;
- `data_quality_reviews`.

Owner review/confirmation state is portable.

## Explicit non-goals

I4 does not:

- calculate recovery/readiness scores;
- infer causality from changes;
- add correlations;
- auto-adjust Nutrition or Training targets;
- silently repair canonical rows;
- delete excluded records;
- treat missing water/Nutrition/Body evidence as zero;
- require RIR/RPE on every set;
- rewrite historical Training sets into new left/right semantics;
- call Gemini or Home-AI for change/watchdog detection.

## Validation before publication

Once this dormant commit is exposed to one branch:

1. apply migrations through 0046 to the branch test database;
2. run `npx tsc -b`;
3. run `npx eslint .`;
4. run `npm test`;
5. run `npm run build`.

Do not merge until the exact published branch head is green.

## Next roadmap slice

I5 — Shared Health Intelligence Engine + Ask Health Context.
