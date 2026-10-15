import { describe, expect, it } from 'vitest'
import { PIQ_GOLDEN_CASES } from './fixtures/piq/golden-cases.ts'

/** Registry-integrity tests, NOT a claim that Health's responses pass these cases.
 * Do not mark PIQ-0 complete until executable evidence fixtures and response checks exist.
 */
describe('PIQ-0 golden evaluation registry integrity', () => {
  it('has unique stable case references to the master plan', () => {
    const ids = PIQ_GOLDEN_CASES.map((entry) => entry.id)
    expect(ids).toHaveLength(new Set(ids).size)
    expect(ids.every((id) => /^T\\d{2}$/.test(id))).toBe(true)
  })

  it('tracks the user-critical baseline questions and safety cases', () => {
    const ids = new Set(PIQ_GOLDEN_CASES.map((entry) => entry.id))
    for (const id of ['T01', 'T02', 'T03', 'T05', 'T07', 'T08', 'T10', 'T12', 'T14', 'T20', 'T21', 'T25', 'T27', 'T36', 'T45', 'T50']) {
      expect(ids.has(id), `Missing golden evaluation case ${id}`).toBe(true)
    }
  })

  it('has testable retrieval and grounded outcome requirements, with no false passes', () => {
    for (const scenario of PIQ_GOLDEN_CASES) {
      expect(scenario.status).toBe('specified_only')
      expect(scenario.question.trim().length).toBeGreaterThan(10)
      expect(scenario.requiredDomains.length).toBeGreaterThan(0)
      expect(scenario.must.length).toBeGreaterThan(0)
      expect(scenario.mustNot.length).toBeGreaterThan(0)
      expect(scenario.surface.trim()).not.toBe('')
      for (const clause of [...scenario.must, ...scenario.mustNot]) {
        expect(clause.trim().length).toBeGreaterThan(8)
      }
    }
  })
})
