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
**Reason:** `ai_usage` records reservations. Both features use `AI_MONTHLY_BUDGET_USD`. The reserve query does not filter by `request_type`, so the rate limit is shared. Nutrition Gemini is documented as outside this ledger.  
**Implications:** Do not add a second monthly wallet for Weekly Coach. Do not put cache hits on the ledger. `AI_WARNING_BUDGET_USD` does not block a call.

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

## Decision: Manual ledger rows are historical

**Status:** Active  
**Reason:** Implementation notes in this repo say not to rewrite older design-manual ledger rows or older “not implemented” sentences inside past amendments. New work adds a new row and a new amendment.  
**Implications:** A status correction belongs in the live status paragraph and a new ledger row, not in an older row.
