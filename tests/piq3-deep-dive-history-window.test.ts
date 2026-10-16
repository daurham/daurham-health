import { describe, expect, it } from 'vitest'
import { deepDiveRangeHint } from '../src/domain/ask-health/context-range.js'
import type { ProgressRange } from '../src/domain/progress/types.js'

describe('PIQ-3 Deep Dive history-range disclosure', () => {
  it('does not add an all-history shortcut to non-Deep modes', () => {
    for (const mode of ['smart', 'personalized', 'general_only'] as const) {
      for (const range of ['30d', '90d', '6m', '1y', 'all'] as const) {
        expect(deepDiveRangeHint(mode, range)).toBeNull()
      }
    }
  })

  it('discloses every finite time-window limit before an owner submits a query', () => {
    const windows: Array<[ProgressRange, string]> = [
      ['30d', '30 days'], ['90d', '90 days'], ['6m', '6 months'], ['1y', '1 year'],
    ]
    for (const [range, period] of windows) {
      const hint = deepDiveRangeHint('deep', range)
      expect(hint).toMatchObject({ canExpand: true })
      expect(hint?.message).toContain(period)
      expect(hint?.message).toContain('Earlier saved history')
    }
  })

  it('the all-history choice is explicit but still respects the evidence limit', () => {
    const hint = deepDiveRangeHint('deep', 'all')
    expect(hint).toMatchObject({ canExpand: false })
    expect(hint?.message).toContain('All available recorded history selected')
    expect(hint?.message).toContain('bounded evidence packet')
    expect(hint?.message).not.toContain('entire database sent')
  })
})
