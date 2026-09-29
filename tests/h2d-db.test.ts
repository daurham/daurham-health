import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55435
let directory = ''
let started = false
let pool: Pool

describe.skipIf(!existsSync(`${BIN}/initdb`))('H2D migration on disposable PostgreSQL', () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'health-h2d-schema-'))
    execFileSync(`${BIN}/initdb`, ['-D', directory, '--username=postgres', '--auth=trust', '--no-sync'], { stdio: 'pipe' })
    execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'start', '-o', `-p ${PORT} -k ${directory} -c listen_addresses=127.0.0.1`, '-l', path.join(directory, 'server.log')], { stdio: 'pipe' })
    started = true
    pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres' })
    await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto')
    await pool.query(`
      CREATE TABLE exercise_definitions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        external_id TEXT UNIQUE NULL,
        name TEXT NOT NULL,
        measurement_kind TEXT NOT NULL,
        load_type TEXT NOT NULL,
        unilateral BOOLEAN NOT NULL DEFAULT false,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        performance_type TEXT NOT NULL DEFAULT 'other',
        analytics_load_type TEXT NOT NULL DEFAULT 'none',
        analytics_rep_mode TEXT NOT NULL DEFAULT 'standard',
        CONSTRAINT exercise_definitions_measurement_kind_allowed CHECK (
          measurement_kind IN ('reps','duration','reps_per_side','duration_per_side')
        ),
        CONSTRAINT exercise_definitions_performance_type_allowed CHECK (
          performance_type IN ('loaded_reps','bodyweight_reps','assisted_reps','timed','distance','other')
        )
      );

      CREATE TABLE workout_sets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workout_session_exercise_id UUID NOT NULL,
        set_number INTEGER NOT NULL,
        set_type TEXT NOT NULL DEFAULT 'working',
        load_state TEXT NOT NULL,
        weight_kg NUMERIC NULL,
        reps INTEGER NULL,
        duration_sec INTEGER NULL,
        left_reps INTEGER NULL,
        right_reps INTEGER NULL,
        left_duration_sec INTEGER NULL,
        right_duration_sec INTEGER NULL,
        notes TEXT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT workout_sets_counts_nonnegative CHECK (
          (reps IS NULL OR reps >= 0) AND (duration_sec IS NULL OR duration_sec >= 0)
          AND (left_reps IS NULL OR left_reps >= 0) AND (right_reps IS NULL OR right_reps >= 0)
          AND (left_duration_sec IS NULL OR left_duration_sec >= 0) AND (right_duration_sec IS NULL OR right_duration_sec >= 0)
        ),
        CONSTRAINT workout_sets_measurement_family CHECK (
          (reps IS NOT NULL AND duration_sec IS NULL AND left_reps IS NULL AND right_reps IS NULL AND left_duration_sec IS NULL AND right_duration_sec IS NULL)
          OR (duration_sec IS NOT NULL AND reps IS NULL AND left_reps IS NULL AND right_reps IS NULL AND left_duration_sec IS NULL AND right_duration_sec IS NULL)
          OR ((left_reps IS NOT NULL OR right_reps IS NOT NULL) AND reps IS NULL AND duration_sec IS NULL AND left_duration_sec IS NULL AND right_duration_sec IS NULL)
          OR ((left_duration_sec IS NOT NULL OR right_duration_sec IS NOT NULL) AND reps IS NULL AND duration_sec IS NULL AND left_reps IS NULL AND right_reps IS NULL)
        )
      );

      CREATE TABLE goals (
        id UUID PRIMARY KEY,
        goal_kind TEXT NOT NULL,
        status TEXT NOT NULL,
        started_on DATE NOT NULL,
        body_metric_key TEXT NULL,
        exercise_definition_id UUID NULL,
        benchmark_definition_id UUID NULL,
        benchmark_protocol_version_id UUID NULL,
        benchmark_requirement_id UUID NULL,
        supplement_id UUID NULL,
        source_id UUID NOT NULL,
        paused_at TIMESTAMPTZ NULL,
        completed_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT goals_kind_allowed CHECK (
          goal_kind IN ('body_metric','strength_e1rm','benchmark_result','training_frequency','activity_steps','nutrition_protein','sleep_duration','supplement_adherence')
        ),
        CONSTRAINT goals_selector_shape CHECK (true)
      );

      CREATE TABLE workout_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        routine_code TEXT NOT NULL,
        version TEXT NOT NULL,
        name TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT workout_templates_routine_version_key UNIQUE (routine_code, version)
      );
    `)
    await pool.query(readFileSync('migrations/0038_training_measurements_goals_routines.sql', 'utf8'))
  }, 60_000)

  afterAll(async () => {
    if (pool) await pool.end()
    if (started) execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'stop', '-m', 'immediate'], { stdio: 'pipe' })
    if (directory.startsWith(path.join(tmpdir(), 'health-h2d-schema-'))) rmSync(directory, { recursive: true, force: true })
  })

  it('adds canonical distance and completion set fields with constraints', async () => {
    const columns = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='workout_sets'`)
    expect(columns.rows.map((row) => row.column_name)).toEqual(expect.arrayContaining(['distance_m','completed']))
    await pool.query(`INSERT INTO workout_sets (workout_session_exercise_id,set_number,set_type,load_state,duration_sec,distance_m)
      VALUES (gen_random_uuid(),1,'working','bodyweight',600,1609.344)`)
    await pool.query(`INSERT INTO workout_sets (workout_session_exercise_id,set_number,set_type,load_state,completed)
      VALUES (gen_random_uuid(),1,'working','bodyweight',true)`)
    await expect(pool.query(`INSERT INTO workout_sets (workout_session_exercise_id,set_number,set_type,load_state,reps,distance_m)
      VALUES (gen_random_uuid(),1,'working','bodyweight',10,100)`)).rejects.toThrow(/workout_sets_measurement_family/)
  })

  it('accepts H2D Goal selector shapes and rejects pace without minimum distance', async () => {
    const exercise = (await pool.query(`SELECT id FROM exercise_definitions WHERE external_id='EX18'`)).rows[0].id
    const common = [genUuid(), 'active', '2026-09-29', exercise, genUuid()]
    await pool.query(`INSERT INTO goals (id,goal_kind,status,started_on,exercise_definition_id,training_min_distance_m,source_id)
      VALUES ($1,'training_pace',$2,$3,$4,1609.344,$5)`, common)
    await expect(pool.query(`INSERT INTO goals (id,goal_kind,status,started_on,exercise_definition_id,source_id)
      VALUES ($1,'training_pace',$2,$3,$4,$5)`, [genUuid(),'active','2026-09-29',exercise,genUuid()])).rejects.toThrow(/goals_selector_shape/)
  })

  it('seeds Running/Hiking and protects one active owner routine version', async () => {
    const seeded = await pool.query(`SELECT external_id,measurement_kind,performance_type FROM exercise_definitions WHERE external_id IN ('EX18','EX19') ORDER BY external_id`)
    expect(seeded.rows).toEqual([
      { external_id: 'EX18', measurement_kind: 'distance_duration', performance_type: 'distance' },
      { external_id: 'EX19', measurement_kind: 'distance_duration', performance_type: 'distance' },
    ])
    await pool.query(`INSERT INTO workout_templates (routine_code,version,name,origin_kind,is_active) VALUES ('owner:test','1','Run','owner',true)`)
    await expect(pool.query(`INSERT INTO workout_templates (routine_code,version,name,origin_kind,is_active) VALUES ('owner:test','2','Run v2','owner',true)`)).rejects.toThrow(/workout_templates_one_active_owner_version_idx/)
  })
})

function genUuid(): string {
  return randomUUID()
}
