# Daurham Health — Next Intelligence & Daily Context Roadmap

**Status:** Design specification / future implementation contract  
**Intended timing:** After current H5 work is fully closed and repository state is reconciled  
**Last updated:** 2026-10-06  
**UI review status:** Mobile walkthrough reviewed 2026-10-06. The information architecture below now reflects the current app. Re-review exact spacing during each implementation slice.

---

## 1. Purpose

Daurham Health already captures a large amount of canonical health evidence across Nutrition, Training, Body, Activity, Sleep, Supplements, Goals, Daily Context, Personal Lab, Progress, Coach, Ask Health, and XP/Rewards.

The next stage should **not** primarily add more isolated trackers.

The next stage should make the app better at four things:

1. **Know the owner well enough to interpret health data correctly.**
2. **Understand what the owner intended to do, not only what happened.**
3. **Capture a small set of high-value daily signals that explain otherwise ambiguous trends.**
4. **Turn existing evidence into useful decisions without inventing certainty.**

The desired product progression is:

> **Logging → measuring → understanding → adjusting**

The long-term experience should answer questions such as:

- What should I do today?
- Am I actually progressing toward my goal?
- Is this weight stall real or probably noise?
- Am I under-recovering, or was today an intended rest day?
- Is my calorie target still producing the expected result?
- Is low fiber / water associated with poor bowel regularity for me?
- Is my strength holding while I lose weight?
- What is the single most useful adjustment I can make this week?
- Does Health AI actually know enough about me to answer this question intelligently?

This document specifies the data, UX, analytics, AI context, reward behavior, migration concerns, testing expectations, and implementation sequence required to move toward that product.

---

# 2. Existing Product Constraints That Must Remain True

These rules are more important than any individual feature in this roadmap.

## 2.1 Canonical facts remain canonical

Daurham Health's durable architecture is:

> **Health owns canonical facts. Sources provide observations. Deterministic code validates, calculates, and derives. AI interprets or phrases. Missing evidence stays missing.**

New features must follow the same rule.

Examples:

- A user-entered water event is canonical.
- A calculated daily water total is derived.
- A Bristol stool type selected by the owner is canonical.
- "Constipation risk may be elevated" is an interpretation, not a stored diagnosis.
- A weekly training plan is canonical owner intent.
- "You missed Tuesday's workout" is derived and must only be emitted if Tuesday was actually planned as a training day.
- An observed-TDEE estimate is derived and must not be stored as if it were a measured metabolic value.
- AI may explain a plateau analysis. It must not decide that weight loss has stopped without deterministic evidence supporting that statement.

## 2.2 Missing is not zero

This is especially important for the new daily signals.

Examples:

- No water events logged does **not** mean 0 oz consumed.
- No bowel movement event does **not** mean the owner had zero bowel movements.
- No hunger rating does **not** mean hunger was low.
- No soreness entry does **not** mean the owner was pain-free.
- No workout does **not** mean the owner failed a workout if the day was planned rest.
- No planned workout does **not** necessarily mean rest unless the weekly plan explicitly says so.

Whenever a true zero is analytically useful, the product needs an explicit way to record it.

Example:

> "No bowel movement today" is an explicit daily state and is different from "I did not log bowel data today."

## 2.3 Current-day data can be provisional

Existing Activity already treats the current configured Health-calendar day as provisional.

New current-day totals should follow similar semantics. Analytics that require a complete day should avoid treating 10:00 AM hydration, calories, steps, or bowel logs as a completed daily total.

## 2.4 The configured instance timezone is the Health calendar

Every daily record, backlog flow, weekly plan, XP day cap, and daily analytics window must respect the deployment-level `HEALTH_CALENDAR_TIMEZONE` authority.

The original/default owner deployment remains `America/Phoenix`, but a second instance may use another valid IANA timezone without source changes.

Do not silently use browser-local or UTC dates when Health-calendar semantics are required.

## 2.5 High-frequency actions must not be buried in Progress

Progress is for understanding history.

It should not become the only place where a user can:

- log water,
- record a bowel movement,
- complete a daily check-in,
- see today's intended rest/training state,
- or perform another frequent daily action.

New high-frequency features should appear at the moment they are useful, primarily on **Today** or within the relevant domain.

## 2.6 Do not add another top-level primary nav item by default

The current primary navigation is already:

- Today
- Nutrition
- Training
- Body
- Progress

The initial design should preserve that.

If the walkthrough video proves that a navigation redesign is warranted, revise this section before implementation.

---

# 3. Current Integration Points

The roadmap should extend existing systems instead of creating parallel concepts.

Important existing authorities include:

- **Daily Context** — retrospective owner-declared exceptions and notes.
- **Training session types** — programmed, ad hoc, experiment.
- **Saved/versioned routines** — reusable programmed workout definitions.
- **Activity** — Apple / Health Auto Export activity observations.
- **Sleep** — canonical sleep observations and analytics already exist.
- **Goals** — versioned owner targets and deterministic status/projections.
- **Nutrition** — calories, macros, fiber, sodium, recipes, reusable foods.
- **Coach** — persistent deterministic tasks.
- **XP / Rewards** — append-only reward ledger; currently Coach completion is the XP issuance authority.
- **Ask Health** — evidence packet assembled from canonical domains.
- **Progress** — derived analytics, trends, Timeline, Compare, Strength, Body, Activity, Sleep.
- **Personal Lab** — protocols, benchmarks, experiments, retest logic.

New functionality should integrate with those systems rather than re-implement them.

---

# 4. Information Architecture — Post-Walkthrough Decision

The 2026-10-06 mobile walkthrough materially changes the placement recommendations in the first draft of this roadmap.

The problem is not that Daurham Health lacks places to put features. The problem is that the app already has enough secondary destinations and long pages that simply adding another route or another full-size card would make useful features harder to discover.

The next phases should therefore improve **access architecture** at the same time they add new data.

## 4.1 What the current mobile app actually looks like

The walkthrough shows a clear five-destination mobile shell:

- Today
- Nutrition
- Training
- Body
- Progress

That shell is working and should remain stable.

The global header already contains:

- Daurham Health
- XP balance
- Menu

The current mobile **Menu** contains only:

- Settings
- Sign out

That is the largest navigation/discoverability gap visible in the walkthrough. Important existing owner surfaces such as Goals, Personal Lab, Supplements, Ask Health, and other utility destinations are reachable from contextual cards, but they are not represented in one predictable "more" destination.

### Today

Today is already a long vertical board.

The walkthrough shows the rough flow as:

1. Nutrition
2. Coach
3. Training
4. Supplements
5. Activity
6. Sleep
7. Context
8. What changed
9. Patterns / deeper interpretation

This is a good reason **not** to create separate full cards for Water, Bowel, Energy, Hunger, Soreness, and another new Context-like feature.

### Nutrition

Nutrition already has a strong primary action hierarchy:

- Add food
- Pantry
- Recipes

The nutrition day itself already exposes calories, macros, fiber, and sodium.

Hydration should integrate with daily health context but should **not** be silently folded into the Nutrition canonical domain merely because water is consumed.

### Training

Training already has a strong primary CTA:

- Start workout

and secondary actions:

- Exercises
- Manage routines
- Import workout photo

Recent workouts appear immediately below.

A weekly training/rest plan therefore needs a **visible status surface**, not merely another small secondary button that competes with the existing controls.

### Body

Body contains a useful interaction pattern:

> Measurement schedule → current schedule summary → View schedule / cadence actions.

This is an excellent visual/product precedent for the planned Training week.

### Progress

Progress is already dense and mature. The walkthrough shows seven subsections:

- Overview
- Activity
- Sleep
- Strength
- Body
- Timeline
- Compare

Progress should **not** gain a new "Daily Signals" tab during the initial implementation.

### Settings

Settings is already a long page. It currently begins with Theme Studio, then continues into trend preferences and utility/management sections such as Supplements, Goals, Data & Backup, and Data Sources.

Health Profile belongs here, but because it affects almost every intelligent interpretation in the app, it should be the **first substantive Settings card**, not an item added near the bottom.

### Goals

Goals is already a capable standalone management screen with active goals and goal creation.

The issue is not that Goals lacks a screen. The issue is that high-level access is indirect.

The roadmap should improve discoverability rather than rebuild Goals.

---

## 4.2 Keep the five primary tabs

Do not add:

- Health
- Check-in
- Hydration
- Bowel
- Goals
- Lab
- Coach

as a sixth mobile bottom-tab destination.

The current five tabs map well to the primary behavior domains and already consume the available mobile width.

New work should fit inside the existing shell.

---

## 4.3 Turn the mobile Menu into the secondary navigation hub

The current Menu only exposes Settings and Sign out.

Expand it into a predictable **More / Menu** hub for lower-frequency or cross-domain owner surfaces.

Recommended mobile Menu contents:

### Health tools
- Ask Health
- Goals
- Personal Lab
- Supplements
- Rewards

### Owner setup
- Health Profile
- Settings

### Account
- Sign out

The XP badge can continue linking directly to Rewards, so Rewards appearing in Menu is for discoverability rather than being the only route.

Do not place high-frequency logging exclusively in this menu.

This change solves a general information-architecture problem rather than adding special navigation for each new feature.

---

## 4.4 Today gets one Daily Check-in surface, not five new cards

The best fit for the new high-frequency signals is **one compact Daily Check-in card**.

Recommended placement:

> **After Training and before Supplements.**

Reasoning:

- Nutrition remains the first and strongest daily domain.
- Coach and Training remain high-priority action surfaces.
- Daily Check-in is frequent enough to remain above Activity/Sleep/history.
- It is reached before the user gets deep into the Today scroll.
- It prevents Water/Bowel/Wellness from being buried in Progress.

### Important consolidation

The new Daily Check-in should **absorb the current standalone Context card**.

Do not keep:

- Context card
- Water card
- Bowel card
- Energy card
- Hunger card
- Soreness card

as separate Today modules.

That would make Today substantially worse.

Instead, one card should summarize owner-entered daily state.

### Compact unfilled state

Example:

> **Daily check-in**  
> Water — · Bowel — · Energy —  
> `+ Water` `Bowel` `Check in`  
> `Add context`

### Partially completed state

Example:

> **Daily check-in**  
> Water 40 oz · Bowel 1 · Energy 3/5  
> Hunger — · Soreness 2/5  
> `+ Water` `Update`  
> Context: Rest day

### Completed/collapsed state

When enough information is recorded, the card should become quieter rather than continuing to demand attention.

Example:

> **Daily check-in**  
> 72 oz water · BM 1 · Energy 3 · Hunger 3 · Soreness 2  
> Context: late meal

### Interaction model

- `+ Water` performs the fastest common hydration action or opens a tiny amount sheet.
- `Bowel` opens the Bristol selector.
- `Check in` opens the subjective ratings.
- `Add context` opens the existing Daily Context workflow.
- Tapping the card can expose the full day's entries/history.

Do not require the owner to fill every field to make the card useful.

---

## 4.5 Hydration should be fast enough for repeated use

Water is the one proposed signal that may be logged multiple times per day.

It therefore needs a particularly low-friction path.

Initial recommendation:

- Keep `+ Water` directly on the Daily Check-in card.
- Use saved/default amounts such as 8, 12, 16, 24 oz.
- Allow one custom amount.
- Allow an owner-configured bottle size later.

Do not initially add another permanent header button beside Ask Health and Refresh. The Today header is already compact.

If real-world use shows that opening Today and scrolling to Daily Check-in is still too slow, a later implementation may add a global Quick Log action. Do not pre-commit to that before testing the compact Today card.

---

## 4.6 Training plan belongs visibly on Training — but must be flexible

Do not implement the weekly plan as a rigid calendar that turns ordinary life changes into "missed workouts."

The owner may occasionally:

- travel;
- move a gym day one day earlier/later;
- do an ad-hoc challenge;
- need an extra rest day;
- resume the normal sequence afterward.

The app should make those changes feel normal rather than like correcting a mistake.

### Training page hierarchy

Recommended:

1. Training heading / explanation
2. Start workout
3. Existing secondary actions
4. **This week / Training plan card**
5. Recent workouts

The card should borrow the successful Body "Measurement schedule" pattern.

Example:

> **Training plan**  
> Goal: 3 programmed sessions this week  
> Sequence: Full Body A → B → C  
> Preferred: Mon · Wed · Fri  
> Today: Rest / flexible  
> Next: Full Body B — preferred Wednesday  
> `Adjust this week`

A detailed editor can live at:

`/training/plan`

but the status and entry point must remain visible on Training.

### Soft schedule, not hard appointments

The normal mode should be a **soft plan**.

The plan can contain:

- weekly frequency target;
- ordered routine/session sequence;
- preferred weekdays;
- optional rest / active-recovery preferences.

Preferred weekday does **not** mean due-at-midnight.

If Wednesday's session is moved to Thursday, the app should simply reinterpret the week:

- Wednesday becomes rest/flexible;
- Thursday becomes the planned session;
- no adherence failure;
- no negative Coach message;
- sequence stays intact.

### Session queue is more important than weekday rigidity

For an A/B/C program, the app should primarily know:

> **The next programmed session is B.**

Weekdays are scheduling hints around that sequence.

This prevents the app from accidentally treating:

- Monday A;
- missed Wednesday B;
- Friday C

as valid sequence adherence if B was never performed.

Preferred model:

> Complete 3 sessions this week, in sequence A → B → C, with Mon/Wed/Fri as preferred placement.

### Fast move controls

A planned training day should offer low-friction actions such as:

- Move to tomorrow
- Move to…
- Make today rest
- Train today instead
- Adjust this week

Moving a session should not require editing the long-term recurring template.

### Temporary weekly overrides

Support a lightweight "this week is different" layer.

Examples:

- Out of town until Thursday.
- Sick this week.
- Deload.
- Family event.
- Long hike replacing normal activity emphasis.

The user should be able to shift the week's schedule without rewriting the normal plan.

A future convenience may support:

> **Away / flexible week**

which temporarily relaxes exact-day expectations while preserving the desired session count/sequence.

### Today integration

The existing Training card should read the flexible plan.

Example preferred-training state:

> **Training**  
> Full Body B is next  
> Preferred today · flexible this week  
> `Start workout` · `Move`

Example rest/flexible state:

> **Training**  
> Recovery / flexible day  
> Next programmed session: Full Body B  
> Walking and ad-hoc challenges are fine.

Example shifted state:

> **Training**  
> Full Body B moved to tomorrow  
> Today is now a recovery day.

### Adherence semantics

Default adherence should focus on:

- sessions completed in the intended sequence;
- target frequency within the weekly/rolling evaluation window;
- explicit owner changes.

Do **not** default to exact-weekday obedience.

A session should not become "missed" merely because its preferred day passed.

Only classify a missed programmed session after its applicable flexible window/week closes and the owner has not moved, skipped, paused, or completed it.

### Coach / Goal Control behavior

Coach must respect plan edits immediately.

Bad:

> You missed yesterday's workout.

after the owner moved it to today.

Good:

> Full Body B was moved to today. You're still on plan for 3 sessions this week.

The Goal Control System should prefer weekly/sequence adherence unless the owner explicitly creates a fixed-date training requirement.

---

## 4.7 Health Profile is the first Settings card

The walkthrough shows Theme Studio currently occupying the top of Settings.

Once Health Profile exists, recommended Settings order begins:

1. **Health Profile**
2. Theme Studio
3. Trend preferences
4. Supplements
5. Goals
6. Data & Backup
7. Data Sources
8. other owner/admin utilities

Health Profile should show a compact summary rather than a giant form.

Example:

> **Health Profile**  
> DOB: recorded · Height: 5'10"  
> Persistent context: 1 item  
> `Edit profile`

If core profile information is incomplete, use a quiet status:

> Height missing

Do not make the entire Settings page look like an onboarding error state.

### Direct access

The mobile Menu should link directly to Health Profile even though the actual UI is housed under Settings.

Ask Health should also link there when it detects a relevant missing field.

---

## 4.8 Progress analyzes Daily Signals without adding another tab

Do not add an eighth Progress tab during I2.

Use the existing surfaces:

### Overview

Add only a compact Daily Signals summary when there is something meaningful to say.

Examples:

- hydration tracking coverage;
- bowel regularity summary;
- energy/hunger trend;
- soreness trend.

### Timeline

This is the natural history surface for new signals.

Add filter/lane support for:

- hydration day totals/completeness;
- bowel events / explicit no-BM state;
- daily wellness ratings;
- Daily Context.

Avoid rendering every glass of water as a noisy timeline mark by default. Prefer day-level summaries in the main timeline, with drill-down available.

### Compare

Daily signals may later participate in period comparison when data coverage is sufficient.

Do not force compare statistics from sparse logs.

### Insights / patterns

Cross-domain relationships such as fiber ↔ bowel or sleep ↔ hunger belong in the existing interpretation layer.

This avoids inventing another analysis destination.

---

## 4.9 Ask Health keeps its current entry points and gains context transparency

The walkthrough shows Ask Health already accessible from Today and represented again in Progress.

Keep those entry points.

Add:

- **Context used for this answer**
- **Missing context that matters**

as progressive disclosures inside Ask Health.

Example:

> Health Profile: DOB and height available  
> Training plan: today is planned rest  
> Nutrition: 13/14 days logged  
> Hydration: partial tracking  
> Bowel: 8/14 days tracked

If a core field is missing:

> Height is not in your Health Profile. Add it if you want body-size-dependent calculations to use it.

This makes Health AI feel integrated with the app rather than like a generic chat window.

---

## 4.10 Existing secondary features need discoverability, not more cards

The walkthrough confirms that several important systems already exist but can feel "somewhere in the app":

- Goals
- Personal Lab
- Supplements
- Rewards
- Ask Health

