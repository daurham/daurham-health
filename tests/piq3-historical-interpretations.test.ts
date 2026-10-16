import { describe, expect, it, vi } from 'vitest'
import type { AskEvidence, AskHealthAnswer, AskHealthPacket } from '../src/domain/ask-health/types.js'
import {
  affirmativeOwnerAssociation, definitiveOwnerCause, groundHistoricalAnswer,
  historicalDateIssue, temporalCitationScope,
} from '../src/domain/ask-health/temporal-citations.js'
import { explainAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'

const asOf = '2026-10-15'
const start = '2026-10-05'
const end = '2026-10-11'
const scoped = (id: string, domain: string, value: number, sum: number): AskEvidence => ({
  id, domain, value, unit: 'logged days',
  label: domain + ' historical window', text: 'Source-quality-gated observations only.',
  period: { start, end }, coverage: {
    observedDaysInWindow: 3, recordedWindowSum: sum,
    requestedWindowStart: start, requestedWindowEnd: end, requestedWindowScope: 'in_range',
  },
  detailPath: '/today', userEntered: false, substantive: true,
})
const water = scoped('digestive.focus.coverage.hydration', 'hydration', 3, 1800)
const bowel = scoped('digestive.focus.coverage.bowel', 'bowel', 3, 4)
const fiber = scoped('digestive.focus.coverage.fiber', 'nutrition', 3, 54)
const unrelated: AskEvidence = {
  ...scoped('intelligence.relationship.shared:hydration:bowel:same_day', 'intelligence', .7, .7),
  unit: 'Spearman rho', confidence: 'moderate',
  evidenceDates: Array.from({ length: 12 }, (_, i) =>
    '2026-09-' + String(i + 1).padStart(2, '0')),
  coverage: {
    pairedObservations: 12, pairedDateCount: 12, selectedCalendarDays: 45,
    requiredObservations: 10, lagDays: 0,
    xKey: 'hydration.ml', yKey: 'bowel.count',
  },
}
const olderRelationship: AskEvidence = {
  ...unrelated, evidenceDates: ['2026-09-01', '2026-09-05'],
}
const withinWindowRelationship: AskEvidence = {
  ...unrelated, evidenceDates: Array.from({ length: 12 }, (_, i) =>
    '2026-09-' + String(i + 1).padStart(2, '0')),
}
const unavailableRelationship = { ...withinWindowRelationship, substantive: false }
const packet = (evidence: AskEvidence[] = [water, bowel, fiber]): AskHealthPacket => ({
  packetVersion: 'ask-health-evidence-v2', lens: 'general', range: '90d',
  rangeStart: '2026-09-01', rangeEnd: asOf, asOf, healthToday: asOf,
  generatedAt: '2026-10-15T18:00:00.000Z',
  evidence, limitations: [], clarification: null, contextSummary: { knows: [], missing: [] },
})
const block = (text: string, evidenceRefs: string[]) => ({ text, evidenceRefs })
const answer = (blocks: AskHealthAnswer['blocks']): AskHealthAnswer => ({
  blocks, limitations: [], followUps: ['Review recorded days'],
})
const check = (q: string, text: string, refs: string[], evidence?: AskEvidence[]) =>
  groundHistoricalAnswer(answer([block(text, refs)]), packet(evidence), q)

describe('PIQ-3 ambiguous period and observational interpretation safeguards', () => {
  it('rejects affirmative date claims for ambiguous, unsupported and comparison periods', () => {
    const questions = [
      'What was my water intake on 10/06/2026?',
      'How much water did I log last year?',
      'How much water from 2026-10-06 through 2026-10-11?',
      'Compare 2026-10-06 with 2026-10-11',
      'How much did I log last week and last month?',
      'How much did I log in October 2026?',
      'How much did I log 2026-02-30?',
    ]
    for (const q of questions) {
      expect(historicalDateIssue(q, asOf, asOf)).not.toBeNull()
      expect(temporalCitationScope(q, asOf, asOf)).toBeNull()
      const result = check(q, 'You recorded 1,800 ml of water.', [water.id])
      expect(result.blocks[0]?.text).toContain('cannot verify')
      expect(result.limitations[0]?.text).toContain('ambiguous or unsupported')
    }
  })

  it('preserves educational guidance and explicit limits when a date is ambiguous', () => {
    const q = 'Compare my bowel logs on 2026-10-06 and 2026-10-11'
    const raw = answer([
      block('You recorded 4 movements between those dates.', [bowel.id]),
      block('Missing logs cannot establish zero movements.', []),
      block('A YYYY-MM-DD comparison needs both dates and date-specific recorded data.', []),
    ])
    const result = groundHistoricalAnswer(raw, packet(), q)
    expect(result.blocks.map(b => b.text)).toEqual([
      'Missing logs cannot establish zero movements.',
      'A YYYY-MM-DD comparison needs both dates and date-specific recorded data.',
    ])
    expect(result.limitations).toHaveLength(1)
  })

  it('withholds definite personal causation even with all matching source IDs', () => {
    const text = 'Your lower fiber intake caused your bowel irregularity.'
    expect(definitiveOwnerCause(text)).toBe(true)
    const q = 'Did my fiber affect my bowel movements last week?'
    const result = check(q, text, [fiber.id, bowel.id, withinWindowRelationship.id],
      [fiber, bowel, withinWindowRelationship])
    expect(result.blocks[0]?.text).toContain('cannot verify')
    expect(result.limitations).toHaveLength(1)
    expect(result.limitations[0]?.text).toContain('association')
  })

  it('keeps explicitly cautious possibilities without recasting them as proven cause', () => {
    const text = 'Lower fiber could contribute to harder stool, but your recorded events cannot establish the cause.'
    expect(definitiveOwnerCause(text)).toBe(false)
    const result = check('What caused my constipation last week?', text, [])
    expect(result.blocks[0]?.text).toBe(text)
    expect(result.limitations).toEqual([])
  })

  it('requires a substantive personal relationship source for any affirmative owner correlation', () => {
    const q = 'Were my water and bowel movements related last month?'
    const claim = 'Your logged water and bowel events were correlated last month.'
    expect(affirmativeOwnerAssociation(claim)).toBe(true)
    for (const evidence of [
      [water, bowel], [water, bowel, olderRelationship],
      [water, bowel, unavailableRelationship],
    ]) {
      const refs = evidence.map(x => x.id)
      const result = check(q, claim, refs, evidence)
      expect(result.blocks[0]?.text).toContain('cannot verify')
    }
    const good = check(q, claim, [withinWindowRelationship.id], [withinWindowRelationship])
    expect(good.blocks[0]?.text).toBe(claim)
  })

  it('allows calculated correlation without an explicit date but never promotes it to cause', () => {
    const q = 'Are my water and bowel records related?'
    const assoc = 'Your logs were correlated across water and bowel observations.'
    expect(check(q, assoc, [water.id, bowel.id]).blocks[0]?.text).toContain('cannot verify')
    expect(check(q, assoc, [unrelated.id], [unrelated]).blocks[0]?.text).toBe(assoc)
    const causal = 'Your logged water caused an improvement in bowel movements.'
    expect(check(q, causal, [unrelated.id, water.id, bowel.id], [unrelated, water, bowel])
      .blocks[0]?.text).toContain('cannot verify')
  })

  it('keeps separately sourced observations when the same provider reply invents a cause', async () => {
    const question = 'Did my water logs explain my bowel changes last week?'
    const factual = 'You logged a total of 1,800 ml of water and recorded 4 bowel movements last week.'
    const causal = 'Your logged water caused the change in your bowel movements.'
    const general = 'Recorded events and missing days cannot establish a biological cause.'
    const provider = vi.fn(async () => ({
      text: JSON.stringify({
        blocks: [
          { text: factual, evidence_refs: [water.id, bowel.id] },
          { text: causal, evidence_refs: [water.id, bowel.id, withinWindowRelationship.id] },
          { text: general, evidence_refs: [] },
        ],
        limitations: [], follow_ups: [],
      }),
      model: 'piq-test-model', inputTokens: 40, outputTokens: 55,
    }))
    const gate = createAskHealthGate({ minIntervalMs: 0, budgetUsd: 100 })
    const opts = {
      packet: packet([water, bowel, withinWindowRelationship]), question, conversation: [],
      contextMode: 'personalized' as const, model: 'piq-test-model', provider, gate, now: 1000,
    }
    const first = await explainAskHealth(opts)
    expect(first.answer.blocks.map(b => b.text)).toEqual([factual, general])
    expect(first.answer.limitations).toHaveLength(1)
    expect(first.evidence.map(x => x.id).sort()).toEqual([water.id, bowel.id].sort())
    expect(provider).toHaveBeenCalledTimes(1)
    const cached = await explainAskHealth({ ...opts, now: 2000 })
    expect(cached.meta.cached).toBe(true)
    expect(cached.answer).toEqual(first.answer)
    expect(provider).toHaveBeenCalledTimes(1)
  })
})
