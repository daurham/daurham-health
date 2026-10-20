import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ATOMIC_LABEL_INITIAL_COMMIT_SQL, ATOMIC_LABEL_PANTRY_TO_LOG_SQL } from '../server/nutrition/label-atomic.ts'

describe('PIQ-8 first-time Nutrition Label transactional save', () => {
  it('accepts only completed label captures and a single first-writer claimant', () => {
    const sql=ATOMIC_LABEL_INITIAL_COMMIT_SQL
    expect(sql).toContain("job.capture_kind = 'nutrition_label'")
    expect(sql).toContain("job.status = 'completed'")
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain("NOT (job.interpretation ? 'ownerDeletedEntryId')")
    expect(sql).toContain('ON CONFLICT (source_id, external_fingerprint) DO NOTHING')
    expect(sql).toContain('created_food AS (')
    expect(sql).toContain('updated_food AS (')
    expect(sql).toContain('approved_food AS (')
    expect(sql).toContain('created_entry AS (')
    expect(sql).toContain('finalized_capture AS (')
    expect(sql).toContain('FROM approved_food')
    expect(sql).toContain('EXISTS (SELECT 1 FROM claimed_link)')
  })

  it('never finalizes a daily log without a durable entry', () => {
    expect(ATOMIC_LABEL_INITIAL_COMMIT_SQL)
      .toContain('(NOT $3::boolean OR EXISTS (SELECT 1 FROM created_entry))')
    expect(ATOMIC_LABEL_INITIAL_COMMIT_SQL).toContain('entry.food_id = approved_food.id')
    expect(ATOMIC_LABEL_INITIAL_COMMIT_SQL).toContain('SELECT food_id, entry_id FROM finalized_capture')
  })

  it('routes all photographed initial food actions through one transaction', () => {
    const source=readFileSync('server/nutrition/label.ts', 'utf8')
    const first=source.indexOf('async function commitInitialLabelCaptureAtomic(')
    const sql=source.indexOf('sql.query(ATOMIC_LABEL_INITIAL_COMMIT_SQL')
    const call=source.indexOf('return await commitInitialLabelCaptureAtomic({')
    const old=source.indexOf("let food: NutritionFood | null = null",call)
    expect(first).toBeGreaterThan(-1)
    expect(sql).toBeGreaterThan(first)
    expect(call).toBeGreaterThan(sql)
    expect(old).toBeGreaterThan(call)
    expect(source).toContain("action: plan.type")
    expect(source).toContain("existingFoodId: plan.type === 'create' ? null : plan.foodId")
    expect(source).toContain("const fingerprint = nutritionLabelJobFingerprint(jobId) + (shouldLog ? '' : ':pantry')")
  })

  it('keeps committed Pantry -> Log as a separate atomic transition', () => {
    const source=readFileSync('server/nutrition/label.ts','utf8')
    expect(source).toContain('atomicPantryToLog: true')
    expect(source).toContain('sql.query(ATOMIC_LABEL_PANTRY_TO_LOG_SQL')
    expect(ATOMIC_LABEL_PANTRY_TO_LOG_SQL).toContain("status = 'committed'")
    expect(ATOMIC_LABEL_INITIAL_COMMIT_SQL).toContain("job.status = 'completed'")
  })
})
