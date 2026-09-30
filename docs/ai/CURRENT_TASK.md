# Current task

## V2-H3 — XP / Reward Wallet

### Objective

Add a deterministic, auditable game-economy layer on top of the existing Coach lifecycle.

Health facts remain canonical Health facts. They do not mint XP directly. XP is awarded only when an existing Coach task reaches a qualifying completed state, using the task's already-frozen `reward_band`.

H3 introduces:

- append-only XP accounting
- Lifetime XP
- Spendable XP
- versioned Coach-task XP awards
- deterministic backfill for already-completed Coach tasks
- owner-created reward items
- reward purchases
- append-only refunds
- a Rewards / Wallet owner UI
- compact XP presentation on Coach

Do not add levels, badges, streaks, loot boxes, theme unlocks, random rewards, paid providers, background jobs, or AI behavior in H3.

H4 remains the place for progression/theme polish built on top of Lifetime XP.

---

## Product rules

### XP source boundary

Canonical Health writes do **not** award XP by themselves.

Examples that do not directly mint XP:

- logging a workout
- adding Nutrition
- recording Body data
- reaching a step count
- taking a supplement
- creating or completing a Goal
- creating an Experiment
- saving a Benchmark result
- snoozing/opening Coach or Lab items

Those facts may satisfy an existing Coach task. The qualifying Coach completion is the reward event.

Qualifying source:

- `coach_tasks.status = 'completed'`

Non-qualifying states award zero XP:

- `offered`
- `active`
- `passed`
- `failed`
- `expired`

An accepted Stretch Quest does not award until it completes.

A self-reported Daily Quest may award XP when that Coach task legitimately reaches `completed`. H3 does not create an additional honesty/verification score.

### XP calibration

Create one deterministic versioned rule, named in code/docs as `xp-rule-v1`.

Map the existing frozen Coach `reward_band` to XP:

| reward_band | XP |
| --- | ---: |
| routine | 10 |
| standard | 25 |
| weekly | 75 |
| stretch | 100 |

Historical ledger entries preserve the rule version and awarded amount. A later calibration change must not rewrite old awards.

The source of truth for the amount is the frozen task `reward_band`, not a title, domain, current Goal, or current Health state.

### Stacked completion

One canonical action may legitimately complete multiple distinct Coach commitments.

Example: one workout may complete a Daily Quest, finish a Weekly Focus, and complete an accepted Stretch Quest.

If each Coach task independently reaches `completed`, each task receives its own one-time XP award.

Do not deduplicate across different task ids merely because their underlying Health evidence overlaps.

### No clawback for later Health correction

Once a Coach task legitimately reached `completed` and its XP award exists, later correction/deletion of the underlying canonical Health evidence does not remove or reverse the award.

Rationale:

- historical Coach completion already freezes its evidence/provenance
- Health data must remain freely correctable
- the user must not be incentivized to preserve an incorrect Health row to avoid losing currency

H3 must never mutate a past Coach completion in order to reconcile the wallet.

No negative penalty exists for passing, failing, expiry, deletion, or later Health correction.

---

## Accounting semantics

### Lifetime XP

Lifetime XP is:

> the sum of all XP `award` ledger entries

Purchases do not lower Lifetime XP.

Refunds do not increase Lifetime XP.

### Spendable XP

Spendable XP is:

> awards - purchases + refunds

Spendable XP must never become negative through a normal purchase.

No cached balance column is the authority. Derive balances from the ledger.

### Ledger immutability

The XP ledger is append-only.

Application code must not update or delete historical ledger entries.

Corrections use new compensating entries where H3 defines one. In H3 the only compensating flow is a refund of a reward purchase.

Do not add an arbitrary/manual XP adjustment UI.

---

## Database migration

Add migration:

`0039_xp_reward_wallet.sql`

Repository migration head becomes 0039.

### Table: `xp_ledger`

Add an append-only owner ledger with at least:

- UUID id
- entry kind
- positive integer XP amount
- source kind
- stable source id
- idempotency key
- rule version when relevant
- occurrence timestamp
- JSON metadata/evidence snapshot
- created timestamp

Supported H3 entry kinds:

- `award`
- `purchase`
- `refund`

Supported H3 source kinds:

