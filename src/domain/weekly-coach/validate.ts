import { WEEKLY_COACH_PACKET_CHAR_LIMIT, WEEKLY_COACH_WATCH_CAP, WEEKLY_COACH_WENT_WELL_CAP } from './config.js'
import type { GoalControlState } from '../goal-control.js'
import type { WeeklyCandidate, WeeklyCoachBrief, WeeklyCoachCommentary, WeeklyCoachDeepReview } from './types.js'

const NUMBER = /\d/
const PROHIBITED =
  /\b(calorie|calories|dose|medication|supplement|literature|citation|overtraining|apnea|metabolic|hormonal)\b|\btraining volume\b|\b(start|try|begin)\b[^.]*\bexperiment\b/i

export function coachPacketText(brief: WeeklyCoachBrief): string {
  const core = {
    period: brief.period,
    previousPeriod: brief.previousPeriod,
    coverage: brief.coverage,
    candidates: brief.candidates.map(candidatePacket),
  }
  const facts = brief.facts.map((fact) => ({ id: fact.id, text: fact.text }))
  const full = JSON.stringify({ ...core, facts })
  if (full.length <= WEEKLY_COACH_PACKET_CHAR_LIMIT) {
    return full
  }
  return JSON.stringify(core)
}

export function coachDeepReviewPacketText(brief: WeeklyCoachBrief, decision: GoalControlState): string {
  const weekly = JSON.parse(coachPacketText(brief)) as Record<string, unknown>
  const intelligence = {
    state: decision.state,
    confidence: decision.confidence,
    headline: decision.headline,
    summary: decision.summary,
    noChangeRecommended: decision.noChangeRecommended,
    primaryOpportunity: decision.primaryOpportunity == null ? null : {
      id: decision.primaryOpportunity.id,
      kind: decision.primaryOpportunity.kind,
      domain: decision.primaryOpportunity.domain,
      title: decision.primaryOpportunity.title,
      detail: decision.primaryOpportunity.detail,
      actionText: decision.primaryOpportunity.actionText,
      detailPath: decision.primaryOpportunity.detailPath,
      evidenceRefs: decision.primaryOpportunity.evidenceRefs,
    },
    trainingAdherence: decision.trainingAdherence,
    nutritionQuality: decision.nutritionQuality,
    limitations: decision.limitations.slice(0, 4),
    maintenance: decision.maintenance == null ? null : {
      estimateState: decision.maintenance.estimate.state,
      confidence: decision.maintenance.estimate.confidence,
      plateau: decision.maintenance.plateau,
      interventions: decision.maintenance.interventions.slice(0, 3),
    },
    trainingProgression: decision.trainingProgression == null ? null : {
      summary: decision.trainingProgression.summary,
      series: decision.trainingProgression.series.slice(0, 6).map((item) => ({
        exerciseName: item.exerciseName,
        state: item.state,
        confidence: item.confidence,
        explanation: item.explanation,
        limitationKinds: item.limitationKinds,
      })),
    },
  }
  const full = JSON.stringify({ ...weekly, intelligence })
  if (full.length <= WEEKLY_COACH_PACKET_CHAR_LIMIT) return full
  return JSON.stringify({
    period: brief.period,
    previousPeriod: brief.previousPeriod,
    coverage: brief.coverage,
    candidates: brief.candidates.map(candidatePacket),
    intelligence,
  })
}

export function validateWeeklyCoachModel(
  text: string,
  brief: WeeklyCoachBrief,
  options: { experimentIdea?: WeeklyCoachDeepReview['experimentIdea'] } = {},
): WeeklyCoachCommentary | null {
  const parsed = parseModel(text)
  if (!parsed) {
    return null
  }
  const allowed = new Map(brief.candidates.map((item) => [item.id, item]))
  const wentWell = sectionRefs(parsed.went_well, 'went_well', allowed)
  const worthWatching = sectionRefs(parsed.worth_watching, 'worth_watching', allowed)
  const focus = focusRef(parsed.focus, allowed)
  if (!wentWell || !worthWatching || focus === undefined) {
    return null
  }
  const comments: Record<string, string> = {}
  for (const item of [...wentWell, ...worthWatching]) {
    if (!cleanComment(item.comment)) {
      return null
    }
    comments[item.candidate_ref] = item.comment.trim()
  }
  if (focus && !cleanComment(focus.comment)) {
    return null
  }
  if (focus) {
    comments[focus.candidate_ref] = focus.comment.trim()
  }
  const intro = typeof parsed.intro?.text === 'string' ? parsed.intro.text.trim() : ''
  if (intro && (NUMBER.test(intro) || intro.length > 280 || PROHIBITED.test(intro))) {
    return null
  }
  const deepReview = parseDeepReview(parsed.deep_review, options.experimentIdea ?? null)
  if (deepReview === undefined) return null
  return {
    intro: intro || null,
    comments,
    wentWellIds: wentWell.slice(0, WEEKLY_COACH_WENT_WELL_CAP).map((item) => item.candidate_ref),
    worthWatchingIds: worthWatching.slice(0, WEEKLY_COACH_WATCH_CAP).map((item) => item.candidate_ref),
    focusId: focus?.candidate_ref ?? null,
    deepReview,
  }
}

