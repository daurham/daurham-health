import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool, type PoolClient } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55442
let directory = ''
let started = false
let pool: Pool
const migration = readFileSync('migrations/0042_instance_seed_scope.sql', 'utf8')

async function setupScenario(
  client: PoolClient,
  schema: string,
  withLegacyHistory: boolean,
) {
  await client.query(`CREATE SCHEMA ${schema}`)
  await client.query(`SET search_path TO ${schema}`)
  await client.query(`
    CREATE TABLE workout_templates (
      id UUID PRIMARY KEY,
      routine_code TEXT NOT NULL,
      version TEXT NOT NULL,
      name TEXT NOT NULL,
      metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT true,
      origin_kind TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE workout_sessions (
      id UUID PRIMARY KEY,
      workout_template_id UUID NULL,
      routine_code TEXT NULL,
      template_version TEXT NULL
    );
  `)

  await client.query(`
    INSERT INTO workout_templates (id,routine_code,version,name,origin_kind)
    VALUES
      ('00000000-0000-0000-0000-00000000000a','A','1.3.1','Full Body A','seeded'),
      ('00000000-0000-0000-0000-00000000000b','B','1.3.1','Full Body B','seeded'),
      ('00000000-0000-0000-0000-00000000000c','C','1.3.1','Full Body C','seeded'),
      ('00000000-0000-0000-0000-0000000000ca','CAL-BEG','1.0.0','Beginner Calisthenics','seeded'),
      ('00000000-0000-0000-0000-0000000000dd','owner:mine','1','Mine','owner');
  `)

  if (withLegacyHistory) {
    await client.query(`
      INSERT INTO workout_sessions (id,workout_template_id,routine_code,template_version)
      VALUES (
        '10000000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-00000000000a',
        'A',
        '1.3.1'
      )
    `)
  }

  await client.query(migration)
}

describe.skipIf(!existsSync(`${BIN}/initdb`))(
  'I0C seed-scope migration on disposable PostgreSQL',
  () => {
    beforeAll(async () => {
      directory = mkdtempSync(path.join(tmpdir(), 'health-i0c-migration-'))
      execFileSync(
        `${BIN}/initdb`,
        ['-D', directory, '--username=postgres', '--auth=trust', '--no-sync'],
        { stdio: 'pipe' },
      )
      execFileSync(
        `${BIN}/pg_ctl`,
        [
          '-D',
          directory,
          '-w',
          'start',
          '-o',
          `-p ${PORT} -k ${directory} -c listen_addresses=127.0.0.1`,
          '-l',
          path.join(directory, 'server.log'),
        ],
        { stdio: 'pipe' },
      )
      started = true
      pool = new Pool({
        host: '127.0.0.1',
        port: PORT,
        user: 'postgres',
        database: 'postgres',
        max: 4,
      })
    }, 60_000)

    afterAll(async () => {
      if (pool) await pool.end()
      if (started) {
        execFileSync(
          `${BIN}/pg_ctl`,
          ['-D', directory, '-w', 'stop', '-m', 'immediate'],
          { stdio: 'pipe' },
        )
      }
      if (directory.startsWith(path.join(tmpdir(), 'health-i0c-migration-'))) {
        rmSync(directory, { recursive: true, force: true })
      }
    })

    it('hides legacy A/B/C on a fresh instance but keeps product built-ins', async () => {
      const client = await pool.connect()
      try {
        await setupScenario(client, 'fresh', false)
        const rows = (
          await client.query(
            `SELECT routine_code,is_active,metadata->>'seed_scope' AS seed_scope
               FROM workout_templates
              ORDER BY routine_code`,
          )
        ).rows

        expect(rows).toEqual([
          { routine_code: 'A', is_active: false, seed_scope: 'legacy_owner' },
          { routine_code: 'B', is_active: false, seed_scope: 'legacy_owner' },
          { routine_code: 'C', is_active: false, seed_scope: 'legacy_owner' },
          { routine_code: 'CAL-BEG', is_active: true, seed_scope: 'product_builtin' },
          { routine_code: 'owner:mine', is_active: true, seed_scope: null },
        ])
      } finally {
        client.release()
      }
    })

    it('preserves the legacy family when historical Training references it', async () => {
      const client = await pool.connect()
      try {
        await setupScenario(client, 'established', true)
        const rows = (
          await client.query(
            `SELECT routine_code,is_active,metadata->>'seed_scope' AS seed_scope
               FROM workout_templates
              ORDER BY routine_code`,
          )
        ).rows

        expect(rows).toEqual([
          { routine_code: 'A', is_active: true, seed_scope: 'legacy_owner' },
          { routine_code: 'B', is_active: true, seed_scope: 'legacy_owner' },
          { routine_code: 'C', is_active: true, seed_scope: 'legacy_owner' },
          { routine_code: 'CAL-BEG', is_active: true, seed_scope: 'product_builtin' },
          { routine_code: 'owner:mine', is_active: true, seed_scope: null },
        ])
      } finally {
        client.release()
      }
    })
  },
)