- `coach_task`
- `reward_purchase`

Required semantics:

- `amount_xp > 0`
- idempotency key is present and globally unique
- one Coach task can receive at most one `award`
- one reward purchase can receive at most one `purchase` ledger debit
- one reward purchase can receive at most one `refund`
- source shape is constrained so Coach awards point to `coach_task` and purchase/refund entries point to `reward_purchase`
- no cascade from a source table may erase ledger history

Prefer loose source identity/provenance over a cascading foreign key when a foreign key would make ledger history deletable.

Store enough award metadata to audit the historical decision without rereading mutable presentation fields. At minimum preserve:

- Coach task id
- task kind
- reward band
- task title
- completion timestamp
- XP rule version

Do not store a duplicate canonical Health measurement as a new authority. Existing Coach completion evidence remains the Health provenance authority.

### Table: `reward_items`

Owner-created reward catalog.

At minimum:

- UUID id
- name
- positive integer `cost_xp`
- optional note
- active/archive state
- created timestamp
- updated timestamp

Rules:

- name is trimmed/non-empty and bounded
- cost must be a positive whole number
- archive instead of physical delete
- archived rewards cannot be newly purchased
- editing name/cost/note affects future purchases only
- editing a catalog item must never rewrite historical purchase snapshots

No seeded/default rewards are required.

### Table: `reward_purchases`

Immutable purchase snapshot/history.

At minimum:

- UUID id
- reward item id as historical provenance if useful
- snapshot reward name
- snapshot cost XP
- purchase idempotency key / client submission identity
- purchased timestamp
- created timestamp

A purchase snapshot must survive later catalog edit/archive.

Do not physically delete purchases.

Refund state should be derived from the append-only refund ledger entry rather than by deleting/reversing the purchase.

If a convenience `refunded_at` column is proposed, do not make it the accounting authority; the ledger remains authoritative. Prefer deriving refunded status from the unique refund entry.

### Database concurrency

A reward purchase must be atomic against Spendable XP.

Two concurrent requests must not both spend the same available balance.

Use a PostgreSQL-safe serialization mechanism for the one-owner wallet, such as a transaction-scoped advisory lock or an equivalent atomic database strategy.

Do not rely only on frontend button disabling.

The transaction must:

1. serialize competing wallet purchases
2. re-read the current ledger-derived Spendable XP
3. confirm the active reward item and frozen current cost
4. reject insufficient balance without creating a purchase
5. create the purchase snapshot
6. append the purchase ledger entry exactly once

A retry with the same idempotency identity must return/resolve to the same purchase and must not charge twice.

---

## Award issuance

### Future Coach completions

Integrate XP issuance with the existing Coach lifecycle rather than creating another completion authority.

When a Coach task transitions to `completed`:

- determine XP from its frozen `reward_band`
- append one `award` entry
- use `xp-rule-v1`
- preserve source task identity and completion snapshot
- be idempotent under retries/reloads/concurrent reconciliation

Where practical, append the award in the same database transaction as the winning Coach completion transition.

Also provide idempotent reward reconciliation so a completed Coach task cannot remain permanently unpaid if an earlier process was interrupted after the Coach completion committed.

Reward reconciliation may insert missing awards. It must never remove existing awards or claw them back.

### Existing completed Coach tasks

Backfill every existing H2A/H2B completed Coach task that has a supported reward band.

The owner must not start H3 at zero merely because XP was added later.

Backfill amount is based on the task's frozen `reward_band` using `xp-rule-v1`.

Backfill must be idempotent and safe if run more than once.

Historical tasks in non-completed states receive no award.

Prefer migration-time deterministic backfill and/or a self-healing server reconciliation path. The final implementation must guarantee exactly one award per completed Coach task.

---

## Domain authority

Add shared deterministic reward domain code under `src/domain/` for:

- XP rule version
- reward-band → XP mapping
- wallet balance derivation
- ledger schemas/types
- reward item schemas/types
- reward purchase schemas/types
- presentation-safe activity labels where appropriate

Do not duplicate XP math independently in React and the server.

The server owns persistence and concurrency. Shared domain code owns deterministic interpretation.

---

## Server/API

Use the existing single Vercel function and `server/dispatch.ts`.

