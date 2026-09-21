export const PROGRESS_ANALYTICS_CONFIG = {
  exerciseTrend: {
    recentAppearances: 3,
    previousAppearances: 3,
    improvementThresholdPct: 2,
  },
  e1rm: {
    highConfidenceMaxReps: 12,
    lowConfidenceMaxReps: 15,
    formula: 'epley' as const,
  },
  bodyWeightTrend: {
    minimumMeasurements: 5,
    minimumSpanDays: 14,
  },
  relativeStrength: {
    maxBodyWeightDistanceDays: 3,
  },
} as const

export type ProgressAnalyticsConfig = typeof PROGRESS_ANALYTICS_CONFIG
