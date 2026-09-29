import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestTask = {
  id: string
  task_kind: string
  rule_key: string
  starts_on: string
  status: string
  completed_at: string | null
  closed_at: string | null
  [key: string]: unknown
}

type TestEvent = {
  task_id: string
  event_kind: string
  evidence_kind: string
  idempotency_key: string
}

const state = vi.hoisted(() => ({
  tasks: [] as TestTask[],
  events: [] as TestEvent[],
  workout: null as null | { id: string; actual: number },
  goals: [] as Array<Record<string, unknown>>,
  cadence: { configs: [] as Array<Record<string, unknown>>, observations: [] as Array<Record<string, unknown>> },
  activitySteps: null as number | null,
  proteinTotal: null as number | null,
  trainingSessions: [] as Array<{ id: string; workout_date: string }>,
  bodySession: null as null | { session_id: string; measured_date: string },
  transactionCount: 0,
}))

vi.mock('../server/goals/service.ts', () => ({
  listGoals: async () => ({ goals: state.goals, asOf: '2026-09-29', catalog: {} }),
}))

vi.mock('../server/body/cadence-service.ts', () => ({
  loadCadenceEvidence: async () => state.cadence,
}))

vi.mock('../server/context/service.ts', () => ({
  getDailyContext: async () => null,
}))

vi.mock('../server/training/owner-exercises.ts', () => ({
  ensureOwnerExercise: async () => ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Jumping Jacks',
    externalId: null,
    measurementKind: 'reps',
    loadType: 'bodyweight',
    unilateral: false,
    metadata: { origin: 'owner' },
    isActive: true,
    performanceType: 'other',
    analyticsLoadType: 'none',
    analyticsRepMode: 'total',
    createdAt: '2026-09-29T00:00:00.000Z',
    updatedAt: '2026-09-29T00:00:00.000Z',
  }),
}))

vi.mock('../server/training/service.ts', () => ({
  parseManualWorkoutRequest: (body: unknown) => body,
  prepareManualSession: (input: { request: { workoutDate: string }; sessionId: string }) => ({
    sessionId: input.sessionId,
    workoutDate: input.request.workoutDate,
  }),
  buildSessionInsertQueries: (
    sql: { query: (text: string, params?: unknown[]) => Promise<unknown> },
    prepared: { sessionId: string },
  ) => [
    sql.query('INSERT INTO workout_sessions /* coach-test */', [prepared.sessionId]),
  ],
}))

function taskFromParams(params: unknown[]) {
  const now = '2026-09-29T19:00:00.000Z'
  return {
    id: String(params[0]),
    task_kind: String(params[1]),
    rule_key: String(params[2]),
    rule_version: Number(params[3]),
    domain: String(params[4]),
    title: String(params[5]),
    detail: String(params[6]),
    starts_on: String(params[7]),
    expires_on: String(params[8]),
    period_fingerprint: String(params[9]),
    goal_id: params[10] == null ? null : String(params[10]),
    verification_mode: String(params[11]),
    action_kind: String(params[12]),
    action_href: params[13] == null ? null : String(params[13]),
    target_value: params[14] == null ? null : String(params[14]),
    target_unit: params[15] == null ? null : String(params[15]),
    baseline_value: params[16] == null ? null : String(params[16]),
    difficulty: String(params[17]),
    reward_band: String(params[18]),
    status: 'active',
    completed_at: null,
    closed_at: null,
    metadata: JSON.parse(String(params[19])),
    created_at: now,
    updated_at: now,
  }
}

