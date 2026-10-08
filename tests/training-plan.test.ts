import { describe, expect, it } from 'vitest'
import {
  addCalendarDays,
  compactRoutineSequence,
  expandRoutineBlocks,
  trainingPlanInputSchema,
  baselineIntentForDate,
  isoWeekday,
  nextRoutineCode,
  nextRoutineIndex,
  repeatProgressAtPosition,
  sequenceFromPosition,
  sequenceFromStart,
  weekStartMonday,
} from '../src/domain/training-plan.ts'

describe('Training Plan domain', () => {
  it('uses ISO weekdays and Monday week boundaries', () => {
    expect(isoWeekday('2026-10-06')).toBe(2)
    expect(weekStartMonday('2026-10-06')).toBe('2026-10-05')
    expect(addCalendarDays('2026-10-05', 6)).toBe('2026-10-11')
  })

  it('treats preferred weekdays as intent, not deadlines', () => {
    expect(baselineIntentForDate('2026-10-05', [1, 3, 5], 'rest')).toBe('training_preferred')
    expect(baselineIntentForDate('2026-10-06', [1, 3, 5], 'rest')).toBe('rest')
    expect(baselineIntentForDate('2026-10-06', [1, 3, 5], 'flexible')).toBe('flexible')
  })

  it('keeps routine sequence authoritative', () => {
    const sequence = ['A', 'B', 'C']
    expect(nextRoutineCode(sequence, [])).toBe('A')
    expect(nextRoutineCode(sequence, ['A'])).toBe('B')
    expect(nextRoutineCode(sequence, ['A', 'B'])).toBe('C')
    expect(nextRoutineCode(sequence, ['A', 'B', 'C'])).toBe('A')
  })

  it('supports six-session A, B, C blocks and loops after eighteen sessions', () => {
    const blocks = [{ routineCode: 'A', count: 6 }, { routineCode: 'B', count: 6 }, { routineCode: 'C', count: 6 }]
    const expanded = expandRoutineBlocks(blocks)
    expect(expanded).toHaveLength(18)
    expect(compactRoutineSequence(expanded)).toEqual(blocks)
    const input = { weeklyFrequencyTarget: 3, defaultNonTrainingIntent: 'flexible',
      preferredWeekdays: [1, 3, 5], sequenceRoutineCodes: expanded, note: null }
    expect(trainingPlanInputSchema.safeParse(input).success).toBe(true)
    expect(nextRoutineCode(expanded, Array(5).fill('A'))).toBe('A')
    expect(nextRoutineCode(expanded, Array(6).fill('A'))).toBe('B')
    expect(nextRoutineCode(expanded, [...Array(6).fill('A'), ...Array(6).fill('B')])).toBe('C')
    expect(nextRoutineCode(expanded, expanded)).toBe('A')
    expect(trainingPlanInputSchema.safeParse({ ...input, sequenceRoutineCodes: ['A', 'B', 'A'] }).success).toBe(false)
  })

  it('preserves the repeated-slot offset across mid-block plan edits', () => {
    const codes = expandRoutineBlocks([
      { routineCode: 'A', count: 6 }, { routineCode: 'B', count: 6 }, { routineCode: 'C', count: 6 },
    ])
    const ordered = sequenceFromPosition(codes, 4)
    expect(ordered[0]).toBe('A')
    expect(nextRoutineIndex(ordered, [])).toBe(0)
    expect(repeatProgressAtPosition(codes, 3)).toEqual({ session: 4, total: 6 })
    expect(nextRoutineCode(ordered, ['A', 'A'])).toBe('A')
    expect(nextRoutineCode(ordered, ['A', 'A', 'A'])).toBe('B')
    expect(repeatProgressAtPosition(codes, 6)).toEqual({ session: 1, total: 6 })
  })

  it('does not let an out-of-order programmed session silently skip the next routine', () => {
    const sequence = ['A', 'B', 'C']
    expect(nextRoutineCode(sequence, ['A', 'C'])).toBe('B')
    expect(nextRoutineCode(sequence, ['A', 'C', 'B'])).toBe('C')
  })

  it('can carry the previous next-session pointer into a new plan version', () => {
    const sequence = sequenceFromStart(['A', 'B', 'C'], 'B')
    expect(sequence).toEqual(['B', 'C', 'A'])
    expect(nextRoutineCode(sequence, [])).toBe('B')
    expect(nextRoutineCode(sequence, ['B'])).toBe('C')
  })
})
