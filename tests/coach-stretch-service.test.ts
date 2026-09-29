import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addCalendarDays } from '../src/domain/progress/dates.ts'
import { poundsToKilograms } from '../src/domain/units.ts'

type Row = Record<string, unknown>
type Event = { task_id: string; event_kind: string; evidence_kind: string; evidence: Row; source_type: unknown; source_id: unknown }

const state = vi.hoisted(() => ({
  tasks: [] as Row[],
  events: [] as Event[],
  sets: [] as Row[],
  tags: [] as string[],
  queries: [] as string[],
  deleteSourceAtTransition: false,
}))

vi.mock('../server/goals/service.ts', () => ({ listGoals: async () => ({ goals: [] }) }))
vi.mock('../server/body/cadence-service.ts', () => ({ loadCadenceEvidence: async () => ({ configs: [], observations: [] }) }))
vi.mock('../server/context/service.ts', () => ({ getDailyContext: async () => ({ tags: state.tags }) }))

function fromCandidate(params: unknown[], stretch: boolean): Row {
  return {
    id: params[0], task_kind: params[1], rule_key: params[2], rule_version: params[3],
    domain: params[4], title: params[5], detail: params[6], starts_on: params[7], expires_on: params[8],
    period_fingerprint: params[9], goal_id: params[10], verification_mode: params[11],
    action_kind: params[12], action_href: params[13], target_value: params[14], target_unit: params[15],
    baseline_value: params[16], difficulty: params[17], reward_band: params[18],
    metadata: JSON.parse(String(params[19])), status: stretch ? 'offered' : 'active',
    accepted_at: null, completed_at: null, closed_at: null,
    created_at: stretch ? params[20] : '2026-09-29T19:00:00.000Z', updated_at: '2026-09-29T19:00:00.000Z',
  }
}

