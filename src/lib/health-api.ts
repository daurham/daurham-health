export async function healthFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    credentials: 'same-origin',
  })
}

export async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.length > 0) {
      return body.error
    }
  } catch {
    // Fall through to a generic message.
  }
  return 'Request failed'
}
