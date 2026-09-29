import { describe, expect, it } from 'vitest'
import {
  bestStretchAttempt,
  hasStretchBaselineSource,
  stretchBaselines,
  stretchObservationSnapshot,
  stretchObservations,
  type StretchExerciseDefinition,
  type StretchSetRecord,
} from '../src/domain/progress/stretch-performance.ts'
import { poundsToKilograms } from '../src/domain/units.ts'

const OFFERED = '2026-09-29'

function exercise(patch: Partial<StretchExerciseDefinition> = {}): StretchExerciseDefinition {
  return {
    id: 'bench', name: 'Bench Press', externalId: null, performanceType: 'loaded_reps',
    analyticsLoadType: 'external', analyticsRepMode: 'standard', measurementKind: 'reps',
    unilateral: false, loadType: 'barbell', ...patch,
  }
}

function set(id: string, date: string, patch: Partial<StretchSetRecord> = {}): StretchSetRecord {
  return {
    setId: `set-${id}`, sessionId: `session-${id}`, sessionExerciseId: `appearance-${id}`,
    exerciseId: 'bench', sessionDate: date, sessionCreatedAt: `${date}T20:00:00.000Z`,
    sessionExercisePosition: 1, setNumber: 1, setType: 'working', sessionType: 'ad_hoc',
    loadState: 'external', weightKg: poundsToKilograms(100), reps: 6, durationSec: null,
    leftReps: null, rightReps: null, leftDurationSec: null, rightDurationSec: null, ...patch,
  }
}

function bodyweight(patch: Partial<StretchExerciseDefinition> = {}): StretchExerciseDefinition {
  return exercise({ performanceType: 'other', analyticsLoadType: 'none', loadType: 'bodyweight', ...patch })
}

function unloaded(id: string, date: string, patch: Partial<StretchSetRecord> = {}): StretchSetRecord {
  return set(id, date, { loadState: 'bodyweight', weightKg: null, ...patch })
}

describe('canonical Stretch performance observations', () => {
  it('reuses high-confidence Epley strength and preserves exact source load/reps/set', () => {
    const source = set('a', '2026-09-20')
    const observation = stretchObservations([source], [exercise()])[0]!
    expect(observation.value).toBeCloseTo(120)
    expect(observation.evidence).toMatchObject({
      domain: 'training', sessionId: 'session-a', sessionExerciseId: 'appearance-a', setId: 'set-a',
      exerciseId: 'bench', loadKg: source.weightKg, reps: 6, strengthReps: 6,
      formula: 'epley', confidence: 'high', unit: 'lb',
    })
    expect(observation.evidence.estimated1RmKg).toBeCloseTo(poundsToKilograms(120), 10)
    expect(observation.sourceSet).toBe(source)
  })

  it('excludes low-confidence high-rep estimates even if their value is higher', () => {
    expect(stretchObservations([
      set('high', OFFERED), set('low', OFFERED, { reps: 13, weightKg: 200 }),
    ], [exercise()]).map((item) => item.evidence.setId)).toEqual(['set-high'])
  })

  it.each(['programmed', 'ad_hoc', 'experiment'])('supports canonical %s sessions', (sessionType) => {
    expect(stretchObservations([set('a', OFFERED, { sessionType })], [exercise()])).toHaveLength(1)
  })

  it.each([
    { sessionType: 'activity' }, { sessionType: 'apple_health' }, { setType: 'warmup' },
    { setType: 'drop' }, { reps: null }, { reps: 0 }, { reps: 2.5 },
    { weightKg: null }, { weightKg: NaN }, { sessionCreatedAt: 'invalid' },
  ])('excludes unsupported, nonworking and malformed source %j', (patch) => {
    expect(stretchObservations([set('a', OFFERED, patch)], [exercise()])).toEqual([])
  })

  it('uses single working-set reps for an owner-created unloaded exercise', () => {
    const observation = stretchObservations([unloaded('a', OFFERED, { reps: 42 })], [bodyweight()])[0]!
    expect(observation).toMatchObject({ strategy: 'reps', value: 42, unit: 'reps' })
    expect(observation.evidence).toMatchObject({ setId: 'set-a', reps: 42, loadKg: null })
  })

  it('uses minimum of both completed sides for reps even with old classification defaults', () => {
    const definition = bodyweight({ measurementKind: 'reps_per_side', analyticsRepMode: 'standard', unilateral: true })
    expect(stretchObservations([
      unloaded('both', OFFERED, { reps: null, leftReps: 20, rightReps: 16 }),
      unloaded('missing', OFFERED, { leftReps: 50, rightReps: null }),
    ], [definition]).map((item) => item.value)).toEqual([16])
  })

  it('never offers generic reps for loaded strength or assisted exercises', () => {
    expect(stretchObservations([unloaded('a', OFFERED, { reps: 42 })], [exercise()])).toEqual([])
    expect(stretchObservations([unloaded('a', OFFERED, { reps: 42 })], [bodyweight({
      performanceType: 'assisted_reps', analyticsLoadType: 'assistance',
    })])).toEqual([])
  })

  it.each([{ loadState: 'external', weightKg: 1 }, { loadState: 'unknown' }, { weightKg: 1 }])(
    'fails closed for loaded/unknown bodyweight sets %j', (patch) => {
      expect(stretchObservations([unloaded('a', OFFERED, patch)], [bodyweight()])).toEqual([])
    },
  )

  it('uses canonical working-set duration and never session duration alone', () => {
    const definition = bodyweight({ measurementKind: 'duration', loadType: 'none' })
    expect(stretchObservations([
      unloaded('set-time', OFFERED, { reps: null, durationSec: 95 }),
      unloaded('no-set-time', OFFERED, { reps: null, durationSec: null }),
    ], [definition]).map((item) => ({ value: item.value, evidence: item.evidence.setId })))
      .toEqual([{ value: 95, evidence: 'set-set-time' }])
  })

  it('supports explicit none load state for an unloaded duration definition', () => {
    const definition = bodyweight({ measurementKind: 'duration', loadType: 'none' })
    expect(stretchObservations([
      unloaded('none', OFFERED, { loadState: 'none', reps: null, durationSec: 95 }),
    ], [definition])[0]?.value).toBe(95)
  })

  it('uses minimum completed-side duration and preserves both source sides', () => {
    const definition = bodyweight({ measurementKind: 'duration_per_side', unilateral: true })
    const result = stretchObservations([
      unloaded('both', OFFERED, { reps: null, leftDurationSec: 100, rightDurationSec: 95 }),
      unloaded('missing', OFFERED, { reps: null, leftDurationSec: 120, rightDurationSec: null }),
    ], [definition])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ value: 95, perSide: true, evidence: { leftDurationSec: 100, rightDurationSec: 95 } })
  })
})

