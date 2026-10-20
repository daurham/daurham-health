import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DELETE_ENTRY_SQL } from '../server/nutrition/queries.ts'

describe('PIQ-8 scanned-label food log deletion', () => {
  it('detaches the scanned capture FK and records a durable owner-deletion tombstone in one SQL statement', () => {
    expect(DELETE_ENTRY_SQL).toMatch(/WITH detached_capture AS \([\s\S]*UPDATE nutrition_capture_jobs/)
    expect(DELETE_ENTRY_SQL).toContain('entry_id = NULL')
    expect(DELETE_ENTRY_SQL).toContain("'{ownerDeletedEntryId}'")
    expect(DELETE_ENTRY_SQL).toContain('WHERE entry_id = $1::uuid')
    expect(DELETE_ENTRY_SQL).toContain('DELETE FROM nutrition_entries WHERE id = $1::uuid')
    expect(DELETE_ENTRY_SQL).toContain('SELECT id FROM deleted_entry')
  })

  it('preserves Pantry food but blocks replay of a deleted label log', () => {
    const label = readFileSync('server/nutrition/label.ts', 'utf8')
    const food = label.split('export async function commitNutritionLabel(')[1]
      ?.split('async function createLabelEntry(')[0]
    expect(food).toBeDefined()
    expect(food).toContain('shouldLog && committed.entryDeleted')
    expect(food).toContain('CAPTURE_ENTRY_DELETED')
    expect(food).toContain("else if (!shouldLog && food)")
    const entry = label.split('async function createLabelEntry(')[1]
    expect(entry).toContain("const raced = await findEntryByFingerprint(jobId)")
    expect(entry).toContain('A prior source claim without a surviving entry')
    const job = readFileSync('server/nutrition/label-jobs.ts', 'utf8')
    expect(job).toContain("(interpretation ? 'ownerDeletedEntryId') AS entry_deleted")
  })

  it('continues to use the confirmed server delete before optimistic undo/reconciliation', () => {
    const service = readFileSync('server/nutrition/service.ts', 'utf8')
    expect(service).toContain('const deleted = await deleteEntry(id)')
    expect(service).toContain("throw new HttpError(404, 'Entry not found')")
    const ui = readFileSync('src/features/nutrition/NutritionPage.tsx', 'utf8')
    expect(ui).toContain('await deleteNutritionEntry(entry.id)')
    expect(ui).toContain('replaceEntries(previous)')
  })
})
