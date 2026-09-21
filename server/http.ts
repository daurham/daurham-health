import type { IncomingMessage, ServerResponse } from 'node:http'
import type { ReviewFieldError } from '../src/domain/paper-load.js'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export type ApiRequest = IncomingMessage & {
  method?: string
  url?: string
  body?: unknown
  query?: Record<string, string | string[] | undefined>
}

export type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

export class HttpError extends Error {
  readonly statusCode: number
  readonly fields?: ReviewFieldError[]

  constructor(statusCode: number, message: string, fields?: ReviewFieldError[]) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
    this.fields = fields
  }
}

export function sendJson(res: ApiResponse, statusCode: number, body: unknown): void {
  res.status(statusCode).json(body)
}

export function sendError(
  res: ApiResponse,
  statusCode: number,
  message: string,
  fields?: ReviewFieldError[],
): void {
  if (fields && fields.length > 0) {
    sendJson(res, statusCode, { error: message, fields })
    return
  }
  sendJson(res, statusCode, { error: message })
}

export function handleApiError(res: ApiResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendError(res, error.statusCode, error.message, error.fields)
    return
  }
  if (error && typeof error === 'object' && 'statusCode' in error && 'message' in error) {
    const statusCode = Number(error.statusCode)
    const message = typeof error.message === 'string' ? error.message : 'Request failed'
    if (Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 500) {
      sendError(res, statusCode, message)
      return
    }
  }
  sendError(res, 500, 'Unexpected server error')
}

export function requestPathname(req: ApiRequest): string {
  const url = req.url ?? ''
  return url.split('?')[0] ?? ''
}

function decodePathSegment(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function catchAllApiPathname(req: ApiRequest): string | null {
  const query = req.query?.path
  if (Array.isArray(query) && query.length > 0 && query.every((part) => typeof part === 'string')) {
    return `/api/${query.map((part) => decodePathSegment(part)).join('/')}`
  }
  if (typeof query === 'string' && query.trim().length > 0) {
    return `/api/${decodePathSegment(query).replace(/^\/+/, '')}`
  }
  return null
}

/** Original /api/... pathname, or Vercel catch-all query.path when url is rewritten. */
export function requestApiPathname(req: ApiRequest): string {
  const pathname = requestPathname(req)
  if (pathname.startsWith('/api/')) {
    return pathname
  }
  return catchAllApiPathname(req) ?? pathname
}

export function pathParamAfter(req: ApiRequest, prefix: string): string | null {
  const pathname = requestApiPathname(req)
  const normalizedPrefix = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix
  if (!pathname.startsWith(`${normalizedPrefix}/`)) {
    return null
  }
  const rest = pathname.slice(normalizedPrefix.length + 1)
  if (rest.length === 0 || rest.includes('/')) {
    return null
  }
  return decodeURIComponent(rest)
}

/** Single string query value. Arrays, blanks, and non-strings are ignored. */
export function queryStringParam(req: ApiRequest, name: string): string | null {
  const value = req.query?.[name]
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      return trimmed
    }
  }
  return null
}

/** Query value from Vercel req.query or the request URL (Vite local `/api/...?...`). */
export function requestQueryValue(req: ApiRequest, name: string): string | null {
  const fromQuery = queryStringParam(req, name)
  if (fromQuery) {
    return fromQuery
  }
  const url = req.url ?? ''
  const question = url.indexOf('?')
  if (question < 0) {
    return null
  }
  const params = new URLSearchParams(url.slice(question + 1))
  const value = params.get(name)?.trim()
  return value && value.length > 0 ? value : null
}

export async function readJsonBody(req: ApiRequest, maxBytes = MAX_UPLOAD_BYTES): Promise<unknown> {
  const contentType = req.headers['content-type']
  if (typeof contentType === 'string' && !contentType.toLowerCase().includes('application/json')) {
    throw new HttpError(400, 'Expected JSON body')
  }

  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body
  }

  const buffer = await readRequestBuffer(req, maxBytes)
  if (buffer.length === 0) {
    throw new HttpError(400, 'Expected JSON body')
  }
  try {
    return JSON.parse(buffer.toString('utf8')) as unknown
  } catch {
    throw new HttpError(400, 'Invalid JSON')
  }
}

