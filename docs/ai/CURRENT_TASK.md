# Current task

## I2 — Daily Signals Foundation + Today Check-in

### Status

Implementation prepared as a batched dormant Git commit on top of dormant I1 commit `48ac3d7bd1ce6094ca61297c3f0bc5f517c482a6`.

Do not move a feature branch ref while the Vercel rolling deployment limit is still active.

Repository schema head after this I2 batch:

`0044_daily_signals.sql`

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Product intent

This first I2 batch adds a small set of high-value owner-entered daily facts without turning Today into a wall of trackers.

The batch deliberately separates:

- canonical facts recorded by the owner;
- derived daily summaries;
- later intelligence/relationship analysis.

Missing evidence remains missing. No water entry is not 0 oz. No bowel entry is not an explicit zero-BM day. No wellness row is not a normal rating.

## Canonical data

### Hydration

`hydration_events` stores event-based water evidence:

- Health calendar date;
- optional observed timestamp;
- canonical milliliters;
- manual source;
- optional note;
- optional request UUID for idempotent retries.

Current-day quick logging receives the current instant when no timestamp is supplied. Backlogged date-only entries keep `occurred_at = NULL` rather than inventing a time.

No hydration target or tracking-complete state is introduced in this batch.

### Bowel

`bowel_events` stores:

- Health calendar date;
- optional observed timestamp;
- required Bristol type 1–7;
- optional straining;
- optional urgency;
- optional incomplete feeling;
- optional note;
- manual source;
- optional request UUID.

`bowel_day_states` stores the explicit `no_bowel_movement` state.

Rules:

- absence of both event and state means unknown;
- explicit no-BM is a tracked zero day;
- adding a bowel event clears the no-BM state;
- setting no-BM is rejected while an event exists;
- Bristol type 0 does not exist.

### Subjective daily check-in

`daily_wellness` stores at most one row per Health date:

- energy 1–5;
- hunger 1–5;
- soreness 1–5;
- optional stress 1–5.

At least one rating is required.

Subjective sleep quality is not added in this batch because objective Sleep already exists and the optional subjective field has not been accepted as necessary.

## Today / UX

Today gets one **Daily check-in** card immediately after the Training area and before Supplements.

It replaces the previous standalone Today Context card.

The compact card shows:

- tracked water total or —;
- bowel count / explicit none / —;
- energy;
- hunger;
- soreness;
- existing Daily Context summary.

Owner actions:

- quick-log common water amounts directly from Today;
- open `/check-in?date=YYYY-MM-DD` for water history/custom amount, Bristol logging, explicit no-BM, and wellness ratings;
- open the existing Daily Context editor from the same consolidated surface.

The full check-in page supports prior Health dates. Exact event times are not invented for date-only backlog.

Daily Context remains its own canonical authority and table; only its Today presentation is consolidated.

## APIs

Owner-only routes handled by the Daily Signals handler:

- `GET /api/check-in/days/:date`
- `PUT /api/check-in/days/:date`
- `DELETE /api/check-in/days/:date`
- `POST /api/hydration/events`
- `DELETE /api/hydration/events/:id`
- `POST /api/bowel/events`
- `DELETE /api/bowel/events/:id`
- `PUT /api/bowel/days/:date/no-movement`
- `DELETE /api/bowel/days/:date/no-movement`

Canonical mutations participate in the existing Health-data-change refresh path.

## Backup

Portable/full backup inventory includes:

- `hydration_events`;
- `bowel_events`;
- `bowel_day_states`;
- `daily_wellness`.

## Explicit deferrals

This first dormant I2 batch does **not** add:

- XP for daily logging — I3 owns participation rewards;
- personal correlations or relationship claims;
- a readiness/recovery score;
- hydration prescriptions;
- bowel diagnoses;
- a new Progress tab;
- Timeline daily-signal lanes;
- Ask Health daily-signal evidence.

Timeline and Ask Health integration from the broader master-roadmap I2 description are intentionally deferred to I5, where the shared evidence frame, provenance, coverage, and confidence semantics are built once and reused everywhere.

## Validation before publication

Once the dormant commit is exposed to one branch:

- `npx tsc -b`
- `npx eslint .`
- `npm test`
- `npm run build`

Required regression coverage includes:

- ounce ↔ milliliter conversion;
- missing versus explicit zero-BM semantics;
- Bristol/rating bounds;
- migration constraints;
- canonical portable backup inventory;
- Today/check-in placement and refresh behavior.

Do not merge until the exact branch head is green.
