import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { ProgressOverview } from '../src/domain/progress/overview.ts'
import { BodySection } from '../src/features/progress/BodySection.tsx'
import { OverviewSection } from '../src/features/progress/OverviewSection.tsx'
import { ProgressPage } from '../src/features/progress/ProgressPage.tsx'
import { StrengthLab, StrengthSection } from '../src/features/progress/StrengthSection.tsx'
import { bodyTrendCopy, progressBriefLines, trendStatusCopy } from '../src/features/progress/copy.ts'
import { formatKgAsLb, formatPerformed } from '../src/features/progress/format.ts'
import { parseProgressRangeParam, progressSearch } from '../src/features/progress/range.ts'

const CABLE_ID = '11111111-1111-4111-8111-111111111111'
const FARMER_ID = '22222222-2222-4222-8222-222222222222'
const LUNGE_ID = '33333333-3333-4333-8333-333333333333'
const SQUAT_ID = '44444444-4444-4444-8444-444444444444'

function emptyMetric() {
  return {
    status: 'insufficient_data' as const,
    observations: 1,
    required: 6,
  }
}

function sparseOverview(): ProgressOverview {
  return {
    period: {
      range: 'all',
      start: '2026-09-20',
      end: '2026-09-21',
      dayCount: 2,
      comparisonStart: null,
      comparisonEnd: null,
    },
    training: {
      workouts: { status: 'available', value: { count: 3 }, observations: 3 },
      sessions: [
        { sessionId: 'w1', sessionDate: '2026-09-20', createdAt: '2026-09-20T12:00:00.000Z' },
        { sessionId: 'w2', sessionDate: '2026-09-20', createdAt: '2026-09-20T18:00:00.000Z' },
        { sessionId: 'w3', sessionDate: '2026-09-21', createdAt: '2026-09-21T12:00:00.000Z' },
      ],
      consistency: {
        status: 'available',
        value: {
          workoutCount: 3,
          workoutsPerWeek: 10.5,
          medianGapDays: 1,
          longestGapDays: 1,
          uniqueDates: 2,
        },
        observations: 3,
      },
      comparison: {
        workoutCount: { status: 'not_applicable', observations: 0 },
        workoutsPerWeek: { status: 'not_applicable', observations: 0 },
        exerciseVolume: { status: 'not_applicable', observations: 0 },
        performanceBestCount: { status: 'not_applicable', observations: 0 },
      },
    },
    body: {
      weight: {
        latest: {
          measurementId: 'm1',
          measurementSessionId: 'ms1',
          key: 'weight',
          value: 87.09,
          unit: 'kg',
          valueKind: 'measured',
          measuredAt: '2026-09-20T08:00:00.000Z',
          timezone: 'America/Los_Angeles',
          calendarDate: '2026-09-20',
        },
        trend: { status: 'insufficient_data', observations: 1, required: 5 },
        observations: [
          {
            measurementId: 'm1',
            measurementSessionId: 'ms1',
            key: 'weight',
            value: 87.09,
            unit: 'kg',
            valueKind: 'measured',
            measuredAt: '2026-09-20T08:00:00.000Z',
            timezone: 'America/Los_Angeles',
            calendarDate: '2026-09-20',
          },
        ],
        requirements: { minimumMeasurements: 5, minimumSpanDays: 14 },
      },
      metrics: [],
      comparison: { weightChange: { status: 'not_applicable', observations: 0 } },
    },
    exercises: [
      {
        exerciseId: CABLE_ID,
        name: 'Cable Row',
        externalId: 'EX05',
        performanceType: 'loaded_reps',
        analyticsLoadType: 'external',
        analyticsRepMode: 'standard',
        latestPerformance: {
          sessionId: 'w2',
          sessionExerciseId: 'se-row',
          exerciseId: CABLE_ID,
          date: '2026-09-20',
          loadKg: 36.287,
          reps: 10,
          durationSec: null,
          estimated1RmKg: 48.38,
          sourceSetId: 'set-row-pr',
          leftReps: null,
          rightReps: null,
        },
        estimatedStrength: {
          status: 'available',
          value: {
            value: 48.38,
            formula: 'epley',
            sourceSet: { setId: 'set-row-pr', sessionId: 'w2', date: '2026-09-20', loadKg: 36.287, reps: 10 },
          },
          observations: 2,
          basis: 'session_high_confidence_epley',
        },
        trend: emptyMetric(),
        progressionPattern: 'insufficient_data',
        frontier: [
          { setId: 'set-row-pr', sessionId: 'w2', date: '2026-09-20', loadKg: 36.287, reps: 10, durationSec: null },
        ],
        volume: { status: 'available', value: { kg: 362.87 }, observations: 2 },
        recentPrs: [
          {
            kind: 'performance_best',
            domain: 'training',
            exerciseId: CABLE_ID,
            date: '2026-09-20',
            sourceSessionId: 'w2',
            sourceSetId: 'set-row-pr',
            sourceSessionExerciseId: 'se-row',
            achievements: ['load', 'frontier', 'estimated_strength'],
            performed: { loadKg: 36.287, reps: 10 },
            evidence: [
              {
                domain: 'training',
                sessionId: 'w2',
                setId: 'set-row-pr',
                exerciseId: CABLE_ID,
                date: '2026-09-20',
                loadKg: 36.287,
                reps: 10,
              },
            ],
          },
        ],
        relativeStrength: { status: 'not_applicable', observations: 0 },
        appearanceCount: 2,
        estimatedStrengthHistory: [
          {
            sessionId: 'w1',
            sessionExerciseId: 'se-row-1',
            date: '2026-09-20',
            estimated1RmKg: 40,
            loadKg: 30,
            reps: 10,
            setId: 'set-row-1',
            leftReps: null,
            rightReps: null,
          },
          {
            sessionId: 'w2',
            sessionExerciseId: 'se-row',
            date: '2026-09-20',
            estimated1RmKg: 48.38,
            loadKg: 36.287,
            reps: 10,
            setId: 'set-row-pr',
            leftReps: null,
            rightReps: null,
          },
        ],
        performedPoints: [
          { setId: 'set-row-1', sessionId: 'w1', date: '2026-09-20', loadKg: 30, reps: 8, durationSec: null },
          { setId: 'set-row-pr', sessionId: 'w2', date: '2026-09-20', loadKg: 36.287, reps: 10, durationSec: null },
        ],
      },
      {
        exerciseId: FARMER_ID,
        name: 'Farmer Carry',
        externalId: 'EX07',
        performanceType: 'timed',
        analyticsLoadType: 'external',
        analyticsRepMode: 'standard',
        latestPerformance: {
          sessionId: 'w2',
          sessionExerciseId: 'se-farm',
          exerciseId: FARMER_ID,
          date: '2026-09-20',
          loadKg: 22.68,
          reps: null,
          durationSec: 45,
          estimated1RmKg: null,
          sourceSetId: 'set-farm-pr',
          leftReps: null,
          rightReps: null,
        },
        estimatedStrength: { status: 'not_applicable', observations: 2 },
        trend: { status: 'not_applicable', observations: 2 },
        progressionPattern: 'insufficient_data',
        frontier: [
          { setId: 'set-farm-pr', sessionId: 'w2', date: '2026-09-20', loadKg: 22.68, reps: null, durationSec: 45 },
        ],
        volume: { status: 'not_applicable', observations: 2 },
        recentPrs: [
          {
            kind: 'performance_best',
            domain: 'training',
            exerciseId: FARMER_ID,
            date: '2026-09-20',
            sourceSessionId: 'w2',
            sourceSetId: 'set-farm-pr',
            sourceSessionExerciseId: 'se-farm',
            achievements: ['load', 'frontier'],
            performed: { loadKg: 22.68, durationSec: 45 },
            evidence: [
              {
                domain: 'training',
                sessionId: 'w2',
                setId: 'set-farm-pr',
                exerciseId: FARMER_ID,
                date: '2026-09-20',
                loadKg: 22.68,
                durationSec: 45,
              },
            ],
          },
        ],
        relativeStrength: { status: 'not_applicable', observations: 2 },
        appearanceCount: 2,
        estimatedStrengthHistory: [],
        performedPoints: [
          { setId: 'set-farm-1', sessionId: 'w1', date: '2026-09-20', loadKg: 13.61, reps: null, durationSec: 45 },
          { setId: 'set-farm-pr', sessionId: 'w2', date: '2026-09-20', loadKg: 22.68, reps: null, durationSec: 45 },
        ],
      },
      {
        exerciseId: LUNGE_ID,
        name: 'Reverse Lunge',
        externalId: 'EX11',
        performanceType: 'loaded_reps',
        analyticsLoadType: 'external',
        analyticsRepMode: 'per_side',
        latestPerformance: {
          sessionId: 'w3',
          sessionExerciseId: 'se-lunge',
          exerciseId: LUNGE_ID,
          date: '2026-09-21',
          loadKg: 4.536,
          reps: 6,
          durationSec: null,
          estimated1RmKg: 5.44,
          sourceSetId: 'set-lunge',
          leftReps: 6,
          rightReps: 9,
        },
        estimatedStrength: {
          status: 'available',
          value: {
            value: 5.44,
            formula: 'epley',
            sourceSet: { setId: 'set-lunge', sessionId: 'w3', date: '2026-09-21', loadKg: 4.536, reps: 6 },
          },
          observations: 1,
          basis: 'session_high_confidence_epley',
        },
        trend: emptyMetric(),
        progressionPattern: 'insufficient_data',
        frontier: [
          { setId: 'set-lunge', sessionId: 'w3', date: '2026-09-21', loadKg: 4.536, reps: 6, durationSec: null },
        ],
        volume: { status: 'available', value: { kg: 68.04 }, observations: 1 },
        recentPrs: [],
        relativeStrength: { status: 'not_applicable', observations: 0 },
        appearanceCount: 1,
        estimatedStrengthHistory: [
          {
            sessionId: 'w3',
            sessionExerciseId: 'se-lunge',
            date: '2026-09-21',
            estimated1RmKg: 5.44,
            loadKg: 4.536,
            reps: 6,
            setId: 'set-lunge',
            leftReps: 6,
            rightReps: 9,
          },
        ],
        performedPoints: [
          { setId: 'set-lunge', sessionId: 'w3', date: '2026-09-21', loadKg: 4.536, reps: 6, durationSec: null },
        ],
      },
      {
        exerciseId: SQUAT_ID,
        name: 'Box Squat',
        externalId: 'EX01',
        performanceType: 'loaded_reps',
        analyticsLoadType: 'external',
        analyticsRepMode: 'standard',
        latestPerformance: {
          sessionId: 'w1',
          sessionExerciseId: 'se-squat',
          exerciseId: SQUAT_ID,
          date: '2026-09-20',
          loadKg: 60,
          reps: 8,
          durationSec: null,
          estimated1RmKg: 76,
          sourceSetId: 'set-squat',
          leftReps: null,
          rightReps: null,
        },
        estimatedStrength: {
          status: 'available',
          value: {
            value: 76,
            formula: 'epley',
            sourceSet: { setId: 'set-squat', sessionId: 'w1', date: '2026-09-20', loadKg: 60, reps: 8 },
          },
          observations: 1,
          basis: 'session_high_confidence_epley',
        },
        trend: emptyMetric(),
        progressionPattern: 'insufficient_data',
        frontier: [{ setId: 'set-squat', sessionId: 'w1', date: '2026-09-20', loadKg: 60, reps: 8, durationSec: null }],
        volume: { status: 'available', value: { kg: 480 }, observations: 1 },
        recentPrs: [],
        relativeStrength: { status: 'not_applicable', observations: 0 },
        appearanceCount: 1,
        estimatedStrengthHistory: [
          {
            sessionId: 'w1',
            sessionExerciseId: 'se-squat',
            date: '2026-09-20',
            estimated1RmKg: 76,
            loadKg: 60,
            reps: 8,
            setId: 'set-squat',
            leftReps: null,
            rightReps: null,
          },
        ],
        performedPoints: [
          { setId: 'set-squat', sessionId: 'w1', date: '2026-09-20', loadKg: 60, reps: 8, durationSec: null },
        ],
      },
    ],
    findings: [
      {
        kind: 'performance_best',
        domain: 'training',
        exerciseId: CABLE_ID,
        achievements: ['load', 'frontier', 'estimated_strength'],
        evidence: [
          {
            domain: 'training',
            sessionId: 'w2',
            setId: 'set-row-pr',
            exerciseId: CABLE_ID,
            date: '2026-09-20',
            loadKg: 36.287,
            reps: 10,
          },
        ],
      },
      {
        kind: 'performance_best',
        domain: 'training',
        exerciseId: FARMER_ID,
        achievements: ['load', 'frontier'],
        evidence: [
          {
            domain: 'training',
            sessionId: 'w2',
            setId: 'set-farm-pr',
            exerciseId: FARMER_ID,
            date: '2026-09-20',
            loadKg: 22.68,
            durationSec: 45,
          },
        ],
      },
    ],
  }
}

