import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { poundsToKilograms } from '../src/domain/units.ts'
import {
  FUTURE_GOAL_KINDS,
  GOAL_KINDS,
  benchmarkOutcomeUnit,
  goalEvidence,
  nextGoalLifecycle,
  sameGoalTarget,
  validateGoalCreate,
  validateGoalRevision,
  type BenchmarkPin,
  type GoalTarget,
  type GoalValidationContext,
} from '../src/domain/goals.ts'

const TODAY = '2026-09-27'
const EXERCISE = '66666666-6666-4666-8666-666666666666'
const SUPPLEMENT = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const BENCHMARK = 'b5b5b5b5-b5b5-45b5-85b5-b5b5b5b5b5b5'
const VERSION = 'b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3'
const OTHER_VERSION = 'b2b2b2b2-b2b2-42b2-82b2-b2b2b2b2b2b2'
const REQUIREMENT = 'b4b4b4b4-b4b4-44b4-84b4-b4b4b4b4b4b4'
const PROTOCOL = 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1'

function pin(overrides: Partial<BenchmarkPin> = {}): BenchmarkPin {
  return {
    definitionId: BENCHMARK,
    protocolVersionId: VERSION,
    versionProtocolId: PROTOCOL,
    requirementId: REQUIREMENT,
    protocolId: PROTOCOL,
    requirementProtocolVersionId: VERSION,
    role: 'primary_outcome',
    requirementKind: 'training_measure',
    selector: { exerciseDefinitionId: EXERCISE, measure: 'total_reps' },
    label: 'Push-up total reps',
    title: 'Push-up 10-minute capacity',
    active: true,
    ...overrides,
  }
}

function context(overrides: Partial<GoalValidationContext> = {}): GoalValidationContext {
  return {
    today: TODAY,
    exercise: { id: EXERCISE, name: 'Bench Press', active: true },
    supplement: { id: SUPPLEMENT, name: 'Creatine', active: true },
    benchmark: pin(),
    ...overrides,
  }
}

function base(kind: string, extra: Record<string, unknown> = {}) {
  return {
    goalKind: kind,
    startedOn: '2026-09-01',
    targetMode: 'at_least',
    targetMin: 1,
    targetMax: null,
    ...extra,
  }
}

