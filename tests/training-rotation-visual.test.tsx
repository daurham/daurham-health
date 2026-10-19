import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { deriveRoutineRotation } from '../src/domain/training-blocks.ts'
import type { TrainingPlanView } from '../src/domain/training-plan.ts'
import { TrainingRotationPreview } from '../src/features/training/TrainingRotationPreview.tsx'
import { HEALTH_PALETTES } from '../src/theme.ts'

const routines = [
  { routineCode: 'A', target: 6 },
  { routineCode: 'B', target: 6 },
  { routineCode: 'C', target: 6 },
]

function preview(state: ReturnType<typeof deriveRoutineRotation>) {
  const plan = {
    rotation: {
      source: 'confirmed', anchorDate: '2026-10-01',
      currentRoutineAtAnchor: 'B', completedAtAnchor: 5, state,
    },
    baseline: { sequence: [
      { routineCode: 'A', name: 'Chest, arms and an intentionally long routine name to wrap on mobile' },
      { routineCode: 'B', name: 'Legs and glutes' },
      { routineCode: 'C', name: 'Back and shoulders' },
    ] },
  } as TrainingPlanView
  return renderToStaticMarkup(<TrainingRotationPreview plan={plan} />)
}

describe('theme-rich responsive routine progress', () => {
  it('shows B current while preserving work ahead on C with distinct palette tones', () => {
    const state = deriveRoutineRotation(routines,
      { currentRoutineCode: 'B', alreadyCompletedInCurrent: 5 },
      [{ date: '2026-10-08', routineCode: 'C', evidenceId: 'C1' }])
    const html = preview(state)
    expect(html).toContain('Current')
    expect(html).toContain('Working ahead')
    expect(html).toContain('aria-valuenow="5"')
    expect(html).toContain('aria-valuenow="1"')
    expect(html).toContain('--routine-tone:var(--chart-ink)')
    expect(html).toContain('--routine-tone:var(--chart-secondary)')
    expect(html).toContain('--routine-tone:var(--chart-tertiary)')
    expect(html).toContain('break-words')
  })

  it('keeps the earlier B 6/6 completion visible when a second B block starts', () => {
    const state = deriveRoutineRotation(routines,
      { currentRoutineCode: 'B', alreadyCompletedInCurrent: 5 }, [
        { date: '2026-10-08', routineCode: 'C', evidenceId: 'C1' },
        { date: '2026-10-09', routineCode: 'B', evidenceId: 'B1' },
        { date: '2026-10-10', routineCode: 'B', evidenceId: 'B2' },
      ])
    const html = preview(state)
    expect(html).toContain('Block 2')
    expect(html).toContain('Previous block:')
    expect(html).toContain('6/6')
    expect(html).toContain('Working ahead')
  })

  it('flags conflicting historical decisions instead of hiding them in a colored bar', () => {
    const state = deriveRoutineRotation(routines,
      { currentRoutineCode: 'B', alreadyCompletedInCurrent: 5 },
      [{ date: '2026-10-07', routineCode: 'B', evidenceId: 'B1' }],
      [{ date: '2026-10-08', routineCode: 'B', generation: 1, kind: 'end_early' }])
    const html = preview(state)
    expect(html).toContain('historical rotation')
    expect(html).toContain('review in Training Plan')
    expect(html).toContain('role="status"')
  })

  it('covers every registered palette in light and dark without hardcoded routine colors', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const light = new Set([...css.matchAll(/html\[data-health-palette='([^']+)'\]/g)].map((hit) => hit[1]))
    const dark = new Set([...css.matchAll(/html\.dark\[data-health-palette='([^']+)'\]/g)].map((hit) => hit[1]))
    const registeredPalettes = new Set<string>(HEALTH_PALETTES)
    expect(light).toEqual(registeredPalettes)
    expect(dark).toEqual(registeredPalettes)
    const component = readFileSync('src/features/training/TrainingRotationPreview.tsx', 'utf8')
    expect(component).toContain('var(--chart-ink)')
    expect(component).toContain('var(--chart-secondary)')
    expect(component).toContain('var(--chart-tertiary)')
    expect(component).toContain('var(--health-surface)')
    expect(component).toContain('var(--health-border)')
  })

  it('keeps long routine names and add-routine controls within narrow phone widths', () => {
    const editor = readFileSync('src/features/training/TrainingPlanPage.tsx', 'utf8')
    expect(editor).toContain('sm:flex sm:items-center')
    expect(editor).toContain('min-w-0 flex-1 break-words')
    expect(editor).toContain('Move ' + '$' + '{label} up')
    expect(editor).toContain('aria-label="Choose a routine to add"')
    expect(editor).not.toContain('min-w-56')
  })
})
