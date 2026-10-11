import { describe, expect, it } from 'vitest'
import {
  buildTrainingWeekQualification,
  buildTrainingRoutineCredits,
  MIN_EXERCISES_PER_TRAINING_DAY,
  type PerformedExerciseEvidence,
} from '../src/domain/training-qualification.ts'

const entry = (date: string, exerciseId: string, routineCode: string | null = null): PerformedExerciseEvidence =>
  ({ date, exerciseId, routineCode })

describe('qualifying Training days', () => {
  it('uses three distinct performed exercises regardless of how many ad-hoc session entries contain them', () => {
    const result = buildTrainingWeekQualification([
      entry('2026-10-05', 'pushups'),
      entry('2026-10-05', 'crunches'),
      entry('2026-10-05', 'squats'),
    ], '2026-10-07')
    expect(MIN_EXERCISES_PER_TRAINING_DAY).toBe(3)
    expect(result.completedDays).toBe(1)
    expect(result.days[0]).toMatchObject({ date: '2026-10-05', distinctExerciseCount: 3, qualifies: true })
  })

  it('does not count multiple sets or multiple workouts of the same exercise more than once', () => {
    const result = buildTrainingWeekQualification([
      entry('2026-10-05', 'pushups'), entry('2026-10-05', 'pushups'),
      entry('2026-10-05', 'pushups'), entry('2026-10-05', 'crunches'),
    ], '2026-10-07')
    expect(result.completedDays).toBe(0)
    expect(result.days[0]?.distinctExerciseCount).toBe(2)
  })

  it('never credits multiple workouts as multiple weekly days', () => {
    const result = buildTrainingWeekQualification([
      entry('2026-10-05', 'pushups', 'B'), entry('2026-10-05', 'crunches', 'B'),
      entry('2026-10-05', 'squats', 'C'), entry('2026-10-05', 'lunges', 'C'),
    ], '2026-10-07')
    expect(result.completedDays).toBe(1)
    expect(result.days[0]?.routineExerciseCounts).toEqual({ B: 2, C: 2 })
  })

  it('keeps per-routine evidence separate from aggregate weekly qualification', () => {
    const result = buildTrainingWeekQualification([
      entry('2026-10-05', 'pushups', 'B'), entry('2026-10-05', 'crunches', 'B'),
      entry('2026-10-05', 'squats'),
    ], '2026-10-07')
    expect(result.completedDays).toBe(1)
    expect(result.days[0]?.routineExerciseCounts).toEqual({ B: 2 })
  })

  it('includes qualifying Monday history when the plan is activated midweek', () => {
    const result = buildTrainingWeekQualification([
      entry('2026-10-05', 'a'), entry('2026-10-05', 'b'), entry('2026-10-05', 'c'),
      entry('2026-10-07', 'd'), entry('2026-10-07', 'e'), entry('2026-10-07', 'f'),
    ], '2026-10-07')
    expect(result.completedDays).toBe(2)
    expect(result.days.map((day) => day.qualifies)).toEqual([true, false, true, false, false, false, false])
  })

  it('clamps historical as-of reads and excludes preceding weeks or future evidence', () => {
    const result = buildTrainingWeekQualification([
      entry('2026-10-04', 'a'), entry('2026-10-04', 'b'), entry('2026-10-04', 'c'),
      entry('2026-10-06', 'x'), entry('2026-10-06', 'y'), entry('2026-10-06', 'z'),
      entry('2026-10-11', 'd'), entry('2026-10-11', 'e'), entry('2026-10-11', 'f'),
    ], '2026-10-06')
    expect(result.completedDays).toBe(1)
    expect(result.days[6]).toMatchObject({ date: '2026-10-11', qualifies: false, distinctExerciseCount: 0 })
  })

  it('allows four qualifying training days to exceed a target of three', () => {
    const evidence = ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'].flatMap((date) => [
      entry(date, 'a'), entry(date, 'b'), entry(date, 'c'),
    ])
    expect(buildTrainingWeekQualification(evidence, '2026-10-11').completedDays).toBe(4)
  })

  it('is deterministic, pure, and recalculates a day when an entry disappears', () => {
    const original = [entry('2026-10-05', 'a'), entry('2026-10-05', 'b'), entry('2026-10-05', 'c')]
    expect(buildTrainingWeekQualification(original, '2026-10-07').completedDays).toBe(1)
    expect(buildTrainingWeekQualification(original.slice(0, 2), '2026-10-07').completedDays).toBe(0)
    expect(original).toHaveLength(3)
  })
})

describe('routine block attribution', () => {
  it('does not advance B on two B exercises plus a qualifying ad-hoc third', () => {
    const data = [entry('2026-10-07', 'pushup', 'B'), entry('2026-10-07', 'crunch', 'B'),
      entry('2026-10-07', 'squat')]
    expect(buildTrainingWeekQualification(data, '2026-10-07').completedDays).toBe(1)
    expect(buildTrainingRoutineCredits(data)).toEqual([])
  })

  it('deduplicates routine exercises for an interrupted session', () => {
    const credit = buildTrainingRoutineCredits([
      entry('2026-10-07', 'pushup', 'B'), entry('2026-10-07', 'crunch', 'B'),
      entry('2026-10-07', 'squat', 'B'), entry('2026-10-07', 'pushup', 'B'),
      entry('2026-10-08', 'squat', 'C')])
    expect(credit).toHaveLength(1)
    expect(credit[0]).toMatchObject({ date: '2026-10-07', routineCode: 'B' })
  })

  it('can credit two routines on a single qualifying weekly date', () => {
    const data = ['A', 'B'].flatMap((routine) =>
      ['one', 'two', 'three'].map((exercise) => entry('2026-10-07', exercise + routine, routine)))
    expect(buildTrainingRoutineCredits(data)).toHaveLength(2)
    expect(buildTrainingWeekQualification(data, '2026-10-07').completedDays).toBe(1)
  })
})
