import { randomUUID } from 'node:crypto'
import {
  COACH_XP_RULE_VERSION,
  DAILY_PARTICIPATION_RULE_VERSION,
  XP_RULE_VERSION,
  dailyParticipationIdempotencyKey,
  dailyParticipationLabel,
  dailyParticipationXp,
  deriveWalletBalances,
  participationDateEligible,
  rewardItemInputSchema,
  rewardPurchaseRequestSchema,
  xpForRewardBand,
  type DailyParticipationKind,
  type RewardActivity,
  type RewardItem,
  type RewardPurchase,
  type RewardsState,
  type RewardSummary,
  type WalletLedgerEntry,
  type XpLedgerEntryKind,
} from '../../src/domain/rewards.js'
import type { CoachDifficulty, CoachTaskKind } from '../../src/domain/coach.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'

const WALLET_ADVISORY_LOCK = 90439031

type RewardItemRow = {
  id: string
  name: string
  cost_xp: number | string
  note: string | null
  is_active: boolean
  created_at: string | Date
  updated_at: string | Date
}

type PurchaseRow = {
  id: string
  reward_item_id: string | null
  reward_name: string
  cost_xp: number | string
  submission_id: string
  purchased_at: string | Date
  refunded_at?: string | Date | null
}

type LedgerRow = {
  id: string
  entry_kind: XpLedgerEntryKind
  amount_xp: number | string
  source_kind: 'coach_task' | 'daily_participation' | 'reward_purchase'
  source_id: string
  idempotency_key: string
  rule_version: string | null
  occurred_at: string | Date
  metadata: Record<string, unknown> | null
  created_at: string | Date
}

type CoachAwardSource = {
  id: string
  taskKind: CoachTaskKind
  rewardBand: CoachDifficulty
  title: string
  completedAt: string
}

