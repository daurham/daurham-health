import { describe, expect, it, vi } from 'vitest'
import type { AskEvidence, AskHealthAnswer, AskHealthPacket } from '../src/domain/ask-health/types.js'
import {
  affirmativeOwnerMetricClaim, groundHistoricalAnswer,
  literalOwnerQuantities, unsupportedHistoricalMeasurement,
} from '../src/domain/ask-health/temporal-citations.js'
import { explainAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'

const start = '2026-10-05'
const end = '2026-10-11'
const asOf = '2026-10-15'
const q = 'How were my logged water, fiber and bowel movements last week?'
const coverage = {
  requestedWindowStart: start, requestedWindowEnd: end,
  requestedWindowScope: 'in_range', observedDaysInWindow: 2,
}
const evidence = (
  id: string, domain: string, recordedWindowSum: number, unit: string,
): AskEvidence => ({
  id, domain, label: domain + ' recorded window coverage', value: 2, unit: 'logged days',
  text: 'Only recorded events or verified days in the window; missing days remain unknown.',
  period: { start, end }, coverage: { ...coverage, recordedWindowSum },
  detailPath: '/today', userEntered: false, substantive: true,
  provenance: 'owner_recorded', evidenceDates: undefined,
})
const water = evidence('digestive.focus.coverage.hydration', 'hydration', 1800, 'ml')
const fiber = evidence('digestive.focus.coverage.fiber', 'nutrition', 46, 'g')
const bowel = evidence('digestive.focus.coverage.bowel', 'bowel', 3, 'movements')
const sameDateProtein = evidence('nutrition.protein', 'nutrition', 46, 'g')
const unrelated = evidence('training.focus.coverage.bench', 'training', 7, 'sessions')
const sources = [water, fiber, bowel, unrelated]
const pkt = (items = sources): AskHealthPacket => ({
  packetVersion: 'ask-health-evidence-v2', lens: 'general', range: '90d',
  rangeStart: '2026-09-01', rangeEnd: asOf, asOf,
  healthToday: asOf, generatedAt: '2026-10-15T18:00:00.000Z',
  evidence: items, limitations: [], clarification: null,
  contextSummary: { knows: [], missing: [] },
})
const block = (text: string, evidenceRefs: string[]) => ({ text, evidenceRefs })
const answer = (blocks: AskHealthAnswer['blocks']): AskHealthAnswer => ({
  blocks, limitations: [], followUps: ['Review logs'],
})
const safeText = 'You logged a total of 1,800 ml of water and 46 g of fiber, and recorded 3 movements in your bowel log last week.'
const check = (text: string, refs: string[], items = sources) =>
  groundHistoricalAnswer(answer([block(text, refs)]), pkt(items), q)

describe('PIQ-3 realistic cross-domain citation response fixtures', () => {
  it('retains three correctly cited measurements with independent domain, value and window evidence', () => {
    const result = check(safeText, [water.id, fiber.id, bowel.id])
    expect(result.blocks[0]?.text).toEqual(safeText)
    expect(result.limitations).toEqual([])
  })

  it('withholds mixed claims if any required source is absent or mismatched', () => {
    for (const refs of [
      [water.id, fiber.id],
      [water.id, bowel.id],
      [fiber.id, bowel.id],
      [water.id, fiber.id, unrelated.id],
    ]) {
      const result = check(safeText, refs)
      expect(result.blocks[0]?.text).toContain('cannot verify')
      expect(result.limitations).toHaveLength(1)
    }
  })

  it('does not substitute the same gram value from fiber for protein, including mixed claims', () => {
    const proteinClaim = 'Your logged total was 46 g of protein last week.'
    expect(check(proteinClaim, [fiber.id]).blocks[0]?.text).toContain('cannot verify')
    expect(check(proteinClaim, [sameDateProtein.id], [sameDateProtein]).blocks[0]?.text)
      .toEqual(proteinClaim)
    const both = 'You recorded 46 g of fiber and 46 g of protein last week.'
    expect(check(both, [fiber.id]).blocks[0]?.text).toContain('cannot verify')
    expect(check(both, [fiber.id, sameDateProtein.id], [fiber, sameDateProtein]).blocks[0]?.text)
      .toEqual(both)
  })

  it('rejects ambiguous partial-number matches and unsupported personal units', () => {
    for (const number of [
      '1,5 g', '12,34 g', '1,234,5 g', '1 800 ml',
      '1.5 L', '1.5 liters', '900 mg', '35%', '.5 ml', '-500 ml',
    ]) {
      expect(unsupportedHistoricalMeasurement('You recorded ' + number + ' yesterday.')).toBe(true)
      expect(affirmativeOwnerMetricClaim('You recorded ' + number + ' last week.')).toBe(true)
      expect(check('You recorded ' + number + ' last week.', [water.id, fiber.id]).blocks[0]?.text)
        .toContain('cannot verify')
    }
    expect(unsupportedHistoricalMeasurement('You logged 1,800 ml and 46 g fiber.')).toBe(false)
    expect(literalOwnerQuantities('You logged 1,800 ml and 46 g fiber.'))
      .toEqual([{ value: 1800, unit: 'ml' }, { value: 46, unit: 'g' }])
  })

  it('audits an affirmative measurement before a conditional explanation', () => {
    const factWithTheory = 'You logged a total of 1,800 ml of water last week, which might affect how thirsty you felt.'
    expect(affirmativeOwnerMetricClaim(factWithTheory)).toBe(true)
    expect(check(factWithTheory, [water.id]).blocks[0]?.text).toBe(factWithTheory)
    expect(check(factWithTheory.replace('1,800', '1,500'), [water.id]).blocks[0]?.text)
      .toContain('cannot verify')
    const possibility = 'You might have logged 1,500 ml of water last week.'
    expect(affirmativeOwnerMetricClaim(possibility)).toBe(false)
    expect(check(possibility, [water.id]).blocks[0]?.text).toBe(possibility)
  })

  it('preserves independently supported explanation blocks when one mixed block is withheld', () => {
    const raw = answer([
      block('You recorded 1.5 liters of water and 46 g fiber last week.', [water.id, fiber.id]),
      block('Your verified fiber logs totaled 46 g last week.', [fiber.id]),
      block('Recorded intake and total actual consumption are not necessarily the same.', []),
    ])
    const result = groundHistoricalAnswer(raw, pkt(), q)
    expect(result.blocks.map(x => x.text)).toEqual([
      'Your verified fiber logs totaled 46 g last week.',
      'Recorded intake and total actual consumption are not necessarily the same.',
    ])
    expect(result.limitations).toHaveLength(1)
  })

  it('sanitizes live-shaped JSON provider replies and cached replies without spending a repair call', async () => {
    const providerText = JSON.stringify({
      blocks: [
        { text: safeText, evidence_refs: [water.id, fiber.id, bowel.id] },
        { text: 'Your sodium was 900 mg last week.', evidence_refs: [fiber.id] },
        { text: 'An incomplete log cannot confirm total fluid consumption.', evidence_refs: [] },
      ],
      limitations: [], follow_ups: ['Review logged days'],
    })
    const provider = vi.fn(async () => ({
      text: providerText, model: 'piq-test-model',
      inputTokens: 40, outputTokens: 50,
    }))
    const gate = createAskHealthGate({ minIntervalMs: 0, budgetUsd: 100 })
    const args = {
      packet: pkt(), question: q, conversation: [],
      contextMode: 'personalized' as const, provider, gate,
      model: 'piq-test-model', now: 1_000,
    }
    const first = await explainAskHealth(args)
    expect(provider).toHaveBeenCalledTimes(1)
    expect(first.answer.blocks.map(x => x.text)).toEqual([
      safeText,
      'An incomplete log cannot confirm total fluid consumption.',
    ])
    expect(first.answer.limitations).toHaveLength(1)
    expect(first.evidence.map(x => x.id).sort()).toEqual([water.id, fiber.id, bowel.id].sort())
    const second = await explainAskHealth({ ...args, now: 2_000 })
    expect(provider).toHaveBeenCalledTimes(1)
    expect(second.meta.cached).toBe(true)
    expect(second.answer).toEqual(first.answer)
    expect(second.evidence.map(x => x.id).sort()).toEqual(first.evidence.map(x => x.id).sort())
  })
})
