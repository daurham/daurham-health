import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function source(path: string): string {
  return readFileSync(path, 'utf8')
}

describe('Add Food mobile sheet stability', () => {
  it('opens Add Food from Today and Nutrition and closes back to the same surface', () => {
    const today = source('src/features/today/TodayPage.tsx')
    const nutrition = source('src/features/nutrition/NutritionPage.tsx')
    expect(today).toContain('TodayAddFoodAction')
    expect(today).toContain('<AddFoodSheet')
    expect(today).toContain('onClose={closeSheet}')
    expect(today).toContain('setOpen(false)')
    expect(today).not.toContain("prefixedPath(prefix, '/nutrition')")
    expect(nutrition).toContain("setPanel({ kind: 'add' })")
    expect(nutrition).toContain('<AddFoodSheet')
    expect(nutrition).toContain('onClose={() => setPanel(null)}')
    expect(nutrition).toContain("params.get('action') !== 'add'")
    expect(nutrition).toContain("next.delete('action')")
  })

  it('locks the mobile Add Food sheet height so results scroll inside', () => {
    const sheet = source('src/features/nutrition/Sheet.tsx')
    const panels = source('src/features/nutrition/panels.tsx')
    expect(panels).toContain('mobileLayout="stable"')
    expect(panels).toContain('stickyHeader')
    expect(sheet).toContain("mobileLayout = 'hug'")
    expect(sheet).toContain("data-nutrition-sheet-layout={mobileLayout}")
    expect(sheet).toContain('max-md:h-[90%]')
    expect(sheet).toContain('max-md:max-h-[90%]')
    expect(sheet).toContain('items-end')
    expect(sheet).toContain('md:items-center')
    expect(sheet).toContain('md:max-h-[90dvh]')
    expect(sheet).toContain('min-h-0 flex-1 overflow-y-auto')
    expect(sheet).toContain('data-nutrition-sheet-body')
    expect(sheet).not.toContain('visualViewport')
    expect(sheet).not.toContain('addEventListener(\'resize\'')
    expect(sheet).not.toContain('scrollIntoView')
  })

  it('does not change Nutrition search or log semantics for this layout fix', () => {
    const panels = source('src/features/nutrition/panels.tsx')
    const html = source('index.html')
    expect(panels).toContain('searchNutritionFoods')
    expect(panels).toContain('rankFoodsForQuery')
    expect(panels).toContain('createNutritionEntry')
    expect(panels).toContain('CatalogCommitFooter')
    expect(panels).toContain('Imported legacy recipe')
    expect(panels).toContain('Manage or upgrade imported recipes')
    expect(panels).toContain("food.catalogKind === 'recipe' && food.sourceKind === 'migrated'")
    expect(source('src/features/nutrition/CatalogCommitFooter.tsx')).toContain('Save for later')
    expect(source('src/features/today/TodayPage.tsx')).toContain('servingQuantity: 1')
    expect(html).toContain('interactive-widget=resizes-content')
  })
})