function instant(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function mapRewardItem(row: RewardItemRow): RewardItem {
  return {
    id: row.id,
    name: row.name,
    costXp: Number(row.cost_xp),
    note: row.note,
    isActive: row.is_active,
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
  }
}

function mapPurchase(row: PurchaseRow): RewardPurchase {
  return {
    id: row.id,
    rewardItemId: row.reward_item_id,
    rewardName: row.reward_name,
    costXp: Number(row.cost_xp),
    submissionId: row.submission_id,
    purchasedAt: instant(row.purchased_at),
    refunded: row.refunded_at != null,
    refundedAt: row.refunded_at == null ? null : instant(row.refunded_at),
  }
}

function mapLedger(row: LedgerRow): WalletLedgerEntry {
  return {
    id: row.id,
    entryKind: row.entry_kind,
    amountXp: Number(row.amount_xp),
    sourceKind: row.source_kind,
    sourceId: row.source_id,
    idempotencyKey: row.idempotency_key,
    ruleVersion: row.rule_version,
    occurredAt: instant(row.occurred_at),
    metadata: row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {},
    createdAt: instant(row.created_at),
  }
}

function activityLabel(entry: WalletLedgerEntry): string {
  const title = typeof entry.metadata.title === 'string' ? entry.metadata.title : null
  const rewardName = typeof entry.metadata.rewardName === 'string' ? entry.metadata.rewardName : null
  if (entry.entryKind === 'award') {
    if (entry.sourceKind === 'daily_participation') {
      const participationKind = entry.metadata.participationKind
      if (
        participationKind === 'hydration'
        || participationKind === 'bowel'
        || participationKind === 'wellness'
        || participationKind === 'supplements'
      ) {
        return dailyParticipationLabel(participationKind)
      }
      return 'Daily participation'
    }
    return title ?? 'Coach completion'
  }
  if (entry.entryKind === 'purchase') return rewardName ?? 'Reward purchase'
  return `Refund: ${rewardName ?? 'Reward purchase'}`
}

function toActivity(entry: WalletLedgerEntry): RewardActivity {
  return {
    id: entry.id,
    entryKind: entry.entryKind,
    amountXp: entry.amountXp,
    signedAmountXp: entry.entryKind === 'purchase' ? -entry.amountXp : entry.amountXp,
    label: activityLabel(entry),
    occurredAt: entry.occurredAt,
  }
}

export async function awardCoachTask(sql: Sql, task: CoachAwardSource): Promise<void> {
  const amount = xpForRewardBand(task.rewardBand)
  await sql.query(
    `INSERT INTO xp_ledger (
       id, entry_kind, amount_xp, source_kind, source_id,
       idempotency_key, rule_version, occurred_at, metadata
     ) VALUES (
       $1::uuid, 'award', $2::int, 'coach_task', $3::uuid,
       $4, $5, $6::timestamptz, $7::jsonb
     )
     ON CONFLICT DO NOTHING`,
    [
      randomUUID(),
      amount,
      task.id,
      `award:coach:${task.id}`,
      COACH_XP_RULE_VERSION,
      task.completedAt,
      JSON.stringify({
        coachTaskId: task.id,
        taskKind: task.taskKind,
        rewardBand: task.rewardBand,
        title: task.title,
        completedAt: task.completedAt,
        ruleVersion: COACH_XP_RULE_VERSION,
      }),
    ],
  )
}

export async function awardDailyParticipation(
  sql: Sql,
  input: {
    kind: DailyParticipationKind
    healthDate: string
    today: string
    awardedAt?: Date
  },
): Promise<boolean> {
  if (!participationDateEligible(input.healthDate, input.today)) {
    return false
  }
  const amount = dailyParticipationXp(input.kind)
  const awardedAt = input.awardedAt ?? new Date()
  const rows = (await sql.query(
    `INSERT INTO xp_ledger (
       id, entry_kind, amount_xp, source_kind, source_id,
       idempotency_key, rule_version, occurred_at, metadata
     ) VALUES (
       $1::uuid, 'award', $2::int, 'daily_participation', $3::uuid,
       $4, $5, $6::timestamptz, $7::jsonb
     )
     ON CONFLICT DO NOTHING
     RETURNING id::text AS id`,
    [
      randomUUID(),
      amount,
      randomUUID(),
      dailyParticipationIdempotencyKey(input.kind, input.healthDate),
      DAILY_PARTICIPATION_RULE_VERSION,
      awardedAt.toISOString(),
      JSON.stringify({
        participationKind: input.kind,
        healthDate: input.healthDate,
        title: dailyParticipationLabel(input.kind),
        amountXp: amount,
        ruleVersion: DAILY_PARTICIPATION_RULE_VERSION,
      }),
    ],
  )) as Array<{ id: string }>
  return rows.length > 0
}

export async function tryAwardDailyParticipation(
  sql: Sql,
  input: {
    kind: DailyParticipationKind
    healthDate: string
    today: string
    awardedAt?: Date
  },
): Promise<boolean> {
  try {
    return await awardDailyParticipation(sql, input)
  } catch {
    // Health history is authoritative. A wallet-side failure must not make a
    // successful canonical Health mutation look failed or invite a duplicate retry.
    console.error('Daily participation XP award failed after canonical Health write.')
    return false
  }
}

export async function reconcileCoachAwards(sql: Sql): Promise<void> {
  const rows = (await sql.query(
    `SELECT task.id::text AS id,
            task.task_kind,
            task.reward_band,
            task.title,
            to_char(COALESCE(task.completed_at, task.closed_at, task.updated_at, task.created_at)
              AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS completed_at
       FROM coach_tasks task
       LEFT JOIN xp_ledger ledger
         ON ledger.entry_kind = 'award'
        AND ledger.source_kind = 'coach_task'
        AND ledger.source_id = task.id
      WHERE task.status = 'completed'
        AND task.reward_band IN ('routine', 'standard', 'weekly', 'stretch')
        AND ledger.id IS NULL
      ORDER BY COALESCE(task.completed_at, task.closed_at, task.updated_at, task.created_at), task.id`,
  )) as Array<{
    id: string
    task_kind: CoachTaskKind
    reward_band: CoachDifficulty
    title: string
    completed_at: string
  }>

  for (const row of rows) {
    await awardCoachTask(sql, {
      id: row.id,
      taskKind: row.task_kind,
      rewardBand: row.reward_band,
      title: row.title,
      completedAt: row.completed_at,
    })
  }
}

async function walletState(sql: Sql): Promise<RewardsState> {
  await reconcileCoachAwards(sql)

  const [itemRows, purchaseRows, balanceRows, activityRows] = await Promise.all([
    sql.query(
      `SELECT id::text AS id, name, cost_xp, note, is_active, created_at, updated_at
         FROM reward_items
        WHERE is_active = true
        ORDER BY created_at, id`,
    ) as unknown as Promise<RewardItemRow[]>,
    sql.query(
      `SELECT purchase.id::text AS id,
              purchase.reward_item_id::text AS reward_item_id,
              purchase.reward_name,
              purchase.cost_xp,
              purchase.submission_id::text AS submission_id,
              purchase.purchased_at,
              refund.occurred_at AS refunded_at
         FROM reward_purchases purchase
         LEFT JOIN xp_ledger refund
           ON refund.entry_kind = 'refund'
          AND refund.source_kind = 'reward_purchase'
          AND refund.source_id = purchase.id
        ORDER BY purchase.purchased_at DESC, purchase.id DESC
        LIMIT 30`,
    ) as unknown as Promise<PurchaseRow[]>,
    sql.query(
      `SELECT entry_kind, amount_xp
         FROM xp_ledger
        ORDER BY occurred_at, id`,
    ) as unknown as Promise<Array<{ entry_kind: XpLedgerEntryKind; amount_xp: number | string }>>,
    sql.query(
      `SELECT id::text AS id, entry_kind, amount_xp, source_kind,
              source_id::text AS source_id, idempotency_key, rule_version,
              occurred_at, metadata, created_at
         FROM xp_ledger
        ORDER BY occurred_at DESC, id DESC
        LIMIT 40`,
    ) as unknown as Promise<LedgerRow[]>,
  ])

  const balances = deriveWalletBalances(
    balanceRows.map((row) => ({ entryKind: row.entry_kind, amountXp: Number(row.amount_xp) })),
  )

  return {
    ruleVersion: XP_RULE_VERSION,
    balances,
    items: itemRows.map(mapRewardItem),
    purchases: purchaseRows.map(mapPurchase),
    activity: activityRows.map(mapLedger).map(toActivity),
  }
}

export async function readRewards(): Promise<RewardsState> {
  return walletState(await getSql())
}

async function rewardSummary(sql: Sql): Promise<RewardSummary> {
  await reconcileCoachAwards(sql)
  const rows = (await sql.query(
    `SELECT
       COALESCE(SUM(CASE WHEN entry_kind = 'award' THEN amount_xp ELSE 0 END), 0)::int AS lifetime_xp,
       COALESCE(SUM(
         CASE entry_kind
           WHEN 'award' THEN amount_xp
           WHEN 'refund' THEN amount_xp
           WHEN 'purchase' THEN -amount_xp
         END
       ), 0)::int AS spendable_xp
       FROM xp_ledger`,
  )) as Array<{ lifetime_xp: number | string; spendable_xp: number | string }>
  return {
    lifetimeXp: Number(rows[0]?.lifetime_xp ?? 0),
    spendableXp: Number(rows[0]?.spendable_xp ?? 0),
  }
}

export async function readRewardSummary(): Promise<RewardSummary> {
  return rewardSummary(await getSql())
}


export async function createRewardItem(body: unknown): Promise<RewardsState> {
  const parsed = rewardItemInputSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid reward')
  }
  const sql = await getSql()
  await sql.query(
    `INSERT INTO reward_items (id, name, cost_xp, note)
     VALUES ($1::uuid, $2, $3::int, $4)`,
    [randomUUID(), parsed.data.name, parsed.data.costXp, parsed.data.note ?? null],
  )
  return walletState(sql)
}

