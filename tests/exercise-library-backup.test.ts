import { describe, expect, it } from 'vitest'
import {
  buildBackupArchive,
  restoreStatements,
  verifyBackupArchive,
  type BackupRow,
} from '../server/backup/format.ts'
import {
  LATEST_SCHEMA_MIGRATION,
  backupTable,
  tablesForProfile,
} from '../server/backup/inventory.ts'

const INSTANT = '2026-09-30T23:30:00.000Z'
const EXERCISE_ID = '11111111-1111-4111-8111-111111111111'

describe('H5 Exercise Library backup', () => {
  const exercise: BackupRow = {
    id: EXERCISE_ID,
    external_id: 'EX02',
    name: 'Barbell Bench Press',
    measurement_kind: 'reps',
    load_type: 'barbell',
    unilateral: false,
    metadata: JSON.stringify({
      primary_muscle_group: 'chest',
      movement_pattern: 'horizontal_push',
      aliases: ['bench'],
    }),
    is_active: false,
    created_at: INSTANT,
    updated_at: INSTANT,
    performance_type: 'loaded_reps',
    analytics_load_type: 'external',
    analytics_rep_mode: 'standard',
    gif_url: 'https://example.com/bench.gif',
    youtube_url: 'https://youtube.com/watch?v=example',
    form_instructions: 'Setup, move, and cues.',
    notes: 'Bench notch 3.',
  }

  it('includes the H5 presentation fields in canonical portable exercise authority', () => {
    const table = backupTable('exercise_definitions')
    expect(table).toMatchObject({ seeded: true, portable: true, backupClass: 'canonical' })
    expect(table?.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'gif_url',
      'youtube_url',
      'form_instructions',
      'notes',
      'is_active',
    ]))
    expect(tablesForProfile('portable').map((table) => table.name)).toContain('exercise_definitions')
  })

  it.each(['full', 'portable'] as const)('round-trips media, form, notes, metadata and archive state through %s backup', (profile) => {
    const archive = buildBackupArchive({
      profile,
      createdAt: INSTANT,
      schemaMigration: LATEST_SCHEMA_MIGRATION,
      appVersionOrCommit: 'h5-test',
      rowsByTable: { exercise_definitions: [exercise] },
    })
    const verified = verifyBackupArchive(archive)
    expect(verified.errors).toEqual([])
    expect(verified.tables.exercise_definitions).toEqual([exercise])
  })

  it('restores H5 fields on seeded exercise replacement', () => {
    const archive = buildBackupArchive({
      profile: 'full',
      createdAt: INSTANT,
      schemaMigration: LATEST_SCHEMA_MIGRATION,
      appVersionOrCommit: 'h5-test',
      rowsByTable: { exercise_definitions: [exercise] },
    })
    const verified = verifyBackupArchive(archive)
    const statements = restoreStatements(verified.tables)
    expect(statements.some((statement) => statement.text === 'DELETE FROM exercise_definitions')).toBe(true)
    const insert = statements.find((statement) => statement.text.startsWith('INSERT INTO exercise_definitions '))
    expect(insert?.text).toContain('gif_url')
    expect(insert?.text).toContain('youtube_url')
    expect(insert?.text).toContain('form_instructions')
    expect(insert?.text).toContain('notes')
    expect(insert?.text).toContain('is_active')
    expect(insert?.params).toEqual(expect.arrayContaining([
      'https://example.com/bench.gif',
      'https://youtube.com/watch?v=example',
      'Setup, move, and cues.',
      'Bench notch 3.',
      false,
    ]))
  })
})
