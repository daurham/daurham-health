import { randomUUID } from 'node:crypto'
import {
  COACH_INTELLIGENCE_VERSION,
  COACH_QUESTION_BUDGET_DAYS,
  buildCoachFollowUpQuestion,
  buildCoachRecommendationDrafts,
  recommendationIsSuppressed,
  type CoachFollowUpQuestion,
  type CoachIntelligenceState,
  type CoachRecommendationDraft,
  type CoachRecommendationFollowUp,
  type CoachRecommendationMemory,
  type CoachRecommendationOutcome,
  type CoachRecommendationResponse,
  type CoachRecommendationView,
} from '../../src/domain/coach-intelligence.js'
import { addCalendarDays } from '../../src/domain/training-plan.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'
import { loadGoalControlState } from './goal-control.js'

type RecommendationRow = {
  id: string
  fingerprint: string
  recommendation_kind: string
  domain: string
  title: string
  detail: string
  action_text: string
  detail_path: string
  confidence: 'limited' | 'moderate' | 'high' | 'unknown'
  evidence_refs: unknown
  response_state: CoachRecommendationResponse | null
  surfaced_on: string
  last_surfaced_on: string
  suppress_until: string | null
  follow_up_on: string | null
  outcome_state: CoachRecommendationOutcome | null
  response_at: string | Date | null
  outcome_at: string | Date | null
  metadata: Record<string, unknown> | null
}

const ROW_COLUMNS = `
  id::text AS id,
  fingerprint,
  recommendation_kind,
  domain,
  title,
  detail,
  action_text,
  detail_path,
  confidence,
  evidence_refs,
  response_state,
  surfaced_on::text AS surfaced_on,
  last_surfaced_on::text AS last_surfaced_on,
  suppress_until::text AS suppress_until,
  follow_up_on::text AS follow_up_on,
  outcome_state,
  response_at,
  outcome_at,
  metadata
`

function recordMemory(row: RecommendationRow): CoachRecommendationMemory {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    recommendationKind: row.recommendation_kind,
    responseState: row.response_state,
    suppressUntil: row.suppress_until,
    followUpOn: row.follow_up_on,
    outcomeState: row.outcome_state,
    lastSurfacedOn: row.last_surfaced_on,
  }
}

async function rowsForFingerprints(sql: Sql, fingerprints: readonly string[]): Promise<RecommendationRow[]> {
  if (fingerprints.length === 0) return []
  return (await sql.query(
    `SELECT ${ROW_COLUMNS}
       FROM coach_recommendations
      WHERE fingerprint = ANY($1::text[])`,
    [[...fingerprints]],
  )) as RecommendationRow[]
}

async function surfaceDraft(sql: Sql, draft: CoachRecommendationDraft, asOf: string): Promise<RecommendationRow> {
  const rows = (await sql.query(
    `INSERT INTO coach_recommendations (
       id, fingerprint, recommendation_kind, domain, title, detail, action_text, detail_path,
       confidence, evidence_refs, surfaced_on, last_surfaced_on, metadata
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::date, $11::date, $12::jsonb
     )
     ON CONFLICT (fingerprint) DO UPDATE SET
       recommendation_kind = EXCLUDED.recommendation_kind,
       domain = EXCLUDED.domain,
       title = EXCLUDED.title,
       detail = EXCLUDED.detail,
       action_text = EXCLUDED.action_text,
       detail_path = EXCLUDED.detail_path,
       confidence = EXCLUDED.confidence,
       evidence_refs = EXCLUDED.evidence_refs,
       last_surfaced_on = EXCLUDED.last_surfaced_on,
       metadata = EXCLUDED.metadata,
       updated_at = now()
     RETURNING ${ROW_COLUMNS}`,
    [
      randomUUID(),
      draft.fingerprint,
      draft.kind,
      draft.domain,
      draft.title,
      draft.detail,
      draft.actionText,
      draft.detailPath,
      draft.confidence,
      JSON.stringify(draft.evidenceRefs),
      asOf,
      JSON.stringify({ sourceId: draft.sourceId, experimentEligible: draft.experimentEligible }),
    ],
  )) as RecommendationRow[]
  const row = rows[0]
  if (!row) throw new HttpError(500, 'Coach recommendation could not be saved')
  return row
}

