import { describe, expect, it } from 'vitest'
import {
  labExperimentHandoffLabel,
  labExperimentHandoffPath,
  readLabExperimentHandoff,
} from '../src/domain/lab-handoff.js'

describe('I9 Personal Lab handoff', () => {
  it('carries deterministic title and rationale into the new-experiment form', () => {
    const path = labExperimentHandoffPath({
      title: 'Review training progression',
      rationale: 'A deterministic Coach opportunity is available for owner review.',
      source: 'coach',
    })
    const query = path.slice(path.indexOf('?') + 1)
    const parsed = readLabExperimentHandoff(new URLSearchParams(query))
    expect(path.startsWith('/lab/experiments/new?')).toBe(true)
    expect(parsed).toEqual({
      title: 'Review training progression',
      rationale: 'A deterministic Coach opportunity is available for owner review.',
      source: 'coach',
    })
    expect(labExperimentHandoffLabel(parsed!.source)).toBe('Coach recommendation')
  })

  it('rejects arbitrary query strings that did not come from a supported handoff source', () => {
    expect(readLabExperimentHandoff(new URLSearchParams('title=Injected&from=other'))).toBeNull()
  })

  it('bounds prefilled fields to the Personal Lab write limits', () => {
    const path = labExperimentHandoffPath({
      title: 't'.repeat(250),
      rationale: 'r'.repeat(4500),
      source: 'weekly_coach',
    })
    const parsed = readLabExperimentHandoff(new URLSearchParams(path.split('?')[1]))
    expect(parsed?.title).toHaveLength(200)
    expect(parsed?.rationale).toHaveLength(4000)
  })
})