vi.mock('../server/db.ts', () => ({
  getSql: async () => {
    const sql = {
      query: async (query: string, params: unknown[] = []) => {
        state.queries.push(query)
        if (query.includes('sessions.created_at <= $3::timestamptz')) {
          return state.sets.filter((set) =>
            String(set.session_date) >= String(params[0]) && String(set.session_date) <= String(params[1]) &&
            new Date(String(set.session_created_at)).getTime() <= new Date(String(params[2])).getTime())
        }
        if (query.includes('WITH inserted AS')) {
          const candidate = fromCandidate(params, true)
          const cutoff = addCalendarDays(String(candidate.starts_on), -Number(params[22]))
          if (!state.tasks.some((task) => task.task_kind === 'stretch_quest' &&
              (task.status === 'offered' || task.status === 'active' || String(task.starts_on) > cutoff))) {
            state.tasks.push(candidate)
            state.events.push({ task_id: String(candidate.id), event_kind: 'offered', evidence_kind: 'none', evidence: {}, source_type: null, source_id: null })
          }
          return []
        }
        if (query.includes('WITH changed AS')) {
          if (state.deleteSourceAtTransition) {
            state.sets = state.sets.filter((set) => set.set_id !== params[12])
            state.deleteSourceAtTransition = false
          }
          if (params[1] === 'active' || params[1] === 'completed') {
            const set = state.sets.find((set) => set.set_id === params[12] &&
              set.session_id === params[13] && set.session_exercise_id === params[14] && set.exercise_id === params[15])
            if (!set) return []
          }
          const task = state.tasks.find((task) => task.id === params[0] && task.status === params[5])
          if (!task) return []
          task.status = params[1]
          task.expires_on = params[3]
          task.metadata = JSON.parse(String(params[4]))
          task.updated_at = params[2]
          if (params[1] === 'active') task.accepted_at = params[2]
          if (params[1] === 'completed') task.completed_at = params[2]
          task.closed_at = params[1] === 'active' ? null : params[2]
          state.events.push({
            task_id: String(task.id), event_kind: String(params[7]), evidence_kind: String(params[8]),
            source_type: params[9], source_id: params[10], evidence: JSON.parse(String(params[11])),
          })
          return [{ id: task.id }]
        }
        if (query.includes('FROM coach_tasks') && query.includes("WHERE (status = 'active'")) {
          return state.tasks.filter((task) => (task.status === 'active' ||
            (task.task_kind === 'stretch_quest' && task.status === 'offered')) && String(task.starts_on) <= String(params[0]))
        }
        if (query.includes('FROM coach_tasks') && query.includes('WHERE id = $1::uuid')) {
          return state.tasks.filter((task) => task.id === params[0]).slice(0, 1)
        }
        if (query.includes('FROM coach_tasks') && query.includes('WHERE task_kind = $1 AND starts_on = $2::date')) {
          return state.tasks.filter((task) => task.task_kind === params[0] && task.starts_on === params[1]).slice(0, 1)
        }
        if (query.includes('FROM coach_tasks') && query.includes("WHERE task_kind = 'stretch_quest'")) {
          const rows = state.tasks.filter((task) => task.task_kind === 'stretch_quest' && String(task.starts_on) <= String(params[0]))
          const ordered = [...rows].sort((a, b) => {
            const aCurrent = ['offered', 'active'].includes(String(a.status)) ? 1 : 0
            const bCurrent = ['offered', 'active'].includes(String(b.status)) ? 1 : 0
            return bCurrent - aCurrent || String(b.starts_on).localeCompare(String(a.starts_on))
          })
          return query.includes('LIMIT 1') ? ordered.slice(0, 1) : rows
        }
        if (query.includes('SELECT rule_key, starts_on::text AS starts_on')) return []
        if (query.includes('FROM coach_task_events')) {
          const event = state.events.find((event) => event.task_id === params[0] && event.event_kind === 'completed')
          return event ? [event] : []
        }
        if (query.includes('INSERT INTO coach_tasks')) {
          const candidate = fromCandidate(params, false)
          if (!state.tasks.some((task) => task.task_kind === candidate.task_kind && task.starts_on === candidate.starts_on)) state.tasks.push(candidate)
          return []
        }
        if (query.includes('INSERT INTO coach_task_events')) {
          if (!state.events.some((event) => event.task_id === params[1] && event.event_kind === params[2])) {
            state.events.push({ task_id: String(params[1]), event_kind: String(params[2]), evidence_kind: String(params[3]), evidence: {}, source_type: null, source_id: null })
          }
          return []
        }
        if (query.includes("SET status = 'expired'")) {
          const task = state.tasks.find((task) => task.id === params[0] && task.status === 'active')
          if (task) task.status = 'expired'
          return task ? [{ id: task.id }] : []
        }
        return []
      },
      transaction: async (queries: Promise<unknown>[]) => Promise.all(queries),
    }
    return sql
  },
}))

import { acceptCoachTask, endCoachTask, ensureCoach, logCoachSelfReport, logCoachTraining, passCoachTask, readCoach } from '../server/coach/service.ts'

const NOW = new Date('2026-09-29T19:00:00.000Z')
const AFTER = new Date('2026-09-29T21:00:00.000Z')

function strengthSet(id: string, date: string, weightLb: number, reps: number, createdAt = `${date}T17:00:00.000Z`): Row {
  return {
    set_id: id, session_id: `session-${id}`, session_exercise_id: `exercise-${id}`,
    exercise_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Bench Press', external_id: 'bench',
    performance_type: 'loaded_reps', analytics_load_type: 'external', analytics_rep_mode: 'standard',
    measurement_kind: 'reps', load_type: 'external', unilateral: false,
    session_date: date, session_created_at: createdAt, session_type: 'ad_hoc', session_exercise_position: 1,
    set_number: 1, set_type: 'working', load_state: 'external', weight_kg: String(poundsToKilograms(weightLb)),
    reps, duration_sec: null, left_reps: null, right_reps: null, left_duration_sec: null, right_duration_sec: null,
  }
}

async function offer() {
  const result = await ensureCoach(NOW)
  expect(result.stretchQuest?.status).toBe('offered')
  return result.stretchQuest!
}