Do not solve this by putting every destination into the bottom navigation.

The expanded Menu is the canonical secondary-destination map.

Contextual entry points should still remain:

- Goals from Progress and relevant goal status.
- Lab from Today/Progress when due.
- Supplements from Today and Menu.
- Ask Health from Today/Progress/Menu.
- Rewards from XP badge and Menu.

This gives the owner both contextual discovery and predictable direct navigation.

---

## 4.11 Today should separate Goal Overview from Coach action

The owner wants both:

1. a **Goal Overview / tip card** that answers "How am I doing?"; and
2. a **Coach card** that answers "What should I do next?"

These should be distinct but coordinated.

### Goal Overview card

Recommended placement:

> **After Nutrition and before Coach.**

This is one of the few justified additions to the Today card budget because it gives the rest of the page a purpose.

The card should be compact and read the existing canonical Goals + Goal Control evidence.

Example:

> **Goal — Fat loss + strength preservation**  
> **On track**  
> Weight trend: −0.8 lb/week  
> Strength: stable  
> Main gap: fiber  
> **Tip:** Keep calories unchanged this week.  
> `View goal`

The Goal card is primarily **state + interpretation**.

It should answer:

- What is my main goal?
- Am I on track?
- What evidence matters most?
- What is the one useful takeaway?

It should not become a task checklist.

If several active goals exist, the card should prioritize the designated/derived primary goal and summarize secondary constraints rather than rendering multiple large cards.

### Coach card

Coach should become more insightful than a quest container.

It should contain:

- concise personalized tips;
- **Next Best Actions**;
- existing XP-bearing commitments / Daily Quest / Stretch Quest;
- the reason an action is being suggested when useful;
- an explicit "no change needed" state.

Example:

> **Coach**  
> **Best moves today**  
> 1. Add ~10–12 g fiber.  
> 2. Planned recovery day — lifting is optional, walking is enough.  
> 3. Keep calories unchanged.
>
> **Daily Quest**  
> Complete today's supplement check-in · +XP

### Responsibility boundary

**Goal Overview**
- progress;
- trajectory;
- important evidence;
- one high-level tip.

**Coach**
- actionable recommendations;
- prioritization;
- commitments / quests;
- XP-bearing tasks.

The two cards may use the same deterministic evidence engine, but they must not independently calculate contradictory interpretations.

### Next Best Actions live in Coach

The roadmap's previous concept of a separate Today "Next Best Actions" surface is superseded.

Next Best Actions are a permanent Coach responsibility.

A Next Best Action does not automatically become a quest.

- **Advice** can be shown without acceptance or XP.
- **Commitment/quest** is an explicit lifecycle item and may earn XP.

This lets Coach be genuinely useful even on days where no quest is appropriate.

---

## 4.12 What Changed and Patterns remain interpretation, not action entry points

In the walkthrough, What Changed and Patterns are encountered later in the Today scroll.

That is appropriate for retrospective interpretation.

Do not put required daily logging actions there.

A future cleanup may consolidate overlapping "What Changed", "Patterns", "Insights", and weekly interpretation copy, but this should happen only when their responsibilities are explicitly reconciled.

---

## 4.13 UI placement rule after the walkthrough

For future features, placement is determined by **frequency and immediacy**, not by which database/domain owns the value.

- Multiple times per day → visible on Today.
- About once per day → Daily Check-in on Today.
- Weekly planning → relevant domain with visible summary.
- Rare profile/setup → Settings + direct Menu access.
- Historical analysis → Progress.
- Cross-domain explanation → Ask Health / Insights.
- Secondary destination discoverability → Menu.

This becomes an implementation constraint for the phases below.

---

# 5. Health Profile

## 5.1 Purpose

Health AI currently has strong longitudinal app data but can lack basic owner context that meaningfully changes interpretation.

The Health Profile should store **stable or slowly changing facts** that help calculations and AI interpretation.

## 5.2 Recommended first-version fields

### Core

- Date of birth
- Height
- Optional biological sex / sex at birth **only if a specific supported calculation requires it**
- Owner/deployment timezone must come from one canonical instance configuration authority rather than a hard-coded Phoenix constant or duplicate editable fields

### Health / training context

- Persistent injuries or limitations
- Optional owner-entered health considerations
- Optional dietary restrictions/preferences that materially affect recommendations

### Later structured candidates

Do not automatically include all of these in the first migration, but the profile architecture should leave room for:

- medication inventory,
- allergies,
- chronic conditions / diagnoses,
- pregnancy/postpartum state where relevant,
- smoking/nicotine baseline,
- alcohol baseline,
- mobility limitations,
- family-history items that materially affect a supported feature.

A freeform "important context for Health AI" field may be useful initially, but it must be bounded and clearly owner-authored.

## 5.3 Why date of birth instead of age

Store DOB.

Derive age as-of the requested Health date.

This prevents stale age values and allows historical Ask Health questions to use the correct age.

## 5.4 Why height matters

Height can support:

- BMI when useful,
- waist-to-height ratio,
- some reference ranges,
- future body-composition context,
- health-question context.

Do not over-emphasize BMI as an authoritative health score.

## 5.5 Sex field constraints

Do not collect this simply because generic health apps do.

Only request it when a supported calculation or interpretation needs it.

The UI should explain why the field is being requested.

## 5.6 Editing semantics

Profile values need explicit semantics.

DOB:
- effectively stable;
- allow correction;
- correction changes future derived reads;
- do not create fake historical "age observations."

Height:
- owner may correct it;
- if historical height changes ever become relevant, consider versioning/effective dates;
- for the current adult-owner product, a single current value may be acceptable if explicitly documented.

Persistent health context:
- should be editable;
- should preserve source as owner-entered;
- AI must identify it as owner-reported rather than measured evidence.

## 5.7 UI

Settings → Health Profile.

Compact summary:

- Age
- Height
- Relevant constraints

Edit sheet/page for details.

Ask Health should link to it when context is missing.

## 5.8 Edge cases

- DOB in the future.
- Implausible age.
- Height entered in ft/in vs cm.
- Height correction after derived metrics were previously viewed.
- Empty optional medical context.
- Accidentally entering temporary pain into persistent limitations.
- AI treating a user-written note as a diagnosed condition.

## 5.9 Testing

- DOB age calculation at birthday boundaries.
- Phoenix as-of dates.
- Unit conversion round trips.
- Empty profile behavior.
- Ask Health packet with complete, partial, and absent profile.
- Owner-only access.
- Backup/export inventory if a durable table is added.

---

# 6. Flexible Training Intent, Rest Days, and Session Sequence

## 6.1 Purpose

The app needs to know what training was intended without making the owner serve the calendar.

The system should distinguish:

- the normal training pattern;
- the next programmed session;
- preferred days;
- actual temporary changes;
- observed Training;
- Activity such as walking/hiking;
- retrospective Daily Context.

The goal is useful interpretation, not schedule policing.

## 6.2 Critical distinction: planned vs retrospective rest

Existing Daily Context includes a `rest_day` tag.

That tag is retrospective:

> "The owner marked this day as a rest day."

It must **not** become the source of truth for future training intent.

New concepts:

### Baseline plan
The normal routine/frequency/sequence and preferred schedule.

### Current-week plan
The baseline after temporary moves/overrides.

### Observed reality
What Training / Activity records show actually happened.

### Retrospective context
What the owner later says was relevant.

These may agree, but they are not interchangeable.

## 6.3 Flexible intent types

A calendar day may currently resolve to:

- `training_preferred`
- `rest`
- `active_recovery`
- `flexible`
- `training_moved_here`
- `training_moved_away`
- `paused_or_away`

Exact enum naming can be simplified during implementation.

The important product semantics are:

**training preferred**  
A programmed session is suggested today, but may be moved within the plan's flexible window.

**rest**  
No programmed session expected.

**active recovery**  
No normal programmed session expected; light activity is intended.

**flexible**  
No requirement. Ad-hoc training/activity is allowed.

**moved**  
An explicit current-week override has changed the preferred day.

## 6.4 Sequence-first programmed training

Where a saved routine/program has an ordered rotation, sequence is authoritative.

Example:

> A → B → C

If the owner completed A Monday and moves B from Wednesday to Thursday, Thursday remains B.

The system must not silently advance to C because the preferred date for B passed.

For sequence-based programs, store enough state to identify the **next intended session** independently from weekday labels.

## 6.5 Frequency + preference model

A useful baseline plan may say:

- target: 3 programmed sessions/week;
- sequence: A → B → C;
- preferred days: Monday / Wednesday / Friday;
- rest or active recovery on other days.

That allows the app to plan without making Mon/Wed/Fri hard deadlines.

## 6.6 Current-week overrides

The owner can change only the current week:

- move Wednesday → Thursday;
- train Tuesday instead;
- add a rest day;
- mark travel / away;
- pause the week;
- convert a planned day to flexible.

The long-term template stays unchanged.

## 6.7 Completing on a different day

If the owner starts the expected routine on a non-preferred day, the app should offer to match it to the current plan automatically.

Example:

> You started Full Body B today. Count this as this week's planned B session?

If the match is unambiguous, it may be automatic with an undo affordance.

## 6.8 Rest-day flexibility

Rest is not a moral obligation and not a failure state.

If a training day moves forward one day, the rest day can move backward one day.

The app should describe the result neutrally.

Example:

> Today is now a recovery day. Full Body B moved to tomorrow.

## 6.9 Travel / disruption

Rare disruptions should be easy.

Possible quick action:

> **Adjust this week**

Options may include:

- Move a session;
- Skip one planned session;
- Make the rest of the week flexible;
- Away until [date];
- Resume normal plan next week.

No red failure styling is appropriate for an owner-declared plan change.

## 6.10 Analytics

Training adherence should default to:

- target sessions completed;
- correct/expected sequence where applicable;
- completed inside the weekly or rolling plan window.

Preferred-day accuracy may be shown as descriptive information but should not drive failure status.

Fixed-date adherence should exist only when the owner explicitly chooses a fixed event/benchmark/session.

## 6.11 Ask Health

Ask Health should receive separate fields for:

- baseline training pattern;
- current-week overrides;
- today's resolved intent;
- next programmed session;
- actual recent Training;
- Activity.

This allows answers such as:

> Today was originally a preferred gym day, but you moved the session to tomorrow because you're away. Your week is still on plan.

## 6.12 Edge cases

- User moves a session after its original preferred day.
- User moves a session more than once.
- Two sessions are moved to the same day.
- User trains twice in one day.
- User performs C when B is next.
- User performs an ad-hoc workout on a rest day.
- User archives/versions a routine referenced by the plan.
- User skips an entire week.
- Week crosses month/year boundaries.
- User has no weekly plan.
- User follows a pure sequence without preferred weekdays.
- User completes only 2 of 3 sessions but intentionally changed the target to 2 for that week.
- Travel is recorded in Daily Context but the plan was not changed.

## 6.13 Bugs / obstacles to anticipate

- Treating `daily_context.rest_day` as schedule authority.
- Treating preferred dates as hard deadlines.
- Advancing A/B/C sequence based on date instead of completed sessions.
- Coach retaining stale "missed workout" advice after a move.
- Template edits changing historical plan intent.
- Duplicate planned sessions from template + override.
- Apple Activity workouts incorrectly satisfying Training requirements.
- Time-zone boundaries resolving the wrong day.

## 6.14 Acceptance criteria

- The owner can define a normal weekly pattern.
- The owner can move a session without rewriting the normal pattern.
- Moving a session does not generate failure/negative adherence.
- The next routine in sequence remains correct.
- Rest days can move naturally around schedule changes.
- Ad-hoc challenges/walking are allowed on rest/flexible days.
- Coach and Ask Health immediately reflect current-week changes.
- Weekly adherence is evaluated flexibly by default.

---

# 7. Hydration / Water Tracking

## 7.1 Purpose

Hydration is useful context for:

- bowel regularity,
- high-fiber diets,
- training,
- appetite interpretation,
- scale fluctuations,
- recovery discussions.

The product should keep logging extremely low-friction.

## 7.2 MVP semantics

Prefer recording **water events** first.

Example event:

- occurred_at
- amount
- canonical unit
- source
- optional note

Daily total is derived.

If later expanding to all fluids, do it intentionally. Do not silently label water-only tracking as "total hydration."

## 7.3 Quick logging

Today should offer fast buttons such as:

- +8 oz
- +12 oz
- +16 oz
- +24 oz
- Custom

Potential owner preference:

- save favorite container sizes;
- "Bottle" can map to a configured volume.

## 7.4 Backlogging

User can log water for a prior Health date.

Backlog must preserve the actual intended date/time when known.

If only a date is known, the record should not pretend an exact event time was observed.

## 7.5 Completeness

No events is unknown, not 0 oz.

Optional future concept:

**Water tracking complete for this day**

This would allow analysis to distinguish:

- 32 oz definitely logged as complete,
- 32 oz partially logged,
- no tracking.

Do not require completion every day for basic use.

## 7.6 Goal support

A water target can be owner-selected.

Do not generate a highly specific medical hydration prescription solely from generic formulas.

If a target exists:

> Logged 48 / 80 oz

If no target:

> 48 oz logged

## 7.7 AI use

Health AI can say:

> You've logged less water than usual over the last four complete tracked days.

It should not say:

> You were dehydrated.

unless there is genuinely sufficient clinical evidence, which this app usually will not have.

## 7.8 Edge cases

- Large accidental amount.
- Duplicate tap.
- Logging after midnight for the prior day.
- Editing custom container size.
- Partial tracking.
- Other beverages contributing fluid but not represented.
- Exercise day with unusual fluid needs.
- High altitude / heat context.
- Imported data later added by another provider.

## 7.9 XP considerations

Do not award XP per glass indefinitely.

That creates an incentive to split one drink into many fake events.

Preferred rule:

> Award a small hydration-log XP event once per day after the first valid hydration entry.

Optionally award a separate completion bonus when a day is explicitly marked complete.

---

# 8. Bowel Movement / Stool Tracking

## 8.1 Purpose

Bowel data can provide useful longitudinal context for:

- fiber intake,
- logged water,
- dietary changes,
- supplements,
- illness,
- stress/context,
- activity changes.

The feature should be useful without becoming an obsessive digestive diary.

## 8.2 Event model

Each bowel movement can record:

Required:
- date/time
- Bristol stool type (1–7)

Optional:
- straining: yes/no
- urgency: none/mild/strong
- incomplete feeling: yes/no
- note

Consider keeping the optional fields behind an "Add details" disclosure.

## 8.3 Explicit zero-day state

This is essential.

The system must distinguish:

- bowel movement(s) logged;
- explicitly "No bowel movement today";
- no bowel data recorded.

An explicit zero-day can be represented as a daily completion/state record rather than a fake bowel event.

Never create a Bristol "0."

## 8.4 UI

Today → Daily Check-in.

Fast flow:

**Bowel movement** → Bristol visual selector → Save.

A tiny Bristol reference illustration is appropriate, but it should remain clinically neutral and easy to understand.

History should be available without making stool data visually dominant in the app.

## 8.5 Analytics

Possible derived metrics:

- bowel movements per tracked day;
- days between bowel movements;
- Bristol distribution;
- percentage of tracked movements in types 1–2;
- percentage in types 6–7;
- streak of explicit no-BM days;
- relationship with fiber;
- relationship with logged water;
- relationship with context tags.

Correlation wording must stay cautious.

Good:

> On your tracked days, firmer stool has occurred more often when fiber was below your recent average.

Bad:

> Low fiber is causing your constipation.

## 8.6 Medical safety / red flags

The app must not diagnose gastrointestinal disease from bowel logs.

If optional symptom capture is later added for:

- visible blood,
- black/tarry stool,
- severe pain,
- persistent major bowel change,

the product should use conservative health guidance and recommend appropriate clinical evaluation instead of producing a confident AI diagnosis.

Do not gamify alarming symptoms.

## 8.7 Edge cases

- Multiple movements in one day.
- Backlogged movement with unknown exact time.
- User records explicit no-BM and later adds a movement for that day.
- Delete movement after XP award.
- Travel / illness.
- Laxative or supplement changes.
- Sparse logging producing misleading frequency estimates.
- Days with no tracking misread as constipation.

## 8.8 Data quality rule

Bowel regularity calculations should preferably use **tracked/completed days**.

A 30-day calendar with only 5 tracked days should not generate confident frequency conclusions.

---

# 9. Daily Subjective Check-in

## 9.1 Purpose

A few subjective signals can explain objective data that would otherwise look contradictory.

Do not turn this into a long questionnaire.

## 9.2 Recommended signals

### Energy
1–5

### Hunger
1–5

Especially useful during fat loss.

### Soreness / recovery feeling
1–5, optionally body area when elevated.

### Subjective sleep quality
Optional 1–5.

This should complement, not replace, imported Sleep.

## 9.3 Why these signals are useful

Example:

Weight loss is on target, but:

- hunger rose from 2.3 → 4.3;
- energy fell;
- sleep declined;
- training performance is slipping.

That is a more meaningful decision context than weight alone.

## 9.4 UI

One compact Today card:

> **How are you feeling?**  
> Energy · Hunger · Soreness

Use one-tap controls.

Do not require all ratings.

## 9.5 Backlog

Allow prior-day entry.

Show that backfilled subjective data was entered retrospectively if provenance matters.

## 9.6 Edge cases

- Missing ratings.
- User interprets scale differently over time.
- Backfilled rating based on imperfect memory.
- Elevated soreness due to injury rather than training.
- Pain already represented in Daily Context.
- App overreacting to one low-energy day.

## 9.7 Analytics constraint

Use moving trends and thresholds.

Do not create strong recommendations from a single subjective rating.

---

# 10. Caffeine Timing