export async function readRequestBuffer(
  req: ApiRequest,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<Buffer> {
  if (typeof req.body === 'string') {
    return Buffer.from(req.body)
  }
  if (Buffer.isBuffer(req.body)) {
    return req.body
  }
  if (req.body instanceof Uint8Array) {
    return Buffer.from(req.body)
  }

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > maxBytes) {
      throw new HttpError(413, 'File is too large')
    }
    chunks.push(buffer)
  }
  return Buffer.concat(chunks)
}

export type MultipartFile = {
  fieldName: string
  filename: string
  mimeType: string
  data: Buffer
}

export type MultipartBody = {
  fields: Record<string, string>
  files: Record<string, MultipartFile>
}

function headerValue(headers: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\r\\n)${name}:\\s*([^\\r\\n]+)`, 'i').exec(headers)
  return match ? match[1].trim() : null
}

function parseContentDisposition(value: string): { name: string; filename: string | null } {
  const nameMatch = /name="([^"]+)"/i.exec(value)
  const filenameMatch = /filename="([^"]*)"/i.exec(value)
  return {
    name: nameMatch?.[1] ?? '',
    filename: filenameMatch ? filenameMatch[1] : null,
  }
}

export async function parseMultipart(
  req: ApiRequest,
  maxBytes = MAX_UPLOAD_BYTES,
): Promise<MultipartBody> {
  const contentType = req.headers['content-type']
  if (typeof contentType !== 'string' || !contentType.toLowerCase().includes('multipart/form-data')) {
    throw new HttpError(400, 'Expected multipart form data')
  }
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2]
  if (!boundary) {
    throw new HttpError(400, 'Missing multipart boundary')
  }

  const buffer = await readRequestBuffer(req, maxBytes)
  const delimiter = Buffer.from(`--${boundary}`)
  const parts: Buffer[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = buffer.indexOf(delimiter, offset)
    if (start === -1) {
      break
    }
    const contentStart = start + delimiter.length
    if (buffer.subarray(contentStart, contentStart + 2).toString() === '--') {
      break
    }
    let next = buffer.indexOf(delimiter, contentStart)
    if (next === -1) {
      next = buffer.length
    }
    let part = buffer.subarray(contentStart, next)
    if (part.subarray(0, 2).toString() === '\r\n') {
      part = part.subarray(2)
    }
    if (part.subarray(-2).toString() === '\r\n') {
      part = part.subarray(0, part.length - 2)
    }
    parts.push(part)
    offset = next
  }

  const fields: Record<string, string> = {}
  const files: Record<string, MultipartFile> = {}

  for (const part of parts) {
    const headerEnd = part.indexOf('\r\n\r\n')
    if (headerEnd === -1) {
      continue
    }
    const headers = part.subarray(0, headerEnd).toString('utf8')
    const body = part.subarray(headerEnd + 4)
    const disposition = headerValue(headers, 'content-disposition')
    if (!disposition) {
      continue
    }
    const { name, filename } = parseContentDisposition(disposition)
    if (!name) {
      continue
    }
    if (filename != null) {
      files[name] = {
        fieldName: name,
        filename,
        mimeType: headerValue(headers, 'content-type') ?? 'application/octet-stream',
        data: body,
      }
    } else {
      fields[name] = body.toString('utf8').replace(/\r\n$/, '')
    }
  }

  return { fields, files }
}

export function wrapNodeResponse(res: ServerResponse): ApiResponse {
  const api = res as ApiResponse
  api.status = (code: number) => {
    res.statusCode = code
    return api
  }
  api.json = (body: unknown) => {
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    res.end(JSON.stringify(body))
  }
  return api
}

export function isXlsxUpload(file: MultipartFile): boolean {
  const name = file.filename.toLowerCase()
  if (!name.endsWith('.xlsx')) {
    return false
  }
  const mime = file.mimeType.toLowerCase()
  return (
    mime.length === 0 ||
    mime === 'application/octet-stream' ||
    mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/zip'
  )
}
