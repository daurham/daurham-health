import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ATOMIC_LABEL_PANTRY_TO_LOG_SQL } from '../server/nutrition/label-atomic.ts'

describe('PIQ-8 committed label Pantry -> Log atomicity', () => {
  it('requires a committed label, matching food and no owner deletion tombstone', () => {
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain("capture_kind = 'nutrition_label'")
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain("status = 'committed'")
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain('job.food_id = $2::uuid')
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain('job.entry_id IS NULL')
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain("NOT (job.interpretation ? 'ownerDeletedEntryId')")
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain('FOR UPDATE')
  })

  it('creates a claim, entry and capture entry association within one statement', () => {
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain('claimed_link AS (')
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain('created_entry AS (')
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain('finalized AS (')
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain('FROM claimed_link')
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain('FROM eligible_capture, created_entry')
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain('ON CONFLICT (source_id, external_fingerprint) DO NOTHING')
  })

  it('routes only committed Pantry-to-Log through the atomic statement, without removing the original first-save path', () => {
    const service = readFileSync('server/nutrition/label.ts', 'utf8')
    expect(service).toContain('createLabelEntry({ input, food, jobId, atomicPantryToLog: true })')
    expect(service).toContain('sql.query(ATOMIC_LABEL_PANTRY_TO_LOG_SQL')
    expect(service).toContain('current?.entryDeleted')
    expect(service).toContain('if (current?.foodId === food.id && current.entryId)')
    expect(service).toContain('recordLabelJobCommitted(jobId, food.id, null)')
  })
})
