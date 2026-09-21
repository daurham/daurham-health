import { describe, expect, it } from 'vitest'
import {
  isCalendarDate,
  isDraftSetUntouched,
  manualWorkoutRequestSchema,
  manualWorkoutSetInputSchema,
  measurementFamilyOf,
  omitUntouchedDraftSets,
  toCanonicalSetInsert,
  workoutSetSchema,
} from '../src/domain/training.ts'
import { kilogramsToPounds, poundsToKilograms } from '../src/domain/units.ts'

const SET_ID = '11111111-1111-4111-8111-111111111111'

function canonicalSet(overrides: Record<string, unknown> = {}) {
  return {
    id: SET_ID,
    setNumber: 1,
    setType: 'working',
    loadState: 'external',
    weightKg: poundsToKilograms(135),
    reps: 8,
    durationSec: null,
    leftReps: null,
    rightReps: null,
    leftDurationSec: null,
    rightDurationSec: null,
    notes: null,
    ...overrides,
  }
}

function draftSet(overrides: Record<string, string | number> = {}) {
  return {
    setNumber: 1,
    loadState: 'external' as const,
    weightLb: '',
    reps: '',
    durationSec: '',
    leftReps: '',
    rightReps: '',
    leftDurationSec: '',
    rightDurationSec: '',
    notes: '',
    ...overrides,
  }
}

describe('training units', () => {
  it('reuses lb → kg conversion', () => {
    expect(poundsToKilograms(135)).toBeCloseTo(61.23496995, 8)
    expect(kilogramsToPounds(poundsToKilograms(185))).toBeCloseTo(185, 10)
  })

  it('stores converted kg on external sets', () => {
    const canonical = toCanonicalSetInsert(
      manualWorkoutSetInputSchema.parse({
        setNumber: 1,
        loadState: 'external',
        weightLb: 135,
        reps: 5,
        durationSec: null,
        leftReps: null,
        rightReps: null,
        leftDurationSec: null,
        rightDurationSec: null,
        notes: null,
      }),
    )
    expect(canonical.weightKg).toBeCloseTo(poundsToKilograms(135), 10)
  })
})

describe('load state', () => {
  it('requires weight for external load', () => {
    const result = workoutSetSchema.safeParse(canonicalSet({ weightKg: null }))
    expect(result.success).toBe(false)
  })

  it('requires bodyweight to have a null weight', () => {
    const result = workoutSetSchema.safeParse(
      canonicalSet({ loadState: 'bodyweight', weightKg: poundsToKilograms(0), reps: 12 }),
    )
    expect(result.success).toBe(false)
    expect(
      workoutSetSchema.safeParse(canonicalSet({ loadState: 'bodyweight', weightKg: null, reps: 12 }))
        .success,
    ).toBe(true)
  })

  it('requires unknown to have a null weight', () => {
    expect(
      workoutSetSchema.safeParse(canonicalSet({ loadState: 'unknown', weightKg: 20, reps: 8 })).success,
    ).toBe(false)
    expect(
      workoutSetSchema.safeParse(canonicalSet({ loadState: 'unknown', weightKg: null, reps: 8 })).success,
    ).toBe(true)
  })
})

