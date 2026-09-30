import {
  DEFAULT_TREND_PREFERENCES,
  TREND_INTENT_VERSION,
  type TrendPreferenceDirection,
  type TrendPreferences,
} from './domain/trend-intent.js'

export const TREND_INTENT_STORAGE_KEY = 'health-trend-intent-v1'

type StorageReader = Pick<Storage, 'getItem'>
type StorageWriter = Pick<Storage, 'setItem' | 'removeItem'>

const BODY_VALUES = new Set<TrendPreferenceDirection>(['lower', 'maintain', 'higher', 'none'])
const UP_VALUES = new Set(['higher', 'none'])

export function readTrendPreferences(storage: StorageReader): TrendPreferences {
  const raw = storage.getItem(TREND_INTENT_STORAGE_KEY)
  if (!raw) return { ...DEFAULT_TREND_PREFERENCES }
  try {
    const parsed = JSON.parse(raw) as Partial<TrendPreferences>
    if (
      parsed.version !== TREND_INTENT_VERSION ||
      !BODY_VALUES.has(parsed.bodyweight as TrendPreferenceDirection) ||
      !BODY_VALUES.has(parsed.bodyFat as TrendPreferenceDirection) ||
      !BODY_VALUES.has(parsed.waist as TrendPreferenceDirection) ||
      !UP_VALUES.has(parsed.strength ?? '') ||
      !UP_VALUES.has(parsed.activitySteps ?? '')
    ) {
      return { ...DEFAULT_TREND_PREFERENCES }
    }
    return {
      version: TREND_INTENT_VERSION,
      bodyweight: parsed.bodyweight!,
      bodyFat: parsed.bodyFat!,
      waist: parsed.waist!,
      strength: parsed.strength as 'higher' | 'none',
      activitySteps: parsed.activitySteps as 'higher' | 'none',
    }
  } catch {
    return { ...DEFAULT_TREND_PREFERENCES }
  }
}

export function writeTrendPreferences(storage: StorageWriter, preferences: TrendPreferences): void {
  storage.setItem(TREND_INTENT_STORAGE_KEY, JSON.stringify({ ...preferences, version: TREND_INTENT_VERSION }))
}

export function clearTrendPreferences(storage: StorageWriter): void {
  storage.removeItem(TREND_INTENT_STORAGE_KEY)
}
