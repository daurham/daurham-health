import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55436
const BACKFILL_TASK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
type Row = Record<string, unknown>
type DeferredQuery = PromiseLike<Row[]> & { text: string; params: unknown[] }

const database = vi.hoisted(() => ({ sql: null as unknown }))

vi.mock('../server/db.ts', () => ({
  getSql: async () => database.sql,
}))

import {
  archiveRewardItem,
  awardDailyParticipation,
  createRewardItem,
  purchaseReward,
  readRewards,
  refundRewardPurchase,
  updateRewardItem,
} from '../server/rewards/service.ts'

let directory = ''
let started = false
let pool: Pool

function localSql() {
  return {
    query(text: string, params: unknown[] = []): DeferredQuery {
      let result: Promise<Row[]> | undefined
      return {
        text,
        params,
        then(onfulfilled, onrejected) {
          result ??= pool.query(text, params).then((value) => value.rows as Row[])
          return result.then(onfulfilled, onrejected)
        },
      }
    },
    async transaction(queries: DeferredQuery[]) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const results: Row[][] = []
        for (const query of queries) {
          results.push((await client.query(query.text, query.params)).rows as Row[])
        }
        await client.query('COMMIT')
        return results
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    },
  }
}

async function reset() {
  await pool.query('TRUNCATE xp_ledger, reward_purchases, reward_items, coach_tasks')
}

async function seedCompletedTask(rewardBand: 'routine' | 'standard' | 'weekly' | 'stretch', title = 'Completed quest') {
  const id = randomUUID()
  await pool.query(
    `INSERT INTO coach_tasks (
       id, task_kind, reward_band, title, status, completed_at, closed_at, updated_at, created_at
     ) VALUES ($1, 'daily_quest', $2, $3, 'completed', now(), now(), now(), now())`,
    [id, rewardBand, title],
  )
  return id
}

async function seedAward(amount = 100) {
  const sourceId = randomUUID()
  await pool.query(
    `INSERT INTO xp_ledger (
       id, entry_kind, amount_xp, source_kind, source_id,
       idempotency_key, rule_version, metadata
     ) VALUES ($1, 'award', $2, 'coach_task', $3, $4, 'xp-rule-v1', '{}'::jsonb)`,
    [randomUUID(), amount, sourceId, `award:test:${sourceId}`],
  )
}