## 10.1 Priority

Useful, but lower priority than Profile, Training Intent, Water, Bowel, and the Daily Check-in.

## 10.2 Purpose

Caffeine timing may help interpret sleep and recovery.

## 10.3 MVP options

Option A:
- manual caffeine event,
- amount optional,
- timestamp required.

Option B:
- simple "caffeine after cutoff" daily flag.

Recommended first implementation if this feature is added:

> A lightweight caffeine event with timestamp and optional mg.

Do not require precise mg to log a coffee.

## 10.4 AI interpretation

Use cautious language.

Do not state that late caffeine caused poor sleep from a small number of observations.

---

# 11. Sleep

## 11.1 Do not build a duplicate sleep tracker

The app already has a substantial canonical Sleep domain.

New work should use it.

## 11.2 Useful addition

The Daily Check-in may add **subjective sleep quality**.

This is a separate owner-reported signal.

Objective:
- sleep duration/stages/source.

Subjective:
- "I felt like I slept poorly."

Both can be true even when they disagree.

---

# 12. Health AI Context Layer

## 12.1 Purpose

This is one of the highest-value updates in the roadmap.

The context layer is no longer an Ask-Health-only feature.

Daurham Health should build one shared, structured **Health Intelligence Snapshot** that can be consumed by:

- Today Goal Overview;
- Coach;
- What Changed;
- Patterns / Proactive Insights;
- Weekly Coach;
- Ask Health;
- Personal Lab experiment suggestions;
- Progress explanations.

Ask Health should not repeatedly rediscover the owner from disconnected domain queries, and neither should the other intelligence surfaces.

The app needs one coherent evidence model so two features cannot look at the same week and independently reach contradictory conclusions.

## 12.2 Snapshot sections

### Stable profile
- age as-of date
- height
- relevant persistent limitations
- relevant owner-authored clinical context

### Current goals
- primary active goals
- preservation/constraint goals when implemented
- relevant target and current status

### Current training intent
- today's planned state
- planned routine where applicable
- recent intended vs completed sessions

### Recent nutrition
- calories
- protein
- fiber
- sodium
- data coverage/completeness

### Hydration
- logged water
- tracking completeness
- recent pattern

### Bowel
- tracked-day coverage
- frequency
- recent Bristol types
- explicit no-BM days

### Activity
- steps
- recent activity pattern
- current-day provisional state

### Sleep
- recent objective sleep
- completeness
- subjective quality if recorded

### Recovery / subjective signals
- energy
- hunger
- soreness

### Daily Context
- recent unusual tags
- recent notes

### Training performance
- recent performance trend
- relevant stall/progression state

### Data limitations
- missing profile fields
- sparse weight coverage
- incomplete nutrition
- partial hydration
- sparse bowel tracking
- incomplete sleep
- low-confidence restaurant / AI-estimated food days
- inconsistent body-measurement protocol
- missing RIR/RPE on training where effort interpretation would matter
- passive recovery signals unavailable or not yet validated

### Evidence quality
- nutrition provenance / estimate-heavy days
- body-measurement comparability
- source continuity
- whether a day is complete or provisional
- whether timestamps represent the event or only the logging time

### Change / intervention context
- calorie-target changes
- macro/fiber target changes
- training-plan changes
- supplement starts/stops/pauses
- major activity-target changes
- experiment starts/stops
- temporary away / illness / deload periods

## 12.3 Example human-readable snapshot

> **Profile**  
> Age: 31  
> Height: 5'10"
>
> **Goal**  
> Fat loss while preserving strength.
>
> **Today**  
> Planned rest day. Walking/ad-hoc activity allowed.
>
> **Recent 14 days**  
> Weight trend: down  
> Calories: high coverage  
> Protein: usually on target  
> Fiber: frequently below target  
> Water: partial tracking  
> Bowel: 6 tracked movements, mostly Bristol 1–2  
> Sleep: objective data available  
> Strength: stable
>
> **Limitations**  
> Water tracking is incomplete. Bowel data was recorded on 8/14 days.

## 12.4 AI contract

AI may:

- synthesize evidence across many domains;
- explain deterministic findings in plain language;
- prioritize competing explanations;
- compare multiple plausible hypotheses;
- use owner goals to decide which evidence matters most;
- identify plausible relationships that deserve deterministic follow-up analysis;
- suggest conservative next actions;
- suggest a Personal Lab experiment when uncertainty can realistically be reduced;
- state what additional data would materially improve an answer.

AI should receive **structured evidence with IDs, dates/windows, coverage, provenance, and confidence**, not only prose summaries.

AI may not:

- fabricate profile values,
- treat unknown as normal,
- diagnose from stool/hydration trends,
- mutate calorie targets automatically,
- create canonical medical facts,
- claim causation from weak correlations.

## 12.5 "What Health knows" UI

Ask Health should have a compact disclosure showing context used.

This improves trust and makes missing context discoverable.

Example:

> Missing: height, water tracking sparse.

A direct link can let the owner fix the gap.

---

# 13. Goal Control System

## 13.1 Purpose

Goals should evolve from isolated targets into a system that answers:

> **Are we progressing, and should anything change?**

## 13.2 Initial use case

Example primary objective:

> Lose fat while maintaining or improving strength.

The app evaluates multiple signals rather than reacting to scale weight alone.

## 13.3 Inputs

Potential inputs:

- 7/14/28-day weight trend;
- waist trend;
- calorie adherence;
- protein adherence;
- fiber;
- steps;
- training frequency vs intent;
- e1RM / performance trend;
- sleep;
- hunger;
- energy;
- soreness;
- context tags;
- data coverage.

## 13.4 Output

Example:

> **Goal status: On track**
>
> Weight trend: −0.9 lb/week  
> Waist: down  
> Strength: stable  
> Protein adherence: good  
> Calories: good coverage  
> Fiber: consistently low
>
> **Main opportunity:** raise fiber intake.
>
> **No calorie adjustment recommended.**

### Today Goal Overview projection

This same deterministic state should power the compact Today Goal Overview card.

The card should show only the highest-value subset:

- primary goal / phase;
- status;
- 2–4 pieces of supporting evidence;
- one concise tip;
- link to full Goal details.

The Goal card should not duplicate Coach's action list.

A useful split is:

> **Goal card:** "You're on track; strength is stable; fiber is the main weakness."

> **Coach:** "Today, add 10–12 g fiber and keep calories unchanged."

## 13.5 Deterministic first

The system should derive:

- statuses,
- thresholds,
- confidence,
- data sufficiency,
- candidate actions

with deterministic code.

AI may phrase the result.

## 13.6 "No change" is a valid recommendation

The system must be capable of returning:

> **No changes recommended.**

Without this, an AI coach will constantly invent optimization work.

---

# 14. Observed Energy Expenditure / Adaptive Calorie Targeting

## 14.1 Purpose

A generic activity multiplier is often less useful than actual observed behavior.

With sufficient nutrition and bodyweight data, Health can estimate a real-world energy-expenditure range.

## 14.2 Terminology

Prefer:

**Observed maintenance estimate**

or:

**Estimated energy expenditure**

Avoid presenting it as a measured laboratory TDEE.

## 14.3 Inputs

At minimum:

- sufficient bodyweight observations;
- sufficient calorie-log coverage;
- enough elapsed time;
- data-quality checks.

## 14.4 Method constraints

The implementation should not simply take two scale weights and multiply by 3,500 kcal/lb.

Short-term scale movement contains water/glycogen/gut-content noise.

Use:

- rolling windows;
- trend/smoothing or robust regression;
- minimum observation counts;
- minimum window length;
- uncertainty bands;
- conservative confidence labels.

Potential first window:

28–42 days.

Exact method should be separately specified and unit-tested before implementation.

## 14.5 Output example

> Estimated maintenance: ~2,350–2,550 kcal/day  
> Confidence: Moderate  
> Based on 35 days of weight and nutrition evidence.

## 14.6 Adaptive target recommendation

Example:

> Current calorie target: 1,900  
> Observed loss: ~0.8 lb/week  
> Goal rate: within desired range  
> **Recommendation: keep target unchanged.**

The app should **recommend**, not automatically rewrite the target.

## 14.7 Edge cases

- rapid water-weight shift;
- refeed/high-sodium period;
- incomplete nutrition logging;
- restaurant estimates;
- illness;
- travel;
- sudden activity change;
- creatine use;
- weight entered in error;
- very short window;
- maintenance/recomp where scale trend is flat but waist/strength change.

---

# 15. Plateau Detection

## 15.1 Purpose

Prevent emotional overreaction to normal scale noise.

## 15.2 States

Suggested derived states:

- insufficient data
- normal fluctuation
- slowing trend
- possible plateau
- likely plateau
- plateau uninterpretable because adherence/coverage is poor

## 15.3 Example logic

Bad:

> Weight hasn't changed for 8 days. Lower calories.

Better:

> Scale trend has been flat for 18 days, but nutrition coverage is incomplete. There is not enough evidence to conclude that your current target has stopped working.

Or:

> Weight trend has remained flat for 24 days with high calorie-log coverage and stable activity. A small intervention may be worth testing.

## 15.4 Personal Lab integration

A plateau should be able to generate an **experiment candidate**, not an automatic prescription.

Examples:

- +1,500 steps/day for 14 days;
- adjust average calories slightly;
- increase fiber/water consistency;
- hold plan unchanged for another 10 days to improve confidence.

Experiment creation remains owner-approved.

---

# 16. Nutrition Quality Floor

## 16.1 Purpose

Macro success can coexist with poor diet quality.

The app should identify a few high-value nutritional guardrails without becoming a micronutrient spreadsheet.

## 16.2 First-version metrics

Use what the app can actually measure reliably:

- calories vs target;
- protein;
- fiber;
- sodium.

Hydration should be shown alongside Nutrition health but remain its own canonical domain.

## 16.3 Produce

Fruit/vegetable servings are useful but should not be implemented until the app has a reliable food-classification authority.

Do not infer produce servings from arbitrary food names with false precision.

## 16.4 Example

> **Nutrition quality**
>
> Calories ✓  
> Protein ✓  
> Fiber ⚠ 18 / 30 g  
> Sodium ✓

## 16.5 Weekly use

> Fiber was below target on 10 of 14 sufficiently logged days.

Do not count incomplete days as failures.

---

# 17. Strength Progression and Stall Detection

## 17.1 Purpose

PRs are useful but incomplete.

The app should detect whether an exercise is:

- progressing;
- stable;
- noisy;
- stalled;
- regressing;
- insufficient data.

## 17.2 Existing authority

Reuse existing Training / Progress analytics.

Do not create a duplicate strength history.

## 17.3 Inputs

Depending on exercise type:

- e1RM;
- working-set load/reps;
- volume;
- reps at bodyweight;
- duration/distance/pace;
- training frequency;
- bodyweight-relative performance;
- session effort where available;
- planned vs completed training.

## 17.4 Bodyweight-relative strength

This is particularly useful during weight loss.

Maintaining the same absolute lift after losing significant bodyweight can represent meaningful relative-strength improvement.

## 17.5 Suggesting the next session

This should be conservative.

If routine prescriptions include rep ranges, the app may eventually propose:

> You completed the top of the range across the prescribed sets. Consider a small load increase next time.

Do not invent progression rules when the routine does not specify them.

## 17.6 Stall interpretation

A stall detector should consider:

- recent workout frequency;
- rest plan;
- calories;
- sleep;
- soreness;
- illness/pain context;
- whether the exercise was even performed often enough.

Do not label an exercise "stalled" because it appeared twice in six weeks.

---

# 18. Compound / Preservation Goals

## 18.1 Purpose

Real goals often contain an objective plus constraints.

Example:

> Lose 15 lb while preserving at least 95% of baseline strength.

That is more meaningful than two unrelated cards.

## 18.2 Concept

Potential structure:

### Primary objective
What should change.

### Preservation constraints
What should not materially worsen.

### Supporting behaviors
Things expected to help.

Example:

**Primary**
- Weight → 175 lb

**Preserve**
- Bench e1RM ≥95% of baseline

**Support**
- Protein ≥160 g on ≥85% of sufficiently logged days
- Training ≥3 sessions/week

## 18.3 Data-model caution

Do not rewrite the existing Goals table into an entirely new system immediately.

A safer path may be:

- add goal relationships/groups;
- preserve existing goal identities and versions;
- derive compound status from linked canonical goals.

## 18.4 Edge cases

- primary goal completed while constraint fails;
- one supporting goal lacks data;
- target revised mid-phase;
- strength baseline changes;
- paused linked goal;
- multiple primary objectives conflict.

---

# 19. Coach Tips and Daily Next Best Actions

## 19.1 Purpose

Coach should be the place where Daurham Health turns evidence into useful action.

It should no longer be thought of primarily as a container for quests.

The owner should be able to open Today and quickly understand:

> **What are the best things I can do next?**

## 19.2 Coach content model

Coach can contain two layers:

### Guidance

Personalized, evidence-grounded tips and Next Best Actions.

Examples:

- Keep calories unchanged.
- Add ~10–12 g fiber today.
- Full Body B moved to tomorrow; today can stay recovery-focused.
- Water tracking is low relative to your recent tracked pattern.
- No adjustment is needed.

Guidance:
- does not require acceptance;
- does not automatically award XP;
- can disappear when no longer relevant;
- should remain limited to a few items.

### Commitments

Existing/future:

- Daily Quest;
- Weekly Focus;
- Stretch Quest;
- other explicit accepted tasks.

Commitments:
- have lifecycle state;
- may award XP;
- require explicit completion evidence.

## 19.3 Example

> **Coach**
>
> **Best moves today**
> - Keep calories unchanged.
> - Add ~10 g fiber.
> - Recovery day; walking is enough.
>
> **Why**
> Weight trend is on target and strength remains stable.
>
> **Daily Quest**
> Complete your supplement check-in.

## 19.4 Rules

- Show only a few actions.
- Prioritize active goals.
- Respect flexible training-plan changes.
- Do not nag about preferred weekdays after the owner moved a workout.
- Do not invent an optimization just to fill the card.
- "Nothing needs changing today" is useful guidance.
- Explain why when the recommendation is non-obvious.
- Do not convert every recommendation into a quest.

## 19.5 Relationship to Goal Overview

Goal Overview is the status layer.

Coach is the action layer.

They share deterministic evidence and must not contradict each other.

Example:

> **Goal:** On track. Strength stable. Fiber is the main weakness.

> **Coach:** Add 10–12 g fiber today; otherwise keep the plan unchanged.

---

# 20. XP for Logging and Daily Participation

## 20.1 Existing constraint

The current XP design intentionally states:

> Coach completion is the only XP issuance boundary.

Expanding XP to logging is therefore **not** a small UI tweak.

It is a deliberate accounting-model change.

The implementation must update:

- reward-domain rules;
- `xp_ledger` source-kind constraints;
- issuance service;
- idempotency rules;
- backup/export expectations;
- tests;
- owner-facing copy that currently says Coach completions earn XP.

## 20.2 Product objective

XP should encourage **useful consistency**, not maximize taps.

## 20.3 Recommended reward model

Prefer **daily/domain completion awards** over event-count awards.

Examples:

- first meaningful hydration log of the day;
- first bowel record or explicit no-BM completion;
- daily subjective check-in;
- completing today's nutrition logging threshold;
- completing a due measurement;
- completing a training session;
- completing a planned-health-data task.

Avoid:

- XP for every 8 oz water tap;
- XP for each edit;
- unlimited XP for logging many bowel movements;
- XP for repeatedly deleting/recreating records.


### Supplement completion XP

Supplements should become a first-class XP source.

However, XP should reward **completing the day's supplement routine/check-in**, not swallowing every scheduled item at all costs.

The existing supplement state semantics remain authoritative:

- taken;
- skipped;
- unknown;
- paused;
- not scheduled.

Recommended award rule:

> Award one daily supplement-completion XP event when every scheduled occurrence for that Health date has been explicitly resolved as **taken or skipped** and at least one occurrence was actually scheduled.

Do not award per dose.

Do not award for paused/not-scheduled items.

Do not require every scheduled item to be `taken` in order to receive the logging/completion XP.

Reason:

- a legitimate skip should not pressure the owner to take something for game currency;
- XP is reinforcing a useful daily routine and complete data;
- adherence remains a separate health metric.

I3 implementation:

- `source_kind = 'daily_participation'`
- metadata records `participationKind = 'supplements'`
- idempotency key: `award:daily:supplements:<health-date>`
- award: 25 XP under `xp-participation-v1`

The same generic source kind is used for the other bounded daily participation domains. If later there is a separate adherence achievement, it must not encourage unsafe consumption and should be specified independently.

## 20.4 Progression runway and new themes

Additional XP sources will increase Lifetime XP velocity.

Do **not** rebalance previously unlocked themes upward or make existing progress feel revoked.

Instead:

> **Append new theme packs to the end of the current progression.**

The current progression ends at Level 12 with **Silver Instinct**.

I3 appends eight packs without changing any existing threshold:

- Level 13 — **Crimson Surge** — 4,500 lifetime XP
- Level 14 — **Sun God** — 5,200 lifetime XP
- Level 15 — **Sage Storm** — 5,950 lifetime XP
- Level 16 — **Mjolnir Night** — 6,750 lifetime XP
- Level 17 — **Vault Neon** — 7,600 lifetime XP
- Level 18 — **Abyss Knight** — 8,500 lifetime XP
- Level 19 — **Republic Red** — 9,450 lifetime XP
- Level 20 — **Cosmic Instinct** — 10,450 lifetime XP

The final packs are intentionally varied rather than slight recolors of one another. Theme Studio metadata, CSS, the pre-render allowlist, and level-up discovery all use the same IDs.

