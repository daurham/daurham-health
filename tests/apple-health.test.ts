import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import {
  CLAIM_AND_INSERT_ACTIVITY_SAMPLE_SQL,
  CLAIM_AND_INSERT_ACTIVITY_WORKOUT_SQL,
  CLAIM_AND_INSERT_SLEEP_INTERVAL_SQL,
  EXISTING_APPLE_HEALTH_FINGERPRINTS_SQL,
} from '../server/apple-health/queries.ts'
import { buildAppleHealthClaimStatement } from '../server/apple-health/commit-sql.ts'
import { HEALTH_CALENDAR_TIME_ZONE, healthCalendarDateFromInstant } from '../src/domain/time.ts'
import { calendarDateFromInstant } from '../src/domain/progress/dates.ts'
import { NUTRITION_CONFIG } from '../src/domain/nutrition/config.ts'
import {
  CANONICAL_UNITS,
  claimAppleHealthRecords,
  convertQuantityUnit,
  createAppleHealthXmlScanner,
  mapSleepStage,
  parseAppleHealthFile,
  parseAppleHealthTimestamp,
  parseAppleHealthXml,
  previewAppleHealth,
  zipAppleHealthXml,
} from '../src/domain/apple-health/index.ts'

const FIXTURE = readFileSync(path.join('tests', 'fixtures', 'apple-health', 'export.xml'), 'utf8')

describe('canonical Health timezone', () => {
  it('is America/Phoenix for Nutrition config and calendar-day helpers', () => {
    expect(HEALTH_CALENDAR_TIME_ZONE).toBe('America/Phoenix')
    expect(NUTRITION_CONFIG.calendarTimeZone).toBe('America/Phoenix')
    expect(readFileSync('.env.example', 'utf8')).toContain('HEALTH_CALENDAR_TIMEZONE=America/Phoenix')
  })

  it('does not let Los Angeles DST substitute for Phoenix calendar dates', () => {
    const afterFallback = new Date('2026-11-02T07:30:00.000Z')
    expect(healthCalendarDateFromInstant(afterFallback)).toBe('2026-11-02')
    expect(calendarDateFromInstant(afterFallback, 'America/Los_Angeles')).toBe('2026-11-01')
    expect(afterFallback.toISOString()).toBe('2026-11-02T07:30:00.000Z')
  })
})

