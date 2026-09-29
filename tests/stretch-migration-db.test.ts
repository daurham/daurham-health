import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Client } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

// Disposable local Postgres only. Never read DATABASE_URL or connect to owner data.
const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55433
let directory = ''
let started = false
let db: Client

describe.skipIf(!existsSync(`${BIN}/initdb`))('Stretch migration on disposable Postgres', () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'health-stretch-'))
    execFileSync(`${BIN}/initdb`, ['-D', directory, '--username=postgres', '--auth=trust', '--no-sync'], { stdio: 'pipe' })
    execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'start', '-o', `-p ${PORT} -k ${directory} -c listen_addresses=127.0.0.1`, '-l', path.join(directory, 'server.log')], { stdio: 'pipe' })
    started = true
    db = new Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres' })
    await db.connect()
    await db.query('CREATE TABLE goals (id UUID PRIMARY KEY)')
    await db.query(readFileSync('migrations/0035_coach_tasks.sql', 'utf8'))
    await db.query(readFileSync('migrations/0036_stretch_quests.sql', 'utf8'))
  }, 60_000)

  afterAll(async () => {
    if (db) await db.end()
    if (started) execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'stop', '-m', 'immediate'], { stdio: 'pipe' })
    if (directory.startsWith(path.join(tmpdir(), 'health-stretch-'))) rmSync(directory, { recursive: true, force: true })
  })

  beforeEach(async () => { await db.query('TRUNCATE coach_task_events, coach_tasks') })

  async function insert(status = 'offered', kind = 'stretch_quest', acceptedAt: string | null = null) {
    const result = await db.query(`INSERT INTO coach_tasks (
      task_kind, rule_key, rule_version, domain, title, detail, starts_on, expires_on,
      period_fingerprint, verification_mode, action_kind, difficulty, reward_band, status, accepted_at
    ) VALUES ($1, 'test', 1, 'training', 'Challenge', 'Canonical Training', '2026-09-29', '2026-10-01',
      gen_random_uuid()::text, 'canonical', 'open', $2, $2, $3, $4) RETURNING id`,
    [kind, kind === 'stretch_quest' ? 'stretch' : 'standard', status, acceptedAt])
    return result.rows[0].id as string
  }

  it('enforces one current offer/challenge even when two requests race', async () => {
    const outcomes = await Promise.allSettled([insert(), insert()])
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect((await db.query("SELECT count(*)::int AS n FROM coach_tasks WHERE status IN ('offered', 'active')")).rows[0].n).toBe(1)
  })

  it.each(['active', 'completed', 'failed'])('requires accepted_at for %s Stretch state', async (status) => {
    await expect(insert(status)).rejects.toMatchObject({ code: '23514' })
    await expect(insert(status, 'stretch_quest', '2026-09-29T19:00:00Z')).resolves.toEqual(expect.any(String))
  })

  it.each(['offered', 'failed'])('rejects new %s state on ordinary Daily Quests', async (status) => {
    await expect(insert(status, 'daily_quest')).rejects.toMatchObject({ code: '23514' })
  })

  it('preserves ordinary active tasks and multiple closed Stretch rows', async () => {
    await insert('active', 'daily_quest')
    await insert('passed')
    await insert('expired')
    await insert('failed', 'stretch_quest', '2026-09-29T19:00:00Z')
    await insert()
    expect((await db.query('SELECT count(*)::int AS n FROM coach_tasks')).rows[0].n).toBe(5)
  })

  it('allows failed history and deduplicates lifecycle retries', async () => {
    const id = await insert('failed', 'stretch_quest', '2026-09-29T19:00:00Z')
    const event = `INSERT INTO coach_task_events (task_id, event_kind, evidence_kind, idempotency_key)
      VALUES ($1, 'failed', 'none', 'failed') ON CONFLICT (task_id, idempotency_key) DO NOTHING`
    await db.query(event, [id])
    await db.query(event, [id])
    expect((await db.query('SELECT event_kind FROM coach_task_events')).rows).toEqual([{ event_kind: 'failed' }])
  })
})
