import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { RECORD_CAPTURE_COMMITTED_SQL } from '../server/nutrition/label-jobs.ts'

describe('PIQ-8 Nutrition Label capture provenance and retry safety', () => {
  it('requires a label capture before a label commit may write a food or entry', () => {
    const service = readFileSync('server/nutrition/label.ts', 'utf8')
    const commit = service.split('export async function commitNutritionLabel(')[1]
      ?.split('async function createLabelEntry(')[0]
    expect(commit).toBeDefined()
    const kindCheck = commit!.indexOf('capture.captureKind !== NUTRITION_LABEL_CAPTURE_KIND')
    const firstFoodWrite = commit!.indexOf("const barcode = input.barcode")
    expect(kindCheck).toBeGreaterThan(-1)
    expect(kindCheck).toBeLessThan(firstFoodWrite)
    expect(commit).toContain("throw new HttpError(404, labelFailureMessage('JOB_NOT_FOUND')")
  })

  it('refuses a different capture kind before Home-AI or Gemini label detail reads', () => {
    const service = readFileSync('server/nutrition/label.ts', 'utf8')
    const detail = service.split('export async function getNutritionLabelJob(')[1]
      ?.split('async function labelResponseFromRecord(')[0]
    expect(detail).toBeDefined()
    const kindCheck = detail!.indexOf('stored.captureKind !== NUTRITION_LABEL_CAPTURE_KIND')
    const providerRead = detail!.indexOf('homeAi.getNutritionLabelJob(jobId)')
    const geminiRead = detail!.indexOf('advanceGeminiCapture(stored)')
    expect(kindCheck).toBeGreaterThan(-1)
    expect(kindCheck).toBeLessThan(providerRead)
    expect(kindCheck).toBeLessThan(geminiRead)
  })

  it('preserves Pantry-to-Log while forbidding cross-kind and changed final associations', () => {
    expect(RECORD_CAPTURE_COMMITTED_SQL).toContain("AND capture_kind = 'nutrition_label'")
    expect(RECORD_CAPTURE_COMMITTED_SQL).toContain("food_id IS NOT DISTINCT FROM $2::uuid")
    expect(RECORD_CAPTURE_COMMITTED_SQL).toContain("entry_id IS NULL OR entry_id IS NOT DISTINCT FROM $3::uuid")
    expect(RECORD_CAPTURE_COMMITTED_SQL).not.toContain("OR status <> 'committed'")
  })
})
