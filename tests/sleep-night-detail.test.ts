import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { demoSleepNightDetail } from '../src/demo/repository.ts'
import { buildSleepNightDetail, parseSleepDetailDate, type SleepNightDetail } from '../src/domain/sleep/night-detail.ts'
import type { SleepNightlySummary } from '../src/domain/sleep/summarize.ts'
import { mapSleepNightlySummaryRow } from '../server/sleep/queries.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'
import type { ProgressSleepObservation } from '../src/domain/progress/health-timeline.ts'
import { SleepNightDetailView } from '../src/features/progress/SleepNightPage.tsx'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'

function night(partial: Partial<SleepNightlySummary> = {}): SleepNightlySummary {
  return {
    sleepDate: '2026-09-23',
    timezone: 'America/Phoenix',
    logicalSourceKey: 'circular',
    sourceName: 'Circular',
    startAt: '2026-09-23T06:48:00.000Z',
    endAt: '2026-09-23T13:42:00.000Z',
    totalSleepMinutes: 384,
    timeInBedMinutes: 430,
    awakeMinutes: 18,
    coreMinutes: 200,
    deepMinutes: 62,
    remMinutes: 95,
    unspecifiedSleepMinutes: 27,
    stageCoveragePct: 93,
    stageConflictMinutes: 0,
    observationStatus: 'analysis_eligible',
    analysisEligible: true,
    stageAnalysisEligible: true,
    selectionReason: 'source_priority',
    calculationVersion: 'sleep-night-v1',
    ...partial,
    evidence: partial.evidence ?? {
      selectedLogicalSource: partial.logicalSourceKey ?? 'circular',
      selectedSourceName: partial.sourceName ?? 'Circular',
      selectedDurationMinutes: partial.totalSleepMinutes === undefined ? 384 : partial.totalSleepMinutes,
      selectedStatus: partial.observationStatus ?? 'analysis_eligible',
      alternatives: [
        {
          logicalSourceKey: 'apple_watch',
          sourceName: 'Apple Watch',
          totalSleepMinutes: 182,
          timeInBedMinutes: 200,
          status: 'partial_observation',
        },
        {
          logicalSourceKey: partial.logicalSourceKey ?? 'circular',
          sourceName: partial.sourceName ?? 'Circular',
          totalSleepMinutes: partial.totalSleepMinutes === undefined ? 384 : partial.totalSleepMinutes,
          timeInBedMinutes: 430,
          status: partial.observationStatus ?? 'analysis_eligible',
        },
      ],
      sourcePriority: ['apple_watch', 'circular'],
      completenessOverride: partial.selectionReason === 'completeness_override',
      intervalCount: 12,
      stageCoveragePct: partial.stageCoveragePct === undefined ? 93 : partial.stageCoveragePct,
      additionalEpisodeCount: 0,
      calculationVersion: 'sleep-night-v1',
    },
  }
}

function html(detail: SleepNightDetail): string {
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(SleepNightDetailView, { detail })),
  )
}

