import { describe, expect, it } from 'vitest'
import {
  addCalendarDays,
  baselineIntentForDate,
  isoWeekday,
  nextRoutineCode,
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
