import { describe, expect, it } from 'vitest'
import { buildBackupArchive, verifyBackupArchive, type BackupRow } from '../server/backup/format.ts'
import { LATEST_SCHEMA_MIGRATION, tablesForProfile } from '../server/backup/inventory.ts'

const INSTANT = '2026-10-06T23:50:00.000Z'
const PLAN = '11111111-1111-4111-8111-111111111111'

describe('I1 profile and plan backup', () => {
  it('includes canonical profile and Training Plan tables in portable backup', () => {
    const names = tablesForProfile('portable').map((table) => table.name)
    expect(names).toEqual(expect.arrayContaining([
      'health_profile',
      'training_plan_versions',
      'training_plan_sequence_items',
      'training_plan_preferred_weekdays',
      'training_plan_day_overrides',
    ]))
  })

  it('round-trips owner profile and versioned plan state', () => {
    const rowsByTable: Record<string, BackupRow[]> = {
      health_profile: [{
        singleton_id: '1',
        date_of_birth: '1995-10-07',
        height_cm: '177.8',
        persistent_health_context: 'Owner reported context',
        training_limitations: null,
        dietary_context: null,
        body_measurement_protocol: null,
        clinical_conditions: JSON.stringify([{ name: 'Seasonal asthma', status: 'active' }]),
        clinical_allergies: JSON.stringify([{ substance: 'Penicillin', reaction: 'Hives', severity: 'moderate' }]),
        clinical_medications: JSON.stringify([{ name: 'Example medicine', dose: '10 mg', frequency: 'daily', status: 'active' }]),
        created_at: INSTANT,
        updated_at: INSTANT,
      }],
      training_plan_versions: [{
        id: PLAN,
        version: '1',
        effective_from: '2026-10-06',
        weekly_frequency_target: '3',
        sequence_start_routine_code: 'A',
        sequence_start_position: '1',
        default_non_training_intent: 'rest',
        note: null,
        is_current: true,
        created_at: INSTANT,
      }],
      training_plan_sequence_items: [{
        plan_version_id: PLAN,
        position: '1',
        routine_code: 'A',
        created_at: INSTANT,
      }],
      training_plan_preferred_weekdays: [{
        plan_version_id: PLAN,
        weekday: '1',
        created_at: INSTANT,
      }],
      training_plan_day_overrides: [],
    }
    const archive = buildBackupArchive({
      profile: 'portable',
      createdAt: INSTANT,
      schemaMigration: LATEST_SCHEMA_MIGRATION,
      appVersionOrCommit: 'i1-test',
      rowsByTable,
    })
    const verified = verifyBackupArchive(archive)
    expect(verified.errors).toEqual([])
    expect(verified.tables.health_profile).toEqual(rowsByTable.health_profile)
    expect(verified.tables.training_plan_versions).toEqual(rowsByTable.training_plan_versions)
  })
})
