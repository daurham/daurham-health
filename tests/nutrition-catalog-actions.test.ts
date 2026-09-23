import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { commitNutritionLabelRequestSchema, snapshotFromDefinition } from '../src/domain/nutrition/index.ts'
import { addToDateLabel, catalogActionHelp } from '../src/features/nutrition/catalog-actions.ts'

describe('nutrition reusable food actions', () => {
  it('labels Add to Today only on the current Health date', () => {
    expect(addToDateLabel('2026-09-22', '2026-09-22')).toBe('Add to Today')
    expect(addToDateLabel('2026-09-20', '2026-09-22')).toBe('Add to Sep 20')
    expect(catalogActionHelp('2026-09-22', '2026-09-22')).toContain('without logging it')
    expect(catalogActionHelp('2026-09-20', '2026-09-22')).toContain('Add to Sep 20')
    expect(catalogActionHelp('2026-09-20', '2026-09-22')).not.toContain('Add to Today')
  })

  it('lets label commit save a food without creating an entry', () => {
    const parsed = commitNutritionLabelRequestSchema.parse({
      productName: 'Yogurt',
      servingQuantity: 1,
      servingUnit: 'serving',
      calories: 120,
      basis: 'per_serving',
      logDate: '2026-09-20',
      log: false,
    })
    expect(parsed.log).toBe(false)
    expect(parsed.logDate).toBe('2026-09-20')
    const label = readFileSync('server/nutrition/label.ts', 'utf8')
    expect(label).toContain('const shouldLog = input.log !== false')
    expect(label).toContain('return { food, entry: null }')
    expect(label).toContain('findCommittedLabelFood')
    expect(readFileSync('server/nutrition/label-jobs.ts', 'utf8')).toContain('entryId: string | null')
  })

  it('keeps historical snapshots independent of later food-definition edits', () => {
    const original = snapshotFromDefinition(
      { calories: 160, protein: 12, carbs: 22, fat: 4, fiber: 2, servingGrams: 30 },
      { quantity: 1 },
    )
    const laterDefinition = snapshotFromDefinition(
      { calories: 200, protein: 20, carbs: 22, fat: 4, fiber: 2, servingGrams: 30 },
      { quantity: 1 },
    )
    expect(original.calories).toBe(160)
    expect(laterDefinition.calories).toBe(200)
    expect(readFileSync('src/features/nutrition/panels.tsx', 'utf8')).toContain(
      'Future logs use this definition. Previous entries stay as recorded.',
    )
  })

  it('uses Save for later and Add to date on reusable-food flows only', () => {
    const panels = readFileSync('src/features/nutrition/panels.tsx', 'utf8')
    const label = readFileSync('src/features/nutrition/LabelCapture.tsx', 'utf8')
    const footer = readFileSync('src/features/nutrition/CatalogCommitFooter.tsx', 'utf8')
    expect(footer).toContain('Save for later')
    expect(footer).toContain('addToDateLabel')
    expect(panels).toContain('CatalogCommitFooter')
    expect(panels).toContain('onSaveForLater')
    expect(panels).toContain('log,')
    expect(panels).not.toContain('Save & Log')
    expect(label).toContain('CatalogCommitFooter')
    expect(label).not.toContain('Save & Log')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).not.toContain('Save for later')
    expect(readFileSync('src/features/nutrition/DescribeFood.tsx', 'utf8')).not.toContain('Save for later')
  })
})