export async function updateRewardItem(id: string, body: unknown): Promise<RewardsState> {
  const parsed = rewardItemInputSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid reward')
  }
  const sql = await getSql()
  const rows = await sql.query(
    `UPDATE reward_items
        SET name = $2, cost_xp = $3::int, note = $4, updated_at = now()
      WHERE id = $1::uuid AND is_active = true
      RETURNING id::text AS id`,
    [id, parsed.data.name, parsed.data.costXp, parsed.data.note ?? null],
  )
  if (!rows[0]) {
    const existing = await sql.query(`SELECT is_active FROM reward_items WHERE id = $1::uuid LIMIT 1`, [id])
    if (!existing[0]) throw new HttpError(404, 'Reward not found')
    throw new HttpError(409, 'Archived rewards cannot be edited')
  }
  return walletState(sql)
}

export async function archiveRewardItem(id: string): Promise<RewardsState> {
  const sql = await getSql()
  const rows = await sql.query(
    `UPDATE reward_items
        SET is_active = false, updated_at = now()
      WHERE id = $1::uuid
      RETURNING id::text AS id`,
    [id],
  )
  if (!rows[0]) throw new HttpError(404, 'Reward not found')
  return walletState(sql)
}

async function currentSpendable(sql: Sql): Promise<number> {
  const rows = (await sql.query(
    `SELECT COALESCE(SUM(
       CASE entry_kind
         WHEN 'award' THEN amount_xp
         WHEN 'refund' THEN amount_xp
         WHEN 'purchase' THEN -amount_xp
       END
     ), 0)::int AS spendable
       FROM xp_ledger`,
  )) as Array<{ spendable: number | string }>
  return Number(rows[0]?.spendable ?? 0)
}

