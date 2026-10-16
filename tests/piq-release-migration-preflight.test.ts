import { describe, expect, it } from 'vitest'
import type { Sql } from '../server/db.js'
import { assessMigrationHistory, readMigrationHistory, type MigrationHistorySnapshot } from '../server/migration-history.js'

const expected = [
  '0001_start.sql', '0002_add_food.sql', '0003_add_profile.sql', '0004_add_goal.sql',
]
const snapshot = (appliedMigrations: string[], other = 15): MigrationHistorySnapshot => ({
  historyTableExists: true, existingOtherTableCount: other, appliedMigrations,
})
const assess = (input: MigrationHistorySnapshot, files = expected) =>
  assessMigrationHistory(files, input, '0004_add_goal.sql')

describe('PIQ-7 release migration history preflight', () => {
  it('accepts only a recorded exact prefix and reports every pending migration', () => {
    expect(assess(snapshot(expected))).toMatchObject({
      status: 'current', reason: 'CURRENT', appliedCount: 4, pendingMigrations: [],
    })
    expect(assess(snapshot(expected.slice(0, 2)))).toMatchObject({
      status: 'pending', reason: 'PENDING',
      pendingMigrations: expected.slice(2),
    })
  })

  it('blocks a hole, even if the latest migration is marked applied', () => {
    const report = assess(snapshot([expected[0]!, expected[1]!, expected[3]!]))
    expect(report).toMatchObject({
      status: 'blocked', reason: 'OUT_OF_SEQUENCE_HISTORY', pendingMigrations: [],
    })
    expect(assess(snapshot([expected[1]!]))).toMatchObject({
      status: 'blocked', reason: 'OUT_OF_SEQUENCE_HISTORY',
    })
  })

  it('blocks unknown or future migration histories without suggesting writes', () => {
    const report = assess(snapshot([...expected, '0099_unreviewed.sql']))
    expect(report).toMatchObject({
      status: 'blocked', reason: 'UNEXPECTED_HISTORY',
      unexpectedMigrations: ['0099_unreviewed.sql'],
      pendingMigrations: [],
    })
  })

  it('does not auto-create history in a populated schema with lost or empty tracking', () => {
    expect(assess({ historyTableExists: false, existingOtherTableCount: 2, appliedMigrations: [] }))
      .toMatchObject({ status: 'blocked', reason: 'UNTRACKED_SCHEMA' })
    expect(assess(snapshot([], 2)))
      .toMatchObject({ status: 'blocked', reason: 'UNTRACKED_SCHEMA' })
    expect(assess({ historyTableExists: false, existingOtherTableCount: 0, appliedMigrations: [] }))
      .toMatchObject({ status: 'pending', reason: 'FRESH_SCHEMA', pendingMigrations: expected })
    expect(assess(snapshot([], 0)))
      .toMatchObject({ status: 'pending', reason: 'PENDING', pendingMigrations: expected })
  })

  it('fails closed when repository migration files drift from backup schema head or numeric sequence', () => {
    expect(assess(snapshot([]), ['0001_start.sql', '0003_gap.sql', '0004_add_goal.sql']))
      .toMatchObject({ status: 'blocked', reason: 'REPOSITORY_MISMATCH' })
    expect(assess(snapshot([]), ['0001_start.sql', '0002_add_food.sql']))
      .toMatchObject({ status: 'blocked', reason: 'REPOSITORY_MISMATCH' })
    expect(assess(snapshot([]), [expected[0]!, expected[0]!, expected[2]!, expected[3]!]))
      .toMatchObject({ status: 'blocked', reason: 'REPOSITORY_MISMATCH' })
  })

  it('uses only SELECT catalog/history reads, and never accesses owner rows', async () => {
    const queries: string[] = []
    const sql = { query: async (statement: string) => {
      queries.push(statement)
      return statement.includes('to_regclass')
        ? [{ history_exists: true, other_table_count: 7 }]
        : [{ filename: expected[0] }, { filename: expected[1] }]
    } } as unknown as Sql
    const read = await readMigrationHistory(sql)
    expect(read).toEqual(snapshot(expected.slice(0, 2), 7))
    expect(queries).toHaveLength(2)
    expect(queries.every((statement) => /^\s*SELECT\b/i.test(statement))).toBe(true)
    expect(queries.join(' ')).not.toMatch(/nutrition_entries|clinical_medications|health_profile|database_url/i)
  })

  it('never selects from schema_migrations when the table is absent', async () => {
    const queries: string[] = []
    const sql = { query: async (statement: string) => {
      queries.push(statement)
      return [{ history_exists: false, other_table_count: 1 }]
    } } as unknown as Sql
    expect(await readMigrationHistory(sql)).toEqual({
      historyTableExists: false, existingOtherTableCount: 1, appliedMigrations: [],
    })
    expect(queries).toHaveLength(1)
    expect(assess(await readMigrationHistory(sql))).toMatchObject({
      status: 'blocked', reason: 'UNTRACKED_SCHEMA',
    })
  })
})
