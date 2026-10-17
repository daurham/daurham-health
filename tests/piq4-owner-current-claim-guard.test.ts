import { describe, expect, it, vi } from 'vitest'
import type { AskEvidence, AskHealthAnswer, AskHealthPacket } from '../src/domain/ask-health/types.js'
import { groundHistoricalAnswer } from '../src/domain/ask-health/temporal-citations.js'
import { explainAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'

/** PIQ-4 owner-preview rehearsal. Synthetic evidence only; no DB, PHI or model. */
const today = '2026-10-16'
const evidence = (
  id: string, domain: string, value: number | null, unit: string | null,
  substantive = true,
): AskEvidence => ({
  id, domain, label: 'Synthetic ' + domain, value, unit,
  text: 'Synthetic observation; no actual owner record.',
  period: { start: today, end: today }, coverage: null,
  detailPath: '/progress', userEntered: false, substantive,
})
const steps = evidence('activity.steps', 'activity', 5000, 'steps')
const sleep = evidence('sleep.total', 'sleep', 420, 'minutes')
const contextConflict = evidence('activity.source_consistency', 'activity', null, null, false)
const range = evidence('ask.range', 'ask', null, null, false)
const makePacket = (facts: AskEvidence[]): AskHealthPacket => ({
  packetVersion: 'ask-health-evidence-v2',
  lens: 'general', range: '30d', rangeStart: '2026-09-17', rangeEnd: today,
  asOf: today, healthToday: today,
  generatedAt: today + 'T20:00:00.000Z', evidence: facts,
  limitations: [], contextSummary: { knows: [], missing: [] },
  clarification: null,
})
const block = (text: string, refs: string[] = []) => ({ text, evidenceRefs: refs })
const answer = (...blocks: AskHealthAnswer['blocks']): AskHealthAnswer =>
  ({ blocks, limitations: [], followUps: [] })

describe('PIQ-4 owner preview: current owner-claim citation integrity', () => {
  it('withholds an uncited current measurement but retains independent education', () => {
    const safe = groundHistoricalAnswer(answer(
      block('You logged 5000 steps.'),
      block('Step counts are observational, not a measurement of fitness.'),
    ), makePacket([range, steps]), 'How many steps do my logs show?')
    expect(safe.blocks.map(x => x.text)).toEqual([
      'Step counts are observational, not a measurement of fitness.',
    ])
    expect(safe.limitations[0]?.text).toContain('withheld')
    expect(JSON.stringify(safe)).not.toContain('5000')
  })

  it('does not let a neutral source warning or an unrelated cited fact verify a changed measurement', () => {
    const packet = makePacket([range, contextConflict, sleep])
    for (const refs of [[], [range.id], [contextConflict.id], [sleep.id]]) {
      const safe = groundHistoricalAnswer(
        answer(block('You logged 5000 steps today.', refs)), packet,
        'How much did I walk today?',
      )
      expect(safe.blocks[0]?.text).toContain('cannot verify')
      expect(JSON.stringify(safe)).not.toContain('5000')
    }
    // Unrelated sleep facts are still eligible for accurately cited sleep claims.
    const accurate = groundHistoricalAnswer(
      answer(block('You recorded 420 minutes of sleep.', [sleep.id])), packet,
      'What does my sleep log show?',
    )
    expect(accurate.blocks[0]?.text).toContain('420 minutes')
  })

  it('keeps a cited matching-domain current owner claim and qualified hypothetical', () => {
    const packet = makePacket([steps])
    const response = answer(
      block('You logged 5000 steps.', [steps.id]),
      block('A daily step total cannot by itself prove a health outcome.'),
      block('You might log 8000 steps on another day.'),
    )
    expect(groundHistoricalAnswer(response, packet, 'How much did I walk?')).toBe(response)
  })

  it('inspects limitations as well as answer blocks', () => {
    const packet = makePacket([range, contextConflict])
    const response: AskHealthAnswer = {
      blocks: [block('A missing source must not be interpreted as zero steps.')],
      limitations: [block('Your recorded steps were 5000.', [contextConflict.id])],
      followUps: [],
    }
    const safe = groundHistoricalAnswer(response, packet, 'What were my steps?')
    expect(safe.blocks).toEqual(response.blocks)
    expect(safe.limitations.some(l=>l.text.includes('5000'))).toBe(false)
    expect(safe.limitations.some(l=>l.text.includes('withheld'))).toBe(true)
  })

  it('guards provider replies and cached replies without another paid repair call', async () => {
    const pkt = makePacket([range, contextConflict, sleep])
    const fake = JSON.stringify({
      blocks: [
        { text: 'You logged 5000 steps.', evidence_refs: [sleep.id] },
        { text: 'Sleep measurements are not proof of physical recovery.', evidence_refs: [] },
      ],
      limitations: [], follow_ups: [],
    })
    const provider = vi.fn(async () => ({
      text: fake, model: 'synthetic-offline-model',
      inputTokens: 10, outputTokens: 20,
    }))
    const gate = createAskHealthGate({ budgetUsd: 100, minIntervalMs: 0 })
    const args = {
      packet: pkt, question: 'How many steps did I log?', conversation: [],
      provider, gate, model: 'synthetic-offline-model',
      contextMode: 'personalized' as const,
    }
    const first = await explainAskHealth({ ...args, now: 1000 })
    expect(provider).toHaveBeenCalledOnce()
    expect(first.answer.blocks.map(x => x.text)).toEqual([
      'Sleep measurements are not proof of physical recovery.',
    ])
    expect(first.answer.limitations.some(x=>x.text.includes('withheld'))).toBe(true)
    expect(first.evidence).toEqual([])
    const cached = await explainAskHealth({ ...args, now: 2000 })
    expect(cached.meta.cached).toBe(true)
    expect(cached.answer).toEqual(first.answer)
    expect(provider).toHaveBeenCalledOnce()
  })
})
