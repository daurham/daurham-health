import type { HealthDomain, ProgressRange } from '../progress/types.js'
import type { RelationshipId } from './config.js'

export const INTELLIGENCE_STATES = ['available', 'insufficient_data', 'unsupported', 'not_applicable'] as const
export type IntelligenceState = (typeof INTELLIGENCE_STATES)[number]

export const ASSOCIATION_STRENGTHS = ['weak', 'moderate', 'strong'] as const
export type AssociationStrength = (typeof ASSOCIATION_STRENGTHS)[number]

export const ASSOCIATION_DIRECTIONS = ['positive', 'negative', 'neutral', 'mixed'] as const
export type AssociationDirection = (typeof ASSOCIATION_DIRECTIONS)[number]

export const SAMPLE_TIERS = ['limited_evidence', 'moderate_sample', 'larger_sample'] as const
export type SampleTier = (typeof SAMPLE_TIERS)[number]

export const SURFACING_RESULTS = [
  'surfaced',
  'insufficient_sample',
  'below_association_threshold',
  'unsupported',
  'not_applicable',
] as const
export type SurfacingResult = (typeof SURFACING_RESULTS)[number]

export type IntelligencePeriod = {
  range: ProgressRange
  asOf: string
  start: string
  end: string
  dayCount: number
}

export type CrossDomainCoverage = {
  paired: number
  denominator: number
  label: string
  pct: number
}

export type SpearmanMetrics = {
  xMetric: string
  yMetric: string
  rho: number | null
  n: number
}

export type WindowedMetrics = SpearmanMetrics & {
  windowDays: number
  minLoggedDays: number
}

export type GroupMetric = {
  metric: string
  unit: string
  leftAverage: number | null
  rightAverage: number | null
  leftCount: number
  rightCount: number
  delta: number | null
}

export type GroupComparisonMetrics = {
  leftLabel: string
  rightLabel: string
  leftDays: number
  rightDays: number
  metrics: GroupMetric[]
}

export type PeriodContextMetrics = {
  trendStatus: IntelligenceState
  slopePerDay: number | null
  slopePer30Days: number | null
  unit: string | null
  measurementCount: number
  spanDays: number | null
  loggedDays: number
  calendarDays: number
  coveragePct: number
  averageCalories: number | null
  averageProtein: number | null
}

export type BodyNutritionWindow = {
  date: string
  weight: number
  unit: string
  loggedDays: number
  coveragePct: number
  averageCalories: number | null
  averageProtein: number | null
}

export type CrossDomainEvidence = {
  dates: string[]
  leftDates?: string[]
  rightDates?: string[]
  windows?: BodyNutritionWindow[]
}

type FindingBase = {
  id: RelationshipId
  domainA: HealthDomain
  domainB: HealthDomain
  period: IntelligencePeriod
  sampleSize: number
  gateSampleSize: number
  requiredSampleSize: number
  sampleTier: SampleTier | null
  coverage: CrossDomainCoverage
  direction: AssociationDirection | null
  strength: AssociationStrength | null
  statisticalMethod: string
  evidence: CrossDomainEvidence
  state: IntelligenceState
  surfaced: boolean
  surfacing: SurfacingResult
}

export type CrossDomainFinding =
  | (FindingBase & { kind: 'spearman_association'; metrics: SpearmanMetrics })
  | (FindingBase & { kind: 'windowed_association'; metrics: WindowedMetrics })
  | (FindingBase & { kind: 'group_comparison'; metrics: GroupComparisonMetrics })
  | (FindingBase & { kind: 'period_context'; metrics: PeriodContextMetrics })

export type CrossDomainState = {
  timezone: 'America/Phoenix'
  period: IntelligencePeriod
  today: string | null
  provisionalActivityDate: string | null
  relationships: CrossDomainFinding[]
  findings: CrossDomainFinding[]
}
