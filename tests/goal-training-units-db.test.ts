import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55440
let directory = ''
let started = false
let pool: Pool

describe.sequential.skipIf(!existsSync(`${BIN}/initdb`))('H2D Training Goal unit schema repair', () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'health-goal-units-'))
    execFileSync(`${BIN}/initdb`, ['-D', directory, '--username=postgres', '--auth=trust', '--no-sync'], { stdio: 'pipe' })
    execFileSync(
      `${BIN}/pg_ctl`,
      ['-D', directory, '-w', 'start', '-o', `-p ${PORT} -k ${directory} -c listen_addresses=127.0.0.1`, '-l', path.join(directory, 'server.log')],
      { stdio: 'pipe' },
    )
    started = true
    pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres' })
    await pool.query(`
      CREATE TABLE goal_versions (
        target_unit TEXT NOT NULL,
        CONSTRAINT goal_versions_unit_known CHECK (
          target_unit IN (
            'lb','in','%','sessions/week','steps/day','g/day','min/night',
            'reps','sets','seconds','kg','cm','percent','kcal','g','count',
            'minutes','bpm'
          )
        )
      )
    `)
    await pool.query(readFileSync('migrations/0040_goal_training_units_fix.sql', 'utf8'))
  }, 60_000)

  afterAll(async () => {
    if (pool) await pool.end()
    if (started) execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'stop', '-m', 'immediate'], { stdio: 'pipe' })
    if (directory.startsWith(path.join(tmpdir(), 'health-goal-units-'))) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it.each(['sec', 'mi', 'sec/mi', 'completion'])('accepts H2D Goal unit %s', async (unit) => {
    await expect(pool.query('INSERT INTO goal_versions (target_unit) VALUES ($1)', [unit])).resolves.toBeDefined()
  })

  it('keeps an existing Goal unit valid and rejects an unknown unit', async () => {
    await expect(pool.query("INSERT INTO goal_versions (target_unit) VALUES ('lb')")).resolves.toBeDefined()
    await expect(pool.query("INSERT INTO goal_versions (target_unit) VALUES ('mystery')")).rejects.toThrow()
  })
})
