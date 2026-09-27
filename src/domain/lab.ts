import { ACTIVITY_METRICS } from './activity/config.js'
import { MANUAL_BODY_METRICS } from './body-manual.js'
import { DAILY_CONTEXT_TAG_KEYS, isDailyContextTagKey } from './context.js'
import { isCalendarDate } from './training.js'

export const LAB_PROTOCOL_KINDS = ['experiment', 'benchmark'] as const
export type LabProtocolKind = (typeof LAB_PROTOCOL_KINDS)[number]

export const LAB_REQUIREMENT_ROLES = [
  'primary_outcome',
  'secondary_outcome',
  'adherence',
  'context',
  'safety',
] as const
export type LabRequirementRole = (typeof LAB_REQUIREMENT_ROLES)[number]

export const LAB_REQUIREMENT_DOMAINS = [
  'training',
  'body',
  'nutrition',
  'activity',
  'sleep',
  'supplements',
  'context',
  'benchmark',
] as const
export type LabRequirementDomain = (typeof LAB_REQUIREMENT_DOMAINS)[number]

export const LAB_REQUIREMENT_KINDS = [
  'training_measure',
  'body_metric',
  'nutrition_metric',
  'activity_metric',
  'sleep_metric',
  'supplement_adherence',
  'context_tag',
  'benchmark_definition',
] as const
export type LabRequirementKind = (typeof LAB_REQUIREMENT_KINDS)[number]

export const LAB_TRAINING_MEASURES = ['total_reps', 'largest_set_reps', 'working_sets', 'duration'] as const
export type LabTrainingMeasure = (typeof LAB_TRAINING_MEASURES)[number]

export const LAB_NUTRITION_METRICS = ['calories', 'protein', 'carbs', 'fat'] as const
export const LAB_SLEEP_METRICS = ['total_sleep_minutes'] as const

export const LAB_CONTEXT_CONTROL_MODES = ['observe'] as const
export type LabContextControlMode = (typeof LAB_CONTEXT_CONTROL_MODES)[number]

export const EXPERIMENT_ORIGINS = [
  'owner_created',
  'ai_assisted',
  'evidence_gap',
  'goal_plateau',
  'stale_benchmark',
  'repeated_pattern',
  'external_research',
] as const
export type ExperimentOrigin = (typeof EXPERIMENT_ORIGINS)[number]

export const EXPERIMENT_STATUSES = [
  'proposed',
  'accepted',
  'scheduled',
  'active',
  'completed',
  'abandoned',
  'inconclusive',
  'superseded',
] as const
export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number]

export const BENCHMARK_DOMAINS = ['training', 'body', 'activity', 'sleep', 'other'] as const
export type BenchmarkDomain = (typeof BENCHMARK_DOMAINS)[number]

export const EXPERIMENT_BENCHMARK_ROLES = ['primary', 'secondary'] as const
export type ExperimentBenchmarkRole = (typeof EXPERIMENT_BENCHMARK_ROLES)[number]

export const EXPERIMENT_SUPPLEMENT_ROLES = ['intervention', 'tracked'] as const
export type ExperimentSupplementRole = (typeof EXPERIMENT_SUPPLEMENT_ROLES)[number]

export const RESULT_ONLY_EXPERIMENT_STATUSES = ['completed', 'inconclusive'] as const

