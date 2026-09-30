export const TREND_INTENT_VERSION = 'trend-intent-v1' as const

export type TrendDirection = 'higher' | 'lower' | 'stable'
export type TrendMeaning = 'toward' | 'away' | 'neutral' | 'within'

export type TrendMetric =
  | { kind: 'body'; metricKey: 'weight' | 'body_fat_percentage' | 'waist_circumference' }
  | { kind: 'strength'; exerciseDefinitionId: string }
  | { kind: 'activity_steps' }
  | { kind: 'activity_exercise_minutes' }
  | { kind: 'training_frequency' }
  | { kind: 'nutrition_protein' }

export type TrendMeaningSource = 'goal' | 'preference' | 'default' | 'neutral'

export type TrendPreferenceDirection = 'lower' | 'maintain' | 'higher' | 'none'

export type TrendPreferences = {
  version: typeof TREND_INTENT_VERSION
  bodyweight: TrendPreferenceDirection
  bodyFat: TrendPreferenceDirection
  waist: TrendPreferenceDirection
  strength: 'higher' | 'none'
  activitySteps: 'higher' | 'none'
}

export const DEFAULT_TREND_PREFERENCES: TrendPreferences = {
  version: TREND_INTENT_VERSION,
  bodyweight: 'none',
  bodyFat: 'none',
  waist: 'none',
  strength: 'none',
  activitySteps: 'none',
}

export type TrendGoalIntent = {
  id: string
  goalKind: string
  status: 'active' | 'paused' | 'completed'
  bodyMetricKey: string | null
  exerciseDefinitionId: string | null
  targetMode: 'at_least' | 'at_most' | 'range'
  relation: 'above_range' | 'below_range' | 'inside_range' | null
}

function matchingGoal(metric: TrendMetric, goal: TrendGoalIntent): boolean {
  if (goal.status !== 'active') return false
  if (metric.kind === 'body') {
    return goal.goalKind === 'body_metric' && goal.bodyMetricKey === metric.metricKey
  }
  if (metric.kind === 'strength') {
    return goal.goalKind === 'strength_e1rm' && goal.exerciseDefinitionId === metric.exerciseDefinitionId
  }
  if (metric.kind === 'activity_steps') return goal.goalKind === 'activity_steps'
  if (metric.kind === 'training_frequency') return goal.goalKind === 'training_frequency'
  if (metric.kind === 'nutrition_protein') return goal.goalKind === 'nutrition_protein'
  return false
}

function meaningForGoal(goal: TrendGoalIntent, direction: TrendDirection): TrendMeaning {
  if (direction === 'stable') {
    return goal.targetMode === 'range' && goal.relation === 'inside_range' ? 'within' : 'neutral'
  }

  if (goal.targetMode === 'at_least') {
    return direction === 'higher' ? 'toward' : 'away'
  }
  if (goal.targetMode === 'at_most') {
    return direction === 'lower' ? 'toward' : 'away'
  }

  if (goal.relation === 'inside_range') return 'within'
  if (goal.relation === 'below_range') return direction === 'higher' ? 'toward' : 'away'
  if (goal.relation === 'above_range') return direction === 'lower' ? 'toward' : 'away'
  return 'neutral'
}

function preferenceForMetric(metric: TrendMetric, preferences: TrendPreferences): TrendPreferenceDirection {
  if (metric.kind === 'body') {
    if (metric.metricKey === 'weight') return preferences.bodyweight
    if (metric.metricKey === 'body_fat_percentage') return preferences.bodyFat
    return preferences.waist
  }
  if (metric.kind === 'strength') return preferences.strength
  if (metric.kind === 'activity_steps') return preferences.activitySteps
  return 'none'
}

function defaultMeaningForMetric(metric: TrendMetric, direction: TrendDirection): TrendMeaning | null {
  if (direction === 'stable') return null
  if (
    metric.kind === 'strength' ||
    metric.kind === 'activity_steps' ||
    metric.kind === 'activity_exercise_minutes' ||
    metric.kind === 'training_frequency' ||
    metric.kind === 'nutrition_protein'
  ) {
    return direction === 'higher' ? 'toward' : 'away'
  }
  return null
}

function meaningForPreference(preference: TrendPreferenceDirection, direction: TrendDirection): TrendMeaning {
  if (direction === 'stable' || preference === 'none' || preference === 'maintain') return 'neutral'
  return preference === direction ? 'toward' : 'away'
}

export function resolveTrendMeaning(input: {
  metric: TrendMetric
  direction: TrendDirection
  goals: readonly TrendGoalIntent[]
  preferences: TrendPreferences
}): { meaning: TrendMeaning; source: TrendMeaningSource } {
  const matches = input.goals.filter((goal) => matchingGoal(input.metric, goal))
  if (matches.length > 0) {
    const meanings = [...new Set(matches.map((goal) => meaningForGoal(goal, input.direction)))]
    if (meanings.length === 1) return { meaning: meanings[0]!, source: 'goal' }
    return { meaning: 'neutral', source: 'goal' }
  }

  const preference = preferenceForMetric(input.metric, input.preferences)
  if (preference !== 'none') {
    return {
      meaning: meaningForPreference(preference, input.direction),
      source: 'preference',
    }
  }
  const defaultMeaning = defaultMeaningForMetric(input.metric, input.direction)
  if (defaultMeaning) {
    return { meaning: defaultMeaning, source: 'default' }
  }
  return { meaning: 'neutral', source: 'neutral' }
}

export function trendMeaningLabel(meaning: TrendMeaning, source: TrendMeaningSource = 'goal'): string {
  if (meaning === 'within') return 'Within target'
  if (meaning === 'neutral') return 'Neutral'
  if (source === 'default') return meaning === 'toward' ? 'Positive signal' : 'Needs attention'
  if (source === 'preference') return meaning === 'toward' ? 'Preferred direction' : 'Away from preference'
  return meaning === 'toward' ? 'Toward goal' : 'Away from goal'
}