function seedSelfReportTask() {
  state.tasks.push({
    id: '22222222-2222-4222-8222-222222222222',
    task_kind: 'daily_quest',
    rule_key: 'manual:health-journal:10m',
    rule_version: 1,
    domain: 'mind',
    title: 'Journal about your health for 10 minutes',
    detail: 'Reflect.',
    starts_on: '2026-09-29',
    expires_on: '2026-09-29',
    period_fingerprint: 'coach:daily_quest:2026-09-29:manual:health-journal:10m:v1',
    goal_id: null,
    verification_mode: 'owner_self_report',
    action_kind: 'log_self_report',
    action_href: null,
    target_value: '10',
    target_unit: 'min',
    baseline_value: null,
    difficulty: 'routine',
    reward_band: 'routine',
    status: 'active',
    completed_at: null,
    closed_at: null,
    metadata: { general: true, selfReportKind: 'health_journal' },
    created_at: '2026-09-29T00:00:00.000Z',
    updated_at: '2026-09-29T00:00:00.000Z',
  })
}

vi.mock('../server/db.ts', () => ({
  getSql: async () => {
    const sql = {
      query: async (text: string, params: unknown[] = []) => {
        if (text.includes('INSERT INTO workout_sessions /* coach-test */')) {
          state.workout = { id: String(params[0]), actual: 100 }
          return []
        }

        if (text.includes('SELECT id::text AS id FROM workout_sessions WHERE id')) {
          return state.workout?.id === String(params[0]) ? [{ id: state.workout.id }] : []
        }

        if (text.includes('JOIN exercise_definitions') && text.includes('GROUP BY sessions.id')) {
          return state.workout ? [{ session_id: state.workout.id, actual: String(state.workout.actual) }] : []
        }

        if (text.includes('SELECT id::text AS id, workout_date::text AS workout_date')) {
          return state.trainingSessions
        }

        if (text.includes('FROM activity_daily_summaries') && text.includes('summary_date = $1::date')) {
          return state.activitySteps == null ? [] : [{ steps: String(state.activitySteps) }]
        }

        if (text.includes('FROM activity_daily_summaries') && text.includes('summary_date BETWEEN')) {
          return state.activitySteps == null ? [] : [{ steps: String(state.activitySteps) }]
        }

        if (text.includes('FROM nutrition_entries') && text.includes('WHERE log_date = $1::date')) {
          return [{ unknown: state.proteinTotal == null, total: state.proteinTotal == null ? null : String(state.proteinTotal) }]
        }

        if (text.includes('FROM nutrition_entries') && text.includes('log_date BETWEEN')) {
          return state.proteinTotal == null
            ? []
            : [{ date: '2026-09-29', unknown: false, total: String(state.proteinTotal) }]
        }

        if (text.includes('FROM body_metrics') && text.includes('measurement_session_id')) {
          return state.bodySession ? [state.bodySession] : []
        }

        if (text.includes('FROM coach_tasks') && text.includes("WHERE status = 'active'")) {
          return state.tasks.filter((task) => task.status === 'active')
        }

        if (text.includes('FROM coach_tasks') && text.includes('WHERE task_kind = $1 AND starts_on = $2::date')) {
          return state.tasks.filter((task) => task.task_kind === params[0] && task.starts_on === params[1]).slice(0, 1)
        }

        if (text.includes('FROM coach_tasks') && text.includes('WHERE id = $1::uuid')) {
          return state.tasks.filter((task) => task.id === params[0]).slice(0, 1)
        }

        if (text.includes('SELECT rule_key, starts_on::text AS starts_on')) {
          return state.tasks
            .filter((task) => task.task_kind === 'daily_quest' && task.starts_on < String(params[0]))
            .map((task) => ({ rule_key: task.rule_key, starts_on: task.starts_on }))
        }

        if (text.includes('SELECT evidence_kind') && text.includes('FROM coach_task_events')) {
          const event = [...state.events].reverse().find((item) => item.task_id === params[0] && item.event_kind === 'completed')
          return event ? [{ evidence_kind: event.evidence_kind }] : []
        }

        if (text.includes('INSERT INTO coach_tasks')) {
          const next = taskFromParams(params)
          if (!state.tasks.some((task) => task.task_kind === next.task_kind && task.starts_on === next.starts_on)) {
            state.tasks.push(next)
          }
          return []
        }

        if (text.includes('INSERT INTO coach_task_events')) {
          const taskId = String(params[1])
          const explicit = typeof params[2] === 'string' && ['offered', 'completed', 'passed', 'expired'].includes(String(params[2]))
          const eventKind = explicit
            ? String(params[2])
            : text.includes("'passed'")
              ? 'passed'
              : text.includes("'expired'")
                ? 'expired'
                : 'completed'
          const evidenceKind = explicit
            ? String(params[3])
            : text.includes("'training_session'")
              ? 'training_session'
              : text.includes("'owner_self_report'")
                ? 'owner_self_report'
                : 'none'
          const key = String(params.at(-1))
          if (!state.events.some((event) => event.task_id === taskId && event.idempotency_key === key)) {
            state.events.push({ task_id: taskId, event_kind: eventKind, evidence_kind: evidenceKind, idempotency_key: key })
          }
          return []
        }

        if (text.includes("SET status = 'passed'")) {
          const task = state.tasks.find((item) => item.id === params[0] && item.status === 'active')
          if (task) {
            task.status = 'passed'
            task.closed_at = '2026-09-29T19:00:00.000Z'
          }
          return task ? [{ id: task.id }] : []
        }

        if (text.includes("SET status = 'completed'")) {
          const task = state.tasks.find((item) => item.id === params[0] && item.status === 'active')
          if (task) {
            task.status = 'completed'
            task.completed_at = '2026-09-29T19:00:00.000Z'
            task.closed_at = '2026-09-29T19:00:00.000Z'
          }
          return task ? [{ id: task.id }] : []
        }

        if (text.includes("SET status = 'expired'")) {
          const task = state.tasks.find((item) => item.id === params[0] && item.status === 'active')
          if (task) task.status = 'expired'
          return task ? [{ id: task.id }] : []
        }

        return []
      },
      transaction: async (queries: Promise<unknown>[]) => {
        state.transactionCount += 1
        return Promise.all(queries)
      },
    }
    return sql
  },
}))

