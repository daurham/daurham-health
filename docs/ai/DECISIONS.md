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

**Status:** Superseded by I3 daily participation XP  
**Reason:** H3 intentionally began with Coach as the only issuance boundary so Health observations could not become farmable game events.  
**Implications:** Historical Coach awards remain frozen at 10, 25, 75, and 100 XP under `xp-rule-v1`. I3 broadens issuance through a separate bounded participation rule; it does not rewrite the H3 awards or make raw observation quantity rewardable.

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

## Decision: Product seeds and owner seeds have different portability semantics

**Status:** Active  
**Reason:** Historical migrations contain both reusable product/reference data and original-owner setup data. Treating both as universal built-ins makes a clean second-owner deployment look like Jake's account.  
**Implications:** Shared exercise definitions, data-source definitions, and explicitly generic built-in routines may be active on every instance. The original A/B/C 1.3.1 paper routine family is classified as `legacy_owner`. Migration 0042 hides that family on a fresh database but preserves it when historical Training references the family. Historical templates are never deleted merely to make a new instance clean. Owner-created Health state remains database-owned and starts empty on a new deployment.

## Decision: Fresh-instance bootstrap is data-aware, not an environment toggle

**Status:** Active  
**Reason:** Whether the original A/B/C routine family belongs to an instance is a historical-data question, not deployment presentation/configuration. An env flag would be easy to forget, could silently change behavior after redeploy, and would mix owner history with infrastructure configuration.  
**Implications:** Migration 0042 determines preservation from canonical Training references. New instances need no `HEALTH_LEGACY_*` setting. The deployment guide and `instance:check` verify the resulting state.

## Decision: Health Profile stores stable owner-authored context

**Status:** Active  
**Reason:** Date of birth, height, and durable owner context materially affect future interpretation but should not be re-entered as daily observations. Temporary symptoms/events have a different meaning and already belong in Daily Context.  
**Implications:** I1 stores one canonical profile per deployment. DOB is stored and age is derived as-of the requested Health date. Height is canonical centimeters with owner-facing unit conversion. Persistent health context, Training limitations, and dietary context are bounded owner-reported text, not diagnosis or measured evidence. Biological sex is not collected until a supported calculation explicitly requires it. Profile state is included in portable/full backup.

## Decision: Training intent is sequence-first and versioned

**Status:** Active  
**Reason:** A reusable workout template says what a workout contains; it does not say when the owner intends to train or which routine should come next. Exact weekdays are too brittle to be the source of truth.  
**Implications:** I1 adds a separate versioned Training Plan with ordered routine codes, weekly frequency target, preferred weekdays, and a default non-training intent. Historical reads resolve the version effective on the requested date. Routine codes survive Saved Routine version changes. Programmed session observations remain canonical Training facts.

## Decision: Preferred Training weekdays are preferences, not failure deadlines

**Status:** Active  
**Reason:** Moving Wednesday Training to Thursday should not create a false adherence failure or advance past the intended routine.  
**Implications:** Current-week changes live in dated overrides. Explicit moves create paired `training_moved_away` / `training_moved_here` records. I1 stores no missed/late/failure status for an exact weekday. Weekly completed-session counts are descriptive. Daily Context `rest_day` remains retrospective. Sequence advancement replays programmed sessions and advances only when the currently expected routine is completed; out-of-order sessions do not silently skip the expected routine.


## Decision: Daily Signals preserve missing-versus-zero semantics

**Status:** Active  
**Reason:** Water, bowel, and subjective state are useful only if sparse tracking is not silently converted into normal/zero observations. A missing record and an explicit zero can imply very different things.  
**Implications:** Hydration is event-based and has no synthetic zero day. Bowel uses real Bristol events plus a separate explicit no-BM day state. Subjective wellness exists only when at least one rating was entered. Current-day and backlog UI must show unknown explicitly rather than filling defaults.

## Decision: I2 captures facts now; shared intelligence consumes them later

**Status:** Active  
**Reason:** Adding Timeline/Ask Health integration before the shared evidence-frame phase would create another bespoke path with incomplete provenance/coverage semantics. The raw facts are useful immediately on Today without that duplication.  
**Implications:** The first I2 batch owns canonical Daily Signals and the consolidated Today Check-in only. XP stays in I3. Cross-domain relationships, Timeline signal integration, Ask Health evidence routing, and confidence/coverage interpretation move to I5. No readiness score is introduced.


## Decision: XP issuance is Coach completion plus bounded daily participation

**Status:** Active  
**Reason:** A small participation reward can make useful owner-entered data more consistent without rewarding symptom quantity, supplement ingestion, or favorable health outcomes. The wallet must still resist retries, multi-event farming, and mass historical backfill.  
**Implications:** Coach completion remains on `xp-rule-v1`. I3 uses `xp-participation-v1` for four Health-date awards: hydration 10 XP, bowel tracking 10 XP, wellness ratings 20 XP, and a fully recorded supplement day 25 XP. Each domain/date has one immutable idempotency key, so the maximum participation award is 65 XP per Health day. Taken and skipped supplement occurrences both count as honestly recorded; unknown does not. Only today and yesterday may mint participation XP. Older backlog still saves as Health history without currency. Multiple glasses, bowel movements, ratings, retries, or edits never stack extra XP.

## Decision: Participation XP does not alter Health truth or correction behavior

**Status:** Active  
**Reason:** Health correctness must remain more important than game currency. Rewarding an outcome or clawing currency back after a correction would create incentives to preserve inaccurate records.  
**Implications:** Canonical Health writes never depend on an XP award. Participation rewards the act of recording, not the value recorded. Later edit/delete/correction does not remove an already-issued participation award. No negative XP exists. The append-only ledger remains the accounting authority.

## Decision: Progression grows by appending unlocks, not moving earned thresholds

**Status:** Active  
**Reason:** New recurring XP increases Lifetime XP velocity, but moving existing unlock thresholds would make prior progress feel revoked.  
**Implications:** The `progression-v1` threshold formula stays unchanged. I3 appends eight theme packs at Levels 13–20: Crimson Surge, Sun God, Sage Storm, Mjolnir Night, Vault Neon, Abyss Knight, Republic Red, and Cosmic Instinct. Level 20 unlocks at 10,450 lifetime XP. Future velocity tuning should change new award values prospectively or append more runway rather than moving previously earned theme thresholds.

## Decision: I4 evidence quality is descriptive, not a universal score

**Status:** Active  
**Reason:** Nutrition, Body, and Training evidence have different uncertainty semantics. One opaque quality number would imply precision and comparability the app cannot justify.  
**Implications:** Nutrition uses coarse provenance classes and a day-level evidence label. Body stores owner-reported comparability. Training stores explicit effort/failure context. I5 may combine coverage/provenance/confidence states, but I4 does not rank all Health evidence on one scale.

## Decision: Change candidates never rewrite canonical intent

**Status:** Active  
**Reason:** A sustained behavioral shift can be real without proving the owner changed a Goal, Training Plan, Nutrition target, or other declared intent.  
**Implications:** I4 derives explicit change events from existing histories and stores only candidate confirmation/dismissal state for undeclared shifts. Initial detectors cover steps, Training frequency, and logged water. Missing hydration days stay missing. Confirming a candidate adds context for intelligence; it does not mutate the underlying Goal/Plan/target/history.

## Decision: Data Quality review annotates analysis; it does not repair source rows

**Status:** Active  
**Reason:** Suspicious data may be valid, and canonical provenance must remain auditable. Silent correction would destroy evidence and create a second source of truth.  
**Implications:** The watchdog produces review flags. The owner may confirm a record as valid or exclude it from future intelligence. The source record remains unchanged. I5's shared evidence frame is responsible for honoring exclusions; I4 does not patch every existing Progress formula independently.

## Decision: Shared Health Intelligence is a derived analysis boundary

**Status:** Active  
**Reason:** Ask Health, Coach, Progress, Today, and Personal Lab should not each build their own interpretation of the same Health history.  
**Implications:** `health-intelligence-v1` aligns canonical evidence by Health date and exposes coverage, baselines, curated relationships, intervention context, and evidence provenance. It is derived on read and is not a second canonical Health store. New intelligence consumers should route from this shared layer where its registry supports the question instead of duplicating relationship logic.

## Decision: Data Quality exclusions apply before shared intelligence

**Status:** Active  
**Reason:** An owner decision to exclude a suspicious observation from future intelligence should have one deterministic effect rather than bespoke filtering in each consumer.  
**Implications:** I5 removes I4 `excluded_from_analysis` Body/Nutrition evidence at the shared-loader boundary and reports the exclusion in coverage. The source row remains canonical and auditable. Existing legacy Progress formulas are not silently rewritten; consumers adopting the shared snapshot inherit the exclusion semantics.

## Decision: Missing daily evidence remains sparse in intelligence

**Status:** Active  
**Reason:** A missing water log, bowel log, wellness rating, Nutrition day, or Body measurement does not prove zero.  
**Implications:** The shared frame stores only observed values. Explicit no-BM is a real bowel count of zero. Completed-day Training session count may synthesize zero because absence of a canonical Training session is itself meaningful for that date. Complete-day metrics treat the current Health-calendar day as provisional.

## Decision: Personal relationships are observational evidence, not causal conclusions

**Status:** Active  
**Reason:** Paired personal observations can reveal useful associations while still being confounded by unmeasured context.  
**Implications:** I5 uses a curated relationship registry, deterministic minimum sample gates, optional lag alignment, and Spearman rank association. Ask Health may explain supplied relationships but must label them observational. Change Ledger before/after comparisons are context only and never proof of intervention effect.

## Decision: Goal Control is the primary weekly decision authority

**Status:** Active  
**Reason:** Weekly Coach, Today, and the gamified Coach can each surface useful evidence, but they should not independently decide what the owner's primary weekly recommendation is.  
**Implications:** `goal-control-v1` selects one deterministic state from Weekly Coach focus candidates plus I5 evidence context. Today and Weekly Coach render that shared decision. The gamified Coach remains a mission/reward system; new weekly goal missions require genuine attention and should not be interpreted as a second strategic recommendation engine.

## Decision: No change recommended is a valid positive result

**Status:** Active  
**Reason:** A decision system that must always produce an action will overreact to noise and undermine the evidence-quality work in I4/I5.  
**Implications:** I6 explicitly emits `maintain` when evidence is sufficient and no focus is justified. The UI says to stay the course. `insufficient_evidence` remains distinct so lack of evidence is never mislabeled as success.

## Decision: Training adherence follows the flexible Training Plan, not calendar guilt

**Status:** Active  
**Reason:** Preferred days are intentionally flexible and owner-declared rest/active-recovery/away intent is canonical context.  
**Implications:** I6 does not treat a configured non-Training day as a missed workout. Goal-driven daily Training quests are only offered on planned Training days (or when no plan exists). A previously created active Training quest expires without reward if the same date is later changed to non-Training intent.

## Decision: Nutrition evidence must clear a floor before intake-change reasoning