const EXPERIMENT_TRANSITIONS: Record<ExperimentStatus, readonly ExperimentStatus[]> = {
  proposed: ['accepted', 'abandoned', 'superseded'],
  accepted: ['scheduled', 'abandoned', 'superseded'],
  scheduled: ['accepted', 'active', 'abandoned', 'superseded'],
  active: ['abandoned'],
  completed: [],
  abandoned: [],
  inconclusive: [],
  superseded: [],
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export type RequirementCriteria = {
  minimumObservations: number | null
  minimumCoveragePercent: number | null
  minimumAdherencePercent: number | null
}

export type LabRequirement = {
  position: number
  role: LabRequirementRole
  domain: LabRequirementDomain
  requirementKind: LabRequirementKind
  selector: Record<string, string>
  label: string
  required: boolean
  criteria: RequirementCriteria
}

export type LabExistence = {
  supplementIds: ReadonlySet<string>
  exerciseIds: ReadonlySet<string>
  benchmarkIds: ReadonlySet<string>
  benchmarkProtocolPins?: ReadonlySet<string>
}

export function cleanOptionalText(value: unknown, name: string, max: number): { text: string | null } | { error: string } {
  if (value == null) {
    return { text: null }
  }
  if (typeof value !== 'string') {
    return { error: `${name} must be text.` }
  }
  const text = value.trim()
  if (text.length === 0) {
    return { text: null }
  }
  if (text.length > max) {
    return { error: `${name} must be ${max} characters or fewer.` }
  }
  return { text }
}

export function cleanRequiredText(value: unknown, name: string, max: number): { text: string } | { error: string } {
  const cleaned = cleanOptionalText(value, name, max)
  if ('error' in cleaned) {
    return cleaned
  }
  if (cleaned.text == null) {
    return { error: `${name} is required.` }
  }
  return { text: cleaned.text }
}

export function retestIntervalError(
  minimumRetestDays: number | null,
  suggestedRetestDays: number | null,
): string | null {
  if (minimumRetestDays != null && (!Number.isInteger(minimumRetestDays) || minimumRetestDays < 1)) {
    return 'Minimum retest days must be at least 1.'
  }
  if (suggestedRetestDays != null && (!Number.isInteger(suggestedRetestDays) || suggestedRetestDays < 1)) {
    return 'Suggested retest days must be at least 1.'
  }
  if (
    minimumRetestDays != null &&
    suggestedRetestDays != null &&
    suggestedRetestDays < minimumRetestDays
  ) {
    return 'Suggested retest days cannot be shorter than the minimum.'
  }
  return null
}

export function experimentStatusTransitionError(from: ExperimentStatus, to: ExperimentStatus): string | null {
  if ((RESULT_ONLY_EXPERIMENT_STATUSES as readonly string[]).includes(to)) {
    return 'Completed and inconclusive status come from a later result workflow.'
  }
  if (!EXPERIMENT_TRANSITIONS[from].includes(to)) {
    return `An experiment cannot move from ${from} to ${to}.`
  }
  return null
}

export function experimentWindowError(
  start: string | null,
  end: string | null,
): { windowStart: string; windowEnd: string } | { error: string } {
  if (start == null || end == null || start.trim() === '' || end.trim() === '') {
    return { error: 'A scheduled experiment needs a start date and an end date.' }
  }
  const windowStart = start.trim()
  const windowEnd = end.trim()
  if (!isCalendarDate(windowStart) || !isCalendarDate(windowEnd)) {
    return { error: 'Use calendar dates as YYYY-MM-DD.' }
  }
  if (windowEnd < windowStart) {
    return { error: 'The window end must be on or after the window start.' }
  }
  return { windowStart, windowEnd }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function selectorString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  return typeof value === 'string' ? value : null
}

function known(set: ReadonlySet<string>, id: string): boolean {
  return set.has(id)
}

export function parseLabRequirement(
  input: unknown,
  position: number,
  existence: LabExistence,
): LabRequirement | { error: string } {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Each requirement needs a role, domain, and selector.' }
  }
  const record = input as Record<string, unknown>
  const role = record.role
  const domain = record.domain
  const requirementKind = record.requirementKind
  if (typeof role !== 'string' || !(LAB_REQUIREMENT_ROLES as readonly string[]).includes(role)) {
    return { error: 'Unknown requirement role.' }
  }
  if (typeof domain !== 'string' || !(LAB_REQUIREMENT_DOMAINS as readonly string[]).includes(domain)) {
    return { error: 'Unknown requirement domain.' }
  }
  if (typeof requirementKind !== 'string' || !(LAB_REQUIREMENT_KINDS as readonly string[]).includes(requirementKind)) {
    return { error: 'Unknown requirement kind.' }
  }
  const labelResult = cleanRequiredText(record.label, 'Requirement label', 200)
  if ('error' in labelResult) {
    return labelResult
  }
  const selector = record.selector
  if (selector == null || typeof selector !== 'object' || Array.isArray(selector)) {
    return { error: 'Requirement selector must be an object.' }
  }
  const parsed = parseSelector(domain as LabRequirementDomain, requirementKind as LabRequirementKind, selector as Record<string, unknown>, existence)
  if ('error' in parsed) {
    return parsed
  }
  const parsedCriteria = criteriaOrError(requirementKind, record.criteria)
  if ('error' in parsedCriteria) {
    return parsedCriteria
  }
  return {
    position,
    role: role as LabRequirementRole,
    domain: domain as LabRequirementDomain,
    requirementKind: requirementKind as LabRequirementKind,
    selector: parsed.selector,
    label: labelResult.text,
    required: record.required === false ? false : true,
    criteria: parsedCriteria,
  }
}