All reward/wallet routes are owner-only via the existing owner auth contract. Machine ingest tokens do not authorize them.

A compact API shape is acceptable; target behavior is:

### Wallet read

`GET /api/rewards`

Returns enough for the Rewards screen:

- Lifetime XP
- Spendable XP
- active reward items
- recent ledger activity
- purchase history or a bounded recent purchase list
- refunded state derived from ledger
- rule/version information only if useful to the client

The read path may perform idempotent missing-award reconciliation before returning balances.

### Reward item CRUD

Support owner operations to:

- create reward
- edit reward name/cost/note
- archive reward

Suggested paths:

- `POST /api/rewards/items`
- `PATCH /api/rewards/items/:id`
- `DELETE /api/rewards/items/:id` as archive semantics

Wrong methods return 405.

### Purchase

Support:

`POST /api/rewards/purchases`

Input includes:

- reward item id
- client-generated idempotency key / submission UUID

Behavior:

- active item required
- current cost is frozen into purchase
- insufficient Spendable XP returns a deterministic 409-class error/code
- success creates exactly one purchase debit

### Refund

Support an explicit mutation such as:

`POST /api/rewards/purchases/:id/refund`

Behavior:

- purchase must exist
- refund exactly once
- append `refund` ledger entry for the historical purchase cost
- never modify Lifetime XP
- a repeated identical refund request is idempotent
- refund remains allowed even if the reward item is now archived/edited because purchase snapshot is authority

Do not overload DELETE to mean refund.

### Errors

Use public, bounded error messages/codes consistent with the existing API conventions.

Useful deterministic cases include:

- reward not found
- reward archived
- insufficient XP
- purchase not found
- already refunded / idempotent refund result
- invalid XP cost

Do not expose SQL or secrets.

---

## Rewards UI

Add owner route:

`/rewards`

Do not add Rewards as a new primary navigation tab.

The page should be mobile-first and fit the existing Health visual language.

### Wallet header

Prominently show:

- Spendable XP as the primary wallet number
- Lifetime XP as the historical progression number

Clarify their difference without a long explanation.

Example semantic hierarchy:

- `500 XP available`
- `1,400 lifetime XP`

Do not animate/count-up Health/game balances in a way that conflicts with the app's reduced-motion contract.

### Reward shop

Show active owner rewards with:

- name
- XP price
- optional note
- purchase affordance

Support:

- Add reward
- Edit reward
- Archive reward
- Purchase

An unaffordable reward remains visible but cannot create an overdraft. The UI should clearly show that more XP is needed.

Purchase should ask for an intentional confirmation before spending XP.

### Purchase/refund UX

After a purchase:

- Spendable XP updates immediately from server response/reload
- show the exact purchased reward and XP cost

Provide an explicit refund/undo action from recent purchase/history rather than silently deleting the purchase.

Refund wording should make clear that XP returns to Spendable XP and does not change Lifetime XP.

### Activity/history

Show a bounded recent activity feed with readable entries such as:

- `+25 XP · Complete a training session`
- `+100 XP · Stretch: Barbell Bench Press`
- `−300 XP · Takeout night`
- `+300 XP · Refund: Takeout night`

Do not rely on color alone for positive/negative meaning.

---

## Coach integration

Coach already freezes `reward_band`; H3 makes that visible.

For active/offered Coach tasks, show the deterministic reward amount derived from `reward_band`, e.g.:

- `+25 XP`
- `+100 XP`

For a newly completed acknowledgement, show the awarded XP where the existing UI naturally supports it.

Add a compact route/link to `/rewards` from the Coach/Today experience. A small Spendable XP balance is acceptable if it does not crowd out primary Coach attention.

Do not turn Wallet into a competing primary card that breaks H2C's one-primary-attention hierarchy.

Do not alter Coach candidate selection, task difficulty, Stretch eligibility, or completion rules for the sake of XP.

---

## Backup and portable export

H3 adds durable owner data, so update backup/export inventory and round-trip coverage.

Include in full backup:

- `xp_ledger`
- `reward_items`
- `reward_purchases`

Include the same wallet/reward state in portable owner export unless the existing portable-format invariants make a specific field operational-only.

The user's earned/spent XP history and reward catalog are owner data, not an operational provider ledger like `ai_usage`.

