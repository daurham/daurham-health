// SheetJS community xlsx 0.18.5 has high-severity prototype-pollution and ReDoS
// advisories with no npm fix. This parser only reads owner-trusted Fit Profile
// exports; do not swap the library solely to silence audit.
import * as XLSX from 'xlsx'
import {
  FIT_PROFILE_METRIC_MAPPINGS,
  FIT_PROFILE_REQUIRED_HEADERS,
  FIT_PROFILE_VENDOR_HEADERS,
  displayValueForMetric,
  normalizeFitProfileMetric,
} from '../../../src/domain/body-metrics.ts'
import { parseWallClockInTimeZone } from '../../../src/domain/time.ts'
import { fitProfileFingerprint } from './fingerprint.ts'

export class FitProfileParseError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode = 400) {
    super(message)
    this.name = 'FitProfileParseError'
    this.statusCode = statusCode
  }
}

export type FitProfileRawRow = Record<string, unknown>

export type FitProfileCanonicalMetric = {
  key: string
  value: number
  unit: 'kg' | 'percent' | 'ratio' | 'index' | 'kcal_per_day' | 'years'
  valueKind: 'measured' | 'device_estimated' | 'vendor_derived' | 'manual'
  sourceHeader: string
  sourceValue: number
  displayValue: number
  displayUnit: string
}

export type FitProfileCandidate = {
  fingerprint: string
  measuredAt: Date
  timezone: string
  deviceName: string | null
  sourceMeasuredAt: string
  metrics: FitProfileCanonicalMetric[]
  vendor: Record<string, unknown>
  sourcePayload: FitProfileRawRow
}

function cellString(value: unknown): string {
  if (value == null) {
    return ''
  }
  if (value instanceof Date) {
    const month = String(value.getMonth() + 1).padStart(2, '0')
    const day = String(value.getDate()).padStart(2, '0')
    const year = value.getFullYear()
    const hour = String(value.getHours()).padStart(2, '0')
    const minute = String(value.getMinutes()).padStart(2, '0')
    const second = String(value.getSeconds()).padStart(2, '0')
    return `${month}/${day}/${year} ${hour}:${minute}:${second}`
  }
  return String(value).trim()
}

function parseNumeric(value: unknown, header: string): number | null {
  if (value == null || value === '') {
    return null
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new FitProfileParseError(`Invalid numeric value for ${header}`)
    }
    return value
  }
  const text = String(value).trim()
  if (text.length === 0) {
    return null
  }
  const parsed = Number(text)
  if (!Number.isFinite(parsed)) {
    throw new FitProfileParseError(`Invalid numeric value for ${header}`)
  }
  return parsed
}

function jsonSafeRow(row: FitProfileRawRow): FitProfileRawRow {
  const out: FitProfileRawRow = {}
  for (const [key, value] of Object.entries(row)) {
    if (value instanceof Date) {
      out[key] = value.toISOString()
    } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value == null) {
      out[key] = value
    } else {
      out[key] = String(value)
    }
  }
  return out
}

function worksheetHeaders(sheet: XLSX.WorkSheet): string[] {
  const aoa = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: null,
  }) as unknown[][]
  const first = aoa[0] ?? []
  return first.map((cell) => String(cell ?? '').trim()).filter((header) => header.length > 0)
}

function headersMatch(headers: string[]): { missing: string[]; extra: string[] } {
  const present = new Set(headers)
  const missing = FIT_PROFILE_REQUIRED_HEADERS.filter((header) => !present.has(header))
  const extra = headers.filter((header) => !FIT_PROFILE_REQUIRED_HEADERS.includes(header))
  return { missing, extra }
}

function findFitProfileSheet(workbook: XLSX.WorkBook): XLSX.WorkSheet {
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) {
      continue
    }
    const { missing } = headersMatch(worksheetHeaders(sheet))
    if (missing.length === 0) {
      return sheet
    }
  }
  throw new FitProfileParseError(
    'Unrecognized workbook. A Fit Profile export with the expected measurement headers was not found.',
  )
}

function parseRow(
  row: FitProfileRawRow,
  timezone: string,
  index: number,
): FitProfileCandidate {
  const sourceMeasuredAt = cellString(row['Measure Time'])
  if (sourceMeasuredAt.length === 0) {
    throw new FitProfileParseError(`Row ${index + 1} is missing Measure Time`)
  }

  let measuredAt: Date
  try {
    measuredAt = parseWallClockInTimeZone(sourceMeasuredAt, timezone)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid Measure Time'
    throw new FitProfileParseError(`Row ${index + 1}: ${message}`)
  }

  const weight = parseNumeric(row['Weight(lb)'], 'Weight(lb)')
  if (weight == null) {
    throw new FitProfileParseError(`Row ${index + 1} is missing Weight(lb)`)
  }

  const metrics: FitProfileCanonicalMetric[] = []
  for (const mapping of FIT_PROFILE_METRIC_MAPPINGS) {
    const sourceValue =
      mapping.header === 'Weight(lb)'
        ? weight
        : parseNumeric(row[mapping.header], mapping.header)
    if (sourceValue == null) {
      continue
    }
    const canonical = normalizeFitProfileMetric(mapping, sourceValue)
    const display = displayValueForMetric(canonical.unit, canonical.value)
    metrics.push({
      ...canonical,
      sourceHeader: mapping.header,
      sourceValue,
      displayValue: display.value,
      displayUnit: display.unit,
    })
  }

  const vendor: Record<string, unknown> = {}
  for (const header of FIT_PROFILE_VENDOR_HEADERS) {
    if (row[header] != null && cellString(row[header]).length > 0) {
      vendor[header] = row[header]
    }
  }

  const deviceNameRaw = cellString(row['Device Name'])
  const deviceMac = cellString(row['Device MAC Address'])
  const deviceName = deviceNameRaw.length > 0 ? deviceNameRaw : null
  const fingerprint = fitProfileFingerprint({
    measuredAtIso: measuredAt.toISOString(),
    deviceName: deviceName ?? '',
    deviceMac,
    metrics: metrics.map((metric) => ({
      key: metric.key,
      value: metric.value,
      unit: metric.unit,
    })),
  })

  return {
    fingerprint,
    measuredAt,
    timezone,
    deviceName,
    sourceMeasuredAt,
    metrics,
    vendor,
    sourcePayload: jsonSafeRow(row),
  }
}

export function parseFitProfileWorkbook(
  bytes: Uint8Array,
  timezone: string,
): FitProfileCandidate[] {
  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(bytes, { type: 'array', raw: true, cellDates: true })
  } catch {
    throw new FitProfileParseError('The file could not be read as an XLSX workbook')
  }

  if (workbook.SheetNames.length === 0) {
    throw new FitProfileParseError('The workbook has no worksheets')
  }

  const sheet = findFitProfileSheet(workbook)
  const rows = XLSX.utils.sheet_to_json<FitProfileRawRow>(sheet, {
    raw: true,
    defval: null,
  })

  if (rows.length === 0) {
    throw new FitProfileParseError('The Fit Profile worksheet has no measurement rows')
  }

  return rows.map((row, index) => parseRow(row, timezone, index))
}

export function validateFitProfileHeaders(headers: string[]): void {
  const { missing } = headersMatch(headers)
  if (missing.length > 0) {
    throw new FitProfileParseError(
      `Unrecognized workbook. Missing headers: ${missing.slice(0, 8).join(', ')}`,
    )
  }
}