describe('sleep night detail', () => {
  it('keeps the stored canonical summary, source, and episode-end date', () => {
    const detail = buildSleepNightDetail(night(), { previousSleepDate: '2026-09-22', nextSleepDate: '2026-09-24' }, 'Health Auto Export')
    expect(detail.sleepDate).toBe('2026-09-23')
    expect(detail.episodeStart).toBe('2026-09-23T06:48:00.000Z')
    expect(detail.totalSleepMinutes).toBe(384)
    expect(detail.sourceName).toBe('Circular')
    expect(detail.transportName).toBe('Health Auto Export')
    expect(detail.selectionLabel).toBe('Selected preferred complete source.')
    expect(detail.stageShares).toEqual({ remPct: 24.7, corePct: 52.1, deepPct: 16.1 })
    expect(detail.unspecifiedSleepMinutes).toBe(27)
    expect(detail.stageTimeline).toBeNull()
    expect(detail.previousSleepDate).toBe('2026-09-22')
    const page = html(detail)
    expect(page).toContain('Circular')
    expect(page).toContain('6h 24m')
    expect(page).toContain('actual sleep')
    expect(page).toContain('Included in Sleep averages and trends')
    expect(page).toContain('Unspecified sleep')
    expect(page).toContain('Received through Health Auto Export')
    expect(page).toContain('Sep 23')
    expect(page).not.toContain('>Health Auto Export<')
    expect(page).not.toMatch(/sleep score|readiness|good sleep|healthy night/i)
  })

  it('shows a partial night without calling it complete', () => {
    const detail = buildSleepNightDetail(night({
      totalSleepMinutes: 171,
      observationStatus: 'partial_observation',
      analysisEligible: false,
      stageAnalysisEligible: false,
      selectionReason: 'partial_only',
      stageCoveragePct: null,
      coreMinutes: null,
      deepMinutes: null,
      remMinutes: null,
      unspecifiedSleepMinutes: null,
    }))
    expect(detail.analysisEligible).toBe(false)
    expect(detail.totalSleepMinutes).toBe(171)
    const page = html(detail)
    expect(page).toContain('2h 51m')
    expect(page).toContain('Partial sleep observation')
    expect(page).toContain('Excluded from Sleep averages and trends.')
    expect(page).not.toContain('Complete sleep observation')
  })

  it('does not describe in-bed-only evidence as zero sleep', () => {
    const detail = buildSleepNightDetail(night({
      totalSleepMinutes: null,
      awakeMinutes: null,
      timeInBedMinutes: 90,
      observationStatus: 'in_bed_only',
      analysisEligible: false,
      stageAnalysisEligible: false,
      selectionReason: 'in_bed_only',
      coreMinutes: null,
      deepMinutes: null,
      remMinutes: null,
      unspecifiedSleepMinutes: null,
      stageCoveragePct: null,
    }))
    expect(detail.eligibilityNote).toBe('No actual-sleep intervals observed')
    const page = html(detail)
    expect(page).toContain('No actual-sleep intervals observed')
    expect(page).toContain('1h 30m')
    expect(page).not.toMatch(/\b0m\b/)
    expect(page).not.toContain('0h')
    expect(page).not.toContain('0 hours')
  })

  it('hides stage percentages below the coverage rule and when stages conflict', () => {
    const low = buildSleepNightDetail(night({
      stageAnalysisEligible: false,
      stageCoveragePct: 72,
      remMinutes: 42,
      coreMinutes: 97,
      deepMinutes: 31,
      unspecifiedSleepMinutes: 20,
    }))
    expect(low.stageShares).toBeNull()
    expect(html(low)).toContain('Stage percentages are hidden')
    expect(html(low)).toContain('REM')
    expect(html(low)).toContain('42m observed')
    const conflict = buildSleepNightDetail(night({
      stageAnalysisEligible: false,
      stageConflictMinutes: 15,
      stageCoveragePct: 96,
    }))
    expect(conflict.stageShares).toBeNull()
    expect(html(conflict)).toContain('Stage intervals conflict for part of this night.')
    expect(html(conflict)).not.toContain('24.7%')
  })

  it('explains a stored completeness override without choosing a different source', () => {
    const detail = buildSleepNightDetail(night({
      logicalSourceKey: 'circular',
      sourceName: 'Circular',
      selectionReason: 'completeness_override',
      evidence: {
        selectedLogicalSource: 'circular',
        selectedSourceName: 'Circular',
        selectedDurationMinutes: 384,
        selectedStatus: 'analysis_eligible',
        alternatives: [
          {
            logicalSourceKey: 'apple_watch',
            sourceName: 'Apple Watch',
            totalSleepMinutes: 182,
            timeInBedMinutes: null,
            status: 'analysis_eligible',
          },
        ],
        sourcePriority: ['apple_watch', 'circular'],
        completenessOverride: true,
        intervalCount: 4,
        stageCoveragePct: 93,
        additionalEpisodeCount: 0,
        calculationVersion: 'sleep-night-v1',
      },
    }))
    expect(detail.sourceName).toBe('Circular')
    expect(detail.selectionReason).toBe('completeness_override')
    expect(detail.selectionLabel).toContain('more complete source')
    expect(detail.selectionExplanation).toContain('Apple Watch')
    expect(detail.alternatives.some((item) => item.sourceName === 'Apple Watch' && !item.selected)).toBe(true)
  })

  it('keeps null awake and in-bed missing', () => {
    const row = mapSleepNightlySummaryRow({
      sleep_date: '2026-09-23',
      timezone: 'America/Phoenix',
      logical_source_key: 'circular',
      source_name: 'Circular',
      start_at: '2026-09-23T06:48:00.000Z',
      end_at: '2026-09-23T13:42:00.000Z',
      total_sleep_minutes: '384',
      time_in_bed_minutes: null,
      awake_minutes: null,
      core_minutes: null,
      deep_minutes: null,
      rem_minutes: null,
      unspecified_sleep_minutes: '27',
      stage_coverage_pct: null,
      stage_conflict_minutes: '0',
      observation_status: 'analysis_eligible',
      analysis_eligible: true,
      stage_analysis_eligible: false,
      selection_reason: 'source_priority',
      calculation_version: 'sleep-night-v1',
      evidence: { alternatives: [] },
    })
    expect(row.awakeMinutes).toBeNull()
    expect(row.timeInBedMinutes).toBeNull()
    expect(row.unspecifiedSleepMinutes).toBe(27)
    const detail = buildSleepNightDetail(row)
    expect(html(detail)).not.toContain('Awake')
    expect(html(detail)).toContain('Unspecified sleep')
  })

  it('rejects a future date and does not invent vitals or a timeline', () => {
    expect(parseSleepDetailDate('2026-09-23', '2026-09-23')).toEqual({ sleepDate: '2026-09-23' })
    expect(parseSleepDetailDate('2026-09-24', '2026-09-23')).toEqual({ error: 'Sleep date cannot be in the future.' })
    expect(parseSleepDetailDate('tomorrow', '2026-09-23').error).toBeTruthy()
    const detail = buildSleepNightDetail(night())
    expect(JSON.stringify(detail)).not.toMatch(/heartRate|hrv|spo2|respiratory|temperature|readiness|sleepScore/i)
    const domain = readFileSync('src/domain/sleep/night-detail.ts', 'utf8')
    const query = readFileSync('server/sleep/queries.ts', 'utf8')
    const handler = readFileSync('server/handlers/progress-sleep-detail.ts', 'utf8')
    expect(domain).not.toContain('sessionizeSleepEpisodes')
    expect(query.slice(query.indexOf('export async function readSleepNightRecord'))).not.toContain('INSERT')
    expect(query.slice(query.indexOf('export async function readSleepNightRecord'))).not.toContain('UPDATE')
    expect(handler).toContain('withOwnerAuth')
    expect(handler).toContain('405')
    expect(handler).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(matchHealthApiRoute('/api/progress/sleep/2026-09-23')).toBe('progress-sleep-detail')
    expect(matchHealthApiRoute('/api/progress/sleep')).toBe('progress-sleep')
  })

  it('links Today and keeps the historical night on its own date', () => {
    const observation = (date: string, minutes: number): ProgressSleepObservation => ({
      sleepDate: date,
      analysisEligible: true,
      totalSleepMinutes: minutes,
      timeInBedMinutes: minutes + 20,
      stageAnalysisEligible: false,
      coreMinutes: null,
      deepMinutes: null,
      remMinutes: null,
      unspecifiedSleepMinutes: null,
      logicalSourceKey: 'circular',
      observationStatus: 'analysis_eligible',
      sourceName: 'Circular',
      startAt: `${date}T07:00:00.000Z`,
      endAt: `${date}T14:00:00.000Z`,
    })
    const sources = (partial: Partial<TodaySources>): TodaySources => ({
      now: new Date('2026-09-23T18:00:00.000Z'),
      activityDays: [],
      nutritionEntries: [],
      nutritionTargets: [],
      trainingToday: [],
      trainingSessions: [],
      sleepNights: [],
      latestCompleteSleep: null,
      bodyWeights: [],
      pendingJobs: [],
      ...partial,
    })
    const today = buildTodayView(sources({ sleepNights: [observation('2026-09-23', 384)] }))
    const historical = buildTodayView(sources({ latestCompleteSleep: observation('2026-09-20', 400) }))
    const todayHtml = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(TodayBoard, { view: today })))
    const historicalHtml = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(TodayBoard, { view: historical })))
    expect(todayHtml).toContain('/progress/sleep/2026-09-23')
    expect(historicalHtml).toContain('/progress/sleep/2026-09-20')
    expect(historicalHtml).toContain('Latest complete')
    expect(historicalHtml).not.toContain('Last night')
    const timeline = readFileSync('src/features/progress/TimelineSection.tsx', 'utf8')
    const progress = readFileSync('src/features/progress/SleepSection.tsx', 'utf8')
    expect(timeline).toContain('/progress/sleep/${event.date}')
    expect(progress).toContain('View night')
  })
})

describe('demo sleep night detail', () => {
  it('uses fictional complete, partial, low-coverage, and missing nights', () => {
    const repository = readFileSync('src/demo/repository.ts', 'utf8')
    expect(repository).not.toMatch(/healthFetch|getSql/)
    const complete = demoSleepNightDetail('2026-09-14')
    const partial = demoSleepNightDetail('2026-03-11')
    const low = demoSleepNightDetail('2026-04-16')
    expect(complete?.analysisEligible).toBe(true)
    expect(complete?.stageShares).not.toBeNull()
    expect(partial?.analysisEligible).toBe(false)
    expect(partial?.totalSleepMinutes).toBe(150)
    expect(partial?.observationLabel).toBe('Partial sleep observation')
    expect(low?.stageCoveragePct).toBe(55)
    expect(low?.stageShares).toBeNull()
    expect(low?.coreMinutes).toBe(140)
    expect(demoSleepNightDetail('2026-02-19')).toBeNull()
    expect(html(low!)).toContain('Stage percentages are hidden')
    expect(html(partial!)).not.toContain('Complete sleep observation')
  })
})