async function surfaceQuestion(
  sql: Sql,
  question: ReturnType<typeof buildCoachFollowUpQuestion>,
  asOf: string,
): Promise<RecommendationRow | null> {
  if (!question) return null
  const rows = (await sql.query(
    `INSERT INTO coach_recommendations (
       id, fingerprint, recommendation_kind, domain, title, detail, action_text, detail_path,
       confidence, evidence_refs, surfaced_on, last_surfaced_on, metadata
     ) VALUES (
       $1::uuid, $2, $3, $4, $5, $6, $7, $8, 'limited', $9::jsonb, $10::date, $10::date, '{}'::jsonb
     )
     ON CONFLICT (fingerprint) DO UPDATE SET
       title = EXCLUDED.title,
       detail = EXCLUDED.detail,
       action_text = EXCLUDED.action_text,
       detail_path = EXCLUDED.detail_path,
       evidence_refs = EXCLUDED.evidence_refs,
       last_surfaced_on = EXCLUDED.last_surfaced_on,
       updated_at = now()
     RETURNING ${ROW_COLUMNS}`,
    [
      randomUUID(),
      question.fingerprint,
      question.kind,
      question.domain,
      question.title,
      question.detail,
      question.actionText,
      question.detailPath,
      JSON.stringify(question.evidenceRefs),
      asOf,
    ],
  )) as RecommendationRow[]
  return rows[0] ?? null
}

function recommendationView(row: RecommendationRow, draft: CoachRecommendationDraft, asOf: string): CoachRecommendationView {
  const responseState =
    row.response_state === 'not_now' && row.suppress_until != null && asOf >= row.suppress_until
      ? null
      : row.response_state
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    kind: draft.kind,
    domain: draft.domain,
    title: draft.title,
    detail: draft.detail,
    actionText: draft.actionText,
    detailPath: draft.detailPath,
    confidence: draft.confidence,
    evidenceRefs: [...draft.evidenceRefs],
    responseState,
    experimentEligible: draft.experimentEligible,
  }
}

async function dueFollowUps(sql: Sql, asOf: string): Promise<CoachRecommendationFollowUp[]> {
  const rows = (await sql.query(
    `SELECT ${ROW_COLUMNS}
       FROM coach_recommendations
      WHERE response_state = 'do_this'
        AND outcome_state IS NULL
        AND follow_up_on IS NOT NULL
        AND follow_up_on <= $1::date
      ORDER BY follow_up_on, response_at, id
      LIMIT 3`,
    [asOf],
  )) as RecommendationRow[]
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    detail: row.detail,
    detailPath: row.detail_path,
    acceptedOn: row.response_at == null
      ? null
      : (row.response_at instanceof Date ? row.response_at.toISOString() : new Date(row.response_at).toISOString()),
    followUpOn: row.follow_up_on!,
  }))
}

async function recentQuestion(sql: Sql, asOf: string): Promise<RecommendationRow | null> {
  const since = addCalendarDays(asOf, -(COACH_QUESTION_BUDGET_DAYS - 1))
  const rows = (await sql.query(
    `SELECT ${ROW_COLUMNS}
       FROM coach_recommendations
      WHERE recommendation_kind = 'follow_up_question'
        AND last_surfaced_on BETWEEN $1::date AND $2::date
      ORDER BY last_surfaced_on DESC, updated_at DESC, id DESC
      LIMIT 1`,
    [since, asOf],
  )) as RecommendationRow[]
  return rows[0] ?? null
}

function questionView(row: RecommendationRow): CoachFollowUpQuestion {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    kind: 'follow_up_question',
    domain: row.domain,
    title: row.title,
    detail: row.detail,
    actionText: row.action_text,
    detailPath: row.detail_path,
    confidence: 'limited',
    evidenceRefs: Array.isArray(row.evidence_refs)
      ? row.evidence_refs.filter((item): item is string => typeof item === 'string')
      : [],
  }
}

