import { describe, expect, it, vi } from 'vitest'
import type { AskEvidence, AskHealthAnswer, AskHealthPacket } from '../src/domain/ask-health/types.js'
import {
  affirmativeOwnerMetricClaim, citationCoversHistoricalScope,
  groundHistoricalAnswer, temporalCitationScope,
} from '../src/domain/ask-health/temporal-citations.js'
import { explainAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'

const date = '2026-10-15'
const prior = '2026-10-06'
const todayEvidence: AskEvidence = {
  id: 'training.focus.set.recent', domain: 'training',
  label: 'Recent barbell bench press working set',
  value: 99, unit: 'kg estimated 1RM',
  text: 'Recent comparable working set.', period: { start: '2026-10-13', end: '2026-10-13' },
  coverage: { reps: 5 }, detailPath: '/progress/strength',
  userEntered: false, substantive: true,
  evidenceDates: ['2026-10-13'], provenance: 'derived_from_owner_logged_working_set',
}
const dated: AskEvidence = {
  ...todayEvidence, id: 'training.focus.set.older',
  period: { start: prior, end: prior },
  evidenceDates: [prior], value: 86,
}
const range: AskEvidence = {
  ...todayEvidence, id: 'training.sessions',
  label: 'Total selected-range sessions', evidenceDates: undefined,
  period: { start: '2026-09-01', end: date },
  coverage: { sessions: 9 }, value: 9,
}
const windowCoverage: AskEvidence = {
  ...todayEvidence, id: 'digestive.focus.coverage.hydration',
  label: 'Water coverage for prior week',
  period: { start: '2026-10-05', end: '2026-10-11' },
  evidenceDates: undefined, value: 2, unit: 'logged days',
  coverage: {
    requestedWindowStart: '2026-10-05',
    requestedWindowEnd: '2026-10-11',
    requestedWindowScope: 'in_range',
    observedDaysInWindow: 2,
    recordedWindowSum: 1800,
  },
}
const aDay: AskEvidence = {
  ...todayEvidence, id: 'digestive.focus.hydration.2026-10-06',
  domain: 'hydration', value: 800, unit: 'ml',
  period: { start: prior, end: prior }, evidenceDates: [prior],
}
const unobservedWindow: AskEvidence = {
  ...windowCoverage, id: 'digestive.focus.coverage.empty',
  coverage: { ...windowCoverage.coverage, observedDaysInWindow: 0, recordedWindowSum: null },
  substantive: false,
}
const item = (text: string, evidenceRefs: string[]): AskHealthAnswer['blocks'][number] => ({ text, evidenceRefs })
const answer = (blocks: AskHealthAnswer['blocks']): AskHealthAnswer => ({
  blocks, limitations: [], followUps: [],
})
const packet = (evidence: AskEvidence[]): AskHealthPacket => ({
  packetVersion: 'ask-health-evidence-v2', lens: 'training', range: '90d',
  rangeStart: '2026-09-01', rangeEnd: date, asOf: date,
  generatedAt: '2026-10-15T17:00:00.000Z',
  evidence, limitations: [], contextSummary: { knows: [], missing: [] },
  clarification: null,
})

describe('PIQ-3 historical citation period validator', () => {
  it('resolves exact day and calendar windows conservatively; leaves undated/ambiguous questions alone', () => {
    expect(temporalCitationScope('How much did I bench on 2026-10-06?', date))
      .toEqual({ start: prior, end: prior })
    expect(temporalCitationScope('How much did I record last week?', date))
      .toEqual({ start: '2026-10-05', end: '2026-10-11' })
    expect(temporalCitationScope('How is my training generally?', date)).toBeNull()
    expect(temporalCitationScope('What did I train yesterday?', date)).toBeNull()
    expect(temporalCitationScope('Compare 2026-10-06 with 2026-10-13', date)).toBeNull()
  })

  it('does not let latest-record or range-wide sources support an older day', () => {
    expect(citationCoversHistoricalScope(todayEvidence, { start: prior, end: prior })).toBe(false)
    expect(citationCoversHistoricalScope(range, { start: prior, end: prior })).toBe(false)
    expect(citationCoversHistoricalScope(dated, { start: prior, end: prior })).toBe(true)
    const question = 'How much did I bench on 2026-10-06?'
    const result = groundHistoricalAnswer(
      answer([item('You recorded 99 kg in your bench press.', [todayEvidence.id, range.id])]),
      packet([todayEvidence, range, dated]), question,
    )
    expect(result.blocks[0]?.text).toContain('cannot verify a personal measurement')
    expect(result.blocks[0]?.text).not.toContain('99 kg')
    expect(result.limitations[0]?.text).toContain('withheld')
  })

  it('retains appropriately cited historic measurements and general explanation', () => {
    const question = 'How much did I bench on 2026-10-06?'
    const good = answer([
      item('You recorded 86 kg estimated bench strength.', [dated.id]),
      item('Strength estimates from working sets are not measured maximum lifts.', []),
    ])
    const result = groundHistoricalAnswer(good, packet([dated, range]), question)
    expect(result).toBe(good)
  })

  it('preserves helpful general context while withholding mismatched personal numbers', () => {
    const result = groundHistoricalAnswer(answer([
      item('Training adaptations generally require repeated exposures.', []),
      item('Your recorded bench press was 99 kg.', [todayEvidence.id]),
    ]), packet([todayEvidence]), 'How was my bench press on 2026-10-06?')
    expect(result.blocks.map(x => x.text)).toEqual([
      'Training adaptations generally require repeated exposures.',
    ])
    expect(result.limitations).toHaveLength(1)
  })

  it('requires window-level evidence for recorded totals, not a single day within that week', () => {
    const q = 'How much water did I log last week?'
    const aggregate = item('You logged a total of 1800 ml of water last week.', [aDay.id])
    const disallowed = groundHistoricalAnswer(answer([aggregate]), packet([aDay]), q)
    expect(disallowed.blocks[0]?.text).toContain('cannot verify')
    const good = groundHistoricalAnswer(
      answer([item(aggregate.text, [aDay.id, windowCoverage.id])]),
      packet([aDay, windowCoverage]), q,
    )
    expect(good.blocks[0]?.text).toEqual(aggregate.text)
    expect(good.limitations).toEqual([])
  })

  it('never treats no-observation coverage as proof of zero for that window', () => {
    const q = 'How much water did I log last week?'
    const invalid = groundHistoricalAnswer(
      answer([item('You recorded 0 ml of water last week.', [unobservedWindow.id])]),
      packet([unobservedWindow]), q,
    )
    expect(invalid.blocks[0]?.text).not.toContain('0 ml')
  })

  it('does not delete uncertainty, conditional advice or legitimate cross-domain explanations', () => {
    expect(affirmativeOwnerMetricClaim('Your recorded water might underestimate true intake.')).toBe(false)
    expect(affirmativeOwnerMetricClaim('You could lift 80 kg next month.')).toBe(false)
    expect(affirmativeOwnerMetricClaim('Your intake is unknown due to incomplete logging.')).toBe(false)
    const q = 'How much did I bench on 2026-10-06?'
    const cautious = answer([item('Your logged strength is unknown for this date.', [range.id])])
    expect(groundHistoricalAnswer(cautious, packet([range]), q)).toBe(cautious)
  })

  it('does not call Gemini again for a historical citation mismatch, and caches only the safe answer', async () => {
    const q = 'How was my bench press on 2026-10-06?'
    const gate = createAskHealthGate({ minIntervalMs: 0, budgetUsd: 100 })
    const provider = vi.fn(async () => ({
      text: JSON.stringify({
        blocks: [{ text: 'Your recorded bench press was 99 kg.', evidence_refs: [todayEvidence.id] }],
        limitations: [], follow_ups: [],
      }),
      model: 'piq-stub', inputTokens: 30, outputTokens: 20,
    }))
    const opts = {
      packet: packet([todayEvidence, dated]), question: q,
      conversation: [], contextMode: 'personalized' as const,
      provider, gate, model: 'piq-stub', now: 1000,
    }
    const first = await explainAskHealth(opts)
    expect(provider).toHaveBeenCalledTimes(1)
    expect(first.answer.blocks[0]?.text).toContain('cannot verify')
    expect(first.evidence).toEqual([])
    const cached = await explainAskHealth({ ...opts, now: 2000 })
    expect(provider).toHaveBeenCalledTimes(1)
    expect(cached.meta.cached).toBe(true)
    expect(cached.answer.blocks[0]?.text).toContain('cannot verify')
    expect(cached.evidence).toEqual([])
  })
})
