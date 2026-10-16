import { describe, expect, it } from 'vitest'
import { buildAskHealthEvidencePacket, type AskHealthPacketInput } from '../src/domain/ask-health/index.js'
import {
  auditAskHealthSharedCoverage,
  describeAskHealthResponsePath,
} from '../src/domain/ask-health/diagnostics.js'
import {
  buildHealthIntelligenceSnapshot,
  routeHealthIntelligence,
  type IntelligenceObservation,
} from '../src/domain/intelligence/shared.js'

/** Synthetic fixture: no canonical owner database, model calls or AI billing. */
const date = '2026-10-12'
const base = {
  lens: 'recovery',
  range: '30d',
  asOf: '2026-10-14',
  healthToday: '2026-10-14',
  period: { start: '2026-09-15', end: '2026-10-14' },
  generatedAt: '2026-10-14T18:00:00.000Z',
  question: 'How did I sleep?',
  overview: null,
  activity: null,
  sleep: null,
  goals: [],
  experiments: [],
  benchmarks: [],
  supplements: [],
  context: null,
  patterns: [],
} satisfies AskHealthPacketInput

function obs(key: IntelligenceObservation['key'], value: number, unit: string): IntelligenceObservation {
  return { key, date, value, unit, provenance: 'owner', sourceIds: ['synthetic'] }
}

function intelligence(observations: IntelligenceObservation[]) {
  return buildHealthIntelligenceSnapshot({
    range: '30d', asOf: '2026-10-14', start: '2026-10-01', end: '2026-10-14',
    timezone: 'America/Phoenix', today: '2026-10-14', observations,
  })
}

describe('PIQ-0 evidence selection diagnostics — observed reality, not desired routing behavior', () => {
  it('distinguishes no shared observations from unobserved/unknown whole-owner database', () => {
    const snapshot = intelligence([])
    const routed = routeHealthIntelligence(snapshot, { question: base.question, lens: base.lens })
    const audit = auditAskHealthSharedCoverage(snapshot, routed)
    expect(audit).toEqual({
      observedSignalCount: 0,
      selectedObservedSignalCount: 0,
      unselectedObservedSignalCount: 0,
    })
    const packet = buildAskHealthEvidencePacket({ ...base, intelligence: routed, sourceCoverageAudit: audit })
    const diagnostic = describeAskHealthResponsePath(packet, { provider: 'health', cached: false })
    expect(diagnostic.sourceCoverageAudit).toEqual(audit)
    expect(diagnostic.path).toBe('packet_no_substantive_evidence')
    expect(diagnostic).not.toHaveProperty('actualOwnerDatabaseEmpty')
    // "0 observed shared signals" is NOT permission to infer no medications, meals, etc.
  })

  it('T21: detects available shared signals the question router leaves out, without leaking signal names', () => {
    const snapshot = intelligence([
      obs('sleep.total_minutes', 450, 'min'),
      obs('hydration.ml', 1400, 'ml'),
      obs('nutrition.fiber_g', 18, 'g'),
    ])
    const routed = routeHealthIntelligence(snapshot, { question: base.question, lens: base.lens })
    const audit = auditAskHealthSharedCoverage(snapshot, routed)
    expect(audit).toEqual({
      observedSignalCount: 3,
      selectedObservedSignalCount: 1,
      unselectedObservedSignalCount: 2,
    })
    const packet = buildAskHealthEvidencePacket({ ...base, intelligence: routed, sourceCoverageAudit: audit })
    expect(packet.evidence.some((item) => item.id === 'intelligence.coverage.sleep.total_minutes')).toBe(true)
    expect(packet.evidence.some((item) => item.id === 'intelligence.coverage.hydration.ml')).toBe(false)
    const diagnostic = describeAskHealthResponsePath(packet, { provider: 'gemini', cached: false })
    expect(diagnostic.sourceCoverageAudit).toEqual(audit)
    expect(JSON.stringify(diagnostic)).not.toContain('hydration.ml')
    expect(JSON.stringify(diagnostic)).not.toContain('1400')
  })

  it('T21: differentiates candidates dropped to fit packet size from source absence', () => {
    const goals: AskHealthPacketInput['goals'] = Array.from({ length: 18 }, (_, i) => ({
      id: 'synthetic-' + i,
      kind: 'body_metric',
      lifecycle: 'active',
      label: 'Synthetic weight goal ' + i,
      targetText: 'At most 80 kg',
      targetState: 'above_target',
      deadlineState: 'none',
      projectionState: 'insufficient_data',
      projectionReason: null,
    }))
    const packet = buildAskHealthEvidencePacket({
      ...base, lens: 'general', question: 'What are all my goals?',
      goals, maxChars: 850,
    })
    const audit = packet.evidenceSelectionAudit!
    expect(audit.candidateCount).toBeGreaterThan(audit.selectedCount)
    expect(audit.removedCount).toBeGreaterThan(0)
    expect(audit.removedSubstantiveCount).toBeGreaterThan(0)
    expect(audit.selectedSerializedChars).toBeLessThanOrEqual(audit.maxChars)
    expect(audit.exceedsMaxChars).toBe(false)
    expect(packet.evidence.some((item) => item.id === 'ask.range')).toBe(true)
    expect(packet.limitations.every((limitation) =>
      packet.evidence.some((item) => item.id === limitation.evidenceId))).toBe(true)
  })

  it('marks an unsatisfiable tiny size limit without changing priority-zero evidence', () => {
    const packet = buildAskHealthEvidencePacket({ ...base, maxChars: 1 })
    expect(packet.evidence.map((item) => item.id)).toContain('ask.range')
    expect(packet.evidenceSelectionAudit).toMatchObject({
      maxChars: 1,
      exceedsMaxChars: true,
    })
  })

  it('keeps uninspected source coverage unknown rather than mistaking it for an observed zero', () => {
    const packet = buildAskHealthEvidencePacket(base)
    const diagnostic = describeAskHealthResponsePath(packet, { provider: 'health', cached: false })
    expect(diagnostic.sourceCoverageAudit).toBeNull()
    expect(diagnostic.evidenceSelectionAudit).toMatchObject({
      candidateCount: 1,
      selectedCount: 1,
      removedCount: 0,
    })
  })
})
