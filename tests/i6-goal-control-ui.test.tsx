import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { GoalControlState } from '../src/domain/goal-control.ts'
import type { WeeklyCoachBrief } from '../src/domain/weekly-coach/types.ts'
import { GoalControlCard } from '../src/features/goal-control/GoalControlCard.tsx'
import { WeeklyCoachView } from '../src/features/weekly-coach/WeeklyCoachPage.tsx'

function decision(): GoalControlState {
  return {
    version: 'goal-control-v1',
    asOf: '2026-10-08',
    period: { start: '2026-10-01', end: '2026-10-07' },
    state: 'maintain',
    headline: 'Stay the course',
    summary: 'No change recommended this week. Current evidence does not justify changing your targets or plan.',
    noChangeRecommended: true,
    confidence: 'moderate',
    primaryOpportunity: null,
    goals: [],
    nutritionQuality: {
      state: 'met',
      period: { start: '2026-10-01', end: '2026-10-07' },
      loggedDays: 5,
      reliableDays: 5,
      estimateHeavyDays: 0,
      unknownQualityDays: 0,
      requiredLoggedDays: 4,
      requiredReliableDays: 4,
      detail: 'Nutrition has 5 sufficiently reliable logged days in the last seven completed days.',
    },
    trainingAdherence: {
      configured: true,
      completedProgrammedSessions: 1,
      weeklyFrequencyTarget: 3,
      remainingSessions: 2,
      todayIntent: 'rest',
      futureTrainingDates: ['2026-10-09', '2026-10-11'],
      state: 'rest_day_on_track',
      detail: 'Today is not a planned Training day. 2 planned Training days remain for 2 sessions.',
    },
    relationships: [],
    limitations: [],
  }
}

function brief(): WeeklyCoachBrief {
  const legacyFocus = {
    id: 'focus:legacy',
    section: 'focus' as const,
    kind: 'legacy',
    fact: 'Legacy focus',
    evidenceRefs: [],
    detailPath: '/progress',
    actionText: 'Do the legacy focus.',
    rank: 1,
  }
  return {
    packetVersion: 'weekly-coach-evidence-v1',
    asOf: '2026-10-08',
    period: { start: '2026-10-01', end: '2026-10-07' },
    previousPeriod: { start: '2026-09-24', end: '2026-09-30' },
    state: 'deterministic',
    canGenerate: true,
    coverage: {
      activity: true,
      sleep: true,
      nutrition: true,
      training: true,
      supplements: false,
      body: false,
      substantiveDomains: ['activity', 'sleep', 'nutrition', 'training'],
    },
    facts: [],
    wentWell: [],
    worthWatching: [],
    focus: legacyFocus,
    candidates: [legacyFocus],
  }
}

describe('I6 Goal Control presentation', () => {
  it('renders explicit no-change and rest-aware Today copy', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(GoalControlCard, { state: decision() }),
      ),
    )
    expect(html).toContain('Goal overview')
    expect(html).toContain('Stay the course')
    expect(html).toContain('No change recommended this week')
    expect(html).toContain('moderate confidence')
    expect(html).toContain('Rest-aware')
    expect(html).toContain('Today is not a planned Training day')
  })

  it('uses the shared Weekly Decision instead of rendering a competing legacy Focus section', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(WeeklyCoachView, {
          brief: brief(),
          commentary: null,
          notice: null,
          decision: decision(),
        }),
      ),
    )
    expect(html).toContain('Weekly decision')
    expect(html).toContain('Stay the course')
    expect(html).not.toContain('Focus this week')
    expect(html).not.toContain('Do the legacy focus.')
  })
})