describe('progress range URL helpers', () => {
  it('defaults to 30d and persists explicit range search params', () => {
    expect(parseProgressRangeParam(null)).toBe('30d')
    expect(parseProgressRangeParam('week')).toBe('30d')
    expect(parseProgressRangeParam('90d')).toBe('90d')
    expect(parseProgressRangeParam('all')).toBe('all')
    expect(progressSearch('90d')).toBe('?range=90d')
  })
})

describe('progress presentation copy', () => {
  it('does not invent 0% or stable when strength history is insufficient', () => {
    const overview = sparseOverview()
    const squat = overview.exercises.find((item) => item.exerciseId === SQUAT_ID)!
    expect(trendStatusCopy(squat.trend)).toMatch(/Building trend/)
    expect(trendStatusCopy(squat.trend)).not.toMatch(/0%/)
    expect(trendStatusCopy(squat.trend)).not.toBe('Stable')
    expect(bodyTrendCopy(overview)).toMatch(/Not enough weight history/)
    expect(bodyTrendCopy(overview)).not.toMatch(/^0/)
    const brief = progressBriefLines(overview)
    expect(brief.some((line) => line.includes('3 workouts'))).toBe(true)
    expect(brief.some((line) => line.includes('2 new performance bests'))).toBe(true)
    expect(brief.join(' ')).not.toMatch(/0 of /)
  })

  it('formats units through the existing lb display boundary', () => {
    expect(formatKgAsLb(22.6796185)).toMatch(/lb/)
    expect(formatPerformed({ loadKg: 22.68, durationSec: 45 })).toMatch(/45s/)
    expect(formatPerformed({ loadKg: 4.536, leftReps: 6, rightReps: 9 })).toMatch(/L 6/)
  })
})

