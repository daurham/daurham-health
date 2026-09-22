import { createHash } from 'node:crypto'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { requireHealthOwner, type HealthOwnerConfig } from '../server/auth/owner.ts'
import { HttpError } from '../server/http.ts'
import {
  buildBackupArchive,
  planRestore,
  restoreStatements,
  verifyBackupArchive,
  type BackupRow,
} from '../server/backup/format.ts'
import { AUTH_TABLES_EXCLUDED, BACKUP_TABLES, LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.ts'

const SOURCE = '11111111-1111-4111-8111-111111111111'
const FOOD = '22222222-2222-4222-8222-222222222222'
const ENTRY = '33333333-3333-4333-8333-333333333333'
const BODY = '44444444-4444-4444-8444-444444444444'
const METRIC = '55555555-5555-4555-8555-555555555555'
const EXERCISE = '66666666-6666-4666-8666-666666666666'
const TEMPLATE = '77777777-7777-4777-8777-777777777777'
const SLOT = '88888888-8888-4888-8888-888888888888'
const WORKOUT = '99999999-9999-4999-8999-999999999999'
const WORKOUT_EXERCISE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SET = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const CHECKPOINT = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const DAY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const NIGHT = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const INSTANT = '2026-09-22 22:15:00+00'

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

function row(values: BackupRow): BackupRow {
  return values
}

function fixture(): Record<string, BackupRow[]> {
  return {
    data_sources: [
      row({
        id: SOURCE,
        key: 'manual',
        display_name: 'Manual',
        source_kind: 'manual',
        created_at: INSTANT,
      }),
    ],
    exercise_definitions: [
      row({
        id: EXERCISE,
        external_id: 'EX01',
        name: 'Box Squat',
        measurement_kind: 'reps',
        load_type: 'barbell',
        unilateral: false,
        metadata: '{"equipment_load":"barbell_total_including_bar"}',
        is_active: true,
        created_at: INSTANT,
        updated_at: INSTANT,
        performance_type: 'loaded_reps',
        analytics_load_type: 'external',
        analytics_rep_mode: 'standard',
      }),
    ],
    workout_templates: [
      row({
        id: TEMPLATE,
        routine_code: 'A',
        version: '1.3.1',
        name: 'Full Body A',
        metadata: '{}',
        is_active: true,
        created_at: INSTANT,
      }),
    ],
    workout_template_exercises: [
      row({
        id: SLOT,
        workout_template_id: TEMPLATE,
        exercise_definition_id: EXERCISE,
        slot_id: 'A01',
        position: '1',
        planned_sets: '3',
        prescription: '{"measurement":"reps"}',
        metadata: '{}',
        created_at: INSTANT,
      }),
    ],
    nutrition_foods: [
      row({
        id: FOOD,
        name: 'Eggs',
        brand: null,
        barcode: null,
        catalog_kind: 'ingredient',
        serving_quantity: '2',
        serving_unit: 'large',
        serving_grams: null,
        calories: '140',
        protein: '12.5',
        carbs: null,
        fat: '9.5',
        fiber: null,
        source_kind: 'manual',
        is_staple: false,
        archived: false,
        notes: null,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    nutrition_entries: [
      row({
        id: ENTRY,
        log_date: '2026-09-22',
        consumed_at: null,
        timezone: 'America/Phoenix',
        meal: 'breakfast',
        food_id: FOOD,
        food_name: 'Eggs',
        brand: null,
        serving_quantity: '2',
        serving_unit: 'large',
        grams: null,
        calories: '668.125',
        protein: null,
        carbs: '0',
        fat: '9.5',
        fiber: null,
        source_kind: 'manual',
        notes: null,
        created_at: INSTANT,
        updated_at: INSTANT,
        meal_group_id: null,
      }),
    ],
    body_measurement_sessions: [
      row({
        id: BODY,
        measured_at: INSTANT,
        timezone: 'America/Phoenix',
        source_id: SOURCE,
        import_job_id: null,
        device_name: null,
        notes: null,
        metadata: '{}',
        created_at: INSTANT,
      }),
    ],
    body_metrics: [
      row({
        id: METRIC,
        measurement_session_id: BODY,
        metric_key: 'weight',
        value: '86.63614267',
        unit: 'kg',
        value_kind: 'measured',
        metadata: '{}',
        created_at: INSTANT,
      }),
    ],
    workout_sessions: [
      row({
        id: WORKOUT,
        workout_date: '2026-09-21',
        workout_template_id: TEMPLATE,
        routine_code: 'A',
        template_version: '1.3.1',
        template_name: 'Full Body A',
        duration_min: null,
        effort: null,
        pain_level: null,
        bodyweight_kg: null,
        notes: null,
        source_kind: 'manual',
        metadata: '{}',
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    workout_session_exercises: [
      row({
        id: WORKOUT_EXERCISE,
        workout_session_id: WORKOUT,
        exercise_definition_id: EXERCISE,
        position: '1',
        slot_id: 'A01',
        exercise_external_id: 'EX01',
        exercise_name: 'Box Squat',
        notes: null,
        metadata: '{}',
        created_at: INSTANT,
      }),
    ],
    workout_sets: [
      row({
        id: SET,
        workout_session_exercise_id: WORKOUT_EXERCISE,
        set_number: '1',
        set_type: 'working',
        load_state: 'external',
        weight_kg: '60.5',
        reps: '8',
        duration_sec: null,
        left_reps: null,
        right_reps: null,
        left_duration_sec: null,
        right_duration_sec: null,
        notes: null,
        metadata: '{}',
        created_at: INSTANT,
      }),
    ],
    progress_checkpoints: [
      row({
        id: CHECKPOINT,
        checkpoint_date: '2026-09-01',
        label: 'Start',
        notes: null,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    activity_daily_summaries: [
      row({
        id: DAY,
        summary_date: '2026-09-22',
        timezone: 'America/Phoenix',
        steps_count: '129',
        active_energy_kcal: '12.083702334016023',
        exercise_minutes: null,
        walking_running_distance_m: null,
        resting_heart_rate_bpm: null,
        calculation_version: '1',
        evidence: '{}',
        source_id: SOURCE,
        import_job_id: null,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
    sleep_nightly_summaries: [
      row({
        id: NIGHT,
        sleep_date: '2026-06-14',
        timezone: 'America/Phoenix',
        logical_source_key: 'apple-watch',
        source_name: 'Apple Watch',
        start_at: INSTANT,
        end_at: INSTANT,
        total_sleep_minutes: '592.05',
        time_in_bed_minutes: null,
        awake_minutes: null,
        core_minutes: null,
        deep_minutes: null,
        rem_minutes: null,
        unspecified_sleep_minutes: null,
        stage_coverage_pct: null,
        stage_conflict_minutes: '0',
        observation_status: 'analysis_eligible',
        analysis_eligible: true,
        stage_analysis_eligible: false,
        selection_reason: 'source_priority',
        calculation_version: '1',
        evidence: '{}',
        source_id: SOURCE,
        import_job_id: null,
        created_at: INSTANT,
        updated_at: INSTANT,
      }),
    ],
  }
}

function archive() {
  return buildBackupArchive({
    profile: 'full',
    createdAt: '2026-09-22T22:30:00.000Z',
    schemaMigration: LATEST_SCHEMA_MIGRATION,
    appVersionOrCommit: '0.0.0',
    rowsByTable: fixture(),
  })
}

function emptyCounts(seedCount = 0): Record<string, number> {
  return Object.fromEntries(BACKUP_TABLES.map((definition) => [definition.name, definition.seeded ? seedCount : 0]))
}

describe('health backup archive', () => {
  it('round-trips ids, nulls, dates, timestamps, and numeric text', () => {
    const verified = verifyBackupArchive(archive())
    expect(verified.errors).toEqual([])
    expect(verified.manifest.formatVersion).toBe(1)
    expect(verified.manifest.calendarTimezone).toBe('America/Phoenix')
    const entry = verified.tables.nutrition_entries?.[0]
    expect(entry).toMatchObject({
      id: ENTRY,
      food_id: FOOD,
      log_date: '2026-09-22',
      created_at: INSTANT,
      calories: '668.125',
      protein: null,
      carbs: '0',
    })
    expect(verified.tables.body_metrics?.[0]?.value).toBe('86.63614267')
    expect(verified.tables.activity_daily_summaries?.[0]?.exercise_minutes).toBeNull()
    expect(verified.tables.activity_daily_summaries?.[0]?.active_energy_kcal).toBe('12.083702334016023')
    expect(verified.manifest.tables.nutrition_entries?.rows).toBe(1)
    const restored = restoreStatements(verified.tables)
    const entryInsert = restored.find((statement) => statement.text.includes('INSERT INTO nutrition_entries'))
    expect(entryInsert?.params).toContain(ENTRY)
    expect(entryInsert?.params).toContain(FOOD)
    expect(entryInsert?.params).toContain(null)
    expect(entryInsert?.params).toContain('668.125')
    expect(verified.tables.workout_sets?.[0]?.workout_session_exercise_id).toBe(WORKOUT_EXERCISE)
    expect(verified.tables.workout_session_exercises?.[0]?.workout_session_id).toBe(WORKOUT)
  })

  it('excludes auth tables and secret markers', () => {
    expect(BACKUP_TABLES.map((definition) => definition.name)).not.toEqual(expect.arrayContaining([...AUTH_TABLES_EXCLUDED]))
    for (const name of BACKUP_TABLES.map((definition) => definition.name)) {
      expect(['user', 'session', 'account', 'verification', 'jwks']).not.toContain(name)
    }
    const text = strFromU8(archive())
    expect(text).not.toContain('GEMINI_API_KEY')
    expect(text).not.toContain('password_hash')
    expect(text).not.toContain('DATABASE_URL')
  })

  it('rejects a bad checksum, malformed NDJSON, and an unsupported version', () => {
    const files = unzipSync(archive())
    const broken = { ...files }
    const ndjson = strFromU8(files['tables/nutrition_entries.ndjson'] ?? new Uint8Array())
    broken['tables/nutrition_entries.ndjson'] = strToU8(`${ndjson.slice(0, -2)}`)
    expect(verifyBackupArchive(zipSync(broken)).errors.some((error) => error.includes('checksum'))).toBe(true)

    const malformed = { ...files }
    const bad = strToU8('{')
    malformed['tables/nutrition_entries.ndjson'] = bad
    const manifest = JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array())) as {
      tables: Record<string, { sha256: string; rows: number }>
      contentSha256: string
    }
    manifest.tables.nutrition_entries = {
      ...manifest.tables.nutrition_entries,
      rows: 1,
      sha256: createHash('sha256').update(bad).digest('hex'),
    }
    const lines = Object.keys(manifest.tables)
      .sort()
      .map((name) => `${name}\n${manifest.tables[name]?.sha256 ?? ''}\n`)
    manifest.contentSha256 = createHash('sha256').update(lines.join('')).digest('hex')
    malformed['manifest.json'] = strToU8(`${JSON.stringify(manifest)}\n`)
    expect(verifyBackupArchive(zipSync(malformed)).errors.some((error) => error.includes('not valid NDJSON'))).toBe(true)

    const future = JSON.parse(strFromU8(files['manifest.json'] ?? new Uint8Array())) as { formatVersion: number }
    future.formatVersion = 2
    const futureFiles = { ...files, 'manifest.json': strToU8(`${JSON.stringify(future)}\n`) }
    expect(verifyBackupArchive(zipSync(futureFiles)).errors.some((error) => error.includes('unsupported backup format version'))).toBe(true)
  })

  it('stops a conflicting restore without producing writes and keeps ids on an empty database', () => {
    const verified = verifyBackupArchive(archive())
    const conflict = planRestore({
      verified,
      destinationSchema: LATEST_SCHEMA_MIGRATION,
      destinationCounts: { ...emptyCounts(), nutrition_entries: 2 },
    })
    expect(conflict.blocked).toBe(true)
    const writes = conflict.blocked ? [] : restoreStatements(verified.tables)
    expect(writes).toEqual([])

    const empty = planRestore({
      verified,
      destinationSchema: LATEST_SCHEMA_MIGRATION,
      destinationCounts: emptyCounts(4),
    })
    expect(empty.blocked).toBe(false)
    expect(empty.notes.some((note) => note.includes('data_sources'))).toBe(true)
    const statements = restoreStatements(verified.tables)
    expect(statements[0]?.text).toBe('DELETE FROM workout_template_exercises')
    expect(statements.some((statement) => statement.params.includes(ENTRY))).toBe(true)
    expect(statements.some((statement) => statement.params.includes(FOOD))).toBe(true)
  })

  it('refuses a portable export as a recovery backup', () => {
    const portable = buildBackupArchive({
      profile: 'portable',
      createdAt: '2026-09-22T22:30:00.000Z',
      schemaMigration: LATEST_SCHEMA_MIGRATION,
      appVersionOrCommit: '0.0.0',
      rowsByTable: fixture(),
    })
    const verified = verifyBackupArchive(portable)
    expect(verified.errors).toEqual([])
    const plan = planRestore({
      verified,
      destinationSchema: LATEST_SCHEMA_MIGRATION,
      destinationCounts: emptyCounts(),
    })
    expect(plan.blocked).toBe(true)
    expect(plan.conflicts.some((conflict) => conflict.includes('Portable exports cannot be restored'))).toBe(true)
  })
})

describe('backup export authorization', () => {
  it('rejects anonymous and non-owner callers, including a machine bearer token', async () => {
    const request = { headers: { authorization: 'Bearer machine-token' } }
    await expect(requireHealthOwner(request, { readSession: async () => null, config: ownerConfig })).rejects.toMatchObject({
      statusCode: 401,
    })
    await expect(
      requireHealthOwner(request, {
        readSession: async () => ({ id: 'someone-else', email: 'other@example.com' }),
        config: ownerConfig,
      }),
    ).rejects.toBeInstanceOf(HttpError)
    await expect(
      requireHealthOwner(request, {
        readSession: async () => ({ id: 'someone-else', email: 'other@example.com' }),
        config: ownerConfig,
      }),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})