**Status:** Active  
**Reason:** Sparse, estimate-heavy, or unknown-source logging can make mathematically neat intake conclusions practically unreliable.  
**Implications:** I6 requires at least four logged and four sufficiently reliable completed Nutrition days for intake evidence to be decision-ready. Failing the floor becomes an explicit limitation. I6 does not mutate intake targets; I7 owns observed-maintenance and plateau intervention logic.

## Decision: observed maintenance is an empirical estimate, not measured metabolism

**Status:** Active  
**Reason:** Logged intake plus body-weight response can provide useful personal energy-balance evidence, but a fixed body-mass energy conversion is still an approximation and cannot directly measure metabolic expenditure.  
**Implications:** I7 labels the result observed maintenance, reports a confidence-sensitive range, withholds implausible results, and does not call the value BMR or measured TDEE.

## Decision: plateau classification requires Goal direction and evidence maturity

**Status:** Active  
**Reason:** A temporarily flat scale can be normal stability, sparse measurement, or short-term noise. Treating every flat window as a plateau would create unnecessary intervention pressure.  
**Implications:** A likely plateau requires an unmet directional body-weight Goal plus a sufficiently complete multi-week intake/weight window. A flat trend without such a Goal is stability. Missing or weak evidence stays explicitly insufficient.

## Decision: short-term scale context remains observational

**Status:** Active  
**Reason:** Sodium, carbohydrate, hydration logging, bowel patterns, travel, stress, late meals, sickness, and similar context can coincide with transient scale changes but do not establish the cause of an individual weigh-in.  
**Implications:** I7 may surface these as reasons to defer a short-window plateau judgment, but never labels them as proven causes or diagnoses.

## Decision: maintenance interventions are proposals, never silent target mutations

**Status:** Active  
**Reason:** The estimator's uncertainty and the owner's preferences make automatic calorie changes inappropriate.  
**Implications:** I7 can suggest holding course or reviewing one modest intake/activity lever. It never writes Nutrition targets, Goal versions, or Training Plan settings. Strong intake proposals remain review-only.

## Decision: uncertain weight response can become an owner-reviewed Personal Lab calibration

**Status:** Active  
**Reason:** When evidence is meaningful but still ambiguous, a stable observation protocol is more informative than repeatedly changing targets.  
**Implications:** I7 may create a deterministic `maintenance_calibration` suggestion. The owner must review and accept it through the existing Lab flow. Stale fingerprints and duplicate open-Goal coverage are enforced. The protocol observes intake, comparable weight, carbohydrate, and Daily Context; it does not prescribe dehydration or sodium manipulation.

## Decision: shared nutrition evidence retains logs but gates full-day inference by canonical owner confirmation (PIQ-1.1, 2026-10-15)

**Status:** Branch-validated; production release gated.  
**Reason:** Precise individual food entries do not prove complete-day consumption. Shared-intelligence baselines, correlations, trend confidence and intervention comparisons must not inflate certainty from unknown or partial days.  
**Implications:** Server reads existing revision-bound, reliable confirmed-day eligibility; failed reads withhold full-day inference while preserving raw logged values. Health AI clearly labels logged versus verified coverage and distinguishes verification failure from zero confirmations. General explanations and exact logged-food questions remain possible. Does not alter calorie goals, run extra Gemini calls or backfill historical confirmations. Owner mobile QA and applied Neon schema verification remain mandatory.

## Decision: Ask Health multi-day calorie-target comparisons require four corroborated complete-day logs (PIQ-1.1, 2026-10-15)

**Status:** Branch-validated; release gated.  
**Why:** Comparing a meal log with a daily calorie target produces a numeric gap but cannot establish daily energy intake, expenditure, a physiological deficit or the need to cut calories. Bare caveat wording is not enough if the model gets a confident numeric gap.  
**Policy:** Preserve the actual logged amounts as descriptive personal facts; only emit a multi-day numeric target comparison when at least four dates are owner-confirmed complete and independently source-ID/calorie/revision crosschecked against the shared intelligence snapshot. Existing loaded data is reused; stale edits, provisional today, schema outages and older synthetic callers fail closed. Otherwise emit a specific nonnumeric limitation. Prompt v5 bars reconstruction. No silent target edit or new paid AI requests. Owner data and full production schema QA still required to release.

## Decision: recent verified intake is a hard gate for Coach calorie-change actions (PIQ-1.2, 2026-10-15)

**Status:** Branch-validated, production gated.  
**Rationale:** A statistically plausible 28-day maintenance/plateau estimate does not justify *new* calorie-cut guidance when the immediately preceding seven days lack corroborated full-day intake records. The Goal Control weekly `reliableDays` field must have the same semantics as the canonical verification contract, not merely entry source accuracy.  
**Policy:** Retain raw logged nutrition; count as intake-decision ready only owner-confirmed, revision/source-matched high-quality complete days. Preserve the established minimum of four such days in the last seven completed dates. Withhold the intake action on low coverage or read failure, even when an older estimator remains informative. Coach applies this gate again when drafting; a dependent activity alternative cannot appear after its calorie parent is hidden or dismissed. No automatic calorie adjustments or production mutation.

## Decision: short-term sodium and carbohydrate scale context requires comparable confirmed days (PIQ-1.2, 2026-10-15)

**Status:** Development-branch validated, release blocked on 0053/prod schema/owner QA.  
**Why:** A known sodium/carbohydrate total on one accurately entered meal is not evidence of daily nutrient intake. Comparing a sparse recent record with more complete baseline records could falsely explain weight variation.  
**Policy:** For optional scale-noise context, only compare dates whitelisted by current owner-complete/revision-matched, source-reliable day checks, and only when the nutrient and calories share exact nonduplicated canonical food IDs, all values finite and high-confidence. Require at least 2 of 3 completed recent days and 4 of 7 earlier days. Fail closed when verification is unavailable or missing. Preserve original logged amounts and unrelated recorded hydration/bowel/context. Communicate observational possibility only, not causal diagnosis or automatic calorie advice. No new provider calls or schema changes.

## Decision: maintenance estimator requires representative, overlapping food and weight observation windows (PIQ-1.2, 2026-10-15)

**Status:** Branch-validated only, production release held.  
**Why:** Minimum observation *counts* cannot prevent a robust mean of early-period calories being compared with a weight trend taken from another part of the interval. Chronological gaps and clustered weigh-ins can create an apparent plateau or misleading maintenance estimate even after food-day verification.  
**Rule:** In addition to existing count/quality thresholds, require >=3 verified calorie dates per calendar seven-day block, <=4 days between first/last calorie and corresponding weight observation dates, and >=2 qualifying weigh-ins in each half of the proposed window. Try shorter anchored 21/14-day candidates rather than indiscriminately throwing away valid evidence. Only grant high confidence with >=4 verified days per block and <=1-day endpoint mismatch. Otherwise withhold numeric maintenance, explain the alignment problem, and never suggest automatic target changes. Raw nutrition and verified-day reports remain intact; this is deterministic, costs no paid AI calls, and creates no migrations.

## Decision: a likely plateau is not permission to suggest another calorie cut (PIQ-1.2, 2026-10-15)

**Status:** Branch-validated; production gate remains closed.  
**Policy:** Only surface numerical downward calorie-review advice after a current configured target and active-experiment state are successfully read, recent owner-rated hunger/energy/soreness observations are sufficient and without repeated adverse scores, no recent illness/pain/poor-sleep context is recorded, and the proposed target passes a conservative intake threshold screening. Missing target, missing check-ins, read failure, an active or imminent experiment, or recent recovery concerns **withhold the numerical adjustment**. Retain descriptive plateau and maintenance evidence and offer nonnumeric plan/recovery review; no automatic target change.  
**Nonclinical limits:** max(1500 kcal, 80% of empirically estimated maintenance) is only a provisional *cut-screening guard*, never proof of individual adequacy. Physiological profile, strength-performance decline, individualized thresholds, and owner-realistic acceptance tests remain pending.  
**Implementation/cost:** Read-only SQL target/experiment snapshot; deterministic wellness context. No new Gemini call, database write, migration, release, or changes to existing logged nutrition.

## Decision: current comparable strength and urgent performance goals take precedence over a new calorie-cut review (PIQ-1.2, 2026-10-15)

**State:** Branch-validated, no production release.  
**Rationale:** Even a reliable multi-week maintenance/plateau trend and reasonable configured target do not prove recovery capacity is adequate to reduce energy intake further. Recent exact-exercise decline or an urgent, unmet performance objective creates a conflicting decision context.  
**Policy:** Gate *downward* calorie adjustment review on fresh moderate/high-confidence exact-exercise performance derived from canonical training progression, and on owner active goal status. Within the prior 14 completed days, four comparable exposures showing a recorded decline or lower but effort-confounded strength trend block the numeric cut. Time-sensitive, unmet active performance goals block it; ordinary on-track, paused or satisfied goals do not categorically prohibit weight loss. Missing/outdated performance or goal checks fail closed; old and provisional same-day decline signals cannot masquerade as current completed-day deterioration. Always preserve source observations and plateau estimates, produce an actionable nonnumeric plan-review explanation, never mutate calorie targets, and never assert an individualized nutrition prescription.

## Decision: version-check all calorie settings before drafting and surfacing numerical advice (PIQ-1.2, 2026-10-15)

**Status:** Branch-validated only.  
**Risk:** Concurrent calorie target edits, active goal-version/lifecycle changes and experiment scheduling can invalidate numerically plausible calorie advice while independent reads run.  
**Contract:** Bind current target identity/value/effective-on/updated-at, active goal version IDs and definitions, and relevant experiments in one read-only PostgreSQL revision fingerprint. Require matching revision both before and after dependent evidence loading, then recheck just before Coach persists a calorie adjustment/alternative. Missing, invalid, failed or changed verification removes those numerical action cards; raw observations, maintenance estimate and unrelated recommendations remain. This is *optimistic* consistency, not atomic persistence or a medical safety approval. Owner-target mutations still require their own fresh checks.  
**Validation:** Synthetic target/goal/experiment races plus real temporary-Postgres target insert/edit/rollback; no actual owner data, migration, or provider calls. Residual last-check-to-write and stale previously stored cards are tracked for the PIQ lifecycle phase.

## Decision: previously stored Coach calorie recommendations must not bypass current evidence (PIQ-1.2, 2026-10-15)

**Status:** Branch-validated; owner/prod release still blocked.  
**Policy:** Attach the qualifying target/goals/experiments revision fingerprint to every persisted calorie or dependent activity review. To present an accepted row as a due follow-up or to accept a new response by an old recommendation ID, require a valid original fingerprint matching a newly checked settings revision *and* live quality/safety-qualified Coach evidence still generating that recommendation fingerprint. Missing/legacy metadata, changed settings, now-ineligible evidence and failed reads always withhold numeric action. Filter saved rows before the three-visible-follow-up cap; leave unrelated training follow-ups, owner response memory and historical outcomes intact. Reject stale responses with a clear HTTP 409. Never auto-edit targets, erase outcome history or infer that a stale row is medically safe because the previous response was `do_this`.  
**Known gaps:** Optimistic final check is not atomic with SQL write; records beyond the due-row query cap and real end-to-end stale-ID API validation remain lifecycle follow-ups.