export async function loadCoachIntelligenceState(asOf: string): Promise<CoachIntelligenceState> {
  const [sql, control] = await Promise.all([getSql(), loadGoalControlState(asOf)])
  const drafts = buildCoachRecommendationDrafts(control)
  const existing = await rowsForFingerprints(sql, drafts.map((item) => item.fingerprint))
  const memory = new Map(existing.map((row) => [row.fingerprint, recordMemory(row)]))
  const visible = drafts.filter((draft) => !recommendationIsSuppressed(memory.get(draft.fingerprint), asOf))
  const surfaced: CoachRecommendationView[] = []
  for (const draft of visible) {
    const row = await surfaceDraft(sql, draft, asOf)
    surfaced.push(recommendationView(row, draft, asOf))
  }

  let question: CoachFollowUpQuestion | null = null
  const recent = await recentQuestion(sql, asOf)
  if (recent) {
    question = questionView(recent)
  } else {
    const draft = buildCoachFollowUpQuestion(control)
    const row = await surfaceQuestion(sql, draft, asOf)
    if (draft && row) {
      question = {
        id: row.id,
        ...draft,
      }
    }
  }

  const followUps = await dueFollowUps(sql, asOf)
  const headline =
    control.state === 'act'
      ? surfaced.length > 0 ? 'A few things are worth your attention' : 'Your current recommendation is already handled'
      : control.state === 'maintain'
        ? 'Stay the course'
        : surfaced.length > 0 ? 'Improve the evidence before changing course' : 'More evidence before changing course'
  const summary =
    control.state === 'maintain'
      ? 'No change recommended. Current evidence does not justify adding work or changing targets.'
      : surfaced[0]?.detail ?? control.summary

  return {
    version: COACH_INTELLIGENCE_VERSION,
    asOf,
    state: control.state,
    headline,
    summary,
    noChangeRecommended: control.noChangeRecommended,
    nextBestActions: surfaced.slice(0, 3),
    followUps,
    question,
    questionBudgetDays: COACH_QUESTION_BUDGET_DAYS,
  }
}

async function recommendationById(sql: Sql, id: string): Promise<RecommendationRow> {
  const rows = (await sql.query(
    `SELECT ${ROW_COLUMNS}
       FROM coach_recommendations
      WHERE id = $1::uuid
      LIMIT 1`,
    [id],
  )) as RecommendationRow[]
  const row = rows[0]
  if (!row) throw new HttpError(404, 'Coach recommendation was not found')
  return row
}

export async function respondCoachRecommendation(
  id: string,
  response: CoachRecommendationResponse,
  asOf: string,
): Promise<CoachIntelligenceState> {
  const sql = await getSql()
  const row = await recommendationById(sql, id)
  if (row.recommendation_kind === 'follow_up_question') {
    throw new HttpError(409, 'Follow-up questions do not use recommendation response states')
  }
  const suppressUntil = response === 'not_now' ? addCalendarDays(asOf, 7) : null
  const followUpOn = response === 'do_this' ? addCalendarDays(asOf, 7) : null
  await sql.query(
    `UPDATE coach_recommendations
        SET response_state = $2,
            suppress_until = $3::date,
            follow_up_on = $4::date,
            response_at = now(),
            outcome_state = NULL,
            outcome_at = NULL,
            updated_at = now()
      WHERE id = $1::uuid`,
    [id, response, suppressUntil, followUpOn],
  )
  return loadCoachIntelligenceState(asOf)
}

export async function recordCoachRecommendationOutcome(
  id: string,
  outcome: CoachRecommendationOutcome,
  asOf: string,
): Promise<CoachIntelligenceState> {
  const sql = await getSql()
  const row = await recommendationById(sql, id)
  if (row.response_state !== 'do_this') {
    throw new HttpError(409, 'Only accepted Coach recommendations can receive an outcome')
  }
  await sql.query(
    `UPDATE coach_recommendations
        SET outcome_state = $2,
            outcome_at = now(),
            updated_at = now()
      WHERE id = $1::uuid`,
    [id, outcome],
  )
  return loadCoachIntelligenceState(asOf)
}
