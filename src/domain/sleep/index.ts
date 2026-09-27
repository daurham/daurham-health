export {
  MIN_ANALYSIS_SLEEP_MINUTES,
  MIN_STAGE_COVERAGE_PCT,
  SLEEP_ASLEEP_CATEGORIES,
  SLEEP_ANALYTICS_CATEGORIES,
  SLEEP_CALCULATION_VERSION,
  SLEEP_EXCLUSIVE_STAGES,
  SLEEP_GAP_BOUNDARIES_MINUTES,
  SLEEP_NIGHT_CALCULATION_VERSION,
  SLEEP_BASELINE_MIN_OBSERVATIONS,
  SLEEP_BASELINE_PRIOR_DAYS,
  SLEEP_PERSONAL_BASELINE_VERSION,
  SLEEP_SOURCE_ATTRIBUTION_VERSION,
  SLEEP_STAGE_ANALYTICS_VERSION,
  SLEEP_STAGE_SUMMARY_MIN_NIGHTS,
  SLEEP_PARTIAL_SOURCE_MIN_DIFF_MINUTES,
  SLEEP_PARTIAL_SOURCE_RATIO,
  SLEEP_SESSION_GAP_MINUTES,
  SLEEP_SHORT_TERM_MIN_OBSERVED,
  SLEEP_SHORT_TERM_NIGHTS,
  SLEEP_SOURCE_PRIORITY,
  SLEEP_TIMEZONE,
  type KnownSleepSourceKey,
  type SleepAnalyticsCategory,
  type SleepAsleepCategory,
} from './config.js'
export { intervalMs, intersectIntervals, mergeIntervals, minutesOrNull, unionMinutes, type TimeInterval } from './intervals.js'
export { isAsleepCategory, normalizeSleepAnalyticsCategory } from './stages.js'
export {
  compareSleepSourcePriority,
  logicalSleepSource,
  normalizeSourceName,
  sleepSourcePriorityRank,
  type LogicalSleepSource,
} from './sources.js'
export {
  classifySleepInterval,
  classifySleepIntervals,
  sessionizeSleepEpisodes,
  sleepDateFromEnd,
  sleepGapDistribution,
  type ClassifiedSleepInterval,
  type SleepEpisode,
  type SleepGapBucket,
  type SleepIntervalRow,
} from './episodes.js'
export { sleepNightCandidates, type SleepNightCandidate } from './nights.js'
export {
  classifySleepObservation,
  isAnalysisEligible,
  isStageAnalysisEligible,
  meetsCompletenessOverride,
  SLEEP_OBSERVATION_STATUSES,
  SLEEP_SELECTION_REASONS,
  type SleepObservationStatus,
  type SleepSelectionReason,
} from './completeness.js'
export {
  arbitrateSleepNight,
  arbitrateSleepNights,
  isSuspiciousPartialPreferred,
  type SleepArbitrationDecision,
} from './arbitration.js'
export {
  sleepNightlySummariesFromDecisions,
  sleepNightlySummaryFromDecision,
  sleepNightSemanticPayload,
  stableSleepNightPayload,
  type SleepNightAlternativeEvidence,
  type SleepNightEvidence,
  type SleepNightlySummary,
} from './summarize.js'
export {
  recentSleepWindows,
  sleepRangeSummary,
  sleepShortTermChange,
  type SleepRangeSummary,
  type SleepShortTermChange,
  type SleepSummaryNight,
} from './analytics.js'
export { buildSleepDiagnosticReport, type SleepDiagnosticReport, type SleepSourceReport } from './report.js'
export {
  buildSleepProgressView,
  sleepOverrideExplanation,
  toSleepProgressNight,
  type SleepChartPoint,
  type SleepProgressNight,
  type SleepProgressView,
} from './progress-view.js'
export { buildSleepNightDetail, parseSleepDetailDate, type SleepNightDetail, type SleepNightAlternativeView } from './night-detail.js'
export {
  baselineVitalDefinitions,
  computeSleepDurationBaseline,
  computeVitalBaseline,
  latestBaselineNight,
  sleepBaselineWindow,
  SLEEP_BASELINE_VITAL_KEYS,
  type SleepBaselineDirection,
  type SleepBaselineMetricKey,
  type SleepBaselineState,
  type SleepPersonalBaseline,
} from './baseline.js'
export {
  assessSleepSourceComparability,
  deriveNightSourceAttribution,
  deriveSleepSourceAttribution,
  deriveSleepSourceRuns,
  deriveSleepSourceTransitions,
  isUnknownSleepSource,
  sleepBaselineSeparationNote,
  sleepSelectionCopy,
  sleepSourceContinuityLabel,
  sleepSourceDisplayName,
  SLEEP_SOURCE_TRANSITION_DISPLAY_LIMIT,
  type SleepNightSourceAttribution,
  type SleepSourceAttribution,
  type SleepSourceComparability,
  type SleepSourceCount,
  type SleepSourceRun,
  type SleepSourceTransition,
} from './source-attribution.js'
export {
  deriveOvernightVitals,
  enabledSleepVitals,
  planSleepVitalReconciliation,
  sampleInEpisode,
  SLEEP_VITAL_METRIC_KEYS,
  SLEEP_VITAL_OBSERVATION_VERSION,
  SLEEP_VITAL_REGISTRY,
  vitalSourceFamily,
  type OvernightVital,
  type SleepVitalMetricKey,
  type SleepVitalObservation,
} from './vitals.js'
export {
  buildSleepStageAnalytics,
  type SleepStageAnalytics,
  type SleepStageComparison,
  type SleepStageComposition,
  type SleepStageNightPoint,
} from './stage-analytics.js'