function criteriaOrError(kind: string, input: unknown): RequirementCriteria | { error: string } {
  return parseRequirementCriteria(kind, input)
}

function parseSelector(
  domain: LabRequirementDomain,
  kind: LabRequirementKind,
  selector: Record<string, unknown>,
  existence: LabExistence,
): { selector: Record<string, string> } | { error: string } {
  const keys = Object.keys(selector)
  if (domain === 'body' && kind === 'body_metric') {
    const metricKey = selectorString(selector, 'metricKey')
    if (keys.length !== 1 || !metricKey || !MANUAL_BODY_METRICS.some((item) => item.key === metricKey)) {
      return { error: 'Unknown body metric.' }
    }
    return { selector: { metricKey } }
  }
  if (domain === 'nutrition' && kind === 'nutrition_metric') {
    const metricKey = selectorString(selector, 'metricKey')
    if (keys.length !== 1 || !metricKey || !(LAB_NUTRITION_METRICS as readonly string[]).includes(metricKey)) {
      return { error: 'Unknown nutrition metric.' }
    }
    return { selector: { metricKey } }
  }
  if (domain === 'activity' && kind === 'activity_metric') {
    const metricKey = selectorString(selector, 'metricKey')
    if (keys.length !== 1 || !metricKey || !(ACTIVITY_METRICS as readonly string[]).includes(metricKey)) {
      return { error: 'Unknown activity metric.' }
    }
    return { selector: { metricKey } }
  }
  if (domain === 'sleep' && kind === 'sleep_metric') {
    const metricKey = selectorString(selector, 'metricKey')
    if (keys.length !== 1 || !metricKey || !(LAB_SLEEP_METRICS as readonly string[]).includes(metricKey)) {
      return { error: 'Unknown sleep metric.' }
    }
    return { selector: { metricKey } }
  }
  if (domain === 'context' && kind === 'context_tag') {
    const tagKey = selectorString(selector, 'tagKey')
    if (keys.length !== 1 || !tagKey || !isDailyContextTagKey(tagKey)) {
      return { error: 'Unknown context tag.' }
    }
    return { selector: { tagKey } }
  }
  if (domain === 'supplements' && kind === 'supplement_adherence') {
    const supplementId = selectorString(selector, 'supplementId')
    if (keys.length !== 1 || !isUuid(supplementId)) {
      return { error: 'Supplement adherence needs a supplement id.' }
    }
    if (!known(existence.supplementIds, supplementId)) {
      return { error: 'That supplement was not found.' }
    }
    return { selector: { supplementId } }
  }
  if (domain === 'training' && kind === 'training_measure') {
    const exerciseDefinitionId = selectorString(selector, 'exerciseDefinitionId')
    const measure = selectorString(selector, 'measure')
    if (keys.length !== 2 || !isUuid(exerciseDefinitionId) || !measure) {
      return { error: 'Training evidence needs an exercise and a measure.' }
    }
    if (!(LAB_TRAINING_MEASURES as readonly string[]).includes(measure)) {
      return { error: 'Unsupported training measure.' }
    }
    if (!known(existence.exerciseIds, exerciseDefinitionId)) {
      return { error: 'That exercise was not found.' }
    }
    return { selector: { exerciseDefinitionId, measure } }
  }
  if (domain === 'benchmark' && kind === 'benchmark_definition') {
    const benchmarkDefinitionId = selectorString(selector, 'benchmarkDefinitionId')
    const benchmarkProtocolVersionId = selectorString(selector, 'benchmarkProtocolVersionId')
    const expectedKeys = benchmarkProtocolVersionId ? 2 : 1
    if (keys.length !== expectedKeys || !isUuid(benchmarkDefinitionId)) {
      return { error: 'Benchmark evidence needs a benchmark id.' }
    }
    if (!known(existence.benchmarkIds, benchmarkDefinitionId)) {
      return { error: 'That benchmark was not found.' }
    }
    if (benchmarkProtocolVersionId) {
      if (!isUuid(benchmarkProtocolVersionId)) {
        return { error: 'Benchmark evidence needs a protocol version id.' }
      }
      const pin = `${benchmarkDefinitionId}:${benchmarkProtocolVersionId}`
      if (existence.benchmarkProtocolPins && !existence.benchmarkProtocolPins.has(pin)) {
        return { error: 'That protocol version does not belong to the benchmark.' }
      }
      return { selector: { benchmarkDefinitionId, benchmarkProtocolVersionId } }
    }
    return { selector: { benchmarkDefinitionId } }
  }
  return { error: 'That requirement kind does not match its domain.' }
}

