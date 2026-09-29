import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES, LATEST_SCHEMA_MIGRATION, backupTable, tablesForProfile } from '../server/backup/inventory.ts'

describe('Coach backup inventory', () => {
  it('advances the schema head and keeps Coach history portable', () => {
    expect(LATEST_SCHEMA_MIGRATION).toBe('0035_coach_tasks.sql')
    const tasks = backupTable('coach_tasks')
    const events = backupTable('coach_task_events')
    expect(tasks?.portable).toBe(true)
    expect(events?.portable).toBe(true)
    expect(tasks?.references).toContainEqual({ column: 'goal_id', table: 'goals' })
    expect(events?.references).toContainEqual({ column: 'task_id', table: 'coach_tasks' })
    expect(tasks?.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['period_fingerprint', 'verification_mode', 'difficulty', 'reward_band', 'metadata']),
    )
    expect(events?.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['event_kind', 'evidence_kind', 'source_type', 'source_id', 'evidence', 'idempotency_key']),
    )
    const portable = tablesForProfile('portable').map((table) => table.name)
    expect(portable.indexOf('coach_tasks')).toBeGreaterThan(portable.indexOf('goals'))
    expect(portable.indexOf('coach_task_events')).toBeGreaterThan(portable.indexOf('coach_tasks'))
    expect(BACKUP_TABLES.map((table) => table.name)).toContain('coach_task_events')
  })
})
