import { describe, expect, it } from 'vitest'
import {
  buildHealthIntelligenceSnapshot, type IntelligenceObservation,
} from '../src/domain/intelligence/shared.js'
import { digestDateSelection, focusDigestiveContext, attachBristolTypes } from '../src/domain/ask-health/focused-digestive.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'
import type { AskContextMode } from '../src/domain/ask-health/config.js'

const today = '2026-10-15'
const records: IntelligenceObservation[] = [
  { key: 'hydration.ml', date: '2026-09-02', value: 250, unit: 'ml', provenance: 'owner', sourceIds: ['sept-1'] },
  { key: 'hydration.ml', date: '2026-09-03', value: 450, unit: 'ml', provenance: 'owner', sourceIds: ['sept-2'] },
  { key: 'hydration.ml', date: '2026-10-06', value: 500, unit: 'ml', provenance: 'owner', sourceIds: ['w-6'] },
  { key: 'hydration.ml', date: '2026-10-08', value: 1500, unit: 'ml', provenance: 'owner', sourceIds: ['w-8'] },
  { key: 'hydration.ml', date: '2026-10-11', value: 1000, unit: 'ml', provenance: 'owner', sourceIds: ['w-11'] },
  { key: 'hydration.ml', date: '2026-10-13', value: 400, unit: 'ml', provenance: 'owner', sourceIds: ['w-13'] },
  { key: 'hydration.ml', date: '2026-10-15', value: 250, unit: 'ml', provenance: 'owner', sourceIds: ['w-15'] },
  { key: 'bowel.count', date: '2026-10-06', value: 0, unit: 'count', provenance: 'owner', sourceIds: [] },
  { key: 'bowel.count', date: '2026-10-08', value: 2, unit: 'count', provenance: 'owner', sourceIds: ['b8a', 'b8b'] },
  { key: 'bowel.count', date: '2026-10-11', value: 1, unit: 'count', provenance: 'owner', sourceIds: ['b11'] },
  { key: 'bowel.count', date: '2026-10-13', value: 3, unit: 'count', provenance: 'owner', sourceIds: ['b13a', 'b13b', 'b13c'] },
  { key: 'bowel.count', date: '2026-10-15', value: 1, unit: 'count', provenance: 'owner', sourceIds: ['b15'] },
  { key: 'nutrition.fiber_g', date: '2026-10-06', value: 18, unit: 'g',
    provenance: 'owner', quality: 'high_confidence', sourceIds: ['f6'] },
  { key: 'nutrition.fiber_g', date: '2026-10-08', value: 28, unit: 'g',
    provenance: 'owner', quality: 'high_confidence', sourceIds: ['f8'] },
  { key: 'nutrition.fiber_g', date: '2026-10-09', value: 4, unit: 'g',
    provenance: 'owner', quality: 'high_confidence', sourceIds: ['f9-unverified'] },
]
const verified = new Set(['2026-10-06', '2026-10-08'])

function makeSnapshot(start = '2026-09-01', asOf = today) {
  return buildHealthIntelligenceSnapshot({
    range: '90d', asOf, start, end: asOf, timezone: 'America/Phoenix',
    today, observations: records, nutritionVerifiedCompleteDates: verified,
    nutritionVerificationStatus: 'available',
  })
}
function context(question: string, mode: AskContextMode = 'personalized', start?: string, asOf = today) {
  const snapshot = makeSnapshot(start, asOf)
  const focusedDigestive = focusDigestiveContext({
    question, snapshot, today, includeBroadContext: mode === 'deep',
  })
  const input: AskHealthPacketInput = {
    question, contextMode: mode, lens: 'general',
    range: '90d', asOf, period: { start: snapshot.period.start, end: snapshot.period.end },
    generatedAt: today + 'T18:00:00.000Z',
    overview: null, activity: null, sleep: null, goals: [], experiments: [],
    benchmarks: [], supplements: [], context: null, patterns: [], focusedDigestive,
  }
  return { focus: focusedDigestive, facts: buildAskHealthEvidencePacket(input).evidence }
}

