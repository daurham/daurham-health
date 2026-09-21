import { assertIanaTimeZone } from '../../src/domain/time.js'
import {
  commitFitProfileImport,
  previewFitProfileImport,
} from './fit-profile-import.js'
import {
  HttpError,
  isXlsxUpload,
  parseMultipart,
  type ApiRequest,
} from '../http.js'

export async function readFitProfileForm(req: ApiRequest): Promise<{
  bytes: Uint8Array
  timezone: string
  filename: string
  fingerprints: string[]
}> {
  const { fields, files } = await parseMultipart(req)
  let timezone: string
  try {
    timezone = assertIanaTimeZone(fields.timezone ?? '')
  } catch {
    throw new HttpError(400, 'A valid IANA timezone is required')
  }

  const file = files.file
  if (!file) {
    throw new HttpError(400, 'An XLSX file is required')
  }
  if (!isXlsxUpload(file)) {
    throw new HttpError(400, 'Only .xlsx files are supported')
  }
  if (file.data.length === 0) {
    throw new HttpError(400, 'The file is empty')
  }

  let fingerprints: string[] = []
  if (fields.fingerprints != null && fields.fingerprints.trim() !== '') {
    let parsed: unknown
    try {
      parsed = JSON.parse(fields.fingerprints)
    } catch {
      throw new HttpError(400, 'fingerprints must be a JSON array of strings')
    }
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
      throw new HttpError(400, 'fingerprints must be a JSON array of strings')
    }
    fingerprints = parsed
  }

  return {
    bytes: file.data,
    timezone,
    filename: file.filename,
    fingerprints,
  }
}

export { commitFitProfileImport, previewFitProfileImport }
