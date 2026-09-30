# Dev state

Snapshot recorded 2026-09-29 after **V2-H3 — XP / Reward Wallet**, on top of H2A/H2B/H2C/H2D Coach and Training expansion. This is the current health application.

## Git and runtime

- Implementation branch: `h3-xp-reward-wallet`; package version remains 1.0.0.
- H3 adds no runtime dependency, model/provider request, scheduler, environment variable, or Vercel function.
- The existing single `api/index.ts` function now dispatches owner reward routes through `server/handlers/rewards.ts`.
- H3 is deterministic/provider-free. Full implementation details are in `docs/ai/H3_REPORT.md`.

## Schema and deployment

- Repository migration head: `0039_xp_reward_wallet.sql`.
- Production was already through H2D migration 0038 before H3 work. **0039 remains pending owner migration/deployment.**
- H3 adds `reward_items`, immutable `reward_purchases`, and append-only `xp_ledger`.
- Existing completed Coach tasks are deterministically backfilled into the XP ledger by frozen `reward_band`.
- Backup/full and portable inventory head is 0039 and includes all three reward-wallet tables.
- Derived Lifetime/Spendable balances are not stored.

## XP authority

- Canonical Health writes do not mint XP directly.
- Only an existing Coach task reaching `completed` qualifies for an XP award.
- `xp-rule-v1` maps frozen Coach reward bands:
  - routine: 10 XP
  - standard: 25 XP
  - weekly: 75 XP
  - stretch: 100 XP
- Offered, active, accepted-only, passed, failed, and expired tasks award zero.
- Distinct Coach tasks may all award even when one Health action satisfies several of them.
- Award reconciliation is idempotent and self-healing. One Coach task can create at most one award.
- Later Health correction/deletion never claws back XP from a historically completed Coach task.

## Wallet semantics

- Lifetime XP is the sum of award ledger entries.
- Spendable XP is awards minus purchases plus refunds.
- Ledger amounts are positive; entry kind determines accounting direction.
- No mutable balance column is authoritative.
- Reward items are owner-created and may be edited or archived.
- Redemption freezes the reward name and cost in an immutable purchase snapshot.
- Catalog edits/archive never rewrite purchase history.
- Refunds append one compensating ledger entry and restore Spendable XP without affecting Lifetime XP.
- Purchase submission ids and ledger uniqueness make retries idempotent.
- A transaction-scoped PostgreSQL advisory lock serializes competing purchases so the one-owner wallet cannot overspend.

## Owner UI and API

- Owner route: `/rewards`.
- Rewards is intentionally not a primary navigation tab.
- The Rewards page shows Spendable XP, Lifetime XP, active reward catalog, recent redemptions/refunds, and recent XP activity.
- Create/edit/archive/redeem/refund flows are owner-only.
- Coach shows the deterministic `+XP` value from each task's frozen reward band and provides an owner link to Rewards.
- Demo remains anonymous/read-only and does not call reward APIs.

Owner API routes:

- `GET /api/rewards`
- `POST /api/rewards/items`
- `PATCH /api/rewards/items/:id`
- `DELETE /api/rewards/items/:id` (archive)
- `POST /api/rewards/purchases`
- `POST /api/rewards/purchases/:id/refund`

## Backup/export

`reward_items`, `reward_purchases`, and `xp_ledger` are canonical owner data in both the full archive and portable export. Restore preserves frozen purchase cost/name, ledger amount/kind/rule/source identity, timestamps, idempotency keys, metadata, and catalog archive state. Balances are recomputed from the restored ledger.

## Validation

H3 production/test code passed GitHub Actions validation on Ubuntu 22.04 / Node 22 / PostgreSQL 14 / America/Phoenix before documentation closeout:

- `npm test`: 139 test files passed; 1,286 tests passed, 1 skipped
- `npx tsc -b`: passed
- `npx eslint .`: passed
- `npm run build`: passed

A final closeout validation will include the H3 documentation/UI-contract additions. Production owner data was not used for implementation tests; PostgreSQL wallet/migration/concurrency coverage uses a disposable local cluster.

## Retained invariants and next phase

One-owner auth, Phoenix calendar, single Vercel function, Health-as-canonical-facts, Apple Activity separation, Goal/Lab/Coach authority boundaries, backup/export integrity, Appearance, and reduced-motion behavior remain active.

- **H4:** Themes + progression polish may build on Lifetime XP. No H4 implementation task is active yet.
