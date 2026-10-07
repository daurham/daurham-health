import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55444
let directory = ''
let started = false
let pool: Pool

describe.skipIf(!existsSync(`${BIN}/initdb`))('I2 migration on disposable PostgreSQL', () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'health-i2-migration-'))
    execFileSync(`${BIN}/initdb`, ['-D', directory, '--username=postgres', '--auth=trust', '--no-sync'], { stdio: 'pipe' })
    execFileSync(
      `${BIN}/pg_ctl`,
      ['-D', directory, '-w', 'start', '-o', `-p ${PORT} -k ${directory} -c listen_addresses=127.0.0.1`, '-l', path.join(directory, 'server.log')],
      { stdio: 'pipe' },
    )
    started = true
    pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres', max: 4 })
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await pool.query(`
      CREATE TABLE data_sources (
        id UUID PRIMARY KEY,
        key TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        source_kind TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `)
    await pool.query(`
      INSERT INTO data_sources (id,key,display_name,source_kind)
      VALUES ('11111111-1111-4111-8111-111111111111','manual','Manual','manual')
    `)
    await pool.query(readFileSync('migrations/0044_daily_signals.sql', 'utf8'))
  }, 60_000)

  afterAll(async () => {
    if (pool) await pool.end()
    if (started) execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'stop', '-m', 'immediate'], { stdio: 'pipe' })
    if (directory.startsWith(path.join(tmpdir(), 'health-i2-migration-'))) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('enforces positive bounded hydration amounts', async () => {
    await expect(pool.query(
      `INSERT INTO hydration_events (id,hydration_date,amount_ml,source_id)
       VALUES (gen_random_uuid(),'2026-10-06',473.18,'11111111-1111-4111-8111-111111111111')`,
    )).resolves.toBeTruthy()
    await expect(pool.query(
      `INSERT INTO hydration_events (id,hydration_date,amount_ml,source_id)
       VALUES (gen_random_uuid(),'2026-10-06',0,'11111111-1111-4111-8111-111111111111')`,
    )).rejects.toThrow(/hydration_events_amount_range/)
  })

  it('enforces Bristol type and explicit no-BM state shape', async () => {
    await expect(pool.query(
      `INSERT INTO bowel_events (id,bowel_date,bristol_type,source_id)
       VALUES (gen_random_uuid(),'2026-10-06',4,'11111111-1111-4111-8111-111111111111')`,
    )).resolves.toBeTruthy()
    await expect(pool.query(
      `INSERT INTO bowel_events (id,bowel_date,bristol_type,source_id)
       VALUES (gen_random_uuid(),'2026-10-07',0,'11111111-1111-4111-8111-111111111111')`,
    )).rejects.toThrow(/bowel_events_bristol_range/)
    await expect(pool.query(
      `INSERT INTO bowel_day_states (bowel_date,state,source_id)
       VALUES ('2026-10-07','unknown','11111111-1111-4111-8111-111111111111')`,
    )).rejects.toThrow(/bowel_day_states_state_check/)
  })

  it('requires at least one bounded wellness rating', async () => {
    await expect(pool.query(
      `INSERT INTO daily_wellness (wellness_date,energy_rating,source_id)
       VALUES ('2026-10-06',3,'11111111-1111-4111-8111-111111111111')`,
    )).resolves.toBeTruthy()
    await expect(pool.query(
      `INSERT INTO daily_wellness (wellness_date,source_id)
       VALUES ('2026-10-07','11111111-1111-4111-8111-111111111111')`,
    )).rejects.toThrow(/daily_wellness_not_empty/)
    await expect(pool.query(
      `INSERT INTO daily_wellness (wellness_date,stress_rating,source_id)
       VALUES ('2026-10-08',6,'11111111-1111-4111-8111-111111111111')`,
    )).rejects.toThrow(/daily_wellness_stress_range/)
  })
})
