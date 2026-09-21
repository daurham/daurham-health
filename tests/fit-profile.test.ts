import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIT_PROFILE_REQUIRED_HEADERS, parseOptionalNumericCell } from '../src/domain/body-metrics.ts'
import { kilogramsToPounds, poundsToKilograms } from '../src/domain/units.ts'
import { FitProfileParseError, parseFitProfileWorkbook } from '../server/integrations/fit-profile/parse.ts'
import { buildCandidateCommitStatements } from '../server/body/fit-profile-import.ts'
import { fitProfileWorkbookBytes, sanitizedFitProfileRow } from './helpers/fit-profile-workbook.ts'

function localFitProfilePath(): string | null {
  try {
    const files = readdirSync('fixtures').filter((name) => name.toLowerCase().endsWith('.xlsx'))
    const file = files[0]
    return file ? path.join('fixtures', file) : null
  } catch {
    return null
  }
}

describe('pounds to kilograms', () => {
  it('uses the documented conversion constant', () => {
    expect(poundsToKilograms(192)).toBeCloseTo(87.0897, 4)
    expect(kilogramsToPounds(poundsToKilograms(180))).toBeCloseTo(180, 10)
  })
})

describe('Fit Profile parser', () => {
  it('rejects a workbook missing required headers', () => {
    const headers = FIT_PROFILE_REQUIRED_HEADERS.filter((header) => header !== 'Weight(lb)')
    const bytes = fitProfileWorkbookBytes([sanitizedFitProfileRow()], headers)
    expect(() => parseFitProfileWorkbook(bytes, 'America/Phoenix')).toThrow(FitProfileParseError)
  })

  it('parses the known header shape and maps canonical metrics', () => {
    const bytes = fitProfileWorkbookBytes([sanitizedFitProfileRow()])
    const [candidate] = parseFitProfileWorkbook(bytes, 'America/Phoenix')
    expect(candidate).toBeDefined()
    const weight = candidate.metrics.find((metric) => metric.key === 'weight')
    const fat = candidate.metrics.find((metric) => metric.key === 'body_fat_percentage')
    const muscle = candidate.metrics.find((metric) => metric.key === 'muscle_mass')
    expect(weight?.unit).toBe('kg')
    expect(weight?.valueKind).toBe('measured')
    expect(weight?.value).toBeCloseTo(poundsToKilograms(180), 10)
    expect(fat?.unit).toBe('percent')
    expect(fat?.valueKind).toBe('device_estimated')
    expect(fat?.value).toBe(25)
    expect(muscle?.unit).toBe('kg')
    expect(kilogramsToPounds(muscle?.value ?? 0)).toBeCloseTo(110, 10)
    expect(candidate.deviceName).toBe('TEST-SCALE')
    expect(JSON.stringify(candidate.sourcePayload)).toContain('Device MAC Address')
  })

  it('interprets Measure Time as wall-clock time in the supplied timezone', () => {
    const bytes = fitProfileWorkbookBytes([
      sanitizedFitProfileRow({ 'Measure Time': '09/20/2026 09:13:07' }),
    ])
    const [candidate] = parseFitProfileWorkbook(bytes, 'America/Phoenix')
    expect(candidate.measuredAt.toISOString()).toBe('2026-09-20T16:13:07.000Z')
    expect(candidate.timezone).toBe('America/Phoenix')
  })

  it('produces a deterministic fingerprint for the same source row', () => {
    const bytes = fitProfileWorkbookBytes([sanitizedFitProfileRow()])
    const first = parseFitProfileWorkbook(bytes, 'America/Phoenix')
    const second = parseFitProfileWorkbook(bytes, 'America/Phoenix')
    expect(first[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(first[0]?.fingerprint).toBe(second[0]?.fingerprint)
  })

  it('treats known missing-value sentinels as omitted optional metrics', () => {
    expect(parseOptionalNumericCell(null).kind).toBe('missing')
    expect(parseOptionalNumericCell(undefined).kind).toBe('missing')
    expect(parseOptionalNumericCell('').kind).toBe('missing')
    expect(parseOptionalNumericCell('   ').kind).toBe('missing')
    expect(parseOptionalNumericCell('-').kind).toBe('missing')
    expect(parseOptionalNumericCell('--').kind).toBe('missing')
    expect(parseOptionalNumericCell('- -').kind).toBe('missing')
    expect(parseOptionalNumericCell('–').kind).toBe('missing')
    expect(parseOptionalNumericCell('—').kind).toBe('missing')
    expect(parseOptionalNumericCell('N/A').kind).toBe('missing')
    expect(parseOptionalNumericCell('NA').kind).toBe('missing')
  })

  it('keeps legitimate negative numbers numeric', () => {
    expect(parseOptionalNumericCell(-35.2)).toEqual({ kind: 'number', value: -35.2 })
    expect(parseOptionalNumericCell('-35.2')).toEqual({ kind: 'number', value: -35.2 })
    expect(parseOptionalNumericCell('-3')).toEqual({ kind: 'number', value: -3 })
  })

  it('imports a partial Fit Profile row with "- -" composition cells as missing', () => {
    const bytes = fitProfileWorkbookBytes([
      sanitizedFitProfileRow({
        'Weight(lb)': 191,
        'Body Fat(%)': '- -',
        BMI: 27.3,
        'Muscle Mass(lb)': '- -',
        'Fat-free Body Weight(lb)': '-35.2',
      }),
    ])
    const [candidate] = parseFitProfileWorkbook(bytes, 'America/Phoenix')
    expect(candidate).toBeDefined()
    const keys = new Set(candidate.metrics.map((metric) => metric.key))
    const weight = candidate.metrics.find((metric) => metric.key === 'weight')
    const bmi = candidate.metrics.find((metric) => metric.key === 'bmi')
    const fatFree = candidate.metrics.find((metric) => metric.key === 'fat_free_mass')
    expect(kilogramsToPounds(weight?.value ?? 0)).toBeCloseTo(191, 5)
    expect(bmi?.value).toBeCloseTo(27.3, 5)
    expect(keys.has('body_fat_percentage')).toBe(false)
    expect(keys.has('muscle_mass')).toBe(false)
    expect(fatFree?.value).toBeCloseTo(poundsToKilograms(-35.2), 10)

    const statements = buildCandidateCommitStatements({
      sourceId: '33333333-3333-4333-8333-333333333333',
      jobId: '44444444-4444-4444-8444-444444444444',
      candidate,
      sessionId: '11111111-1111-4111-8111-111111111111',
      linkId: '22222222-2222-4222-8222-222222222222',
    })
    const metricKeys = statements.metrics?.params.filter((_, index) => index % 6 === 2)
    expect(metricKeys).toContain('weight')
    expect(metricKeys).toContain('bmi')
    expect(metricKeys).not.toContain('body_fat_percentage')
    expect(metricKeys).not.toContain('muscle_mass')
  })
})

const localPath = localFitProfilePath()

describe.skipIf(!localPath)('local Fit Profile export', () => {
  it('parses the real workbook structure without asserting personal values', async () => {
    const { readFile } = await import('node:fs/promises')
    const bytes = await readFile(localPath!)
    const candidates = parseFitProfileWorkbook(new Uint8Array(bytes), 'America/Phoenix')
    expect(candidates.length).toBeGreaterThan(0)
    const weight = candidates[0]?.metrics.find((metric) => metric.key === 'weight')
    expect(weight?.unit).toBe('kg')
    expect(weight?.valueKind).toBe('measured')
    expect(weight?.sourceHeader).toBe('Weight(lb)')
    expect(kilogramsToPounds(weight?.value ?? 0)).toBeCloseTo(weight?.sourceValue ?? 0, 5)
    expect(candidates[0]?.fingerprint).toMatch(/^[a-f0-9]{64}$/)
    expect(candidates[0]?.deviceName).toBeTruthy()
  })
})
