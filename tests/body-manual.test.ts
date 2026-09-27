import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { displayValueForMetric } from '../src/domain/body-metrics.ts'
import {
  ARM_CADENCE_KEYS,
  assertManualSessionEditable,
  BodyInputError,
  FULL_CIRCUMFERENCE_KEYS,
  MANUAL_BODY_METRICS,
  manualSessionIsEditable,
  parseManualCreate,
  parseManualPatch,
} from '../src/domain/body-manual.ts'
import { centimetersToInches, inchesToCentimeters, poundsToKilograms } from '../src/domain/units.ts'

const NOW = new Date('2026-09-26T18:00:00.000Z')

describe('manual body catalog and units', () => {
  it('lists the controlled V2-A2 metrics and keeps left and right distinct', () => {
    expect(MANUAL_BODY_METRICS.map((item) => item.key)).toEqual([
      'weight',
      'body_fat_percentage',
      'waist_circumference',
      'hip_circumference',
      'chest_circumference',
      'neck_circumference',
      'left_upper_arm_circumference',
      'right_upper_arm_circumference',
      'left_forearm_circumference',
      'right_forearm_circumference',
      'left_thigh_circumference',
      'right_thigh_circumference',
      'left_calf_circumference',
      'right_calf_circumference',
    ])
    expect(new Set(MANUAL_BODY_METRICS.map((item) => item.key)).size).toBe(MANUAL_BODY_METRICS.length)
    expect(ARM_CADENCE_KEYS).not.toContain('waist_circumference')
    expect(FULL_CIRCUMFERENCE_KEYS).toContain('left_thigh_circumference')
    expect(FULL_CIRCUMFERENCE_KEYS).toContain('right_thigh_circumference')
    const migration = readFileSync('migrations/0018_body_measurement_cadence.sql', 'utf8')
    for (const metric of MANUAL_BODY_METRICS) {
      expect(metric.cadenceEligible).toBe(true)
      expect(migration).toContain(`'${metric.key}'`)
    }
    expect(migration).not.toContain('metabolic_age')
  })

  it('normalizes weight, circumference, and percent without turning blanks into zero', () => {
    const mixed = parseManualCreate(
      {
        metrics: [
          { key: 'weight', value: '188.4', unit: 'lb' },
          { key: 'body_fat_percentage', value: '18.5', unit: '%' },
          { key: 'waist_circumference', value: '37.2', unit: 'in' },
          { key: 'hip_circumference', value: '', unit: 'in' },
          { key: 'chest_circumference', value: '90', unit: 'cm' },
        ],
      },
      NOW,
    )
    expect(mixed.metrics.find((item) => item.key === 'weight')).toMatchObject({
      value: poundsToKilograms(188.4),
      unit: 'kg',
      valueKind: 'manual',
    })
    expect(mixed.metrics.find((item) => item.key === 'body_fat_percentage')?.value).toBe(18.5)
    expect(mixed.metrics.find((item) => item.key === 'waist_circumference')?.value).toBe(inchesToCentimeters(37.2))
    expect(mixed.metrics.find((item) => item.key === 'chest_circumference')?.value).toBe(90)
    expect(mixed.metrics.some((item) => item.key === 'hip_circumference')).toBe(false)
    expect(mixed.metrics.some((item) => item.value === 0)).toBe(false)
    const kilograms = parseManualCreate({ metrics: [{ key: 'weight', value: 80, unit: 'kg' }] }, NOW)
    expect(kilograms.metrics[0]?.value).toBe(80)
    expect(displayValueForMetric('cm', inchesToCentimeters(10)).value).toBe(centimetersToInches(inchesToCentimeters(10)))
    expect(displayValueForMetric('cm', 2.54)).toMatchObject({ value: 1, unit: 'in' })
    expect(displayValueForMetric('percent', 18.5)).toMatchObject({ value: 18.5, unit: '%' })
  })

  it('rejects invalid manual values and keeps a partial set', () => {
    expect(() => parseManualCreate({ metrics: [{ key: 'weight', value: ' ' }] }, NOW)).toThrow(BodyInputError)
    expect(() => parseManualCreate({ metrics: [{ key: 'weight', value: Number.NaN }] }, NOW)).toThrow(/Weight must be a number/)
    expect(() => parseManualCreate({ metrics: [{ key: 'weight', value: 0, unit: 'lb' }] }, NOW)).toThrow(/greater than 0/)
    expect(() => parseManualCreate({ metrics: [{ key: 'waist_circumference', value: -1, unit: 'in' }] }, NOW)).toThrow(
      /greater than 0/,
    )
    expect(() => parseManualCreate({ metrics: [{ key: 'body_fat_percentage', value: -0.1 }] }, NOW)).toThrow(/between 0 and 100/)
    expect(() => parseManualCreate({ metrics: [{ key: 'body_fat_percentage', value: 100.1 }] }, NOW)).toThrow(/between 0 and 100/)
    expect(parseManualCreate({ metrics: [{ key: 'body_fat_percentage', value: 0 }] }, NOW).metrics[0]?.value).toBe(0)
    expect(parseManualCreate({ metrics: [{ key: 'body_fat_percentage', value: 100 }] }, NOW).metrics[0]?.value).toBe(100)
    const partial = parseManualCreate(
      {
        metrics: [
          { key: 'left_upper_arm_circumference', value: '14.1', unit: 'in' },
          { key: 'right_upper_arm_circumference', value: '', unit: 'in' },
        ],
      },
      NOW,
    )
    expect(partial.metrics.map((item) => item.key)).toEqual(['left_upper_arm_circumference'])
  })
})

