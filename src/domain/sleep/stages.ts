import { mapSleepStage } from '../apple-health/sleep.js'
import { SLEEP_ASLEEP_CATEGORIES, type SleepAnalyticsCategory, type SleepAsleepCategory } from './config.js'

export function normalizeSleepAnalyticsCategory(stage: string, sourceCategory?: string | null): SleepAnalyticsCategory | null {
  const direct = fromKnownToken(stage)
  if (direct) {
    return direct
  }
  if (sourceCategory) {
    const mapped = mapSleepStage(sourceCategory)
    if (mapped.known) {
      return fromKnownToken(mapped.stage)
    }
  }
  return null
}

function fromKnownToken(value: string): SleepAnalyticsCategory | null {
  const token = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (token === 'asleep' || token === 'asleep_unspecified') {
    return 'asleep_unspecified'
  }
  if (token === 'in_bed' || token === 'awake' || token === 'core' || token === 'deep' || token === 'rem') {
    return token
  }
  return null
}

export function isAsleepCategory(category: SleepAnalyticsCategory): category is SleepAsleepCategory {
  return (SLEEP_ASLEEP_CATEGORIES as readonly string[]).includes(category)
}
