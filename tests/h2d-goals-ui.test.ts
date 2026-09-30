import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('H2D Goal UI contract', () => {
  it('exposes all new Training Goal kinds with friendly controls', () => {
    const source = readFileSync('src/features/goals/GoalsPages.tsx', 'utf8')
    for (const label of ['Training reps', 'Training duration', 'Training distance', 'Training pace', 'Training skill']) {
      expect(source).toContain(label)
    }
    expect(source).toContain('Target duration')
    expect(source).toContain('Minimum continuous distance (mi)')
    expect(source).toContain('Target pace per mile')
    expect(source).toContain('Skill target stays fixed')
    expect(source).toContain('Open source workout')
  })

  it('keeps pace selector identity fixed during target revision', () => {
    const source = readFileSync('src/features/goals/GoalsPages.tsx', 'utf8')
    expect(source).toContain('Minimum continuous distance stays')
    const api = readFileSync('src/features/goals/api.ts', 'utf8')
    expect(api).not.toMatch(/reviseGoal[\s\S]{0,800}trainingMinDistanceM/)
  })
})
