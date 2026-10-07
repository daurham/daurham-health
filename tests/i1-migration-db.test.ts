import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55443
let directory = ''
let started = false
let pool: Pool

describe.skipIf(!existsSync(\`\${BIN}/initdb\`))('I1 migration on disposable PostgreSQL', () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'health-i1-migration-'))
    execFileSync(\`\${BIN}/initdb\`, ['-D', directory, '--username=postgres', '--auth=trust', '--no-sync'], { stdio: 'pipe' })
    execFileSync(\`\${BIN}/pg_ctl\`, ['-D', directory, '-w', 'start', '-o', \`-p \${PORT} -k \${directory} -c listen_addresses=127.0.0.1\`, '-l', path.join(directory, 'server.log')], { stdio: 'pipe' })
    started = true
    pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres', max: 4 })
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await pool.query(readFileSync('migrations/0043_health_profile_training_plan.sql', 'utf8'))
  }, 60_000)

  afterAll(async () => {
    if (pool) await pool.end()
    if (started) execFileSync(\`\${BIN}/pg_ctl\`, ['-D', directory, '-w', 'stop', '-m', 'immediate'], { stdio: 'pipe' })
    if (directory.startsWith(path.join(tmpdir(), 'health-i1-migration-'))) rmSync(directory, { recursive: true, force: true })
  })

  it('enforces one bounded owner profile', async () => {
    await expect(pool.query(
      \`INSERT INTO health_profile (date_of_birth,height_cm) VALUES ('1995-10-07',177.8)\`,
    )).resolves.toBeTruthy()
    await expect(pool.query(
      \`INSERT INTO health_profile (singleton_id,height_cm) VALUES (2,177.8)\`,
    )).rejects.toThrow(/health_profile_singleton/)
    await expect(pool.query(
      \`UPDATE health_profile SET height_cm=300 WHERE singleton_id=1\`,
    )).rejects.toThrow(/health_profile_height_range/)
  })

  it('stores versioned baseline sequence and preferred weekdays', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    await pool.query(
      \`INSERT INTO training_plan_versions (
         id,version,effective_from,weekly_frequency_target,sequence_start_routine_code,default_non_training_intent,is_current
       ) VALUES ($1,1,'2026-10-06',3,'A','rest',true)\`,
      [id],
    )
    await pool.query(
      \`INSERT INTO training_plan_sequence_items (plan_version_id,position,routine_code)
       VALUES ($1,1,'A'),($1,2,'B'),($1,3,'C')\`,
      [id],
    )
    await pool.query(
      \`INSERT INTO training_plan_preferred_weekdays (plan_version_id,weekday)
       VALUES ($1,1),($1,3),($1,5)\`,
      [id],
    )
    expect((await pool.query(
      \`SELECT routine_code FROM training_plan_sequence_items WHERE plan_version_id=$1 ORDER BY position\`,
      [id],
    )).rows.map((row) => row.routine_code)).toEqual(['A','B','C'])
  })

  it('requires paired dates only for moved overrides', async () => {
    await expect(pool.query(
      \`INSERT INTO training_plan_day_overrides (override_date,intent_kind,linked_date)
       VALUES ('2026-10-07','training_moved_away','2026-10-08')\`,
    )).resolves.toBeTruthy()
    await expect(pool.query(
      \`INSERT INTO training_plan_day_overrides (override_date,intent_kind,linked_date)
       VALUES ('2026-10-09','rest','2026-10-10')\`,
    )).rejects.toThrow(/training_plan_day_override_link_shape/)
  })
})
