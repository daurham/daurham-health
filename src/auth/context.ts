import { createContext, useContext } from 'react'
import type { AuthStatus } from './types'

export type AuthContextValue = {
  status: AuthStatus
  email: string | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (!value) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return value
}
