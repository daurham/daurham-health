import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { buildActivityProgressView, type ActivityDailyRow } from '../src/domain/activity/index.ts'
import type { SleepNightlySummary } from '../src/domain/sleep/index.ts'
import { buildSleepProgressView } from '../src/domain/sleep/progress-view.ts'
import { ActivitySection } from '../src/features/progress/ActivitySection.tsx'
import { ActivitySleepCards } from '../src/features/progress/ActivitySleepOverview.tsx'
import { activityCoverageLine } from '../src/features/progress/activity-sleep-copy.ts'
import { SleepSection } from '../src/features/progress/SleepSection.tsx'

function activityRow(date: string, values: Partial<ActivityDailyRow> = {}): ActivityDailyRow {
  return {
    date,
    timezone: 'America/Phoenix',
    stepsCount: null,
    activeEnergyKcal: null,
    exerciseMinutes: null,
    walkingRunningDistanceM: 1200,
    restingHeartRateBpm: null,
    ...values,
  }
}

function night(overrides: Partial<SleepNightlySummary> & Pick<SleepNightlySummary, 'sleepDate'>): SleepNightlySummary {
  const base: SleepNightlySummary = {
    sleepDate: overrides.sleepDate,
    timezone: 'America/Phoenix',
    logicalSourceKey: 'apple_watch',
    sourceName: 'Apple Watch',
    startAt: '2026-06-14T06:00:00.000Z',
    endAt: '2026-06-14T14:00:00.000Z',
    totalSleepMinutes: 592,
    timeInBedMinutes: 620,
    awakeMinutes: 28,
    coreMinutes: 240,
    deepMinutes: 90,
    remMinutes: 110,
    unspecifiedSleepMinutes: 152,
    stageCoveragePct: 96,
    stageConflictMinutes: 0,
    observationStatus: 'analysis_eligible',
    analysisEligible: true,
    stageAnalysisEligible: false,
    selectionReason: 'source_priority',
    calculationVersion: 'sleep-night-v1',
    evidence: {
      selectedLogicalSource: 'apple_watch',
      selectedSourceName: 'Apple Watch',
      selectedDurationMinutes: 592,
      selectedStatus: 'analysis_eligible',
      alternatives: [],
      sourcePriority: ['apple_watch', 'circular', 'sleep_cycle'],
      completenessOverride: false,
      intervalCount: 4,
      stageCoveragePct: 96,
      additionalEpisodeCount: 0,
      calculationVersion: 'sleep-night-v1',
    },
  }
  return { ...base, ...overrides, evidence: overrides.evidence ?? base.evidence }
}

describe('activity progress view', () => {
  it('keeps missing days empty and renders an explicit zero as zero', () => {
    const view = buildActivityProgressView(
      [
        activityRow('2026-09-20', { stepsCount: 0 }),
        activityRow('2026-09-22', { stepsCount: 8000 }),
      ],
      { range: '30d', asOf: '2026-09-22' },
    )
    const byDate = new Map(view.steps.series.map((point) => [point.date, point.value]))
    expect(byDate.get('2026-09-20')).toBe(0)
    expect(byDate.get('2026-09-21')).toBeNull()
    expect(byDate.get('2026-09-22')).toBe(8000)
    expect(view.steps.series).toHaveLength(30)
    expect(view.steps.series.at(-1)?.date).toBe('2026-09-22')
    expect(view.range).toBe('30d')
    expect(view.steps.summary.status).toBe('available')
    if (view.steps.summary.status === 'available') {
      expect(view.steps.summary.value).toBe(4000)
    }
  })

  it('shows metric coverage, a resting HR median, and an insufficient 7-day comparison', () => {
    const rows = [
      activityRow('2026-09-20', { stepsCount: 8000, restingHeartRateBpm: 60 }),
      activityRow('2026-09-21', { stepsCount: 8000, restingHeartRateBpm: 70 }),
      activityRow('2026-09-22', { stepsCount: 8000, restingHeartRateBpm: 62 }),
    ]
    const view = buildActivityProgressView(rows, { range: '30d', asOf: '2026-09-22' })
    expect(view.steps.summary.observedDays).toBe(3)
    expect(view.steps.summary.calendarDays).toBe(30)
    expect(view.steps.summary.coveragePct).toBe(10)
    expect(activityCoverageLine(view.steps)).toBe('3 of 30 days observed · 10%')
    expect(view.restingHeartRate.summary.status).toBe('available')
    if (view.restingHeartRate.summary.status === 'available') {
      expect(view.restingHeartRate.summary.value).toBe(62)
      expect(view.restingHeartRate.summary.basis).toBe('observed_median')
    }
    expect(view.steps.recent.status).toBe('insufficient_data')
    expect(view.activeEnergy.summary.status).toBe('insufficient_data')
    expect(view.activeEnergy.summary.observedDays).toBe(0)
  })

  it('leaves walking and running distance unsupported', () => {
    const view = buildActivityProgressView([activityRow('2026-09-22', { stepsCount: 1000, walkingRunningDistanceM: 5000 })], {
      range: '30d',
      asOf: '2026-09-22',
    })
    expect(view.walkingRunningDistance.summary.status).toBe('unsupported')
    expect(view.walkingRunningDistance.recent.status).toBe('unsupported')
    expect(view.steps.series.some((point) => point.value === 5000)).toBe(false)
  })

  it('changes series length with the selected range', () => {
    const rows = [activityRow('2026-09-22', { stepsCount: 1000 })]
    const month = buildActivityProgressView(rows, { range: '30d', asOf: '2026-09-22' })
    const quarter = buildActivityProgressView(rows, { range: '90d', asOf: '2026-09-22' })
    expect(month.steps.series).toHaveLength(30)
    expect(quarter.steps.series).toHaveLength(90)
    expect(month.range).toBe('30d')
    expect(quarter.end).toBe(month.end)
    expect(quarter.start < month.start).toBe(true)
  })
})

