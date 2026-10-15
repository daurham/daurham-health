import { describe, expect, it, vi } from 'vitest'
import type { Sql } from '../server/db.js'
import { HttpError } from '../server/http.js'
import {
  SOURCE_REVISION_SQL, WRITE_NUTRITION_DAY_CONFIRMATION_SQL,
  getNutritionDayCompleteness, saveNutritionDayCompleteness,
} from '../server/nutrition/day-completeness.js'
import { matchHealthApiRoute } from '../server/dispatch.js'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

function fakeDb(input: {
  revision?: string
  version?: number
  report?: 'complete' | 'partial' | 'unknown' | null
  savedRevision?: string
  entries?: Array<{ calories: number; evidence_quality: string; excluded?: boolean }>
  dayExcluded?: boolean
} = {}) {
  let revision = input.revision ?? A
  let version = input.version ?? 0
  let report = input.report ?? null
  let savedRevision = input.savedRevision ?? revision
  let savedFast = false
  const entries = input.entries ?? [{ calories: 1800, evidence_quality: 'measured_reference' }]
  const calls: Array<{ sql: string; args: unknown[] }> = []
  const query = vi.fn(async (sql: string, args: unknown[] = []) => {
    calls.push({ sql, args })
    if (sql === SOURCE_REVISION_SQL) return [{ revision }]
    if (sql.includes('SELECT owner_report, zero_intake_fast, entry_revision, version')) {
      return report ? [{ owner_report: report, zero_intake_fast: savedFast, entry_revision: savedRevision, version }] : []
    }
    if (sql.includes('SELECT e.calories, e.evidence_quality')) return entries
    if (sql.includes('SELECT EXISTS (SELECT 1 FROM data_quality_reviews')) {
      return [{ excluded: input.dayExcluded ?? false }]
    }
    if (sql === WRITE_NUTRITION_DAY_CONFIRMATION_SQL) {
      if (args[1] !== revision || args[4] !== version) return []
      if (args[3] === true && entries.length !== 0) return []
      if (args[4] === 0 && version !== 0) return []
      report = args[2] as 'complete' | 'partial' | 'unknown'
      savedRevision = revision
      savedFast = args[3] === true
      version += 1
      return [{ date: args[0] }]
    }
    throw new Error('Unexpected SQL')
  })
  return {
    sql: { query } as unknown as Sql,
    calls,
    setRevision(next: string) { revision = next },
    getVersion() { return version },
  }
}

function body(data: Record<string, unknown> = {}) {
  return {
    date: '2026-10-13',
    ownerReport: 'complete',
    expectedRevision: A,
    expectedVersion: 0,
    ...data,
  }
}

