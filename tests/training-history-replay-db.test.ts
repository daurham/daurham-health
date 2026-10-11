import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PERFORMED_STRENGTH_EXERCISES_SQL } from '../server/training/plan-service.ts'
import {
  buildTrainingRoutineCredits, buildTrainingWeekQualification,
  type PerformedExerciseEvidence,
} from '../src/domain/training-qualification.ts'
import { creditedSessions, deriveRoutineRotation } from '../src/domain/training-blocks.ts'

const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55447
const day = '2026-10-11'
let directory = ''
let started = false
let pool: Pool
const ids: Record<string, string> = {}
const sessions: Record<string, string> = {}
const sets: Record<string, string> = {}

type SessionKind = 'programmed' | 'ad_hoc' | 'experiment'
type SetKind = 'working' | 'warmup'
async function addExercise(name: string, measure = 'reps', performance = 'bodyweight_reps') {
  ids[name] = randomUUID()
  await pool.query(
    'INSERT INTO exercise_definitions(id, measurement_kind, performance_type) VALUES ($1,$2,$3)',
    [ids[name], measure, performance],
  )
}

async function logSet(
  label: string, date: string, exercise: string,
  options: { routine?: string | null; kind?: SessionKind; setType?: SetKind; reps?: number; completed?: boolean | null } = {},
) {
  const session = randomUUID()
  const slot = randomUUID()
  const setId = randomUUID()
  sessions[label] = session
  sets[label] = setId
  await pool.query(
    'INSERT INTO workout_sessions(id, workout_date, session_type, routine_code, created_at) VALUES ($1,$2,$3,$4,$5)',
    [session, date, options.kind ?? 'programmed', options.routine === undefined ? 'B' : options.routine,
      '2026-10-01T20:00:00Z'],
  )
  await pool.query(
    'INSERT INTO workout_session_exercises(id, workout_session_id, exercise_definition_id) VALUES ($1,$2,$3)',
    [slot, session, ids[exercise]],
  )
  await pool.query(
    'INSERT INTO workout_sets(id, workout_session_exercise_id, set_type, reps, completed) VALUES ($1,$2,$3,$4,$5)',
    [setId, slot, options.setType ?? 'working', options.reps === undefined ? 8 : options.reps,
      options.completed ?? null],
  )
}

async function evidence(start = '2026-10-05', end = day): Promise<PerformedExerciseEvidence[]> {
  const rows = await pool.query(PERFORMED_STRENGTH_EXERCISES_SQL, [start, end, null])
  return rows.rows.map((row) => ({
    date: row.date as string, exerciseId: row.exercise_id as string,
    routineCode: row.routine_code as string | null,
  }))
}

function rotation(data: PerformedExerciseEvidence[]) {
  return deriveRoutineRotation(
    [
      { routineCode: 'A', target: 6 }, { routineCode: 'B', target: 6 },
      { routineCode: 'C', target: 6 },
    ],
    { currentRoutineCode: 'B', alreadyCompletedInCurrent: 4 },
    buildTrainingRoutineCredits(data),
  )
}

