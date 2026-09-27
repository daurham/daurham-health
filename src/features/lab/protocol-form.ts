import { ACTIVITY_METRICS } from '@/domain/activity/config'
import { MANUAL_BODY_METRICS } from '@/domain/body-manual'
import { DAILY_CONTEXT_TAG_CATALOG, dailyContextTagLabel } from '@/domain/context'
import {
  LAB_NUTRITION_METRICS,
  LAB_REQUIREMENT_DOMAINS,
  LAB_REQUIREMENT_ROLES,
  LAB_TRAINING_MEASURES,
  type LabRequirementDomain,
  type LabRequirementRole,
  type LabTrainingMeasure,
} from '@/domain/lab'
import type { LabRequirementPayload, LabVersionView } from './api'

export const fieldClass = 'mt-1 block min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base'

export const ROLE_LABELS: Record<LabRequirementRole, string> = {
  primary_outcome: 'Primary outcome',
  secondary_outcome: 'Secondary outcome',
  adherence: 'Adherence',
  context: 'Context',
  safety: 'Safety',
}

export const DOMAIN_LABELS: Record<LabRequirementDomain, string> = {
  training: 'Training',
  body: 'Body',
  nutrition: 'Nutrition',
  activity: 'Activity',
  sleep: 'Sleep',
  supplements: 'Supplements',
  context: 'Daily context',
  benchmark: 'Benchmark',
}

export const MEASURE_LABELS: Record<LabTrainingMeasure, string> = {
  total_reps: 'Total reps',
  largest_set_reps: 'Largest set',
  working_sets: 'Working sets',
  duration: 'Duration',
}

export const NUTRITION_LABELS: Record<(typeof LAB_NUTRITION_METRICS)[number], string> = {
  calories: 'Calories',
  protein: 'Protein',
  carbs: 'Carbs',
  fat: 'Fat',
}

export const ACTIVITY_LABELS: Record<(typeof ACTIVITY_METRICS)[number], string> = {
  steps_count: 'Steps',
  active_energy_kcal: 'Active energy',
  exercise_minutes: 'Exercise minutes',
  resting_heart_rate_bpm: 'Resting heart rate',
}

export const SLEEP_LABEL = 'Total sleep'

const KIND_BY_DOMAIN: Record<LabRequirementDomain, string> = {
  training: 'training_measure',
  body: 'body_metric',
  nutrition: 'nutrition_metric',
  activity: 'activity_metric',
  sleep: 'sleep_metric',
  supplements: 'supplement_adherence',
  context: 'context_tag',
  benchmark: 'benchmark_definition',
}

export type RequirementDraft = {
  key: string
  role: LabRequirementRole
  domain: LabRequirementDomain
  label: string
  metricKey: string
  exerciseDefinitionId: string
  measure: LabTrainingMeasure
  supplementId: string
  tagKey: string
  benchmarkDefinitionId: string
  benchmarkProtocolVersionId: string
  minimumObservations: string
  minimumCoveragePercent: string
  minimumAdherencePercent: string
}

export type CatalogOption = { id: string; label: string; protocolVersionId?: string }

let draftKey = 0

export function newRequirementDraft(role: LabRequirementRole = 'primary_outcome'): RequirementDraft {
  draftKey += 1
  return {
    key: `req-${draftKey}`,
    role,
    domain: 'body',
    label: '',
    metricKey: MANUAL_BODY_METRICS[0]?.key ?? 'weight',
    exerciseDefinitionId: '',
    measure: 'total_reps',
    supplementId: '',
    tagKey: DAILY_CONTEXT_TAG_CATALOG[0]?.key ?? 'travel',
    benchmarkDefinitionId: '',
    benchmarkProtocolVersionId: '',
    minimumObservations: '',
    minimumCoveragePercent: '',
    minimumAdherencePercent: '',
  }
}

export function draftsFromVersion(version: LabVersionView | null): RequirementDraft[] {
  if (!version) {
    return [newRequirementDraft()]
  }
  return version.requirements.map((item) => {
    const draft = newRequirementDraft(item.role as LabRequirementRole)
    draft.domain = item.domain as LabRequirementDomain
    draft.label = item.label
    draft.metricKey = item.selector.metricKey ?? draft.metricKey
    draft.exerciseDefinitionId = item.selector.exerciseDefinitionId ?? ''
    draft.measure = (item.selector.measure as LabTrainingMeasure | undefined) ?? 'total_reps'
    draft.supplementId = item.selector.supplementId ?? ''
    draft.tagKey = item.selector.tagKey ?? draft.tagKey
    draft.benchmarkDefinitionId = item.selector.benchmarkDefinitionId ?? ''
    draft.benchmarkProtocolVersionId = item.selector.benchmarkProtocolVersionId ?? ''
    const criteria = item.criteria
    if (criteria?.minimumObservations != null) draft.minimumObservations = String(criteria.minimumObservations)
    if (criteria?.minimumCoveragePercent != null) draft.minimumCoveragePercent = String(criteria.minimumCoveragePercent)
    if (criteria?.minimumAdherencePercent != null) draft.minimumAdherencePercent = String(criteria.minimumAdherencePercent)
    return draft
  })
}