describe('sleep progress view', () => {
  const eligible = night({
    sleepDate: '2026-06-14',
    totalSleepMinutes: 592,
    sourceName: 'Apple Watch',
  })
  const partial = night({
    sleepDate: '2026-08-21',
    totalSleepMinutes: 82,
    timeInBedMinutes: 90,
    observationStatus: 'partial_observation',
    analysisEligible: false,
    stageAnalysisEligible: false,
    stageCoveragePct: 40,
    selectionReason: 'partial_only',
    coreMinutes: 82,
    deepMinutes: null,
    remMinutes: null,
    unspecifiedSleepMinutes: null,
  })
  const inBed = night({
    sleepDate: '2026-08-20',
    totalSleepMinutes: null,
    timeInBedMinutes: 430,
    observationStatus: 'in_bed_only',
    analysisEligible: false,
    stageAnalysisEligible: false,
    stageCoveragePct: null,
    selectionReason: 'in_bed_only',
    sourceName: 'iPhone',
    awakeMinutes: null,
    coreMinutes: null,
    deepMinutes: null,
    remMinutes: null,
    unspecifiedSleepMinutes: null,
  })

  it('averages and covers only analysis-eligible nights', () => {
    const view = buildSleepProgressView([eligible, partial, inBed], { range: '1y', asOf: '2026-09-22' })
    expect(view.analysisEligibleNights).toBe(1)
    expect(view.averageTotalSleepMinutes.status).toBe('available')
    if (view.averageTotalSleepMinutes.status === 'available') {
      expect(view.averageTotalSleepMinutes.value).toBe(592)
    }
    expect(view.coveragePct).toBeCloseTo((1 / view.calendarNights) * 100)
    const august = view.series.find((point) => point.date === '2026-08-21')
    expect(august).toEqual({ date: '2026-08-21', eligibleMinutes: null, partialMinutes: 82 })
    const bed = view.series.find((point) => point.date === '2026-08-20')
    expect(bed).toEqual({ date: '2026-08-20', eligibleMinutes: null, partialMinutes: null })
    expect(view.recentNights.some((item) => item.sleepDate === '2026-08-21' && item.status === 'partial_observation')).toBe(true)
  })

  it('points a range with no complete nights at the latest known complete night', () => {
    const view = buildSleepProgressView([eligible, partial], { range: '30d', asOf: '2026-09-22' })
    expect(view.analysisEligibleNights).toBe(0)
    expect(view.latestEligibleInRange).toBeNull()
    expect(view.latestEligibleKnown?.sleepDate).toBe('2026-06-14')
    expect(view.latestEligibleKnown?.totalSleepMinutes).toBe(592)
    expect(view.hasAnyNights).toBe(true)
    expect(view.recentAppliesToRange).toBe(false)
    expect(view.recentNights.some((item) => item.sleepDate === '2026-08-21')).toBe(false)
    expect(JSON.stringify(view.recentNights)).not.toContain('evidence')
    expect(JSON.stringify(view.latestEligibleKnown)).not.toContain('HKDevice')
  })

  it('requires stage-analysis-eligible nights before averaging stages', () => {
    const lowCoverage = night({
      sleepDate: '2026-09-01',
      stageAnalysisEligible: false,
      stageCoveragePct: 40,
      coreMinutes: 300,
    })
    const staged = night({
      sleepDate: '2026-09-02',
      stageAnalysisEligible: true,
      stageCoveragePct: 96,
      coreMinutes: 120,
      deepMinutes: 60,
      remMinutes: 90,
      unspecifiedSleepMinutes: 30,
      sourceName: 'Sleep Cycle',
      logicalSourceKey: 'sleep_cycle',
    })
    const hidden = buildSleepProgressView([lowCoverage], { range: '30d', asOf: '2026-09-22' })
    expect(hidden.stageEligibleNights).toBe(0)
    expect(hidden.averageCoreMinutes.status).toBe('insufficient_data')
    const shown = buildSleepProgressView([lowCoverage, staged], { range: '30d', asOf: '2026-09-22' })
    expect(shown.stageEligibleNights).toBe(1)
    if (shown.averageCoreMinutes.status === 'available') {
      expect(shown.averageCoreMinutes.value).toBe(120)
    }
    expect(shown.recentNights.find((item) => item.sleepDate === '2026-09-02')?.sourceName).toBe('Sleep Cycle')
  })

  it('explains a completeness override without exposing evidence blobs', () => {
    const overridden = night({
      sleepDate: '2026-04-01',
      sourceName: 'Sleep Cycle',
      logicalSourceKey: 'sleep_cycle',
      selectionReason: 'completeness_override',
      evidence: {
        selectedLogicalSource: 'sleep_cycle',
        selectedSourceName: 'Sleep Cycle',
        selectedDurationMinutes: 556,
        selectedStatus: 'analysis_eligible',
        alternatives: [
          {
            logicalSourceKey: 'apple_watch',
            sourceName: 'Apple Watch',
            totalSleepMinutes: 302,
            timeInBedMinutes: null,
            status: 'analysis_eligible',
          },
        ],
        sourcePriority: ['apple_watch', 'circular', 'sleep_cycle'],
        completenessOverride: true,
        intervalCount: 2,
        stageCoveragePct: null,
        additionalEpisodeCount: 0,
        calculationVersion: 'sleep-night-v1',
      },
    })
    const view = buildSleepProgressView([overridden], { range: 'all', asOf: '2026-09-22' })
    expect(view.recentNights[0]?.overrideExplanation).toBe(
      'Sleep Cycle was used because the Apple Watch observation was substantially incomplete.',
    )
    expect(view.recentNights[0]).not.toHaveProperty('evidence')
    expect(JSON.stringify(view.recentNights)).not.toContain('HKDevice')
  })
})

