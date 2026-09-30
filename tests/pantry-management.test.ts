import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('H5 Pantry contract', () => {
  const page = readFileSync('src/features/nutrition/PantryPage.tsx', 'utf8')
  const service = readFileSync('server/nutrition/service.ts', 'utf8')
  const queries = readFileSync('server/nutrition/queries.ts', 'utf8')
  const handler = readFileSync('server/handlers/nutrition-foods.ts', 'utf8')
  const nutrition = readFileSync('src/features/nutrition/NutritionPage.tsx', 'utf8')

  it('uses the existing nutrition_foods authority and exposes Pantry management', () => {
    expect(page).toContain('Manage reusable foods')
    expect(handler).toContain("management') === 'true'")
    expect(service).toContain('listNutritionPantry')
    expect(queries).toContain('FROM nutrition_foods')
    expect(queries).toContain("catalog_kind <> 'recipe'")
    expect(nutrition).toContain('to="/nutrition/pantry"')
  })

  it('derives usage rather than storing counters', () => {
    expect(queries).toContain('count(*) FROM nutrition_entries')
    expect(queries).toContain('max(entries.log_date)')
    expect(queries).toContain('recipe_version_ingredients')
    expect(page).toContain('Most used')
    expect(page).toContain('Recently used')
  })

  it('archives/restores without hard deleting and warns about possible duplicates', () => {
    expect(page).toContain('{ archived }')
    expect(page).toContain('{ archived: false }')
    expect(page).not.toContain("method: 'DELETE'")
    expect(page).toContain('Possible duplicates')
    expect(page).toContain('never auto-merges')
  })
})
