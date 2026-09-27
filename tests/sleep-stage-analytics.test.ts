import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DEMO_AS_OF } from '../src/demo/constants.ts'
import { demoSleep } from '../src/demo/repository.ts'
import { addCalendarDays } from '../src/domain/progress/dates.ts'
import { trailingPeriod } from '../src/domain/progress/periods.ts'
import { parseProgressQuery } from '../server/progress/service.ts'
import { buildSleepProgressView } from '../src/domain/sleep/progress-view.ts'
import { buildSleepStageAnalytics } from '../src/domain/sleep/stage-analytics.ts'
import type { SleepNightlySummary } from '../src/domain/sleep/summarize.ts'
import { SleepSection } from '../src/features/progress/SleepSection.tsx'

function night(partial: Partial<SleepNightlySummary> & { sleepDate: string }): SleepNightlySummary {
  const total = partial.totalSleepMinutes === undefined ? 400 : partial.totalSleepMinutes
  const base: SleepNightlySummary = {
    sleepDate: partial.sleepDate,
    timezone: 'America/Phoenix',
    logicalSourceKey: 'apple_watch',
    sourceName: 'Apple Watch',
    startAt: `${partial.sleepDate}T07:00:00.000Z`,
    endAt: `${partial.sleepDate}T14:00:00.000Z`,
    totalSleepMinutes: total,
    timeInBedMinutes: total == null ? null : total + 20,
    awakeMinutes: 10,
    coreMinutes: 200,
    deepMinutes: 80,
    remMinutes: 80,
    unspecifiedSleepMinutes: total == null ? null : Math.max(0, total - 360),
    stageCoveragePct: 96,
    stageConflictMinutes: 0,
    observationStatus: 'analysis_eligible',
    analysisEligible: true,
    stageAnalysisEligible: true,
    selectionReason: 'source_priority',
    calculationVersion: 'sleep-night-v1',
    evidence: {
      selectedLogicalSource: 'apple_watch',
      selectedSourceName: 'Apple Watch',
      selectedDurationMinutes: total,
      selectedStatus: 'analysis_eligible',
      alternatives: [],
      sourcePriority: ['apple_watch'],
      completenessOverride: false,
      intervalCount: 1,
      stageCoveragePct: 96,
      additionalEpisodeCount: 0,
      calculationVersion: 'sleep-night-v1',
    },
  }
  return { ...base, ...partial, evidence: partial.evidence ?? base.evidence }
}

function equalNights(dates: string[], source: { key: string; name: string }, stages: { rem: number; core: number; deep: number; unspecified: number }): SleepNightlySummary[] {
  const total = stages.rem + stages.core + stages.deep + stages.unspecified
  return dates.map((sleepDate) =>
    night({
      sleepDate,
      logicalSourceKey: source.key,
      sourceName: source.name,
      totalSleepMinutes: total,
      remMinutes: stages.rem,
      coreMinutes: stages.core,
      deepMinutes: stages.deep,
      unspecifiedSleepMinutes: stages.unspecified,
      evidence: {
        selectedLogicalSource: source.key,
        selectedSourceName: source.name,
        selectedDurationMinutes: total,
        selectedStatus: 'analysis_eligible',
        alternatives: [],
        sourcePriority: [source.key],
        completenessOverride: false,
        intervalCount: 1,
        stageCoveragePct: 96,
        additionalEpisodeCount: 0,
        calculationVersion: 'sleep-night-v1',
      },
    }),
  )
}