export function parseLabRequirements(
  input: unknown,
  existence: LabExistence,
): LabRequirement[] | { error: string } {
  if (input == null) {
    return []
  }
  if (!Array.isArray(input)) {
    return { error: 'Requirements must be a list.' }
  }
  const requirements: LabRequirement[] = []
  for (let index = 0; index < input.length; index += 1) {
    const parsed = parseLabRequirement(input[index], index + 1, existence)
    if ('error' in parsed) {
      return parsed
    }
    requirements.push(parsed)
  }
  return requirements
}

export function parseContextControls(input: unknown): Array<{ tagKey: (typeof DAILY_CONTEXT_TAG_KEYS)[number]; controlMode: 'observe' }> | { error: string } {
  if (input == null) {
    return []
  }
  if (!Array.isArray(input)) {
    return { error: 'Context controls must be a list of tags.' }
  }
  const seen = new Set<string>()
  const controls: Array<{ tagKey: (typeof DAILY_CONTEXT_TAG_KEYS)[number]; controlMode: 'observe' }> = []
  for (const item of input) {
    const tagKey = typeof item === 'string' ? item : typeof item === 'object' && item && 'tagKey' in item ? (item as { tagKey?: unknown }).tagKey : null
    if (typeof tagKey !== 'string' || !isDailyContextTagKey(tagKey)) {
      return { error: 'Unknown context tag.' }
    }
    if (typeof item === 'object' && item && 'controlMode' in item && (item as { controlMode?: unknown }).controlMode !== 'observe') {
      return { error: 'Context controls can only observe a tag. They do not exclude days.' }
    }
    if (seen.has(tagKey)) {
      continue
    }
    seen.add(tagKey)
    controls.push({ tagKey, controlMode: 'observe' })
  }
  return DAILY_CONTEXT_TAG_KEYS.filter((key) => seen.has(key)).map((tagKey) => ({ tagKey, controlMode: 'observe' as const }))
}

export function parseSupplementLinks(
  input: unknown,
  supplementIds: ReadonlySet<string>,
): Array<{ supplementId: string; role: ExperimentSupplementRole }> | { error: string } {
  if (input == null) {
    return []
  }
  if (!Array.isArray(input)) {
    return { error: 'Supplement links must be a list.' }
  }
  const links: Array<{ supplementId: string; role: ExperimentSupplementRole }> = []
  const seen = new Set<string>()
  for (const item of input) {
    if (item == null || typeof item !== 'object') {
      return { error: 'Each supplement link needs an id and a role.' }
    }
    const record = item as { supplementId?: unknown; role?: unknown }
    if (!isUuid(record.supplementId) || !known(supplementIds, record.supplementId)) {
      return { error: 'That supplement was not found.' }
    }
    if (record.role !== 'intervention' && record.role !== 'tracked') {
      return { error: 'Supplement role must be intervention or tracked.' }
    }
    if (seen.has(record.supplementId)) {
      return { error: 'A supplement can only be linked once.' }
    }
    seen.add(record.supplementId)
    links.push({ supplementId: record.supplementId, role: record.role })
  }
  return links
}

