import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES, LATEST_SCHEMA_MIGRATION, backupTable, tablesForProfile } from '../server/backup/inventory.ts'
import { buildBackupArchive, restoreStatements, verifyBackupArchive, type BackupRow } from '../server/backup/format.ts'

describe('Coach backup inventory', () => {
  it('advances the schema head and keeps Coach history portable', () => {
    expect(LATEST_SCHEMA_MIGRATION).toBe('0036_stretch_quests.sql')
    const tasks = backupTable('coach_tasks')
    const events = backupTable('coach_task_events')
    expect(tasks?.portable).toBe(true)
    expect(events?.portable).toBe(true)
    expect(tasks?.references).toContainEqual({ column: 'goal_id', table: 'goals' })
    expect(events?.references).toContainEqual({ column: 'task_id', table: 'coach_tasks' })
    expect(tasks?.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['period_fingerprint', 'verification_mode', 'difficulty', 'reward_band', 'accepted_at', 'metadata']),
    )
    expect(events?.columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(['event_kind', 'evidence_kind', 'source_type', 'source_id', 'evidence', 'idempotency_key']),
    )
    const portable = tablesForProfile('portable').map((table) => table.name)
    expect(portable.indexOf('coach_tasks')).toBeGreaterThan(portable.indexOf('goals'))
    expect(portable.indexOf('coach_task_events')).toBeGreaterThan(portable.indexOf('coach_tasks'))
    expect(BACKUP_TABLES.map((table) => table.name)).toContain('coach_task_events')
  })

  it.each(['full', 'portable'] as const)('round-trips Stretch lifecycle, frozen metadata and exact provenance in %s archives', (profile) => {
    const instant = '2026-09-29T19:00:00.000Z'
    const statuses = ['offered', 'active', 'completed', 'passed', 'failed', 'expired']
    const tasks: BackupRow[] = statuses.map((status, index) => ({
      id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
      task_kind: 'stretch_quest', rule_key: 'stretch:reps:exercise', rule_version: '1', domain: 'training',
      title: 'Push-ups', detail: 'Canonical working-set reps', starts_on: '2026-09-29', expires_on: '2026-10-05',
      period_fingerprint: `stretch:${index}`, goal_id: null, verification_mode: 'canonical', action_kind: 'open',
      action_href: '/training', target_value: '45', target_unit: 'reps', baseline_value: '42',
      difficulty: 'stretch', reward_band: 'stretch', status,
      accepted_at: ['active', 'completed', 'failed'].includes(status) ? instant : null,
      completed_at: status === 'completed' ? instant : null,
      closed_at: ['completed', 'passed', 'failed', 'expired'].includes(status) ? instant : null,
      metadata: JSON.stringify({ stretch: { strategy: 'reps', baseline: { sessionId: 'source-session', setId: 'source-set', value: 42 }, offerExpiresOn: '2026-10-01' } }),
      created_at: instant, updated_at: instant,
    }))
    const events: BackupRow[] = tasks.map((task, index) => ({
      id: `${String(index + 11).padStart(8, '0')}-1111-4111-8111-111111111111`, task_id: task.id,
      event_kind: task.status === 'active' ? 'accepted' : task.status,
      occurred_at: instant, evidence_kind: task.status === 'completed' ? 'training_session' : 'none',
      source_type: task.status === 'completed' ? 'workout_set' : null,
      source_id: task.status === 'completed' ? 'completion-set' : null,
      evidence: JSON.stringify(task.status === 'completed' ? { sessionId: 'completion-session', sessionExerciseId: 'completion-exercise', setId: 'completion-set', reps: 45, target: 45 } : {}),
      idempotency_key: String(task.status), created_at: instant,
    }))
    const archive = buildBackupArchive({ profile, rowsByTable: { coach_tasks: tasks, coach_task_events: events }, createdAt: instant, schemaMigration: LATEST_SCHEMA_MIGRATION, appVersionOrCommit: 'test' })
    const verified = verifyBackupArchive(archive)
    expect(verified.errors).toEqual([])
    expect(verified.tables.coach_tasks).toEqual(tasks)
    expect(verified.tables.coach_task_events).toEqual(events)
    const restored = restoreStatements(verified.tables)
    const insert = restored.find((statement) => statement.text.startsWith('INSERT INTO coach_tasks '))
    expect(insert?.text).toContain('accepted_at')
    expect(restored.some((statement) => statement.text.startsWith('INSERT INTO coach_task_events '))).toBe(true)
  })
})
