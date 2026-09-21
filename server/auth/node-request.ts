import { readRequestBuffer, requestApiPathname, type ApiRequest, type ApiResponse } from '../http.js'

export function requestOrigin(req: ApiRequest): string {
  const forwarded = headerString(req, 'x-forwarded-proto')
  const proto = forwarded ?? (headerString(req, 'origin')?.startsWith('https:') ? 'https' : 'http')
  const host = headerString(req, 'x-forwarded-host') ?? headerString(req, 'host') ?? 'localhost'
  const originHeader = headerString(req, 'origin')
  if (originHeader) {
    try {
      return new URL(originHeader).origin
    } catch {
      // Fall through to reconstructed origin.
    }
  }
  return `${proto}://${host}`
}

export function headerString(req: ApiRequest, name: string): string | null {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  if (typeof value === 'string' && value.trim().length > 0) {
    return value
  }
  if (Array.isArray(value) && typeof value[0] === 'string' && value[0].trim().length > 0) {
    return value[0]
  }
  return null
}

export function copyIncomingHeaders(req: ApiRequest): Headers {
  const headers = new Headers()
  for (const [name, value] of Object.entries(req.headers)) {
    if (value == null || name.toLowerCase() === 'host') {
      continue
    }
    if (typeof value === 'string') {
      headers.set(name, value)
    } else if (Array.isArray(value)) {
      headers.set(name, value.join(', '))
    }
  }
  return headers
}

export function sessionProbeRequest(req: ApiRequest): Request {
  const origin = requestOrigin(req)
  return new Request(`${origin}/api/auth/get-session`, {
    method: 'GET',
    headers: copyIncomingHeaders(req),
  })
}

export async function incomingToWebRequest(req: ApiRequest): Promise<Request> {
  const origin = requestOrigin(req)
  const url = `${origin}${req.url ?? '/'}`
  const method = (req.method ?? 'GET').toUpperCase()
  const headers = copyIncomingHeaders(req)
  if (method === 'GET' || method === 'HEAD') {
    return new Request(url, { method, headers })
  }
  const body = await readRequestBuffer(req)
  return new Request(url, {
    method,
    headers,
    body,
    duplex: 'half',
  } as RequestInit)
}

export async function writeWebResponse(res: ApiResponse, response: Response): Promise<void> {
  res.statusCode = response.status
  const skipped = new Set(['transfer-encoding', 'content-encoding', 'content-length'])
  response.headers.forEach((value, key) => {
    if (skipped.has(key.toLowerCase()) || key.toLowerCase() === 'set-cookie') {
      return
    }
    res.setHeader(key, value)
  })
  const cookies =
    typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  if (cookies.length > 0) {
    res.setHeader('Set-Cookie', cookies)
  }
  const buffer = Buffer.from(await response.arrayBuffer())
  res.end(buffer)
}

export function authProxyPath(req: ApiRequest): string {
  const pathname = requestApiPathname(req)
  const prefix = '/api/auth/'
  if (pathname.startsWith(prefix)) {
    return pathname.slice(prefix.length)
  }
  return ''
}