import {
  ensureCoach,
  logCoachSelfReport,
  logCoachTraining,
  passCoachTask,
} from '../server/coach/service.ts'

const NOW = new Date('2026-09-29T19:00:00.000Z')

describe('Coach persistence service', () => {
  beforeEach(() => {
    state.tasks = []
    state.events = []
    state.workout = null
    state.goals = []
    state.cadence = { configs: [], observations: [] }
    state.activitySteps = null
    state.proteinTotal = null
    state.trainingSessions = []
    state.bodySession = null
    state.transactionCount = 0
  })

  it('ensures one frozen Daily Quest and does not reroll after pass', async () => {
    const first = await ensureCoach(NOW)
    const second = await ensureCoach(NOW)
    expect(first.dailyQuest?.id).toBe(second.dailyQuest?.id)
    expect(state.tasks.filter((task) => task.task_kind === 'daily_quest')).toHaveLength(1)
    expect(state.events.filter((event) => event.event_kind === 'offered')).toHaveLength(1)

    const passed = await passCoachTask(first.dailyQuest!.id, NOW)
    expect(passed.dailyQuest?.status).toBe('passed')
    const again = await ensureCoach(NOW)
    expect(again.dailyQuest?.id).toBe(first.dailyQuest?.id)
    expect(again.dailyQuest?.status).toBe('passed')
    expect(state.tasks.filter((task) => task.task_kind === 'daily_quest')).toHaveLength(1)
  })

  it('requires the journal duration and records explicit owner self-report evidence', async () => {
    seedSelfReportTask()
    const id = state.tasks[0]!.id
    await expect(
      logCoachSelfReport(id, {
        submissionId: '33333333-3333-4333-8333-333333333333',
        durationMin: 5,
      }, NOW),
    ).rejects.toMatchObject({ statusCode: 400 })

    const result = await logCoachSelfReport(id, {
      submissionId: '33333333-3333-4333-8333-333333333333',
      durationMin: 10,
      note: 'Energy was good after lunch.',
    }, NOW)
    expect(result.dailyQuest?.status).toBe('completed')
    expect(state.events.some((event) => event.evidence_kind === 'owner_self_report')).toBe(true)
  })

  it('logs a physical quest through canonical ad-hoc Training and completes from that source', async () => {
    const ensured = await ensureCoach(NOW)
    const quest = ensured.dailyQuest!
    expect(quest.ruleKey).toBe('manual:jumping-jacks:100')
    const submissionId = '44444444-4444-4444-8444-444444444444'
    const result = await logCoachTraining(quest.id, { submissionId, actualValue: 100 }, NOW)
    expect(state.workout?.id).toBe(submissionId)
    expect(result.dailyQuest?.status).toBe('completed')
    expect(state.events.some((event) => event.evidence_kind === 'training_session')).toBe(true)

    await logCoachTraining(quest.id, { submissionId, actualValue: 100 }, NOW)
    expect(state.events.filter((event) => event.evidence_kind === 'training_session')).toHaveLength(1)
  })
})

