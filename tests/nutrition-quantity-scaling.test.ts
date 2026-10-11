import { describe, expect, it } from 'vitest'
import { scaleEditableNutrients } from '../src/features/nutrition/quantity-scaling.ts'
import { snapshotFromDefinition } from '../src/domain/nutrition/servings.ts'
import { readFileSync } from 'node:fs'

describe('nutrition quantity-sensitive previews and editable log snapshots', () => {
  it('scales all six nutrients including fiber/sodium in the add-food preview', () => {
    const food = { calories: 180, protein: 16, carbs: 21, fat: 4.5, fiber: 3.8, sodium: 220, servingGrams: 120 }
    const preview = snapshotFromDefinition(food, { quantity: 2.5 })
    expect(preview).toMatchObject({
      calories: 450, protein: 40, carbs: 52.5, fat: 11.25, fiber: 9.5, sodium: 550, grams: 300,
    })
    const panelSource = readFileSync('src/features/nutrition/panels.tsx', 'utf8')
    expect(panelSource).toContain('sodium: food.sodium')
    expect(panelSource).toContain('entry.grams * quantity / entry.servingQuantity')
    expect(panelSource).toContain('<ScaledPreview preview={preview} />')
  })

  it('updates manually edited logged nutrient values when increasing or decreasing quantity', () => {
    const draft = { calories: '100', protein: '8', carbs: '12', fat: '3', fiber: '1.2', sodium: '75' }
    const double = scaleEditableNutrients(draft, 1, 2)
    expect(double).toEqual({ calories: '200', protein: '16', carbs: '24', fat: '6', fiber: '2.4', sodium: '150' })
    expect(scaleEditableNutrients(double, 2, 0.5)).toEqual({
      calories: '50', protein: '4', carbs: '6', fat: '1.5', fiber: '0.6', sodium: '37.5',
    })
  })

  it('preserves unknown nutrients, decimals and existing overrides', () => {
    const a = { calories: '125', protein: '12.5', carbs: '9.2', fat: '3.2', fiber: '', sodium: '' }
    const b = scaleEditableNutrients(a, 1, 0.15)
    expect(b).toEqual({ calories: '18.75', protein: '1.875', carbs: '1.38', fat: '0.48', fiber: '', sodium: '' })
    expect(scaleEditableNutrients(b, 0.15, 1)).toEqual(a)
    expect(scaleEditableNutrients(a, 1, 0)).toEqual(a)
  })
})
