import { createAuthClient } from '@neondatabase/neon-js/auth'

function authBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/auth`
  }
  return '/api/auth'
}

export const authClient = createAuthClient(authBaseUrl())
