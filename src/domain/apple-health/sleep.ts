import type { SleepStage } from './config.js'

const SLEEP_VALUE_MAP: Record<string, SleepStage> = {
  HKCategoryValueSleepAnalysisInBed: 'in_bed',
  HKCategoryValueSleepAnalysisAsleepUnspecified: 'asleep',
  HKCategoryValueSleepAnalysisAsleep: 'asleep',
  HKCategoryValueSleepAnalysisAwake: 'awake',
  HKCategoryValueSleepAnalysisAsleepCore: 'core',
  HKCategoryValueSleepAnalysisAsleepDeep: 'deep',
  HKCategoryValueSleepAnalysisAsleepREM: 'rem',
  '0': 'in_bed',
  '1': 'asleep',
  '2': 'awake',
  '3': 'core',
  '4': 'deep',
  '5': 'rem',
}

export function mapSleepStage(sourceCategory: string): { stage: SleepStage; known: boolean } {
  const key = sourceCategory.trim()
  const stage = SLEEP_VALUE_MAP[key]
  if (stage) {
    return { stage, known: true }
  }
  return { stage: 'unsupported', known: false }
}
