import { describe, expect, it } from 'vitest'
import {
  measurementFamilyAllowedForExercise,
  ownerExerciseCoherenceError,
  ownerExerciseRequestSchema,
  manualWorkoutSetInputSchema,
} from '../src/domain/training.ts'
import { nutritionDayQuality } from '../src/domain/nutrition/quality.ts'
import { detectMeanShift } from '../src/domain/change-ledger.ts'
import {
  bodyValueClassification,
  incompleteNutritionDay,
  independentSideMissing,
  nutritionEntryClassification,
} from '../src/domain/data-quality.ts'
import { parseManualCreate } from '../src/domain/body-manual.ts'

describe('I4 Training effort and side semantics', () => {
  it('allows independent-side evidence without rewriting the measurement family', () => {
    expect(measurementFamilyAllowedForExercise('reps', 'independent', 'reps_per_side')).toBe(true)
    expect(measurementFamilyAllowedForExercise('reps', 'shared', 'reps_per_side')).toBe(false)
  })

  it('keeps RIR and RPE mutually exclusive and failure explicit', () => {
    const base = {
      setNumber: 1,
      loadState: 'external' as const,
      weightLb: 50,
      reps: 8,
      durationSec: null,
      leftReps: null,
      rightReps: null,
      leftDurationSec: null,
      rightDurationSec: null,
      distance: null,
      distanceUnit: null,
      completed: null,
      notes: null,
    }
    expect(manualWorkoutSetInputSchema.safeParse({ ...base, rir: 2, rpe: null, failureKind: null }).success).toBe(true)
    expect(manualWorkoutSetInputSchema.safeParse({ ...base, rir: 1, rpe: 9, failureKind: null }).success).toBe(false)
    expect(manualWorkoutSetInputSchema.safeParse({ ...base, rir: 0, rpe: null, failureKind: 'reached_failure' }).success).toBe(true)
  })

  it('infers paired mode for legacy per-side exercise creation and rejects shared per-side semantics', () => {
    const parsed = ownerExerciseRequestSchema.parse({
      name: 'Split hold',
      measurementKind: 'duration_per_side',
      loadType: 'bodyweight',
      unilateral: true,
    })
    expect(parsed.sideTrackingMode).toBe('paired')
    expect(ownerExerciseCoherenceError(parsed)).toBeNull()
    expect(ownerExerciseCoherenceError({ ...parsed, sideTrackingMode: 'shared' })).toMatch(/paired or independent/i)
  })
})

describe('I4 evidence quality', () => {
  it('summarizes Nutrition quality without scoring food healthfulness', () => {
    expect(nutritionDayQuality([
      { calories: 600, evidenceQuality: 'measured_reference' },
      { calories: 400, evidenceQuality: 'owner_entered' },
    ]).kind).toBe('high_confidence')

    const estimateHeavy = nutritionDayQuality([
      { calories: 700, evidenceQuality: 'ai_estimate' },
      { calories: 300, evidenceQuality: 'measured_reference' },
    ])
    expect(estimateHeavy.kind).toBe('estimate_heavy')
    expect(estimateHeavy.aiEstimatePct).toBeCloseTo(70)
  })

  it('treats missing legacy quality as unknown evidence', () => {
    const result = nutritionDayQuality([{ calories: 500 }])
    expect(result.kind).toBe('mixed')
    expect(result.unknownCalories).toBe(500)
  })

  it('stores body comparability as owner context rather than deriving it', () => {
    const plan = parseManualCreate({
      comparability: 'different_conditions',
      metrics: [{ key: 'weight', value: '180', unit: 'lb' }],
    }, new Date('2026-10-06T18:00:00Z'))
    expect(plan.comparability).toBe('different_conditions')
  })
})

describe('I4 deterministic change and watchdog rules', () => {
  it('requires enough observations and a meaningful mean shift', () => {
    const recent = Array.from({ length: 7 }, (_, index) => ({ date: '2026-10-' + String(index + 1).padStart(2, '0'), value: 9000 }))
    const baseline = Array.from({ length: 14 }, (_, index) => ({ date: '2026-09-' + String(index + 1).padStart(2, '0'), value: 6000 }))
    const result = detectMeanShift({
      recent,
      baseline,
      minRecent: 5,
      minBaseline: 8,
      minRelativePct: 20,
      minAbsoluteDelta: 1500,
    })
    expect(result?.direction).toBe('increase')
    expect(result?.delta).toBe(3000)
    expect(detectMeanShift({
      recent: recent.slice(0, 2),
      baseline,
      minRecent: 5,
      minBaseline: 8,
      minRelativePct: 20,
      minAbsoluteDelta: 1500,
    })).toBeNull()
  })

  it('uses review labels rather than silently correcting unusual data', () => {
    expect(bodyValueClassification({ metricKey: 'weight', value: 500, unit: 'kg' })).toBe('needs_confirmation')
    expect(nutritionEntryClassification({ calories: 3500, servingQuantity: 1 })).toBe('plausible_but_unusual')
    expect(incompleteNutritionDay({ calories: 800, targetCalories: 2200, entryCount: 3 })).toBe(true)
    expect(independentSideMissing({ left: 8, right: null })).toBe(true)
  })
})