export async function purchaseReward(body: unknown): Promise<RewardsState> {
  const parsed = rewardPurchaseRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid reward purchase')
  }

  const sql = await getSql()
  await reconcileCoachAwards(sql)
  const purchaseId = randomUUID()
  const ledgerId = randomUUID()

  const results = await sql.transaction([
    sql.query(`SELECT pg_advisory_xact_lock($1)`, [WALLET_ADVISORY_LOCK]),
    sql.query(
      `WITH existing AS MATERIALIZED (
         SELECT id::text AS id, reward_item_id::text AS reward_item_id,
                reward_name, cost_xp, submission_id::text AS submission_id, purchased_at
           FROM reward_purchases
          WHERE submission_id = $1::uuid
          LIMIT 1
       ),
       item AS MATERIALIZED (
         SELECT id, name, cost_xp, note, is_active
           FROM reward_items
          WHERE id = $2::uuid
          LIMIT 1
       ),
       balance AS MATERIALIZED (
         SELECT COALESCE(SUM(
           CASE entry_kind
             WHEN 'award' THEN amount_xp
             WHEN 'refund' THEN amount_xp
             WHEN 'purchase' THEN -amount_xp
           END
         ), 0)::int AS spendable
           FROM xp_ledger
       ),
       inserted AS (
         INSERT INTO reward_purchases (
           id, reward_item_id, reward_name, cost_xp, submission_id, purchased_at
         )
         SELECT $3::uuid, item.id, item.name, item.cost_xp, $1::uuid, now()
           FROM item, balance
          WHERE item.is_active = true
            AND balance.spendable >= item.cost_xp
            AND NOT EXISTS (SELECT 1 FROM existing)
         RETURNING id::text AS id, reward_item_id::text AS reward_item_id,
                   reward_name, cost_xp, submission_id::text AS submission_id, purchased_at
       ),
       debit AS (
         INSERT INTO xp_ledger (
           id, entry_kind, amount_xp, source_kind, source_id,
           idempotency_key, rule_version, occurred_at, metadata
         )
         SELECT $4::uuid, 'purchase', inserted.cost_xp, 'reward_purchase',
                inserted.id::uuid, 'purchase:' || inserted.id, NULL,
                inserted.purchased_at,
                jsonb_build_object(
                  'rewardPurchaseId', inserted.id,
                  'rewardItemId', inserted.reward_item_id,
                  'rewardName', inserted.reward_name,
                  'costXp', inserted.cost_xp
                )
           FROM inserted
         RETURNING source_id
       )
       SELECT 'existing'::text AS outcome, existing.* FROM existing
       UNION ALL
       SELECT 'created'::text AS outcome, inserted.* FROM inserted
       LIMIT 1`,
      [parsed.data.submissionId, parsed.data.rewardItemId, purchaseId, ledgerId],
    ),
  ]) as unknown as [unknown[], Array<PurchaseRow & { outcome: 'existing' | 'created' }>]

  const purchase = results[1]?.[0]
  if (purchase) {
    if (purchase.outcome === 'existing' && purchase.reward_item_id !== parsed.data.rewardItemId) {
      throw new HttpError(409, 'This purchase submission was already used for a different reward')
    }
    return walletState(sql)
  }

  const items = (await sql.query(
    `SELECT id::text AS id, is_active, cost_xp FROM reward_items WHERE id = $1::uuid LIMIT 1`,
    [parsed.data.rewardItemId],
  )) as Array<{ id: string; is_active: boolean; cost_xp: number | string }>
  const item = items[0]
  if (!item) throw new HttpError(404, 'Reward not found')
  if (!item.is_active) throw new HttpError(409, 'Archived rewards cannot be purchased')
  if ((await currentSpendable(sql)) < Number(item.cost_xp)) {
    throw new HttpError(409, 'Not enough XP for this reward')
  }
  throw new HttpError(409, 'Reward purchase could not be completed')
}