function goal(kind: 'training_frequency' | 'activity_steps' | 'nutrition_protein', target: number) {
  return {
    id: `goal-${kind}`,
    status: 'active',
    goalKind: kind,
    selector: { bodyMetricKey: null },
    currentVersion: {
      targetMode: 'at_least',
      targetMin: target,
      targetMax: null,
    },
    goalStatus: {
      deadlineState: 'future_no_projection',
      targetState: 'below_target',
    },
  }
}

describe('Coach automatic completion authorities', () => {
  beforeEach(() => {
    state.tasks = []
    state.events = []
    state.workout = null
    state.goals = []
    state.cadence = { configs: [], observations: [] }
    state.activitySteps = null
    state.proteinTotal = null
    state.trainingSessions = []
    state.bodySession = null
    state.transactionCount = 0
  })

  it('completes an Activity steps quest from the canonical day summary', async () => {
    state.goals = [goal('activity_steps', 8000)]
    state.activitySteps = 9000
    const result = await ensureCoach(NOW)
    expect(result.dailyQuest?.ruleKey).toContain('goal:steps-today:')
    expect(result.dailyQuest?.status).toBe('completed')
    expect(state.events.some((event) => event.evidence_kind === 'deterministic_canonical')).toBe(true)
  })

  it('completes a protein quest only from a known canonical Nutrition total', async () => {
    state.goals = [goal('nutrition_protein', 160)]
    state.proteinTotal = 170
    const result = await ensureCoach(NOW)
    expect(result.dailyQuest?.ruleKey).toContain('goal:protein-today:')
    expect(result.dailyQuest?.status).toBe('completed')
  })

  it('completes a Training-frequency quest from a canonical session', async () => {
    state.goals = [goal('training_frequency', 3)]
    state.trainingSessions = [{ id: '55555555-5555-4555-8555-555555555555', workout_date: '2026-09-29' }]
    const result = await ensureCoach(NOW)
    expect(result.dailyQuest?.ruleKey).toContain('goal:training-session:')
    expect(result.dailyQuest?.status).toBe('completed')
  })

  it('completes a due Body quest only after a new canonical measurement appears', async () => {
    state.cadence = {
      configs: [{ metricKey: 'chest_circumference', intervalDays: 7, enabledFrom: '2026-09-01' }],
      observations: [{
        metricKey: 'chest_circumference',
        calendarDate: '2026-09-15',
        measuredAt: '2026-09-15T15:00:00.000Z',
      }],
    }
    const first = await ensureCoach(NOW)
    expect(first.dailyQuest?.ruleKey).toBe('body-cadence:chest_circumference')
    expect(first.dailyQuest?.status).toBe('active')

    state.bodySession = {
      session_id: '66666666-6666-4666-8666-666666666666',
      measured_date: '2026-09-29',
    }
    const second = await ensureCoach(NOW)
    expect(second.dailyQuest?.status).toBe('completed')
  })
})

