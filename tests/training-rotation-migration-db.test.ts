import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { backupTable, tablesForProfile } from '../server/backup/inventory.ts'

const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55446
const planSql = readFileSync('migrations/0043_health_profile_training_plan.sql', 'utf8')
const repeatsSql = readFileSync('migrations/0050_training_plan_repeat_blocks.sql', 'utf8')
const rotationSql = readFileSync('migrations/0051_training_rotation_anchors.sql', 'utf8')
const planId = '11111111-1111-4111-8111-111111111111'
let directory = ''
let started = false
let pool: Pool

describe('rotation decisions backup/restore inventory', () => {
  it('includes anchor and early-ending records in full and portable backups', () => {
    const anchors = backupTable('training_plan_rotation_anchors')
    const ends = backupTable('training_plan_block_ends')
    expect(anchors).toMatchObject({
      backupClass: 'canonical',
      portable: true,
      primaryKey: ['plan_version_id'],
      references: [{ column: 'plan_version_id', table: 'training_plan_versions' }],
    })
    expect(ends).toMatchObject({
      backupClass: 'canonical',
      portable: true,
      primaryKey: ['id'],
      references: [{ column: 'plan_version_id', table: 'training_plan_versions' }],
    })
    for (const mode of ['full', 'portable'] as const) {
      const entries = tablesForProfile(mode).map((entry) => entry.name)
      expect(entries.indexOf('training_plan_versions')).toBeLessThan(entries.indexOf('training_plan_rotation_anchors'))
      expect(entries.indexOf('training_plan_versions')).toBeLessThan(entries.indexOf('training_plan_block_ends'))
    }
  })
})

describe.skipIf(!existsSync(`${BIN}/initdb`))('migration 0051 on disposable PostgreSQL', () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'health-training-rotation-'))
    execFileSync(`${BIN}/initdb`, ['-D', directory, '--username=postgres', '--auth=trust', '--no-sync'], { stdio: 'pipe' })
    execFileSync(`${BIN}/pg_ctl`, [
      '-D', directory, '-w', 'start', '-o',
      `-p ${PORT} -k ${directory} -c listen_addresses=127.0.0.1`,
      '-l', path.join(directory, 'server.log'),
    ], { stdio: 'pipe' })
    started = true
    pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres', max: 4 })
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await pool.query(planSql)
    await pool.query(repeatsSql)
    await pool.query(rotationSql)
    await pool.query(`INSERT INTO training_plan_versions (
      id, version, effective_from, weekly_frequency_target, sequence_start_routine_code,
      default_non_training_intent, is_current
    ) VALUES ($1::uuid, 1, '2026-10-06', 3, 'B', 'flexible', true)`, [planId])
  }, 60_000)

  afterAll(async () => {
    if (pool) await pool.end()
    if (started) execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'stop', '-m', 'immediate'], { stdio: 'pipe' })
    if (directory.startsWith(path.join(tmpdir(), 'health-training-rotation-'))) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('preserves owner-confirmed anchor values and validates target bounds', async () => {
    await pool.query(`INSERT INTO training_plan_rotation_anchors
      (plan_version_id, anchor_date, current_routine_code, completed_at_anchor, note)
      VALUES ($1::uuid, '2026-10-01', 'B', 4, 'Started B before tracking')`, [planId])
    const result = await pool.query(
      'SELECT current_routine_code, completed_at_anchor FROM training_plan_rotation_anchors WHERE plan_version_id=$1::uuid',
      [planId],
    )
    expect(result.rows[0]).toMatchObject({ current_routine_code: 'B', completed_at_anchor: 4 })
    await expect(pool.query(
      'UPDATE training_plan_rotation_anchors SET completed_at_anchor=12 WHERE plan_version_id=$1::uuid',
      [planId],
    )).rejects.toThrow()
  })

  it('keeps early-ending decisions unique per routine block generation', async () => {
    await pool.query(`INSERT INTO training_plan_block_ends
      (plan_version_id, routine_code, generation, ended_on, reason)
      VALUES ($1::uuid, 'B', 1, '2026-10-09', 'recovery')`, [planId])
    await expect(pool.query(`INSERT INTO training_plan_block_ends
      (plan_version_id, routine_code, generation, ended_on)
      VALUES ($1::uuid, 'B', 1, '2026-10-10')`, [planId])).rejects.toThrow()
    const result = await pool.query(
      'SELECT ended_on::text AS ended_on, reason FROM training_plan_block_ends WHERE plan_version_id=$1::uuid',
      [planId],
    )
    expect(result.rows[0]).toMatchObject({ ended_on: '2026-10-09', reason: 'recovery' })
  })

  it('removes dependent decision rows if the owning plan version is deleted', async () => {
    await pool.query('DELETE FROM training_plan_versions WHERE id = $1::uuid', [planId])
    const anchor = await pool.query('SELECT count(*)::int AS n FROM training_plan_rotation_anchors')
    const ends = await pool.query('SELECT count(*)::int AS n FROM training_plan_block_ends')
    expect(anchor.rows[0].n).toBe(0)
    expect(ends.rows[0].n).toBe(0)
  })
})