export async function refundRewardPurchase(id: string): Promise<RewardsState> {
  const sql = await getSql()
  const ledgerId = randomUUID()
  const results = await sql.transaction([
    sql.query(`SELECT pg_advisory_xact_lock($1)`, [WALLET_ADVISORY_LOCK]),
    sql.query(
      `WITH purchase AS MATERIALIZED (
         SELECT p.id, p.reward_item_id, p.reward_name, p.cost_xp, p.purchased_at
           FROM reward_purchases p
          WHERE p.id = $1::uuid
          LIMIT 1
       ),
       debit AS MATERIALIZED (
         SELECT ledger.id
           FROM xp_ledger ledger
          WHERE ledger.entry_kind = 'purchase'
            AND ledger.source_kind = 'reward_purchase'
            AND ledger.source_id = $1::uuid
          LIMIT 1
       )
       INSERT INTO xp_ledger (
         id, entry_kind, amount_xp, source_kind, source_id,
         idempotency_key, rule_version, occurred_at, metadata
       )
       SELECT $2::uuid, 'refund', purchase.cost_xp, 'reward_purchase',
              purchase.id, 'refund:' || purchase.id::text, NULL, now(),
              jsonb_build_object(
                'rewardPurchaseId', purchase.id::text,
                'rewardItemId', purchase.reward_item_id::text,
                'rewardName', purchase.reward_name,
                'costXp', purchase.cost_xp
              )
         FROM purchase, debit
       ON CONFLICT DO NOTHING
       RETURNING id::text AS id`,
      [id, ledgerId],
    ),
  ]) as unknown as [unknown[], Array<{ id: string }>]

  if (!results[1]?.[0]) {
    const purchases = await sql.query(`SELECT id::text AS id FROM reward_purchases WHERE id = $1::uuid LIMIT 1`, [id])
    if (!purchases[0]) throw new HttpError(404, 'Reward purchase not found')
    const debits = await sql.query(
      `SELECT id::text AS id FROM xp_ledger
        WHERE entry_kind = 'purchase' AND source_kind = 'reward_purchase' AND source_id = $1::uuid
        LIMIT 1`,
      [id],
    )
    if (!debits[0]) throw new HttpError(409, 'Reward purchase is missing its wallet debit')
    // Existing refund is the idempotent success path.
  }

  return walletState(sql)
}