describe.sequential.skipIf(!existsSync(BIN + '/initdb'))('canonical Training replay against disposable PostgreSQL', () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'health-training-history-'))
    execFileSync(BIN + '/initdb',
      ['-D', directory, '--username=postgres', '--auth=trust', '--no-sync'], { stdio: 'pipe' })
    execFileSync(BIN + '/pg_ctl', [
      '-D', directory, '-w', 'start', '-o',
      '-p ' + PORT + ' -k ' + directory + ' -c listen_addresses=127.0.0.1',
      '-l', path.join(directory, 'server.log'),
    ], { stdio: 'pipe' })
    started = true
    pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres' })
    await pool.query('CREATE TABLE exercise_definitions(id UUID PRIMARY KEY, measurement_kind TEXT, performance_type TEXT)')
    await pool.query('CREATE TABLE workout_sessions(id UUID PRIMARY KEY, workout_date DATE, session_type TEXT, routine_code TEXT, created_at TIMESTAMPTZ)')
    await pool.query('CREATE TABLE workout_session_exercises(id UUID PRIMARY KEY, workout_session_id UUID REFERENCES workout_sessions(id), exercise_definition_id UUID REFERENCES exercise_definitions(id))')
    await pool.query('CREATE TABLE workout_sets(id UUID PRIMARY KEY, workout_session_exercise_id UUID REFERENCES workout_session_exercises(id), set_type TEXT, reps INTEGER, duration_sec INTEGER, left_reps INTEGER, right_reps INTEGER, left_duration_sec INTEGER, right_duration_sec INTEGER, distance_m NUMERIC, completed BOOLEAN)')

    for (const name of ['push', 'pull', 'squat', 'lunge']) await addExercise(name)
    await addExercise('run', 'distance', 'distance')
    await addExercise('skill', 'completion', 'skill')
    await addExercise('warmup')

    // Three exercises spread across separate B sessions on Monday.
    await logSet('bpush1', '2026-10-05', 'push')
    await logSet('bpull1', '2026-10-05', 'pull')
    await logSet('bsquat1', '2026-10-05', 'squat')
    // Two B exercises + an ad-hoc third: qualifies the week, not B's block.
    await logSet('bpush2', '2026-10-07', 'push')
    await logSet('bpull2', '2026-10-07', 'pull')
    await logSet('adhoc', '2026-10-07', 'lunge', { kind: 'ad_hoc', routine: null })
    // Actual B work on Friday completes the B anchor's remaining block.
    await logSet('bpush3', '2026-10-09', 'push')
    await logSet('bpull3', '2026-10-09', 'pull')
    await logSet('bsquat3', '2026-10-09', 'squat')
    // These records are not performed working strength exercises.
    await logSet('run', '2026-10-08', 'run')
    await logSet('skill', '2026-10-08', 'skill', { reps: 0, completed: true })
    await logSet('warmup', '2026-10-08', 'warmup', { setType: 'warmup' })
    await logSet('zero', '2026-10-08', 'lunge', { reps: 0 })
    await logSet('emptyComplete', '2026-10-08', 'skill', { completed: false, reps: 0 })
  }, 60_000)

  afterAll(async () => {
    if (pool) await pool.end()
    if (started) execFileSync(BIN + '/pg_ctl',
      ['-D', directory, '-w', 'stop', '-m', 'immediate'], { stdio: 'pipe' })
    if (directory.startsWith(path.join(tmpdir(), 'health-training-history-')))
      rmSync(directory, { recursive: true, force: true })
  })

  it('credits one weekly day per date, B only for its own 3 exercises, never phantom activities', async () => {
    const data = await evidence()
    const week = buildTrainingWeekQualification(data, day)
    expect(week.completedDays).toBe(3)
    expect(week.days.find((d) => d.date === '2026-10-08')?.qualifies).toBe(false)
    expect(buildTrainingRoutineCredits(data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ date: '2026-10-05', routineCode: 'B' }),
      expect.objectContaining({ date: '2026-10-09', routineCode: 'B' }),
    ]))
    expect(buildTrainingRoutineCredits(data)).toHaveLength(2)
    const state = rotation(data)
    expect(state.currentRoutineCode).toBe('C')
    const b = state.routines.find((r) => r.routineCode === 'B')!
    expect(creditedSessions(b.blocks[0]!)).toBe(6)
    expect(b.blocks[0]?.status).toBe('completed')
  })

  it('replays a deleted working set and retracts a qualification/block credit rather than writing another', async () => {
    await pool.query('DELETE FROM workout_sets WHERE id = $1::uuid', [sets['bsquat3']])
    const data = await evidence()
    expect(buildTrainingWeekQualification(data, day).completedDays).toBe(2)
    const state = rotation(data)
    expect(state.currentRoutineCode).toBe('B')
    expect(creditedSessions(state.routines.find((r) => r.routineCode === 'B')!.activeBlock)).toBe(5)
    expect(buildTrainingRoutineCredits(data)).toHaveLength(1)
  })

  it('uses the edited workout date and historical as-of cutoff without cumulative progress', async () => {
    await pool.query('UPDATE workout_sessions SET workout_date = $1::date WHERE id = $2::uuid',
      ['2026-10-12', sessions['bpull1']])
    const data = await evidence()
    expect(buildTrainingWeekQualification(data, day).completedDays).toBe(1)
    expect(buildTrainingRoutineCredits(data)).toEqual([])
    const state = rotation(data)
    expect(state.currentRoutineCode).toBe('B')
    expect(creditedSessions(state.routines.find((r) => r.routineCode === 'B')!.activeBlock)).toBe(4)
    expect((await evidence('2026-10-12', '2026-10-12')).some((e) => e.exerciseId === ids['pull'])).toBe(true)
  })

  it('does not scan beyond a supplied creation cutoff for new-version attribution', async () => {
    expect((await pool.query(PERFORMED_STRENGTH_EXERCISES_SQL,
      ['2026-10-05', day, '2026-10-08T00:00:00Z'])).rows).toHaveLength(0)
  })
})
