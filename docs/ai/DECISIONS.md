# Decisions

Observed from the current code and product docs. Where the original rationale is not in the repo, it is marked unknown.

## Decision: One owner, separate public demo

**Status:** Active  
**Reason:** The app is a personal health record. Owner APIs require the configured Neon Auth user. `/demo` is compiled fiction and does not call the database or providers.  
**Implications:** Anonymous access to owner data is 401. A different signed-in user is 403. Demo code must stay free of owner fetches and provider calls.

## Decision: Health owns canonical facts

**Status:** Active  
**Reason:** The v2 blueprint states this invariant. Deterministic code calculates. AI interprets or phrases. Missing evidence is not manufactured.  
**Implications:** Models do not write Nutrition, Training, Body, Activity, Sleep, Supplements, Goals, Experiments, or Benchmarks. Derived prose and insight cards are not canonical rows.

## Decision: America/Phoenix calendar

**Status:** Active  
**Reason:** `HEALTH_CALENDAR_TIME_ZONE` is `America/Phoenix`. Comments say not to substitute Los Angeles, because Phoenix does not observe daylight saving. Original product choice beyond that comment: unknown.  
**Implications:** Day boundaries, sleep dates, and weekly windows use that zone. `ai_usage` billing months stay UTC.

## Decision: Single Vercel function

**Status:** Active  
**Reason:** `api/index.ts` delegates to `server/dispatch.ts`. `vercel.json` rewrites every `/api/*` path to that function. Original rationale for one function rather than many: unknown.  
**Implications:** New owner endpoints are registered in `matchHealthApiRoute` and the handler map. They are not new Vercel functions.

## Decision: Domain calculations live in `src/domain`

**Status:** Active  
**Reason:** Client and server both import the same analytics. React does not reimplement them.  
**Implications:** Progress, insights, and the weekly coach call those functions. A new weekly or insight formula needs an explicit task. It does not get a second copy in a component.

## Decision: Neon HTTP in production, local `pg` only for tests

**Status:** Active  
**Reason:** Production queries use `@neondatabase/serverless`. `pg` is a devDependency. Ledger tests use an ephemeral local database.  
**Implications:** Do not add `pg` to the production request path. Do not write test rows through the owner's `DATABASE_URL`.

## Decision: Ingest token is write-only

**Status:** Active  
**Reason:** `APPLE_HEALTH_SYNC_TOKEN` authorizes `POST /api/ingest/apple-health`. Docs and tests say it cannot read Health data or call owner routes.  
**Implications:** Owner handlers must not accept that bearer token as a session. It does not authorize `POST /api/ingest/body`.

## Decision: Apple workouts are Activity, not Training

**Status:** Active  
**Reason:** Canonical Training session types are `programmed`, `ad_hoc`, and `experiment`. Roadmap and manual text keep Apple workout objects out of Training sets, volume, and performance bests.  
**Implications:** Activity sync must not increment Training session counts or create performance bests. Ongoing Health Auto Export workouts use the same `activity_workouts` rows.

## Decision: Health Auto Export workout identity is exact

**Status:** Active  
**Reason:** V2-G1 ingests JSON v2 `data.workouts` into `activity_workouts`. The provider workout id is the exact duplicate key. A cross-source match requires the same start instant, the same end instant, and the same activity identity after formatting normalization.  
**Implications:** Overlap is not a match. Several matches fail closed. A conflicting repeated id does not rewrite the historical row. Omitting a workout from a later payload does not delete it. There is no general correction lifecycle. The Health Auto Export transport is not an observing source. Route geometry and nested workout telemetry are not stored. Daily Activity totals do not include workout energy or duration.

## Decision: Current-day Activity is provisional

**Status:** Active  
**Reason:** Activity summaries exclude the current Phoenix day from completed-day averages. Today may show that day as in progress.  
**Implications:** Completed windows, including the weekly coach, end the day before `asOf` when `asOf` is today.

## Decision: Sleep source priority is not quality