describe('goal creation', () => {
  it('accepts each supported kind and rejects an arbitrary kind', () => {
    expect(FUTURE_GOAL_KINDS.every((kind) => !(GOAL_KINDS as readonly string[]).includes(kind))).toBe(true)
    expect(validateGoalCreate(base('nutrition_consistency'), context())).toEqual({ error: 'Choose a supported goal kind.' })
    const bodies = [
      base('body_metric', { bodyMetricKey: 'weight', targetMode: 'at_most', targetMin: null, targetMax: 175 }),
      base('strength_e1rm', { exerciseDefinitionId: EXERCISE, targetMin: 225 }),
      base('benchmark_result', {
        benchmarkDefinitionId: BENCHMARK,
        benchmarkProtocolVersionId: VERSION,
        benchmarkRequirementId: REQUIREMENT,
        targetMin: 80,
      }),
      base('training_frequency', { targetMin: 3 }),
      base('activity_steps', { targetMin: 8000 }),
      base('nutrition_protein', { targetMin: 160 }),
      base('sleep_duration', { targetMode: 'range', targetMin: 420, targetMax: 480 }),
      base('supplement_adherence', { supplementId: SUPPLEMENT, targetMin: 90 }),
    ]
    for (const body of bodies) {
      const draft = validateGoalCreate(body, context())
      expect(draft).not.toHaveProperty('error')
      if (!('error' in draft)) {
        expect(draft.startedOn).toBe('2026-09-01')
      }
    }
  })

  it('rejects the wrong selector for a kind and writes no target', () => {
    expect(validateGoalCreate(base('body_metric', { bodyMetricKey: 'weight', exerciseDefinitionId: EXERCISE, targetMode: 'at_most', targetMin: null, targetMax: 175 }), context())).toEqual({
      error: 'A body goal uses only its body metric.',
    })
    expect(validateGoalCreate(base('strength_e1rm', { targetMin: 225 }), context())).toEqual({ error: 'Choose an exercise.' })
    expect(
      validateGoalCreate(
        base('benchmark_result', {
          benchmarkDefinitionId: BENCHMARK,
          benchmarkProtocolVersionId: OTHER_VERSION,
          benchmarkRequirementId: REQUIREMENT,
          targetMin: 80,
        }),
        context(),
      ).error,
    ).toMatch(/protocol version/)
    expect(
      validateGoalCreate(
        base('benchmark_result', {
          benchmarkDefinitionId: BENCHMARK,
          benchmarkProtocolVersionId: VERSION,
          benchmarkRequirementId: REQUIREMENT,
          targetMin: 80,
        }),
        context({ benchmark: pin({ role: 'context', requirementKind: 'context_tag', selector: { tagKey: 'travel' } }) }),
      ).error,
    ).toMatch(/primary or secondary/)
    expect(validateGoalCreate(base('supplement_adherence', { targetMin: 90 }), context())).toEqual({
      error: 'Choose a supplement.',
    })
  })

  it('rejects invalid target shapes and a client unit that is not the goal unit', () => {
    expect(validateGoalCreate(base('body_metric', { bodyMetricKey: 'weight', targetMode: 'range', targetMin: 180, targetMax: 175 }), context()).error).toMatch(/minimum/)
    expect(validateGoalCreate(base('body_metric', { bodyMetricKey: 'weight', targetMode: 'at_least', targetMin: null, targetMax: 175 }), context()).error).toMatch(/minimum/)
    expect(validateGoalCreate(base('strength_e1rm', { exerciseDefinitionId: EXERCISE, targetMode: 'at_most', targetMin: null, targetMax: 225 }), context()).error).toMatch(/target mode/)
    expect(validateGoalCreate(base('supplement_adherence', { supplementId: SUPPLEMENT, targetMin: 90, targetUnit: 'lb' }), context()).error).toMatch(/unit/)
    const benchmark = validateGoalCreate(
      base('benchmark_result', {
        benchmarkDefinitionId: BENCHMARK,
        benchmarkProtocolVersionId: VERSION,
        benchmarkRequirementId: REQUIREMENT,
        targetMin: 80,
        targetUnit: 'lb',
      }),
      context(),
    )
    expect(benchmark).not.toHaveProperty('error')
    if (!('error' in benchmark)) {
      expect(benchmark.targetUnit).toBe('reps')
    }
    expect(benchmarkOutcomeUnit('training_measure', { measure: 'total_reps' })).toBe('reps')
  })

  it('keeps a point metric window empty and fixes aggregation windows', () => {
    const weight = validateGoalCreate(base('body_metric', { bodyMetricKey: 'waist_circumference', targetMode: 'at_most', targetMin: null, targetMax: 34, evaluationWindowDays: 7 }), context())
    expect(weight).toEqual({ error: 'This goal refers to an observation, not a rolling window.' })
    const frequency = validateGoalCreate(base('training_frequency', { targetMin: 4, evaluationWindowDays: 30 }), context())
    expect(frequency).toEqual({ error: 'Choose a supported evaluation window.' })
    const protein = validateGoalCreate(base('nutrition_protein', { targetMin: 160 }), context())
    expect(protein).toMatchObject({ evaluationWindowDays: 7, targetUnit: 'g/day' })
    const adherence = validateGoalCreate(base('supplement_adherence', { supplementId: SUPPLEMENT, targetMin: 80 }), context())
    expect(adherence).toMatchObject({ evaluationWindowDays: 30, targetUnit: '%' })
  })
})

