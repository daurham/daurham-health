import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Training rotation owner decisions', () => {
  const migration = readFileSync('migrations/0051_training_rotation_anchors.sql', 'utf8')
  const service = readFileSync('server/training/plan-service.ts', 'utf8')
  const inventory = readFileSync('server/backup/inventory.ts', 'utf8')

  it('stores confirmed historical anchors and early endings without mutating workout records', () => {
    expect(migration).toContain('CREATE TABLE training_plan_rotation_anchors')
    expect(migration).toContain('CREATE TABLE training_plan_block_ends')
    expect(migration).toContain('UNIQUE (plan_version_id, routine_code, generation)')
    expect(migration).not.toContain('DELETE FROM workout_sessions')
    expect(migration).not.toContain('UPDATE workout_sessions')
    expect(inventory).toContain("LATEST_SCHEMA_MIGRATION = '0051_training_rotation_anchors.sql'")
    expect(inventory).toContain("name: 'training_plan_rotation_anchors'")
    expect(inventory).toContain("name: 'training_plan_block_ends'")
  })

  it('replays performed evidence from the confirmed anchor and preserves versioned closures', () => {
    expect(service).toContain('buildTrainingRoutineCredits(')
    expect(service).toContain('loadRotationEnds(plan.id, asOf)')
    expect(service).toContain('ON CONFLICT (plan_version_id, routine_code, generation) DO NOTHING')
  })
})
