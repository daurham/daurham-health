import { describe, expect, it } from 'vitest'
import {
  applyPaperInheritanceToManualRequest,
  fieldErrorCountSummary,
  fieldErrorsForPaperExercises,
  interpretPaperSets,
  type PaperSetFields,
} from '../src/domain/paper-load.ts'
import type { LoadState } from '../src/domain/training.ts'

function paperSet(
  partial: Partial<PaperSetFields> & { loadState?: LoadState } = {},
): PaperSetFields {
  return {
    loadState: 'external',
    weightLb: '',
    reps: '',
    durationSec: '',
    leftReps: '',
    rightReps: '',
    leftDurationSec: '',
    rightDurationSec: '',
    notes: '',
    ...partial,
  }
}

describe('paper load inheritance', () => {
  it('carries 30, blank, blank to 30, 30, 30', () => {
    const interpreted = interpretPaperSets([
      paperSet({ weightLb: '30', reps: '10', transcribedLoadState: 'external', transcribedWeightLb: '30' }),
      paperSet({ reps: '10' }),
      paperSet({ reps: '10' }),
    ])
    expect(interpreted.map((item) => item.resolvedLoad)).toEqual([
      { kind: 'external', weightLb: 30 },
      { kind: 'external', weightLb: 30 },
      { kind: 'external', weightLb: 30 },
    ])
    expect(interpreted.map((item) => item.source)).toEqual(['transcribed', 'inherited', 'inherited'])
    expect(interpreted[1]?.set.weightLb).toBe('')
  })

  it('carries 25, blank, 30, blank to 25, 25, 30, 30', () => {
    const interpreted = interpretPaperSets([
      paperSet({ weightLb: '25', reps: '10' }),
      paperSet({ reps: '10' }),
      paperSet({ weightLb: '30', reps: '8' }),
      paperSet({ reps: '8' }),
    ])
    expect(interpreted.map((item) => item.resolvedLoad)).toEqual([
      { kind: 'external', weightLb: 25 },
      { kind: 'external', weightLb: 25 },
      { kind: 'external', weightLb: 30 },
      { kind: 'external', weightLb: 30 },
    ])
  })

  it('does not carry load across exercise boundaries', () => {
    const first = interpretPaperSets([paperSet({ weightLb: '30', reps: '10' }), paperSet({ reps: '10' })])
    const second = interpretPaperSets([paperSet({ reps: '8' })])
    expect(first[1]?.resolvedLoad).toEqual({ kind: 'external', weightLb: 30 })
    expect(second[0]?.resolvedLoad).toBeNull()
    expect(second[0]?.source).toBe('missing')
    const errors = fieldErrorsForPaperExercises([
      { measurementKind: 'reps', sets: [paperSet({ weightLb: '30', reps: '10' })] },
      { measurementKind: 'reps', sets: [paperSet({ reps: '8' })] },
    ])
    expect(errors).toEqual([
      {
        path: 'exercises.1.sets.0.weightLb',
        message: 'Load required — no previous load exists to inherit.',
      },
    ])
  })

  it('flags the first completed set when load cannot be inherited', () => {
    const interpreted = interpretPaperSets([paperSet({ reps: '10' })])
    expect(interpreted[0]?.source).toBe('missing')
    const errors = fieldErrorsForPaperExercises([
      { measurementKind: 'reps', sets: [paperSet({ reps: '10' })] },
    ])
    expect(errors).toEqual([
      {
        path: 'exercises.0.sets.0.weightLb',
        message: 'Load required — no previous load exists to inherit.',
      },
    ])
  })

  it('inherits BW without inventing a numeric load', () => {
    const interpreted = interpretPaperSets([
      paperSet({ loadState: 'bodyweight', reps: '12', transcribedLoadState: 'bodyweight', transcribedWeightLb: '' }),
      paperSet({ reps: '12' }),
      paperSet({ reps: '10' }),
    ])
    expect(interpreted.map((item) => item.resolvedLoad)).toEqual([
      { kind: 'bodyweight' },
      { kind: 'bodyweight' },
      { kind: 'bodyweight' },
    ])
    expect(interpreted.map((item) => item.source)).toEqual(['transcribed', 'inherited', 'inherited'])
    const applied = applyPaperInheritanceToManualRequest({
      workoutDate: '2026-09-20',
      workoutTemplateId: null,
      durationMin: null,
      effort: null,
      painLevel: null,
      bodyweightLb: null,
      notes: null,
      exercises: [
        {
          exerciseDefinitionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          slotId: null,
          notes: null,
          sets: [
            {
              setNumber: 1,
              setType: 'working',
              loadState: 'bodyweight',
              weightLb: null,
              reps: 12,
              durationSec: null,
              leftReps: null,
              rightReps: null,
              leftDurationSec: null,
              rightDurationSec: null,
              notes: null,
            },
            {
              setNumber: 2,
              setType: 'working',
              loadState: 'external',
              weightLb: null,
              reps: 12,
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
    expect(applied.exercises[0]?.sets.map((set) => set.loadState)).toEqual(['bodyweight', 'bodyweight'])
    expect(applied.exercises[0]?.sets.map((set) => set.weightLb)).toEqual([null, null])
  })

  it('omits completely blank unperformed rows instead of converting them to zeros', () => {
    const interpreted = interpretPaperSets([
      paperSet({ weightLb: '30', reps: '10' }),
      paperSet(),
      paperSet({ weightLb: '35', reps: '8' }),
    ])
    expect(interpreted[1]?.omitted).toBe(true)
    expect(interpreted[1]?.resolvedLoad).toBeNull()
    const applied = applyPaperInheritanceToManualRequest({
      workoutDate: '2026-09-20',
      workoutTemplateId: null,
      durationMin: null,
      effort: null,
      painLevel: null,
      bodyweightLb: null,
      notes: null,
      exercises: [
        {
          exerciseDefinitionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          slotId: 'A01',
          notes: null,
          sets: [
            {
              setNumber: 1,
              setType: 'working',
              loadState: 'external',
              weightLb: 30,
              reps: 10,
              durationSec: null,
              leftReps: null,
              rightReps: null,
              leftDurationSec: null,
              rightDurationSec: null,
              notes: null,
            },
            {
              setNumber: 2,
              setType: 'working',
              loadState: 'external',
              weightLb: null,
              reps: null,
              durationSec: null,
              leftReps: null,
              rightReps: null,
              leftDurationSec: null,
              rightDurationSec: null,
              notes: null,
            },
            {
              setNumber: 3,
              setType: 'working',
              loadState: 'external',
              weightLb: 35,
              reps: 8,
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
    expect(applied.exercises[0]?.sets.map((set) => set.setNumber)).toEqual([1, 3])
    expect(applied.exercises[0]?.sets.every((set) => set.reps !== 0 && set.weightLb !== 0)).toBe(true)
  })

  it('lets an explicit user override change subsequent inheritance', () => {
    const interpreted = interpretPaperSets([
      paperSet({ weightLb: '25', reps: '10', transcribedLoadState: 'external', transcribedWeightLb: '25' }),
      paperSet({ weightLb: '40', reps: '8' }),
      paperSet({ reps: '8' }),
    ])
    expect(interpreted.map((item) => item.resolvedLoad)).toEqual([
      { kind: 'external', weightLb: 25 },
      { kind: 'external', weightLb: 40 },
      { kind: 'external', weightLb: 40 },
    ])
    expect(interpreted.map((item) => item.source)).toEqual(['transcribed', 'edited', 'inherited'])
  })

  it('does not inherit an explicit unknown / unreadable load', () => {
    const interpreted = interpretPaperSets([
      paperSet({ weightLb: '30', reps: '10' }),
      paperSet({ loadState: 'unknown', reps: '10', transcribedLoadState: 'unknown' }),
      paperSet({ reps: '10' }),
    ])
    expect(interpreted[1]?.resolvedLoad).toBeNull()
    expect(interpreted[1]?.source).toBe('transcribed')
    expect(interpreted[2]?.resolvedLoad).toEqual({ kind: 'external', weightLb: 30 })
  })
})

describe('paper field validation', () => {
  it('identifies the exact invalid fields', () => {
    const errors = fieldErrorsForPaperExercises([
      {
        measurementKind: 'reps',
        sets: [paperSet({ reps: '10' }), paperSet({ weightLb: '30' })],
      },
    ])
    expect(errors).toEqual([
      {
        path: 'exercises.0.sets.0.weightLb',
        message: 'Load required — no previous load exists to inherit.',
      },
      {
        path: 'exercises.0.sets.1.reps',
        message: 'Reps required for this completed set.',
      },
    ])
    expect(fieldErrorCountSummary(errors.length)).toBe('2 fields need attention')
  })

  it('clears a field error once the value is valid', () => {
    const missing = fieldErrorsForPaperExercises([
      { measurementKind: 'reps', sets: [paperSet({ reps: '10' })] },
    ])
    expect(missing).toHaveLength(1)
    const corrected = fieldErrorsForPaperExercises([
      { measurementKind: 'reps', sets: [paperSet({ weightLb: '30', reps: '10' })] },
    ])
    expect(corrected).toEqual([])
  })

  it('does not flag inherited loads, omitted rows, optional blanks, BW, or out-of-range reps', () => {
    const errors = fieldErrorsForPaperExercises([
      {
        measurementKind: 'reps',
        sets: [
          paperSet({ loadState: 'bodyweight', reps: '20' }),
          paperSet({ reps: '4' }),
          paperSet(),
        ],
      },
    ])
    expect(errors).toEqual([])
  })
})