**Status:** Active  
**Reason:** Source attribution docs and the vital registry comments say priority explains a stored selection. They forbid describing it as accuracy, and they forbid a device ranking.  
**Implications:** Do not add a source score, preference editor, or cross-source calibration unless a task explicitly specifies one.

## Decision: Overnight vitals stay disabled

**Status:** Active  
**Reason:** `SLEEP_VITAL_REGISTRY` sets `enabled: false` for every metric. The comment says a metric stays disabled until an inbound payload is verified. The table `sleep_vital_samples` exists.  
**Implications:** Shipping a vital requires a verified payload and an explicit enablement. An empty allowlist is the current production behavior.

## Decision: Supplement occurrence states stay distinct

**Status:** Active  
**Reason:** `resolveOccurrence` leaves a scheduled dose with no adherence row as `unknown`. Paused and discontinued do not become skipped.  
**Implications:** Adherence totals must not convert unknown to skipped or taken.

## Decision: Goal and Lab status have one authority each

**Status:** Active  
**Reason:** Goal display uses `goal-status-v1`. Retest state uses the benchmark retest rules. Experiment review uses `experimentNeedsReview`. Later features are documented as reusing those results.  
**Implications:** Coach copy, insights, and Today reminders must not invent a second on-track or due rule.

## Decision: AI spend for Ask Health and Weekly Coach shares one ledger

**Status:** Active  
**Reason:** `ai_usage` records reservations. Ask Health, Weekly Coach, Experiment Suggestions, literature synthesis, and Nutrition Gemini use `AI_MONTHLY_BUDGET_USD`. The reserve query does not filter by `request_type`, so the rate limit is shared.  
**Implications:** Do not add a second monthly wallet. Do not put cache hits on the ledger. `AI_WARNING_BUDGET_USD` does not block a call. Home-AI is not a Gemini call and is not reserved here.

## Decision: Model output is not Health history

**Status:** Active  
**Reason:** Ask Health turns stay in component state. Weekly Coach prose is not written to PostgreSQL, backup content, portable export, or `localStorage`. `ai_usage` stores a hash and cost, not the question or answer.  
**Implications:** A refresh may drop generated prose. That is the current behavior, not a bug to “fix” with a transcript table unless a task says so.

## Decision: Gemini phrases; it does not calculate the weekly brief

**Status:** Active  
**Reason:** Weekly Coach builds a deterministic packet and candidate list first. Generation is a `POST` the owner chooses. Invalid candidate ids fall back to the ranked facts.  
**Implications:** `GET` must not reserve `ai_usage` or call Gemini. The UI prints packet numbers, not numbers parsed out of model text.

## Decision: Home-AI is an HTTP service, not an in-repo model runtime

**Status:** Active  
**Reason:** The server calls `HOME_AI_BASE_URL` for transcription and nutrition fallback. This repo has no Ollama client. Older architecture documents name Ollama as the runtime behind Home-AI. Whether that host still uses Ollama: unknown from this repo.  
**Implications:** Workout and label jobs depend on Home-AI being configured. Do not add a local model runtime as part of an unrelated task.

## Decision: Experiment suggestions are derived until the owner accepts one

**Status:** Active  
**Reason:** V2-F4 keeps eligibility in a fixed registry. Gemini may phrase an eligible candidate. The existing `experiments.origin` value cannot store both the eligibility trigger and whether the owner used AI wording.  
**Implications:** Migration `0031_experiment_origins.sql` adds `origin_kind`, `origin_trigger`, `origin_fingerprint`, `origin_evidence`, and `experiment_goals`. Existing rows stay `owner_created` unless `origin` was already `ai_assisted` or `external_research`. Listing a suggestion does not reserve `ai_usage`. Acceptance rechecks the fingerprint and inserts one `accepted` Experiment. Surfaced candidates are due Benchmark retests and missing Benchmark baselines. `goal_observation` remains reserved vocabulary. No current Goal kind is emitted, including when `targetState` is `unknown`, because Lab requirements do not evaluate the Goal threshold and window. `experiment_goals` stays for that later case.

## Decision: External research is not personal Health evidence

