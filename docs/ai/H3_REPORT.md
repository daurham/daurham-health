# V2-H3 — XP / Reward Wallet completion report

Completed 2026-09-29.

## Summary

H3 adds a deterministic game economy on top of the existing Coach lifecycle.

Health measurements, logs, Goals, Experiments, Benchmarks, and other canonical facts do not mint XP directly. A Coach commitment earns XP only when its existing lifecycle reaches `completed`. The frozen Coach `reward_band` is the award authority.

H3 also adds an owner-created reward catalog, concurrency-safe reward redemption, append-only refunds, derived Lifetime/Spendable balances, a Rewards owner page, Coach XP presentation, and full/portable backup support.

No levels, badges, streaks, loot boxes, theme unlocks, model calls, paid services, schedulers, or background jobs were added.

## Migration

New migration: `0039_xp_reward_wallet.sql`.

Repository schema head is 0039. Production was already through 0038 before H3; **0039 was not applied to production during implementation**.

The migration adds:

- `reward_items`
- `reward_purchases`
- `xp_ledger`

`xp_ledger` supports positive `award`, `purchase`, and `refund` entries with stable source identity and globally unique idempotency keys. Partial unique indexes enforce one Coach award, one purchase debit, and one refund per source.

Database triggers prevent UPDATE/DELETE of XP ledger rows and reward purchase snapshots through ordinary application SQL.

The migration deterministically backfills already-completed Coach tasks using their frozen reward band and `xp-rule-v1`.

## XP calibration

`xp-rule-v1` is shared deterministic domain code:

- routine: 10 XP
- standard: 25 XP
- weekly: 75 XP
- stretch: 100 XP

Only `completed` Coach tasks qualify. Offered, active, accepted-only, passed, failed, and expired tasks award zero.

Separate completed Coach tasks may each award even when one canonical Health action satisfies several commitments.

## Historical correction boundary

Later correction or deletion of the Health evidence behind a completed Coach task does not claw back the historical award.

Coach completion already preserves its historical evidence/provenance. This keeps Health records freely correctable and avoids giving the owner an incentive to preserve inaccurate Health data.

## Award reconciliation

Existing completed tasks are backfilled by migration.

At runtime, Coach state and Rewards reads also reconcile any completed Coach task missing its one allowed award. Uniqueness and idempotency make concurrent/repeated reconciliation safe.

This self-healing path covers interruption after Coach completion without introducing a second completion authority.

## Lifetime and Spendable XP

Balances are derived from immutable ledger rows:

- Lifetime XP = awards
- Spendable XP = awards - purchases + refunds

Purchases and refunds never change Lifetime XP. There is no mutable cached balance authority.

## Reward catalog and redemption

The owner can create, edit, and archive rewards.

A redemption freezes:

- reward item provenance
- reward name
- XP cost
- client submission identity
- purchase timestamp

Editing or archiving the catalog item later does not rewrite the purchase.

Purchase requests serialize through a transaction-scoped PostgreSQL advisory lock, re-read the ledger-derived Spendable balance after acquiring the lock, and reject insufficient XP without partial history. A duplicate submission id resolves idempotently rather than charging again.

Refunds append one compensating ledger entry for the frozen historical cost. Repeated refunds cannot mint extra XP.

## API

H3 stays inside the existing single Vercel function and owner-auth boundary.

Routes:

- `GET /api/rewards`
- `POST /api/rewards/items`
- `PATCH /api/rewards/items/:id`
- `DELETE /api/rewards/items/:id` (archive)
- `POST /api/rewards/purchases`
- `POST /api/rewards/purchases/:id/refund`

Machine ingest tokens do not authorize these routes.

## UI

New owner route: `/rewards`.

Rewards is not a primary navigation tab. The owner reaches it from Coach.

The page provides:

- Spendable XP as the primary wallet balance
- Lifetime XP
- active reward catalog
- add/edit/archive controls
- explicit redemption confirmation
- affordability/XP-shortfall presentation
- immutable recent redemption history
- explicit refund confirmation
- recent XP activity

Coach surfaces the deterministic XP amount associated with its frozen reward band before completion and in completion acknowledgement. Demo Coach does not link into an owner Rewards route.

## Backup/export

Backup schema head is 0039.

Full and portable owner exports include:

- `reward_items`
- `reward_purchases`
- `xp_ledger`

Purchase snapshots, archive state, ledger amount/kind, source identity, rule version, timestamps, metadata, and idempotency keys round-trip. Lifetime and Spendable balances are derived after restore rather than stored as separate backup facts.

## Validation

Production/test code at commit `6ab695e0e1ac6fb9773562194eb462cd28d521fc` passed GitHub Actions run `36661033409` on Ubuntu 22.04 / Node 22 / PostgreSQL 14 with America/Phoenix timezone:

- `npm test`: **139 test files passed; 1,286 tests passed, 1 skipped**
- `npx tsc -b`: passed
- `npx eslint .`: passed
- `npm run build`: passed

Coverage includes:

- XP rule calibration and balance derivation
- owner API/auth/method routing
- migration backfill
- idempotent runtime reconciliation
- no award clawback after source correction
- reward snapshot immutability
- purchase retry idempotency
- insufficient/archived purchase rejection
- PostgreSQL concurrent-purchase serialization
- one-time refunds
- append-only database enforcement
- backup/full/portable wallet round-trip
- Coach XP presentation and owner-only Rewards routing

A later documentation/UI-contract-only closeout commit may have a subsequent validation run; this report should be updated if that changes validation totals.

## Deployment

No production migration or deployment was performed by this implementation pass.

Owner deployment order is important:

1. update the production checkout to the published H3 commit
2. apply `npm run migrate` so production reaches 0039
3. deploy the matching H3 application bundle
4. open `/rewards` and verify backfilled XP / reward creation / redemption UI

Do not deploy H3 application code against a production database that is still at 0038 because Coach/Rewards reads expect the H3 wallet tables.

## Follow-up

H4 remains the next planned slice: themes + progression polish built on Lifetime XP. H3 intentionally leaves that progression layer unimplemented.
