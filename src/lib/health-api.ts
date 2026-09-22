export const OWNER_AUTH_REQUIRED = 'health:owner-auth-required'

const LEAKED_ERROR = /database_url|postgres:\/\/|api[_-]?key|bearer\s+|select\s+.+\s+from|insert\s+into|syntax error at|\bat\s+\S+\.(?:ts|js):\d+/i

export function publicErrorMessage(message: string, fallback = 'Request failed'): string {
  const trimmed = message.trim()
  if (trimmed.length === 0 || trimmed.length > 240 || LEAKED_ERROR.test(trimmed)) {
    return fallback
  }
  return trimmed
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input
  }
  if (input instanceof URL) {
    return input.pathname
  }
  return input.url
}

export async function healthFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    credentials: 'same-origin',
  })
  if (response.status === 401 && typeof window !== 'undefined' && !requestUrl(input).includes('/api/auth/')) {
    window.dispatchEvent(new CustomEvent(OWNER_AUTH_REQUIRED))
  }
  return response
}

export async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.length > 0) {
      return publicErrorMessage(body.error)
    }
  } catch {
    // Fall through to a generic message.
  }
  return 'Request failed'
}