**Status:** Active  
**Reason:** V2-F5 retrieves published literature only after the owner edits a visible query and chooses Search research. Europe PMC receives that query and the fixed PubMed-and-abstract filters. It does not receive the Ask Health packet. Gemini may paraphrase only the retrieved sources, and model prose with digits is rejected.  
**Implications:** There is no literature table. Queries, abstracts, and synthesis are not in backup, portable export, or `localStorage`. `literature_synthesis` shares `ai_usage`, `AI_MONTHLY_BUDGET_USD`, and the global rate gate. The Europe PMC request itself is not reserved. Source refs are `pubmed:<PMID>`. Study type is a label, not a score. Literature does not create an Experiment, Goal, insight, or coach brief. `external_research` stays unused until a later task.

## Decision: Shortcut Body capture is staged until the owner saves it

**Status:** Active  
**Reason:** V2-G2 lets an iPhone Shortcut post a measurement candidate. That post is not a measurement. Only the signed-in owner review creates canonical Body data.  
**Implications:** `BODY_CAPTURE_TOKEN` authorizes only `POST /api/ingest/body`. It is not the Apple ingest token and it cannot list, read, commit, discard, or edit Body data. Intake writes `body_capture_inbox` only. The same `captureId` with the same evidence returns the existing row. A different payload for that id is a 409 and does not rewrite the row. Commit uses the manual Body parser, source `manual`, and one `body_shortcut` provenance link in the same statement that marks the inbox committed. An untouched review keeps the staged instant, including seconds and fractions. Only an explicit measurement-time edit replaces it, and that edit keeps the entered seconds. The session stays editable. Deleting it nulls `canonical_session_id` and does not recreate the row on a later commit. Pending and discarded captures are not observations. The inbox is full-backup only. Native share-sheet targeting is deferred. Setup is `docs/body-shortcut.md`.

## Decision: Nutrition Gemini shares the durable AI ledger

**Status:** Active  
**Reason:** V2-G4 closes the gap where Nutrition Gemini could call the provider without an `ai_usage` reservation. Description, meal-photo, and label attempts are paid Gemini calls. Home-AI is a separate service and has no accepted monetary contract.  
**Implications:** Request types are `nutrition_description`, `nutrition_meal_photo`, and `nutrition_label`. Each attempt reserves against `AI_MONTHLY_BUDGET_USD` and the global rate gate before the network call. An automatic retry reserves again. `AI_BUDGET_REACHED` and `AI_RATE_LIMITED` are local denials, not `GEMINI_QUOTA`. A returned unusable response is completed. A provider failure after the call begins stays uncertain. Missing Gemini configuration is not charged. The ledger stores a SHA-256 request hash, not the description, context, filename, or image. Requeueing a capture does not reserve. Home-AI still does not.

## Decision: Appearance is a browser preference, not Health data

**Status:** Active  
**Reason:** V2-G3 lets the owner choose a color mode and a palette. Those choices change chrome. They do not change measurements, thresholds, analytics, chart calculations, or the meaning of danger, warning, and success.  
**Implications:** `health-theme` stores `light` or `dark`. System is the absence of that key, including an invalid value. `health-palette` stores `classic`, `forest`, `ocean`, `sunset`, or `plum`. An absent or invalid palette is Classic. The inline script in `index.html` applies both before React mounts, using the same allowlist. `ThemeSync` follows `prefers-color-scheme` only while System is selected, and it applies `storage` events for those two keys. There is no theme table, API, backup row, or portable-export field. Motion is a separate presentation layer and does not store a preference.

## Decision: Motion explains interaction and does not change a Health fact

**Status:** Active  
**Reason:** V2-G5 may show that a control was pressed or that a surface arrived. It must not make a measurement, total, chart, or goal look more certain, more dramatic, or different from the deterministic value.  
**Implications:** One CSS vocabulary in `src/index.css` covers press, hover lift, page entry, sheet entry, notices, pending opacity, and meter width. `prefers-reduced-motion: reduce` removes that movement, including the pending opacity transition and chart animation. There is no stored motion preference, no animation library, and no count-up of Health numbers. Appearance still switches immediately.

## Decision: Several photos are one reviewed meal

