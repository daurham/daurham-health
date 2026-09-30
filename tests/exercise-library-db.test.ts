import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const BIN = '/usr/lib/postgresql/14/bin'
const PORT = 55441
let directory = ''
let started = false
let pool: Pool

describe.sequential.skipIf(!existsSync(`${BIN}/initdb`))('H5 Exercise Library migration on disposable PostgreSQL', () => {
  beforeAll(async () => {
    directory = mkdtempSync(path.join(tmpdir(), 'health-exercise-library-'))
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
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE workout_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        routine_code TEXT NOT NULL,
        version TEXT NOT NULL,
        name TEXT NOT NULL,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        is_active BOOLEAN NOT NULL DEFAULT true,
        origin_kind TEXT NOT NULL DEFAULT 'seeded',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT workout_templates_routine_version_key UNIQUE (routine_code, version)
      );
      CREATE TABLE workout_template_exercises (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workout_template_id UUID NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
        exercise_definition_id UUID NOT NULL REFERENCES exercise_definitions(id),
        slot_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        planned_sets INTEGER NULL,
        prescription JSONB NOT NULL DEFAULT '{}'::jsonb,
        metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT workout_template_exercises_slot_key UNIQUE (workout_template_id, slot_id),
        CONSTRAINT workout_template_exercises_position_key UNIQUE (workout_template_id, position)
      );
    `)
    for (let number = 1; number <= 19; number += 1) {
      const externalId = `EX${String(number).padStart(2, '0')}`
      await pool.query(
        `INSERT INTO exercise_definitions (
           external_id, name, measurement_kind, load_type, unilateral,
           performance_type, analytics_load_type, analytics_rep_mode
         ) VALUES ($1, $2, $3, $4, false, $5, $6, 'standard')`,
        [
          externalId,
          `Existing ${externalId}`,
          number >= 18 ? 'distance_duration' : 'reps',
          number >= 18 ? 'none' : 'dumbbell',
          number >= 18 ? 'distance' : 'other',
          number >= 18 ? 'none' : 'external',
        ],
      )
    }
    await pool.query(readFileSync('migrations/0041_exercise_library_calisthenics.sql', 'utf8'))
  }, 60_000)

  afterAll(async () => {
    if (pool) await pool.end()
    if (started) execFileSync(`${BIN}/pg_ctl`, ['-D', directory, '-w', 'stop', '-m', 'immediate'], { stdio: 'pipe' })
    if (directory.startsWith(path.join(tmpdir(), 'health-exercise-library-'))) {
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('adds media/form fields and seeds guidance for every existing built-in', async () => {
    const columns = (await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'exercise_definitions'
        AND column_name IN ('gif_url','youtube_url','form_instructions','notes')
      ORDER BY column_name
    `)).rows.map((row) => row.column_name)
    expect(columns).toEqual(['form_instructions', 'gif_url', 'notes', 'youtube_url'])

    const rows = (await pool.query(`
      SELECT external_id, form_instructions
      FROM exercise_definitions
      WHERE external_id BETWEEN 'EX01' AND 'EX19'
      ORDER BY external_id
    `)).rows
    expect(rows).toHaveLength(19)
    expect(rows.every((row) => typeof row.form_instructions === 'string' && row.form_instructions.trim().length > 20)).toBe(true)
  })

  it('seeds classified calisthenics exercises and a valid seven-slot built-in routine', async () => {
    const exercises = (await pool.query(`
      SELECT external_id, name, measurement_kind, load_type, metadata, form_instructions
      FROM exercise_definitions
      WHERE external_id BETWEEN 'EX20' AND 'EX26'
      ORDER BY external_id
    `)).rows
    expect(exercises).toHaveLength(7)
    expect(exercises.find((row) => row.external_id === 'EX22')).toMatchObject({
      name: 'Inverted Row',
      measurement_kind: 'reps',
      load_type: 'bodyweight',
    })
    expect(String(exercises.find((row) => row.external_id === 'EX22')?.form_instructions)).toMatch(/secure/i)
    expect(exercises.every((row) => typeof row.metadata.primary_muscle_group === 'string')).toBe(true)

    const routine = (await pool.query(`
      SELECT id, origin_kind
      FROM workout_templates
      WHERE routine_code = 'CAL-BEG' AND version = '1.0.0'
    `)).rows[0]
    expect(routine.origin_kind).toBe('seeded')
    const slots = (await pool.query(
      `SELECT position, planned_sets, prescription
       FROM workout_template_exercises
       WHERE workout_template_id = $1
       ORDER BY position`,
      [routine.id],
    )).rows
    expect(slots).toHaveLength(7)
    expect(slots.every((slot) => slot.planned_sets === 2)).toBe(true)
  })

  it('keeps seeded form copy bounded and owner-editable', async () => {
    await pool.query(`UPDATE exercise_definitions SET form_instructions = 'My custom bench cues' WHERE external_id = 'EX02'`)
    expect((await pool.query(`SELECT form_instructions FROM exercise_definitions WHERE external_id='EX02'`)).rows[0].form_instructions)
      .toBe('My custom bench cues')
    await expect(
      pool.query(`UPDATE exercise_definitions SET form_instructions = repeat('x', 3001) WHERE external_id='EX02'`),
    ).rejects.toThrow(/exercise_definitions_form_instructions_length/)
  })
})
