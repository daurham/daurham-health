# Current task

## I1 — Health Profile + Flexible Training Intent

### Status

Implementation prepared as a batched dormant Git commit on top of current `main`.

Do not move a feature branch ref while the Vercel rolling deployment limit is still active.

Repository schema head after I1:

`0043_health_profile_training_plan.sql`

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Product intent

I1 gives Health two missing pieces of canonical context:

1. stable owner facts that should not be re-asked or guessed; and
2. future Training intent that is flexible enough to survive real life.

Observed workout sessions remain canonical Training evidence. The Training Plan describes intent, not compliance morality.

## Health Profile contract

Store one owner profile per deployment:

- date of birth;
- height in canonical centimeters;
- bounded persistent health context;
- bounded persistent Training limitations;
- bounded durable dietary context.

Rules:

- store DOB, derive age as-of a Health calendar date;
- reject future DOB and implausible >130-year age;
- do not collect biological sex until a supported calculation actually requires it;
- owner-written context is owner-reported, not diagnosis or measured evidence;
- temporary pain/illness/travel/stress belongs in Daily Context, not persistent profile;
- profile is portable canonical backup state.

UI:

- Health Profile is the first substantive Settings card;
- owner-facing height uses feet/inches and converts at the boundary;
- compact summary shows age/height when available.

## Training Plan contract

Baseline plan is versioned by effective date and contains:

- weekly programmed-session target;
- ordered routine-code sequence;
- preferred weekdays;
- default non-training intent: rest, active recovery, or flexible;
- optional note.

Routine codes, not template UUIDs, define sequence so Saved Routine version changes do not rewrite the plan.

Historical reads select the latest plan version effective on/before the requested as-of date.

### Current-week overrides

One dated override may resolve a day to:

- training preferred;
- rest;
- active recovery;
- flexible;
- away / paused;
- training moved here;
- training moved away.

Moves write paired source/destination overrides with linked dates.

Overrides are restricted to the current Monday–Sunday Health week.

### Sequence semantics

The next intended session is derived from the most recent canonical programmed Training session whose routine code is in the current sequence.

Example:

A → B → C

If A is completed Monday and B moves Wednesday → Thursday:
- Wednesday becomes `training_moved_away`;
- Thursday becomes `training_moved_here`;
- next intended session remains B until B is completed;
- after B completes, next becomes C.

Ad-hoc and Experiment workouts do not advance the sequence.

If a routine is later archived:
- keep its routine code in historical plan versions;
- surface it as unavailable;
- do not silently substitute another routine.

### No punitive missed-day semantics

I1 does not store:
- missed;
- failed;
- late;
- adherence failure for an exact weekday.

Weekly completion is descriptive: completed programmed sessions versus weekly target.

Preferred weekday != due date.

Daily Context `rest_day` remains retrospective and does not become schedule authority.

## UI

Training page:
- compact Training Plan card;
- today intent;
- completed/target count;
- next session;
- direct Start button when today is a Training day and the next routine is available;
- Adjust link.

Training → Plan:
- edit versioned baseline;
- reorder routine sequence;
- choose preferred weekdays;
- choose weekly target;
- choose default non-training intent;
- change current-week day intent;
- reset an override;
- move a planned Training day to another day in the current week.

Existing Saved Routines remain the routine-construction surface.

## APIs

Owner-only:

- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/training/plan?asOf=YYYY-MM-DD`
- `PUT /api/training/plan`
- `PUT /api/training/plan/overrides/:date`
- `DELETE /api/training/plan/overrides/:date`
- `POST /api/training/plan/move`

## Backup

Add canonical portable/full backup inventory for:

- `health_profile`
- `training_plan_versions`
- `training_plan_sequence_items`
- `training_plan_preferred_weekdays`
- `training_plan_day_overrides`

## Explicit non-goals

I1 does not:
- add a universal readiness score;
- infer diagnosis from profile text;
- make Ask Health consume Profile/Plan yet (shared intelligence phase owns that);
- make Coach calculate new plan-aware recommendations yet;
- create daily hydration/bowel/wellness signals;
- create exact-weekday failure semantics;
- replace Saved Routines.

## Validation before publication

Once the dormant commit is exposed to a branch:

- `npx tsc -b`
- `npx eslint .`
- `npm test`
- `npm run build`

Required regression coverage includes:

- birthday boundaries;
- height conversion;
- Monday week boundaries;
- sequence A→B→C wrap;
- preferred day vs default rest/flexible;
- singleton profile constraints;
- plan/version/weekday constraints;
- paired move override constraints;
- portable backup round trip.

Do not merge until the exact branch head is green.