**Status:** Active  
**Reason:** V2-G6 lets the owner add up to three views of the same meal so Gemini has more visual context. Those views are evidence for one estimate. They are not separate meals and they are not a saved Nutrition fact.  
**Implications:** A Gemini meal job stores one to three ordered images in `nutrition_capture_images`. Historical one-photo jobs stay readable from `nutrition_capture_jobs.image_bytes` when no child rows exist. Labels stay on that legacy column. One Gemini attempt is one `ai_usage` reservation, even when the request contains three images. Home-AI accepts one photo. A multi-photo set does not silently send the first photo to Home-AI. The canonical `nutrition_entries` row is still the reviewed value the owner saves. Photo count and angle labels are not stored on that row. Child images belong in the full backup and not in the portable export.

## Decision: A recipe draft is not a recipe

**Status:** Active  
**Reason:** V2-G7 lets Gemini turn pasted recipe text into a list of suggested ingredients. That list is not a Nutrition calculation and it is not a saved Recipe.  
**Implications:** The request and prompt version are `recipe-assist-v1`. The ledger request type is `nutrition_recipe_assist`. Health does not fetch recipe URLs. The model output cannot carry calories, macros, or food ids. Applying the draft is a separate owner action and does not overwrite notes, finished weight, or a name and servings the owner already typed. Each line stays unresolved until the owner selects a canonical food through the existing ingredient flows. A suggested unit is used only when that food already supports it. `composeRecipe` and `createRecipe` stay the recipe authority. The pasted text and the draft are not stored.

## Decision: A clarification is owner context, not a Nutrition fact

**Status:** Active  
**Reason:** V2-G8 lets Gemini ask up to three short questions when a meal photo still has an ambiguity the owner can answer. Those questions and answers help the next estimate. They are not measurements, and they are not the saved meal.  
**Implications:** The meal prompt is `meal-photo-v3`. Clarifications live on the current capture candidate. Health assigns `c1`, `c2`, and `c3`. The owner can save without answering. Refine estimate is the only action that requeues the same job and the same stored photos. That later Gemini attempt is a normal `nutrition_meal_photo` reservation. Home-AI rejects a reanalysis that includes clarification answers. The compiled note stays within the existing 2000-character context ceiling. Canonical `nutrition_entries` still store the reviewed meal the owner saves. There is no clarification table and no backup-inventory change.

## Decision: Manual ledger rows are historical

**Status:** Active  
**Reason:** Implementation notes in this repo say not to rewrite older design-manual ledger rows or older “not implemented” sentences inside past amendments. New work adds a new row and a new amendment.  
**Implications:** A status correction belongs in the live status paragraph and a new ledger row, not in an older row.

## Decision: Nutrition micronutrients preserve unknown evidence

**Status:** Active  
**Reason:** V2-H1 makes fiber and sodium first-class optional nutrients across foods, entries, providers, AI review, recipes, Today, Nutrition, and Progress. A missing nutrient is not evidence of zero.  
**Implications:** Fiber is stored in grams and sodium in milligrams. Provider units are converted at their boundary. Daily and recipe totals become incomplete when any contributing canonical item lacks the nutrient. Do not substitute zero or display a partial sum as a complete total.

## Decision: Strength Goals use canonical Training e1RM evidence

**Status:** Active  
**Reason:** A `strength_e1rm` Goal is evaluated from current canonical Training sets through the existing Epley estimated-1RM calculation. A displayed e1RM can therefore exceed the literal load lifted in its source set.  
**Implications:** Goal/Progress strength state must not use a separately synchronized max-weight or achievement table. Source load, reps, session, and set are provenance for the derived value. Deleting the canonical Training session removes that evidence through existing cascades and the next read recomputes from what remains. Activity workouts never qualify.

## Decision: Mistaken Goals delete unless immutable history references them

**Status:** Active  
**Reason:** Marking a bad Goal complete is not a correction. Unreferenced Goal identity and versions can be removed, but an Experiment may hold an immutable reference through `experiment_goals`.  
**Implications:** `DELETE /api/goals/:id` physically deletes an unreferenced Goal and its versions. A referenced Goal is archived with `archived_at` instead, disappears from default Goal/Ask surfaces, and remains resolvable for historical evidence.

