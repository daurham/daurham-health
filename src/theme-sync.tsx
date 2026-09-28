import { useEffect } from 'react'
import { syncAppearance } from '@/theme'

export function ThemeSync() {
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const root = document.documentElement
    function paint(reason: 'mount' | 'media' | 'storage', storageKey?: string | null) {
      syncAppearance({
        storage: localStorage,
        prefersDark: media.matches,
        root,
        reason,
        storageKey,
      })
    }
    function onMedia() {
      paint('media')
    }
    function onStorage(event: StorageEvent) {
      paint('storage', event.key)
    }
    paint('mount')
    media.addEventListener('change', onMedia)
    window.addEventListener('storage', onStorage)
    return () => {
      media.removeEventListener('change', onMedia)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
  return null
}
