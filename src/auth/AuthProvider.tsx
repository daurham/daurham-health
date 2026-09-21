import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { healthFetch } from '@/lib'
import { authClient } from './client'
import { AuthContext } from './context'
import type { AuthStatus } from './types'

async function ownerProbe(): Promise<'owner' | 'unauthorized' | 'anonymous'> {
  const response = await healthFetch('/api/session')
  if (response.status === 200) {
    return 'owner'
  }
  if (response.status === 403) {
    return 'unauthorized'
  }
  return 'anonymous'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [email, setEmail] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const session = await authClient.getSession()
      const user = session.data?.user as { email?: string } | undefined
      if (!session.data?.session || !user) {
        setEmail(null)
        setStatus('anonymous')
        return
      }
      setEmail(typeof user.email === 'string' ? user.email : null)
      setStatus(await ownerProbe())
    } catch {
      setEmail(null)
      setStatus('anonymous')
    }
  }, [])

  const signOut = useCallback(async () => {
    await authClient.signOut()
    setEmail(null)
    setStatus('anonymous')
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const value = useMemo(
    () => ({ status, email, refresh, signOut }),
    [status, email, refresh, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