## Decision: Maintenance confidence is evidence-specific, never a clinical action score (PIQ-1.2, 2026-10-15)

**Branch-validated, not owner-accepted or deployed.**
- Show four independently derived dimensions: eligible full-day calorie coverage/source quality; comparable weigh-in count/span/conditions; plateau observation window/trend plus possible scale confounders; and whether the *proposed downward calorie review* is withheld, inapplicable, or eligible only for owner review.
- Verified nutrition days reflect a matching **owner report**, not objective proof every meal was captured. Do not call high-quality entries complete days without that report; preserve all logged observations.
- A high-confidence empirical maintenance **estimate** does not imply causal proof of a plateau, probability of disease, or approval of a lower calorie target. The floor heuristic cannot certify individual energy sufficiency, and no automatic target changes are authorized.
- Present the breakdown inside a collapsed accessible details element on Maintenance-backed Coach cards; keep ordinary training Coach cards compact. Neither add model spend nor new SQL/migrations.
- Branch CI and synthetic UI render tests prove representation under fixtures, not human comprehension on mobile. Owner accept/release tests remain mandatory.

## Decision: due Coach follow-ups must qualify in SQL before the visible limit, and accepted calorie revision must remain original (PIQ-1.2, 2026-10-15)

**Branch-validated; production release held.** A queue of obsolete calorie `do_this` follow-ups must never consume the first 24 scanned rows and hide later valid training follow-ups. Database filters numeric calorie and dependent activity cards by stored revision and *currently qualified draft fingerprint* before applying the visible `LIMIT 3`; an after-read failed settings check drops calorie rows and re-queries noncalorie candidates. Never interpret missing legacy metadata as current.

On the upsert path, preserve an already accepted numeric recommendation's **original decision-revision metadata** instead of relabeling it with fresh settings. Save/response-history is not a mutable endorsement of new decisions. Block a stale saved ID at the actual service SQL write boundary before owner-response mutation with an HTTP 409; preserve historical response/outcome memory.

Proved with 32 stale + four valid follow-ups, accepted ID under a real target edit, and ON CONFLICT against the disposable PostgreSQL migration chain. The write path is shared with the API, but an authenticated HTTP/browser E2E is still outstanding. No target, medical record, production database or migration was changed. Final check remains optimistic rather than transactional; historical card text mutability remains a separate lifecycle consideration.

## Decision: numerical calorie-change reviews must respect actual intake, estimate uncertainty and verified owner profile (PIQ-1.2, 2026-10-15)

**Status:** Branch-validated only; no owner acceptance or production release.  
**Contract:** Do not infer an appropriate lower-calorie target from a flat scale and an adequate number of meals alone. A downward numerical **review** requires valid current age/height context, no screening flag for under-18 or 65+ age, low/unknown adult BMI (BMI below 18.5), or unresolved self-reported clinical conditions. An unavailable or retrospective singleton profile is unknown, not reassurance. The proposed target must not fall below the low bound of the **uncertain empirical maintenance estimate**, exceed/equal current observed intake (which would not change what is actually being consumed), or disregard a >5% logged-over-target adherence gap. These are cautionary, heuristic screens—never measured basal expenditure, energy availability, individual caloric minimum, diagnosis, or proof that someone should cut calories.  
**Consistency:** Current Health Profile row participates in the existing target/goals/experiment settings revision hash, invalidating cached/saved calorie-action eligibility after profile edits. A failed consistency read cannot authorize numeric advice.  
**Privacy/cost:** Read existing profile only, preserve raw records and historical responses, use synthetic tests and disposable database. No new profile fields or user burden, no new model calls, no automatic target writes.  
**Unresolved:** Individualized energy needs, low energy availability without low BMI, pregnancy/lactation, medications and clinical risk, age-specific recommendations and sex-dependent context need PIQ-2/owner/qualified review; adult BMI above 18.5 and the profile having zero *reported* conditions are not safety certificates.

## Decision: final Coach decision quality needs multi-domain goldens and a fail-closed weekly-focus gate (PIQ-0.2 / PIQ-1.2, 2026-10-15)

**Branch validated; no production release.** Individual nutrition quality, weight maintenance, target/physiology, recovery, training and goal-version checks are insufficient if an upstream higher-ranked weekly-focus card can bypass them. Require all numerical calorie-review candidates—whether sourced from Maintenance, Weekly Coach focus or directly injected Goal Control—to match a current canonical Maintenance intervention marked `review_possible`, plus the recent-week verified nutrition threshold. An activity alternative cannot become an independent primary recommendation and is removed when its intake parent or safety decision is absent.

Evaluate the entire `snapshot → Maintenance → Goal Control → Coach → dependency filtering` path in a versioned, fully synthetic, no-provider 22-case regression registry. Goldens must assert **final action eligibility**, not imply that high-confidence weight/intake estimation medically authorizes a cut. When recorded comparable weight is already falling, the correct behavior is no further-cut action; an independent lower-range safety block may still report `blocked` without contradicting observed progress. Preserve descriptive facts, do not automatically edit targets, and prohibit unsafe weekly-focus priority inversion.

Automated decision goldens do **not** replace owner acceptance, clinician review, live schema verification, profile/low-energy-availability personalization, budgeted model answer evaluation, or the PIQ-0.2 human-scored rubric. The milestone is branch validation only, with full-phase acceptance still pending.

## Decision: weekly Training target is qualified strength *days*, not programmed session rows (PIQ-1.3, 2026-10-15)

**Branch validated, owner acceptance pending.** Authoritative Monday–Sunday weekly training credit comes from the existing performed-set evidence: at least three distinct strength exercises on one Health-local calendar day, unioned across eligible workout logs. Multiple sessions on one day earn **one qualified day**, not multiple target credits. All saved eligible session kinds can contribute, including ad-hoc/experimental workouts and sessions logged before the Training Plan was configured. Empty/warmup-only/non-strength work does not grant this credit. Routine rotation progress is separate and can differ.

**Source contract:** `server/training/plan-service.ts:getTrainingPlan().weekTraining` is authoritative for qualified days. Weekly Coach's read-only snapshot carries this value explicitly; Goal Control and Weekly Coach use one pure `buildTrainingProgressSummary()` to derive days remaining, preferred-day suggestions and user-facing labels. Recorded programmed session rows remain diagnostic and may be greater or less than qualified days; never subtract them from the weekly qualified-day target. Missing qualification is **unavailable**, not zero, and should never be replaced by an arbitrary programmed session count. Historical as-of snapshots must not count future session rows.

**UX:** Preferred weekdays, open days, planned rest and moved-away/moved-here are advisory. Do not imply a missed workout or force another session when today already qualified; report numeric **qualified days** and remaining **days**, not remaining **programmed sessions**. Weekly Coach's preceding seven completed days and Training Plan's current Monday–Sunday week are distinct windows and must be identified in explanations. Leave routine progression pointers and historical evidence unchanged.

**Limits:** This release does not validate in-app mutation refresh/cross-tab timing; PIQ-1.4 owns revalidation. SQL programmed rows are not evidence that every exercise in a programmed workout was finished. Owner/mobile tests and disposable PostgreSQL multi-log qualification/plan-integrity tests are further PIQ-1.3 acceptance gates. No migration, live owner record modification, automatic plan rewrite or production deploy.

## Decision: training calendar-day credit is sourced from performed-set SQL, not the number or timing of workout-session rows (PIQ-1.3, 2026-10-15)

**Status:** Isolated PostgreSQL branch-validated; owner/prod release blocked.

The same canonical SQL used by the Training Plan must extract qualifying, actually performed strength exercises, then feed a **distinct date plus exercise-ID** reducer. Two ad-hoc session rows on one date may jointly earn one day. Two complete routine attributions on another date may earn separate rotation credits but only one weekly day. Warmups without working evidence, future-as-of rows, and exercise entries stripped of their performed set never count. Creating a Training Plan midweek does not erase prior days of actually logged work. The configured weekly target must remain a **qualified-day target**; raw programmed session rows are distinct diagnostics.

Validate these distinctions with inserts and queries against the disposable full migration-chain PostgreSQL schema, rollback every fixture, and do not rely only on mocked exercise arrays. The result does not substitute for end-to-end plan API, edit-triggered client cache invalidation, owner/mobile, or production-schema tests. No new automatic schedule enforcement, billing, migration or owner-data edits.

## Decision: Coach rest-aware language must distinguish optional rest from an already-qualified preferred workout (PIQ-1.3, 2026-10-15)

**Status:** Fully branch-validated, not deployed or owner-accepted. A qualified calendar Training day may occur on the same date as a preferred workout, so `rest_day_on_track` in the legacy-compatible UI state is **not proof** it is a planned rest day. Never say the owner skipped/owes or should repeat an already-qualified workout. Render a preferred-day-already-qualified explanation and `Review next session` instead. Rest/flexible days are noncompulsory and must not be portrayed as missed-session penalties. Keep the canonical `qualifiedTrainingDays` count distinct from separate `completedProgrammedSessions` rows and historical Weekly Coach session facts.