## Decision: Coach assignments are persistent, but Health facts stay canonical

**Status:** Active  
**Reason:** H2A needs stable Weekly Focus and Daily Quest assignments that do not reroll on refresh, while Health measurements and Goal status already have canonical authorities.  
**Implications:** `coach_tasks` freezes the selected assignment, target snapshot, rule version, difficulty, and reward band. `coach_task_events` records lifecycle/provenance. Coach does not persist a second Goal status, Nutrition total, Activity total, Body measurement, or Training best. Automatic completion always re-reads the canonical domain.

## Decision: Physical manual quests become canonical Training

**Status:** Active  
**Reason:** Actions such as jumping jacks, yoga, shadow boxing, running, hiking, and general cardio are useful only if completion also improves the owner's Training history instead of becoming an unverifiable checkbox.  
**Implications:** Reps/duration Coach quests create or reuse compatible owner exercises and save ordinary `ad_hoc` Training sessions. Run/hike distance is optional Coach evidence only until Training gains a distance measurement family. One submission UUID prevents duplicate Training sessions on retry. Below-target work may be logged without falsely completing the quest.

## Decision: Non-Training manual quests stay explicit self-report evidence

**Status:** Active  
**Reason:** Meal prep and health journaling do not map honestly to an existing canonical Health measurement. Creating fake Nutrition consumption or overwriting Daily Context would corrupt meaning.  
**Implications:** These quests append `owner_self_report` Coach evidence. Meal prep does not create an eaten Nutrition entry. Health-journal notes do not mutate Daily Context. UI copy may say “Reported by you”; it must not imply sensor/canonical verification.

## Decision: Coach generation is deterministic and provider-free

**Status:** Active  
**Reason:** Today is a frequently opened surface and must not spend money or produce unstable assignments. The app already has deterministic Goal, Body, Nutrition, Activity, Training, and Context authorities.  
**Implications:** H2A uses a fixed versioned rule registry, deterministic scoring/tie-breaking, recent repetition penalties, and frozen task rows. Opening/ensuring Coach does not call Gemini, Home-AI, Europe PMC, or reserve `ai_usage`. Passing consumes the period and never rerolls another task for that same day/week.


## Decision: Stretch challenges freeze canonical Training evidence

**Status:** Active
**Reason:** H2B challenges are explicit accepted performance thresholds, not Daily Quest self-report.
**Implications:** Only existing canonical working sets qualify. Strength reuses high-confidence Epley; unloaded reps/duration use a single working set and minimum completed side. Offered baseline edits/deletions invalidate the offer. Acceptance freezes the target; completion uses currently existing post-acceptance evidence and an atomic source guard. Later deletion preserves historical Coach completion provenance but removes the canonical evidence from current Training analytics. H3 owns any future reward reconciliation.

## Decision: Stretch timing is a Phoenix calendar contract

**Status:** Active
**Reason:** Rare offers must not reroll or extend on refresh/pass/failure/completion.
**Implications:** Eight-date offer cooldown, three-date inclusive offer availability, seven-date inclusive accepted challenge window. One current offered/active Stretch is enforced in PostgreSQL. Canonical workout date and session creation instant must both fit the challenge window; a backdated capture after expiry cannot complete. Full database timestamp precision is preserved for exact source checks.

## Decision: Rounded Stretch targets fail closed at the difficulty cap

**Status:** Active
**Reason:** CURRENT_TASK's duration example 20→25 seconds conflicts with its mandatory maximum 110% baseline rule; 25 seconds is 125% of 20. The explicit cap is the governing product constraint.
**Implications:** Reps +5%/whole-rep/+1 and duration +5%/five-second/+5 targets are generated only when all bounds can be satisfied. Otherwise no candidate is emitted. Baseline 20 sec is ineligible; 95→100 sec and 10→11 reps are valid. This interpretation is tested and recorded as the task-contract resolution.

## Decision: Unloaded Coach logs use the established Training load state

