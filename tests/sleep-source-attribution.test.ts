import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { demoDataset } from '../src/demo/dataset.ts'
import { demoSleep, demoSleepNightDetail } from '../src/demo/repository.ts'
import type { ProgressCanonicalInput } from '../src/domain/progress/health-timeline.ts'
import { buildProgressTimeline } from '../src/domain/progress/timeline.ts'
import {
  assessSleepSourceComparability,
  buildSleepNightDetail,
  buildSleepProgressView,
  computeSleepDurationBaseline,
  deriveNightSourceAttribution,
  deriveSleepSourceAttribution,
  deriveSleepSourceTransitions,
  SLEEP_SOURCE_ATTRIBUTION_VERSION,
  SLEEP_VITAL_REGISTRY,
  type SleepPersonalBaseline,
} from '../src/domain/sleep/index.ts'
import type { SleepNightlySummary } from '../src/domain/sleep/summarize.ts'
import type { SleepVitalDefinition, SleepVitalObservation } from '../src/domain/sleep/vitals.ts'
import { SleepNightDetailView } from '../src/features/progress/SleepNightPage.tsx'
import { SleepSection } from '../src/features/progress/SleepSection.tsx'

function evidence(
  sourceKey: string,
  sourceName: string,
  minutes: number | null,
  status: SleepNightlySummary['observationStatus'],
  alternatives: SleepNightlySummary['evidence']['alternatives'] = [],
) {
  return {
    selectedLogicalSource: sourceKey,
    selectedSourceName: sourceName,
    selectedDurationMinutes: minutes,
    selectedStatus: status,
    alternatives,
    sourcePriority: ['apple_watch', 'circular', 'sleep_cycle', 'iphone'],
    completenessOverride: false,
    intervalCount: 2,
    stageCoveragePct: 95,
    additionalEpisodeCount: 0,
    calculationVersion: 'sleep-night-v1',
  }
}

function night(
  date: string,
  source: { key: string; name: string } = { key: 'apple_watch', name: 'Apple Watch' },
  options: Partial<SleepNightlySummary> & { minutes?: number | null } = {},
): SleepNightlySummary {
  const minutes = options.minutes === undefined ? 420 : options.minutes
  const status = options.observationStatus ?? 'analysis_eligible'
  return {
    sleepDate: date,
    timezone: 'America/Phoenix',
    logicalSourceKey: source.key,
    sourceName: source.name,
    startAt: `${date}T07:00:00.000Z`,
    endAt: `${date}T15:00:00.000Z`,
    totalSleepMinutes: minutes,
    timeInBedMinutes: 460,
    awakeMinutes: 12,
    coreMinutes: 200,
    deepMinutes: 60,
    remMinutes: 80,
    unspecifiedSleepMinutes: 20,
    stageCoveragePct: 95,
    stageConflictMinutes: 0,
    observationStatus: status,
    analysisEligible: options.analysisEligible ?? status === 'analysis_eligible',
    stageAnalysisEligible: options.stageAnalysisEligible ?? status === 'analysis_eligible',
    selectionReason: options.selectionReason ?? 'source_priority',
    calculationVersion: 'sleep-night-v1',
    evidence: options.evidence ?? evidence(source.key, source.name, minutes ?? null, status),
  }
}

function html(detail: ReturnType<typeof buildSleepNightDetail>): string {
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(SleepNightDetailView, { detail })))
}