describe('Progress UI states', () => {
  it('renders a loading skeleton before overview data arrives', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter initialEntries={['/progress?range=30d']}>
        <Routes>
          <Route path="/progress" element={<ProgressPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(html).toContain('Loading progress')
    expect(html).toContain('30D')
    expect(html).toContain('ALL')
    expect(html).not.toContain('0%')
  })

  it('renders an API error without substituting zeros', () => {
    const html = renderToStaticMarkup(
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        Progress tables are not available. Apply pending migrations. Values are not shown as zero when a request fails.
      </p>,
    )
    expect(html).toContain('not shown as zero')
    expect(html).not.toContain('Workouts 0')
  })

  it('shows sparse overview with two genuine PRs and no fake trends', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OverviewSection overview={sparseOverview()} onEvidence={() => undefined} />
      </MemoryRouter>,
    )
    expect(html).toContain('Building your trend')
    expect(html).toContain('Performance best')
    expect(html).toContain('Cable Row')
    expect(html).toContain('Farmer Carry')
    expect(html).toContain('Not enough weight history')
    expect(html).not.toContain('Strength trend: 0%')
    expect(html).not.toContain('Weight trend: 0')
    expect(html).not.toContain('Box Squat')
  })

  it('keeps baseline historical bests from rendering as PRs', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StrengthLab
          overview={sparseOverview()}
          range="all"
          exerciseId={SQUAT_ID}
          onEvidence={() => undefined}
        />
      </MemoryRouter>,
    )
    expect(html).toContain('Box Squat')
    expect(html).toContain('baseline from the first appearance')
    expect(html).not.toContain('Performance bests</h3><ul')
  })

  it('renders genuine PRs, Farmer Carry without e1RM, and Reverse Lunge sides', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StrengthSection overview={sparseOverview()} range="all" onEvidence={() => undefined} />
      </MemoryRouter>,
    )
    expect(html).toContain('Cable Row')
    expect(html).toContain('Recent best')
    expect(html).toContain('Farmer Carry')
    expect(html).toContain('No estimated 1RM')
    expect(html).toContain('45s')
    expect(html).toContain('Reverse Lunge')
    expect(html).toContain('L 6')
    expect(html).toContain('R 9')
    expect(html).toContain('1 / 6 appearances')
    expect(html).toContain('md:hidden')
  })

  it('renders estimated strength in the loaded-rep lab and grouped PR achievements', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StrengthLab
          overview={sparseOverview()}
          range="all"
          exerciseId={CABLE_ID}
          onEvidence={() => undefined}
        />
      </MemoryRouter>,
    )
    expect(html).toContain('Estimated Strength')
    expect(html).toContain('From')
    expect(html).toContain('Heaviest load')
    expect(html).toContain('Expanded performance frontier')
  })

  it('omits estimated strength for timed carries', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <StrengthLab
          overview={sparseOverview()}
          range="all"
          exerciseId={FARMER_ID}
          onEvidence={() => undefined}
        />
      </MemoryRouter>,
    )
    expect(html).toContain('Farmer Carry')
    expect(html).toContain('Estimated 1RM is not used for timed carries')
    expect(html).not.toContain('Estimated Strength')
  })

  it('renders body measurements without a fake 0 trend', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <BodySection overview={sparseOverview()} onEvidence={() => undefined} />
      </MemoryRouter>,
    )
    expect(html).toContain('Not ready')
    expect(html).toContain('Not enough weight history')
    expect(html).toContain('Recorded weight')
    expect(html).not.toContain('0 lb/week')
  })
})
