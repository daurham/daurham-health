import { readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FIT_PROFILE_REQUIRED_HEADERS } from '../src/domain/body-metrics.ts'
import { kilogramsToPounds, poundsToKilograms } from '../src/domain/units.ts'
import { FitProfileParseError, parseFitProfileWorkbook } from '../server/integrations/fit-profile/parse.ts'
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