describe('manual measurement sessions', () => {
  it('records the current instant, Phoenix timezone contract, and manual provenance fields', () => {
    const plan = parseManualCreate({ metrics: [{ key: 'weight', value: '180', unit: 'lb' }] }, NOW)
    expect(plan.measuredAt).toBe(NOW)
    expect(plan.metrics[0]).toMatchObject({ valueKind: 'manual', unit: 'kg' })
    expect(plan.notes).toBeNull()
    expect(() => parseManualCreate({ measuredAt: '2026-09-20', metrics: [{ key: 'weight', value: 1, unit: 'kg' }] }, NOW)).toThrow(
      /real time/,
    )
    expect(() =>
      parseManualCreate(
        { measuredAt: '2026-09-27T20:00:00.000Z', metrics: [{ key: 'weight', value: 1, unit: 'kg' }] },
        NOW,
      ),
    ).toThrow(/Future/)
    const historical = parseManualCreate(
      { measuredAt: '2026-09-20T15:30:00.000Z', metrics: [{ key: 'weight', value: 1, unit: 'kg' }] },
      NOW,
    )
    expect(historical.measuredAt.toISOString()).toBe('2026-09-20T15:30:00.000Z')
  })

  it('replaces the manual metric set and refuses imported sessions', () => {
    const edited = parseManualPatch(
      {
        notes: 'morning',
        metrics: [
          { key: 'weight', value: '181', unit: 'lb' },
          { key: 'waist_circumference', value: '', unit: 'in' },
        ],
      },
      NOW,
    )
    expect(edited.metrics.map((item) => item.key)).toEqual(['weight'])
    expect(edited.notes).toBe('morning')
    expect(edited.measuredAt).toBeUndefined()
    expect(manualSessionIsEditable({ importJobId: null, sourceKey: 'manual' })).toBe(true)
    expect(() => assertManualSessionEditable({ importJobId: '11111111-1111-4111-8111-111111111111', sourceKey: 'manual' })).toThrow(
      /read-only/,
    )
    expect(() => assertManualSessionEditable({ importJobId: null, sourceKey: 'fit_profile_xlsx' })).toThrow(/read-only/)
    const service = readFileSync('server/body/manual-service.ts', 'utf8')
    expect(service).toContain('import_job_id IS NULL')
    expect(service).toContain("sources.key = 'manual'")
    expect(service).toContain("'manual'")
    expect(service).toContain('DELETE FROM body_metrics')
    expect(service).toContain('NULL')
    expect(service).not.toContain('INSERT INTO import_jobs')
  })
})
