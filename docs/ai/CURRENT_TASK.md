# Current task

## I3 — XP Participation Expansion + Theme Runway

### Status

Implementation prepared as a dormant batched Git commit on top of dormant I2 commit `a8437e0b8afe90723af289d2041b8bf5ca47ef83`.

Do not move a feature branch ref while the Vercel rolling deployment limit remains active.

Repository schema head after I3:

`0045_xp_participation_themes.sql`

Master program:

`docs/ai/NEXT_INTELLIGENCE_ROADMAP.md`

## Product intent

I3 expands XP without turning Health observations into farmable game events.

The reward system now has two legitimate award families:

1. Coach commitment completion, preserving the existing H3 reward bands.
2. Bounded daily participation for a few high-value tracking behaviors.

Canonical Health facts remain independent of XP. A valid Health write never depends on whether an XP award succeeds.

## Rule versions

- Wallet/current rule: `xp-rule-v2`
- Coach award rule remains: `xp-rule-v1`
- Daily participation rule: `xp-participation-v1`

Existing Coach awards are not rewritten.

## Daily participation awards

One Health date can earn at most **65 participation XP**:

- Hydration: **10 XP** after the first valid water log.
- Bowel tracking: **10 XP** after the first bowel event or explicit no-BM state.
- Daily wellness: **20 XP** after saving at least one energy/hunger/soreness/stress rating.
- Supplements: **25 XP** when every scheduled occurrence for the day is explicitly recorded.

Participation is rewarded for honest tracking, not health outcomes.

For supplements:

- taken counts as recorded;
- skipped counts as recorded;
- unknown does not;
- paused/not-scheduled occurrences do not create work and do not independently mint XP.

No per-glass, per-bowel-movement, or per-rating XP exists.

## Idempotency and corrections

Each participation award uses one immutable ledger entry per domain + Health date.

Idempotency key shape:

`award:daily:<kind>:<YYYY-MM-DD>`

Repeated taps, retries, edits, and additional events on the same day do not mint another participation award.

Health corrections do not claw XP back. This preserves the existing rule that the game economy must never discourage correcting Health history.

## Backlog behavior

Participation XP is eligible only for:

- today;
- yesterday.

Older backlog remains fully valid Health history but does not mint XP.

The configured Health calendar timezone remains authoritative.

No historical Daily Signals or supplement history is automatically backfilled for I3.

## Ledger migration

Migration 0045 expands `xp_ledger.source_kind` to include:

`daily_participation`

The append-only ledger, purchase/refund behavior, Lifetime XP, Spendable XP, and immutable reward-purchase snapshots are unchanged.

**Deployment ordering:** apply migration 0045 before exposing I3 server code. The previous database constraint intentionally rejects `daily_participation`.

## Wallet refresh

Successful Daily Signals mutations and supplement-adherence mutations trigger the existing reward-state refresh event.

If the mutation did not actually earn XP, the refreshed balance remains unchanged.

## Health-write failure isolation

Canonical Health history is more important than the game economy.

The strict wallet service may surface ledger/database failures to its own tests and callers, but Daily Signals and supplement adherence use a best-effort participation wrapper **after** the canonical Health mutation succeeds.

If the wallet write fails:

- the Health record remains saved;
- the Health endpoint still succeeds;
- the failure does not invite a duplicate Health retry;
- no synthetic XP is assumed;
- a later product/ops repair can address the missing ledger event explicitly if needed.

Migration 0045 is still mandatory before normal I3 deployment; failure isolation is a correctness safeguard, not a substitute for applying the schema.

## Rewards copy

Rewards now explains:

- Coach + participation earning;
- the 65 XP/day participation cap;
- per-domain values;
- honest supplement skips;
- today/yesterday backlog behavior;
- no stacking from multiple events;
- the personal reward-budget convention: **100 XP = $1**.

## Theme runway

Existing unlock thresholds are not moved.

Eight new progression packs are appended:

- Level 13 — Crimson Surge
- Level 14 — Sun God
- Level 15 — Sage Storm
- Level 16 — Mjolnir Night
- Level 17 — Vault Neon
- Level 18 — Abyss Knight
- Level 19 — Republic Red
- Level 20 — Cosmic Instinct

The existing `progression-v1` threshold formula remains unchanged.

Level 20 unlocks at **10,450 lifetime XP**.

Theme metadata, Theme Studio allowlisting, CSS, pre-render bootstrap allowlisting, and level-up discovery all use the same IDs.

## XP velocity review

Maximum participation-only velocity:

- 65 XP/day;
- about 1,950 XP per 30-day month.

Typical challenge completion adds roughly:

- Daily Quest: 10–25 XP/day when completed;
- Weekly commitment: 75 XP;
- Stretch: 100 XP when completed.

That places a strong-compliance month around the original **$30+** reward-budget target without making routine logging alone worth $30–$50.

At roughly 3,000–5,000 lifetime XP/month, the Level 20 runway is approximately 2–4 months from a fresh wallet. Future runway should be extended by appending levels/themes, not by moving already-earned thresholds upward.

## Explicit non-goals

I3 does not:

- reward number of glasses;
- reward number or Bristol quality of bowel movements;
- reward high/low wellness scores differently;
- reward supplement ingestion more than an honest skip;
- create negative XP;
- claw back awards after Health correction;
- change Coach reward-band values;
- change the level threshold formula;
- add new Health analytics or AI interpretation.

## Validation before publication

Once this dormant commit is exposed to one branch:

1. apply migration 0045 to the branch test database;
2. run `npx tsc -b`;
3. run `npx eslint .`;
4. run `npm test`;
5. run `npm run build`.

Required regression coverage:

- rule-version compatibility;
- fixed participation values and 65 XP cap;
- today/yesterday backlog eligibility;
- duplicate award idempotency;
- append-only ledger;
- purchase/refund accounting;
- supplement-day completion semantics;
- Daily Signals award hooks;
- portable ledger backup;
- old-theme backward compatibility;
- Level 13–20 unlock thresholds;
- pre-render/theme/CSS allowlist consistency.

Do not merge until the exact published branch head is green.

## Next roadmap slice

I4 — Evidence Semantics, Effort, and Change Ledger.
