import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { splitSqlStatements } from '../server/sql.ts'

describe('splitSqlStatements', () => {
  it('does not treat semicolons inside single-quoted strings as statement breaks', () => {
    const statements = splitSqlStatements(
      `INSERT INTO notes (body) VALUES ('keep; this together');\nSELECT 1;`,
    )
    expect(statements).toEqual([
      `INSERT INTO notes (body) VALUES ('keep; this together')`,
      'SELECT 1',
    ])
  })

  it('ignores semicolons that appear in -- line comments', () => {
    const statements = splitSqlStatements(`-- ignore; this\nCREATE TABLE t (id UUID);`)
    expect(statements).toEqual(['CREATE TABLE t (id UUID)'])
  })

  it('splits the current Health migrations without dollar-quoted bodies', () => {
    const foundation = splitSqlStatements(
      readFileSync(path.join('migrations', '0001_health_foundation.sql'), 'utf8'),
    )
    const body = splitSqlStatements(
      readFileSync(path.join('migrations', '0002_body_measurements.sql'), 'utf8'),
    )
    expect(foundation).toHaveLength(7)
    expect(body).toHaveLength(5)
    expect(foundation.every((statement) => !statement.includes('$tag$'))).toBe(true)
    expect(body[0]).toMatch(/^CREATE TABLE body_measurement_sessions/)
    expect(body[3]).toMatch(/^CREATE TABLE body_metrics/)
  })
})