export function parseBenchmarkLinks(
  input: unknown,
  benchmarkIds: ReadonlySet<string>,
): Array<{ benchmarkDefinitionId: string; role: ExperimentBenchmarkRole }> | { error: string } {
  if (input == null) {
    return []
  }
  if (!Array.isArray(input)) {
    return { error: 'Benchmark links must be a list.' }
  }
  const links: Array<{ benchmarkDefinitionId: string; role: ExperimentBenchmarkRole }> = []
  const seen = new Set<string>()
  let primary = 0
  for (const item of input) {
    if (item == null || typeof item !== 'object') {
      return { error: 'Each benchmark link needs an id and a role.' }
    }
    const record = item as { benchmarkDefinitionId?: unknown; role?: unknown }
    if (!isUuid(record.benchmarkDefinitionId) || !known(benchmarkIds, record.benchmarkDefinitionId)) {
      return { error: 'That benchmark was not found.' }
    }
    if (record.role !== 'primary' && record.role !== 'secondary') {
      return { error: 'Benchmark role must be primary or secondary.' }
    }
    if (seen.has(record.benchmarkDefinitionId)) {
      return { error: 'A benchmark can only be linked once.' }
    }
    if (record.role === 'primary') {
      primary += 1
    }
    seen.add(record.benchmarkDefinitionId)
    links.push({ benchmarkDefinitionId: record.benchmarkDefinitionId, role: record.role })
  }
  if (primary > 1) {
    return { error: 'An experiment can have one primary benchmark.' }
  }
  return links
}

export function isBenchmarkDomain(value: string): value is BenchmarkDomain {
  return (BENCHMARK_DOMAINS as readonly string[]).includes(value)
}

export function todayLabExperimentVisible(status: ExperimentStatus): boolean {
  return status === 'scheduled' || status === 'active'
}

export function emptyRequirementCriteria(): RequirementCriteria {
  return { minimumObservations: null, minimumCoveragePercent: null, minimumAdherencePercent: null }
}

export function parseRequirementCriteria(kind: string, input: unknown): RequirementCriteria | { error: string } {
  if (input == null) {
    return emptyRequirementCriteria()
  }
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { error: 'Requirement criteria must be an object.' }
  }
  const record = input as Record<string, unknown>
  const allowed =
    kind === 'supplement_adherence'
      ? ['minimumAdherencePercent', 'minimumCoveragePercent']
      : kind === 'nutrition_metric' || kind === 'activity_metric' || kind === 'sleep_metric'
        ? ['minimumObservations', 'minimumCoveragePercent']
        : kind === 'training_measure' || kind === 'body_metric' || kind === 'benchmark_definition'
          ? ['minimumObservations']
          : []
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      return { error: 'That requirement does not use this criterion.' }
    }
  }
  const minimumObservations = optionalCriterionInt(record.minimumObservations, 'Minimum observations')
  if (typeof minimumObservations === 'string') return { error: minimumObservations }
  const minimumCoveragePercent = optionalCriterionPercent(record.minimumCoveragePercent, 'Minimum coverage')
  if (typeof minimumCoveragePercent === 'string') return { error: minimumCoveragePercent }
  const minimumAdherencePercent = optionalCriterionPercent(record.minimumAdherencePercent, 'Minimum adherence')
  if (typeof minimumAdherencePercent === 'string') return { error: minimumAdherencePercent }
  return { minimumObservations, minimumCoveragePercent, minimumAdherencePercent }
}

export function experimentBenchmarkPinError(requirements: readonly LabRequirement[]): string | null {
  for (const requirement of requirements) {
    if (requirement.requirementKind === 'benchmark_definition' && !requirement.selector.benchmarkProtocolVersionId) {
      return 'An experiment benchmark outcome must name the benchmark protocol version.'
    }
  }
  return null
}

function optionalCriterionInt(value: unknown, name: string): number | null | string {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) return `${name} must be at least 1.`
  return parsed
}

function optionalCriterionPercent(value: unknown, name: string): number | null | string {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return `${name} must be between 0 and 100.`
  return parsed
}