describe.sequential.skipIf(!existsSync(`${BIN}/initdb`))('Reward wallet production service on disposable Postgres', () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'health-rewards-service-'))
    execFileSync(`${BIN}/initdb`, ['-D', directory, '--username=postgres', '--auth=trust', '--no-sync'], { stdio: 'pipe' })
    execFileSync(
      `${BIN}/pg_ctl`,
      ['-D', directory, '-w', 'start', '-o', `-p ${PORT} -k ${directory} -c listen_addresses=127.0.0.1`, '-l', path.join(directory, 'server.log')],
      { stdio: 'pipe' },
    )
    started = true
    pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres', max: 12 })
    database.sql = localSql()

    await pool.query(`
      CREATE TABLE coach_tasks (
        id UUID PRIMARY KEY,
        task_kind TEXT NOT NULL,
        reward_band TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        completed_at TIMESTAMPTZ NULL,
        closed_at TIMESTAMPTZ NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await pool.query(
      `INSERT INTO coach_tasks (
         id, task_kind, reward_band, title, status, completed_at, closed_at, updated_at, created_at
       ) VALUES ($1, 'daily_quest', 'standard', 'Pre-H3 quest', 'completed',
                 '2026-09-29T19:00:00Z', '2026-09-29T19:00:00Z',
                 '2026-09-29T19:00:00Z', '2026-09-29T18:00:00Z')`,
      [BACKFILL_TASK],
    )
    await pool.query(readFileSync('migrations/0039_xp_reward_wallet.sql', 'utf8'))
    await pool.query(readFileSync('migrations/0045_xp_participation_themes.sql', 'utf8'))
  }, 60_000)

  afterAll(async () => {
    if (pool) await pool.end()
    if (started) execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'stop', '-m', 'immediate'], { stdio: 'pipe' })
    if (directory.startsWith(path.join(tmpdir(), 'health-rewards-service-'))) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('backfills pre-H3 completed Coach tasks exactly once and never claws the award back', async () => {
    const first = await readRewards()
    expect(first.balances).toEqual({ lifetimeXp: 25, spendableXp: 25 })
    expect(first.activity).toHaveLength(1)
    expect(first.activity[0]).toMatchObject({ entryKind: 'award', signedAmountXp: 25, label: 'Pre-H3 quest' })

    await readRewards()
    expect((await pool.query(
      `SELECT count(*)::int AS n FROM xp_ledger
        WHERE entry_kind = 'award' AND source_id = $1`,
      [BACKFILL_TASK],
    )).rows[0].n).toBe(1)

    await pool.query('DELETE FROM coach_tasks WHERE id = $1', [BACKFILL_TASK])
    expect((await readRewards()).balances).toEqual({ lifetimeXp: 25, spendableXp: 25 })
  })

  it('awards daily participation once per kind/date and blocks old backlog', async () => {
    await reset()
    const sql = database.sql as never
    const now = new Date('2026-10-06T20:00:00.000Z')

    expect(await awardDailyParticipation(sql, {
      kind: 'hydration',
      healthDate: '2026-10-06',
      today: '2026-10-06',
      awardedAt: now,
    })).toBe(true)
    expect(await awardDailyParticipation(sql, {
      kind: 'hydration',
      healthDate: '2026-10-06',
      today: '2026-10-06',
      awardedAt: now,
    })).toBe(false)
    expect(await awardDailyParticipation(sql, {
      kind: 'wellness',
      healthDate: '2026-10-05',
      today: '2026-10-06',
      awardedAt: now,
    })).toBe(true)
    expect(await awardDailyParticipation(sql, {
      kind: 'bowel',
      healthDate: '2026-10-04',
      today: '2026-10-06',
      awardedAt: now,
    })).toBe(false)

    const state = await readRewards()
    expect(state.ruleVersion).toBe('xp-rule-v2')
    expect(state.balances).toEqual({ lifetimeXp: 30, spendableXp: 30 })
    expect(state.activity.map((item) => item.label)).toEqual(expect.arrayContaining(['Water logged', 'Daily ratings']))
    expect((await pool.query(
      "SELECT count(*)::int AS n FROM xp_ledger WHERE source_kind = 'daily_participation'",
    )).rows[0].n).toBe(2)
  })

  it('freezes reward purchase snapshots and refunds spendable XP without changing lifetime XP', async () => {
    await reset()
    await seedCompletedTask('weekly', 'Weekly focus')
    expect((await readRewards()).balances).toEqual({ lifetimeXp: 75, spendableXp: 75 })

    let state = await createRewardItem({ name: 'Takeout night', costXp: 50, note: 'Friday' })
    const item = state.items[0]!
    const submissionId = randomUUID()

    state = await purchaseReward({ rewardItemId: item.id, submissionId })
    expect(state.balances).toEqual({ lifetimeXp: 75, spendableXp: 25 })
    expect(state.purchases[0]).toMatchObject({ rewardName: 'Takeout night', costXp: 50, refunded: false })

    state = await purchaseReward({ rewardItemId: item.id, submissionId })
    expect(state.balances).toEqual({ lifetimeXp: 75, spendableXp: 25 })
    expect((await pool.query("SELECT count(*)::int AS n FROM xp_ledger WHERE entry_kind = 'purchase'")).rows[0].n).toBe(1)

    await updateRewardItem(item.id, { name: 'Takeout plus dessert', costXp: 70, note: null })
    await archiveRewardItem(item.id)
    state = await readRewards()
    expect(state.items).toHaveLength(0)
    expect(state.purchases[0]).toMatchObject({ rewardName: 'Takeout night', costXp: 50 })

    const purchaseId = state.purchases[0]!.id
    state = await refundRewardPurchase(purchaseId)
    expect(state.balances).toEqual({ lifetimeXp: 75, spendableXp: 75 })
    expect(state.purchases[0]?.refunded).toBe(true)

    state = await refundRewardPurchase(purchaseId)
    expect(state.balances).toEqual({ lifetimeXp: 75, spendableXp: 75 })
    expect((await pool.query("SELECT count(*)::int AS n FROM xp_ledger WHERE entry_kind = 'refund'")).rows[0].n).toBe(1)
  })

  it('rejects insufficient and archived purchases without partial history', async () => {
    await reset()
    await seedAward(25)

    let state = await createRewardItem({ name: 'Large reward', costXp: 50, note: null })
    const expensive = state.items[0]!
    await expect(purchaseReward({ rewardItemId: expensive.id, submissionId: randomUUID() }))
      .rejects.toMatchObject({ statusCode: 409 })
    expect((await pool.query('SELECT count(*)::int AS n FROM reward_purchases')).rows[0].n).toBe(0)

    state = await createRewardItem({ name: 'Archived reward', costXp: 10, note: null })
    const archived = state.items.find((item) => item.name === 'Archived reward')!
    await archiveRewardItem(archived.id)
    await expect(purchaseReward({ rewardItemId: archived.id, submissionId: randomUUID() }))
      .rejects.toMatchObject({ statusCode: 409 })
    expect((await pool.query('SELECT count(*)::int AS n FROM reward_purchases')).rows[0].n).toBe(0)
  })

  it('serializes concurrent purchases so one wallet cannot overspend', async () => {
    await reset()
    await seedAward(100)
    let state = await createRewardItem({ name: 'Reward A', costXp: 75, note: null })
    state = await createRewardItem({ name: 'Reward B', costXp: 75, note: null })
    const a = state.items.find((item) => item.name === 'Reward A')!
    const b = state.items.find((item) => item.name === 'Reward B')!

    const results = await Promise.allSettled([
      purchaseReward({ rewardItemId: a.id, submissionId: randomUUID() }),
      purchaseReward({ rewardItemId: b.id, submissionId: randomUUID() }),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    const final = await readRewards()
    expect(final.balances).toEqual({ lifetimeXp: 100, spendableXp: 25 })
    expect(final.purchases).toHaveLength(1)
  })

  it('enforces append-only accounting history at the database boundary', async () => {
    await reset()
    await seedAward(10)
    await expect(pool.query("UPDATE xp_ledger SET amount_xp = 999")).rejects.toThrow(/append-only/)
    await expect(pool.query("DELETE FROM xp_ledger")).rejects.toThrow(/append-only/)
  })
})