describe('Stretch Coach canonical persistence lifecycle', () => {
  beforeEach(() => {
    state.tasks = []
    state.events = []
    state.tags = []
    state.queries = []
    state.deleteSourceAtTransition = false
    state.sets = [strengthSet('prior', '2026-09-20', 95, 6), strengthSet('baseline', '2026-09-27', 100, 6)]
  })

  it('offers once across repeated/concurrent ensures and freezes one canonical baseline/target', async () => {
    const results = await Promise.all([ensureCoach(NOW), ensureCoach(NOW), ensureCoach(NOW)])
    expect(new Set(results.map((result) => result.stretchQuest?.id)).size).toBe(1)
    expect(state.tasks.filter((task) => task.task_kind === 'stretch_quest')).toHaveLength(1)
    expect(state.events.filter((event) => event.event_kind === 'offered' && state.tasks.find((task) => task.id === event.task_id)?.task_kind === 'stretch_quest')).toHaveLength(1)
    expect(results[0].stretchQuest).toMatchObject({ targetValue: 122.5, acceptedAt: null, expiresOn: '2026-10-01' })
    expect(results[0].stretchQuest?.baselineValue).toBeCloseTo(120)
    expect(state.queries.some((query) => query.includes('pg_advisory_xact_lock'))).toBe(true)
    expect(state.queries.some((query) => query.includes('NOT EXISTS') && query.includes('$23::int'))).toBe(true)
  })

  it('explicitly accepts once and never refreshes the seven-day window', async () => {
    const quest = await offer()
    const accepted = await acceptCoachTask(quest.id, NOW)
    const retry = await acceptCoachTask(quest.id, AFTER)
    expect(accepted.stretchQuest).toMatchObject({ status: 'active', acceptedAt: NOW.toISOString(), expiresOn: '2026-10-05', targetValue: 122.5 })
    expect(accepted.stretchQuest?.baselineValue).toBeCloseTo(120)
    expect(retry.stretchQuest?.acceptedAt).toBe(NOW.toISOString())
    expect(state.events.filter((event) => event.event_kind === 'accepted')).toHaveLength(1)
    await expect(passCoachTask(quest.id, AFTER)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('passes offered quests and ends accepted quests with one neutral terminal event', async () => {
    const quest = await offer()
    await expect(endCoachTask(quest.id, NOW)).rejects.toMatchObject({ statusCode: 409 })
    await passCoachTask(quest.id, NOW)
    await passCoachTask(quest.id, NOW)
    expect(state.events.filter((event) => event.event_kind === 'passed')).toHaveLength(1)
    await expect(acceptCoachTask(quest.id, NOW)).rejects.toMatchObject({ statusCode: 409 })

    state.tasks = []; state.events = []
    const second = await offer()
    await acceptCoachTask(second.id, NOW)
    await endCoachTask(second.id, NOW)
    await endCoachTask(second.id, NOW)
    expect(state.events.filter((event) => event.event_kind === 'failed')).toHaveLength(1)
    expect(state.sets).toHaveLength(2)
  })

  it('expires an unaccepted offer and rejects acceptance after reconciliation', async () => {
    const quest = await offer()
    const expiredAt = new Date('2026-10-02T19:00:00.000Z')
    await expect(acceptCoachTask(quest.id, expiredAt)).rejects.toMatchObject({ statusCode: 409 })
    expect((await readCoach(expiredAt)).stretchQuest?.status).toBe('expired')
    expect(state.events.filter((event) => event.event_kind === 'expired' && event.task_id === quest.id)).toHaveLength(1)
  })

  it('fails an unmet accepted challenge after its final Phoenix day', async () => {
    const quest = await offer()
    await acceptCoachTask(quest.id, NOW)
    expect((await readCoach(new Date('2026-10-06T06:59:59.000Z'))).stretchQuest?.status).toBe('active')
    expect((await readCoach(new Date('2026-10-06T07:00:00.000Z'))).stretchQuest?.status).toBe('failed')
    await readCoach(new Date('2026-10-06T19:00:00.000Z'))
    expect(state.events.filter((event) => event.event_kind === 'failed')).toHaveLength(1)
  })

  it('completes from a lower-load high-confidence rep combination and persists exact evidence once', async () => {
    const quest = await offer()
    await acceptCoachTask(quest.id, NOW)
    state.sets.push(strengthSet('attempt', '2026-09-29', 96, 9, '2026-09-29T20:00:00.123456Z'))
    const completed = await readCoach(AFTER)
    expect(completed.stretchQuest).toMatchObject({ status: 'completed', evidenceLabel: 'Verified by Training' })
    expect(completed.stretchQuest?.progress?.current).toBeCloseTo(124.8)
    const events = state.events.filter((event) => event.event_kind === 'completed')
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ source_type: 'workout_set', source_id: 'attempt', evidence: { sessionId: 'session-attempt', sessionExerciseId: 'exercise-attempt', setId: 'attempt', exerciseId: quest.metadata.stretch && (quest.metadata.stretch as Row).exerciseId, reps: 9, target: 122.5, formula: 'epley', confidence: 'high' } })
    expect(events[0].evidence.baseline).toBeCloseTo(120)
    expect(events[0].evidence.loadKg).toBeCloseTo(poundsToKilograms(96))
    expect(events[0].evidence.sessionCreatedAt).toBe('2026-09-29T20:00:00.123456Z')
    expect(state.queries.some((query) => query.includes('SS.US'))).toBe(true)
    await readCoach(AFTER)
    expect(state.events.filter((event) => event.event_kind === 'completed')).toHaveLength(1)
    state.sets = []
    expect((await readCoach(AFTER)).stretchQuest?.progress?.current).toBeCloseTo(124.8)
  })

  it('surfaces a new canonical PR below the target without completing', async () => {
    const quest = await offer()
    await acceptCoachTask(quest.id, NOW)
    state.sets.push(strengthSet('attempt', '2026-09-29', 101.5, 6, '2026-09-29T20:00:00.000Z'))
    const result = await readCoach(AFTER)
    expect(result.stretchQuest?.status).toBe('active')
    expect(result.stretchQuest?.progress).toMatchObject({ current: 121.8, label: 'New PR · Quest not conquered yet' })
    expect(state.events.filter((event) => event.event_kind === 'completed')).toHaveLength(0)
  })

  it('requires high-confidence estimates and the performance target instead of literal bar load', async () => {
    const quest = await offer()
    await acceptCoachTask(quest.id, NOW)
    state.sets.push(strengthSet('heavier', '2026-09-29', 110, 1, '2026-09-29T20:00:00.000Z'))
    state.sets.push(strengthSet('low-confidence', '2026-09-29', 200, 15, '2026-09-29T20:00:00.000Z'))
    expect((await readCoach(AFTER)).stretchQuest?.status).toBe('active')
  })

  it('freezes exercise classification and never verifies a reinterpreted rep mode', async () => {
    const quest = await offer()
    await acceptCoachTask(quest.id, NOW)
    state.sets.push({ ...strengthSet('attempt', '2026-09-29', 200, 6, '2026-09-29T20:00:00.000Z'),
      analytics_rep_mode: 'per_side', left_reps: 6, right_reps: 6 })
    state.sets = state.sets.map((set) => ({ ...set, analytics_rep_mode: 'per_side' }))
    const result = await readCoach(AFTER)
    expect(result.stretchQuest?.status).toBe('active')
    expect(result.stretchQuest?.progress?.current).toBeNull()
    expect(state.events.filter((event) => event.event_kind === 'completed')).toHaveLength(0)
    expect(state.queries.some((query) => query.includes('exercises.analytics_rep_mode = $30'))).toBe(true)
  })

  it('invalidates deleted/edited baseline sources only while the offer is unaccepted', async () => {
    const quest = await offer()
    state.sets = state.sets.filter((set) => set.set_id !== 'baseline')
    await expect(acceptCoachTask(quest.id, NOW)).rejects.toMatchObject({ statusCode: 409 })
    expect((await readCoach(NOW)).stretchQuest?.status).toBe('expired')
    expect(state.events.find((event) => event.task_id === quest.id && event.event_kind === 'expired')?.evidence.reason).toBe('baseline_source_unavailable')

    state.tasks = []; state.events = []
    state.sets = [strengthSet('prior', '2026-09-20', 95, 6), strengthSet('baseline', '2026-09-27', 100, 6)]
    const second = await offer()
    await acceptCoachTask(second.id, NOW)
    state.sets = []
    const stillActive = (await readCoach(AFTER)).stretchQuest
    expect(stillActive).toMatchObject({ status: 'active', targetValue: 122.5 })
    expect(stillActive?.baselineValue).toBeCloseTo(120)
  })

  it('fails closed when baseline/attempt sources disappear between evaluation and the atomic transition', async () => {
    const quest = await offer()
    state.deleteSourceAtTransition = true
    await expect(acceptCoachTask(quest.id, NOW)).rejects.toMatchObject({ statusCode: 409 })
    expect((await readCoach(NOW)).stretchQuest?.status).toBe('expired')
    expect(state.events.filter((event) => event.event_kind === 'accepted')).toHaveLength(0)

    state.tasks = []; state.events = []
    state.sets = [strengthSet('prior', '2026-09-20', 95, 6), strengthSet('baseline', '2026-09-27', 100, 6)]
    const second = await offer()
    await acceptCoachTask(second.id, NOW)
    state.sets.push(strengthSet('attempt', '2026-09-29', 200, 6, '2026-09-29T20:00:00.000Z'))
    state.deleteSourceAtTransition = true
    expect((await readCoach(AFTER)).stretchQuest?.status).toBe('active')
    expect(state.events.filter((event) => event.event_kind === 'completed')).toHaveLength(0)
    expect(state.queries.some((query) => query.includes('sets.weight_kg IS NOT DISTINCT FROM $17::numeric'))).toBe(true)
  })

  it('uses existing canonical attempts and excludes deleted, preacceptance and backdated out-of-window work', async () => {
    const quest = await offer()
    await acceptCoachTask(quest.id, NOW)
    state.sets.push(strengthSet('old-capture', '2026-09-29', 200, 6, '2026-09-29T18:00:00.000Z'))
    state.sets.push(strengthSet('backdated', '2026-09-28', 200, 6, '2026-09-29T20:00:00.000Z'))
    const removable = strengthSet('deleted', '2026-09-29', 200, 6, '2026-09-29T20:00:00.000Z')
    state.sets.push(removable)
    state.sets = state.sets.filter((set) => set !== removable)
    expect((await readCoach(AFTER)).stretchQuest?.status).toBe('active')
    state.sets.push(strengthSet('late-backdate', '2026-10-05', 200, 6, '2026-10-06T08:00:00.000Z'))
    expect((await readCoach(new Date('2026-10-06T19:00:00.000Z'))).stretchQuest?.status).toBe('failed')
  })

  it.each(['passed', 'failed', 'completed', 'expired'] as const)('preserves the eight-day offer cooldown after %s', async (terminal) => {
    const quest = await offer()
    if (terminal === 'passed') await passCoachTask(quest.id, NOW)
    if (terminal === 'failed') { await acceptCoachTask(quest.id, NOW); await endCoachTask(quest.id, NOW) }
    if (terminal === 'completed') {
      await acceptCoachTask(quest.id, NOW)
      state.sets.push(strengthSet('attempt', '2026-09-29', 100, 7, '2026-09-29T20:00:00.000Z'))
      await readCoach(AFTER)
    }
    if (terminal === 'expired') await readCoach(new Date('2026-10-02T19:00:00.000Z'))
    expect((await ensureCoach(new Date('2026-10-06T19:00:00.000Z'))).stretchQuest?.id).toBe(quest.id)
    const next = await ensureCoach(new Date('2026-10-07T19:00:00.000Z'))
    expect(next.stretchQuest?.id).not.toBe(quest.id)
    expect(next.stretchQuest?.status).toBe('offered')
  })

  it('suppresses offers for the bounded Daily Context tags', async () => {
    state.tags = ['unusual_stress']
    expect((await ensureCoach(NOW)).stretchQuest).toBeNull()
  })

  it.each(['reps', 'reps_per_side', 'duration', 'duration_per_side'] as const)(
    'verifies %s from exact canonical sets, distinguishes below-target PR, and preserves side evidence',
    async (measurement) => {
      const reps = measurement.startsWith('reps')
      const perSide = measurement.endsWith('_per_side')
      const baseline = reps ? 42 : 95
      const target = reps ? 45 : 100
      function unloaded(id: string, date: string, value: number, createdAt = `${date}T17:00:00.000Z`) {
        return {
          ...strengthSet(id, date, 0, 1, createdAt),
          name: reps ? 'Bodyweight Squat' : 'Yoga Hold', external_id: null,
          performance_type: 'other', analytics_load_type: 'none', analytics_rep_mode: 'standard',
          measurement_kind: measurement, load_type: reps ? 'bodyweight' : 'none',
          load_state: 'bodyweight', weight_kg: null, unilateral: perSide,
          reps: reps && !perSide ? value : null,
          duration_sec: !reps && !perSide ? value : null,
          left_reps: reps && perSide ? value : null,
          right_reps: reps && perSide ? value + 4 : null,
          left_duration_sec: !reps && perSide ? value : null,
          right_duration_sec: !reps && perSide ? value + 20 : null,
        }
      }
      state.sets = [unloaded('prior', '2026-09-20', baseline - 5), unloaded('baseline', '2026-09-27', baseline)]
      const quest = await offer()
      expect(quest).toMatchObject({ baselineValue: baseline, targetValue: target, targetUnit: reps ? 'reps' : 'sec' })
      await acceptCoachTask(quest.id, NOW)
      state.sets.push(unloaded('below', '2026-09-29', target - 1, '2026-09-29T20:00:00.000Z'))
      expect((await readCoach(AFTER)).stretchQuest).toMatchObject({ status: 'active', progress: { current: target - 1, label: 'New PR · Quest not conquered yet' } })
      expect(state.events.filter((event) => event.event_kind === 'completed')).toHaveLength(0)
      state.sets.push(unloaded('met', '2026-09-29', target, '2026-09-29T20:30:00.000Z'))
      const result = await readCoach(AFTER)
      expect(result.stretchQuest).toMatchObject({ status: 'completed', progress: { current: target }, evidenceLabel: 'Verified by Training' })
      const completed = state.events.find((event) => event.event_kind === 'completed')!
      expect(completed).toMatchObject({ source_type: 'workout_set', source_id: 'met', evidence: { sessionId: 'session-met', sessionExerciseId: 'exercise-met', setId: 'met', value: target, strategy: reps ? 'reps' : 'duration' } })
      if (perSide) expect(completed.evidence[reps ? 'rightReps' : 'rightDurationSec']).toBe(target + (reps ? 4 : 20))
      else expect(completed.evidence[reps ? 'reps' : 'durationSec']).toBe(target)
    },
  )

  it('never completes offered work or session duration lacking an exercise-set performance', async () => {
    const quest = await offer()
    state.sets.push(strengthSet('unaccepted', '2026-09-29', 200, 6, '2026-09-29T20:00:00.000Z'))
    expect((await readCoach(AFTER)).stretchQuest?.status).toBe('offered')
    await acceptCoachTask(quest.id, AFTER)
    expect((await readCoach(AFTER)).stretchQuest?.status).toBe('active')
    expect(state.events.filter((event) => event.event_kind === 'completed')).toHaveLength(0)

    state.tasks = []; state.events = []
    state.sets = state.sets.map((set) => ({ ...set, performance_type: 'other', analytics_load_type: 'none',
      measurement_kind: 'duration', load_type: 'none', load_state: 'bodyweight',
      weight_kg: null, reps: null, duration_sec: null, duration_min: 100 }))
    expect((await ensureCoach(AFTER)).stretchQuest).toBeNull()
  })

  it('rejects Daily acceptance and manual logging for canonical Stretch challenges', async () => {
    const ensured = await ensureCoach(NOW)
    await expect(acceptCoachTask(ensured.dailyQuest!.id, NOW)).rejects.toMatchObject({ statusCode: 409 })
    const quest = ensured.stretchQuest!
    const submissionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
    await expect(logCoachTraining(quest.id, { submissionId, actualValue: 200 }, NOW)).rejects.toMatchObject({ statusCode: 409 })
    await acceptCoachTask(quest.id, NOW)
    await expect(logCoachTraining(quest.id, { submissionId, actualValue: 200 }, NOW)).rejects.toMatchObject({ statusCode: 409 })
    await expect(logCoachSelfReport(quest.id, { submissionId, durationMin: 20 }, NOW)).rejects.toMatchObject({ statusCode: 409 })
  })
})