describe('Stretch baseline freshness and appearance authority', () => {
  it('freezes the recent best, latest appearance and source separately', () => {
    const observations = stretchObservations([
      set('old-alltime', '2026-08-17', { weightKg: 200 }),
      set('baseline', '2026-09-10', { weightKg: poundsToKilograms(110) }),
      set('latest', '2026-09-20'),
      set('future', '2026-09-30', { weightKg: 300 }),
    ], [exercise()])
    expect(stretchBaselines(observations, OFFERED)).toMatchObject([{
      appearances: 2, latestDate: '2026-09-20', observation: { evidence: { setId: 'set-baseline' } },
    }])
  })

  it('does not count several sets from one appearance as sufficient history', () => {
    const first = set('a', '2026-09-20')
    expect(stretchBaselines(stretchObservations([first, { ...first, setId: 'set-b', setNumber: 2 }], [exercise()]), OFFERED)).toEqual([])
  })

  it.each([
    ['2026-09-08', '2026-08-18', true],
    ['2026-09-07', '2026-08-18', false],
    ['2026-09-20', '2026-08-17', false],
  ])('latest %s and second %s respect inclusive 21/42-day boundaries', (latest, second, eligible) => {
    const result = stretchBaselines(stretchObservations([set('a', latest), set('b', second)], [exercise()]), OFFERED)
    expect(result.length > 0).toBe(eligible)
  })

  it.each([
    ['reps', 'reps', 42], ['duration', 'duration', 95],
  ])('retains %s baseline source evidence', (strategy, measurementKind, value) => {
    const definition = bodyweight({ measurementKind })
    const values = measurementKind === 'duration' ? { durationSec: value, reps: null } : { reps: value }
    const observations = stretchObservations([unloaded('best', '2026-09-10', values), unloaded('later', '2026-09-20', values)], [definition])
    expect(stretchBaselines(observations, OFFERED)[0]).toMatchObject({
      observation: { strategy, value, evidence: { sessionId: 'session-best', sessionExerciseId: 'appearance-best', setId: 'set-best' } },
    })
  })

  it('fails closed when a frozen baseline is deleted or edited before acceptance', () => {
    const original = stretchObservations([set('a', '2026-09-20')], [exercise()])
    const snapshot = stretchObservationSnapshot(original[0]!)
    expect(hasStretchBaselineSource(original, snapshot)).toBe(true)
    expect(hasStretchBaselineSource([], snapshot)).toBe(false)
    expect(hasStretchBaselineSource(stretchObservations([set('a', '2026-09-20', { reps: 5 })], [exercise()]), snapshot)).toBe(false)
  })

  it('invalidates a baseline correction even when the estimated strength stays identical', () => {
    const original = stretchObservations([set('a', '2026-09-20', { weightKg: 100, reps: 6 })], [exercise()])
    const corrected = stretchObservations([set('a', '2026-09-20', { weightKg: 90, reps: 10 })], [exercise()])
    expect(corrected[0]?.value).toBe(original[0]?.value)
    expect(hasStretchBaselineSource(corrected, stretchObservationSnapshot(original[0]!))).toBe(false)
  })
})