describe('Apple Health parser', () => {
  it('parses quantity, sleep, workout, skipped, unknown, and malformed records', () => {
    const parsed = parseAppleHealthXml(FIXTURE)
    expect(parsed.exportDate).toBe('2026-09-21T12:00:00-07:00')
    expect(parsed.records.filter((item) => item.kind === 'quantity')).toHaveLength(7)
    expect(parsed.records.filter((item) => item.kind === 'sleep')).toHaveLength(7)
    expect(parsed.records.filter((item) => item.kind === 'workout')).toHaveLength(1)
    expect(parsed.skipped.filter((item) => item.reason === 'unsupported')).toHaveLength(1)
    expect(parsed.skipped.filter((item) => item.reason === 'body_owned')).toHaveLength(1)
    expect(parsed.skipped.filter((item) => item.reason === 'nutrition_owned')).toHaveLength(2)
    expect(parsed.skipped.filter((item) => item.reason === 'malformed')).toHaveLength(1)
    expect(parsed.unknownSleepCategories).toEqual(['HKCategoryValueSleepAnalysisHibernating'])
    const workout = parsed.records.find((item) => item.kind === 'workout')
    expect(workout?.kind === 'workout' && workout.activityType).toBe(
      'HKWorkoutActivityTypeTraditionalStrengthTraining',
    )
  })

  it('keeps overlapping iPhone and Watch step samples as distinct records', () => {
    const parsed = parseAppleHealthXml(FIXTURE)
    const steps = parsed.records.filter((item) => item.kind === 'quantity' && item.metric === 'steps')
    expect(steps).toHaveLength(3)
    expect(new Set(steps.map((item) => item.fingerprint)).size).toBe(2)
    expect(steps.map((item) => item.sourceName).sort()).toEqual(['Apple Watch', 'iPhone', 'iPhone'])
  })

  it('retains offset-aware timestamps instead of calendar dates', () => {
    expect(parseAppleHealthTimestamp('2026-09-20 08:00:00 -0700')).toBe('2026-09-20T08:00:00-07:00')
    const parsed = parseAppleHealthXml(FIXTURE)
    const sample = parsed.records.find((item) => item.kind === 'quantity' && item.metric === 'steps')
    expect(sample?.startAt).toBe('2026-09-20T08:00:00-07:00')
    expect(sample?.startAt).not.toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('parses incrementally without depending on WorkoutEvent tags', () => {
    const scanner = createAppleHealthXmlScanner()
    for (const chunk of FIXTURE.match(/[\s\S]{1,80}/g) ?? []) {
      scanner.push(chunk)
    }
    const parsed = scanner.finish()
    expect(parsed.records.filter((item) => item.kind === 'workout')).toHaveLength(1)
    expect(parsed.records.some((item) => item.kind === 'quantity' && item.metric === 'steps')).toBe(true)
  })

  it('reads export.xml from a nested Apple Health ZIP', () => {
    const parsed = parseAppleHealthFile(zipAppleHealthXml(FIXTURE), 'export.zip')
    expect(parsed.records.length).toBeGreaterThan(0)
  })
})

describe('Apple Health units', () => {
  it('normalizes to canonical units without mutating source evidence', () => {
    expect(convertQuantityUnit('steps', 10, 'count')).toEqual({
      value: 10,
      canonicalUnit: 'count',
      sourceUnit: 'count',
    })
    expect(convertQuantityUnit('active_energy', 418.4, 'kJ').canonicalUnit).toBe('kcal')
    expect(convertQuantityUnit('active_energy', 418.4, 'kJ').value).toBeCloseTo(100)
    expect(convertQuantityUnit('exercise_time', 90, 's')).toEqual({
      value: 1.5,
      canonicalUnit: 'min',
      sourceUnit: 's',
    })
    expect(convertQuantityUnit('walking_running_distance', 1.2, 'km')).toEqual({
      value: 1200,
      canonicalUnit: 'm',
      sourceUnit: 'km',
    })
    expect(convertQuantityUnit('resting_heart_rate', 54, 'count/min').canonicalUnit).toBe('bpm')
    expect(CANONICAL_UNITS.walking_running_distance).toBe('m')
    const parsed = parseAppleHealthXml(FIXTURE)
    const distance = parsed.records.find(
      (item) => item.kind === 'quantity' && item.metric === 'walking_running_distance',
    )
    expect(distance?.kind === 'quantity' && distance.value).toBe(1200)
    expect(distance?.kind === 'quantity' && distance.sourceUnit).toBe('km')
    expect(distance?.kind === 'quantity' && distance.sourceValue).toBe('1.2')
  })

  it('maps known sleep values and preserves unknown categories', () => {
    expect(mapSleepStage('HKCategoryValueSleepAnalysisAsleepCore')).toEqual({ stage: 'core', known: true })
    expect(mapSleepStage('HKCategoryValueSleepAnalysisHibernating')).toEqual({
      stage: 'unsupported',
      known: false,
    })
  })
})

describe('Apple Health import planning', () => {
  it('preview does not need canonical tables and reports skips', () => {
    const preview = previewAppleHealth(parseAppleHealthXml(FIXTURE))
    expect(preview.counts.bodyOwned).toBe(1)
    expect(preview.counts.nutritionOwned).toBe(2)
    expect(preview.counts.unsupported).toBe(1)
    expect(preview.counts.malformed).toBe(1)
    expect(preview.counts.duplicateFingerprints).toBe(1)
    expect(preview.counts.estimatedCommitRows).toBe(preview.records.length)
    expect(preview.overlappingActivityGroups).toBe(1)
    expect(EXISTING_APPLE_HEALTH_FINGERPRINTS_SQL.trim().startsWith('SELECT')).toBe(true)
    expect(EXISTING_APPLE_HEALTH_FINGERPRINTS_SQL).not.toMatch(/INSERT|UPDATE|DELETE/i)
  })

  it('commit planning is idempotent and preserves source overlap', () => {
    const preview = previewAppleHealth(parseAppleHealthXml(FIXTURE))
    const claimed = new Set<string>()
    const first = claimAppleHealthRecords(preview.records, claimed)
    const second = claimAppleHealthRecords(preview.records, claimed)
    expect(first.inserted).toHaveLength(preview.records.length)
    expect(second.inserted).toHaveLength(0)
    expect(second.matched).toBe(preview.records.length)
    const steps = first.inserted.filter((item) => item.kind === 'quantity' && item.metric === 'steps')
    expect(steps).toHaveLength(2)
    expect(new Set(steps.map((item) => item.sourceName))).toEqual(new Set(['iPhone', 'Apple Watch']))
  })

  it('recovers a partial failure by rerunning remaining records', () => {
    const preview = previewAppleHealth(parseAppleHealthXml(FIXTURE))
    const claimed = new Set<string>()
    const firstBatch = preview.records.slice(0, 4)
    const failedBatch = preview.records.slice(4)
    claimAppleHealthRecords(firstBatch, claimed)
    const recovered = claimAppleHealthRecords([...firstBatch, ...failedBatch], claimed)
    expect(recovered.inserted).toHaveLength(failedBatch.length)
    expect(recovered.matched).toBe(firstBatch.length)
  })

  it('does not write Apple workouts into Training sessions', () => {
    const parsed = parseAppleHealthXml(FIXTURE)
    const workout = parsed.records.find((item) => item.kind === 'workout')
    expect(workout).toBeTruthy()
    const statement = buildAppleHealthClaimStatement({
      sourceId: '11111111-1111-4111-8111-111111111111',
      jobId: '22222222-2222-4222-8222-222222222222',
      record: workout!,
    })
    expect(statement.sql).toContain('INSERT INTO activity_workouts')
    expect(statement.sql).not.toContain('workout_sessions')
    expect(statement.sql).toMatch(/ON CONFLICT \(source_id, external_fingerprint\) DO NOTHING/)
    expect(CLAIM_AND_INSERT_ACTIVITY_SAMPLE_SQL).not.toContain('workout_sessions')
    expect(CLAIM_AND_INSERT_SLEEP_INTERVAL_SQL).not.toContain('workout_sessions')
    expect(CLAIM_AND_INSERT_ACTIVITY_WORKOUT_SQL).not.toContain('workout_sessions')
    expect(CLAIM_AND_INSERT_ACTIVITY_WORKOUT_SQL).not.toContain('body_metrics')
    expect(CLAIM_AND_INSERT_ACTIVITY_WORKOUT_SQL).not.toContain('nutrition_entries')
  })
})

describe('Apple Health security and routing', () => {
  it('exposes owner-only import routes on the existing /api function', () => {
    expect(matchHealthApiRoute('/api/apple-health/import/status')).toBe('apple-health-import')
    expect(matchHealthApiRoute('/api/apple-health/import/preview')).toBe('apple-health-import')
    expect(matchHealthApiRoute('/api/apple-health/import/commit')).toBe('apple-health-import')
    const layout = readFileSync('src/components/Layout.tsx', 'utf8')
    expect(layout).toContain('to="/settings"')
    expect(layout).not.toMatch(/id: 'settings'/)
    expect(layout).toContain('grid-cols-5')
    expect(readFileSync('src/routes/index.tsx', 'utf8')).toContain("path: 'settings'")
    expect(readFileSync('src/features/settings/SettingsPage.tsx', 'utf8')).not.toContain('Progress Overview')
    expect(readFileSync('server/apple-health/service.ts', 'utf8')).not.toContain('export.xml')
    expect(readFileSync('server/handlers/apple-health-import.ts', 'utf8')).toContain('withOwnerAuth')
  })
})
