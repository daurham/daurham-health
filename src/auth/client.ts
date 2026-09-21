import { createAuthClient } from '@neondatabase/neon-js/auth'

function authBaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api/auth`
  }
  return 'http://127.0.0.1/api/auth'
}

export const authClient = createAuthClient(authBaseUrl())
