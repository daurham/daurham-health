import { useEffect, useState } from 'react'
import { DEFAULT_TREND_PREFERENCES, type TrendPreferences } from '@/domain/trend-intent'
import { TREND_INTENT_STORAGE_KEY, readTrendPreferences } from '@/trend-intent'

function currentPreferences(): TrendPreferences {
  return typeof localStorage === 'undefined'
    ? { ...DEFAULT_TREND_PREFERENCES }
    : readTrendPreferences(localStorage)
}

export function useTrendPreferences(): TrendPreferences {
  const [preferences, setPreferences] = useState<TrendPreferences>(currentPreferences)

  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === TREND_INTENT_STORAGE_KEY || event.key === null) {
        setPreferences(currentPreferences())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  return preferences
}
