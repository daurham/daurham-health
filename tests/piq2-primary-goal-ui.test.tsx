import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PrimaryGoalPanel } from '../src/features/goals/PrimaryGoalPanel.tsx'

describe('PIQ-2.3 Goals primary-intent UI', () => {
  it('is unselected and non-mutating until the owner explicitly saves a choice', () => {
    const html = renderToStaticMarkup(<PrimaryGoalPanel goals={[]} />)
    expect(html).toContain('Primary goal')
    expect(html).toContain('No primary goal selected')
    expect(html).toContain('does not yet change Coach advice or targets')
    expect(html).toMatch(/disabled=""[^>]*>Save priority/)
  })

  it('keeps priority selection independent from targets and explicitly handles the saved revision', () => {
    const source = readFileSync('src/features/goals/PrimaryGoalPanel.tsx', 'utf8')
    expect(source).toContain('expectedVersion: saved.version')
    expect(source).toContain('primaryGoalId: choice || null')
    expect(source).toContain("setChoice(next.primaryGoalId ?? '')")
    expect(source).not.toContain('reviseGoal(')
  })
})