### Progression review after implementation

I3 participation values are:

- hydration: 10 XP/day;
- bowel tracking: 10 XP/day;
- wellness check-in: 20 XP/day;
- fully recorded supplement day: 25 XP/day.

That is a structural maximum of 65 participation XP/day, or about 1,950 XP in a 30-day month.

Coach remains additive at the frozen H3 values:

- routine 10 XP;
- standard 25 XP;
- weekly 75 XP;
- stretch 100 XP.

A strong-compliance month therefore lands around the owner's intended $30+ reward-budget range once Coach/challenge completion is included, while routine logging alone remains below $30. At roughly 3,000–5,000 lifetime XP/month, the Level 20 runway is roughly 2–4 months from a fresh wallet.

If future XP velocity grows, prefer adding future levels/themes or tuning only new prospective award values rather than moving already-earned unlock thresholds.

---

## 20.5 Backlog XP

Backlogging remains fully allowed as Health history.

I3 uses a short grace window:

- today: full participation XP;
- yesterday: full participation XP;
- older dates: zero participation XP.

No canonical Health write is blocked because the record is too old to earn currency. Historical Daily Signals and supplement adherence are not automatically backfilled into the wallet.

The Health date is stored in award metadata; `occurred_at` remains the ledger-award instant.

## 20.6 Idempotency

XP must be impossible to accidentally duplicate.

I3 uses:

`award:daily:<participation-kind>:<health-date>`

The database unique `idempotency_key` is the final authority. Multiple glasses, bowel events, repeated saves, retries, or later edits on the same domain/date cannot mint another award.

## 20.7 Deleting/correcting a log

Because XP history is append-only, decide explicitly what happens when the source record changes.

Recommended for this single-owner app:

- ordinary edits do not affect earned XP;
- deleting a mistaken log does not automatically claw XP back;
- duplicate awards remain impossible;
- abuse prevention comes from daily caps, not punitive reversal logic.

This is much simpler and safer than mutable XP accounting.

## 20.8 Safety

Do not reward symptom severity.

Examples:

Bad:
- more XP for more bowel movements;
- XP for lower calorie intake;
- XP for extreme fasting;
- XP for reporting pain.

Reward the act of completing a useful record, not the health outcome.

---

# 21. Data Confidence and Coverage

## 21.1 Purpose

This should become a cross-cutting capability.

Health must know when its evidence is strong enough to support a conclusion.

## 21.2 Coverage examples

### Nutrition
- logged days;
- sufficiently complete days;
- estimated vs measured food prevalence where available.

### Weight
- observation count;
- span days;
- recency.

### Hydration
- event present;
- explicit complete-day state;
- partial/unknown.

### Bowel
- tracked days;
- explicit no-BM days;
- events.

### Sleep
- existing analysis eligibility.

### Training
- exercise appearances;
- intended training days;
- completed sessions.

## 21.3 Confidence is not one universal score

Avoid creating a magic "Health confidence 82%" number.

Confidence should be feature-specific.

Example:

> Plateau confidence: Low — only 8 of 21 days have sufficiently complete nutrition records.

## 21.4 AI use

Every Ask Health packet should include relevant limitations.

AI should be encouraged to say:

> I don't have enough complete hydration data to tell whether water intake tracks with your bowel changes.

That is a successful answer.

---

# 22. Recovery

## 22.1 Do not create a fake wearable-style readiness score yet

Current architecture explicitly has no readiness/recovery score.

Keep that invariant unless a future phase deliberately changes it.

## 22.2 Better near-term approach

Create a derived **recovery context** without collapsing it into one authoritative number.

Example inputs:

- sleep;
- soreness;
- energy;
- recent training volume;
- planned rest;
- calories;
- unusual stress;
- illness;
- pain.

Output:

> Recovery context: several strain signals are elevated.

or:

> No strong recovery concern is visible from the available evidence.

This is safer than "Readiness 63."

---

# 23. Persistent Clinical Context — Future Extension

The Health Profile solves demographic and stable context gaps, but Ask Health may eventually need more structured personal medical context.

High-value candidates:

- active medications;
- medication dose/schedule;
- allergies;
- relevant diagnoses;
- persistent injuries;
- dietary restrictions;
- clinician-advised constraints.

This should be a deliberate future domain, not a giant freeform prompt.

Until then, a bounded owner-authored profile note may cover the highest-value context.

AI must distinguish:

- owner-reported condition;
- app measurement;
- clinician diagnosis if explicitly recorded;
- model hypothesis.

---

# 24. Cross-Feature Correlation Ideas

These are opportunities unlocked by the new data.

They should not all be built immediately.

## 24.1 Fiber ↔ bowel

Compare:

- fiber average;
- Bristol distribution;
- no-BM days.

Require enough tracked days.

## 24.2 Water ↔ bowel

Same principle.

Do not claim causation.

## 24.3 Sleep ↔ hunger

Useful during weight loss.

## 24.4 Sleep ↔ training performance

May explain short-term dips.

## 24.5 Planned rest ↔ performance

Useful for evaluating whether recovery structure helps.

## 24.6 Energy/hunger ↔ calorie deficit

Can detect when a technically effective cut is becoming hard to sustain.

## 24.7 Sodium ↔ short-term scale changes

Potentially useful explanatory context.

Avoid using it to "correct" weight automatically.

## 24.8 Context tags ↔ abnormal days

Travel, alcohol, illness, poor sleep opportunity, unusual stress, pain, and physical labor can explain outliers.

---

# 25. Backfill / Historical Editing Principles

The owner explicitly wants to recover missed logs.

## 25.1 Every new daily tracker should support backlog

- hydration;
- bowel;
- subjective check-in;
- planned-intent overrides when legitimately correcting the plan.

## 25.2 Avoid fake timestamps

If the owner only remembers:

> I drank about 64 oz yesterday

allow a date-level total or a record with unknown exact time rather than inventing 8 separate events.

If the event model requires time, support a "time unknown" representation.

## 25.3 Provenance

Store enough provenance to distinguish:

- logged contemporaneously;
- backfilled later;
- imported;
- derived.

This is especially useful when evaluating subjective data.

---

# 26. Proposed Data Model Direction

Exact schemas should be designed during implementation, but the roadmap should preserve these concepts.

## 26.1 Health Profile

Possible authority:

`health_profile`

Fields may include:

- id
- date_of_birth
- height_value / canonical height
- optional sex field
- persistent_context_note
- created_at
- updated_at
- source_id

If profile history becomes important, use versions/effective dates.

## 26.2 Training plan

Possible tables:

`training_plans`  
`training_plan_versions`  
`training_plan_days`  
`training_plan_overrides`

Use immutable versions where practical.

## 26.3 Hydration

Possible table:

`hydration_events`

Optional:

`hydration_day_states`

for explicit completeness.

## 26.4 Bowel

Possible tables:

`bowel_events`  
`bowel_day_states`

Day state supports explicit no-BM / tracking complete.

## 26.5 Daily subjective check-in

Possible table:

`daily_wellness`

One row per Health date.

Fields:

- energy
- hunger
- soreness
- subjective_sleep_quality
- optional note
- provenance timestamps

Do not overload `daily_context` with numeric scales.

Daily Context should remain exceptional/contextual facts.

## 26.6 Derived analytics

Do **not** create durable tables for:

- observed TDEE;
- plateau state;
- nutrition quality status;
- recovery context;
- goal-control recommendation;
- progression/stall classification;
- Next Best Actions.

Derive them from canonical evidence unless performance later proves that a cache is required.

---

# 27. API Design Direction

Follow existing `/api/...` conventions and owner authentication.

Potential resource families:

- `/api/profile`
- `/api/training/plan`
- `/api/hydration/...`
- `/api/bowel/...`
- `/api/check-in/...`

Exact naming should match repository conventions discovered during implementation.

Requirements:

- Zod validation.
- Owner auth.
- Phoenix date validation.
- Explicit method handling.
- Idempotent submission where repeated taps/network retries are plausible.
- No provider/API keys in client.
- Canonical-change notification should refresh Today / Coach / relevant analytics.

---

# 28. Ask Health Integration Requirements

Adding a tracker is incomplete until Ask Health can consume it safely.

For every new domain:

1. Add canonical loader.
2. Add packet representation.
3. Add data coverage.
4. Add limitations.
5. Add prompt guidance.
6. Add evidence IDs.
7. Add tests ensuring AI cannot cite fabricated evidence.
8. Add "as-of" behavior so historical questions do not see future logs.

Particular attention:

- DOB age must be derived as-of.
- Planned training intent must respect the requested date.
- Backfilled logs can be visible historically based on event date, but provenance may show they were entered later.
- Future schedule entries must not contaminate historical behavior analysis.

---

# 29. UI Anti-Bury Rules

The mobile walkthrough makes these rules concrete.

## 29.1 Required placement by feature

| Feature | Primary interaction surface | Secondary / analysis surface | Must not be the only access |
| --- | --- | --- | --- |
| Water | Today → Daily Check-in | Timeline / Progress analysis | Progress |
| Bowel | Today → Daily Check-in | Timeline / Progress analysis | Progress |
| Energy / Hunger / Soreness | Today → Daily Check-in | Progress / Ask Health | Settings |
| Daily Context | Today → Daily Check-in | Timeline / Ask Health | hidden standalone route |
| Weekly training intent | Training visible plan card | Today Training card / Ask Health | Settings |
| Health Profile | First Settings card | Ask Health missing-context link / Menu | bottom of Settings |
| Goals | Existing Goals page | Menu + contextual Progress/Today links | Progress only |
| Personal Lab | Existing Lab page | Menu + contextual links | low Today scroll only |
| Supplements | Existing management page | Today + Menu | Settings only |
| Ask Health | Existing Ask Health page | Today + Progress + Menu | one contextual card |
| Goal overview / tip | Today, after Nutrition | Goals / Progress | Settings-only access |
| Coach tips / Next Best Actions | Existing Coach card | Ask Health / weekly review | separate hidden page |

## 29.2 Today card-budget rule

A new daily capability should not automatically create a new full-size card.

For I1/I2:

- Daily Context is consolidated into Daily Check-in.
- Water, Bowel, Energy, Hunger, and Soreness share Daily Check-in.
- Training intent modifies the existing Training card.
- Health Profile does not appear as a permanent Today card.
- Goal Control powers a compact Today Goal Overview card.
- Coach owns tips and Next Best Actions; it should not require another Today card.

A phase that proposes adding more than one new persistent Today card should justify why consolidation is insufficient.

## 29.3 No feature is complete if only a route exists

Implementation acceptance must verify:

- discoverable entry point;
- useful summary state;
- relevant Today/domain integration;
- mobile behavior.

## 29.4 Mobile first

High-frequency actions require:

- large touch targets;
- no horizontal overflow;
- minimal typing;
- useful defaults;
- one-handed use;
- no modal/sheet nesting that makes quick logging tedious.

## 29.5 Progressive disclosure

The default Today board should communicate state quickly.

Detailed entry/history belongs in sheets or detail pages.

Completed daily sections should become quieter rather than continuing to compete for attention.

---

# 30. Known Integration Risks

## 30.1 Today becomes overcrowded

Mitigation:

- progressive disclosure;
- compact daily check-in;
- show only incomplete / relevant actions;
- allow quiet completed state.

## 30.2 Progress becomes a junk drawer

Mitigation:

- Progress owns analysis, not data-entry discovery;
- new signals can initially appear in Timeline/Compare without a new tab.

## 30.3 AI becomes overconfident because more data exists

Mitigation:

- always attach coverage and limitations;
- missing remains missing;
- deterministic thresholds before synthesis.

## 30.4 Rest-day semantics conflict

Mitigation:

- separate planned intent from Daily Context `rest_day`;
- separate Training from Activity.

## 30.5 XP becomes farmable

Mitigation:

- daily/domain award caps;
- idempotent keys;
- no per-glass unlimited rewards;
- reward logging participation, not symptom quantity.

## 30.6 Backfill corrupts "what was known then"

Mitigation:

Distinguish:
- effective/event date;
- created_at / entered_at.

Historical health evidence should use event date where appropriate, while audit/provenance can still show late entry.

## 30.7 Weight / TDEE analytics overreact to water noise

Mitigation:
- long enough windows;
- robust trend;
- confidence bands;
- sodium/context awareness;
- no automatic calorie mutation.

## 30.8 New durable tables omitted from backup

Every new canonical table requires explicit review of:

- full backup;
- restore;
- portable export;
- demo fixtures if applicable;
- tests.

## 30.9 Demo divergence

If a feature is visible in the public demo, demo data must remain synthetic and must not call owner APIs.

Do not block core owner functionality on building a full demo equivalent in the same slice unless intentionally scoped.

---

# 31. Suggested Implementation Phases

The exact V2 naming can be chosen after H5 closeout.

The sequence below is intentionally ordered so the app learns how to **use** new evidence before the amount of evidence becomes much larger.

## Phase I0 — Single-Owner Instance Portability + Configuration Contract

This phase exists so future single-owner deployments can run the same codebase without source edits.

### Product boundary

Do **not** convert Daurham Health into a multi-tenant SaaS architecture merely to support a second owner.

The preferred deployment model remains:

> one Health instance → one owner → one database → one auth owner → one deployment configuration.

Different owners may run separate instances of the same code.

### Deliver

#### Central instance configuration
Create one server authority for deployment-level configuration.

Required categories:

**Core**
- database;
- auth provider;
- owner identity;
- canonical Health calendar timezone.

**Optional providers**
- Gemini;
- USDA FoodData Central;
- Open Food Facts overrides;
- Home-AI;
- Apple Health / Health Auto Export ingest;
- Body Shortcut ingest.

**Non-secret instance presentation**
- app display name;
- optional external/home link;
- optional public demo availability.

Do not scatter `process.env` reads throughout unrelated feature code when a shared configuration authority can own them.

#### Safe client-visible instance capabilities
Expose only a safe, non-secret instance-config/capability view to the client.

Examples:
- app name;
- Health calendar timezone;
- demo enabled;
- workout photo import available;
- Gemini-backed nutrition available;
- USDA lookup available;
- Apple Health sync configured;
- Body Shortcut configured.

Never expose:
- API keys;
- database credentials;
- auth cookie secret;
- bearer tokens;
- provider secrets.

#### Capability-driven UX
Optional features must not appear as broken actions merely because a provider is absent.

### Training entry routing cleanup

The primary Training add/start action must route to **manual workout entry / Start workout**, not directly to photo import.

Current owner behavior has shifted toward entering exercises and sets during the workout, and that should be the default path.

Photo import should remain a secondary action only when the capability is enabled.

Acceptance:
- primary `Start workout` / add-training action → `/training/new`;
- `Import workout photo` remains a distinct secondary action;
- disabling training-photo capability removes/hides that secondary action without affecting ordinary workout logging;
- Today/Training shortcuts must not route to photo import unless the owner explicitly chooses that action.

Examples:

- no Home-AI / training-photo capability → hide or clearly disable `Import workout photo`;
- no Body Capture token → do not advertise Shortcut setup as active;
- no Apple Health sync token → Settings may explain setup, but must not imply sync is already configured;
- no USDA key → lookup gracefully reports unavailable/not configured;
- no Gemini key → AI-backed capture/synthesis degrades cleanly.

A provider being configured and a feature being enabled are related but not identical concepts.

Allow an explicit feature flag when one provider powers several features but an instance wants only some of them.

Example:

`HEALTH_FEATURE_TRAINING_PHOTO_IMPORT=false`

while another Home-AI-backed capability may remain enabled.

#### `.env.example`
Add and maintain a complete `.env.example`.

It must:
- list every supported variable;
- contain placeholders only;
- classify required vs optional;
- identify secret vs non-secret;
- identify which feature consumes it;
- document defaults;
- include `BODY_CAPTURE_TOKEN`;
- include `GEMINI_NUTRITION_RECIPE_MODEL`;
- stay synchronized with runtime config validation.

#### Configuration doctor
Add a command such as:

`npm run config:check`

or:

`npm run doctor`

It should validate, without printing secrets:
- required environment values;
- database connectivity;
- migration/schema compatibility;
- auth configuration;
- canonical timezone validity;
- owner identity configuration;
- enabled-feature/provider consistency;
- optional integration readiness.

This should make a new instance setup fail early with useful diagnostics rather than fail later through individual UI actions.

#### Dynamic canonical timezone
The current repository documents `HEALTH_CALENDAR_TIMEZONE`, but several domain modules still hard-code `America/Phoenix`.

Known examples include:
- `src/domain/time.ts`;
- Activity configuration;
- Sleep configuration.

Replace this with one canonical instance timezone authority.

All date-sensitive consumers must receive/use that same value.

Do not create separate client/server timezone values that can silently drift.

Historical time-zone semantics need an explicit implementation contract before making owner timezone casually editable.

For the portability phase, the important requirement is:

> a new instance can choose its canonical timezone without changing source code.

#### Dynamic origin / deployment URL
Browser API calls should remain relative wherever possible.

This is already largely true and is a strong portability property.

For workflows that need an absolute external URL:
- derive from the active deployment origin when possible;
- otherwise use a single configured public base URL.

Do not hard-code `health.daurham.com`.

Setup instructions and generated links for:
- Body Shortcut;
- Health Auto Export;
- password/reset flows;
- future webhook/ingest integrations

must work on another deployment domain.

#### Branding / owner-independent presentation
Remove hard-coded instance branding from application chrome where it prevents reuse.

Known examples:
- `Daurham Health` header text;
- `https://daurham.com` demo backlink;
- default Open Food Facts user agent branding.

These should come from instance configuration or use neutral defaults.

Do not move normal product copy into env variables.

#### Owner data vs product seed data
Schema migrations must not silently install Jake-specific owner state into every new instance.

