import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const original = readFileSync('migrations/0043_health_profile_training_plan.sql', 'utf8')
const migration = readFileSync('migrations/0050_training_plan_repeat_blocks.sql', 'utf8')
const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55445
let directory = ''
let started = false
let pool: Pool

describe('Training repeat migration contract', () => {
  it('removes only routine uniqueness, preserving position uniqueness and backfilling the old pointer', () => {
    expect(original).toContain('CONSTRAINT training_plan_sequence_routine_unique UNIQUE')
    expect(migration).toContain('DROP CONSTRAINT IF EXISTS training_plan_sequence_routine_unique')
    expect(migration).toContain('ADD COLUMN sequence_start_position INTEGER NOT NULL DEFAULT 1')
    expect(migration).toContain('AND s.routine_code = p.sequence_start_routine_code')
    expect(migration).toContain('MIN(s.position)')
    expect(migration).not.toContain('DROP TABLE')
    expect(migration).not.toContain('DROP CONSTRAINT IF EXISTS training_plan_sequence_items_pkey')
  })
})

describe.skipIf(!existsSync(`${BIN}/initdb`))('Training repeat migration on disposable PostgreSQL', () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'health-training-repeat-'))
    execFileSync(`${BIN}/initdb`, ['-D', directory, '--username=postgres', '--auth=trust', '--no-sync'], { stdio: 'pipe' })
    execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'start', '-o', `-p ${PORT} -k ${directory} -c listen_addresses=127.0.0.1`, '-l', path.join(directory, 'server.log')], { stdio: 'pipe' })
    started = true
    pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres', max: 4 })
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await pool.query(original)
    await pool.query(`
      INSERT INTO training_plan_versions (
        id, version, effective_from, weekly_frequency_target, sequence_start_routine_code,
        default_non_training_intent, is_current
      ) VALUES (
        '11111111-1111-4111-8111-111111111111', 1, '2026-10-06', 3, 'B', 'rest', true
      )
    `)
    await pool.query(`
      INSERT INTO training_plan_sequence_items (plan_version_id, position, routine_code)
      VALUES
        ('11111111-1111-4111-8111-111111111111', 1, 'A'),
        ('11111111-1111-4111-8111-111111111111', 2, 'B'),
        ('11111111-1111-4111-8111-111111111111', 3, 'C')
    `)
    await pool.query(migration)
  }, 60_000)

  afterAll(async () => {
    if (pool) await pool.end()
    if (started) execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'stop', '-m', 'immediate'], { stdio: 'pipe' })
    if (directory.startsWith(path.join(tmpdir(), 'health-training-repeat-'))) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('preserves the original B-start pointer', async () => {
    const value = (await pool.query('SELECT sequence_start_position FROM training_plan_versions WHERE version=1')).rows[0]
    expect(value.sequence_start_position).toBe(2)
  })

  it('allows six adjacent A routine slots, but still enforces unique positions', async () => {
    await pool.query(`
      INSERT INTO training_plan_sequence_items (plan_version_id, position, routine_code)
      VALUES
        ('11111111-1111-4111-8111-111111111111', 4, 'A'),
        ('11111111-1111-4111-8111-111111111111', 5, 'A'),
        ('11111111-1111-4111-8111-111111111111', 6, 'A'),
        ('11111111-1111-4111-8111-111111111111', 7, 'A'),
        ('11111111-1111-4111-8111-111111111111', 8, 'A'),
        ('11111111-1111-4111-8111-111111111111', 9, 'A')
    `)
    await expect(pool.query(`
      INSERT INTO training_plan_sequence_items (plan_version_id, position, routine_code)
      VALUES ('11111111-1111-4111-8111-111111111111', 9, 'A')
    `)).rejects.toThrow()
    expect((await pool.query(`SELECT count(*)::int AS count FROM training_plan_sequence_items
      WHERE plan_version_id = '11111111-1111-4111-8111-111111111111' AND routine_code='A'`)).rows[0].count).toBe(7)
  })

  it('rejects an invalid repeated-slot start pointer', async () => {
    await expect(pool.query('UPDATE training_plan_versions SET sequence_start_position = 0 WHERE version=1')).rejects.toThrow(/training_plan_start_position_positive/)
  })
})