describe('post-acceptance canonical attempts', () => {
  const window = {
    exerciseId: 'bench', strategy: 'strength_e1rm' as const, acceptedAt: '2026-09-29T16:00:00.000Z',
    acceptedOn: OFFERED, expiresOn: '2026-10-05', asOf: '2026-10-06', now: '2026-10-06T15:00:00.000Z',
  }

  it('allows a lower literal load with more reps and rejects heavier loads that miss e1RM', () => {
    const observations = stretchObservations([
      set('heavier', OFFERED, { weightKg: poundsToKilograms(105), reps: 1 }),
      set('lighter', OFFERED, { weightKg: poundsToKilograms(95), reps: 10 }),
    ], [exercise()])
    const best = bestStretchAttempt(observations, window)!
    expect(best.value).toBeGreaterThan(122.5)
    expect(best.evidence).toMatchObject({ setId: 'set-lighter', loadKg: poundsToKilograms(95), reps: 10 })
    expect(observations.find((item) => item.evidence.setId === 'set-heavier')?.value).toBeLessThan(122.5)
  })

  it('retains a new best below target without treating it as completion', () => {
    const attempt = bestStretchAttempt(stretchObservations([set('pr', OFFERED, { weightKg: poundsToKilograms(101.5) })], [exercise()]), window)!
    expect(attempt.value).toBeGreaterThan(120)
    expect(attempt.value).toBeLessThan(122.5)
  })

  it('accepts exact and above-target values', () => {
    expect(bestStretchAttempt(stretchObservations([set('exact', OFFERED, { weightKg: poundsToKilograms(105), reps: 5 })], [exercise()]), window)?.value).toBeCloseTo(122.5)
  })

  it.each([
    ['before-acceptance', OFFERED, '2026-09-29T15:59:59.999Z'],
    ['exact-acceptance', OFFERED, '2026-09-29T16:00:00.000Z'],
    ['backdated', '2026-09-28', '2026-09-29T20:00:00.000Z'],
    ['after-date-window', '2026-10-06', '2026-10-06T06:00:00.000Z'],
    ['late-backdate', '2026-10-05', '2026-10-06T07:00:00.000Z'],
    ['future-creation', '2026-10-05', '2026-10-07T06:00:00.000Z'],
  ])('excludes %s attempts using canonical date and timestamp', (id, date, sessionCreatedAt) => {
    expect(bestStretchAttempt(stretchObservations([set(id, date, { sessionCreatedAt })], [exercise()]), window)).toBeNull()
  })

  it('includes the final moment of the final Phoenix challenge day', () => {
    const observations = stretchObservations([set('last', '2026-10-05', { sessionCreatedAt: '2026-10-06T06:59:59.999Z' })], [exercise()])
    expect(bestStretchAttempt(observations, window)?.evidence.setId).toBe('set-last')
  })

  it('cannot use an attempt deleted/edited in canonical Training', () => {
    expect(bestStretchAttempt([], window)).toBeNull()
    expect(bestStretchAttempt(stretchObservations([set('a', OFFERED, { reps: 13 })], [exercise()]), window)).toBeNull()
  })

  it.each(['reps', 'duration'] as const)('returns exact canonical %s attempts', (strategy) => {
    const definition = bodyweight({ measurementKind: strategy })
    const observations = stretchObservations([unloaded('attempt', OFFERED, { reps: strategy === 'reps' ? 45 : null, durationSec: strategy === 'duration' ? 100 : null })], [definition])
    expect(bestStretchAttempt(observations, { ...window, strategy })?.value).toBe(strategy === 'reps' ? 45 : 100)
  })
})