function candidatePacket(candidate: WeeklyCandidate) {
  return {
    id: candidate.id,
    section: candidate.section,
    kind: candidate.kind,
    fact: candidate.fact,
    evidenceRefs: candidate.evidenceRefs,
    actionText: candidate.actionText,
  }
}

function parseModel(text: string): ModelShape | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return null
  }
  try {
    const value = JSON.parse(text.slice(start, end + 1)) as ModelShape
    if (!value || typeof value !== 'object' || !Array.isArray(value.went_well) || !Array.isArray(value.worth_watching)) {
      return null
    }
    return value
  } catch {
    return null
  }
}

function sectionRefs(
  items: ModelItem[] | undefined,
  section: WeeklyCandidate['section'],
  allowed: Map<string, WeeklyCandidate>,
): ModelItem[] | null {
  if (!items) {
    return null
  }
  const seen = new Set<string>()
  for (const item of items) {
    if (!item || typeof item.candidate_ref !== 'string' || typeof item.comment !== 'string') {
      return null
    }
    const candidate = allowed.get(item.candidate_ref)
    if (!candidate || candidate.section !== section || seen.has(item.candidate_ref)) {
      return null
    }
    seen.add(item.candidate_ref)
  }
  return items
}

function focusRef(focus: ModelShape['focus'], allowed: Map<string, WeeklyCandidate>): ModelItem | null | undefined {
  if (focus == null) {
    return null
  }
  if (typeof focus !== 'object' || typeof focus.candidate_ref !== 'string' || typeof focus.comment !== 'string') {
    return undefined
  }
  const candidate = allowed.get(focus.candidate_ref)
  if (!candidate || candidate.section !== 'focus') {
    return undefined
  }
  return focus
}

function cleanComment(comment: string): boolean {
  const text = comment.trim()
  return text.length > 0 && text.length <= 180 && !NUMBER.test(text) && !PROHIBITED.test(text)
}

const DEEP_PROHIBITED =
  /\b(diagnos(?:e|is|tic)?|disease|treatment|medication|dose|apnea|metabolic|hormonal|overtraining)\b|\b(increase|decrease|raise|lower|cut|change|start|stop)\b[^.]{0,60}\b(calorie|supplement|medication|dose)\b/i

function cleanDeepText(value: unknown, max = 320): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text.length > 0 && text.length <= max && !DEEP_PROHIBITED.test(text) ? text : null
}

function deepList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 3) return null
  const items = value.map((item) => cleanDeepText(item, 240))
  return items.every((item): item is string => item != null) ? items : null
}

function parseDeepReview(
  value: ModelShape['deep_review'],
  experimentIdea: WeeklyCoachDeepReview['experimentIdea'],
): WeeklyCoachDeepReview | null | undefined {
  if (value == null) return null
  if (typeof value !== 'object') return undefined
  const summary = cleanDeepText(value.summary)
  const competingExplanations = deepList(value.competing_explanations)
  const whatWouldImprove = deepList(value.what_would_improve)
  if (!summary || !competingExplanations || !whatWouldImprove) return undefined
  return { summary, competingExplanations, whatWouldImprove, experimentIdea }
}

type ModelItem = { candidate_ref: string; comment: string }

type ModelShape = {
  intro?: { text?: string }
  went_well?: ModelItem[]
  worth_watching?: ModelItem[]
  focus?: ModelItem | null
  deep_review?: {
    summary?: unknown
    competing_explanations?: unknown
    what_would_improve?: unknown
    experiment_idea?: { title?: unknown; why?: unknown } | null
  } | null
}