Regression coverage includes two previously failing label-only Weekly Coach assertions adjusted by stable fact ID rather than weakening historical data isolation, and new Coach rest/flexible tests. Final [branch CI 38774301680](https://github.com/daurham/daurham-health/actions/runs/38774301680) 1,792 passed/20 skipped plus TS/ESLint/build. No owner data or production changes. Remaining user-visible freshness after workout mutations is PIQ-1.4.

## Decision: client Training and Coach freshness uses canonical mutation signals and generation-safe revalidation (PIQ-1.4, 2026-10-15)

**Branch-validated only; owner mobile/browser acceptance pending.** A persisted workout save/edit/delete/backdate and Training Plan version/override/move must invalidate mounted views deriving qualified weekly days, session history, routine rotation, Goal Control, Coach intelligence and Weekly Coach facts. Use the existing successful HTTP mutation classifier to emit a **no-PII local event** plus ephemeral same-origin BroadcastChannel hint, and subscribe once per mounted view. Focus/pageshow/visible restoration read the authoritative server result to catch another-device edits without frequent polling. Failed/preview/draft writes are not completion. Event deliveries coalesce, stop on unmount and do not rebroadcast from receivers.

Stale request handling: every affected view must cancel/ignore older concurrent responses. Do not let a delayed read overwrite fresher weekly credit or a newly generated Coach result. Do not wipe unsaved Training Plan or workout edit drafts during background revalidation. Weekly Coach GET refresh never silently calls a Gemini generation POST. Avoid new paid dependencies, schema changes or automatic owner target changes.

**Limitations:** Notification is not an atomic transactional source version, a cross-device push channel, or proof of multi-tab and authenticated Safari E2E. Concurrent manual edit conflicts still need explicit version handling and UI review; this is a bounded refetch checkpoint, not PIQ-1.4 acceptance.

## Decision: a stale saved-workout source must not silently overwrite another editor's changes (PIQ-1.4, 2026-10-15)

**Status:** Branch-validated but not deployed or owner accepted. A workout edited across tabs/devices must be compared against the exact saved editable content present when the owner began editing. Track an in-memory canonical session fingerprint of the date/name/session metadata, owner metrics, exercise identities and saved sets; ignore derived performance-best badges and mutable exercise-library labels when determining a conflicting workout change. Revalidation or a pre-save GET detecting changes **preserves** the unsaved draft, shows an accessible conflict warning and suspends Save. Only the owner's deliberate **discard draft / reload latest saved** action replaces their edits. Reject late stale GET results with request-generation checks. No implicit overwrite, data export or automatic merge.

**Safety limit:** A read-then-PATCH is a TOCTOU safeguard, not atomic conflict prevention. Require future server-side optimistic version compare within the destructive update transaction and a 409 with owner-controlled recovery before claiming true concurrent-edit protection. Do not call this human-tested without authenticated two-tab/mobile QA. No schema migration, data transfer, provider call or production release is authorized by this checkpoint.

## Decision: workout PATCH is conditioned on the saved PostgreSQL row version before replacing exercises (PIQ-1.4, 2026-10-15)

**Status:** Branch validated, production/owner acceptance pending. The existing in-browser source content fingerprint and last-moment GET cannot guarantee protection against another tab/device saving between that GET and PATCH. Saved workout detail must expose an opaque **PostgreSQL row edit revision**; PATCH without it returns HTTP 428 and a changed/deleted revision returns HTTP 409. Only the successful **CAS UPDATE ... WHERE id AND xmin** can authorize destructive child exercise deletion and replacement. Inside one Neon HTTP SQL batch transaction, a private per-save nonce gates every child delete/insert and is cleared before commit; a failed CAS commits no owner changes and preserves the original session, exercises and sets.

**Owner UX:** HTTP 409/428 does not discard the in-progress draft. The owner sees the explicit saved-source conflict warning, and must choose to reload/discard the draft intentionally. No automatic merge, no background model call, no paid service, no schema change.

**Limitations:** This token is an opaque session-row database version, not a permanent cross-schema content hash or protection against unrelated direct child-table edits that bypass the parent. The disposable PostgreSQL test verifies ordered transaction SQL and stale no-op, not a real Neon HTTP or simultaneous multi-client race. Authenticated Safari/browser UAT, version propagation on all mutation paths, and production schema verification remain required before release.

## Decision: workout deletion must be revision-checked before detaching transcription or deleting canonical evidence (PIQ-1.4, 2026-10-15)

**Status:** Branch validated, not owner/mobile accepted or deployed. A displayed workout's Delete action is permission only to delete the version actually reviewed by that owner, not unseen newer edits from another tab or device. `DELETE /api/training/sessions/:id` requires the opaque server-issued `expectedEditRevision` and fails closed with 428 when missing/malformed. A single Neon HTTP transaction first claims the current PostgreSQL row with `xmin` and a private nonce, then gates transcription detachment and parent deletion on that nonce. A failed CAS is 409 and leaves the source and child sets unchanged; the client preserves an active editing draft and surfaces explicit reload guidance. This is owner-initiated only; it never invokes a model or deletes data automatically. A temporary PostgreSQL migration-chain regression and full branch CI passed. Remaining boundaries: authenticated browser and Neon HTTP testing, possible direct child-table writes outside this service, and no production merge before the established release gate.


## Decision: Coach review is navigation; starting a change must be explicit (PIQ-1.5, 2026-10-15)

A "Review" CTA must never call a response endpoint or schedule an owner outcome check. Its `actionText` navigates to evidence/settings; exploring the existing Lab handoff similarly does not assert an experiment was created. Only the separately labeled "I started this" acknowledgement sends existing `do_this` and schedules its seven-day follow-up. Evidence-only recommendations never qualify as started interventions, even through an old API client. This is an immediate false-commitment P0 fix, **not** the eventual formal viewed/accepted/implemented state machine; legacy response semantics and previously accepted records need review before full PIQ-1.5 acceptance. No new migration or automatic owner health change.


## Decision: legacy Coach `do_this` is not proof an intervention began (PIQ-1.5, 2026-10-15)

The former "Review" action set `response_state=do_this` without an actual owner intervention. Going forward, explicitly tapping "I started this" is the only client path supplying `ownerStarted: true`, and the service rejects unmarked `do_this` requests. The flag persists in existing JSONB metadata; only flagged responses qualify for due outcome prompts, which are phrased as owner-reported starts. Preserve legacy rows unchanged pending explicit safe reconciliation rather than backfilling claims of action or deleting owner response history. No migration or live data mutation; owner QA is required.


## Decision: legacy review/experiment preview must not suppress current qualified advice (PIQ-1.5, 2026-10-15)

Old `do_this` responses lack proof that the owner initiated an intervention, and `turn_into_experiment` only recorded navigation before experiment creation. Preserve those historical rows but do not treat them as actionable suppression of freshly qualifying advice. `do_this` suppresses only when the stored `metadata.ownerStarted` flag is true; explicit owner `not_now` and `not_relevant` still suppress normally. The old experiment-conversion API input fails closed with a conflict; exploration is noncommittal, Lab remains experiment authority. Existing data is not rewritten, backfilled, or claimed as implementation. A genuinely started legacy action may reappear and require renewed owner acknowledgement, an explicit conservative trade-off. Phase acceptance requires CI and owner QA.


## Decision: stale Coach responses must be guarded in the SQL UPDATE (PIQ-1.5, 2026-10-15)

An owner reviewing Coach advice in multiple tabs must not lose one decision to an old tab's later response. Expose the exact server `response_at::text` as an opaque `responseAt` precondition and require `expectedResponseAt` in the response POST. A single conditional SQL UPDATE returns an updated row only if the original response version is still current; failure gives HTTP 409 and a UI refresh. No last-write-wins, no automatic owner action, and no migration. Recommendation GET/upsert must preserve the `ownerStarted` flag alongside its existing historical calorie-revision rule so browsing cannot erase an action's provenance. The timestamp is a response-event version, not a fingerprint of all source evidence; old responses to now-disqualified evidence require separate decision-context and supersession work.


## Decision: outcome feedback belongs to one verified owner-started response version (PIQ-1.5, 2026-10-15)

An outcome is not a mutable global label on a recommendation ID. It refers to one explicitly reported start and cannot survive a newer owner decision, a pending review window, a duplicate feedback submission, or a stale background view. Require an exact server response timestamp precondition and atomic SQL predicates `response_state='do_this'`, `metadata.ownerStarted=true`, `outcome_state IS NULL`, and due-date eligibility. A failed predicate is an HTTP 409 conflict, not implied success; missing precondition is HTTP 428. Preserve historical record unchanged until the owner makes a valid decision. CI and authenticated device/Neon QA remain mandatory prior to release.


## Decision: one active plateau lever per decision revision (PIQ-1.5, 2026-10-15)

Treat intake changes and activity changes in a plausible plateau as alternatives in the same `possible_plateau_response` group rather than independent action cards. Hide both while a genuine acknowledged start within the same current maintenance-decision revision is awaiting evaluation; allow unrelated training or evidence actions. Sequential competing starts must return 409 without altering saved responses. An old revision, legacy Review without `ownerStarted`, or assessed outcome does not constitute an active conflict. Keep all historical owner records; the surfacing operation remains advisory. The initial SQL anti-join does not guarantee mutual exclusion of simultaneous cross-row writes; a hard DB invariant is a separate release prerequisite.


## Decision: database uniqueness for mutually exclusive plateau starts (PIQ-1.5, 2026-10-15)

The response-level `NOT EXISTS` check is insufficient for two truly concurrent writes to distinct rows. Enforce one active `possible_plateau_response` option per exact maintenance decision revision with a PostgreSQL partial unique index, not an advisory read-only race check. Only explicitly acknowledged, unevaluated owner starts qualify; preserve older decisions and unrelated advice. Turn the index-specific 23505 into a 409 requiring refreshed Coach context. Other database errors propagate. Migration 0054 is written but **must not be applied in production** without backup, duplicate preflight, schema verification and owner release approval. Existing collisions are an explicit stop gate, never auto-repaired.


## Decision: non-calorie saved actions require live relevance, past starts remain historical (PIQ-1.5, 2026-10-15)

A stale non-calorie recommendation ID does not authorize a new `do_this`, `not_now`, or `not_relevant` response once its matching current kind/fingerprint disappears. Recompute the bounded current draft set before the write and fail with 409 instead of inventing ongoing relevance. Do not retrospectively delete a genuine `ownerStarted` record: outcome reporting for an earlier owner-started action is distinct from current advice, so explicitly label a no-longer-current non-calorie follow-up as historical rather than recommending renewed action. Calorie revisions retain stricter exclusion. No new schema or production writes.


## Decision: non-calorie recommendation ID is not its evidence version (PIQ-1.5, 2026-10-15)

Do not accept owner decisions against a recommendation solely because its stable ID and kind are still present. For non-calorie advice, compute an opaque owner-facing context revision from the current Health day/period, visible draft and relevant derived evidence; require exact matching client context on any response. Missing context is 428; stale context is 409, with a fresh Coach read and no automatic acknowledgement. Unrelated domain data should not invalidate Training unnecessarily. Existing numerical calorie revision logic remains separate. This is an optimistic derived-state check, not a raw event-ledger revision or serializable evidence lock, and must not be called complete canonical source versioning. No migration or production release is authorized.


## Decision: confidence belongs to a specific evidence or estimate, not the whole page (PIQ-1.6, 2026-10-15)

Treat cross-domain Goal Control confidence and Maintenance estimate confidence as separately scoped labels. When Coach uses a Maintenance intervention, use the estimate's own confidence as its evidence signal. Show maintenance range and supporting sample-quality counts behind a disclosure, while preserving the separate `calorieDecision` gate and withholding numeric estimates with insufficient evidence. Do not interpret broad Goal Control confidence as proof of precision or safety in a numerical calorie recommendation. No owner-data or provider changes.


## Decision: Training progression confidence is a claim about comparable exercise records (PIQ-1.6, 2026-10-15)

Use the matching primary Training progression series, identified by exact `training-progression:<exerciseId>`, as the source of confidence for Training recommendations, not a page-level Goal confidence. Treat absent exact evidence as unknown rather than borrowing another exercise's confidence through suffix matching. Show recorded comparable exposure count, window, recency, limitations, and rationale behind a disclosure without implying the user adhered to a recommendation. Keep numerical Maintenance confidence independent. A derived progression score is not proof that sleep, equipment and technique confounders have been captured. This is an evidence-explanation correction, not a new clinical or exercise prescription.


## Decision: nutrition entry coverage is not day-completeness confidence (PIQ-1.6, 2026-10-15)

For Coach nutrition-evidence advice, display source-window evidence from the existing Goal Control nutrition-quality gate: logged days, explicitly owner-confirmed complete/source-reliable days, estimate-heavy and unknown-quality days, and minimum thresholds. Classify an evidence-gap card as `limited` or `unknown` even when aggregate Goal confidence is high. Never convert a recorded entry, legacy import, missing day, or unverified day into proof of complete/zero intake. Explain the recent 7-day safety floor separately from the longer maintenance-estimation window. Keep advice observational and do not change canonical data or calorie-adjustment eligibility.


## Decision: absence of Recovery/Goal evidence is not a high-confidence signal (PIQ-1.6, 2026-10-15)

A request to fill a missing sleep, wellness or goal-evaluation gap cannot inherit global Goal Control `high` confidence. Mark missing-signal/unknown-goal evidence confidence as `unknown`, and generic cross-domain insufficiency as `limited`; show only the known limitation and actual Goal Control period. Do not infer a decline, failure, compliance, or need for new treatment from absent data. Preserve existing nutrition-quality confidence, independent Maintenance/Training attribution and all owner-start safeguards. Include displayed gap details in context revisions so old tabs cannot silently accept changed rationale.


## Decision: missing-signal Coach evidence uses actual source coverage, not inferred completion (PIQ-1.6, 2026-10-15)

For a missing sleep or wellness signal, expose only the measured observed/eligible dates and source provenance already provided by Health Intelligence, with its own dated source window. Do not substitute the weekly Goal Control dates for the observation period, equate recorded dates with complete tracking or a physiological outcome, or manufacture zero when coverage is unavailable. Keep missing-signal intervention confidence unknown; include these owner-visible facts in the non-calorie response revision so stale acknowledgements fail closed. No canonical health data or schema mutation.


## Decision: paired observational relationships must show their evidence scope (PIQ-1.6, 2026-10-15)

A high confidence grade computed from at least 14 paired dates is **not** high confidence that source coverage is complete, nor evidence that one signal causes another. Present the currently selected Goal Control relationships only as observational: report actual matched dates, paired sample count/screening minimum, time lag, source observation window, independent per-signal coverage and source provenance, with clearly stated confounder and missingness limits. If coverage details are unavailable, say so rather than substituting zeros or Goal Control's shorter weekly window. Do not make new prescriptions or change evidence eligibility and never treat a correlation as intervention proof.


## Decision: count-based grade is not statistical confidence in a correlation (PIQ-1.6, 2026-10-15)

Do not label the count-derived Health Intelligence relationship grade as general statistical certainty. Preserve the already-calculated original Spearman coefficient and magnitude separately from the count grade; disclose both next to source dates and matched-pair counts with explicit observational, significance and confounding limits. Missing or invalid coefficients are unavailable, not zero. No re-estimation, invented p-values, causal claims, or automatic owner action.


## Decision: repeated daily pairs are not independent relationship trials (PIQ-1.6, 2026-10-15)

Keep a Spearman correlation's existing signed coefficient and matched-pair-count grade explicitly separate from sampling independence or statistical confidence. For observational relationship explanations, disclose how original paired X-anchor dates cluster into contiguous calendar-day runs, using matched source dates without manufacturing missing observations. Deduplicate repeated anchors and do not count lagged target dates as new samples. Do not calculate or imply adjusted sample size, significance, causal impact or confidence improvement from these diagnostics. On missing/invalid dates, show unavailable. No changes to historical owner data, selection algorithm, canonical migrations or production.


## Decision: day-to-day sensitivity is descriptive, never an adjusted causal correlation (PIQ-1.6, 2026-10-15)

Keep the existing observed relationship selection, original Spearman coefficient and pair-count grade unchanged. For already-eligible matched observations, compute a separate first-difference Spearman only on strictly consecutive tracked X anchor dates with their original lagged Y values. Exclude calendar gaps; fail closed for missing/invalid/duplicated paired evidence; show unavailable for fewer than six transitions or constant changes. Present the change coefficient with strong limitations, not as a p-value, independent trial count, effective sample size, time-trend removal, clinical interpretation or proof of causality. No canonical or owner data are changed. Further statistical calibration requires a separately reviewed plan and owner acceptance.


## Decision: disclose correlation-screening selection, do not imply confirmation (PIQ-1.6, 2026-10-15)

Present each Goal Overview observational shortlist alongside its actual candidate-definition count, existing data/display qualification count, active-goal relevance count and displayed count. A selected relationship chosen from multiple registered pairs is not independently replicated or statistically significant merely because its sample count or rho is high. Make the actual selection rule clear (matched-pair grade/sample size, not maximizing rho). Do not add p-values, autocorrelation adjustments, revised thresholds or interpretation beyond observed provenance without a separately reviewed statistical plan. No canonical, owner, or production data changes.


## Decision: observational sign reversals deserve explicit caution, not action (PIQ-1.6, 2026-10-15)

Keep the original rank association and adjacent-day first-difference correlation separate, without modifying screening or decisions. When both coefficients have an actual nonzero finite sign and there are at least six measured consecutive changes, label whether their **signs** match or oppose. No sign claim for zero, invalid, unavailable or undersampled data. Sign differences can result from shared trends, noise or selection and do not demonstrate causation, effect size reliability, statistical significance or a reason to change a target. Reject impossible calendar dates when grouping matched daily observations. No new schema or automatic owner behavior.


## Decision: label paired-date opportunity separately from recorded completeness (PIQ-1.6, 2026-10-15)

An observational correlation's 16 recorded pairs are not 16 complete owner days. Expose a calendar-based denominator for X/Y date offsets that both fall inside the original signal window. The difference between calendar-alignable slots and actually paired eligible observations is **unpaired**, not medically missing, physiologically zero, or owner-confirmed logging failure; the paired subset can be systematically selected. Fail closed on duplicate/impossible/out-of-range/inconsistent pair metadata; retain the original registered association/ranking rather than inferring a new effect. No target changes, new model calls, synthetic canonical fills or production schema edits.


## Decision: relationship-date provenance requires real paired readings (PIQ-1.6, 2026-10-15)

A derived relationship's listed date pairs are not sufficient to claim matched observations. Before showing precise pair opportunity, clustering or adjacent-day sensitivity, confirm that every X and Y date resolves to a finite, key-correct, date-consistent signal within a unique daily frame. When this check fails, display unavailable instead of invented paired-day metrics or missing intake. Original derived correlation, count grade and ranking remain untouched. No production migration or owner records change.


## Decision: numerical observational coefficients require reproducible source readings (PIQ-1.6, 2026-10-15)

Citing valid paired dates with finite values is necessary but insufficient to substantiate a reported association: ranks can change after finite source edits. Reproduce the original Spearman rho from the exact same dated signal readings; display original rho/strength and precise date diagnostics only if the source statistic is reproducible within floating-point tolerance. Do not silently recompute a replacement, increase the sample grade, rerank the shortlist or claim causal/statistical validation. When provenance fails, label it historical/unverified and withhold the interpretation until the original intelligence snapshot is refreshed. Owner source records are never changed in this check.


## Decision: a verified relationship coefficient needs consistent interpretation labels (PIQ-1.6, 2026-10-15)

Reproducing Spearman rho is necessary but does not validate independently stored strength and direction labels. Require agreement with the canonical magnitude thresholds and the original near-zero neutral-direction rule before treating a selected observational association as currently verified. Inconsistency withholds exact rho, strength and paired-date diagnostics rather than guessing which field is right, modifying recorded evidence or recommending a target change. Preserve its historical place in existing selection accounting; do not claim statistical significance, causality, or a new calibration.


## Decision: aggregate coefficient verification must also recheck nutrition day eligibility (PIQ-1.6, 2026-10-15)

An unchanged measured nutrient number can be ineligible for an association after the owner edits or withdraws the corresponding complete-day confirmation. Downstream Goal Overview evidence interpretation must fail closed for such cited X/Y nutrition dates, independent of whether Spearman rho still reproduces. Preserve historical counts and source inspection; withhold numeric interpretation and confidence. No fabricated zero days, new statistics, or upstream re-ranking.


## Decision: complete nutrition days require independent source reliability for interpreted relationships (PIQ-1.6, 2026-10-15)

A complete food-day confirmation reports recording completeness, not accuracy of each ingredient's evidence. Goal Overview only verifies a currently displayed nutrition association when each cited nutrition observation remains confirmed complete, high-confidence and owner/reference/mixed-source provenanced; values/date/rank reproducibility alone is insufficient. Retain historical snapshot and original screening order, but withhold current precise correlation and pairing context on quality downgrade; show explanation. This is a read-time integrity gate, not re-estimation or owner behavior.


## Decision: a reproduced old relationship is not a current Health-date relationship (PIQ-1.6, 2026-10-15)

Withhold present-tense observational coefficient interpretation when loaded Health Intelligence snapshot `asOf` differs from Goal Control's requested health date, or its source window is impossible, reversed or in the future. Exact source-value/rank reproducibility alone does not establish current temporal provenance. Preserve original historical relationship, source detail links, screening counts and avoid fabricated zero/missing days. The guard does not claim atomicity with underlying DB events; production release remains separately gated.


## Decision: observational source frames must be calendar-coherent (PIQ-1.6, 2026-10-15)

Require exact loaded frame row continuity, expected 30-day source range, and truthful period day count before treating a cited, reproducible relationship coefficient as current. Missing, duplicated and reordered non-cited days invalidate the source context and pairing opportunity just as missing cited values do. Keep historical source links and original screening order, while suppressing precise interpretation; never infer zero logs or report canonical DB revision atomicity from this check.


## Decision: explain single-pair influence without statistical promises (PIQ-1.6, 2026-10-15)

A selected correlation can be reproducible yet depend on one matched observation. Goal Overview may describe a bounded 10–31-pair leave-one-out Spearman coefficient range only after present-tense source verification. Use the existing neutral sign boundary and disclose shifts; if deleting a pair yields a constant or undefined series, withhold the entire range instead of labeling it stable. This is **not** a confidence interval or a p-value, must not infer independence, and does not change upstream ranking or health recommendations. Authenticated owner QA, statistical calibration and upstream SQL revision coherence remain separate gates.


## Decision: progressive disclosure without suppressing safety caveats (PIQ-1.6, 2026-10-15)

An evidence explanation needs two reading depths: a concise observational statement plus truthful loaded-source verification/count-grade, and on demand the full screening/coverage/sensitivity diagnostics. Keep native disclosure panels closed by default so advanced statistics do not visually swamp the owner's immediate decision, while keeping stale/unverified warnings and source navigation immediately visible. Do not change verification gates, coefficients, ranking or interventions, and never use a collapsed detail to conceal an actionable safety warning.


## Decision: observational source coverage must reconcile with the loaded evidence (PIQ-1.6, 2026-10-15)

A reproducible numeric Spearman relationship does not authorize reporting inconsistent observed-day, eligible-day or source provenance claims. The two cited signals must have exactly one coverage record each; cross-check count and provenance metadata, label, grade and percentage against the same loaded day frame and withhold numeric interpretation when they disagree. Keep links and historical context. Never treat external excluded-observation counts as if the frame could verify excluded raw records, nor confuse these checks with source-event atomicity, significance or causality. No new migration.


## Decision: sex-specific physiology must be explicit owner context (PIQ-2.1, 2026-10-15)

Use nullable `health_profile.sex_for_physiology` (`male`, `female`, `other`) as a narrowly scoped optional input for relevant physiological reference ranges—not as gender identity, an inference from text, or a universal formula selection. Default NULL in every new deployment; never seed this owner's profile or fork from code. Settings supports correction and clearing; legacy clients that omit the field must retain its saved value. Share the verified owner-entered fact with current-date Ask Health evidence only, with provenance and a Settings link. When unset or no binary formula maps appropriately, use an individualized clinical evaluation/ask rather than inventing values. Do not alter formulas implicitly. Owner approval and migration 0055 are required for production.


## Decision: separate permanent birth-date backcasting from undated current profile measurements (PIQ-2.2, 2026-10-15)

DOB is an owner-entered lifetime fact; calendar age may be deterministically calculated for any selected date on/after DOB and no later than today, while explicitly citing that the saved birth date is known from the **current profile**, not proof of the historical record. The current singleton height has no effective date and must not be silently backdated. Ask Health includes birth date/derived age and today's height only when pertinent to the question. Current medications, clinical statuses, sex-reference settings and other mutable profile claims remain excluded from historical evidence pending a versioned owner-approved history model. This policy changes neither stored owner facts nor clinical calculations.


## Decision: priority belongs to an explicit owner-recorded goal event (PIQ-2.3, 2026-10-15)

Avoid hardcoding fat loss or inferring primary intent from existing targets, app usage, weigh-ins or weekly-focus rank. Version the owner's explicit selection of a canonical **active** goal using an effective Health date; archive/clear events preserve old intent without rewriting history. Keep individual goal targets and interventions unchanged until separately grounded prioritization work is accepted. Optimistic revision checks and PostgreSQL version uniqueness prevent stale-tab preference overwrites. Do not overstate this first measurable-goal selector as a complete mission/constraints editor.


## Decision: owner priority is a constrained tie-break, not a fabricated Health action (PIQ-2.3, 2026-10-15)

The effective-dated owner-selected primary goal may win **among existing, qualified due-goal review cards** when the default focus is already a goal review. It must not manufacture a focus from a goal label, re-rank a safety action outside this group, activate an archived/completed goal, or leak a future owner choice into earlier Health dates. Verify exact candidate identity and goal citation to prevent unrelated generic evidence from becoming owner-prioritized advice. Expose that prioritization in Goal Overview so it is inspectable. This is a small owner-intent integration, not a full mission or tradeoff policy; QA and production migrations remain gated.


## Decision: supplement schedule is not proof of supplement use (PIQ-2.4, 2026-10-15)

Ask Health must distinguish intended owner-saved dose and weekday cadence from an explicitly logged taken/skipped occurrence and an unrecorded unknown. Show the named supplement and effective-as-of lifecycle only when relevant to the question or an explicit saved-supplement inventory request; do not over-send sensitive owner context on unrelated questions. Cap the observed window at as-of, exclude future/historical contamination, identify self-report provenance, and do not infer causality, efficacy or adherence from a schedule. Existing canonical schedules and events remain the source of truth; never promote conversation-derived facts without owner confirmation.


## Decision: only conservative owner-saved supplement name aliases (PIQ-2.4, 2026-10-15)

To answer short named-regimen questions without guessing, select a saved supplement by its entire tokenized label or by a distinctive leading ingredient token of at least six characters. Generic leading product descriptors such as "vitamin", "complex" and "supplement" are not safe identifiers. Use token equality, not substring matching: creatine is not creatinine. If two saved formulations share an ingredient, disclose both instead of selecting a dose. This is relevant evidence retrieval, not alias knowledge from a model, evidence of ingestion, or proof of efficacy. No automatic owner-profile writes and no cross-date status extrapolation.


## PIQ-2.4: saved medications are selected by question, not indiscriminately (2026-10-15)

Use the existing owner-authenticated current-day profile as source truth, but do not attach every medication detail to unrelated Ask Health questions. Provide name-matched records, owner-requested lists/interactions, or active status only for relevant personal symptom context. Preserve inactive named records with their saved statuses, retain the recorded-vs-taken/causal distinction, and never claim medical interactions or adherence without validated evidence. No new schema, provider call or canonical write; CI and owner review are required before release.


## Decision: Ask Health must minimize and label owner allergy evidence (PIQ-2.4, 2026-10-15)

Allergy entries are current owner-entered statements, not medically verified diagnoses or historical reactions. Do not send them with unrelated general explanations or fitness questions. Include explicitly requested personal allergy inventory, a matching recorded allergen with an owner-specific question, or owner-directed food/drug/supplement exposure planning where safety context matters. Match saved substance names exactly at token boundaries rather than guessing synonyms; retain original record indices and nullable severity/reaction detail with precise provenance. Never infer an exposure or medication interaction from the record alone. No provider, database, owner profile or production edits.

## Decision: PIQ-4.1 starts with typed stool SAMPLE evidence, never a fabricated hydration/fiber correlation (2026-10-16)

**Status:** Engineering guardrail, development branch only. **Reason:** PIQ-3 already retrieves at most three owner-saved dated Bristol type samples and independently samples water/fiber. Treating those narrow examples as a whole-window incidence rate or owner-specific association would be statistically unjustified and could overstate clinical significance. **Implications:** A read-only derived evidence marker may describe recorded Bristol 1–2 among retrieved typed event references, explicit no-BM records and *displayed* same-day water/verified fiber presence, while prominently warning that absent logs are unknown and fluids are incomplete. It is question-scoped, not a diagnosis/causal or Coach-ranking signal. Full-window claims require future canonical event coverage, independent aligned/lagged windows and confounder checks. No production/owner DB access authorized. Auth URL preflight is a separate opt-in configuration check, never proof of session isolation.

## Decision: PIQ-4.1 only publishes a bounded, reconciled Bristol event-window count (2026-10-16)

**Status:** Tested development branch only. **Reason:** Three example bowel days cannot establish a whole-window hard-stool pattern, but reading and transmitting all event notes is unnecessary and increases privacy/cost exposure. **Contract:** At most 90 calendar days, selected or requested exactly; read grouped database counts by date and independently cross-check every recorded day with the canonical snapshot of event IDs and explicit no-movement state. If mismatched, missing, malformed, or over limit, return an explicit non-substantive unavailable signal instead of a partial metric. Hard Bristol 1–2 must be reported **out of typed saved events**, not all movements or calendar days. Missing days are unknown, today provisional, and total actual bowel activity cannot be established from self-logs. No causation or water/fiber correlation, no Coach ranking, no new tracker, no automatic clinical claim. Auth/data release gates and original owner controls remain unchanged.

## Decision: PIQ-4.1 0–2-day matches indicate screening eligibility, never a symptom correlation (2026-10-16)

**Status:** Tested development-only decision, no owner acceptance. **Why:** Prior generic intelligence relationships use bowel **counts**, which cannot replace actual saved Bristol stool consistency. Even observed fiber/water on a matching date may be due to logging gaps and lifestyle changes. **Policy:** New pair screens require full saved Bristol types, confirmed complete source-reliable whole-day fiber, prior/same-date exposure and exact selected window. Present three lags separately; do not count overlapping lags as independent replications. One 12-pair/4-week series can only be considered for *future quality/confounder review*; water-event totals remain incomplete fluid evidence and never qualify. The model gets a non-substantive readiness marker, never a new correlation coefficient or inference. No coaching/risk rank/automatic diet changes or live data test authorized. Next stage must assess qualified stool outcome coverage, owner reporting completeness, independent windows and confounders before considering associations.

## Decision: PIQ-4.1 contrast and context review gate before any cross-domain digestive interpretation (2026-10-16)

**Status:** Tested on engineering branch only (code `64ec979`, CI 38940866587); not owner or clinical acceptance. **Reason:** 12 matching days do not imply a change relationship when every event is equally hard or intake was flat. **Rule:** Require recorded between-date hard-Bristol proportion difference >=0.2 and owner-verified whole-day fiber difference >=2g before calling paired coverage a candidate for **later controlled review**. Any relevant explicitly saved daily context tag inside the preceding 0–2-day interval (travel, illness, medication/supplement change, unusually disturbed routine) or co-changing logged water prompts alternative-explanation review; no tag is not evidence of no confounders. These thresholds are engineering screening choices, not validated medical cutoffs. Do not compute/generate correlation coefficients, diagnoses, supplement/dehydration claims, treatment, automatic calorie cuts or Coach rankings. No new database reads or migrations beyond prior bounded aggregate.

## Decision: PIQ-4.1 ID-and-date reconciliation for correction safety (2026-10-16)

**Status:** Development-only, exact verified commit `f93240b`, CI 38942513613. **Why:** Daily count equality does not detect an event deleted and recreated with a new ID, nor an event reassigned between days. **Implementation:** Reuse max 512 saved UUID/date pairs from the canonical owner snapshot in server-bound SQL `LEFT JOIN unnest` with both ID and date equality. Select only aggregate counts, never event IDs/notes in model evidence. Require match count == current saved event count on every recorded date; on mismatch or bound failure suppress substantive Bristol summary and pairing. No schema change; no production reads or migrations. **Limit:** This is not a single repeatable-read snapshot across nutrition, supplements, context and bowel data, and does not establish stool-report completeness or medical cause. Owner acceptance pending; do not promote to main on CI alone.

## Decision: PIQ-4.1 optimistic recheck instead of falsely claiming a cross-table transaction (2026-10-16)

**Status:** Development-only, code `6b1a0ee`, exact CI 38944207255, no owner or clinical acceptance. **Design:** After verified saved bowel ID+calendar-date alignment, retrieve bounded, read-only revision-verified fiber source/value, dated water source/value and explicitly saved daily-context tag pairs. Compare to earlier loaded canonical facts in pure code and withhold derived digestive pairing if different. Preserve distinct bowel event evidence. Historical requests check only the requested period, not unrelated current/out-of-window tags. No private raw text, diagnosis, cause, supplementation attribution, calibration, Gemini call, mutation or deployment. **Known gap:** Even independently matching sequential queries do not prove one atomic snapshot; future transaction/read-revision semantics and whole-packet conflict handling must be owner-tested prior to promotion.

## Decision: Fail-closed packet-wide digestive context, preserve unrelated data (2026-10-16)

**Status:** Synthetic CI green `23a7513` [38945887236](https://github.com/daurham/daurham-health/actions/runs/38945887236), no clinical/owner acceptance. Source mismatch protection must apply to all routed intelligence and context summaries, not only new focused `digestive` evidence. Strip `nutrition.fiber_g`, `hydration.ml`, `bowel.count` relationships/baselines/coverage and source-linked context on cross-domain mismatch; keep independently unrelated information. If bowel ID+date cannot be verified, never present derived Bristol samples from stale records. When asked about **stool type or hard/loose stool symptoms**, generic relationships with `bowel.count` cannot support type-level claims even when their numeric screening is eligible. All filters precede packet fingerprint. No atomic multi-table source snapshot is claimed. READY preview metadata alone does not clear preview owner-data privacy/tenant/DB binding gate; production unchanged.

## Decision: Use a single statement for grouped digestive source recheck, but do not assert full request consistency (2026-10-16)

**Status:** Development-only code `3154c51`, CI 38946983236 green; owner acceptance pending. **Reason:** Previous `Promise.all` of three independent source queries could observe different read moments even in one final consistency check. **Rule:** Reuse canonical revision-confirmed fiber quality conditions and aggregate all three source sets inside one *read-only SELECT* with bounded date parameters. Require exactly one valid result with three JSON arrays and strict comparison to the earlier snapshot. No preview owner's raw notes/IDs sent to AI, and no inference based on missing/partial data. This does not provide repeatable-read across earlier canonical/bowel/sample/context queries, or a guarantee after return. **Runtime safety:** non-secret env metadata has preview and prod shared targets; preview branch is parent-data cloned. Do not use preview with a real owner login or make production changes until effective DB/Auth endpoints and tenant isolation have been proven with authorization. Main unchanged.

## Decision: READY preview is not an isolated personal-health-data QA environment (2026-10-16)

**Code:** `0c464a4`, CI 38948332648 green. Enforce fail-closed, read-only, non-secret combined DB/Auth/ref/owner/Neon-origin *preflight*; branch data cloned from production must not be used for authenticated testing irrespective of separate Neon compute or a READY Vercel deployment. An 'empty-origin' static pass only permits **further independent manual attestation**, not real records or QA authorization. Never echo endpoint names, credentials, user IDs or health data. Effective Auth session/tenant and runtime DB URL must be independently verified before isolated testing, and explicit owner approval plus recovery and human acceptance still precedes production merge.

## Decision: Screen recorded digestive coverage before considering future controlled review (2026-10-16)

**Status:** Development code `040abcf`, full CI 38949420254 green, no owner/clinical acceptance. **Problem:** 12 pairs across 4 calendar weeks may derive from one dense cluster with outliers, or separate high-density clusters with a long unknown reporting interval. **Rule:** To show an exclusively non-substantive `candidate_for_review`, require two non-overlapping 14-day date bins each with >=4 paired qualified stool dates, and no >7-day sequence of entirely unobserved bowel status *inside the active observed-status span*. Explicit no-movement day is NOT a stool type, outcome, a qualified pair, or an inferred result for other unknown days. The thresholds are engineering heuristics, not validated diary adherence or medical stool-frequency rules. Even passing does not imply complete capture, statistically independent time windows, personally relevant rho, cause, supplement side effect, diagnosis, or treatment. No change to preview environment, Neon/production, migrations, paid AI or Auth. Preview with copied owner data remains off limits.

## Decision: Unknown stool status is not an observed zero; current severe GI red flags skip private data (2026-10-16)

**Status:** Code `f3f8366` full CI 38951133116 green; no clinical/owner acceptance. Correctness: When the entire selected bowel window has **no explicitly saved bowel status**, evidence MUST use numeric null plus a transparent unknown-status statement, never report 0 hard stools as a confirmed outcome. A real saved zero-day status is different and may be shown as zero without claiming anything about missing dates. Safety: explicitly current first-person vomiting blood, severe abdominal pain or passing tarry stools triggers only existing deterministic immediate help (not AI/provider/budget/record lookup); the narrow text matcher cannot detect every dangerous symptom and does not diagnose. Historical/negative/educational examples are not current-emergency statements. Language like rabbit pellets is a stool consistency question and must not use generic bowel-frequency correlation as a stool-type claim. Production unchanged, cloned Neon preview unsafe for personal-data tests even when READY; release requires independently verified isolated DB/Auth, disposable owner, recovery, migration preflight, human testing and explicit owner approval.

## Decision: PIQ-4.2 may describe observed energy balance, but does not classify an owner plateau without authoritative decision inputs (2026-10-16)

**Exact validated commit:** `90304a1`, full CI 38954604831 green. Use the authoritative existing maintenance estimator and independent owner-completed, revision-checked nutrition whitelist. Do not equate source-quality entries with full-day intake; do not include today as a complete day. Descriptive robustness window 28/21/14 days has a precise date scope even when the estimator is insufficient, so old 90-day logs cannot inflate recent coverage. No duplicate weight regression or universal metabolic formula. The Ask Health-only snapshot has not independently verified an active goal/version, current configured target/revision, active experiments, comparably measured strength progression or individual clinical safety; therefore it MUST NOT emit a diagnosed/confirmed weight-loss plateau, quantitative intake adjustment, strength preserved statement, or permission to cut calories. Physical activity and ratings are context, not outcomes. Explicit historical-day/window questions must not be answered with a different trailing window; General Only remains owner-data-free. The code has no new DB access and is isolated from production. Complete PIQ-4.2 decision checks, clinical/owner QA and isolated environment gates before main release. Grand-project progress measured separately; no PIQ phase accepted.

## Decision: PIQ-4.2 may report high-quality sodium/carbohydrate log changes as candidate scale context, never cause or calorie advice (2026-10-16)

**Validated code:** `3398af6`, full CI 38957258842. Use only the canonical maintenance engine's source-ID-matched 3d vs prior-7d verified whole-day sodium/carb noise comparisons, never a parallel bespoke nutrient trend. A detected rise is plausible general short-term scale noise *context*, not evidence water retention occurred, fat loss stopped, an owner plateau exists, or intake should change. Never relay the weaker average logged-water/bowel frequency noise candidates as verified whole-day weight explanations. No qualifying nutrient comparison means unverified, NOT stable intake. Keep General Only no-owner, explicit historical interval gating, provisional-day exclusion, source identity and prior uncertainty; data quality/outcome separation survives model packet trimming and fingerprinting. Active weight-goal version, calorie target revision, experiment context and actual strength trend are still unverified and mandatory for consequential decisions. Developer branch only, production unchanged, owner QA blocked on copied Neon preview and other release gates.

## Decision: Exact historical day beats unrelated recent maintenance averages (2026-10-16)

**Status:** PIQ-4.2 code `0fc0f7d` CI 38958554527 green, owner acceptance pending. One explicitly requested valid historical date in a weight/calorie question can receive only its date-scoped source-qualified records. The maintenance estimator's 14/21/28-day descriptive balance is **never** substituted; a single verified meal total does not prove a deficit, and saved weight is not fat mass. If the day is outside the selected/as-of scope, provisional today, unverified, or unspecified/ambiguous, fail with neutral date coverage or absent observation, not a guessed zero or current average. Projection of an exact-day packet must remove unrelated general body/nutrition summaries and intelligence context before prompt and cache fingerprint, even in Deep Dive; broader date comparisons need a separate reviewed contract. Do not load owner DB, mutate target, infer calorie prescriptions, or call AI to test this branch. Production and migrations unchanged.

## Decision: Explicit historical windows must not inherit undated weight/intake facts (2026-10-16)

**Status:** `e1052b0` validated in [CI 38960264523](https://github.com/daurham/daurham-health/actions/runs/38960264523), development branch only. A named historical week/month/trailing period may quote only its exact inclusive window, whole-day revision/quality verified food logs and condition-comparable scale observations. Always divide calories by **qualified observed days**, never all days; no day without a log is known zero. Only show sampled weight delta with >=3 usual-condition weigh-ins across >=6d and sampling near both boundaries. Never cast a scale difference as fat loss or recompute current maintenance/calorie target for an older interval. Exclude all non-window packet evidence/summary; named invalid/out-of-range interval generates only limitation. No new owner-data, model, SQL, release, migration or medication/supplement advice is authorized. Preview isolation and recovery/owner QA remain blocked.

## Decision: PIQ-4.2 logged protein and workouts are context, not muscle-preservation proof (2026-10-16)

**Status:** Full CI green `77e398d` [38961425326](https://github.com/daurham/daurham-health/actions/runs/38961425326); no owner acceptance. Never use entry-level protein source quality, a self-reported workout date, or a protein target as independent evidence of adequate nutrition or preserved strength. Describe protein only for revision-gated owner-confirmed whole days with exact matching calorie/protein source IDs; report per-verified-date average only with >=4 qualified dates spanning >=7d (quality heuristic, not diet guideline). Training count requires positive saved source-identified sessions and says nothing about comparable exercise loads, recovery or muscle retention. Do not issue any calorie cuts or numerical protein prescriptions: current owner goal/target/experiment and strength safety have NOT been checked at this source boundary. Only a further carefully reviewed derived decision gate could change that; current preview holds cloned owner data and is not valid for authenticated QA. Prod unchanged.

## Decision: Disclose sampling distribution for historical intake means (2026-10-16)

**Status:** Branch `32b0c47`, full CI 38962196641 green, no owner sign-off. Pure history window screens whether owner-confirmed calorie days are 0, 1, sparse/clustered or distributed across fixed calendar halves (>=4 dates, >=50% of completed days, >=2 per half). An actual conditional mean across verified logged dates can be reported in all nonzero cases, but must not be characterized as the intake across unobserved dates or typical week/month if sparse. Even distributed verified dates cannot prove every meal was logged, a personal deficit, observed energy expenditure, weight plateau, fat-mass change, strength preservation or a new target. Date distribution alters selected packet/fingerprint so changed logs cannot silently retain a stale confidence qualifier. No mutation, migration, owner-data call or production promotion approved; preview data clone remains unsuitable for authenticated testing.


## Decision: Unchanged weight-series source is not enough for an interpretable deadline forecast (2026-10-16)

**Validated:** `ea60e94`, [CI 38986641308](https://github.com/daurham/daurham-health/actions/runs/38986641308), PIQ development only. Goal Control's mathematically available projections are NOT automatically fit for current Ask Health deadline guidance. For the *same* version-matched selected active weight goal and revision-checked canonical source, require 5 distinct eligible weight dates, >=14-day observed span, a <=14-day-old last date, >=2 weigh-ins in each observed-span half and no >21-day gap in its last-90-day projection evidence before describing current goal deadline status from that forecast. Invalid units/timezones/date/value fail closed. This is an explicitly conservative, non-clinical temporal sampling heuristic; it does not establish comparable measurement conditions, fat-loss velocity, adequacy, safe calorie targets, physiological urgency or permission to change interventions. Withhold goal target/deadline interpretation in current Ask Health cross-signal review for an `available` yet sampling-limited projection; preserve unrelated Goal Control math, historical/as-of safeguards, no-owner General Only, private data boundaries, and unchanged production.


## Decision: A withheld current selected weight goal must not re-enter Ask Health through the generic Goals builder (2026-10-16)

**Validated:** `5b92640`, [CI 38987049640](https://github.com/daurham/daurham-health/actions/runs/38987049640), PIQ development only. The specific current active primary weight goal's target state, deadline and projection may be represented in Ask Health only when the exact-version canonical review reports `canonical_reported`. Any version conflict, source change, missing attestation, historical sampling quality limitation or other non-reported state must suppress its standalone substantive generic Goals row. Use the privately loaded exact goal ID to preserve unrelated goals, but if the selected identity is unknown conservatively withhold body-metric goal rows in current focused weight answers. Do not leak the private ID through new evidence, logs or confidence badges. When unfocused or successfully canonical-reported, existing Goals behavior remains; no goal, nutrition target or Training change is authorized. Owner acceptance/isolated preview environment remain outstanding.


## Decision: Current weight-goal projections require explicitly comparable source sessions (2026-10-16)

**Validated:** `22f2a28`, [GitHub Actions 38987664432](https://github.com/daurham/daurham-health/actions/runs/38987664432), PIQ development only. A stable/accurate weight-series revision plus sufficient date distribution does NOT establish comparable measurements. Reuse existing `body_measurement_sessions.comparability` directly from canonical Goal Control's full history SELECT, with values included in the private source fingerprint. For an `available` current Goal Control projection, Ask Health may describe the selected weight goal's target/deadline from that forecast only if every date-eligible row in the last 90 days is explicitly `usual`; any `unknown`, `different_conditions` or null condition withholds that selected goal's report as `projection_conditions_unverified`. An absent SQL field is invalid source integrity, not equivalent to a stored unknown condition. Do not discard out-of-window source fingerprints, invent comparability for historical rows or change Goal Control's projection calculation. Such session flags are owner/source-reported and never proof of standardized timing, physiological trend accuracy, maintenance calories, fat change, health/safety suitability or automatic target adjustment. This work has no schema/data/production operations or model spend.


## Decision: Gate latest selected weight-goal report on recorded point conditions (2026-10-16)

**Validated** commit `604e00f` with [CI run 38989125463](https://github.com/daurham/daurham-health/actions/runs/38989125463). Existing full-history usual-condition checks only protect available projections, not a target report calculated from the latest bodyweight point when no projection is offered. Extend the **shared** canonical Goal Control as-of point SQL and private identity fingerprint with the saved measurement session `comparability` label. Current focused Ask Health may repeat the selected goal target/deadline as a qualified report only when the independent late recheck identifies the **same** point revision and reports `usual`. A present unknown/different/null-label point causes `measurement_conditions_unverified`; a missing point remains unknown; invalid/missing query metadata is unavailable, never implicitly usual; source-change/revision mismatch takes priority. Cross-signal evidence stays non-actionable and does not copy IDs/hashes/weight values. Not a clinical standard, proof of bodily change or permission to adjust calories. No migration, new SQL call, owner health record inspection, production promotion, or model invocation.


## Decision: Disclose weight-window sampling before discussing logged nutrient shifts (2026-10-16)

**Validated code:** `9b4455c`, [CI 38990602182](https://github.com/daurham/daurham-health/actions/runs/38990602182) green. Sodium/carb log shifts independently qualify through the maintenance engine only on source-verified owner-complete dates, but they do not qualify an owner's *scale response* without contemporaneous usual-condition weigh-ins. Keep the shift as a food-log observation and include a separate, pure 3-day/7-day source-identifiable weigh-in coverage screen: at least two recent and three baseline usual-condition weigh-ins, complete ten-day snapshot boundaries, no identified differing-condition point; labels are `sampled_both_windows`, `sparse_or_mixed`, `no_qualified_weight`. Even high sampling coverage does NOT authorize personal association, retained water, fat gain, caloric prescriptions or causal statements. Recorded water and step days (identified sources only) may be counted, but absence != zero and logging does not verify complete-day fluid or total activity. Keep current-day inputs excluded. No new DB query, migration, paid model, owner PHI, or main/production release. A single invalid record is omitted without invalidating otherwise adequate dates; mixed-condition saved records block normal comparability.


## Decision: Date-only food totals do not establish when same-day weight was measured (2026-10-16)

**Validated SHA** `7158176d`, [GitHub Actions 38991150952](https://github.com/daurham/daurham-health/actions/runs/38991150952) complete green, PIQ development branch only. Previously qualified sodium/carb shifts are verified **daily aggregates** across source-matched owner-complete food days; there is no certified nutrient exposure onset or meal time relative to a same-day weigh-in. Do not describe a same-day scale result as having *followed* that day's food log. Use a separate date-only screen to distinguish (1) a source-identified usual-condition weigh-in on a **strictly later** Health calendar date than the last qualified food-log day; (2) no later usable scale record; (3) mixed/sparse weights; (4) invalid/unverified dates; (5) no qualified nutrient comparison. Every state is observational-only: a later record does not imply scale mass moved, water was retained, nutrients caused a change, or calorie adjustment is safe. Never pass raw source IDs/weights or private timestamps in this new status; keep no live owner health access, new SQL, migration or production promotion. Preserve historical, General Only and selected-goal integrity boundaries.


## Decision: Prevent current Nutrition corrections from surviving focused PIQ-4.2 evidence assembly (2026-10-16)

**Validated** `a5e9803` with [Actions 38991752879](https://github.com/daurham/daurham-health/actions/runs/38991752879), PIQ development only. An early revision-verified food-day whitelist is not reliable if records are corrected before the multi-source Ask Health response is assembled. For current personalized weight/energy questions, permit ONE final bounded read reusing the canonical Nutrition confirmed-day SQL, extended to verify sodium, carbohydrates and protein in addition to calories, source entry IDs and exclusion/revision/confirmation rules. A same-ID same-calorie nutrient correction after another confirmation must change the status and WITHHOLD all derived focused weight/energy/nutrient evidence, not silently reinterpret stale data. Do not claim atomic transaction-level source consistency: other independent domain revisions remain unverified. The activity intelligence read must preserve its real stored summary ID to allow truthful source-identified step-log counting; a source ID is NOT completeness nor a revision fingerprint. Owner health records, patient-specific inference, provider costs, schema changes and production/main promotion remain outside this task.


## Decision: Require final effective weight and Activity agreement before focused scale reasoning (2026-10-16)

**Validated:** code `8c2ee5d`, [Actions 38992402192](https://github.com/daurham/daurham-health/actions/runs/38992402192) full green, PIQ development branch only. The initial intelligence read and later current-goal source checks were not enough to guarantee that weight or Activity summary evidence was unchanged during a multi-source personalized answer. Run two additional read-only canonical queries at the end of eligible current-day focused weight/energy assembly; compare source-identified effective calendar-day weight/Activity signals with the first intelligence snapshot, including values/units/identity/provenance/condition, matching the original last-point-per-day aggregation and honoring current excluded body rows. On mismatch/error, withhold *all* focused weight/energy reasoning through the existing non-substantive source-consistency boundary. Keep the shared late Nutrition gate; neither source gate is an atomic transaction or proof of whole-day activity, fat loss, muscle preservation or a safe caloric intervention. Generic packet Activity/Context and owner-facing other domains are not covered by this gate, so do not imply total-source attestation. No migration, production promotion or model API spend.


## Decision: Late Context equality plus generic packet source-conflict precedence (2026-10-16)

**Validated:** exact code `e49f308c`, [CI run 38995054252](https://github.com/daurham/daurham-health/actions/runs/38995054252) fully green, PIQ development branch only. A Context tag/note summary cannot be presumed current after a cross-domain retrieval sequence. Recheck **the full original saved Context record set** at packet assembly for eligible current-day personalized context-bearing lenses; count-only or same-date comparisons are insufficient. IDs, dates, exact notes, tag sets and saved revision timestamps must agree; failure emits privacy-safe `context.source_consistency` evidence and withholds original Context notes/counts. Also, a failed current-focused Nutrition or weight/Activity source recheck must dominate earlier-read generic Body, Nutrition, Activity, Goals and Intelligence evidence plus intelligence context summaries; do not allow generic packet fallbacks to revive stale claims. Other independently sourced evidence can remain visible without implying it was newly revision-locked. No transactional read, causal inference, diagnosis, calorie change, owner data access, migration or production promotion. Context recheck adds one bounded Context service read to eligible requests.


## Decision: Named historical figures need their own late evidence recheck (2026-10-16)

**Validated** code `6973cbea`, [Actions 39000152407](https://github.com/daurham/daurham-health/actions/runs/39000152407) complete green, PIQ development branch only. Revision-checked Nutrition in the initial snapshot and current-day focused source checks do not prove that explicitly selected historical weight or food observations were unchanged when a later model answer is prepared. For in-scope selected day/window (within existing 90d parser capability), independently re-read only the bounded historical source dates using the same current canonical Nutrition eligibility/revision/exclusion rules and weight identity/unit/condition/quality conversion. Count added or newly owner-confirmed eligible days as changes rather than reporting stale coverage. On any mismatch or unavailable source, WITHHOLD the historical intake and weight point/comparison/sampling assertions and show one privacy-safe non-substantive boundary. Do not silently substitute latest weight/current goal or claim a historical database version. Exclude provisional today. Two more bounded local DB reads, never paid provider calls, schema modifications, behavioral intervention or production promotion.


## Decision: Cross-read disagreement in generic Activity is not an owner health fact (2026-10-16)

**Validated:** `839cac18`, [full green CI 39000625346](https://github.com/daurham/daurham-health/actions/runs/39000625346), PIQ development branch only. The two already loaded canonical Activity representations are independent read moments, so neither may be selected arbitrarily if they disagree on an observable date/value. Before exposing generic `activity.*` and shared `intelligence.*`, compare the overlap of the requested date range, timezone, saved metrics and source-identified frame. Missing values remain unknown and an explicitly logged zero remains a real observation. Any mismatch fails closed with a neutral boundary and filters all Activity-tied shared Intelligence relationships (including cross-domain). The original current focused weight/energy recheck is still required for genuine late revision consistency; dual-read equality is not proof a source cannot change after both reads. Avoid additional SQL/model cost, causal activity claims, live health data access and production changes. Keep historical/general-only boundaries intact.


## Decision: Generic Sleep cross-read mismatch must suppress dependent claims (2026-10-16)

**Validated** `c790488`, [CI 39001090617](https://github.com/daurham/daurham-health/actions/runs/39001090617) full pass. Separate canonical nightly Summary reads for Sleep Progress and shared Intelligence can disagree mid-request; the app must not arbitrarily prefer one for personalized sleep duration, Sleep-baseline or linked cross-domain relationship claims. Use the already loaded values **without an additional database round trip**, require matching nightly summary row ID, Health-calendar date/timezone, analysis eligibility, total minutes and frame unit/provenance. Suppress generic Sleep and Sleep-operand Intelligence on mismatch/unavailable source and emit a neutral non-substantive boundary. Preserve sleep-stage analysis rules and existing stage data separately; comparison does not attest stage revisions, source-arbitration history or overnight vitals. No automatic health decision, provider call, migration, real owner record access, production release or phase acceptance.

## Decision: Exact full-CI workflow and Vercel project identity are required before preview metadata is consistent (2026-10-16)

A successful Actions run on the right SHA is insufficient if it belongs to
a subset workflow such as `piq1-postgres.yml`. The PIQ preview gate must
require GitHub-provided identity of the full
`.github/workflows/validation.yml` workflow and exact commit success.
Likewise, a READY Vercel deployment matching branch/SHA in a different
Vercel project is not evidence for the intended Health preview; require
project ID equality from independent provider metadata. Missing evidence
fails closed. These narrow checks are synthetic/read-only and cannot
attest runtime DB/Auth separation, empty data, migrations or owner approval.

## Decision: General Only suggested questions are answer claims for owner-identity safety (2026-10-16)

Model-generated `followUps` can assert unsupported user facts just as
answer blocks can. Treat them as first-class text for the narrow
personal-record hallucination screen in General Only; withhold poisoned
cached suggestions without a new provider request and reject fresh
unsupported outputs through the existing bounded validation/retry path.
Restrict new nonnumeric detection to direct affirmative personal-state
claims so hypothetical general education remains useful. This regex
guard does not establish medical accuracy and does not inspect owner data.
