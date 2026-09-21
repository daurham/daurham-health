import type { IncomingMessage, ServerResponse } from 'node:http'

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export type ApiRequest = IncomingMessage & {
  method?: string
  url?: string
  body?: unknown
}

export type ApiResponse = ServerResponse & {
  status: (code: number) => ApiResponse
  json: (body: unknown) => void
}

export class HttpError extends Error {
  readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
  }
}

export function sendJson(res: ApiResponse, statusCode: number, body: unknown): void {
  res.status(statusCode).json(body)
}

export function sendError(res: ApiResponse, statusCode: number, message: string): void {
  sendJson(res, statusCode, { error: message })
}

export function handleApiError(res: ApiResponse, error: unknown): void {
  if (error instanceof HttpError) {
    sendError(res, error.statusCode, error.message)
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

export async function parseMultipart(req: ApiRequest): Promise<MultipartBody> {
  const contentType = req.headers['content-type']
  if (typeof contentType !== 'string' || !contentType.toLowerCase().includes('multipart/form-data')) {
    throw new HttpError(400, 'Expected multipart form data')
  }
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType)
  const boundary = boundaryMatch?.[1] ?? boundaryMatch?.[2]
  if (!boundary) {
    throw new HttpError(400, 'Missing multipart boundary')
  }

  const buffer = await readRequestBuffer(req)
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