function suggestedLabel(draft: RequirementDraft, catalogs: RequirementCatalogs): string {
  if (draft.domain === 'body') {
    return MANUAL_BODY_METRICS.find((item) => item.key === draft.metricKey)?.label ?? 'Body metric'
  }
  if (draft.domain === 'nutrition') {
    return NUTRITION_LABELS[draft.metricKey as keyof typeof NUTRITION_LABELS] ?? 'Nutrition'
  }
  if (draft.domain === 'activity') {
    return ACTIVITY_LABELS[draft.metricKey as keyof typeof ACTIVITY_LABELS] ?? 'Activity'
  }
  if (draft.domain === 'sleep') {
    return SLEEP_LABEL
  }
  if (draft.domain === 'context') {
    return dailyContextTagLabel(draft.tagKey as never)
  }
  if (draft.domain === 'supplements') {
    return catalogs.supplements.find((item) => item.id === draft.supplementId)?.label ?? 'Supplement adherence'
  }
  if (draft.domain === 'training') {
    const exercise = catalogs.exercises.find((item) => item.id === draft.exerciseDefinitionId)?.label ?? 'Exercise'
    return `${exercise} ${MEASURE_LABELS[draft.measure].toLowerCase()}`
  }
  return catalogs.benchmarks.find((item) => item.id === draft.benchmarkDefinitionId)?.label ?? 'Benchmark'
}

export type RequirementCatalogs = {
  supplements: CatalogOption[]
  exercises: CatalogOption[]
  benchmarks: CatalogOption[]
}

export function requirementPayload(drafts: RequirementDraft[], catalogs: RequirementCatalogs): LabRequirementPayload[] {
  return drafts.map((draft) => {
    const selector = selectorFor(draft)
    const criteria = criteriaFor(draft)
    return {
      role: draft.role,
      domain: draft.domain,
      requirementKind: KIND_BY_DOMAIN[draft.domain],
      selector,
      label: draft.label.trim() || suggestedLabel(draft, catalogs),
      required: true,
      ...(criteria ? { criteria } : {}),
    }
  })
}

function criteriaFor(draft: RequirementDraft): Record<string, number> | null {
  const criteria: Record<string, number> = {}
  const observations = optionalWhole(draft.minimumObservations)
  const coverage = optionalWhole(draft.minimumCoveragePercent)
  const adherence = optionalWhole(draft.minimumAdherencePercent)
  if (observations != null && draft.domain !== 'supplements' && draft.domain !== 'context') criteria.minimumObservations = observations
  if (coverage != null && (draft.domain === 'nutrition' || draft.domain === 'activity' || draft.domain === 'sleep' || draft.domain === 'supplements')) {
    criteria.minimumCoveragePercent = coverage
  }
  if (adherence != null && draft.domain === 'supplements') criteria.minimumAdherencePercent = adherence
  return Object.keys(criteria).length > 0 ? criteria : null
}

function optionalWhole(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const parsed = Number(trimmed)
  return Number.isInteger(parsed) ? parsed : null
}

function selectorFor(draft: RequirementDraft): Record<string, string> {
  if (draft.domain === 'training') {
    return { exerciseDefinitionId: draft.exerciseDefinitionId, measure: draft.measure }
  }
  if (draft.domain === 'supplements') {
    return { supplementId: draft.supplementId }
  }
  if (draft.domain === 'context') {
    return { tagKey: draft.tagKey }
  }
  if (draft.domain === 'benchmark') {
    return draft.benchmarkProtocolVersionId
      ? { benchmarkDefinitionId: draft.benchmarkDefinitionId, benchmarkProtocolVersionId: draft.benchmarkProtocolVersionId }
      : { benchmarkDefinitionId: draft.benchmarkDefinitionId }
  }
  if (draft.domain === 'sleep') {
    return { metricKey: 'total_sleep_minutes' }
  }
  return { metricKey: draft.metricKey }
}

export function requirementRoles(): readonly LabRequirementRole[] {
  return LAB_REQUIREMENT_ROLES
}

export function requirementDomains(): readonly LabRequirementDomain[] {
  return LAB_REQUIREMENT_DOMAINS
}

export function trainingMeasures(): readonly LabTrainingMeasure[] {
  return LAB_TRAINING_MEASURES
}

export function describeRequirement(requirement: { role: string; label: string; domain: string }): string {
  const role = ROLE_LABELS[requirement.role as keyof typeof ROLE_LABELS] ?? requirement.role
  const domain = DOMAIN_LABELS[requirement.domain as keyof typeof DOMAIN_LABELS] ?? requirement.domain
  return `${role} · ${domain} · ${requirement.label}`
}
