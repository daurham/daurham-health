import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES, LATEST_SCHEMA_MIGRATION, backupTable, tablesForProfile } from '../server/backup/inventory.ts'
import { buildBackupArchive, restoreStatements, verifyBackupArchive, type BackupRow } from '../server/backup/format.ts'

describe('Coach backup inventory', () => {
  it('advances the schema head and keeps Coach history portable', () => {
    expect(LATEST_SCHEMA_MIGRATION).toBe('0038_training_measurements_goals_routines.sql')
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

  it('round-trips H2D canonical Training, Goal selector, and Saved Routine fields in a portable archive', () => {
    const instant = '2026-09-29T19:00:00.000Z'
    const rowsByTable: Record<string, BackupRow[]> = {
      workout_templates: [{
        id: '11111111-1111-4111-8111-111111111111',
        routine_code: 'owner:test', version: '2', name: 'Cardio', metadata: '{}',
        is_active: true, origin_kind: 'owner', created_at: instant, updated_at: instant,
      }],
      workout_sets: [{
        id: '22222222-2222-4222-8222-222222222222',
        workout_session_exercise_id: '33333333-3333-4333-8333-333333333333',
        set_number: 1, set_type: 'working', load_state: 'bodyweight', weight_kg: null,
        reps: null, duration_sec: 1200, left_reps: null, right_reps: null,
        left_duration_sec: null, right_duration_sec: null, distance_m: '3218.688',
        completed: null, notes: null, metadata: '{}', created_at: instant,
      }],
      goals: [{
        id: '44444444-4444-4444-8444-444444444444',
        goal_kind: 'training_pace', status: 'active', started_on: '2026-09-29',
        body_metric_key: null, exercise_definition_id: '55555555-5555-4555-8555-555555555555',
        benchmark_definition_id: null, benchmark_protocol_version_id: null,
        benchmark_requirement_id: null, supplement_id: null, training_min_distance_m: '3218.688',
        source_id: '66666666-6666-4666-8666-666666666666', paused_at: null,
        completed_at: null, archived_at: null, created_at: instant, updated_at: instant,
      }],
    }
    const archive = buildBackupArchive({
      profile: 'portable', rowsByTable, createdAt: instant,
      schemaMigration: LATEST_SCHEMA_MIGRATION, appVersionOrCommit: 'h2d-test',
    })
    const verified = verifyBackupArchive(archive)
    expect(verified.errors).toEqual([])
    expect(verified.tables.workout_sets?.[0]).toMatchObject({ distance_m: '3218.688', completed: null })
    expect(verified.tables.goals?.[0]).toMatchObject({ goal_kind: 'training_pace', training_min_distance_m: '3218.688' })
    expect(verified.tables.workout_templates?.[0]).toMatchObject({ origin_kind: 'owner', updated_at: instant })
    const restored = restoreStatements(verified.tables)
    expect(restored.find((statement) => statement.text.startsWith('INSERT INTO workout_sets '))?.text).toContain('distance_m')
    expect(restored.find((statement) => statement.text.startsWith('INSERT INTO goals '))?.text).toContain('training_min_distance_m')
    expect(restored.find((statement) => statement.text.startsWith('INSERT INTO workout_templates '))?.text).toContain('origin_kind')
  })

  it.each(['full', 'portable'] as const)('round-trips exact owner Lab snooze identities and timestamps in %s archives', (profile) => {
    const instant = '2026-09-29T19:00:00.123456Z'
    const rows: BackupRow[] = ['benchmark_retest', 'experiment_suggestion'].map((kind, index) => ({
      id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-111111111111`,
      item_kind: kind, source_key: `${kind}:source`, source_fingerprint: String(index + 1).repeat(64),
      snoozed_until: '2026-10-06', created_at: instant, updated_at: instant,
    }))
    expect(backupTable('coach_lab_snoozes')).toMatchObject({ portable: true, references: [] })
    const archive = buildBackupArchive({ profile, rowsByTable: { coach_lab_snoozes: rows }, createdAt: instant, schemaMigration: LATEST_SCHEMA_MIGRATION, appVersionOrCommit: 'test' })
    const verified = verifyBackupArchive(archive)
    expect(verified.errors).toEqual([])
    expect(verified.tables.coach_lab_snoozes).toEqual(rows)
    expect(restoreStatements(verified.tables).find((statement) => statement.text.startsWith('INSERT INTO coach_lab_snoozes '))?.text).toContain('source_fingerprint')
  })
})