describe('goal revisions and lifecycle', () => {
  const current: GoalTarget & { startedOn: string } = {
    startedOn: '2026-09-01',
    targetMode: 'at_most',
    targetMin: null,
    targetMax: 175,
    targetUnit: 'lb',
    targetDate: '2026-12-31',
    evaluationWindowDays: null,
    notes: 'initial cut target',
  }

  it('preserves an unchanged target and accepts a later revision', () => {
    const same = validateGoalRevision(current, { ...current, sourceVersionId: 'v1' }, { today: TODAY, goalKind: 'body_metric', unit: 'lb' })
    expect(same).not.toHaveProperty('error')
    if (!('error' in same)) {
      expect(sameGoalTarget(current, same)).toBe(true)
    }
    const next = validateGoalRevision(
      current,
      { targetMode: 'range', targetMin: 175, targetMax: 180, targetDate: '2026-11-30', notes: 'revised after strength block' },
      { today: TODAY, goalKind: 'body_metric', unit: 'lb' },
    )
    expect(next).toMatchObject({ targetMode: 'range', targetMin: 175, targetMax: 180, notes: 'revised after strength block' })
    expect(current.notes).toBe('initial cut target')
    expect(current.targetMax).toBe(175)
  })

  it('changes lifecycle without inventing a version', () => {
    expect(nextGoalLifecycle('active', 'pause', '2026-09-27T16:00:00.000Z')).toEqual({
      status: 'paused',
      pausedAt: '2026-09-27T16:00:00.000Z',
      completedAt: null,
    })
    expect(nextGoalLifecycle('paused', 'resume', '2026-09-27T17:00:00.000Z')).toEqual({
      status: 'active',
      pausedAt: null,
      completedAt: null,
    })
    expect(nextGoalLifecycle('paused', 'complete', '2026-09-27T18:00:00.000Z')).toEqual({
      status: 'completed',
      pausedAt: null,
      completedAt: '2026-09-27T18:00:00.000Z',
    })
    expect(nextGoalLifecycle('active', 'complete', '2026-09-27T18:00:00.000Z').status).toBe('completed')
    expect(nextGoalLifecycle('completed', 'reopen', '2026-09-27T19:00:00.000Z')).toEqual({
      status: 'active',
      pausedAt: null,
      completedAt: null,
    })
    expect(nextGoalLifecycle('completed', 'pause', '2026-09-27T19:00:00.000Z')).toEqual({
      error: 'That lifecycle change is not available.',
    })
  })
})

