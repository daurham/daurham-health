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
    const training = splitSqlStatements(
      readFileSync(path.join('migrations', '0003_training.sql'), 'utf8'),
    )
    expect(foundation).toHaveLength(7)
    expect(body).toHaveLength(5)
    expect(training).toHaveLength(10)
    const jobs = splitSqlStatements(
      readFileSync(path.join('migrations', '0004_transcription_jobs.sql'), 'utf8'),
    )
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatch(/^CREATE TABLE workout_transcription_jobs/)
    expect(jobs[1]).toMatch(/^CREATE INDEX workout_transcription_jobs_pending_idx/)
    const checkpoints = splitSqlStatements(
      readFileSync(path.join('migrations', '0007_progress_checkpoints.sql'), 'utf8'),
    )
    expect(checkpoints).toHaveLength(2)
    const nutrition = splitSqlStatements(
      readFileSync(path.join('migrations', '0008_nutrition.sql'), 'utf8'),
    )
    expect(nutrition).toHaveLength(8)
    expect(nutrition[0]).toMatch(/^CREATE TABLE nutrition_foods/)
    expect(nutrition[4]).toMatch(/^CREATE TABLE nutrition_entries/)
    expect(nutrition[7]).toMatch(/^CREATE TABLE nutrition_targets/)
    const barcodeIndex = splitSqlStatements(
      readFileSync(path.join('migrations', '0009_nutrition_barcode_normalized.sql'), 'utf8'),
    )
    expect(barcodeIndex).toHaveLength(2)
    expect(barcodeIndex[0]).toMatch(/^UPDATE nutrition_foods/)
    expect(barcodeIndex[1]).toMatch(/^CREATE UNIQUE INDEX nutrition_foods_barcode_normalized_uidx/)
    const analytics = splitSqlStatements(
      readFileSync(path.join('migrations', '0005_exercise_analytics.sql'), 'utf8'),
    )
    expect(analytics).toHaveLength(2)
    expect(analytics[0]).toMatch(/^ALTER TABLE exercise_definitions/)
    expect(analytics[0]).toContain('performance_type')
    expect(analytics[0]).toContain('analytics_load_type')
    expect(analytics[1]).toMatch(/^UPDATE exercise_definitions/)
    const repMode = splitSqlStatements(
      readFileSync(path.join('migrations', '0006_analytics_rep_mode.sql'), 'utf8'),
    )
    expect(repMode).toHaveLength(2)
    expect(repMode[0]).toMatch(/^ALTER TABLE exercise_definitions/)
    expect(repMode[0]).toContain('analytics_rep_mode')
    expect(repMode[1]).toMatch(/^UPDATE exercise_definitions/)
    expect(repMode[1]).toContain('EX11')
    expect(training.every((statement) => !statement.includes('$tag$'))).toBe(true)
    expect(training[0]).toMatch(/^CREATE TABLE exercise_definitions/)
    expect(training[7]).toMatch(/^INSERT INTO exercise_definitions/)
    expect(training[9]).toContain('A01')
    expect(training[9]).toContain('B07')
    expect(training[9]).toContain('C07')
  })
})