describe('sleep stage analytics', () => {
  it('follows the stored stage-eligibility flag and keeps missing distinct from zero', () => {
    const asOf = '2026-09-15'
    const included = night({ sleepDate: '2026-09-15', stageCoveragePct: 95, stageConflictMinutes: 0, deepMinutes: 0 })
    const lowCoverage = night({ sleepDate: '2026-09-14', stageAnalysisEligible: false, stageCoveragePct: 89, analysisEligible: true })
    const conflict = night({ sleepDate: '2026-09-13', stageAnalysisEligible: false, stageCoveragePct: 95, stageConflictMinutes: 12, analysisEligible: true })
    const partial = night({
      sleepDate: '2026-09-12',
      observationStatus: 'partial_observation',
      analysisEligible: false,
      stageAnalysisEligible: false,
      stageCoveragePct: 100,
      totalSleepMinutes: 120,
    })
    const analytics = buildSleepStageAnalytics([included, lowCoverage, conflict, partial], { range: '30d', asOf })
    expect(analytics.nightlySeries.map((point) => point.sleepDate)).toEqual(['2026-09-15'])
    expect(analytics.nightlySeries[0]?.deepMinutes).toBe(0)
    expect(analytics.nightlySeries[0]?.deepPct).toBe(0)
    expect(analytics.coverage.partialNights).toBe(1)
    expect(analytics.coverage.stageIneligibleCompleteNights).toBe(2)
    const domain = readFileSync('src/domain/sleep/stage-analytics.ts', 'utf8')
    expect(domain).not.toContain('isStageAnalysisEligible')
    expect(domain).not.toContain('sessionizeSleepEpisodes')
    expect(domain).not.toContain('arbitrateSleepNight')
  })

  it('requires three qualified nights and pools minutes instead of averaging nightly percentages', () => {
    const two = buildSleepStageAnalytics(
      [night({ sleepDate: '2026-09-14', totalSleepMinutes: 600, remMinutes: 100, coreMinutes: 300, deepMinutes: 150, unspecifiedSleepMinutes: 50 }), night({ sleepDate: '2026-09-15', totalSleepMinutes: 300, remMinutes: 150, coreMinutes: 90, deepMinutes: 30, unspecifiedSleepMinutes: 30 })],
      { range: '30d', asOf: '2026-09-15' },
    )
    expect(two.state).toBe('insufficient_data')
    expect(two.composition).toBeNull()
    expect(two.nightlySeries).toHaveLength(2)
    const nights = [
      night({ sleepDate: '2026-09-13', totalSleepMinutes: 600, remMinutes: 100, coreMinutes: 300, deepMinutes: 150, unspecifiedSleepMinutes: 50 }),
      night({ sleepDate: '2026-09-14', totalSleepMinutes: 300, remMinutes: 150, coreMinutes: 90, deepMinutes: 30, unspecifiedSleepMinutes: 30 }),
      night({ sleepDate: '2026-09-15', totalSleepMinutes: 300, remMinutes: 60, coreMinutes: 150, deepMinutes: 0, unspecifiedSleepMinutes: 90 }),
    ]
    const three = buildSleepStageAnalytics(nights, { range: '30d', asOf: '2026-09-15' })
    expect(three.state).toBe('available')
    expect(three.composition?.remPct).toBeCloseTo((100 + 150 + 60) / (600 + 300 + 300) * 100)
    expect(three.composition?.remPct).not.toBeCloseTo((100 / 600 + 150 / 300 + 60 / 300) / 3 * 100)
    const unspecifiedShare = three.composition!.unspecifiedPct
    const namedShare = three.composition!.remPct + three.composition!.corePct + three.composition!.deepPct
    expect(namedShare + unspecifiedShare).toBeCloseTo(100)
    expect(unspecifiedShare).toBeGreaterThan(0)
    expect(three.composition?.deepMinutesAvg).toBe((150 + 30 + 0) / three.coverage.stageEligibleNights)
    expect(three.coverage.stageEligibleNights).toBe(3)
  })

  it('keeps the ordinary sleep-duration average on analysis-eligible nights', () => {
    const complete = night({ sleepDate: '2026-09-10', totalSleepMinutes: 480, stageAnalysisEligible: false, stageCoveragePct: 70 })
    const qualified = ['2026-09-13', '2026-09-14', '2026-09-15'].map((sleepDate) =>
      night({ sleepDate, totalSleepMinutes: 360, remMinutes: 80, coreMinutes: 180, deepMinutes: 70, unspecifiedSleepMinutes: 30 }),
    )
    const view = buildSleepProgressView([complete, ...qualified], { range: '30d', asOf: '2026-09-15' })
    expect(view.analysisEligibleNights).toBe(4)
    expect(view.averageTotalSleepMinutes.status).toBe('available')
    if (view.averageTotalSleepMinutes.status === 'available') {
      expect(view.averageTotalSleepMinutes.value).toBe((480 + 360 * 3) / 4)
    }
    expect(view.stageAnalytics.coverage.stageEligibleNights).toBe(3)
    expect(view.stageAnalytics.coverage.analysisEligibleNights).toBe(4)
    expect(view.stageAnalytics.composition?.averageTotalSleepMinutes).toBe(360)
  })

  it('omits missing and ineligible nights and reports sources deterministically', () => {
    const nights = [
      ...Array.from({ length: 5 }, (_, index) => night({ sleepDate: `2026-09-${String(10 + index).padStart(2, '0')}`, logicalSourceKey: 'apple_watch', sourceName: 'Apple Watch' })),
      ...Array.from({ length: 3 }, (_, index) => night({ sleepDate: `2026-09-0${index + 1}`, logicalSourceKey: 'circular', sourceName: 'Circular' })),
      night({ sleepDate: '2026-08-20', stageAnalysisEligible: false, analysisEligible: true, stageCoveragePct: 40 }),
    ]
    const analytics = buildSleepStageAnalytics(nights, { range: '90d', asOf: '2026-09-15' })
    expect(analytics.nightlySeries.some((point) => point.sleepDate === '2026-08-20')).toBe(false)
    expect(analytics.nightlySeries.some((point) => point.sleepDate === '2026-08-21')).toBe(false)
    expect(analytics.sourceBreakdown).toEqual([
      { sourceFamily: 'apple_watch', sourceName: 'Apple Watch', stageEligibleNights: 5 },
      { sourceFamily: 'circular', sourceName: 'Circular', stageEligibleNights: 3 },
    ])
    const first = night({ sleepDate: '2026-09-15', logicalSourceKey: 'circular', sourceName: 'Circular', remMinutes: 10, coreMinutes: 200, deepMinutes: 80, unspecifiedSleepMinutes: 110, totalSleepMinutes: 400 })
    const second = night({ sleepDate: '2026-09-15', logicalSourceKey: 'apple_watch', sourceName: 'Apple Watch', remMinutes: 90, coreMinutes: 200, deepMinutes: 80, unspecifiedSleepMinutes: 30, totalSleepMinutes: 400 })
    const spliced = buildSleepStageAnalytics([first, second, night({ sleepDate: '2026-09-14' }), night({ sleepDate: '2026-09-13' })], { range: '30d', asOf: '2026-09-15' })
    expect(spliced.nightlySeries.find((point) => point.sleepDate === '2026-09-15')?.remMinutes).toBe(10)
    expect(spliced.nightlySeries.find((point) => point.sleepDate === '2026-09-15')?.sourceFamily).toBe('circular')
  })

  it('compares same-source weeks in percentage points and suppresses mixed or changed sources', () => {
    const previousDates = ['2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06']
    const currentDates = ['2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12']
    const watch = { key: 'apple_watch', name: 'Apple Watch' }
    const available = buildSleepStageAnalytics(
      [
        ...equalNights(previousDates, watch, { rem: 20, core: 50, deep: 20, unspecified: 10 }),
        ...equalNights(currentDates, watch, { rem: 24, core: 46, deep: 20, unspecified: 10 }),
      ],
      { range: '30d', asOf: '2026-09-15' },
    )
    expect(available.recentComparison.state).toBe('available')
    expect(available.recentComparison.remPercentagePoints).toBeCloseTo(4)
    expect(available.recentComparison.remPercentagePoints).not.toBeCloseTo(20)
    expect(available.coverage.stageEligibleNights).toBeGreaterThanOrEqual(3)
    const short = buildSleepStageAnalytics(
      [
        ...equalNights(previousDates.slice(0, 3), watch, { rem: 20, core: 50, deep: 20, unspecified: 10 }),
        ...equalNights(currentDates, watch, { rem: 24, core: 46, deep: 20, unspecified: 10 }),
      ],
      { range: '30d', asOf: '2026-09-15' },
    )
    expect(short.recentComparison.state).toBe('insufficient_data')
    expect(short.recentComparison.remPercentagePoints).toBeNull()
    const mixed = buildSleepStageAnalytics(
      [
        ...equalNights(previousDates.slice(0, 4), watch, { rem: 20, core: 50, deep: 20, unspecified: 10 }),
        ...equalNights(['2026-09-09', '2026-09-10'], watch, { rem: 24, core: 46, deep: 20, unspecified: 10 }),
        ...equalNights(['2026-09-11', '2026-09-12'], { key: 'circular', name: 'Circular' }, { rem: 24, core: 46, deep: 20, unspecified: 10 }),
      ],
      { range: '30d', asOf: '2026-09-15' },
    )
    expect(mixed.recentComparison.state).toBe('source_mixed')
    expect(mixed.recentComparison.remPercentagePoints).toBeNull()
    const switched = buildSleepStageAnalytics(
      [
        ...equalNights(previousDates.slice(0, 4), watch, { rem: 20, core: 50, deep: 20, unspecified: 10 }),
        ...equalNights(currentDates, { key: 'circular', name: 'Circular' }, { rem: 40, core: 30, deep: 20, unspecified: 10 }),
      ],
      { range: '30d', asOf: '2026-09-15' },
    )
    expect(switched.recentComparison.state).toBe('source_changed')
    expect(switched.recentComparison.deepPercentagePoints).toBeNull()
  })

  it('includes a night ending on asOf and honors range edges without a future-asOf ban beyond Progress', () => {
    const asOf = '2026-09-15'
    const today = night({ sleepDate: asOf })
    const analytics = buildSleepStageAnalytics([today, night({ sleepDate: '2026-09-16' })], { range: '30d', asOf })
    expect(analytics.nightlySeries.map((point) => point.sleepDate)).toEqual([asOf])
    for (const range of ['30d', '90d', '6m', '1y'] as const) {
      const period = trailingPeriod(range, asOf, '2026-01-07')
      const view = buildSleepStageAnalytics(
        [night({ sleepDate: period.start }), night({ sleepDate: addCalendarDays(period.start, -1) }), night({ sleepDate: asOf })],
        { range, asOf },
      )
      expect(view.start).toBe(period.start)
      expect(view.end).toBe(asOf)
      expect(view.nightlySeries.some((point) => point.sleepDate === period.start)).toBe(true)
      expect(view.nightlySeries.some((point) => point.sleepDate === addCalendarDays(period.start, -1))).toBe(false)
    }
    const allPeriod = trailingPeriod('all', asOf, '2026-01-07')
    const allView = buildSleepStageAnalytics([night({ sleepDate: '2026-01-07' }), night({ sleepDate: asOf }), night({ sleepDate: '2026-09-16' })], { range: 'all', asOf })
    expect(allView.start).toBe(allPeriod.start)
    expect(allView.nightlySeries.map((point) => point.sleepDate)).toEqual(['2026-01-07', asOf])
    const past = buildSleepStageAnalytics([night({ sleepDate: '2026-09-15' }), night({ sleepDate: '2026-09-10' })], { range: 'all', asOf: '2026-09-12' })
    expect(past.nightlySeries.map((point) => point.sleepDate)).toEqual(['2026-09-10'])
    expect(parseProgressQuery({ range: '30d', asOf: '2026-09-16', now: new Date('2026-09-15T18:00:00.000Z') }).asOf).toBe('2026-09-16')
    expect(JSON.stringify(analytics)).not.toMatch(/heartRate|hrv|spo2|respiratory|temperature|readiness|sleepScore|stageScore/i)
    const intelligence = readFileSync('src/domain/intelligence/analyze.ts', 'utf8')
    const goals = readFileSync('src/domain/goals.ts', 'utf8')
    expect(intelligence).not.toContain('remMinutes')
    expect(intelligence).not.toContain('stageAnalytics')
    expect(goals).not.toContain('remMinutes')
    const section = readFileSync('src/features/progress/SleepStageSection.tsx', 'utf8')
    expect(section).toContain('nightPath(point.sleepDate)')
    expect(section).not.toMatch(/better|worse|improved|declined|healthy range|sleep score|readiness/i)
  })
})

