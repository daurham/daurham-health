import { useEffect } from 'react'
import { applyDocumentTheme, applyStoredTheme, readThemePreference, resolveTheme } from '@/theme'

export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    applyStoredTheme(localStorage, media.matches, document.documentElement)
    function onChange() {
      if (readThemePreference(localStorage) == null) {
        applyDocumentTheme(resolveTheme(null, media.matches), document.documentElement)
      }
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return null
}
