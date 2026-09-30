import { describe, expect, it } from 'vitest'
import { stretchCandidates } from '../src/domain/coach-stretch.ts'
import { bestStretchAttempt, stretchObservations } from '../src/domain/progress/stretch-performance.ts'
import { milesToMeters } from '../src/domain/units.ts'
import type { StretchExerciseDefinition, StretchSetRecord } from '../src/domain/progress/stretch-performance.ts'

const EXERCISE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function exercise(): StretchExerciseDefinition {
  return {
    id: EXERCISE, name: 'Running', externalId: 'EX18',
    performanceType: 'distance', analyticsLoadType: 'none', analyticsRepMode: 'standard',
    measurementKind: 'distance_duration', loadType: 'none', unilateral: false,
  }
}

function record(id: string, date: string, distanceMi: number, durationSec: number, createdAt: string): StretchSetRecord {
  return {
    setId: id, sessionId: `session-${id}`, sessionExerciseId: `appearance-${id}`,
    exerciseId: EXERCISE, sessionDate: date, sessionCreatedAt: createdAt,
    sessionExercisePosition: 1, setNumber: 1, setType: 'working', loadState: 'bodyweight',
    weightKg: null, reps: null, durationSec, leftReps: null, rightReps: null,
    leftDurationSec: null, rightDurationSec: null, distanceM: milesToMeters(distanceMi), completed: null,
    sessionType: 'ad_hoc',
  }
}

describe('H2D distance and pace Stretch', () => {
  it('creates distance and pace candidates only after two fresh canonical appearances', () => {
    const observations = stretchObservations([
      record('one', '2026-09-20', 2, 1200, '2026-09-20T18:00:00Z'),
      record('two', '2026-09-27', 2.1, 1239, '2026-09-27T18:00:00Z'),
    ], [exercise()])
    const candidates = stretchCandidates({
      date: '2026-09-29', observations, history: [], contextTags: [], goals: [], hasCurrentStretch: false,
    })
    const distance = candidates.find(item => item.ruleKey.startsWith('stretch:distance:'))
    const pace = candidates.find(item => item.ruleKey.startsWith('stretch:pace:'))
    expect(distance).toMatchObject({ targetUnit: 'mi', baselineValue: 2.1 })
    expect(distance?.targetValue).toBe(2.25)
    expect(pace?.targetUnit).toBe('sec/mi')
    expect(pace?.targetValue).toBeLessThan(pace?.baselineValue ?? 0)
    expect((pace?.metadata.stretch as { baseline?: { evidence?: { distanceM?: number } } }).baseline?.evidence?.distanceM).toBeGreaterThanOrEqual(milesToMeters(0.5))
  })

  it('requires a pace completion attempt to cover the frozen baseline distance', () => {
    const observations = stretchObservations([
      record('short-fast', '2026-09-30', 1.5, 780, '2026-09-30T19:00:00Z'),
      record('long-enough', '2026-09-30', 2, 1080, '2026-09-30T20:00:00Z'),
    ], [exercise()])
    const best = bestStretchAttempt(observations, {
      exerciseId: EXERCISE, strategy: 'pace',
      acceptedAt: '2026-09-29T18:00:00Z', acceptedOn: '2026-09-29', expiresOn: '2026-10-05',
      asOf: '2026-09-30', now: '2026-09-30T21:00:00Z', minimumDistanceM: milesToMeters(2),
    })
    expect(best?.sourceSet.setId).toBe('long-enough')
    expect(best?.value).toBeCloseTo(540, 8)
  })

  it('does not generate an automatic binary-skill Stretch strategy', () => {
    const skillExercise: StretchExerciseDefinition = {
      ...exercise(), name: 'Handstand', externalId: null, performanceType: 'skill',
      measurementKind: 'completion',
    }
    const skillRecord: StretchSetRecord = {
      ...record('skill', '2026-09-27', 1, 1, '2026-09-27T18:00:00Z'),
      distanceM: null, durationSec: null, completed: true,
    }
    expect(stretchObservations([skillRecord], [skillExercise])).toEqual([])
  })
})