describe('PIQ-3.3 bounded digestive calendar windows and honest missingness', () => {
  it('resolves previous complete Monday–Sunday week, not latest seven rolling days', () => {
    const selection = digestDateSelection('How much water did I log last week?', today)
    expect(selection).toEqual({
      date: null, issue: null,
      window: {
        start: '2026-10-05', end: '2026-10-11', calendarDays: 7,
        label: 'Previous complete Monday–Sunday week',
      },
    })
    const { focus, facts } = context('How much water did I log last week?')
    expect(focus?.hydration.recordedDays).toBe(3)
    expect(focus?.hydration.windowSummary).toMatchObject({
      calendarDays: 7, daysWithObservations: 3, summedRecordedValue: 3000,
      meanPerObservedDay: 1000, provisionalObservedDays: 0,
    })
    expect(facts.find(x => x.id === 'digestive.focus.coverage.hydration')?.coverage).toMatchObject({
      requestedWindowStart: '2026-10-05', requestedWindowEnd: '2026-10-11',
      observedDaysInWindow: 3, unknownOrUnverifiedDaysInWindow: 4,
      recordedWindowSum: 3000,
    })
    expect(facts.find(x => x.id === 'digestive.focus.coverage.hydration')?.text)
      .toContain('not daily total fluid consumption')
    expect(facts.some(x => x.id === 'digestive.focus.hydration.2026-10-13')).toBe(false)
    expect(facts.some(x => x.id.startsWith('digestive.focus.bowel.'))).toBe(false)
  })

  it('uses all qualifying dates in a windowed aggregate, not only three examples', () => {
    const { focus, facts } = context('How much water in this month?')
    expect(focus?.requestedWindow).toMatchObject({
      start: '2026-10-01', end: '2026-10-15', calendarDays: 15, inSelectedRange: true,
    })
    expect(focus?.hydration.windowSummary).toMatchObject({
      daysWithObservations: 5, summedRecordedValue: 3650, provisionalObservedDays: 1,
    })
    expect(focus?.hydration.observations).toHaveLength(3)
    const coverage = facts.find(x => x.id === 'digestive.focus.coverage.hydration')
    expect(coverage?.coverage).toMatchObject({
      observedDaysInWindow: 5, selectedDays: 3, unknownOrUnverifiedDaysInWindow: 10,
    })
    expect(coverage?.text).toContain('Today includes provisional events')
    expect(coverage?.text).toContain('aggregate uses all qualifying dates')
  })

  it('keeps complete-day fiber eligibility separate from unverified food fragments', () => {
    const { focus, facts } = context('How much fiber did I eat last week?')
    expect(focus?.fiber.recordedDays).toBe(3)
    expect(focus?.fiber.verifiedDays).toBe(2)
    expect(focus?.fiber.windowSummary).toMatchObject({
      calendarDays: 7, daysWithObservations: 2, summedRecordedValue: 46,
      meanPerObservedDay: 23,
    })
    const coverage = facts.find(x => x.id === 'digestive.focus.coverage.fiber')
    expect(coverage?.text).toContain('2 of 7 dates')
    expect(coverage?.text).toContain('not an average across all calendar days')
    expect(coverage?.coverage).toMatchObject({
      verifiedDays: 2, unverifiedDays: 1, unknownOrUnverifiedDaysInWindow: 5,
    })
    expect(facts.some(x => x.id === 'digestive.focus.fiber.2026-10-09')).toBe(false)
  })

  it('includes explicit zero-day bowel observations but does not zero-fill missing days', () => {
    const { focus, facts } = context('How many times did I poop last week?')
    expect(focus?.bowel.windowSummary).toMatchObject({
      calendarDays: 7, daysWithObservations: 3, summedRecordedValue: 3,
      meanPerObservedDay: 1,
    })
    expect(facts.find(x => x.id === 'digestive.focus.bowel.2026-10-06')?.value).toBe(0)
    expect(facts.find(x => x.id === 'digestive.focus.coverage.bowel')?.text)
      .toContain('not per calendar day')
    expect(facts.find(x => x.id === 'digestive.focus.coverage.bowel')?.coverage)
      .toMatchObject({ unknownOrUnverifiedDaysInWindow: 4 })
  })

  it('bounds Bristol details to three selected in-window observations', () => {
    const scoped = context('Did my Bristol stool types change last week?').focus
    const attached = attachBristolTypes(scoped, [
      { id: 'b8a', date: '2026-10-08', bristolType: 1 },
      { id: 'b8b', date: '2026-10-08', bristolType: 2 },
      { id: 'b11', date: '2026-10-11', bristolType: 4 },
      { id: 'b13a', date: '2026-10-13', bristolType: 7 },
    ])
    expect(attached?.bowel.observations.map(x => x.date)).toEqual([
      '2026-10-11', '2026-10-08', '2026-10-06',
    ])
    expect(attached?.bowel.observations.flatMap(x => x.bristolTypes ?? [])).toEqual([4, 1, 2])
  })

  it('handles trailing seven days and previous calendar month with correct boundaries', () => {
    const trailing = digestDateSelection('How much water in the past 7 days?', today)
    expect(trailing.window).toMatchObject({
      start: '2026-10-09', end: '2026-10-15', calendarDays: 7,
    })
    expect(context('How much water in the past 7 days?').focus?.hydration.windowSummary)
      .toMatchObject({ summedRecordedValue: 1650, daysWithObservations: 3, provisionalObservedDays: 1 })
    const month = digestDateSelection('How much water last month?', today)
    expect(month.window).toMatchObject({
      start: '2026-09-01', end: '2026-09-30', calendarDays: 30,
    })
    expect(context('How much water last month?').focus?.hydration.windowSummary)
      .toMatchObject({ summedRecordedValue: 700, daysWithObservations: 2 })
  })

  it('fails closed on an incomplete window rather than presenting a partial total', () => {
    const { focus, facts } = context('How much water last month?', 'deep', '2026-10-01')
    expect(focus?.requestedWindow?.inSelectedRange).toBe(false)
    expect(focus?.hydration.windowSummary).toBeUndefined()
    expect(focus?.hydration.observations).toEqual([])
    const coverage = facts.find(x => x.id === 'digestive.focus.coverage.hydration')
    expect(coverage?.text).toContain('No partial totals or recent substitutes were used')
    expect(coverage?.coverage).toMatchObject({ requestedWindowScope: 'out_of_range' })
    expect(facts.some(x => x.id.startsWith('digestive.focus.hydration.'))).toBe(false)
  })

  it('has a null, not zero, aggregate for an in-scope window with no observed events', () => {
    const { focus, facts } = context('How much water last week?', 'personalized', '2026-09-01', '2026-09-20')
    expect(focus?.requestedWindow).toMatchObject({
      start: '2026-09-07', end: '2026-09-13', inSelectedRange: true,
    })
    expect(focus?.hydration.windowSummary).toMatchObject({
      calendarDays: 7, daysWithObservations: 0,
      summedRecordedValue: null, meanPerObservedDay: null,
    })
    expect(facts.find(x => x.id === 'digestive.focus.coverage.hydration')?.text)
      .toContain('no event sum can be calculated')
    expect(facts.some(x => x.id.startsWith('digestive.focus.hydration.'))).toBe(false)
  })

  it('anchors relative windows to the selected as-of date, not the actual current day', () => {
    const selected = digestDateSelection('How much water last week?', today, '2026-10-09')
    expect(selected.window).toMatchObject({
      start: '2026-09-28', end: '2026-10-04',
    })
    const { focus } = context('How much water last week?', 'deep', '2026-09-01', '2026-10-09')
    expect(focus?.requestedWindow).toMatchObject({
      start: '2026-09-28', end: '2026-10-04', inSelectedRange: true,
    })
  })

  it('rejects unsupported or conflicting windows instead of using recent days', () => {
    for (const question of [
      'How much water last 91 days?', 'How much water last year?',
      'How much water last 2 weeks?', 'How much water last week and this month?',
      'How much water last week and last year?',
      'How much water on 2026-10-06 last week?',
      'How much water 10/06/2026 last week?',
      'How much water since last month?',
      'How much water since 2026-10-06?',
      'How much water in July?',
      'How much water September 2026?',
    ]) {
      expect(digestDateSelection(question, today).issue).not.toBeNull()
      const { facts } = context(question)
      expect(facts.some(x => x.id.startsWith('digestive.focus.hydration.'))).toBe(false)
      expect(facts.find(x => x.id === 'digestive.focus.coverage.hydration')?.text)
        .toContain('No recent-day observations were substituted')
    }
  })

  it('preserves three recent examples for undated opt-in Deep Dive', () => {
    const { focus } = context('How is my health generally?', 'deep')
    expect(focus?.requestedWindow).toBeNull()
    expect(focus?.hydration.observations).toHaveLength(3)
    expect(focus?.hydration.windowSummary).toBeUndefined()
  })
})