Current legacy training migrations include seeded routines such as:
- Full Body A;
- Full Body B — including `Dad Strength` naming;
- Full Body C.

The generic exercise catalog may remain product seed data where appropriate.

Owner-specific:
- routines;
- goals;
- supplements;
- nutrition history;
- preferences;
- profile;
- Personal Lab state

should start empty or be explicitly adopted/imported.

Because old migrations are historical, do not rewrite them casually.

Create a migration/bootstrap compatibility strategy so:
- Jake's existing instance preserves its routine/history behavior;
- a fresh future instance does not appear to belong to Jake;
- historical workout references remain valid.

#### Instance bootstrap / first-run contract
A fresh instance should have a documented path:

1. create database;
2. apply migrations;
3. configure auth;
4. designate owner;
5. configure required env;
6. run config doctor;
7. deploy;
8. sign in;
9. complete Health Profile;
10. configure optional integrations as desired.

No source edit should be required for a normal instance.

### Why first

Every later intelligence feature adds more:
- migrations;
- integration settings;
- provider capabilities;
- owner data;
- setup assumptions.

Portability is cheaper to establish before that expansion.

### Acceptance criteria

A second-owner test deployment must be possible with:

- the same repository contents;
- a different environment configuration;
- a separate Neon database/auth setup;
- no search-and-replace of domains;
- no Jake-specific routines appearing as owner-created state;
- no broken optional-feature buttons;
- a different app name and timezone if desired.

The implementation should include a documented smoke-test deployment using placeholder/example values, never real credentials.

---

## Phase I1 — Health Profile + Flexible Training Intent Foundation

### Deliver
- Health Profile as the first Settings card, with direct Menu access.
- Flexible weekly training/rest/active-recovery intent with a visible Training-page plan summary.
- Sequence-first programming, preferred weekdays, and current-week move/override controls.
- Date overrides without missed-workout penalties.
- Today Training card integration.
- Ask Health reads profile and planned intent.
- Coverage / missing-context messaging.

### Why first
These are foundational context authorities used by later intelligence.

---

## Phase I2 — Daily Signals

### Deliver
- one consolidated Today Daily Check-in card after Training and before Supplements;
- migration of the existing Today Context interaction into that consolidated surface;
- hydration logging;
- bowel logging + explicit no-BM day state;
- daily energy/hunger/soreness;
- optional stress rating;
- subjective sleep quality only if separately accepted;
- backlog workflows;
- missing-vs-zero semantics.

### Intelligence boundary
I2 owns canonical Daily Signals and their Today/backlog capture surfaces. It does not build one-off Timeline or Ask Health evidence plumbing. Daily Signals join Timeline, Ask Health, relationship analysis, coverage/provenance, and confidence semantics in I5 through the shared Health Intelligence evidence frame.

### UX requirement
The mobile walkthrough has been incorporated into this roadmap. Implementation must preserve the post-video placement decisions and then perform focused owner visual QA.

---

## Phase I3 — XP Participation Expansion + Theme Runway

### Prepared implementation
- wallet presentation rule advances to `xp-rule-v2`, while Coach awards remain frozen on `xp-rule-v1`;
- `daily_participation` becomes an allowed append-only ledger source under `xp-participation-v1`;
- hydration 10 XP/day;
- bowel tracking 10 XP/day;
- wellness check-in 20 XP/day;
- fully recorded supplement day 25 XP/day, with taken and skipped both resolving the occurrence;
- one award/domain/Health date through immutable idempotency keys;
- 65 XP/day participation maximum;
- today/yesterday backlog grace window; older data saves without XP;
- no historical participation backfill and no correction clawback;
- Rewards copy explains the economy and 100 XP = $1 owner convention;
- eight new progression packs extend Levels 13–20 without moving existing thresholds;
- ledger/database, backup, progression, theme, and source-contract regression coverage.

### Important
I2 Daily Signals correctness remains independent of XP. Migration `0045_xp_participation_themes.sql` must be applied before I3 server code is exposed because the prior ledger constraint intentionally rejects the new source kind.

---

## Phase I4 — Evidence Semantics, Effort, and Change Ledger

This phase is the bridge between "more data" and "better intelligence."

### Prepared implementation note — 2026-10-06

The first I4 batch implements the bridge without overreaching:

- Training: optional RIR/RPE, explicit failure evidence, independent-side semantics, and conditional limitation context;
- Nutrition: entry provenance classes and day-level evidence quality;
- Body: session comparability plus an owner-authored usual-measurement protocol;
- Change Ledger: explicit histories plus conservative steps/Training-frequency/logged-water candidates;
- Data Quality: deterministic review flags with durable confirm/exclude decisions;
- no AI calls, no causal claims, no automatic repair, and no retroactive source-data rewrite.

The larger examples in this roadmap (for example meal-timing shifts or richer volume-change detection) remain eligible future detector extensions after I5 provides the shared evidence frame. I4 does not duplicate those future cross-domain semantics ad hoc.

### Deliver

#### Training effort and side-specific performance
- optional working-set RIR or RPE;
- explicit set-to-failure / failed-rep evidence distinct from ordinary hard effort;
- side-specific failure evidence when an exercise can fail independently by limb;
- exercise-level side-tracking semantics separate from the existing `unilateral` flag;
- left/right reps for independent-limb dumbbell movements where one side can continue after the other fails;
- session-level perceived difficulty if useful;
- conditional pain/limitation capture when a workout was affected;
- no requirement to rate every warm-up set.

#### Evidence quality
- nutrition provenance / estimate-quality classification;
- day-level nutrition quality summary such as `high_confidence`, `mixed`, or `estimate_heavy`;
- body-measurement comparability / usual weigh-in protocol;
- event-time versus entered-time semantics.

#### Intervention / Change Ledger
Create a derived, unified timeline of meaningful changes such as:
- calorie target changes;
- macro/fiber target changes;
- goal phase changes;
- routine/program changes;
- weekly training-frequency changes;
- supplement starts/stops/pauses;
- major activity-target changes;
- experiment windows;
- explicit temporary illness / travel / away / deload periods.

Prefer deriving these events from existing version histories and canonical changes instead of asking the owner to manually log them again.

Also support **automatic candidate change detection** for meaningful behavioral shifts that were not explicitly declared.

Examples:
- average steps increase by ~2,000/day and stay elevated;
- training volume changes materially after a routine transition;
- meal timing shifts later for several weeks;
- hydration logging becomes consistently higher/lower;
- training frequency changes in practice.

Automatic detection must create a **candidate change**, not silently rewrite canonical intent.

The owner may confirm, dismiss, or ignore the candidate.

### Why before the larger intelligence engine

Without effort, quality, timing, and change-point context, later correlations can be mathematically correct but practically misleading.

### Data integrity watchdog

I4 should also establish a deterministic data-quality watchdog.

It should detect suspicious observations before they contaminate higher-level intelligence.

Examples:
- implausible bodyweight or measurement values;
- accidental nutrition serving multipliers;
- duplicate imports;
- unexpected source changes;
- impossible or inconsistent timestamps;
- future-dated records where not allowed;
- missing left/right values on an independent-side exercise;
- sudden unit changes;
- nutrition days that appear substantially incomplete despite later analytics assuming completeness.

The watchdog should classify issues such as:
- `needs_confirmation`;
- `excluded_from_analysis`;
- `source_discontinuity`;
- `possible_duplicate`;
- `plausible_but_unusual`.

It must not silently "correct" canonical owner data.

When owner confirmation is needed, provide a small repair flow and preserve the original provenance.

---


## Phase I5 — Shared Health Intelligence Engine + Ask Health Context

### Prepared implementation note — 2026-10-06

The first I5 batch establishes `health-intelligence-v1` as a derived-only shared evidence layer:

- sparse Health-date signal frame and registry;
- owner Data Quality exclusions applied before analysis;
- coverage, provenance, descriptive confidence, and recent personal baselines;
- curated same-day/lagged relationships and Change Ledger before/after context;
- question-specific evidence routing and evidence-date/detail-path drill-down;
- Ask Health v2 evidence packets with What Health knows / Missing context;
- day-level Daily Signals Timeline events.

No I5 migration is required. Ask Health is the first full intelligence consumer. I6 owns the next consequential step: shared goal-control / Today / Coach decision authority.

### Deliver
- shared Health Intelligence Snapshot;
- date-aligned daily evidence frame;
- metric / signal registry;
- personal-baseline calculations;
- coverage, provenance, and confidence states;
- expanded curated cross-domain relationship catalog;
- lagged relationship support;
- change-point / intervention comparison support;
- question-specific evidence routing;
- evidence drill-down / `Why?` support for consequential conclusions;
- "What Health knows" and "Missing context that matters";
- historical as-of tests;
- deterministic intelligence regression fixtures;
- safe AI synthesis over structured evidence.

### Architectural requirement

Today Goal Overview, Coach, What Changed, Patterns, Weekly Coach, Ask Health, and Personal Lab suggestions should increasingly consume this same evidence layer rather than each building an independent interpretation.

---

## Phase I6 — Goal Control / Weekly Decision Engine

### Prepared implementation note — 2026-10-06

The first I6 batch establishes `goal-control-v1` without adding a new persisted authority:

- deterministic `act` / `maintain` / `insufficient_evidence` state;
- Weekly Coach focus reused as the single primary opportunity;
- explicit no-change recommendation;
- active-Goal weekly status and I5 confidence/limitations;
- four-day logged/reliable Nutrition evidence floor;
- flexible Training Plan/rest-aware adherence;
- mature goal-relevant personal relationships only;
- compact Today Goal overview loaded independently from the main Today payload;
- Weekly Coach consumes the same decision and suppresses its older Focus authority;
- goal-driven Coach daily Training quests respect plan intent and expire without XP if a same-day plan change makes them inapplicable;
- new gamified weekly goal missions require genuine Goal attention.

I6 does not estimate maintenance or prescribe calorie changes; those remain I7 responsibilities.

### Deliver
- cross-domain deterministic goal-control state;
- compact Today Goal Overview / tip card;
- weekly status;
- primary opportunity;
- explicit "no change recommended";
- nutrition quality floor;
- rest-aware adherence;
- evidence confidence / limitations;
- relevant personal relationships where sufficiently mature.

Reuse Weekly Coach where possible, but do not create conflicting authority.

---

## Phase I7 — Observed Maintenance + Plateau Engine

### Prepared implementation note — 2026-10-06

The first I7 batch establishes `maintenance-engine-v1` and feeds it into the I6 authority rather than creating a parallel coach:

- 28/21/14-day completed-window observed-maintenance estimation using reliable calorie evidence and a Theil–Sen weight trend;
- confidence derived from calorie quality/coverage plus body-measurement comparability/span;
- implausible estimates withheld;
- explicit stability, goal-direction, away-from-goal, noise-obscured, possible-plateau, and likely-plateau states;
- sodium, carbohydrate, logged-water, bowel, and Daily Context timing used only as observational scale-noise context;
- `nutrition.carbs_g` added to the shared I5 frame;
- hold/evidence-improvement/Goal review/small intake-or-activity review candidates with no automatic target mutation;
- compact Today and Weekly Decision integration through I6 Goal Control;
- owner-only `GET /api/intelligence/maintenance`;
- deterministic owner-reviewed Weight-response calibration suggested through the existing Personal Lab flow when uncertainty is meaningful;
- `0047_maintenance_calibration_experiment_origin.sql` permits that reviewed Experiment provenance trigger without adding a new canonical table.

I7 does not diagnose metabolic adaptation or fluid/gastrointestinal causes and does not directly mutate calorie targets.

### Deliver
- robust energy-expenditure estimate;
- nutrition-quality-aware confidence;
- body-measurement-quality-aware confidence;
- sodium/carbohydrate/bowel/hydration/context awareness when explaining short-term scale noise;
- plateau states;
- candidate interventions;
- Personal Lab experiment suggestions where appropriate.

No automatic calorie-target mutation.

---

## Phase I8 — Training Progression / Preservation Goals

### Deliver
- progression/stall states;
- RIR/RPE-aware performance interpretation;
- session-effort and recovery context;
- bodyweight-relative strength interpretation;
- compound/preservation goal relationships;
- goal-control integration;
- distinction between performance decline and simply harder effort / poor recovery evidence;
- movement / muscle / equipment classification sufficient for safe exercise-substitution suggestions;
- derived muscle/movement training exposure using hard sets, proximity to failure, and recent volume where the exercise model supports it.

Exercise substitution must preserve the distinction between:
- same exercise;
- comparable substitute;
- merely similar muscle group.

Do not merge substitute exercises into one historical strength series.

---

## Phase I9 — Coach Intelligence / Next Best Actions + Deep Health Review

### Deliver
- insightful Coach tips grounded in the shared intelligence state;
- a few prioritized Next Best Actions inside the existing Coach card;
- rest-aware logic;
- no-change state;
- links directly to action surfaces;
- recommendation memory and deduplication;
- owner response states such as `do_this`, `not_now`, `not_relevant`, or `turn_into_experiment`;
- outcome follow-up for meaningful accepted recommendations;
- uncertainty-driven, context-sensitive follow-up questions;
- a strict prompt/question budget so adaptive logging does not become nagging;
- weekly deeper AI synthesis using the structured evidence packet;
- explicit competing explanations when evidence is ambiguous;
- "what would improve this conclusion?" guidance;
- optional `Turn this into an experiment` handoff to Personal Lab.

This is the main synthesis layer, not a standalone chatbot feature.

---

## Phase I10 — Passive Recovery + Clinical Context Expansion

Implement only when the source data and use cases are trustworthy.

### Candidates
- validated resting heart rate;
- validated HRV;
- respiratory rate;
- heart-rate recovery / cardio-fitness observations where available and interpretable;
- structured medications;
- allergies;
- known conditions / persistent clinical context;
- clinical lab results with date, unit, reference range, source, and fasting state where relevant;
- optional standardized progress-photo checkpoints.

### Constraint
Do not create a universal readiness or health score.

These signals become additional evidence in the same intelligence engine.

---

# 32. Acceptance Test Matrix

Every implementation phase should include automated and owner visual QA.

## 32.1 Dates / timezone

Test:

- midnight boundaries;
- backfill;
- historical as-of;
- future-date rejection where appropriate;
- weekly plan day resolution;
- moved-session resolution;
- A/B/C next-session sequence after calendar moves;
- weekly adherence without exact-day penalty.

## 32.2 Missing vs zero

Test every new domain with:

- no data;
- explicit zero;
- partial data;
- complete data.

## 32.3 Idempotency

Test:

- double tap;
- request retry;
- refresh;
- repeated backlog save.

## 32.4 Editing

Test:

- create;
- edit;
- delete/archive where relevant;
- cross-feature refresh after mutation.

## 32.5 Ask Health

Test:

- full context;
- sparse context;
- conflicting signals;
- historical question;
- future plan not leaking into past;
- unsupported causal claim rejection / safe prompt behavior.

## 32.6 XP

Test:

- one award/day/domain;
- duplicate source;
- edit after award;
- delete after award;
- backlog;
- concurrent submissions;
- wallet balance derivation;
- supplement completion awards exactly once/day;
- skipped supplement occurrences can resolve the day without requiring ingestion;
- no award for paused/not-scheduled-only days;
- new theme unlock levels and existing-theme backward compatibility.

## 32.7 Mobile

Test:

- Today;
- Daily Check-in;
- quick hydration;
- Bristol selector;
- weekly training plan;
- Health Profile;
- Ask Health context disclosure.

No clipping / horizontal overflow.

## 32.8 Backup

For every durable new table:

- full backup includes it;
- verify recognizes it;
- restore round trip;
- portable export inclusion decision is explicit.

---

# 33. Metrics / Analytics Quality Requirements

Derived analytics should document:

- input window;
- minimum data count;
- exclusion rules;
- whether current day is allowed;
- handling of partial days;
- handling of outliers;
- confidence state;
- output unit;
- version identifier;
- provenance requirements;
- event-time alignment;
- allowed lag windows;
- source-continuity requirements;
- known confounders;
- whether the result is descriptive, associative, or intervention-based.

Example:

`observed-maintenance-v1`

This keeps future refinements auditable.

## 33.1 Confidence is multidimensional

Do not generate a fake universal confidence percentage.

A useful finding should consider at least:

- **coverage** — how much of the required period is observed;
- **sample size** — how many usable observations/pairs exist;
- **source quality** — measured/known versus estimated;
- **comparability** — same protocol/source/context where required;
- **effect size** — whether the relationship is meaningful;
- **stability** — whether it appears in more than one reasonable window;
- **recency** — whether it still describes the current owner state;
- **confounding** — illness, travel, plan changes, source changes, etc.

User-facing states can remain simple:

- insufficient evidence;
- emerging;
- moderate evidence;
- stronger personal evidence.

These labels are about the owner's data, not population-level medical certainty.

---

# 34. Recommendations the App Should Avoid

Do not build these merely because the data now exists:

- universal readiness score;
- universal health score;
- automatic medical diagnosis;
- automatic calorie-target changes;
- automatic supplement changes;
- punitive rest-day messaging;
- streak shame;
- XP for eating fewer calories;
- XP proportional to symptoms;
- fake causal correlations;
- noisy notifications for every metric;
- giant daily questionnaires.

---

# 35. Additional High-Value Future Ideas

These are not required in the first implementation sequence, but the architecture should not prevent them.

## 35.1 Medication / allergy context

Potentially very important for Ask Health.

Should become structured if implemented.

## 35.2 Routine sequence mode

For A/B/C programs that advance by completed session rather than weekday.

## 35.3 Deload / training phase

Owner can intentionally mark a lower-load week so performance dips are interpreted correctly.

## 35.4 Illness recovery mode