describe('activity and sleep progress UI', () => {
  it('renders one activity metric, coverage, and no distance selector', () => {
    const view = buildActivityProgressView(
      [activityRow('2026-09-20', { stepsCount: 0 }), activityRow('2026-09-22', { stepsCount: 6842 })],
      { range: '30d', asOf: '2026-09-22' },
    )
    const html = renderToStaticMarkup(<ActivitySection view={view} />)
    expect(html).toContain('data-range="30d"')
    expect(html).toContain('Last 30 days')
    expect(html).not.toContain('Last 90 days')
    expect(html).toContain('Steps')
    expect(html).toContain('Resting HR')
    expect(html).toContain('of 30 days observed')
    expect(html).not.toMatch(/distance/i)
    expect(html).not.toMatch(/better|worse|healthier/i)
    const page = readFileSync('src/features/progress/ActivitySection.tsx', 'utf8')
    const chart = readFileSync('src/features/progress/ActivitySleepCharts.tsx', 'utf8')
    expect(page).toContain('useAtomicKeyedResource')
    expect(page).toContain('resource.committedKey')
    expect(page).toContain('resource.data.range === range')
    expect(chart).toContain('connectNulls={false}')
    expect(page + chart).not.toMatch(/gemini|home-ai|sleep score|recovery score/i)
  })

  it('shows partial nights as partial and hides stage percentages when coverage is low', () => {
    const view = buildSleepProgressView(
      [
        night({ sleepDate: '2026-06-14', totalSleepMinutes: 592, stageAnalysisEligible: true, stageCoveragePct: 96 }),
        night({
          sleepDate: '2026-08-21',
          totalSleepMinutes: 82,
          observationStatus: 'partial_observation',
          analysisEligible: false,
          stageAnalysisEligible: false,
          stageCoveragePct: 40,
          selectionReason: 'partial_only',
        }),
        night({
          sleepDate: '2026-08-20',
          totalSleepMinutes: null,
          timeInBedMinutes: 430,
          observationStatus: 'in_bed_only',
          analysisEligible: false,
          stageAnalysisEligible: false,
          selectionReason: 'in_bed_only',
          sourceName: 'iPhone',
        }),
      ],
      { range: '1y', asOf: '2026-09-22' },
    )
    const html = renderToStaticMarkup(<SleepSection view={view} />)
    expect(html).toContain('9h 52m average')
    expect(html).toContain('1h 22m observed')
    expect(html).toContain('Partial observation')
    expect(html).toContain('Apple Watch')
    expect(html).toContain('In-bed only')
    expect(html).toContain('7h 10m in bed')
    expect(html).toContain('Based on 1 night with complete stage data.')
    expect(html).not.toContain('40%')
    expect(html).not.toMatch(/sleep score|recovery score|quality grade/i)
    expect(html).not.toContain('Last night')
    const sleepPage = readFileSync('src/features/progress/SleepSection.tsx', 'utf8')
    expect(sleepPage).toContain('useAtomicKeyedResource')
    expect(sleepPage).toContain('resource.data.range === range')
    expect(sleepPage).not.toMatch(/gemini|home-ai/i)
  })

  it('shows the latest complete night when the selected range has none', () => {
    const view = buildSleepProgressView(
      [
        night({ sleepDate: '2026-06-14', totalSleepMinutes: 592 }),
        night({
          sleepDate: '2026-08-21',
          totalSleepMinutes: 82,
          observationStatus: 'partial_observation',
          analysisEligible: false,
          stageAnalysisEligible: false,
          selectionReason: 'partial_only',
        }),
      ],
      { range: '30d', asOf: '2026-09-22' },
    )
    const html = renderToStaticMarkup(<SleepSection view={view} />)
    expect(html).toContain('No complete sleep observations in the last 30 days.')
    expect(html).toContain('Latest complete night: Jun 14 · 9h 52m')
    expect(html).not.toContain('1h 22m')
    expect(html).not.toContain('sleep score')
  })

  it('explains a completeness override in the night detail', () => {
    const view = buildSleepProgressView(
      [
        night({
          sleepDate: '2026-04-01',
          sourceName: 'Sleep Cycle',
          logicalSourceKey: 'sleep_cycle',
          selectionReason: 'completeness_override',
          stageAnalysisEligible: false,
          evidence: {
            selectedLogicalSource: 'sleep_cycle',
            selectedSourceName: 'Sleep Cycle',
            selectedDurationMinutes: 556,
            selectedStatus: 'analysis_eligible',
            alternatives: [
              {
                logicalSourceKey: 'apple_watch',
                sourceName: 'Apple Watch',
                totalSleepMinutes: 302,
                timeInBedMinutes: null,
                status: 'analysis_eligible',
              },
            ],
            sourcePriority: ['apple_watch', 'sleep_cycle'],
            completenessOverride: true,
            intervalCount: 2,
            stageCoveragePct: null,
            additionalEpisodeCount: 0,
            calculationVersion: 'sleep-night-v1',
          },
        }),
      ],
      { range: 'all', asOf: '2026-09-22' },
    )
    const html = renderToStaticMarkup(<SleepSection view={view} />)
    expect(html).toContain('Sleep Cycle')
    expect(html).toContain('Sleep Cycle was used because the Apple Watch observation was substantially incomplete.')
    expect(html).toContain('Detailed sleep stages weren&#x27;t complete enough for analysis.')
    expect(html).not.toContain('Stage coverage')
  })

  it('renders overview cards, including stale sleep, with routes', () => {
    const activity = buildActivityProgressView([activityRow('2026-09-22', { stepsCount: 6842 })], {
      range: '30d',
      asOf: '2026-09-22',
    })
    const sleep = buildSleepProgressView([night({ sleepDate: '2026-06-14', totalSleepMinutes: 592 })], {
      range: '30d',
      asOf: '2026-09-22',
    })
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ActivitySleepCards range="30d" activity={activity} sleep={sleep} />
      </MemoryRouter>,
    )
    expect(html).toContain('Activity')
    expect(html).toContain('6,842 avg steps')
    expect(html).toContain('1 / 30 days observed')
    expect(html).toContain('Sleep')
    expect(html).toContain('No complete nights in this range')
    expect(html).toContain('Latest complete: Jun 14')
    expect(html).toContain('href="/progress/activity?range=30d"')
    expect(html).toContain('href="/progress/sleep?range=30d"')
    expect(html).not.toContain('9h 52m avg')
  })
})