describe('measurement families', () => {
  it('accepts bilateral reps', () => {
    expect(workoutSetSchema.safeParse(canonicalSet()).success).toBe(true)
    expect(measurementFamilyOf(canonicalSet())).toBe('reps')
  })

  it('accepts bilateral duration', () => {
    const set = canonicalSet({ reps: null, durationSec: 40 })
    expect(workoutSetSchema.safeParse(set).success).toBe(true)
    expect(measurementFamilyOf(set)).toBe('duration')
  })

  it('accepts unilateral reps', () => {
    const set = canonicalSet({ reps: null, leftReps: 8, rightReps: 7 })
    expect(workoutSetSchema.safeParse(set).success).toBe(true)
    expect(measurementFamilyOf(set)).toBe('reps_per_side')
  })

  it('accepts unilateral duration', () => {
    const set = canonicalSet({ reps: null, leftDurationSec: 30, rightDurationSec: 32 })
    expect(workoutSetSchema.safeParse(set).success).toBe(true)
  })

  it('keeps a missing unilateral side as null instead of inferring it', () => {
    const set = canonicalSet({ reps: null, leftReps: 8, rightReps: null })
    const parsed = workoutSetSchema.parse(set)
    expect(parsed.leftReps).toBe(8)
    expect(parsed.rightReps).toBeNull()
  })

  it('rejects reps mixed with duration', () => {
    expect(workoutSetSchema.safeParse(canonicalSet({ durationSec: 30 })).success).toBe(false)
  })

  it('rejects bilateral mixed with unilateral', () => {
    expect(workoutSetSchema.safeParse(canonicalSet({ leftReps: 8 })).success).toBe(false)
  })
})

describe('session bounds', () => {
  it('rejects effort outside 1–5', () => {
    const base = {
      workoutDate: '2026-09-20',
      workoutTemplateId: null,
      durationMin: null,
      painLevel: null,
      bodyweightLb: null,
      notes: null,
      exercises: [
        {
          exerciseDefinitionId: SET_ID,
          slotId: 'A01',
          notes: null,
          sets: [
            {
              setNumber: 1,
              loadState: 'external',
              weightLb: 135,
              reps: 5,
              durationSec: null,
              leftReps: null,
              rightReps: null,
              leftDurationSec: null,
              rightDurationSec: null,
              notes: null,
            },
          ],
        },
      ],
    }
    expect(manualWorkoutRequestSchema.safeParse({ ...base, effort: 0 }).success).toBe(false)
    expect(manualWorkoutRequestSchema.safeParse({ ...base, effort: 6 }).success).toBe(false)
    expect(manualWorkoutRequestSchema.safeParse({ ...base, effort: 3 }).success).toBe(true)
  })

  it('rejects pain outside 0–3', () => {
    const result = manualWorkoutRequestSchema.safeParse({
      workoutDate: '2026-09-20',
      workoutTemplateId: null,
      durationMin: null,
      effort: null,
      painLevel: 4,
      bodyweightLb: null,
      notes: null,
      exercises: [
        {
          exerciseDefinitionId: SET_ID,
          slotId: null,
          notes: null,
          sets: [
            {
              setNumber: 1,
              loadState: 'bodyweight',
              weightLb: null,
              reps: 10,
              durationSec: null,
              leftReps: null,
              rightReps: null,
              leftDurationSec: null,
              rightDurationSec: null,
              notes: null,
            },
          ],
        },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid calendar dates', () => {
    expect(isCalendarDate('2026-02-30')).toBe(false)
    expect(isCalendarDate('2026-09-20')).toBe(true)
  })
})

describe('blank planned sets', () => {
  it('omits untouched planned rows from the save payload', () => {
    const rows = [
      draftSet({ setNumber: 1, weightLb: '135', reps: '8' }),
      draftSet({ setNumber: 2 }),
      draftSet({ setNumber: 3, weightLb: '145', reps: '6' }),
    ]
    const kept = omitUntouchedDraftSets(rows)
    expect(kept.map((row) => row.setNumber)).toEqual([1, 3])
    expect(rows).toHaveLength(3)
  })

  it('does not treat an explicit bodyweight row as untouched', () => {
    expect(isDraftSetUntouched(draftSet({ loadState: 'bodyweight' }))).toBe(false)
  })
})

describe('prescription does not constrain actuals', () => {
  it('accepts completed reps outside the planned range', () => {
    const result = manualWorkoutSetInputSchema.safeParse({
      setNumber: 1,
      loadState: 'external',
      weightLb: 95,
      reps: 20,
      durationSec: null,
      leftReps: null,
      rightReps: null,
      leftDurationSec: null,
      rightDurationSec: null,
      notes: null,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.reps).toBe(20)
    }
  })
})