Daily Context already captures sickness. A temporary mode could reduce training expectations without rewriting the base plan.

## 35.5 Personal baselines for subjective signals

Examples:

- usual hunger during maintenance;
- usual energy;
- usual bowel frequency.

Prefer personal history over generic population scoring when appropriate.

## 35.6 Explicit data-completeness review

A weekly small prompt:

> Nutrition coverage is good. Water tracking is partial. Bowel data was recorded on 5/7 days.

This teaches the owner which conclusions are trustworthy.

## 35.7 Goal phase / intent

Examples:

- cut;
- maintenance;
- muscle gain;
- performance;
- recovery.

This could help Health AI interpret identical measurements differently.

Do not add it until it has concrete behavior in the Goal Control System.

---

# 36. Mobile Walkthrough Review — Completed 2026-10-06

The owner supplied a ~100-second mobile walkthrough of the current production-style app. This roadmap has been revised from that review.

## 36.1 Findings resolved by the walkthrough

### Today

Observed:

- Nutrition is correctly first.
- Coach is already a high-level action surface.
- Training follows.
- Supplements, Activity, Sleep, and Context create a substantial scroll.
- What Changed and Patterns are useful but live lower in the page.

Decision:

> Add **one** Daily Check-in card after Training and before Supplements, and absorb Context into it.

Do not add independent Water/Bowel/Wellness cards.

### Nutrition

Observed:

- Add food is visually dominant.
- Pantry and Recipes are directly accessible.
- Fiber and sodium already fit the current Nutrition presentation.

Decision:

> Keep Nutrition focused on nutrition. Hydration remains a separate canonical daily signal even though it is summarized nearby on Today.

### Training

Observed:

- Start workout is the clear primary action.
- Exercises, Manage routines, and Import workout photo already occupy the secondary-action area.
- Recent workouts immediately follow.

Decision:

> Weekly intent appears as a visible **Training plan** summary card before Recent Workouts, with a dedicated editor behind it.

Do not bury it as only another secondary button.

### Body

Observed:

- Measurement schedule is understandable and prominent.
- The schedule/card pattern works well on mobile.

Decision:

> Reuse this interaction pattern conceptually for Training plan.

### Progress

Observed:

- Progress already has seven subsections.
- Overview already contains Insights, body/strength/training summaries, Activity/Sleep, Ask Health, Lab, and Goals.
- Timeline and Compare are mature.

Decision:

> No new Daily Signals tab in the first implementation. Integrate signals into Overview/Timeline/Compare/Insights.

### Mobile Menu

Observed:

- The header has an XP badge and Menu.
- Menu currently contains only Settings and Sign out.

Decision:

> Expand Menu into the canonical secondary-navigation hub. This is preferable to adding more primary tabs.

### Settings

Observed:

- Theme Studio is currently the first large Settings card.
- Trend preferences are substantial.
- Supplements, Goals, Data & Backup, and Data Sources occur farther down the page.

Decision:

> Health Profile becomes the first substantive Settings card and receives a direct Menu link.

### Goals

Observed:

- Goals already has a dedicated, functional management page.
- The page is not the problem; discoverability is.

Decision:

> Keep the Goals page. Improve direct access via Menu and continue contextual summaries in Progress/Today.

## 36.2 UI decisions that are now considered part of the roadmap contract

1. Preserve the five primary bottom tabs.
2. Expand Menu rather than creating a sixth primary tab.
3. Add a compact Goal Overview / tip card after Nutrition.
4. Keep Coach directly actionable with tips and Next Best Actions.
5. Create one Daily Check-in card.
6. Merge current Daily Context access into that card.
7. Put Daily Check-in after Training and before Supplements.
8. Keep water quick-log directly reachable from the Daily Check-in card.
9. Put a visible, flexible Training plan summary on Training before Recent Workouts.
10. Make programmed days movable without missed-day penalties; preserve session sequence.
11. Put Health Profile first in Settings.
12. Do not add an eighth Progress tab for new daily signals.
13. Use Timeline/Overview/Insights for daily-signal history and interpretation.
14. Keep Coach as the Next Best Actions/tips surface while preserving separate XP-bearing commitments.
15. Keep existing domain pages where they already work; fix discoverability instead of duplicating them.

## 36.3 What still requires visual QA during implementation

The walkthrough resolves *where* the features should live, but each phase must still visually test:

- whether the Daily Check-in card is compact enough after real data exists;
- whether the card should show three or five summary values before expansion;
- whether +Water can be a direct increment without accidental taps;
- whether Bristol selection works best in a sheet or compact page;
- whether Training plan week chips fit on narrow phones;
- whether the expanded Menu requires grouping/separators;
- whether Health Profile summary should show DOB directly or age + height;
- whether Today becomes too long after I2 despite Context consolidation;
- whether Next Best Actions fits inside Coach without confusing XP-bearing commitments.

If visual QA shows crowding, **consolidate before hiding**.

---

# 37. Intelligence Utilization Architecture

This section addresses the central risk of the roadmap:

> **Daurham Health can collect a great deal of useful information and still fail to become intelligent if each metric is merely displayed or sent to AI in isolation.**

The product should be designed around **evidence reuse and synthesis**, not around trackers.

---

## 37.1 Current architecture: strong foundation, narrow relationship layer

The current application already has important pieces of the right design.

Existing code includes:

- deterministic Progress analytics;
- a cross-domain intelligence analyzer;
- a curated relationship catalog;
- Proactive Insights;
- Weekly Coach;
- Ask Health evidence packets;
- evidence references and limitations;
- explicit protection against causal language.

The current cross-domain engine already evaluates relationships such as:

- sleep ↔ steps;
- sleep ↔ active energy;
- sleep ↔ training effort;
- sleep ↔ training pain;
- nutrition ↔ training days;
- calories/protein ↔ activity;
- preceding nutrition ↔ bodyweight;
- activity ↔ training days.

This is a useful beginning.

The main limitation is that the relationship catalog is still narrow and the app's different intelligence consumers assemble somewhat different slices of the data.

The next architecture should make the cross-domain system the **shared analytical substrate** of the product.

---

## 37.2 The intelligence stack

Use seven layers.

### Layer 1 — Canonical facts

Examples:

- food entries;
- water events;
- bowel events;
- workouts and sets;
- RIR/RPE;
- body measurements;
- sleep observations;
- activity observations;
- supplement occurrences;
- Daily Context;
- profile;
- goals;
- training intent;
- clinical labs when implemented.

These remain the durable authorities.

### Layer 2 — Normalized evidence frame

Build a derived date-aligned representation.

Conceptually:

| Date | Calories | Protein | Fiber | Sodium | Water | BM | Sleep | Steps | Training | RIR/RPE | Energy | Hunger | Soreness | Stress | RHR | HRV | Context |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |

The actual implementation does not need to be a giant database table.

It can be a typed derived structure assembled from canonical services.

Every value needs metadata:

- observed / derived;
- provenance;
- complete / partial;
- event date/time;
- source;
- quality/comparability;
- provisional status.

### Layer 3 — Personal baselines and single-domain state

Examples:

- usual sleep range;
- usual resting HR;
- usual HRV where trustworthy;
- usual hunger;
- usual energy;
- usual bowel frequency;
- training performance trend;
- weight trend;
- normal sodium range;
- usual step count;
- typical water on fully tracked days.

Personal baselines often matter more than generic population averages for detecting a change.

### Layer 4 — Curated cross-domain analysis

The app evaluates plausible relationships from a **versioned relationship catalog**.

Do not run an unrestricted "correlate every field with every field" process.

That would create false discoveries.

Each relationship definition should specify:

- X metric/domain;
- Y metric/domain;
- same-day or lagged timing;
- minimum sample;
- completeness requirements;
- known exclusions;
- relevant contexts;
- statistical method;
- whether a goal is required for surfacing.

### Layer 5 — Change-point / intervention analysis

Relationships answer:

> "What tends to occur together?"

Intervention analysis answers:

> "What changed after the owner changed something?"

Examples:

- after calorie target reduction;
- after step target increase;
- after starting creatine;
- after changing training frequency;
- after a deload;
- after changing fiber intake;
- during an experiment.

This should use the unified Change Ledger.

### Layer 6 — Goal-aware decision state

The same evidence means different things under different goals.

Examples:

A flat scale trend can be:
- a problem during a fat-loss goal;
- acceptable during maintenance;
- desirable during recomp if waist falls and strength rises.

The Goal Control System should therefore consume:

- single-domain states;
- cross-domain findings;
- interventions;
- data quality;
- active goals;
- preservation constraints.

It emits candidate interpretations and actions.

### Layer 7 — AI synthesis

AI receives the structured results of Layers 1–6.

Its job is to:

- connect the most relevant evidence;
- compare plausible explanations;
- communicate uncertainty;
- prioritize;
- phrase useful next actions;
- suggest a question or experiment.

AI is **not** responsible for calculating basic facts that deterministic code can calculate reliably.

---

## 37.3 Shared Health Intelligence Snapshot

Create one typed snapshot builder.

Conceptual shape:

```ts
type HealthIntelligenceSnapshot = {
  asOf: HealthDate
  profile: ...
  goals: ...
  plan: ...
  domainStates: ...
  dailyEvidence: ...
  baselines: ...
  relationships: ...
  interventions: ...
  dataQuality: ...
  limitations: ...
  recommendationCandidates: ...
}
```

This snapshot is derived.

It should support different window requests:

- today / acute;
- 7 days;
- 14 days;
- 28 days;
- 42 days;
- 90 days;
- goal-period / experiment-period.

Do not make every consumer recalculate its own idea of "recent health."

---

## 37.4 Metric / signal registry

As the number of signals grows, create a registry that describes what each metric means.

Possible fields:

- metric key;
- domain;
- unit;
- canonical source;
- daily aggregation rule;
- missing-value semantics;
- provisional-day behavior;
- directionality if goal-independent;
- useful windows;
- possible lags;
- minimum observations;
- source-quality requirements;
- whether personal baseline is useful;
- allowed relationship families.

This prevents intelligence logic from becoming a collection of hard-coded one-off assumptions.

---

## 37.5 Temporal alignment is essential

Health relationships rarely share the same ideal date mapping.

Examples:

- sleep during the prior night may affect hunger **the next waking day**;
- training may affect soreness **the following day**;
- sodium/carbohydrate intake may affect **next-morning scale weight**;
- fiber/water changes may affect bowel behavior over **0–2 days**;
- calorie intake affects bodyweight over **weeks**, not hours;
- a supplement intervention may require **days or weeks**.

The relationship catalog must explicitly support:

- same-day;
- previous-night → next-day;
- one-day lag;
- multi-day rolling exposure;
- preceding-window exposure;
- intervention windows.

Do not join everything simply because the records share a calendar date.

---

## 37.6 Relationship maturity

A single surfaced correlation should not immediately become a strong Coach recommendation.

Track a derived maturity state.

Possible states:

### Candidate
Enough data to calculate, but weak/sparse/unstable.

### Emerging
Relationship is meaningful enough to surface cautiously.

### Repeated
The relationship persists across multiple valid windows or repeated comparable contexts.

### Intervention-supported
The same relationship is supported by a deliberate change/experiment or clear before/after evidence.

### Actionable
Evidence is sufficient, relevant to an active goal, safe, and there is a sensible action.

These states remain derived, not medical facts.

---

## 37.7 Avoid the multiple-comparison trap

As signals increase, the number of possible pairings grows rapidly.

Do not scan every pair and show whatever looks interesting.

Use:

1. a curated relationship catalog;
2. domain-specific minimum samples;
3. effect-size thresholds;
4. coverage requirements;
5. stability across windows where possible;
6. explicit lag semantics;
7. context exclusions;
8. conservative surfacing rules.

AI may propose a **candidate relationship to analyze**, but deterministic code should calculate and gate it before the product states it as a personal pattern.

---

## 37.8 Question-specific evidence routing

Ask Health should not receive the exact same giant packet for every question.

The app should identify relevant evidence families.

### Example: "Why am I constipated?"

Retrieve:

- bowel history;
- Bristol types;
- explicit no-BM days;
- fiber;
- water;
- recent calorie/intake reduction;
- activity;
- relevant supplement changes;
- illness/travel/context;
- relevant medication context if implemented;
- evidence coverage.

Do not waste the packet on unrelated strength PR details.

### Example: "Am I actually plateaued?"

Retrieve:

- weight trend;
- weigh-in comparability;
- nutrition coverage and provenance;
- observed maintenance state;
- sodium/carbohydrate changes;
- hydration;
- bowel/gut-content context;
- activity changes;
- training changes;
- intervention ledger;
- illness/travel;
- goal.

### Example: "Why did my bench feel terrible?"

Retrieve:

- recent bench sets;
- RIR/RPE;
- bodyweight;
- prior-night sleep;
- recent training load;
- soreness/pain;
- calories/protein/carbohydrates;
- hydration;
- energy/stress;
- resting HR/HRV if trustworthy;
- training-plan context.

This routing can initially be deterministic by lens/domain.

It does not require an embedding database or another paid service.

---

## 37.9 AI evidence packet

The AI packet should include facts in structured form.

Example concept:

```json
{
  "claimCandidate": "bench performance lower than recent baseline",
  "evidence": [
    {
      "id": "training.bench.performance_28d",
      "state": "regressing",
      "coverage": {...},
      "quality": "high"
    },
    {
      "id": "sleep.last_3_nights",
      "state": "below_personal_baseline",
      "quality": "high"
    },
    {
      "id": "wellness.soreness",
      "state": "elevated",
      "quality": "owner_reported"
    }
  ],
  "competingExplanations": [...],
  "limitations": [...]
}
```

AI output should itself be structured.

Recommended answer schema:

- summary;
- strongest supported interpretation;
- competing explanations;
- evidence refs;
- confidence / evidence maturity;
- limitations;
- next action;
- optional experiment;
- missing context that would improve the conclusion.

Every meaningful AI claim should point back to evidence IDs.

---

## 37.10 AI should compare hypotheses, not just tell a story

A major failure mode of LLM health analysis is producing a coherent narrative from whatever evidence is supplied.

Instead, prompt the model to explicitly compare alternatives.

Example:

> Bench performance fell.

Potential explanations:

1. normal session noise;
2. poor recent sleep;
3. increased accumulated training load;
4. calorie/carbohydrate reduction;
5. pain/technique limitation;
6. broader strength regression.

The model should rank only explanations that have supporting evidence and should state when the evidence cannot distinguish them.

This produces better reasoning than asking:

> "Explain why bench went down."

---

## 37.11 Deep Health Review

In addition to normal deterministic surfaces, add an optional **Deep Health Review**.

Frequency:

- weekly by default through Weekly Coach;
- potentially monthly for a larger window;
- on-demand after a meaningful change.

The review can use AI more liberally because it is not a high-frequency request.

Input:

- shared Health Intelligence Snapshot;
- active goals;
- current plan;
- recent interventions;
- top domain changes;
- mature cross-domain findings;
- data-quality limitations;
- important raw examples only where needed.

Output:

### What changed
The most important changes since the previous review.

### What appears connected
Cross-domain findings worth caring about.

### What is probably noise
Signals that should not drive action yet.

### Goal assessment
Whether the current plan appears to be working.

### Best next actions
A small number of recommendations.

### What Health is uncertain about
Missing or conflicting evidence.

### Potential experiment
Only when there is a realistic question worth testing.

This review can feed Weekly Coach rather than creating another primary page.

---

## 37.12 Recommendation feedback loop

A recommendation becomes more useful when the app can later know whether it was acted on.

Do not require feedback on every tip.

For meaningful recommendations, optionally allow:

- `Do this`
- `Not now`
- `Turn into experiment`

If the owner accepts a durable change:

- it becomes owner intent;
- it enters the Change Ledger;
- later analytics can assess the period after the change.

This creates a closed loop:

> evidence → recommendation → owner decision → intervention → new evidence → evaluation.

That loop is more valuable than endlessly generating advice.

---

## 37.13 Personal Lab becomes the uncertainty-resolution system

Personal Lab should receive candidates from the intelligence engine when:

- a relationship appears repeatedly;
- the action is safe to test;
- the owner cares about the outcome;
- observational data cannot separate explanations.

Example:

> Higher fiber and higher water both coincide with better bowel regularity, but they usually changed together.

Personal Lab suggestion:

> Hold normal water steady and test a defined fiber target for 14 days.

AI can phrase the experiment proposal.

Protocol requirements, evidence rules, and result classification remain deterministic.

---

## 37.14 "Missing context" becomes actionable

Ask Health already plans to show missing context.

Expand the concept across intelligence.

Examples:

> I can see your weight trend, but 9 of the last 14 nutrition days contain substantial estimates, so I would not adjust calories from this evidence yet.

> I can see the bench decline, but effort/RIR was not recorded, so I cannot tell whether the same load simply felt harder.

> Bowel tracking is only present on 3 of 14 days, so I cannot compare fiber and regularity reliably.

This tells the owner **which data is worth collecting**, rather than rewarding logging indiscriminately.

---

## 37.15 Cost / token strategy

Do not send the entire raw database to the model.

That is:

- expensive;
- noisy;
- harder to reason over;
- more likely to produce contradictory narratives.

Instead use escalating context.

### Normal Today / Coach
Deterministic state + small AI synthesis if needed.

### Ask Health
Question-specific packet.

### Weekly Review
Larger multi-domain snapshot.

### Deep investigation
Only when explicitly needed, include selected raw observations/windows.

Existing Gemini caching / cost-safety architecture should be reused.

No vector database or new paid service is required for the first implementation.

---

## 37.16 AI failure handling

If AI is unavailable:

- canonical logging still works;
- Progress still works;
- Goal Control deterministic state still works;
- relationship findings still work;
- Coach can show deterministic recommendations;
- Weekly Review can show a deterministic fallback.

The app should become **better** with AI, not dependent on AI to understand its own numbers.

---

# 38. New High-Value Data Inputs and Exactly How They Are Used

The following additions are justified because they improve interpretation, not because they add more charts.

## 38.1 Training RIR / RPE and Set Termination

### Why it matters

Load × reps alone cannot distinguish:

- a comfortable set;
- a hard set;
- a true 0-RIR set;
- an attempted rep that failed from muscular exhaustion.

These are analytically different.

Example:

> 50 lb dumbbells × 8 with ~3 RIR

versus:

> 50 lb dumbbells × 8, 0 RIR

versus:

> 50 lb dumbbells × 8, failed the attempted 9th rep.

The raw successful-rep count is identical, but the performance evidence is not.

### Capture

For working sets, support optional:

- RIR, preferably `0–5+`;
- explicit `reached_failure` / failed-rep state;
- optional failure side for independently tracked exercises;
- optional termination reason when useful:
  - normal;
  - muscular failure;
  - pain;
  - technique/form stop;
  - interrupted / other.

Do not require this for every warm-up set.

### Important semantic distinction

`RIR 0` and `failed rep` are not identical.

**0 RIR**
- final successful rep was completed;
- owner believes no additional clean rep remained.

**Failed rep / muscular failure**
- another rep was attempted and could not be completed.

Both are high-effort evidence, but preserving the distinction gives the intelligence engine better information.

### Used by
- progression/stall detection;
- fatigue interpretation;
- strength-preservation goals;
- Coach;
- Ask Health;
- sleep/recovery relationships;
- deload / program-evaluation logic;
- interpreting whether the same weight/reps became easier or harder.

### Example intelligence

> Incline dumbbell press remained 50 × 8, but recent sets moved from ~2–3 RIR to 0 RIR / failure. Performance is therefore not truly stable even though reps and load are unchanged.

Or:

> The same load/reps now average 2 more reps in reserve than six weeks ago, which supports improved strength despite no load increase.

---

## 38.1A Independent-Side Exercise Tracking

### Problem exposed by the current app

The current canonical set model already has:

- `left_reps`;
- `right_reps`;
- `left_duration_sec`;
- `right_duration_sec`.

However, several built-in dumbbell exercises that can fail independently are currently defined as ordinary `reps` exercises.

For example, **Incline Dumbbell Press** is currently modeled as one combined rep count even though a real set can be:

> Left: 8 successful reps, failed the 9th  
> Right: 9 successful reps, 1 RIR

Collapsing that into `8 reps` or `9 reps` loses important performance evidence.

### Do not overload the existing `unilateral` flag

There are at least three different movement semantics:

#### Shared / coupled
Both sides contribute to one inseparable performance result.

Examples:
- barbell bench press;
- goblet squat;
- dumbbell Romanian deadlift;
- farmer carry as currently tracked.

A dumbbell RDL uses two dumbbells, but the movement is still one coupled rep outcome.

#### Independent sides
Both limbs may perform the movement together or in the same set, but each side can succeed/fail independently.

Examples:
- incline dumbbell press;
- dumbbell overhead press;
- dumbbell curl;
- hammer curl;
- dumbbell lateral raise;
- future bilateral dumbbell rows/presses where each arm has its own implement.

These should support separate left/right performance.

#### Explicit per-side / unilateral
The exercise itself is intentionally executed one side at a time or prescribed per side.

Examples:
- one-arm dumbbell row;
- reverse lunge;
- suitcase carry.

These already map naturally to the existing per-side measurement model.

### Recommended exercise-definition concept

Add a semantic field such as:

`side_tracking_mode`

Possible values:

- `shared`
- `independent`
- `per_side`

Exact names may change during implementation.

Do not infer this solely from `load_type = 'dumbbell'`.

Equipment does not determine movement semantics.

### Current built-ins that should be reviewed

Strong candidates for `independent`:

- Dumbbell Curl;
- Incline Dumbbell Press;
- Hammer Curl;
- Dumbbell Overhead Press;
- Dumbbell Lateral Raise.

Already `per_side`:

- Reverse Lunge;
- Suitcase Carry;
- One-Arm Dumbbell Row.

Likely remain `shared`:

- Dumbbell Romanian Deadlift;
- Farmer Carry;
- Goblet Squat to Bench.

The Exercise Library should expose this behavior for owner-created exercises rather than relying on name heuristics.

### Set capture

For an independent-side rep exercise:

- weight remains the load of **one dumbbell**, consistent with current equipment semantics;
- store `left_reps`;
- store `right_reps`;
- optionally store side-specific RIR / failure state when needed.

The normal UI should remain fast.

Possible row:

> 50 lb · L 8 · R 9 · `L failed`

If sides are equal, the UI can make equal entry easy rather than requiring duplicate typing.

Possible shortcut:

> Enter 10 reps → applies 10/10  
> `Split sides` → edit L/R only when different.

This preserves low friction on normal sets while still capturing asymmetry when it matters.

### Side-specific effort

A useful long-term representation is:

- `left_rir`;
- `right_rir`;
- `left_reached_failure`;
- `right_reached_failure`.

The UI does not have to show all four controls on every set.

It can default to a shared effort value and reveal side-specific effort only when:

- reps differ;
- the owner taps `Sides differed`;
- one side failed.

### Analytics

For independent-side strength exercises:

**Strength/progression**
- use the limiting/weaker side when a single conservative performance value is needed;
- preserve both sides for detailed analysis;
- never silently average away a meaningful side difference.

**Volume**
- use work actually performed by both sides;
- do not invent missing-side reps.

**Asymmetry**
derive:
- left/right rep delta;
- left/right RIR delta;
- repeated failure side;
- persistence over comparable sessions.

Do not diagnose muscular imbalance from a few asymmetric sets.

### Example intelligence

> Your left side has been the limiting side on incline dumbbell press in 3 of the last 4 comparable sessions. The difference is small but repeated.

Or:

> Today's left-arm failure appears isolated; prior sessions were symmetric, so Health is not treating it as a persistent pattern.

This becomes especially useful when combined with:

- sleep;
- soreness;
- pain;
- prior training load;
- bodyweight;
- calorie/carbohydrate intake;
- recovery signals.

### Historical compatibility

Do **not** rewrite older combined-rep sets as fake left/right observations.

Existing historical `reps = 10` should remain:

> 10 paired/combined reps; side detail unknown.

After an exercise begins side tracking, new sets use left/right values.

Analytics must support a boundary where:

- old history has useful load/reps;
- new history has richer side detail.

Do not discard old history simply because the schema becomes more expressive.

### Routine/template compatibility

If a built-in exercise changes from combined reps to independent-side tracking:

- existing routines should continue to reference the same canonical exercise identity where possible;
- prescription semantics must migrate safely;
- routine history must remain historically interpretable;
- new workouts should use the richer side UI;
- old workout sessions must render correctly.

This needs migration and regression tests, not just a UI change.

---

## 38.2 Training pain / limitation

### Capture
Only when present.

Potential structure:
- body area;
- mild / moderate / significant;
- exercise affected;
- optional note.

### Used by
- interpreting poor performance;
- exercise substitution suggestions;
- recovery context;
- Personal Lab exclusion criteria;
- Ask Health safety context.

Do not turn pain into a universal daily questionnaire.

---

## 38.3 Nutrition evidence quality

### Derived from
- barcode / label;
- USDA;
- owner-created food;
- recipe provenance;
- AI description;
- image estimate;
- restaurant/unknown food;
- serving measurement method where known.

### Used by
- observed-maintenance confidence;
- plateau confidence;
- goal-control confidence;
- Ask Health limitations;
- recommendation gating.

Do not report fake precision such as "nutrition is 87% accurate."

---

## 38.4 Body measurement protocol quality

### Capture
Store the owner's normal weigh-in protocol once.

Examples:
- morning;
- after bathroom;
- before food/drink.

Allow a measurement to be flagged as unusual when needed.

### Used by
- weight-trend quality;
- plateau analysis;
- maintenance estimate;
- short-term anomaly explanations.

---

## 38.5 Intervention / Change Ledger

### Derived from
- target versions;
- goal versions;
- training-plan versions;
- supplement events;
- experiments;
- accepted Coach changes;
- temporary modes/context.

### Used by
- before/after comparisons;
- What Changed;
- Weekly Review;
- Personal Lab;
- Ask Health;
- Goal Control.

This is one of the most important additions because it lets the app learn **what happened after the owner intentionally changed something**.

---

## 38.6 Passive recovery observations

Candidates:
- resting HR;
- HRV;
- respiratory rate;
- heart-rate recovery;
- cardio-fitness observations;
- other trustworthy Apple Health observations.

### Used by
- recovery context;
- unusual-state detection;
- performance interpretation;
- illness/stress context;
- Coach.

Do not combine these into a universal readiness score.

---

## 38.7 Event-time semantics

Nutrition, supplements, workouts, symptoms, bowel events, and other events should distinguish:

- when the event happened;
- when it was entered.

### Used by
- meal timing;
- pre/post-workout nutrition;
- caffeine timing;
- lagged analysis;
- backlog integrity;
- historical as-of questions.

---

## 38.8 Optional daily stress

### Capture
Optional 1–5 in Daily Check-in.

### Used by
- sleep interpretation;
- hunger;
- recovery;
- training performance;
- context-aware Coach guidance.

It should remain optional because the owner already has `unusual_stress` for exceptional days.

---

## 38.9 Structured medications / conditions / allergies

### Used by
- Ask Health safety/context;
- bowel interpretation;
- sleep/recovery interpretation;
- supplement interactions/context;
- literature lookup;
- lab interpretation.

These remain owner-reported unless backed by imported clinical evidence.

---

## 38.10 Clinical laboratory results

Potential data:
- test/analyte;
- result;
- unit;
- reference range;
- date;
- fasting status where relevant;
- source.

### Used by
- longitudinal clinical trends;
- Ask Health;
- Personal Lab;
- supplement experiments;
- goal context where medically appropriate.

Do not let AI silently normalize units or reference ranges without deterministic validation.

---

## 38.11 Progress photos

Use initially as:

- standardized historical evidence;
- checkpoint comparisons.

Do **not** generate a confident body-fat percentage from photos.

AI visual comparison can be considered later only with explicit uncertainty and owner intent.

---

# 39. Cross-Domain Relationship Catalog — Next Expansion

The relationship engine should grow deliberately.

Candidate families:

| Relationship | Timing | Potential use |
| --- | --- | --- |
| Fiber + water ↔ bowel regularity / Bristol type | 0–2 day lag | GI guidance |
| Sleep ↔ next-day hunger | previous night → next day | diet adherence context |
| Sleep ↔ next-session RIR/RPE / performance | previous night / recent nights | training interpretation |
| Training load ↔ next-day soreness | 1-day lag | recovery |
| Set RIR/failure ↔ later performance / recovery | session + rolling | fatigue/progression interpretation |
| Left/right performance asymmetry ↔ repeated limiting side | comparable sessions | asymmetry monitoring without diagnosis |
| Calories / carbs ↔ training performance | same day + preceding windows | performance/fueling |
| Meal / carbohydrate timing ↔ training performance | pre-workout windows | fueling context |
| Protein distribution ↔ recovery / strength preservation | daily + multi-week | nutrition quality beyond daily total |
| Protein ↔ strength preservation | multi-week | goal control |
| Sodium / carbs ↔ next-morning weight deviation | 1-day lag | scale-noise explanation |
| Hydration / bowel ↔ short-term weight deviation | same/next day | scale-noise explanation |
| Steps / activity ↔ observed maintenance | multi-week | energy expenditure |
| Stress ↔ sleep / hunger / performance | same/next day | recovery context |
| RHR / HRV ↔ subjective energy / training performance | personal-baseline deviation | recovery context |
| Supplement intervention ↔ relevant outcome | intervention window | Personal Lab |
| Calorie-target change ↔ weight trend / hunger / performance | before/after windows | plan evaluation |
| Training-frequency change ↔ performance / soreness | before/after windows | program evaluation |

Each family requires a separate implementation contract defining:

- required evidence;
- date alignment;
- minimum sample;
- confounders;
- surfacing language;
- whether it can ever drive a recommendation.

---

# 40. One Intelligence Layer, Many Product Surfaces

The app should stop thinking of each feature as having its own independent intelligence.

## Today Goal Overview

Consumes:
- Goal Control state;
- top evidence;
- confidence;
- primary opportunity.

Answers:

> How am I doing?

## Coach

Consumes:
- Goal Control;
- action candidates;
- today's plan;
- recent changes;
- mature personal relationships.

Answers:

> What should I do next?

## What Changed

Consumes:
- Change Ledger;
- important metric shifts;
- new/mature relationship changes.

Answers:

> What is different?

## Patterns / Proactive Insights

Consumes:
- cross-domain relationship catalog.

Answers:

> What tends to occur together in my data?

## Weekly Coach / Deep Review

Consumes:
- larger shared snapshot;
- interventions;
- relationships;
- goals;
- limitations.

Answers:

> What mattered this week, and should anything change?

## Ask Health

Consumes:
- question-routed subset of the same evidence;
- deeper raw windows only when needed.

Answers:

> Answer my specific question using what Health knows.

## Personal Lab

Consumes:
- unresolved but meaningful hypotheses;
- repeatable relationship candidates;
- intervention candidates.

Answers:

> What uncertainty is worth testing deliberately?

## Progress

Shows:
- the underlying evidence;
- detailed relationship support;
- history;
- confidence / coverage.

Answers:

> Show me the data behind the conclusion.

This shared architecture is how the app avoids Goal, Coach, Insights, and Ask Health all telling different stories.

---

# 41. Intelligence Acceptance Requirements

Before calling the intelligence expansion complete, test the following.

## 41.1 Same evidence, same conclusion

If Goal Overview, Coach, Weekly Coach, and Ask Health evaluate the same as-of date and goal, their underlying deterministic state must agree.

The wording may differ.

The facts must not.

## 41.2 Historical as-of integrity

A question asked as of an old date must not use:

- future profile changes;
- future plan changes;
- future supplement changes;
- future measurements;
- future interventions.

## 41.3 Lag correctness

Test known synthetic examples for:

- prior-night sleep → next-day signal;
- intake → next-morning weight;
- training → next-day soreness;
- preceding-window intake → longer-term body trend.

## 41.4 Quality gating

Low-quality nutrition or incomparable weigh-ins must reduce confidence rather than silently participating as equal evidence.

## 41.5 Multiple-comparison safety

Adding new metrics must not automatically create a combinatorial scan of all possible pairs.

Only registered relationships are evaluated/surfaced.

## 41.6 AI grounding

Every substantive AI conclusion must have:

- evidence refs;
- explicit limitations when relevant;
- no unsupported causal language;
- no invented measurement;
- no silent mutation of canonical data.

## 41.7 AI unavailable

The product must retain useful deterministic behavior.

## 41.8 Training effort / side-tracking integrity

Test:

- ordinary combined-rep exercise;
- explicit per-side exercise;
- independent-side exercise with equal reps;
- independent-side exercise with unequal reps;
- left-side failure only;
- right-side failure only;
- both sides at 0 RIR without a failed attempt;
- failed attempted rep distinct from 0 RIR;
- historical combined-rep sets after an exercise gains independent-side tracking;
- progression analytics using the limiting side without erasing the other side;
- no fake left/right backfill from legacy combined reps.

## 41.9 Recommendation-loop integrity

Test:

- same recommendation does not regenerate daily without a meaningful state change;
- dismissed recommendation respects suppression rules;
- accepted recommendation creates owner intent only through the explicit action;
- accepted changes appear in the Change Ledger;
- later outcome review links to the original recommendation and evidence;
- AI recommendation cannot directly mutate goals/targets.

## 41.10 Adaptive-question budget

Test:

- no anomaly → no question;
- meaningful ambiguity → one targeted question;
- dismissed prompt does not nag;
- current-day incompleteness does not trigger premature questions;
- owner answer changes analytical confidence only where appropriate.

## 41.11 Data-integrity watchdog

Test:

- bodyweight typo;
- duplicate import;
- unit discontinuity;
- nutrition serving anomaly;
- timestamp anomaly;
- source switch;
- independent-side missing value;
- confirmed unusual-but-valid observation.

The system must preserve original data and expose why an observation was excluded or flagged.

## 41.12 Contradictory evidence


Synthetic tests should include:

- weight down but waist up;
- strength down but RIR much higher;
- calories apparently low but nutrition quality estimate-heavy;
- poor sleep but normal performance;
- high water logs with sparse tracking on surrounding days.

The correct response is sometimes:

> Evidence is mixed.

---

# 42. Recommendation Memory and Outcome Learning

A recommendation should not disappear from the system the moment it is rendered.

The product needs to know:

- what was recommended;
- what evidence supported it;
- when it was recommended;
- whether the owner accepted it;
- whether it was dismissed or irrelevant;
- whether it became an explicit plan change or experiment;
- what happened afterward.

## 42.1 Recommendation is not canonical health fact

An AI or deterministic recommendation is an advisory artifact.

It must not silently become owner intent.

Owner actions are separate.

Examples:

> Coach recommends raising fiber.

This does **not** change the fiber target.

If the owner chooses:

> `Do this`

then the resulting target/change becomes canonical owner intent and enters the Change Ledger.

## 42.2 Recommended lifecycle

Possible states:

- proposed;
- viewed;
- accepted;
- dismissed;
- not_relevant;
- deferred;
- converted_to_experiment;
- superseded;
- evaluated.

Exact naming may change.

## 42.3 Deduplication

Coach should not rediscover the same recommendation every morning.

