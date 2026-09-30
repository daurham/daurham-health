import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55438
let directory = ''
let started = false
let pool: Pool

describe.skipIf(!existsSync(`${BIN}/initdb`))('H2D migration on disposable PostgreSQL', () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'health-h2d-migration-'))
    execFileSync(`${BIN}/initdb`, ['-D', directory, '--username=postgres', '--auth=trust', '--no-sync'], { stdio: 'pipe' })
    execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'start', '-o', `-p ${PORT} -k ${directory} -c listen_addresses=127.0.0.1`, '-l', path.join(directory, 'server.log')], { stdio: 'pipe' })
    started = true
    pool = new Pool({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'postgres', max: 4 })
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
        performance_type TEXT NOT NULL DEFAULT 'other',
        analytics_load_type TEXT NOT NULL DEFAULT 'none',
        analytics_rep_mode TEXT NOT NULL DEFAULT 'standard',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
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
        CONSTRAINT workout_sets_measurement_family CHECK (
          (reps IS NOT NULL AND duration_sec IS NULL AND left_reps IS NULL AND right_reps IS NULL AND left_duration_sec IS NULL AND right_duration_sec IS NULL)
          OR (duration_sec IS NOT NULL AND reps IS NULL AND left_reps IS NULL AND right_reps IS NULL AND left_duration_sec IS NULL AND right_duration_sec IS NULL)
          OR ((left_reps IS NOT NULL OR right_reps IS NOT NULL) AND reps IS NULL AND duration_sec IS NULL AND left_duration_sec IS NULL AND right_duration_sec IS NULL)
          OR ((left_duration_sec IS NOT NULL OR right_duration_sec IS NOT NULL) AND reps IS NULL AND duration_sec IS NULL AND left_reps IS NULL AND right_reps IS NULL)
        )
      );
      CREATE TABLE goals (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        goal_kind TEXT NOT NULL,
        body_metric_key TEXT NULL,
        exercise_definition_id UUID NULL,
        benchmark_definition_id UUID NULL,
        benchmark_protocol_version_id UUID NULL,
        benchmark_requirement_id UUID NULL,
        supplement_id UUID NULL,
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
    if (directory.startsWith(path.join(tmpdir(), 'health-h2d-migration-'))) rmSync(directory, { recursive: true, force: true })
  })

  it('adds Running/Hiking and the new canonical measurement families', async () => {
    const seeds = (await pool.query("SELECT external_id, measurement_kind, performance_type, analytics_load_type FROM exercise_definitions WHERE external_id IN ('EX18','EX19') ORDER BY external_id")).rows
    expect(seeds).toEqual([
      { external_id: 'EX18', measurement_kind: 'distance_duration', performance_type: 'distance', analytics_load_type: 'none' },
      { external_id: 'EX19', measurement_kind: 'distance_duration', performance_type: 'distance', analytics_load_type: 'none' },
    ])
    await expect(pool.query(`INSERT INTO exercise_definitions (name, measurement_kind, load_type, performance_type)
      VALUES ('Handstand','completion','none','skill')`)).resolves.toBeTruthy()
  })

  it('accepts distance+duration and explicit completion while rejecting mixed unrelated measurement families', async () => {
    await expect(pool.query(`INSERT INTO workout_sets (workout_session_exercise_id,set_number,set_type,load_state,duration_sec,distance_m)
      VALUES (gen_random_uuid(),1,'working','bodyweight',600,1609.344)`)).resolves.toBeTruthy()
    await expect(pool.query(`INSERT INTO workout_sets (workout_session_exercise_id,set_number,set_type,load_state,completed)
      VALUES (gen_random_uuid(),1,'working','bodyweight',false)`)).resolves.toBeTruthy()
    await expect(pool.query(`INSERT INTO workout_sets (workout_session_exercise_id,set_number,set_type,load_state,reps,distance_m)
      VALUES (gen_random_uuid(),1,'working','bodyweight',10,1000)`)).rejects.toThrow(/workout_sets_measurement_family/)
    await expect(pool.query(`INSERT INTO workout_sets (workout_session_exercise_id,set_number,set_type,load_state,distance_m)
      VALUES (gen_random_uuid(),1,'working','bodyweight',0)`)).rejects.toThrow(/workout_sets_distance_positive/)
  })

  it('enforces pace selector identity and accepts the other Training Goal selectors without minimum distance', async () => {
    const exerciseId = (await pool.query("SELECT id FROM exercise_definitions WHERE external_id='EX18'")).rows[0].id
    await expect(pool.query(`INSERT INTO goals (goal_kind, exercise_definition_id, training_min_distance_m)
      VALUES ('training_pace',$1,3218.688)`, [exerciseId])).resolves.toBeTruthy()
    await expect(pool.query(`INSERT INTO goals (goal_kind, exercise_definition_id)
      VALUES ('training_pace',$1)`, [exerciseId])).rejects.toThrow(/goals_selector_shape/)
    await expect(pool.query(`INSERT INTO goals (goal_kind, exercise_definition_id, training_min_distance_m)
      VALUES ('training_distance',$1,1000)`, [exerciseId])).rejects.toThrow(/goals_selector_shape/)
    await expect(pool.query(`INSERT INTO goals (goal_kind, exercise_definition_id)
      VALUES ('training_distance',$1)`, [exerciseId])).resolves.toBeTruthy()
  })

  it('defaults historical templates to seeded and allows only one active owner version per routine code', async () => {
    await pool.query("INSERT INTO workout_templates (routine_code,version,name) VALUES ('A','1','Built in')")
    expect((await pool.query("SELECT origin_kind FROM workout_templates WHERE routine_code='A'")).rows[0].origin_kind).toBe('seeded')
    await pool.query("INSERT INTO workout_templates (routine_code,version,name,origin_kind,is_active) VALUES ('owner:abc','1','Mine','owner',true)")
    await expect(pool.query("INSERT INTO workout_templates (routine_code,version,name,origin_kind,is_active) VALUES ('owner:abc','2','Mine v2','owner',true)"))
      .rejects.toThrow(/workout_templates_one_active_owner_routine/)
    await pool.query("UPDATE workout_templates SET is_active=false WHERE routine_code='owner:abc' AND version='1'")
    await expect(pool.query("INSERT INTO workout_templates (routine_code,version,name,origin_kind,is_active) VALUES ('owner:abc','2','Mine v2','owner',true)"))
      .resolves.toBeTruthy()
  })
})