describe('goal evidence', () => {
  const empty = {
    body: null,
    strength: null,
    benchmark: null,
    sessionDates: [],
    activityRows: [],
    proteinDays: [],
    sleepNights: [],
    adherence: null,
  }

  it('does not turn a met body target into completion and does not zero a missing observation', () => {
    const met = goalEvidence({
      ...empty,
      goalKind: 'body_metric',
      asOf: TODAY,
      target: { targetMode: 'at_most', targetMin: null, targetMax: 175, targetUnit: 'lb', targetDate: null, evaluationWindowDays: null, notes: null },
      body: { value: poundsToKilograms(174), unit: 'kg', observedOn: '2026-09-20' },
    })
    expect(met.current).toBeCloseTo(174, 5)
    expect(met).not.toHaveProperty('status')
    const missing = goalEvidence({
      ...empty,
      goalKind: 'body_metric',
      asOf: TODAY,
      target: { targetMode: 'at_most', targetMin: null, targetMax: 175, targetUnit: 'lb', targetDate: null, evaluationWindowDays: null, notes: null },
    })
    expect(missing.current).toBeNull()
  })

  it('keeps provisional steps out of the closed average and ignores partial sleep nights', () => {
    const steps = goalEvidence({
      ...empty,
      goalKind: 'activity_steps',
      asOf: TODAY,
      target: { targetMode: 'at_least', targetMin: 8000, targetMax: null, targetUnit: 'steps/day', targetDate: null, evaluationWindowDays: 7, notes: null },
      activityRows: [
        { date: '2026-09-26', timezone: 'America/Phoenix', stepsCount: 8000, activeEnergyKcal: null, exerciseMinutes: null, walkingRunningDistanceM: null, restingHeartRateBpm: null },
        { date: TODAY, timezone: 'America/Phoenix', stepsCount: 1200, activeEnergyKcal: null, exerciseMinutes: null, walkingRunningDistanceM: null, restingHeartRateBpm: null },
      ],
    })
    expect(steps.current).toBe(8000)
    expect(steps.provisional).toEqual({ value: 1200, unit: 'steps/day', label: 'so far' })
    const sleep = goalEvidence({
      ...empty,
      goalKind: 'sleep_duration',
      asOf: TODAY,
      target: { targetMode: 'at_least', targetMin: 420, targetMax: null, targetUnit: 'min/night', targetDate: null, evaluationWindowDays: 7, notes: null },
      sleepNights: [
        { date: '2026-09-26', minutes: 300, analysisEligible: false, partial: true },
        { date: '2026-09-25', minutes: 450, analysisEligible: true, partial: false },
      ],
    })
    expect(sleep.current).toBe(450)
    expect(sleep.coverage?.partialNights).toBe(1)
  })

  it('keeps unknown supplement days out of the adherence ratio', () => {
    const evidence = goalEvidence({
      ...empty,
      goalKind: 'supplement_adherence',
      asOf: TODAY,
      target: { targetMode: 'at_least', targetMin: 90, targetMax: null, targetUnit: '%', targetDate: null, evaluationWindowDays: 7, notes: null },
      adherence: {
        schedules: [
          {
            id: 'schedule-1',
            supplementId: SUPPLEMENT,
            slotLabel: null,
            doseAmount: 5,
            doseUnit: 'g',
            weekdayMask: 127,
            effectiveFrom: '2026-01-01',
            effectiveThrough: null,
            sortOrder: 0,
          },
        ],
        events: [{ effectiveDate: '2026-01-01', status: 'active' }],
        rows: [
          { scheduleId: 'schedule-1', scheduledDate: '2026-09-20', status: 'taken', actualDoseAmount: null, actualDoseUnit: null },
          { scheduleId: 'schedule-1', scheduledDate: '2026-09-21', status: 'skipped', actualDoseAmount: null, actualDoseUnit: null },
        ],
      },
    })
    expect(evidence.coverage?.takenDays).toBe(1)
    expect(evidence.coverage?.skippedDays).toBe(1)
    expect(evidence.coverage?.unknownDays).toBe(5)
    expect(evidence.current).toBe(50)
    const unknownOnly = goalEvidence({
      ...empty,
      goalKind: 'supplement_adherence',
      asOf: TODAY,
      target: { targetMode: 'at_least', targetMin: 90, targetMax: null, targetUnit: '%', targetDate: null, evaluationWindowDays: 7, notes: null },
      adherence: {
        schedules: [
          {
            id: 'schedule-1',
            supplementId: SUPPLEMENT,
            slotLabel: null,
            doseAmount: 5,
            doseUnit: 'g',
            weekdayMask: 127,
            effectiveFrom: '2026-01-01',
            effectiveThrough: null,
            sortOrder: 0,
          },
        ],
        events: [{ effectiveDate: '2026-01-01', status: 'active' }],
        rows: [],
      },
    })
    expect(unknownOnly.current).toBeNull()
    expect(unknownOnly.coverage?.unknownDays).toBe(7)
  })

  it('averages protein only on logged days with a known total', () => {
    const evidence = goalEvidence({
      ...empty,
      goalKind: 'nutrition_protein',
      asOf: TODAY,
      target: { targetMode: 'at_least', targetMin: 160, targetMax: null, targetUnit: 'g/day', targetDate: null, evaluationWindowDays: 7, notes: null },
      proteinDays: [
        { date: '2026-09-26', logged: true, protein: 180 },
        { date: '2026-09-25', logged: true, protein: null },
      ],
    })
    expect(evidence.current).toBe(180)
    expect(evidence.coverage?.observedDays).toBe(1)
  })
})

describe('goal boundaries', () => {
  it('keeps commits on the owner goal API and out of projections', () => {
    const service = readFileSync('server/goals/service.ts', 'utf8')
    const handler = readFileSync('server/handlers/goals.ts', 'utf8')
    const migration = readFileSync('migrations/0028_goals.sql', 'utf8')
    const routes = readFileSync('src/routes/index.tsx', 'utf8')
    expect(service).toContain('FOR UPDATE OF goals, goal_versions')
    expect(service).toContain("'stale_version'")
    expect(service).toContain("$2, 'active'")
    expect(service).not.toContain('gemini')
    expect(handler).toContain('withOwnerAuth')
    expect(handler).toContain('405')
    expect(handler).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(migration).toContain('goal_versions_one_current')
    expect(migration).toContain('does not store projections')
    expect(routes).toContain("path: 'goals'")
    expect(routes).not.toContain('demo/goals')
    const lifecycle = service.slice(service.indexOf('export async function changeGoalLifecycle'))
    expect(lifecycle).not.toContain('INSERT INTO goal_versions')
    const create = service.slice(service.indexOf('async function insertGoal'), service.indexOf('async function readGoalRows'))
    expect(create).toContain('INSERT INTO goal_versions')
    expect(create).toContain("'active'")
  })
})
