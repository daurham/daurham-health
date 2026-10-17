import { describe, expect, it } from 'vitest'
import { createMemoryAiUsageLedger } from '../server/ai-usage/memory.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'

const NOW = Date.parse('2026-10-17T07:30:00Z')
const KEY = 'a'.repeat(64)

describe('PIQ T43 Ask Health duplicate reservation safety (synthetic only)', () => {
  it('two cold gate instances sharing a durable ledger cannot both reserve an identical question', async () => {
    const ledger = createMemoryAiUsageLedger()
    const options = { ledger, budgetUsd: 1, maxRequestCostUsd: 0.02, minIntervalMs: 0, maxPerMinute: 100 }
    const first = createAskHealthGate(options)
    const second = createAskHealthGate(options)
    const [a, b] = await Promise.all([
      first.take(KEY, NOW, 'gemini-test'),
      second.take(KEY, NOW, 'gemini-test'),
    ])
    expect([a, b].filter((item) => item.ok)).toHaveLength(1)
    expect([a, b].find((item) => !item.ok)).toEqual({ ok: false, reason: 'duplicate' })
    expect(ledger.rows()).toHaveLength(1)
    const accepted = a.ok ? a : b
    if (!accepted.ok || !accepted.usageId) return
    await first.uncertain(accepted.usageId, NOW + 100)
    expect(await second.take(KEY, NOW + 60_000, 'gemini-test'))
      .toEqual({ ok: false, reason: 'duplicate' })
    const distinct = await second.take('b'.repeat(64), NOW + 60_000, 'gemini-test')
    expect(distinct.ok).toBe(true)
    expect(ledger.rows()).toHaveLength(2)
  })

  it('a completed same-key request cools down, then legitimately retries; a released request retries immediately', async () => {
    const ledger = createMemoryAiUsageLedger()
    const options = { ledger, budgetUsd: 1, maxRequestCostUsd: 0.02, minIntervalMs: 0, maxPerMinute: 100 }
    const first = createAskHealthGate(options)
    const second = createAskHealthGate(options)
    const initial = await first.take(KEY, NOW, 'gemini-test')
    expect(initial.ok).toBe(true)
    if (!initial.ok || !initial.usageId) return
    await first.complete(initial.usageId, 0.005, 12, 22, NOW + 100)
    expect(await second.take(KEY, NOW + 30_000, 'gemini-test'))
      .toEqual({ ok: false, reason: 'duplicate' })
    const later = await second.take(KEY, NOW + 61_000, 'gemini-test')
    expect(later.ok).toBe(true)
    if (!later.ok || !later.usageId) return
    await second.release(later.usageId, NOW + 62_000)
    expect((await first.take(KEY, NOW + 63_000, 'gemini-test')).ok).toBe(true)
    expect(ledger.rows()).toHaveLength(3)
  })

  it('duplicate suppression applies only to Ask Health, not unrelated AI workflows', async () => {
    const ledger = createMemoryAiUsageLedger()
    const request = {
      requestType: 'nutrition_ocr', provider: 'gemini', model: 'gemini-test',
      requestHash: KEY, reservedCostUsd: 0.02, now: NOW,
      budgetUsd: 1, minIntervalMs: 0, maxPerMinute: 100,
    }
    const [one, two] = await Promise.all([ledger.reserve(request), ledger.reserve(request)])
    expect(one.ok).toBe(true)
    expect(two.ok).toBe(true)
  })
})
