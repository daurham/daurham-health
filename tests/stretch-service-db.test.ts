import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { poundsToKilograms } from '../src/domain/units.ts'

// Production SQL, disposable local database. Never read DATABASE_URL or owner data.
const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55434
const EXERCISE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const NOW = new Date('2026-09-29T19:00:00.000Z')
const AFTER = new Date('2026-09-29T21:00:00.000Z')
type Row = Record<string, unknown>
type DeferredQuery = PromiseLike<Row[]> & { text: string; params: unknown[] }

const database = vi.hoisted(() => ({ sql: null as unknown }))
vi.mock('../server/db.ts', () => ({ getSql: async () => database.sql }))
vi.mock('../server/goals/service.ts', () => ({ listGoals: async () => ({ goals: [] }) }))
vi.mock('../server/body/cadence-service.ts', () => ({ loadCadenceEvidence: async () => ({ configs: [], observations: [] }) }))
vi.mock('../server/context/service.ts', () => ({ getDailyContext: async () => ({ tags: [] }) }))

import { acceptCoachTask, endCoachTask, ensureCoach, passCoachTask, readCoach } from '../server/coach/service.ts'

let directory = ''
let started = false
let pool: Pool

function localSql() {
  return {
    // Neon query promises are lazy: building a transaction cannot run the INSERT
    // before BEGIN/advisory lock. Preserve that behavior in this real-pg adapter.
    query(text: string, params: unknown[] = []): DeferredQuery {
      let result: Promise<Row[]> | undefined
      return {
        text, params,
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

async function seedSet(date: string, loadLb: number, reps: number, createdAt: string) {
  const sessionId = randomUUID()
  const appearanceId = randomUUID()
  const setId = randomUUID()
  await pool.query(`INSERT INTO workout_sessions (id, workout_date, created_at, session_type)
    VALUES ($1, $2, $3, 'ad_hoc')`, [sessionId, date, createdAt])
  await pool.query(`INSERT INTO workout_session_exercises
    (id, workout_session_id, exercise_definition_id, position) VALUES ($1, $2, $3, 1)`,
  [appearanceId, sessionId, EXERCISE])
  await pool.query(`INSERT INTO workout_sets
    (id, workout_session_exercise_id, set_number, set_type, load_state, weight_kg, reps)
    VALUES ($1, $2, 1, 'working', 'external', $3::numeric, $4)`,
  [setId, appearanceId, poundsToKilograms(loadLb).toString(), reps])
  return { sessionId, appearanceId, setId }
}

async function offeredQuest() {
  const state = await ensureCoach(NOW)
  expect(state.stretchQuest?.status).toBe('offered')
  return state.stretchQuest!
}

describe.skipIf(!existsSync(`${BIN}/initdb`))('Stretch production service on disposable Postgres', () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'health-stretch-service-'))
    execFileSync(`${BIN}/initdb`, ['-D', directory, '--username=postgres', '--auth=trust', '--no-sync'], { stdio: 'pipe' })
    execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'start', '-o', `-p ${PORT} -k ${directory} -c listen_addresses=127.0.0.1`, '-l', path.join(directory, 'server.log')], { stdio: 'pipe' })
    started = true
    pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres', max: 12 })
    database.sql = localSql()
    await pool.query(`
      CREATE TABLE goals (id UUID PRIMARY KEY);
      CREATE TABLE exercise_definitions (
        id UUID PRIMARY KEY, name TEXT NOT NULL, external_id TEXT,
        performance_type TEXT NOT NULL, analytics_load_type TEXT NOT NULL,
        analytics_rep_mode TEXT NOT NULL, measurement_kind TEXT NOT NULL,
        load_type TEXT NOT NULL, unilateral BOOLEAN NOT NULL
      );
      CREATE TABLE workout_sessions (
        id UUID PRIMARY KEY, workout_date DATE NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(), session_type TEXT NOT NULL
      );
      CREATE TABLE workout_session_exercises (
        id UUID PRIMARY KEY, workout_session_id UUID NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
        exercise_definition_id UUID NOT NULL REFERENCES exercise_definitions(id), position INT NOT NULL
      );
      CREATE TABLE workout_sets (
        id UUID PRIMARY KEY, workout_session_exercise_id UUID NOT NULL REFERENCES workout_session_exercises(id) ON DELETE CASCADE,
        set_number INT NOT NULL, set_type TEXT NOT NULL, load_state TEXT NOT NULL,
        weight_kg NUMERIC, reps INT, duration_sec INT, left_reps INT, right_reps INT,
        left_duration_sec INT, right_duration_sec INT
      );
    `)
    await pool.query(readFileSync('migrations/0035_coach_tasks.sql', 'utf8'))
    await pool.query(readFileSync('migrations/0036_stretch_quests.sql', 'utf8'))
  }, 60_000)

  afterAll(async () => {
    if (pool) await pool.end()
    if (started) execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'stop', '-m', 'immediate'], { stdio: 'pipe' })
    if (directory.startsWith(path.join(tmpdir(), 'health-stretch-service-'))) rmSync(directory, { recursive: true, force: true })
  })

  beforeEach(async () => {
    await pool.query('TRUNCATE coach_task_events, coach_tasks, workout_sets, workout_session_exercises, workout_sessions, exercise_definitions')
    await pool.query(`INSERT INTO exercise_definitions
      (id, name, external_id, performance_type, analytics_load_type, analytics_rep_mode, measurement_kind, load_type, unilateral)
      VALUES ($1, 'Bench Press', NULL, 'loaded_reps', 'external', 'standard', 'reps', 'barbell', false)`, [EXERCISE])
    await seedSet('2026-09-20', 95, 6, '2026-09-20T17:00:00.123456Z')
    await seedSet('2026-09-27', 100, 6, '2026-09-27T17:00:00.123456Z')
  })

  it('runs ensure/accept/completion SQL with full microsecond canonical provenance and deduplicates retries', async () => {
    const quest = await offeredQuest()
    const stretch = quest.metadata.stretch as Row
    const baseline = stretch.baseline as Row
    expect(baseline.sourceCreatedAt).toBe('2026-09-27T17:00:00.123456Z')
    expect(quest.targetValue).toBe(122.5)
    expect(quest.baselineValue).toBeCloseTo(120)

    const accepted = await acceptCoachTask(quest.id, NOW)
    expect(accepted.stretchQuest).toMatchObject({ status: 'active', acceptedAt: NOW.toISOString(), expiresOn: '2026-10-05' })
    await acceptCoachTask(quest.id, AFTER)
    const source = await seedSet('2026-09-29', 96, 9, '2026-09-29T20:00:00.654321Z')
    const completed = await readCoach(AFTER)
    expect(completed.stretchQuest).toMatchObject({ status: 'completed', evidenceLabel: 'Verified by Training' })
    expect(completed.stretchQuest?.progress?.current).toBeCloseTo(124.8)
    await readCoach(AFTER)
    const events = await pool.query(`SELECT event_kind, evidence, source_type, source_id
      FROM coach_task_events WHERE task_id = $1 ORDER BY occurred_at, id`, [quest.id])
    expect(events.rows.map((event) => event.event_kind).sort()).toEqual(['accepted', 'completed', 'offered'])
    expect(events.rows.find((event) => event.event_kind === 'completed')).toMatchObject({ source_type: 'workout_set', source_id: source.setId, evidence: {
      sessionId: source.sessionId, sessionExerciseId: source.appearanceId, setId: source.setId,
      reps: 9, formula: 'epley', confidence: 'high', target: 122.5,
      sessionCreatedAt: '2026-09-29T20:00:00.654321Z',
    } })
    await pool.query('DELETE FROM workout_sessions WHERE id = $1', [source.sessionId])
    expect((await readCoach(AFTER)).stretchQuest?.progress?.current).toBeCloseTo(124.8)
  })

  it('serializes concurrent cold ensures with the real advisory lock, guarded INSERT, and unique index', async () => {
    const states = await Promise.all([ensureCoach(NOW), ensureCoach(NOW), ensureCoach(NOW)])
    expect(new Set(states.map((state) => state.stretchQuest?.id)).size).toBe(1)
    expect((await pool.query("SELECT count(*)::int AS n FROM coach_tasks WHERE task_kind = 'stretch_quest'")).rows[0].n).toBe(1)
    expect((await pool.query(`SELECT count(*)::int AS n FROM coach_task_events e
      JOIN coach_tasks t ON t.id = e.task_id WHERE t.task_kind = 'stretch_quest' AND e.event_kind = 'offered'`)).rows[0].n).toBe(1)
  })

  it('executes pass/end terminal SQL and preserves cooldown independently of the terminal outcome', async () => {
    const quest = await offeredQuest()
    expect((await passCoachTask(quest.id, NOW)).stretchQuest?.status).toBe('passed')
    await passCoachTask(quest.id, NOW)
    await expect(acceptCoachTask(quest.id, NOW)).rejects.toMatchObject({ statusCode: 409 })
    expect((await ensureCoach(new Date('2026-10-06T19:00:00Z'))).stretchQuest?.id).toBe(quest.id)
    const next = (await ensureCoach(new Date('2026-10-07T19:00:00Z'))).stretchQuest!
    expect(next.id).not.toBe(quest.id)
    await acceptCoachTask(next.id, new Date('2026-10-07T19:00:00Z'))
    expect((await endCoachTask(next.id, new Date('2026-10-07T20:00:00Z'))).stretchQuest?.status).toBe('failed')
    await endCoachTask(next.id, new Date('2026-10-07T20:00:00Z'))
    expect((await pool.query(`SELECT count(*)::int AS n FROM coach_task_events
      WHERE task_id = $1 AND event_kind = 'failed'`, [next.id])).rows[0].n).toBe(1)
  })

  it('expires an offer whose canonical baseline was deleted without accepting it', async () => {
    const quest = await offeredQuest()
    await pool.query("DELETE FROM workout_sessions WHERE workout_date = '2026-09-27'")
    await expect(acceptCoachTask(quest.id, NOW)).rejects.toMatchObject({ statusCode: 409 })
    expect((await readCoach(NOW)).stretchQuest?.status).toBe('expired')
    expect((await pool.query(`SELECT evidence FROM coach_task_events
      WHERE task_id = $1 AND event_kind = 'expired'`, [quest.id])).rows[0].evidence.reason).toBe('baseline_source_unavailable')
  })
})
