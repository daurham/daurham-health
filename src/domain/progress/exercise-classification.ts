import { TRAINING_EXERCISE_SEEDS } from '../training-library.js'
import type {
  AnalyticsLoadType,
  AnalyticsRepMode,
  PerformanceType,
  ProgressExerciseDefinition,
} from './types.js'

const PER_SIDE_EXTERNAL_IDS = new Set(['EX11', 'EX13', 'EX16'])

const BY_EXTERNAL_ID: ReadonlyMap<
  string,
  { performanceType: PerformanceType; analyticsLoadType: AnalyticsLoadType; analyticsRepMode: AnalyticsRepMode }
> = new Map(
  TRAINING_EXERCISE_SEEDS.map((seed) => {
    const timed = seed.measurementKind === 'duration' || seed.measurementKind === 'duration_per_side'
    return [
      seed.externalId,
      {
        performanceType: timed ? 'timed' : 'loaded_reps',
        analyticsLoadType: 'external',
        analyticsRepMode: PER_SIDE_EXTERNAL_IDS.has(seed.externalId) ? 'per_side' : 'standard',
      },
    ] as const
  }),
)

export function classificationForExternalId(externalId: string | null): {
  performanceType: PerformanceType
  analyticsLoadType: AnalyticsLoadType
  analyticsRepMode: AnalyticsRepMode
} {
  if (externalId && BY_EXTERNAL_ID.has(externalId)) {
    return BY_EXTERNAL_ID.get(externalId)!
  }
  return { performanceType: 'other', analyticsLoadType: 'none', analyticsRepMode: 'standard' }
}

export function withAnalyticsClassification(
  exercise: Omit<ProgressExerciseDefinition, 'performanceType' | 'analyticsLoadType' | 'analyticsRepMode'> & {
    performanceType?: PerformanceType
    analyticsLoadType?: AnalyticsLoadType
    analyticsRepMode?: AnalyticsRepMode
  },
): ProgressExerciseDefinition {
  const fallback = classificationForExternalId(exercise.externalId)
  return {
    ...exercise,
    performanceType: exercise.performanceType ?? fallback.performanceType,
    analyticsLoadType: exercise.analyticsLoadType ?? fallback.analyticsLoadType,
    analyticsRepMode: exercise.analyticsRepMode ?? fallback.analyticsRepMode,
  }
}

export function supportsLoadedRepStrength(exercise: ProgressExerciseDefinition): boolean {
  return exercise.performanceType === 'loaded_reps' && exercise.analyticsLoadType === 'external'
}

export function supportsTimedExternal(exercise: ProgressExerciseDefinition): boolean {
  return exercise.performanceType === 'timed' && exercise.analyticsLoadType === 'external'
}

export function isPerSideExercise(exercise: ProgressExerciseDefinition): boolean {
  return exercise.analyticsRepMode === 'per_side'
}
