import { describe, expect, it } from 'vitest'
import {
  DEFAULT_TREND_PREFERENCES,
  resolveTrendMeaning,
  type TrendGoalIntent,
  type TrendPreferences,
} from '../src/domain/trend-intent.ts'

function goal(overrides: Partial<TrendGoalIntent> = {}): TrendGoalIntent {
  return {
    id: 'goal-1',
    goalKind: 'body_metric',
    status: 'active',
    bodyMetricKey: 'weight',
    exerciseDefinitionId: null,
    targetMode: 'at_least',
    relation: null,
    ...overrides,
  }
}

const lowerWeight: TrendPreferences = {
  ...DEFAULT_TREND_PREFERENCES,
  bodyweight: 'lower',
}

describe('goal-aware trend meaning', () => {
  it('maps at-least and at-most targets by requested direction', () => {
    expect(resolveTrendMeaning({
      metric: { kind: 'body', metricKey: 'weight' },
      direction: 'higher',
      goals: [goal({ targetMode: 'at_least' })],
      preferences: lowerWeight,
    })).toEqual({ meaning: 'toward', source: 'goal' })

    expect(resolveTrendMeaning({
      metric: { kind: 'body', metricKey: 'weight' },
      direction: 'lower',
      goals: [goal({ targetMode: 'at_least' })],
      preferences: lowerWeight,
    })).toEqual({ meaning: 'away', source: 'goal' })

    expect(resolveTrendMeaning({
      metric: { kind: 'body', metricKey: 'weight' },
      direction: 'lower',
      goals: [goal({ targetMode: 'at_most' })],
      preferences: DEFAULT_TREND_PREFERENCES,
    }).meaning).toBe('toward')

    expect(resolveTrendMeaning({
      metric: { kind: 'body', metricKey: 'weight' },
      direction: 'higher',
      goals: [goal({ targetMode: 'at_most' })],
      preferences: DEFAULT_TREND_PREFERENCES,
    }).meaning).toBe('away')
  })

  it('uses current range relation instead of treating one direction as globally good', () => {
    expect(resolveTrendMeaning({
      metric: { kind: 'body', metricKey: 'weight' },
      direction: 'higher',
      goals: [goal({ targetMode: 'range', relation: 'below_range' })],
      preferences: DEFAULT_TREND_PREFERENCES,
    }).meaning).toBe('toward')

    expect(resolveTrendMeaning({
      metric: { kind: 'body', metricKey: 'weight' },
      direction: 'lower',
      goals: [goal({ targetMode: 'range', relation: 'above_range' })],
      preferences: DEFAULT_TREND_PREFERENCES,
    }).meaning).toBe('toward')

    expect(resolveTrendMeaning({
      metric: { kind: 'body', metricKey: 'weight' },
      direction: 'higher',
      goals: [goal({ targetMode: 'range', relation: 'inside_range' })],
      preferences: DEFAULT_TREND_PREFERENCES,
    }).meaning).toBe('within')
  })

  it('fails neutral for conflicting active Goals', () => {
    const result = resolveTrendMeaning({
      metric: { kind: 'body', metricKey: 'weight' },
      direction: 'higher',
      goals: [
        goal({ id: 'gain', targetMode: 'at_least' }),
        goal({ id: 'lose', targetMode: 'at_most' }),
      ],
      preferences: lowerWeight,
    })
    expect(result).toEqual({ meaning: 'neutral', source: 'goal' })
  })

  it('uses presentation preference only when no active matching Goal exists', () => {
    expect(resolveTrendMeaning({
      metric: { kind: 'body', metricKey: 'weight' },
      direction: 'lower',
      goals: [],
      preferences: lowerWeight,
    })).toEqual({ meaning: 'toward', source: 'preference' })

    expect(resolveTrendMeaning({
      metric: { kind: 'body', metricKey: 'weight' },
      direction: 'higher',
      goals: [goal({ status: 'paused', targetMode: 'at_least' })],
      preferences: lowerWeight,
    })).toEqual({ meaning: 'away', source: 'preference' })

    expect(resolveTrendMeaning({
      metric: { kind: 'activity_steps' },
      direction: 'higher',
      goals: [],
      preferences: DEFAULT_TREND_PREFERENCES,
    })).toEqual({ meaning: 'toward', source: 'default' })
  })

  it('uses the conservative motivational allowlist only after Goals and preferences', () => {
    for (const metric of [
      { kind: 'activity_steps' as const },
      { kind: 'activity_exercise_minutes' as const },
      { kind: 'training_frequency' as const },
      { kind: 'nutrition_protein' as const },
      { kind: 'strength' as const, exerciseDefinitionId: 'bench' },
    ]) {
      expect(resolveTrendMeaning({
        metric,
        direction: 'higher',
        goals: [],
        preferences: DEFAULT_TREND_PREFERENCES,
      })).toEqual({ meaning: 'toward', source: 'default' })
      expect(resolveTrendMeaning({
        metric,
        direction: 'lower',
        goals: [],
        preferences: DEFAULT_TREND_PREFERENCES,
      })).toEqual({ meaning: 'away', source: 'default' })
    }

    expect(resolveTrendMeaning({
      metric: { kind: 'body', metricKey: 'weight' },
      direction: 'higher',
      goals: [],
      preferences: DEFAULT_TREND_PREFERENCES,
    })).toEqual({ meaning: 'neutral', source: 'neutral' })
  })

  it('matches strength Goals to the exact exercise and lets formal Goal override preference', () => {
    const preferences: TrendPreferences = { ...DEFAULT_TREND_PREFERENCES, strength: 'higher' }
    const strengthGoal = goal({
      goalKind: 'strength_e1rm',
      bodyMetricKey: null,
      exerciseDefinitionId: 'bench',
      targetMode: 'at_most',
    })
    expect(resolveTrendMeaning({
      metric: { kind: 'strength', exerciseDefinitionId: 'bench' },
      direction: 'higher',
      goals: [strengthGoal],
      preferences,
    })).toEqual({ meaning: 'away', source: 'goal' })

    expect(resolveTrendMeaning({
      metric: { kind: 'strength', exerciseDefinitionId: 'squat' },
      direction: 'higher',
      goals: [strengthGoal],
      preferences,
    })).toEqual({ meaning: 'toward', source: 'preference' })
  })
})