Restore must preserve:

- exact XP amounts
- rule versions
- source identity
- purchase snapshots
- refund identity
- timestamps
- item archive state

Derived balances are not stored/exported separately.

Bump backup schema head to 0039.

---

## Demo

The public demo remains anonymous, synthetic, read-only, and provider-free.

If Rewards is exposed in demo routing, use synthetic in-memory/demo data only.

The demo must never call owner reward APIs or mutate a wallet.

It is acceptable to keep Rewards owner-only in H3 if adding a meaningful demo surface would create disproportionate complexity, provided existing demo routes do not break.

---

## Security / provider / runtime constraints

Preserve all current project invariants:

- one owner
- single Vercel function
- Neon HTTP driver in production
- America/Phoenix Health calendar
- no new paid service
- no Gemini/Home-AI/Europe PMC request
- no new environment variable
- no background scheduler
- no polling loop
- no machine ingest authorization for wallet APIs

XP is deterministic application state, not AI-generated content.

---

## Validation requirements

Add focused domain, API, database, UI/static, and backup coverage.

At minimum prove:

### Award logic

- routine = 10
- standard = 25
- weekly = 75
- stretch = 100
- only completed Coach tasks award
- pass/fail/expiry/offer/accept award zero
- one task awards once under repeated reconciliation
- separate completed tasks may both award even when evidence overlaps
- existing completed tasks backfill exactly once
- later canonical Health correction does not claw back award

### Balance logic

- Lifetime XP sums awards only
- Spendable = awards - purchases + refunds
- purchase lowers Spendable only
- refund restores Spendable only
- Lifetime is unchanged by purchase/refund
- balances are derived, not a mutable cached authority

### Purchase safety

- archived reward cannot be purchased
- current catalog price is frozen into the purchase
- later item edit does not change purchase history
- insufficient balance rejects without partial rows
- duplicate purchase idempotency does not charge twice
- concurrent purchase attempts cannot overspend
- refund occurs once
- duplicate refund cannot mint extra XP
- archived/edited item can still have its historical purchase refunded

### Coach integration

- XP label comes from frozen reward band
- existing Coach selection/completion behavior is unchanged
- automatic and owner-triggered completion paths both result in exactly one award

### API/auth

- owner read/write succeeds
- anonymous = 401
- non-owner = 403
- machine tokens do not authorize
- wrong methods = 405
- public errors do not leak database/provider secrets

### Backup

- 0039 inventory is complete
- full round-trip preserves wallet data
- portable round-trip preserves owner wallet/reward state
- derived balances are recomputed correctly after restore

### Regression

Run and pass:

- `npx tsc -b`
- `npx eslint .`
- `npm run build`
- `npm test`

Use disposable PostgreSQL for migration/database/concurrency validation. Do not write test data to the owner's production database.

---

## Documentation / completion

On successful implementation:

- add `docs/ai/H3_REPORT.md`
- update `docs/ai/DEV_STATE.md`
- update `docs/ai/ROADMAP.md`
- add durable decisions to `docs/ai/DECISIONS.md`, including:
  - Coach completion is the XP issuance boundary
  - XP ledger is append-only
  - Lifetime vs Spendable semantics
  - no reward clawback after later Health correction
  - purchase/refund snapshot semantics
- update backup docs/schema head where required
- reset this file to:
  - `# Current task`
  - blank line
  - `No active implementation task.`

Do not claim production migration/deployment unless the owner actually performs it.

---

## Definition of done

H3 is complete when:

1. migration 0039 defines a safe append-only XP/reward model
2. existing completed Coach tasks have exactly one deterministic backfilled award
3. future completed Coach tasks award exactly once
4. Lifetime and Spendable XP are derived correctly
5. reward items can be created, edited, and archived
6. rewards can be purchased without overdraft or double-spend
7. purchases preserve historical name/cost snapshots
8. refunds append exactly one compensating entry
9. Rewards UI is usable on mobile and desktop
10. Coach exposes the XP incentive without changing Coach prioritization
11. backup/portable export preserve wallet history
12. no new provider, scheduler, environment variable, or paid service exists
13. typecheck, lint, production build, and the full test suite pass
14. completion docs accurately record migration/deployment state
