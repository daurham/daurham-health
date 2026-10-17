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
  it('rejects a current wrong quantity even with the exact right evidence ID', () => {
    const pkt = makePacket([steps])
    for (const text of ['You logged 6000 steps.', 'Your measured steps totaled 4,000 steps.']) {
      const safe = groundHistoricalAnswer(answer(block(text, [steps.id])), pkt,
        'How many steps do my logs show?')
      expect(safe.blocks[0]?.text).toContain('cannot verify')
      expect(safe.blocks[0]?.text).not.toContain('6000')
      expect(safe.blocks[0]?.text).not.toContain('4,000')
    }
    const verified = groundHistoricalAnswer(
      answer(block('You logged 5,000 steps.', [steps.id])), pkt,
      'How many steps do my logs show?',
    )
    expect(verified.blocks[0]?.text).toContain('5,000 steps')
  })

  it('does not confuse two equal-unit nutrients with different saved numbers', () => {
    const protein = evidence('nutrition.protein', 'nutrition', 150, 'g')
    const fiber = evidence('nutrition.fiber', 'nutrition', 25, 'g')
    const calories = evidence('nutrition.calories', 'nutrition', 2000, 'kcal')
    const pkt = makePacket([protein, fiber, calories])
    const wrong = groundHistoricalAnswer(answer(
      block('You logged 150 g of fiber.', [protein.id]),
      block('You recorded 25 g of protein.', [fiber.id]),
      block('You consumed 2100 kcal.', [calories.id]),
      block('You logged 150 g protein and 25 g fiber.', [protein.id, fiber.id]),
    ), pkt, 'How is my nutrition?')
    expect(wrong.blocks.map(x => x.text)).toEqual([
      'You logged 150 g protein and 25 g fiber.',
    ])
    expect(wrong.limitations[0]?.text).toContain('withheld')
  })

  it('rejects mixed current quantities when even one value is not supported', () => {
    const pkt = makePacket([steps, sleep])
    const good = groundHistoricalAnswer(answer(
      block('You logged 5,000 steps and recorded 420 minutes of sleep.',
        [steps.id, sleep.id]),
    ), pkt, 'What did my steps and sleep logs show?')
    expect(good.blocks[0]?.text).toContain('420 minutes')
    const bad = groundHistoricalAnswer(answer(
      block('You logged 5,000 steps and recorded 480 minutes of sleep.',
        [steps.id, sleep.id]),
    ), pkt, 'What did my steps and sleep logs show?')
    expect(bad.blocks[0]?.text).toContain('cannot verify')
  })

  it('supports milligram sodium values but not invented milligram or ambiguous units', () => {
    const sodium = evidence('nutrition.sodium', 'nutrition', 900, 'mg')
    const pkt = makePacket([sodium])
    const good = groundHistoricalAnswer(answer(
      block('You recorded 900 mg of sodium.', [sodium.id]),
    ), pkt, 'How much sodium do my logs show?')
    expect(good.blocks[0]?.text).toContain('900 mg')
    for (const claim of [
      'You recorded 950 mg sodium.',
      'You recorded 1,5 mg sodium.',
      'You recorded 0.9 g sodium.',
      'You recorded 0.9 liters of water.',
      'You recorded 9% sodium.',
    ]) {
      const result = groundHistoricalAnswer(answer(block(claim, [sodium.id])), pkt,
        'How much sodium do my logs show?')
      expect(result.blocks[0]?.text).toContain('cannot verify')
    }
  })

  it('does not treat a current weight goal with matching unit as proof of actual scale weight', () => {
    const goal = evidence('goals.synthetic-weight', 'goals', 82, 'kg')
    const actual = evidence('body.weight.latest', 'body', 79, 'kg')
    const pkt = makePacket([goal, actual])
    expect(groundHistoricalAnswer(answer(
      block('Your weight was 82 kg.', [goal.id]),
    ), pkt, 'What is my weight?').blocks[0]?.text).toContain('cannot verify')
    expect(groundHistoricalAnswer(answer(
      block('Your weight was 79 kg.', [actual.id]),
    ), pkt, 'What is my weight?').blocks[0]?.text).toContain('79 kg')
  })

  it('sanitizes incorrect current quantities on both newly generated and cached answers', async () => {
    const pkt = makePacket([steps])
    const provider = vi.fn(async () => ({
      text: JSON.stringify({
        blocks: [
          { text: 'You logged 6000 steps.', evidence_refs: [steps.id] },
          { text: 'A step total is descriptive, not a diagnosis.', evidence_refs: [] },
        ], limitations: [], follow_ups: [],
      }),
      model: 'synthetic-no-paid-model', inputTokens: 12, outputTokens: 15,
    }))
    const gate = createAskHealthGate({ budgetUsd: 100, minIntervalMs: 0 })
    const args = {
      packet: pkt, question: 'How many steps do my records show?',
      conversation: [], provider, gate, model: 'synthetic-no-paid-model',
      contextMode: 'personalized' as const,
    }
    const first = await explainAskHealth({ ...args, now: 1000 })
    const cached = await explainAskHealth({ ...args, now: 2000 })
    expect(first.answer.blocks.map(x => x.text)).toEqual([
      'A step total is descriptive, not a diagnosis.',
    ])
    expect(cached.answer).toEqual(first.answer)
    expect(cached.meta.cached).toBe(true)
    expect(provider).toHaveBeenCalledOnce()
    expect(first.evidence).toEqual([])
  })

})
