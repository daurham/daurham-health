import { describe, expect, it } from 'vitest'
import { buildTrainingProgressionState, substitutionRelation, type TrainingProgressionExercise, type TrainingProgressionSet } from '../src/domain/training-progression.js'

const exercise: TrainingProgressionExercise = {
  id: 'bench',
  name: 'Bench Press',
  performanceType: 'loaded_reps',
  loadType: 'barbell',
  movementPattern: 'horizontal_push',
  primaryMuscleGroup: 'chest',
  secondaryMuscleGroups: ['triceps'],
}

function set(date: string, sessionId: string, weightKg: number, reps: number, rir: number | null = 2, limitationKind: string | null = null): TrainingProgressionSet {
  return {
    setId: sessionId + '-set',
    sessionId,
    date,
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    performanceType: exercise.performanceType,
    loadType: exercise.loadType,
    movementPattern: exercise.movementPattern,
    primaryMuscleGroup: exercise.primaryMuscleGroup,
    secondaryMuscleGroups: exercise.secondaryMuscleGroups,
    setType: 'working',
    completed: true,
    weightKg,
    reps,
    leftReps: null,
    rightReps: null,
    durationSec: null,
    leftDurationSec: null,
    rightDurationSec: null,
    distanceM: null,
    bodyweightKg: 80,
    rir,
    rpe: null,
    failureKind: null,
    leftFailureKind: null,
    rightFailureKind: null,
    sessionEffort: 3,
    limitationKind,
  }
}

describe('training progression', () => {
  it('finds exact-exercise progression without merging substitutes', () => {
    const state = buildTrainingProgressionState({
      asOf: '2026-10-06',
      sets: [
        set('2026-09-01', 'a', 60, 8),
        set('2026-09-08', 'b', 61, 8),
        set('2026-09-22', 'c', 66, 8),
        set('2026-10-01', 'd', 68, 8),
      ],
      exercises: [exercise, { ...exercise, id: 'incline', name: 'Incline Press', loadType: 'dumbbell' }],
      goals: [],
    })
    expect(state.series).toHaveLength(1)
    expect(state.series[0]?.state).toBe('progressing')
    expect(state.series[0]?.recentRelativeStrength).toBeGreaterThan(0)
  })

  it('does not call a lower performance exposure a decline when effort/recovery changed', () => {
    const state = buildTrainingProgressionState({
      asOf: '2026-10-06',
      sets: [
        set('2026-09-01', 'a', 70, 8, 3),
        set('2026-09-08', 'b', 70, 8, 3),
        set('2026-09-22', 'c', 65, 8, 1, 'fatigue'),
        set('2026-10-01', 'd', 64, 8, 1, 'fatigue'),
      ],
      exercises: [exercise],
      goals: [],
    })
    expect(state.series[0]?.state).toBe('confounded')
  })

  it('distinguishes comparable substitutes from merely similar muscles', () => {
    const comparable = { ...exercise, id: 'db-bench', name: 'Dumbbell Bench', loadType: 'dumbbell' }
    const similar = { ...exercise, id: 'fly', name: 'Cable Fly', loadType: 'cable', movementPattern: 'shoulder_adduction' }
    expect(substitutionRelation(exercise, comparable)).toBeNull()
    expect(substitutionRelation({ ...exercise, loadType: 'dumbbell_or_kettlebell' }, comparable)).toBe('comparable_substitute')
    expect(substitutionRelation(exercise, similar)).toBe('similar_muscle_group')
  })
})