**Status:** Active
**Reason:** H2A's duration presets attempted `loadState = none`, which is not in the canonical Training load-state enum and fails the real parser.
**Implications:** Coach presets for `loadType = none` or bodyweight emit the existing `bodyweight` set state with no external load. No measurement family or Training API contract changes. A real-parser regression covers yoga logging.


## Decision: Personal Lab Coach attention remains derived

**Status:** Active  
**Reason:** Benchmark retest state and Experiment Suggestion eligibility already have deterministic authorities, and Experiment Suggestions intentionally remain derived until accepted.  
**Implications:** H2C does not persist Lab suggestion content in `coach_tasks`. Coach derives current Lab attention from existing Lab services and persists only Coach-specific snooze presentation state. Surfacing/opening an item does not create an Experiment or canonical Health fact.

## Decision: Lab snoozes are fingerprint-scoped Phoenix presentation state

**Status:** Active  
**Reason:** “Not now” should reduce repeated attention without permanently hiding a materially changed Lab opportunity.  
**Implications:** `coach_lab_snoozes` keys item kind + stable source key + exact fingerprint and hides that fingerprint for seven Phoenix calendar days. A changed result, protocol, retest state, or suggestion fingerprint can surface immediately. Snoozing never mutates Lab, Goal, Experiment, or benchmark truth.

## Decision: Coach has one deterministic primary-attention order

**Status:** Active  
**Reason:** Today should present one meaningful next action rather than competing cards.  
**Implications:** Primary order is accepted active Stretch → due Lab retest → offered Stretch → active Daily Quest → available Lab retest → Experiment Suggestion → bounded current-period acknowledgement. Weekly Focus stays a compact strip. Inbox order is Stretch / Today / Lab / This week.

## Decision: Canonical owner mutations invalidate Today and Coach in-app

**Status:** Active  
**Reason:** Coach truth can change after Training, Nutrition, Body, Activity/import, Goal, Context, Supplement, and Lab mutations. Continuous polling is unnecessary.  
**Implications:** Successful relevant owner mutations emit a coalesced client event. Today and Coach reload from their canonical server authorities. Preview/draft requests, failed mutations, Coach ensure, and Lab snooze itself do not emit the canonical-change event.


## Decision: Pace and Training PRs are derived from canonical observations

**Status:** Active  
**Reason:** H2D adds canonical distance and duration observations, but pace and PR status are interpretations of those facts and must not become a second source of truth.  
**Implications:** Training stores distance in meters and duration in seconds. Pace is derived only when one qualifying working set contains both. Reps, duration, distance, pace, skill achievement, Goal evidence, and Training bests are recomputed from current canonical Training; no pace or PR flag is stored.

## Decision: Skill achievement is explicit binary Training evidence

**Status:** Active  
**Reason:** Skills such as a handstand or first unassisted movement cannot be inferred reliably from an exercise name, duration, or rep count.  
**Implications:** A `completion` exercise stores an explicit working-set `completed` boolean. `true` is achievement; `false` is an attempt. Skill Goals use that evidence. Binary skills do not auto-generate Stretch Quests because there is no deterministic percentage-based next step without a progression hierarchy.

## Decision: Running and Hiking are canonical Training, separate from Activity

**Status:** Active  
**Reason:** Owner-entered continuous performance needs canonical distance/time evidence for Goals and Stretch, while synced Apple workouts remain Activity by design.  
**Implications:** Built-in Training definitions EX18 Running and EX19 Hiking use `distance_duration`. Future manual Coach Run/Hike logs write duration and any supplied distance into ordinary `ad_hoc` Training. Health Auto Export workouts are not converted into Training and do not become Training performance evidence.

## Decision: Saved Routines reuse immutable workout-template versions

**Status:** Active  
**Reason:** Training already has versioned templates and programmed sessions snapshot template identity. A parallel routine model would duplicate that authority.  
**Implications:** Built-in A/B/C templates are `seeded` and owner-immutable. Owner Saved Routines use stable opaque `owner:<uuid>` routine codes. Editing creates a new active template version and deactivates the prior version; archiving deactivates the current version. Historical sessions remain tied to the exact old template/version and are never rewritten.