describe('PIQ-1.1 authenticated persistence repository and optimistic conflict contract', () => {
  it('GET returns unknown for every migrated historical date without a report', async () => {
    const db = fakeDb()
    const result = await getNutritionDayCompleteness('2026-10-13', db.sql, '2026-10-14')
    expect(result).toMatchObject({
      date: '2026-10-13', entryRevision: A, version: 0,
      ownerReport: null, assessment: { state: 'unknown', eligibleForMaintenance: false },
    })
    expect(db.calls.some((c) => c.sql === SOURCE_REVISION_SQL)).toBe(true)
  })

  it('PUT records an explicit owner complete day and a monotonically increasing version', async () => {
    const db = fakeDb()
    const first = await saveNutritionDayCompleteness(body(), db.sql, '2026-10-14')
    expect(first).toMatchObject({
      version: 1, ownerReport: 'complete',
      assessment: { state: 'confirmed_complete', eligibleForMaintenance: true },
    })
    const second = await saveNutritionDayCompleteness(body({
      ownerReport: 'partial', expectedVersion: 1,
    }), db.sql, '2026-10-14')
    expect(second.version).toBe(2)
    expect(second.assessment.state).toBe('partial')
    expect(second.assessment.eligibleForMaintenance).toBe(false)
  })

  it('rejects concurrent stale edits to an existing confirmation with 409', async () => {
    const db = fakeDb({ version: 2, report: 'complete' })
    await expect(saveNutritionDayCompleteness(body({ expectedVersion: 1 }), db.sql, '2026-10-14'))
      .rejects.toMatchObject({ statusCode: 409, code: 'NUTRITION_COMPLETENESS_STALE' })
    expect(db.getVersion()).toBe(2)
  })

  it('a food edit changes canonical digest and prevents previously issued revision writes', async () => {
    const db = fakeDb()
    db.setRevision(B)
    await expect(saveNutritionDayCompleteness(body(), db.sql, '2026-10-14'))
      .rejects.toMatchObject({ statusCode: 409, code: 'NUTRITION_COMPLETENESS_STALE' })
    expect(db.getVersion()).toBe(0)
  })

  it('a corrected source revision invalidates an already stored complete report', async () => {
    const db = fakeDb({ version: 1, report: 'complete', savedRevision: A })
    db.setRevision(B)
    const result = await getNutritionDayCompleteness('2026-10-13', db.sql, '2026-10-14')
    expect(result).toMatchObject({
      ownerReport: 'complete', entryRevision: B,
      assessment: { state: 'unknown', confirmationStale: true, eligibleForMaintenance: false },
    })
  })

  it('requires explicit fast for a zero-entry completion and never treats it as calorie baseline', async () => {
    const db = fakeDb({ entries: [] })
    await expect(saveNutritionDayCompleteness(body(), db.sql, '2026-10-14'))
      .rejects.toBeInstanceOf(HttpError)
    const result = await saveNutritionDayCompleteness(body({ zeroIntakeFast: true }), db.sql, '2026-10-14')
    expect(result.assessment).toMatchObject({
      state: 'confirmed_complete', eligibleForMaintenance: false,
      isExplicitZeroIntakeFast: true,
    })
  })

  it('future days, malformed revisions, and fasting a partial day are rejected', async () => {
    const db = fakeDb()
    await expect(saveNutritionDayCompleteness(body({ date: '2026-10-15' }), db.sql, '2026-10-14'))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(saveNutritionDayCompleteness(body({ expectedRevision: 'unsafe' }), db.sql, '2026-10-14'))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(saveNutritionDayCompleteness(body({ ownerReport: 'partial', zeroIntakeFast: true }), db.sql, '2026-10-14'))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('does not expose SQL internals when confirmation table is missing', async () => {
    const sql = { query: vi.fn(async (): Promise<never> => {
      throw new Error('relation nutrition_day_completeness does not exist; sensitive query')
    }) } as unknown as Sql
    let failure: unknown
    try { await getNutritionDayCompleteness('2026-10-13', sql, '2026-10-14') }
    catch (error) { failure = error }
    expect(failure).toMatchObject({
      statusCode: 503, code: 'NUTRITION_COMPLETENESS_UNAVAILABLE',
    })
    expect((failure as Error).message).not.toContain('sensitive query')
  })

  it('SQL uses one revision snapshot and locks confirmation writes to both revision and version', () => {
    expect(SOURCE_REVISION_SQL).toContain('sha256(')
    expect(SOURCE_REVISION_SQL).toContain('nutrition_entries')
    expect(SOURCE_REVISION_SQL).toContain('data_quality_reviews')
    expect(SOURCE_REVISION_SQL).toContain('nutrition_entry_pair')
    expect(WRITE_NUTRITION_DAY_CONFIRMATION_SQL).toContain('source.revision = $2::text')
    expect(WRITE_NUTRITION_DAY_CONFIRMATION_SQL).toContain('nutrition_day_completeness.version = $5::integer')
    expect(WRITE_NUTRITION_DAY_CONFIRMATION_SQL).toContain('ON CONFLICT')
    expect(WRITE_NUTRITION_DAY_CONFIRMATION_SQL).toContain('NOT EXISTS')
  })

  it('API dispatcher recognizes the dedicated completeness route', () => {
    expect(matchHealthApiRoute('/api/nutrition/day/completeness')).toBe('nutrition-day-completeness')
    expect(matchHealthApiRoute('/api/nutrition/day')).toBe('nutrition-day')
  })
})
