import { describe, expect, it } from 'vitest'
import { validateWeeklyCoachModel, type WeeklyCoachBrief } from '../src/domain/weekly-coach/index.js'

const brief: WeeklyCoachBrief = {
  packetVersion: 'weekly-coach-evidence-v1',
  asOf: '2026-10-06',
  period: { start: '2026-09-29', end: '2026-10-05' },
  previousPeriod: { start: '2026-09-22', end: '2026-09-28' },
  state: 'deterministic',
  canGenerate: true,
  coverage: {
    activity: true,
    sleep: true,
    nutrition: true,
    training: true,
    supplements: true,
    body: true,
    substantiveDomains: ['activity', 'sleep', 'nutrition', 'training'],
  },
  facts: [],
  wentWell: [],
  worthWatching: [],
  focus: null,
  candidates: [],
}

describe('I9 weekly deep review', () => {
  it('accepts cautious competing explanations and evidence-improvement guidance', () => {
    const result = validateWeeklyCoachModel(JSON.stringify({
      intro: { text: '' },
      went_well: [],
      worth_watching: [],
      focus: null,
      deep_review: {
        summary: 'The current pattern is worth watching, but the available context does not establish a single cause.',
        competing_explanations: ['Recent recovery context could contribute.', 'Normal short-window variation could also fit the evidence.'],
        what_would_improve: ['More comparable observations under the usual routine.', 'A brief recovery check-in during the same window.'],
        experiment_idea: { title: 'Compare a stable training block', why: 'A controlled Personal Lab window could reduce routine-related ambiguity.' },
      },
    }), brief)
    expect(result?.deepReview?.competingExplanations).toHaveLength(2)
    expect(result?.deepReview?.experimentIdea?.title).toContain('stable training')
  })

  it('rejects hidden medical or target-changing advice in the deep review', () => {
    const result = validateWeeklyCoachModel(JSON.stringify({
      intro: { text: '' },
      went_well: [],
      worth_watching: [],
      focus: null,
      deep_review: {
        summary: 'Decrease calories to fix the pattern.',
        competing_explanations: [],
        what_would_improve: [],
        experiment_idea: null,
      },
    }), brief)
    expect(result).toBeNull()
  })
})
