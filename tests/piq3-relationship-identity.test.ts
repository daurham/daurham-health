import { describe, expect, it, vi } from 'vitest'
import type { AskEvidence, AskHealthAnswer, AskHealthPacket } from '../src/domain/ask-health/types.js'
import { registeredRelationshipSpec } from '../src/domain/intelligence/shared.js'
import {
  claimedRelationshipSignals, groundHistoricalAnswer,
} from '../src/domain/ask-health/temporal-citations.js'
import { explainAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'

const asOf = '2026-10-15'
const window = { start: '2026-09-01', end: '2026-09-30' }
const question = 'Were my logged water and bowel movements correlated last month?'
function relationship(id: string, rho = 0.64): AskEvidence {
  const spec = registeredRelationshipSpec(id)
  if (!spec) throw Error('unknown synthetic relationship')
  return {
    id: 'intelligence.relationship.' + id,
    domain: 'intelligence',
    label: 'Personal relationship',
    value: rho, unit: 'Spearman rho', text: 'Verified screened association only; not causal.',
    period: window, coverage: {
      pairedObservations: 14, pairedDateCount: 14, selectedCalendarDays: 30,
      requiredObservations: spec.xKey === 'activity.steps' ? 14 : 10,
      xKey: spec.xKey, yKey: spec.yKey, lagDays: spec.lagDays,
    },
    evidenceDates: Array.from({ length: spec.lagDays === 1 ? 15 : 14 }, (_, i) =>
      '2026-09-' + String(i + 1).padStart(2, '0')),
    detailPath: '/progress',
    userEntered: false, substantive: true, confidence: 'high',
  }
}
const waterBowelSame = relationship('shared:hydration:bowel:same_day')
const waterBowelNext = relationship('shared:hydration:bowel:next_day', 0.44)
const fiberBowelSame = relationship('shared:fiber:bowel:same_day')
const sleepEnergy = relationship('shared:sleep:energy', -0.42)
const packet = (evidence: AskEvidence[]): AskHealthPacket => ({
  packetVersion: 'ask-health-evidence-v2', range: '90d', lens: 'general',
  rangeStart: '2026-09-01', rangeEnd: asOf, asOf, healthToday: asOf,
  generatedAt: '2026-10-15T17:00:00.000Z',
  evidence, contextSummary: { knows: [], missing: [] }, limitations: [], clarification: null,
})
const item = (text: string, evidenceRefs: string[]) => ({ text, evidenceRefs })
const answer = (...blocks: AskHealthAnswer['blocks']): AskHealthAnswer => ({
  blocks, limitations: [], followUps: [],
})
const audit = (statement: string, cited: AskEvidence[], prompt = question) =>
  groundHistoricalAnswer(answer(item(statement, cited.map(s => s.id))), packet(cited), prompt)
const accepted = (statement: string, cited: AskEvidence[], q?: string) => {
  const result = audit(statement, cited, q)
  expect(result.blocks[0]?.text).toBe(statement)
  expect(result.limitations).toEqual([])
}
const withheld = (statement: string, cited: AskEvidence[], q?: string) => {
  const result = audit(statement, cited, q)
  expect(result.blocks[0]?.text).toContain('cannot verify')
  expect(result.limitations).toHaveLength(1)
}

describe('PIQ-3 relationship pairing and lag identity audit', () => {
  it('binds every registered relationship to its exact screened signals and lag', () => {
    expect(registeredRelationshipSpec('shared:hydration:bowel:same_day')).toEqual({
      xKey: 'hydration.ml', yKey: 'bowel.count', lagDays: 0,
    })
    expect(registeredRelationshipSpec('shared:hydration:bowel:next_day')).toEqual({
      xKey: 'hydration.ml', yKey: 'bowel.count', lagDays: 1,
    })
    expect(registeredRelationshipSpec('unregistered:fake')).toBeNull()
    expect(claimedRelationshipSignals('Your logged water, fiber and bowel records')).toEqual([
      'hydration.ml', 'nutrition.fiber_g', 'bowel.count',
    ])
  })

  it('rejects unrelated valid relationships instead of accepting any cited rho', () => {
    const claim = 'Your logged water and bowel events were correlated last month.'
    accepted(claim, [waterBowelSame])
    withheld(claim, [fiberBowelSame])
    withheld(claim, [sleepEnergy])
    withheld(claim, [fiberBowelSame, sleepEnergy])
    accepted('Your logged fiber and bowel movements were correlated last month.', [fiberBowelSame])
    withheld('Your water, fiber and bowel movements were correlated last month.', [waterBowelSame, fiberBowelSame])
    withheld('Your Health records were correlated last month.', [waterBowelSame])
  })

  it('validates same-day versus following-day claims and next-day direction', () => {
    accepted('Your water and bowel observations were correlated on the same day last month.', [waterBowelSame])
    withheld('Your water and bowel observations were correlated on the same day last month.', [waterBowelNext])
    accepted('Your water and bowel observations were correlated the next day last month.', [waterBowelNext])
    withheld('Your water and bowel observations were correlated the next day last month.', [waterBowelSame])
    withheld('Your bowel and water observations were correlated the next day last month.', [waterBowelNext])
    withheld('Your water and bowel were correlated on the same day and the next day last month.', [waterBowelSame, waterBowelNext])
    // If the answer does not name a timing claim, either lag may be cited.
    accepted('Your water and bowel observations were correlated last month.', [waterBowelNext])
  })

  it('requires the cited identity and statistical metadata to agree with the registry', () => {
    const claim = 'Your water and bowel observations were correlated last month.'
    const wrongPair = { ...waterBowelSame, coverage: { ...waterBowelSame.coverage, xKey: 'nutrition.fiber_g' } }
    const wrongLag = { ...waterBowelSame, coverage: { ...waterBowelSame.coverage, lagDays: 1 } }
    const noKeys = { ...waterBowelSame, coverage: { lagDays: 0, pairedObservations: 14, requiredObservations: 10 } }
    const tooFew = { ...waterBowelSame, coverage: { ...waterBowelSame.coverage, pairedObservations: 2 } }
    const madeUp = { ...waterBowelSame, id: 'intelligence.relationship.does:not:exist' }
    const missing = { ...waterBowelSame, substantive: false }
    const stale = { ...waterBowelSame, evidenceDates: ['2026-09-13'] }
    for (const source of [wrongPair, wrongLag, noKeys, tooFew, madeUp, missing, stale]) {
      withheld(claim, [source])
    }
    accepted(claim, [waterBowelSame])
  })

  it('does not flip the sign or invent the magnitude of rho', () => {
    accepted('Your water and bowel records were positively correlated (Spearman rho 0.64) last month.', [waterBowelSame])
    withheld('Your water and bowel records were negatively correlated (Spearman rho -0.64) last month.', [waterBowelSame])
    withheld('Your water and bowel records were positively correlated (Spearman rho 0.94) last month.', [waterBowelSame])
    accepted('Your sleep and energy levels were negatively correlated last month.', [sleepEnergy])
    withheld('Your sleep and energy levels were positively correlated last month.', [sleepEnergy])
  })

  it('keeps uncertainty and independently supported education without inventing associations', () => {
    const claim = 'Your water and bowel records might be associated, but the current evidence does not establish this.'
    const result = audit(claim, [])
    expect(result.blocks[0]?.text).toBe(claim)
    const raw = answer(
      item('Your water and bowel observations were correlated last month.', [fiberBowelSame.id]),
      item('A correlation cannot establish that drinking more water caused a bowel change.', []),
    )
    const safe = groundHistoricalAnswer(raw, packet([fiberBowelSame]), question)
    expect(safe.blocks).toEqual([raw.blocks[1]])
    expect(safe.limitations).toHaveLength(1)
  })

  it('does not confuse available statistical pairs with fully observed calendar coverage', () => {
    accepted('Your logged water and bowel results were correlated last month.', [waterBowelSame])
    for (const wording of [
      'Your logged water and bowel observations were correlated every day last month.',
      'Your water and bowel observations were always correlated last month.',
      'Your water and bowel observations correlated on all recorded days last month.',
      'Your water and bowel observations were correlated without exception last month.',
      'Your water and bowel observations were statistically significant last month.',
      'Your water and bowel observations showed a proven correlation last month.',
    ]) withheld(wording, [waterBowelSame])
    // A seven-day claim can never be certified by a 14-pair sample,
    // even when the source's selected period includes those seven days.
    withheld('Your water and bowel observations were correlated last week.', [waterBowelSame],
      'Were my water and bowel observations correlated last week?')
  })

  it('enforces sample-date count, registered screening recipe, and confidence integrity', () => {
    const statement = 'Your logged water and bowel observations were correlated last month.'
    const raw = waterBowelSame
    const c = raw.coverage!
    const variants: AskEvidence[] = [
      { ...raw, coverage: { ...c, pairedDateCount: 13 } },
      { ...raw, coverage: { ...c, pairedObservations: 15 } },
      { ...raw, coverage: { ...c, pairedObservations: 9, pairedDateCount: 9 } },
      { ...raw, coverage: { ...c, selectedCalendarDays: 9 } },
      { ...raw, coverage: { ...c, requiredObservations: 9 } },
      { ...raw, coverage: { ...c, requiredObservations: 14 } },
      { ...raw, coverage: { ...c, pairedDateCount: null } },
      { ...raw, coverage: { ...c, selectedCalendarDays: null } },
      { ...raw, confidence: 'moderate' },
      { ...raw, confidence: undefined },
      { ...raw, evidenceDates: undefined },
      { ...raw, evidenceDates: raw.evidenceDates?.slice(0, 9) },
      { ...raw, evidenceDates: Array(14).fill('2026-09-01') },
      { ...raw, value: 0.19 },
      { ...raw, value: Number.NaN },
    ]
    for (const source of variants) withheld(statement, [source])
    accepted(statement, [raw])
  })

  it('matches screened relationship strength without claiming statistical significance', () => {
    accepted('Your water and bowel results were strongly correlated last month.', [waterBowelSame])
    withheld('Your water and bowel results were weakly correlated last month.', [waterBowelSame])
    withheld('Your water and bowel results were moderately correlated last month.', [waterBowelSame])
    accepted('Your water and bowel results were moderately correlated last month.', [waterBowelNext])
    withheld('Your water and bowel results were strongly correlated last month.', [waterBowelNext])
    const weak = { ...waterBowelSame, value: 0.25 }
    accepted('Your water and bowel results showed a weak correlation last month.', [weak])
    withheld('Your water and bowel results showed a strong correlation last month.', [weak])
  })

  it('rejects unsupported or contradictory lag prose rather than silently treating it as unspecified', () => {
    for (const statement of [
      'Your water and bowel observations were correlated two days later last month.',
      'Your water and bowel observations were correlated the previous day last month.',
      'Your water and bowel observations were correlated several days later last month.',
      'Your water and bowel observations were correlated within 48 hours last month.',
      'Your water and bowel observations were correlated the next week last month.',
      'Your water and bowel observations were correlated immediately last month.',
      'Your water and bowel observations were correlated the same week last month.',
      'Your water and bowel observations were correlated on the same day and following day last month.',
    ]) {
      withheld(statement, [waterBowelSame, waterBowelNext])
    }
    accepted('Your water and bowel observations were correlated on the same day last month.', [waterBowelSame])
    accepted('Your water and bowel observations were correlated the next day last month.', [waterBowelNext])
  })

  it('sanitizes unsupported pair on initial model reply and cached answer with no second call', async () => {
    const wrong = 'Your water and bowel records were correlated last month.'
    const correct = 'Your fiber and bowel records were correlated last month.'
    const provider = vi.fn(async () => ({
      text: JSON.stringify({
        blocks: [
          { text: wrong, evidence_refs: [fiberBowelSame.id] },
          { text: correct, evidence_refs: [fiberBowelSame.id] },
          { text: 'Correlations cannot prove causation.', evidence_refs: [] },
        ],
        limitations: [], follow_ups: [],
      }),
      model: 'piq-synthetic', inputTokens: 25, outputTokens: 30,
    }))
    const gate = createAskHealthGate({ minIntervalMs: 0, budgetUsd: 100 })
    const opts = {
      packet: packet([fiberBowelSame]), question, conversation: [], contextMode: 'personalized' as const,
      provider, gate, model: 'piq-synthetic', now: 1_000,
    }
    const first = await explainAskHealth(opts)
    expect(provider).toHaveBeenCalledTimes(1)
    expect(first.answer.blocks.map(b => b.text)).toEqual([correct, 'Correlations cannot prove causation.'])
    expect(first.answer.limitations).toHaveLength(1)
    expect(first.evidence.map(e => e.id)).toEqual([fiberBowelSame.id])
    const cached = await explainAskHealth({ ...opts, now: 2_000 })
    expect(cached.meta.cached).toBe(true)
    expect(cached.answer).toEqual(first.answer)
    expect(provider).toHaveBeenCalledTimes(1)
  })
})