A recommendation fingerprint can include:

- recommendation kind;
- goal;
- evidence family;
- target domain;
- active intervention state;
- rule/version.

The product should suppress or refresh stale advice rather than creating endless duplicates.

## 42.4 Outcome review

For meaningful accepted recommendations, Health may later ask:

> You increased your fiber target three weeks ago. Want to review what changed?

or evaluate it automatically when deterministic outcome criteria exist.

The evaluation should consider:

- intended outcome;
- adherence/implementation;
- relevant confounders;
- data quality;
- enough elapsed time.

## 42.5 Recommendation calibration

Optional low-friction feedback can include:

- Helpful
- Already knew
- Not practical
- Wrong context

Use this to improve **ranking and presentation**, not to let an LLM autonomously rewrite health rules.

---

# 43. Adaptive / Uncertainty-Driven Data Collection

The app should not permanently ask for every potentially useful field.

Instead:

> **Ask for additional context only when it could materially change an interpretation.**

## 43.1 Examples

### Training anomaly

Observed:

> Incline dumbbell press performance dropped sharply.

Possible follow-up:

> Did the set stop because of muscular exhaustion, pain, or something else?

### Weight anomaly

Observed:

> Weight is far outside the recent measurement band.

Possible follow-up:

> Was this measured under your usual morning conditions?

### Bowel / hydration uncertainty

Observed:

> Bowel pattern changed, but water tracking is sparse.

Possible follow-up:

> Was yesterday's water log reasonably complete?

### Nutrition anomaly

Observed:

> Logged calories are unusually low and include one very large serving change.

Possible follow-up:

> Confirm the serving amount for this entry?

## 43.2 Prompt budget

Adaptive questioning must be constrained.

Suggested rules:
- zero questions is normal;
- at most one high-value prompt in a normal day;
- do not repeatedly ask a dismissed question;
- suppress questions during obvious incomplete current-day periods;
- do not ask merely because a field is empty;
- ask only when the answer would change a decision, confidence, or analytical inclusion.

## 43.3 Owner response semantics

Responses should attach to the evidence or anomaly that triggered them.

Do not create broad permanent profile facts from a one-time answer unless the owner explicitly promotes them.

---

# 44. Evidence Drill-Down / Explainability

As the app becomes more intelligent, every consequential conclusion should support:

> **Why?**

Examples:

### Goal Overview

> On track

Tap `Why?`:

- Weight trend: −0.8 lb/week
- Waist: down
- Strength: stable
- Nutrition coverage: 93%
- Window: 28 days

### Coach

> Keep calories unchanged.

Tap `Why?`:

- Goal rate is inside desired range.
- Strength is stable.
- Hunger is manageable.
- No plateau state is present.
- Nutrition evidence quality is sufficient.

### Personal pattern

> Shorter sleep tends to coincide with higher next-day hunger.

Tap `Why?`:

- 26 paired days;
- personal relationship;
- moderate effect;
- repeated in two valid windows;
- observational, not proof of causation.

The drill-down should expose:

- evidence IDs;
- dates/window;
- coverage;
- quality;
- limitations;
- relationship maturity;
- relevant competing explanations.

This is crucial for trust and debugging.

---

# 45. Intelligence Regression / Evaluation Suite

The health-intelligence system needs regression tests just as much as API or database code.

Create synthetic health histories with deliberately known scenarios.

Examples:

### Normal fat loss
- adequate nutrition coverage;
- weight declining at goal rate;
- strength stable.

Expected:
- goal on track;
- no calorie reduction recommended.

### Water-weight spike
- stable calories;
- high sodium/carbohydrate day;
- short-term weight increase.

Expected:
- no plateau/fat-gain claim;
- scale-noise explanation allowed.

### True plateau candidate
- high nutrition coverage;
- comparable weigh-ins;
- flat robust weight trend across sufficient time.

Expected:
- plateau state becomes possible/likely according to rules.

### Sparse nutrition
- apparent low calorie average;
- many missing/estimate-heavy days.

Expected:
- maintenance/plateau confidence reduced;
- no aggressive calorie recommendation.

### Training exhaustion
- same load/reps;
- RIR falls;
- failed reps appear.

Expected:
- do not call performance fully stable merely from load/reps.

### Side asymmetry
- repeated left-side limitation across comparable sessions.

Expected:
- cautious repeated-asymmetry finding;
- no diagnosis.

### Travel week
- owner moves planned sessions.

Expected:
- no false missed-workout messaging.

### Sleep-deprived performance dip
- multiple poor nights;
- training effort worsens;
- one temporary performance drop.

Expected:
- recovery context may surface;
- no premature strength-regression classification.

### Conflicting evidence
- weight down;
- waist up;
- strength down;
- incomplete nutrition.

Expected:
- mixed evidence / uncertainty, not a forced single narrative.

## 45.1 AI evaluation

For AI-produced synthesis, maintain fixture packets and validate:

- evidence citations are valid;
- no unsupported causal language;
- limitations are preserved;
- no invented facts;
- no contradictory action against deterministic state;
- output schema remains valid.

Do not rely only on snapshotting exact prose.

Evaluate claims and structure.

---

# 46. Exercise Substitution Intelligence

Travel, equipment constraints, pain, or simple preference may make a planned exercise impractical.

The Training domain should eventually know enough structure to suggest a substitute without pretending exercises are identical.

Potential exercise metadata:

- movement family;
- primary muscle groups;
- secondary muscle groups;
- equipment;
- body position;
- unilateral / independent / shared side mode;
- loaded / bodyweight;
- skill requirement;
- pain/limitation exclusions where owner-defined.

Example:

> Incline dumbbell press unavailable while traveling.

Potential response:

> A machine incline press or push-up variation can preserve the pressing/chest intent. This will count as a substitution, not as the same exercise for strength-history purposes.

Substitutions should preserve:
- routine intent;
- session completion logic.

They should not merge:
- e1RM histories;
- PRs;
- exercise-specific progression.

---

# 47. Muscle / Movement Exposure Context

Once exercise classification, working-set effort, and failure evidence are available, derive higher-level training exposure.

Possible derived measures:
- hard working sets by movement family;
- hard sets by primary muscle group;
- fraction near failure;
- recent failure exposure;
- rolling session volume;
- repeated soreness/pain context.

Use this to make statements such as:

> Pressing exposure has been high for the last 10 days and recent pressing sets are closer to failure, while lower-body performance remains normal.

Do not turn this into a universal recovery score.

Avoid fake precision around exact "effective reps" or exact recoverable-volume limits unless there is a specifically justified model.

---

# 48. Counterfactual / "What If?" Planning — Later Experimental Feature

A future owner-facing tool may answer questions such as:

- What if I raise calories by 150?
- What if I average 2,000 more steps?
- What if I train twice instead of three times next week?
- What if I move my training days while traveling?

The app must not present these as predictions of physiological certainty.

Preferred output:

> Based on your observed history, Health has enough evidence to estimate a plausible range / likely trade-off.

or:

> Health does not have enough comparable history to make this useful yet.

Counterfactuals should reuse:
- observed maintenance;
- Change Ledger;
- goal state;
- intervention history;
- training intent;
- personal relationships.

No recommendation should become canonical until the owner accepts it.

This is **not** required for the first intelligence implementation sequence.

---

# 49. Single-Owner Deployment Portability

This section records the portability audit performed before freezing the intelligence roadmap.

## 49.1 What is already portable

Several important implementation choices are already correct.

### Database
Production database access is already environment-driven through:

`DATABASE_URL`

No database hostname is hard-coded into normal application reads/writes.

### Authentication
Neon Auth already uses environment values for:
- `NEON_AUTH_BASE_URL`;
- `NEON_AUTH_COOKIE_SECRET`;
- `HEALTH_OWNER_USER_ID`;
- fallback `HEALTH_OWNER_EMAIL`.

The browser auth client derives its app-side auth proxy from:

`window.location.origin + /api/auth`

Password-reset redirects also derive from the active browser origin.

This is excellent for separate deployments.

### Browser API calls
Owner UI calls generally use relative `/api/...` routes.

A fork/new deployment therefore does not normally need API endpoint search-and-replace.

### Vercel routing
`vercel.json` is deployment-domain neutral.

### AI / nutrition providers
Gemini and USDA credentials are environment-driven.

Home-AI already takes:
- base URL;
- API key

from env.

Open Food Facts already supports configurable base URL/user agent.

### Machine ingest secrets
Apple Health and Body Shortcut use independent bearer-token environment variables.

These are appropriate deployment secrets.

---

## 49.2 Known portability gaps found in the audit

### Hard-coded Health calendar timezone

The project documentation lists:

`HEALTH_CALENDAR_TIMEZONE`

but current runtime code still contains Phoenix constants in multiple domain modules.

This means the documented env value is not yet the true authority.

This must be fixed before claiming arbitrary-instance portability.

### Hard-coded application identity

The current shell includes:
- `Daurham Health`;
- a `daurham.com` demo backlink.

These are instance-specific.

### Hard-coded Body Shortcut instructions

Current Shortcut documentation contains:
- `https://health.daurham.com/api/ingest/body`;
- `https://health.daurham.com`;
- `America/Phoenix`.

The runtime endpoint itself is generic; the documentation/setup experience is not.

### Training photo import assumes the feature exists

Training currently renders `Import workout photo` even though Home-AI is an optional environment-backed provider.

A new instance that intentionally omits this provider should not expose a dead/broken workflow.

### Branded provider default

The Open Food Facts fallback User-Agent currently uses `DaurhamHealth`.

This is harmless operationally but should become instance-neutral/configurable for clean reuse.

### Environment inventory drift

The documented env inventory is not fully synchronized with current runtime use.

Examples found during audit:
- `BODY_CAPTURE_TOKEN` is used by runtime but absent from the main PROJECT env list;
- `GEMINI_NUTRITION_RECIPE_MODEL` is consumed by Gemini config but absent from that list.

A generated/validated config inventory is preferable to manually maintained partial documentation.

### Owner-specific seed content

Legacy Training migration `0003` creates the original A/B/C routines, including owner-specific product language.

A fresh database currently inherits those migrations.

The app must distinguish:
- product catalog/reference seed data;
- optional starter templates;
- true owner state.

---

## 49.3 What belongs in env

Use environment configuration for:

### Secrets
- database URL;
- provider API keys;
- auth secrets;
- owner identity selector;
- ingest bearer tokens.

### Deployment-level capabilities
- whether an optional integration is enabled;
- provider endpoint where needed;
- safe public instance identity;
- canonical instance timezone;
- public base URL only when an absolute URL is truly needed.

These values normally differ between deployments.

---

## 49.4 What should not be env

Do not put ordinary owner health/product state into environment variables.

Examples that belong in the database:

- DOB;
- height;
- health profile;
- goals;
- nutrition targets;
- routines;
- supplements;
- training schedule;
- hydration target;
- body measurement cadence;
- preferences that the owner can edit inside Health.

Environment variables are deployment configuration, not a substitute for canonical Health data.

---

## 49.5 Capability registry

Create a typed capability model.

Conceptual example:

```ts
type InstanceCapabilities = {
  geminiNutrition: boolean
  askHealthAi: boolean
  usdaLookup: boolean
  homeAi: boolean
  trainingPhotoImport: boolean
  appleHealthSync: boolean
  bodyCapture: boolean
  publicDemo: boolean
}
```

Exact fields may differ.

Capabilities should be resolved from:
- provider configuration;
- feature flags;
- product constraints.

UI code should consume capabilities rather than directly knowing environment-variable names.

---

## 49.6 Separate deployment is preferable to multi-tenancy for current use

For another household owner, the recommended architecture is:

> same code + separate Vercel project + separate Neon database/auth + separate owner configuration.

Benefits:
- strong health-data isolation;
- no tenant-id plumbing through every table/query;
- no risk of cross-owner query bugs;
- existing owner-only security model remains valid;
- backups/restores remain one-person archives;
- experimentation can remain personal.

A true multi-user SaaS architecture would require substantially more work:
- tenant identity;
- row ownership on every canonical table;
- authorization on every query;
- provider quotas by tenant;
- per-user ingest tokens;
- per-user backups;
- migrations and tests for isolation.

That work is not justified merely to let two people use the app.

---

## 49.7 Repo strategy for a second owner

A GitHub fork is **optional**, not technically required.

### Lowest-maintenance family setup
One maintained codebase can back two Vercel projects.

Each Vercel project has:
- its own environment variables;
- its own database;
- its own auth/provider configuration;
- its own domain.

A code change to the shared repository can then deploy to both instances.

### Forked setup
A fork is useful when the second owner wants:
- independent code ownership;
- independent customization;
- different release timing.

Trade-off:
- upstream improvements must be merged/synced into the fork.

The portability goal should support both.

---

## 49.8 Portability success criterion

A future deployment guide should be able to say:

> Fork or connect the repo, create the infrastructure, copy `.env.example`, fill in values, run migrations/config-check, deploy, and sign in.

It should **not** say:

> Search the repository for `daurham`, `Phoenix`, or the old production URL and edit each occurrence.

That is the standard this roadmap now requires.

---

# 50. Implementation Contract Checklist for Future AI Work

Before an AI coding agent starts any phase from this roadmap, it should:

1. Read:
   - `AGENTS.md`
   - `docs/ai/PROJECT.md`
   - `docs/ai/ROADMAP.md`
   - `docs/ai/DEV_STATE.md`
   - `docs/ai/DECISIONS.md`
   - current `docs/ai/CURRENT_TASK.md`
   - this document

2. Inspect the actual current code before assuming migration numbers, routes, or schemas.

3. Confirm H5/current work is closed before selecting the next migration number.

4. Produce a phase-specific implementation contract before coding.

5. Explicitly list:
   - canonical authorities;
   - instance-config / capability implications;
   - portability / fresh-instance behavior;
   - derived outputs;
   - migration changes;
   - backup/export changes;
   - Health Intelligence Snapshot integration;
   - relationship-catalog changes;
   - event-time / lag semantics;
   - provenance / data-quality semantics;
   - Change Ledger implications;
   - data-integrity / anomaly handling;
   - recommendation-memory implications;
   - adaptive-question implications;
   - evidence drill-down;
   - intelligence regression fixtures;
   - Ask Health integration;
   - Goal / Coach / Weekly Coach integration;
   - Today integration;
   - Progress integration;
   - XP implications;
   - demo implications;
   - API changes;
   - test plan;
   - owner visual QA.

6. Preserve:
   - missing != zero;
   - configured instance Health calendar;
   - owner-only writes;
   - deterministic analytics;
   - AI as interpreter;
   - no duplicate authorities.

7. Do not silently expand scope because adjacent ideas exist in this master roadmap.

---

# 51. Recommended Product North Star

The app should eventually feel less like a collection of health pages and more like a personal control system.

A good future Today experience:

> **Tuesday**
>
> **Current goal:** fat loss while preserving strength  
> **Plan:** Rest / active recovery
>
> **On track**
> - Weight trend is within your desired range.
> - Strength is stable.
> - Protein adherence is strong.
>
> **Today**
> - Keep calories unchanged.
> - About 12 g fiber remaining.
> - Water logging is behind your usual tracked pattern.
> - 2,300 steps to your target.
>
> **Check-in**
> Energy 3/5 · Hunger 3/5 · Soreness 2/5  
> No bowel movement recorded yet.
>
> **Watch**
> Bench performance dipped for two sessions, but evidence is not yet strong enough to classify a stall.
>
> **Recommendation**
> No training or calorie changes needed today.

The important part is not the exact copy.

The important part is that every sentence is supported by:

- canonical evidence;
- owner intent;
- a documented derived analysis;
- or an explicit limitation.

When the conclusion depends on multiple domains, the app should also be able to explain **how those domains were combined**.

That is the standard future features should meet.

---

# 52. Summary of Priority

Highest-value next foundations:

1. Single-owner instance portability / configuration contract.
2. Health Profile.
3. Flexible training/rest intent with session sequence and movable preferred days.
4. Hydration.
5. Bowel tracking.
6. Daily energy/hunger/soreness/stress.
7. Training RIR/RPE, explicit failure evidence, and conditional pain/limitation evidence.
8. Independent-side exercise tracking for movements where limbs can fail separately.
9. Evidence provenance / quality and correct event-time semantics.
10. Unified Intervention / Change Ledger.
11. Shared Health Intelligence Snapshot + metric registry.
12. Expanded curated cross-domain / lagged relationship engine.
13. Ask Health question-specific evidence routing.
14. Data coverage/confidence.
15. Goal Control System.
16. Observed maintenance / plateau detection.
17. Strength progression / preservation goals.
18. XP participation expansion, including supplement completion.
19. Additional end-of-progression themes.
20. Coach intelligence / Next Best Actions.
21. Recommendation memory, deduplication, and outcome evaluation.
22. Adaptive uncertainty-driven data collection.
23. Evidence drill-down / explainability.
24. Intelligence regression and evaluation suite.
25. Exercise substitution + muscle/movement exposure context.
26. Weekly / on-demand Deep Health Review.
27. Validated passive recovery signals.
28. Structured clinical context / labs when useful.
29. Counterfactual / What-If planning only after the personal model is mature.

The architecture should prefer **a few high-value signals used intelligently** over dozens of trackers that never change a decision.

The new architectural rule is:

> **Collect facts once. Derive evidence once. Reuse that evidence everywhere.**

Every new data point should be justified by the question:

> **What better decision can Daurham Health make because it knows this?**

Every intelligence feature should be justified by a second question:

> **What combination of existing evidence should this feature understand before it speaks?**

And for any new prompt or logging field:

> **Would knowing this answer materially change a conclusion, confidence level, or action?**

If there is no good answer, do not track it, do not ask for it, and do not generate advice from it.