## Decision: Coach completion is the XP issuance boundary

**Status:** Active  
**Reason:** Health measurements should stay canonical observations instead of becoming farmable game events. Coach already owns deterministic commitments and freezes a reward band when each task is created.  
**Implications:** Only a Coach task with status `completed` mints XP. Routine, standard, weekly, and stretch bands award 10, 25, 75, and 100 XP under `xp-rule-v1`. Offered, active, accepted-only, passed, failed, and expired states award zero. One Health action may complete several distinct Coach commitments and each completed task may award once.

## Decision: XP history is append-only and balances are derived

**Status:** Active  
**Reason:** A wallet must remain auditable under retries, backfill, purchase concurrency, and later product calibration.  
**Implications:** `xp_ledger` stores positive immutable award, purchase, and refund entries. Lifetime XP is the sum of awards. Spendable XP is awards minus purchases plus refunds. There is no mutable balance authority and no manual XP adjustment UI. Existing completed Coach tasks are backfilled using their frozen reward band and `xp-rule-v1`.

## Decision: Health corrections do not claw back historical XP

**Status:** Active  
**Reason:** Correcting an inaccurate Health record must never carry a game-currency penalty that encourages keeping bad health data. Coach completion already preserves the evidence/provenance that existed at completion time.  
**Implications:** Later editing or deleting canonical Training or other Health evidence does not remove an XP award from a previously completed Coach task. H3 applies no negative penalty for passing, failing, expiry, deletion, or later Health correction.

## Decision: Reward redemptions freeze a snapshot and refunds compensate

**Status:** Active  
**Reason:** Owner rewards are editable catalog choices, while a historical redemption must retain what was actually bought and what it cost.  
**Implications:** Reward items can be created, edited, and archived. A redemption freezes reward name and XP cost in `reward_purchases`; later item changes do not rewrite it. Spending appends one purchase ledger entry. Refund appends one compensating refund entry and restores Spendable XP without changing Lifetime XP. Concurrent purchases serialize at the database boundary and cannot overdraft the one-owner wallet.

## Decision: Separate single-owner deployments share one portable codebase

**Status:** Active  
**Reason:** Supporting another owner does not justify converting the personal Health record into a multi-tenant SaaS. Separate deployments provide stronger isolation while preserving the existing owner-only authorization model.  
**Implications:** A normal new instance should require infrastructure/environment configuration rather than source edits. Deployment secrets and capability flags belong in instance configuration; editable Health state belongs in PostgreSQL. Optional providers must degrade cleanly. A GitHub fork is optional: the same repository may back multiple Vercel projects with separate databases and environment values. True multi-tenancy is out of scope unless a future product decision explicitly requires it.



## Decision: Deployment configuration owns the Health calendar timezone

**Status:** Active  
**Reason:** Separate one-owner deployments must be able to use a different IANA calendar timezone without source edits, while deterministic domain logic must remain testable and independent of server environment reads.  
**Implications:** `HEALTH_CALENDAR_TIMEZONE` is resolved by the server instance configuration and passed into live owner flows. Shared domain helpers may retain `America/Phoenix` as a backward-compatible default for the original deployment, fixtures, or explicitly historical tooling, but that default is not the universal runtime authority. Browser owner pages receive the public instance timezone before date-sensitive state initializes. Provider billing months for `ai_usage` remain UTC. Existing stored timezone/provenance is not rewritten merely because deployment configuration changes.

## Decision: Instance identity is deployment presentation, not owner Health state

**Status:** Active  
**Reason:** App name, external home link, public-demo availability, and optional provider capabilities differ between deployments but are not canonical health facts or ordinary owner preferences.  
**Implications:** Public-safe instance presentation/capabilities come from the typed instance configuration exposed by `GET /api/health`. Current Jake defaults preserve `Daurham Health`, `https://daurham.com`, and public demo behavior unless env overrides them. A normal second deployment should not require source search-and-replace for branding, domain, or timezone. True multi-tenancy remains out of scope.