describe('demo stage analytics', () => {
  it('renders fictional stage composition without an owner API', () => {
    const repository = readFileSync('src/demo/repository.ts', 'utf8')
    expect(repository).not.toMatch(/healthFetch|getSql/)
    const year = demoSleep('1y')
    const view = demoSleep('30d')
    expect(view.asOf).toBe(DEMO_AS_OF)
    expect(view.stageAnalytics.calculationVersion).toBe('sleep-stage-analytics-v1')
    expect(view.stageAnalytics.state).toBe('available')
    expect(year.stageAnalytics.coverage.stageEligibleNights).toBeLessThan(year.stageAnalytics.coverage.analysisEligibleNights)
    expect(year.stageAnalytics.nightlySeries.some((point) => point.sleepDate === '2026-04-16')).toBe(false)
    expect(year.stageAnalytics.nightlySeries.some((point) => point.sleepDate === '2026-07-08')).toBe(false)
    expect(year.stageAnalytics.nightlySeries.some((point) => point.sleepDate === '2026-02-19')).toBe(false)
    expect(view.stageAnalytics.sourceBreakdown.map((item) => item.sourceName).sort()).toEqual(['Bedside sensor', 'Wrist tracker'])
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(SleepSection, { view })),
    )
    expect(html).toContain('Stage composition')
    expect(html).toContain('Mixed sleep sources in this range')
    expect(html).toContain('Bedside sensor')
    expect(html).not.toMatch(/sleep score|readiness|healthy range/i)
  })
})