describe('sleep source attribution', () => {
  it('explains the stored source without rerunning arbitration', () => {
    const selected = night(
      '2026-09-23',
      { key: 'circular', name: 'Circular' },
      {
        minutes: 384,
        evidence: evidence('circular', 'Circular', 384, 'analysis_eligible', [
          { logicalSourceKey: 'apple_watch', sourceName: 'Apple Watch', totalSleepMinutes: 182, timeInBedMinutes: 200, status: 'partial_observation' },
          { logicalSourceKey: 'circular', sourceName: 'Circular', totalSleepMinutes: 384, timeInBedMinutes: 430, status: 'analysis_eligible' },
        ]),
      },
    )
    const detail = deriveNightSourceAttribution(selected, 'Health Auto Export')
    expect(detail.selectedSourceName).toBe('Circular')
    expect(detail.transportSource).toBe('Health Auto Export')
    expect(detail.selectionReason).toBe('source_priority')
    expect(detail.selectionLabel).toBe('Selected preferred complete source.')
    expect(detail.selectionExplanation).toContain('source-priority rule')
    expect(detail.calculationVersion).toBe(SLEEP_SOURCE_ATTRIBUTION_VERSION)
    expect(JSON.stringify(detail)).not.toMatch(/accuracy|quality_score|confidence_score|most accurate|best source/i)
    const rendered = html(buildSleepNightDetail(selected, { previousSleepDate: null, nextSleepDate: null }, 'Health Auto Export'))
    expect(rendered).toContain('Observed by')
    expect(rendered).toContain('Received through Health Auto Export')
    expect(rendered).toContain('Why this source?')
    expect(rendered).not.toContain('>Health Auto Export<')
  })

  it('explains a stored completeness override from bounded evidence', () => {
    const selected = night(
      '2026-09-23',
      { key: 'circular', name: 'Circular' },
      {
        minutes: 384,
        selectionReason: 'completeness_override',
        evidence: evidence('circular', 'Circular', 384, 'analysis_eligible', [
          { logicalSourceKey: 'apple_watch', sourceName: 'Apple Watch', totalSleepMinutes: 182, timeInBedMinutes: 200, status: 'analysis_eligible' },
          { logicalSourceKey: 'circular', sourceName: 'Circular', totalSleepMinutes: 384, timeInBedMinutes: 430, status: 'analysis_eligible' },
        ]),
      },
    )
    const detail = deriveNightSourceAttribution(selected)
    expect(detail.selectedSourceName).toBe('Circular')
    expect(detail.selectionExplanation).toContain('Apple Watch')
    expect(detail.selectionExplanation).toContain('substantially incomplete')
    const rendered = html(buildSleepNightDetail(selected))
    expect(rendered).toContain('Apple Watch 3h 2m')
    expect(rendered).toContain('Circular 6h 24m · selected')
    expect(rendered).not.toMatch(/more accurate|bad data|device failure/i)
  })

  it('keeps partial and in-bed explanations from changing the night', () => {
    const partial = deriveNightSourceAttribution(
      night('2026-09-11', { key: 'apple_watch', name: 'Apple Watch' }, { minutes: 151, observationStatus: 'partial_observation', analysisEligible: false, stageAnalysisEligible: false, selectionReason: 'partial_only' }),
    )
    expect(partial.selectionLabel).toContain('No complete Sleep observation was available')
    expect(partial.analysisEligible).toBe(false)
    const inBed = deriveNightSourceAttribution(
      night('2026-09-12', { key: 'iphone', name: 'iPhone' }, { minutes: null, observationStatus: 'in_bed_only', analysisEligible: false, stageAnalysisEligible: false, selectionReason: 'in_bed_only' }),
    )
    expect(inBed.selectionLabel).toContain('No actual-sleep observation was available')
    expect(
      deriveNightSourceAttribution(night('2026-09-13', { key: 'apple_watch', name: 'Apple Watch' }, { selectionReason: 'legacy_reason' as SleepNightlySummary['selectionReason'] })).selectionLabel,
    ).toBe('Selection reason unavailable')
  })

  it('derives transitions from consecutive observed nights and preserves gaps', () => {
    const direct = deriveSleepSourceTransitions([
      night('2026-09-10'),
      night('2026-09-11'),
      night('2026-09-12', { key: 'circular', name: 'Circular' }),
    ])
    expect(direct).toEqual([
      expect.objectContaining({
        fromSource: 'Apple Watch',
        toSource: 'Circular',
        previousSleepDate: '2026-09-11',
        nextSleepDate: '2026-09-12',
        gapDays: 1,
        identityUnavailable: false,
      }),
    ])
    const gapped = deriveSleepSourceTransitions([night('2026-09-10'), night('2026-09-12', { key: 'circular', name: 'Circular' })])
    expect(gapped[0]).toEqual(expect.objectContaining({ previousSleepDate: '2026-09-10', nextSleepDate: '2026-09-12', gapDays: 2 }))
    expect(deriveSleepSourceTransitions([night('2026-09-10'), night('2026-09-12')])).toEqual([])
    const unknown = deriveSleepSourceTransitions([night('2026-09-10', { key: 'unknown', name: 'Unknown source' }), night('2026-09-11')])
    expect(unknown[0]?.identityUnavailable).toBe(true)
    expect(unknown[0]?.fromSource).toBe('Unknown source')
    expect(assessSleepSourceComparability([night('2026-09-01', { key: 'unknown', name: 'Unknown source' }), night('2026-09-02', { key: 'unknown', name: 'Unknown source' })])).toBe('unknown_source')
    expect(assessSleepSourceComparability([night('2026-09-01'), night('2026-09-02', { key: 'unknown', name: 'Unknown source' })])).toBe('unknown_source_present')
  })

  it('reconciles source counts and excludes future nights', () => {
    const nights = [
      night('2026-09-01'),
      night('2026-09-02', { key: 'circular', name: 'Circular' }, { stageAnalysisEligible: false }),
      night('2026-09-03', { key: 'circular', name: 'Circular' }, { observationStatus: 'partial_observation', analysisEligible: false, stageAnalysisEligible: false, selectionReason: 'partial_only' }),
      night('2026-09-04', { key: 'iphone', name: 'iPhone' }, { minutes: null, observationStatus: 'in_bed_only', analysisEligible: false, stageAnalysisEligible: false, selectionReason: 'in_bed_only' }),
      night('2026-09-05', { key: 'apple_watch', name: 'Apple Watch' }, { selectionReason: 'completeness_override' }),
      night('2026-09-20', { key: 'circular', name: 'Circular' }),
    ]
    const view = buildSleepProgressView(nights, { range: '30d', asOf: '2026-09-10' })
    const attribution = view.sourceAttribution
    expect(attribution.canonicalNights).toBe(5)
    expect(attribution.sourceBreakdown.reduce((sum, item) => sum + item.canonicalNights, 0)).toBe(attribution.canonicalNights)
    expect(attribution.sourceBreakdown.reduce((sum, item) => sum + item.analysisEligibleNights, 0)).toBe(attribution.analysisEligibleNights)
    expect(attribution.sourceBreakdown.reduce((sum, item) => sum + item.stageEligibleNights, 0)).toBe(attribution.stageEligibleNights)
    expect(attribution.transitions.some((item) => item.nextSleepDate > '2026-09-10')).toBe(false)
    expect(attribution.selectionReasonBreakdown.find((item) => item.selectionReason === 'completeness_override')?.count).toBe(1)
    expect(attribution.selectionReasonBreakdown.find((item) => item.selectionReason === 'partial_only')?.count).toBe(1)
    expect(attribution.selectionReasonBreakdown.find((item) => item.selectionReason === 'in_bed_only')?.count).toBe(1)
    const changed = nights.map((item) => (item.sleepDate === '2026-09-05' ? night('2026-09-05', { key: 'circular', name: 'Circular' }) : item))
    const next = deriveSleepSourceAttribution(
      changed.filter((item) => item.sleepDate <= '2026-09-10'),
      { range: '30d', asOf: '2026-09-10', start: '2026-08-12', end: '2026-09-10' },
    )
    expect(next.transitions).not.toEqual(attribution.transitions)
  })

  it('keeps E4 same-source baselines and withholds a cross-source fallback', () => {
    const priors = ['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29'].map((date, index) =>
      night(date, { key: 'apple_watch', name: 'Apple Watch' }, { minutes: 400 + index * 10 }),
    )
    const target = night('2026-09-30', { key: 'circular', name: 'Circular' }, { minutes: 390 })
    const appleHistory = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07'].map((date) => night(date))
    const before = computeSleepDurationBaseline([...appleHistory, ...priors, target], target)
    const view = buildSleepProgressView([...appleHistory, ...priors, target], { range: '30d', asOf: '2026-09-30' })
    expect(view.personalBaseline).toEqual(before)
    expect(before.state).toBe('insufficient_history')
    expect(view.sourceAttribution.baselineSeparationNote).toContain('Older Apple Watch nights are kept separate')
    expect(JSON.stringify(before)).not.toMatch(/quality_score|accuracy_score/)
    const again = computeSleepDurationBaseline([...appleHistory, ...priors, target], target)
    expect(again).toEqual(before satisfies SleepPersonalBaseline)
  })

  it('keeps a vital source independent of the selected Sleep source', () => {
    const registry: SleepVitalDefinition[] = SLEEP_VITAL_REGISTRY.map((item) => ({ ...item, enabled: item.metricKey === 'hrv_sdnn' }))
    const target = night('2026-09-23', { key: 'circular', name: 'Circular' })
    const sample: SleepVitalObservation = {
      id: 'hrv',
      metricKey: 'hrv_sdnn',
      value: 46,
      unit: 'ms',
      observedAt: '2026-09-23T08:00:00.000Z',
      startAt: null,
      endAt: null,
      sourceFamily: 'Apple Watch',
      sourceFamilyKey: 'apple_watch',
      fingerprint: 'hrv',
    }
    const detail = buildSleepNightDetail(target, { previousSleepDate: null, nextSleepDate: null }, null, [sample], registry)
    expect(detail.sourceName).toBe('Circular')
    expect(detail.overnightVitals[0]?.sourceFamily).toBe('Apple Watch')
    expect(detail.overnightVitals[0]?.label).toBe('HRV (SDNN)')
    const rendered = html(detail)
    expect(rendered).toContain('Sleep stages were observed by Circular. HRV (SDNN) was observed separately by Apple Watch.')
    expect(rendered).not.toContain('HRV (SDNN) · Circular')
    const empty = buildSleepNightDetail(target, { previousSleepDate: null, nextSleepDate: null }, null, [sample])
    expect(empty.overnightVitals).toEqual([])
    expect(html(empty)).not.toContain('HRV')
  })

  it('renders demo attribution without an owner API or a score', () => {
    const view = demoSleep('90d')
    expect(view.sourceAttribution.comparability).toBe('mixed_sources')
    expect(view.sourceAttribution.calculationVersion).toBe(SLEEP_SOURCE_ATTRIBUTION_VERSION)
    expect(view.sourceAttribution.sourceBreakdown.some((item) => item.sourceName === 'Bedside sensor')).toBe(true)
    expect(view.sourceAttribution.transitions.some((item) => item.fromSource === 'Wrist tracker' && item.toSource === 'Bedside sensor')).toBe(true)
    expect(view.sourceAttribution.transitions.some((item) => item.fromSource === 'Bedside sensor' && item.toSource === 'Wrist tracker')).toBe(true)
    const rendered = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(SleepSection, { view })))
    expect(rendered).toContain('Source continuity')
    expect(rendered).toContain('Mixed sleep sources in this range')
    expect(rendered).toContain('Latest selected source')
    expect(rendered).not.toMatch(/most accurate|quality score|Prefer Circular|Current device/i)
    const detail = demoSleepNightDetail('2026-09-15')
    expect(detail?.sourceAttribution.selectedSourceName).toBe('Wrist tracker')
    expect(detail?.sourceAttribution.calculationVersion).toBe(SLEEP_SOURCE_ATTRIBUTION_VERSION)
    const historical = buildSleepProgressView(demoDataset().sleep, { range: '30d', asOf: '2026-08-01' })
    const bounded = buildSleepProgressView(
      demoDataset().sleep.filter((item) => item.sleepDate <= '2026-08-01'),
      { range: '30d', asOf: '2026-08-01' },
    )
    expect(historical.sourceAttribution).toEqual(bounded.sourceAttribution)
    expect(readFileSync('src/domain/sleep/source-attribution.ts', 'utf8')).not.toMatch(/INSERT|UPDATE|sleep_intervals|quality_score|Prefer Circular/)
    expect(readFileSync('server/backup/format.ts', 'utf8')).toContain("'logical_source_key'")
    expect(readFileSync('src/features/today/TodayPage.tsx', 'utf8')).not.toContain('Source changed')
    expect(readFileSync('src/domain/progress/timeline.ts', 'utf8')).not.toContain('source_transition')
    expect(readFileSync('server/handlers/progress-sleep.ts', 'utf8')).toContain('withOwnerAuth')
  })
})

describe('source attribution stays out of timeline events', () => {
  it('does not add a source-transition timeline kind', () => {
    const input = {
      asOf: '2026-09-15',
      range: '30d',
      start: '2026-08-17',
      end: '2026-09-15',
      today: '2026-09-15',
      exercises: [],
      sets: [],
      workouts: [],
      bodyObservations: [],
      nutritionEntries: [],
      nutritionTargets: [],
      activityDays: [],
      sleepNights: [],
      activityWorkouts: [],
    } as ProgressCanonicalInput
    const timeline = buildProgressTimeline(input)
    expect(timeline.events.every((event) => event.kind !== 'sleep_night' || event.kind === 'sleep_night')).toBe(true)
    expect(JSON.stringify(timeline)).not.toContain('source_transition')
  })
})
