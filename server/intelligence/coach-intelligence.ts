import { createHash, randomUUID } from 'node:crypto'
import {
  COACH_INTELLIGENCE_VERSION,
  COACH_QUESTION_BUDGET_DAYS,
  buildCoachFollowUpQuestion,
  buildCoachRecommendationDrafts,
  keepVisibleCoachDependencies,
  keepCurrentCalorieDecisionDrafts,
  isCalorieDecisionKind,
  storedCoachRecommendationIsCurrent,
  keepCurrentCoachFollowUps,
  keepNonCompetingCalorieDrafts,
  POSSIBLE_PLATEAU_RESPONSE_GROUP,
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
import type { GoalControlState } from '../../src/domain/goal-control.js'
import { addCalendarDays } from '../../src/domain/training-plan.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'
import { loadGoalControlState } from './goal-control.js'
import { isMaintenanceDecisionRevisionCurrent } from './maintenance-revision.js'

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
  response_at::text AS response_at,
  outcome_at,
  metadata
`

/** Hash the exact owner-facing card plus its relevant Goal Control evidence.
 * This is an optimistic decision-context token, not a substitute for the
 * canonical data revision, an owner acknowledgement or a serializable read.
 * Keep unrelated domains out of the source context to reduce false staleness.
 */
export function coachRecommendationContextRevision(
  draft: CoachRecommendationDraft,
  control: GoalControlState,
): string {
  const evidence = draft.domain === 'training'
    ? { progression: control.trainingProgression, adherence: control.trainingAdherence }
    : draft.kind === 'improve_evidence'
      ? {
          nutritionQuality: control.nutritionQuality,
          limitations: control.limitations.filter((item) => draft.evidenceRefs.includes(`limitation:${item.code}`)),
        }
      : draft.domain === 'goals'
        ? { goals: control.goals, primaryOpportunity: control.primaryOpportunity }
        : draft.domain === 'nutrition'
          ? { nutritionQuality: control.nutritionQuality, maintenance: control.maintenance }
          : { primaryOpportunity: control.primaryOpportunity, relationships: control.relationships, limitations: control.limitations }
  return createHash('sha256').update(JSON.stringify({
    version: 'coach-context-v1',
    asOf: control.asOf,
    period: control.period,
    fingerprint: draft.fingerprint,
    kind: draft.kind,
    domain: draft.domain,
    title: draft.title,
    detail: draft.detail,
    actionText: draft.actionText,
    detailPath: draft.detailPath,
    confidence: draft.confidence,
    evidenceRefs: draft.evidenceRefs,
    evidenceExplanation: draft.evidenceExplanation ?? null,
    evidence,
  })).digest('hex')
}

function recordMemory(row: RecommendationRow): CoachRecommendationMemory {
  return {
    id: row.id,
    fingerprint: row.fingerprint,
    recommendationKind: row.recommendation_kind,
    responseState: row.response_state,
    ownerStarted: row.metadata?.ownerStarted === true,
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

export async function surfaceDraft(sql: Sql, draft: CoachRecommendationDraft, asOf: string, decisionRevision: string | null): Promise<RecommendationRow> {
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
       metadata = CASE
         WHEN coach_recommendations.response_state = 'do_this'
              AND coach_recommendations.recommendation_kind IN ('review_intake_adjustment', 'review_activity_adjustment')
           THEN coach_recommendations.metadata
         ELSE EXCLUDED.metadata ||
           CASE WHEN coach_recommendations.metadata ->> 'ownerStarted' = 'true'
             THEN '{"ownerStarted":true}'::jsonb ELSE '{}'::jsonb END
       END,
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
      JSON.stringify({ sourceId: draft.sourceId, experimentEligible: draft.experimentEligible,
        ...(isCalorieDecisionKind(draft.kind)
          ? { decisionGroup: POSSIBLE_PLATEAU_RESPONSE_GROUP, decisionRevision: decisionRevision ?? null }
          : {}) }),
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
    ...(draft.evidenceExplanation ? { evidenceExplanation: draft.evidenceExplanation } : {}),
    evidenceRefs: [...draft.evidenceRefs],
    responseState,
    responseAt: row.response_at == null ? null : String(row.response_at),
    experimentEligible: draft.experimentEligible,
  }
}

/** Qualify evidence-sensitive rows inside SQL BEFORE limiting the due queue.
 * Stale numeric cards must not starve valid follow-ups further down a large queue.
 */
export async function dueFollowUps(
  sql: Sql,
  asOf: string,
  decisionRevision: string | null,
  eligibleFingerprints: readonly string[],
): Promise<RecommendationRow[]> {
  return await sql.query(
    `SELECT ${ROW_COLUMNS}
       FROM coach_recommendations
      WHERE response_state = 'do_this'
        AND metadata ->> 'ownerStarted' = 'true'
        AND outcome_state IS NULL
        AND response_at IS NOT NULL
        AND follow_up_on IS NOT NULL
        AND follow_up_on <= $1::date
        AND (
          recommendation_kind NOT IN ('review_intake_adjustment', 'review_activity_adjustment')
          OR (
            metadata ->> 'decisionRevision' = $2::text
            AND fingerprint = ANY($3::text[])
          )
        )
      ORDER BY follow_up_on, response_at, id
      LIMIT 3`,
    [asOf, decisionRevision, eligibleFingerprints],
  ) as RecommendationRow[]
}

/** One active (started, not yet evaluated) choice per current plateau
 * decision revision. Old revisions or review-only legacy rows do not block a
 * fresh, qualified decision; neither is reclassified or erased.
 */
export async function activeCalorieDecisionInRevision(sql: Sql, revision: string | null | undefined): Promise<boolean> {
  if (!revision || !/^[a-f0-9]{32}$/.test(revision)) return false
  const rows = await sql.query(
    `SELECT id::text AS id
       FROM coach_recommendations
      WHERE recommendation_kind IN ('review_intake_adjustment', 'review_activity_adjustment')
        AND response_state = 'do_this'
        AND metadata ->> 'ownerStarted' = 'true'
        AND metadata ->> 'decisionRevision' = $1::text
        AND outcome_state IS NULL
      LIMIT 1`,
    [revision],
  )
  return rows.length > 0
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
  const visible = keepVisibleCoachDependencies(
    drafts.filter((draft) => !recommendationIsSuppressed(memory.get(draft.fingerprint), asOf)),
  )
  // Recheck the exact revision immediately before surfacing numeric advice.
  // This is optimistic read consistency; no automatic target writes occur.
  const containsCalorieReview = visible.some((draft) =>
    draft.kind === 'review_intake_adjustment' || draft.kind === 'review_activity_adjustment')
  const currentRevision = containsCalorieReview
    ? await isMaintenanceDecisionRevisionCurrent(asOf, control.maintenance?.decisionRevision)
    : true
  const currentDrafts = keepCurrentCalorieDecisionDrafts(visible, currentRevision)
  const activePlateauDecision = currentRevision &&
    currentDrafts.some((draft) => isCalorieDecisionKind(draft.kind)) &&
    await activeCalorieDecisionInRevision(sql, control.maintenance?.decisionRevision)
  const actionableDrafts = keepNonCompetingCalorieDrafts(currentDrafts, activePlateauDecision)
  const surfaced: CoachRecommendationView[] = []
  for (const draft of actionableDrafts) {
    const row = await surfaceDraft(sql, draft, asOf, control.maintenance?.decisionRevision ?? null)
    surfaced.push({
      ...recommendationView(row, draft, asOf),
      ...(!isCalorieDecisionKind(draft.kind)
        ? { contextRevision: coachRecommendationContextRevision(draft, control) }
        : {}),
    })
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

  const validFingerprints = new Set(drafts.map((draft) => draft.fingerprint))
  let dueRows = await dueFollowUps(sql, asOf, control.maintenance?.decisionRevision ?? null, [...validFingerprints])
  const dueHasCalorieAdvice = dueRows.some((row) => isCalorieDecisionKind(row.recommendation_kind))
  // Previously accepted rows are not in the visible drafts (owner response
  // memory suppresses them), so they need independent live qualification.
  const acceptedRevisionCurrent = dueHasCalorieAdvice
    ? await isMaintenanceDecisionRevisionCurrent(asOf, control.maintenance?.decisionRevision)
    : true
  if (!acceptedRevisionCurrent) {
    // The settings changed after we read the queue. Requery non-calorie
    // candidates to fill the visible three slots without stale numeric advice.
    dueRows = await dueFollowUps(sql, asOf, null, [])
  }
  const followUps: CoachRecommendationFollowUp[] = keepCurrentCoachFollowUps(
    dueRows, validFingerprints, control.maintenance?.decisionRevision, acceptedRevisionCurrent,
  ).map((row) => ({
      id: row.id, responseAt: String(row.response_at), title: row.title, detail: row.detail, detailPath: row.detail_path,
      acceptedOn: row.response_at == null
        ? null
        : (row.response_at instanceof Date ? row.response_at.toISOString() : new Date(row.response_at).toISOString()),
      followUpOn: row.follow_up_on!,
      historical: !validFingerprints.has(row.fingerprint),
    }))
  const staleAdviceWithheld = containsCalorieReview && !currentRevision
  const effectiveState = staleAdviceWithheld && surfaced.length === 0 && control.state === 'act'
    ? 'insufficient_evidence' as const : control.state
  const headline =
    staleAdviceWithheld && surfaced.length === 0 ? 'Review updated goals before changing calories'
    : effectiveState === 'act'
      ? surfaced.length > 0 ? 'A few things are worth your attention' : 'Your current recommendation is already handled'
      : effectiveState === 'maintain'
        ? 'Stay the course'
        : surfaced.length > 0 ? 'Improve the evidence before changing course' : 'More evidence before changing course'
  const summary =
    staleAdviceWithheld && surfaced.length === 0
      ? 'A calorie-adjustment recommendation was withheld because its settings revision changed or could not be verified. Review current goals and intake before changing course.'
    : effectiveState === 'maintain'
      ? 'No change recommended. Current evidence does not justify adding work or changing targets.'
      : surfaced[0]?.detail ?? control.summary

  return {
    version: COACH_INTELLIGENCE_VERSION,
    asOf,
    state: effectiveState,
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

/** No stale or legacy numerical calorie advice may be accepted via a saved ID.
 * The full current quality/safety decision must still yield the same draft.
 */
export async function requireCurrentCalorieRecommendation(
  row: RecommendationRow,
  asOf: string,
  controlOverride?: Awaited<ReturnType<typeof loadGoalControlState>>,
  checkRevision: typeof isMaintenanceDecisionRevisionCurrent = isMaintenanceDecisionRevisionCurrent,
): Promise<void> {
  if (!isCalorieDecisionKind(row.recommendation_kind)) return
  const control = controlOverride ?? await loadGoalControlState(asOf)
  const eligible = new Set(buildCoachRecommendationDrafts(control).map((draft) => draft.fingerprint))
  if (!storedCoachRecommendationIsCurrent(row, eligible, control.maintenance?.decisionRevision) ||
      !await checkRevision(asOf, control.maintenance?.decisionRevision)) {
    throw new HttpError(409, 'This calorie recommendation is no longer current. Reopen Coach and review the latest goals and evidence.')
  }
}

/** A conditional NOT EXISTS protects sequential decisions; only the new
 * partial unique index closes the distinct-row simultaneous-write race.
 * Translate precisely that index conflict into an owner-readable 409.
 */
/** Saved recommendation IDs must remain eligible after edits or imports.
 * This protects all non-calorie cards, not just numerical calorie advice.
 * Past explicitly started actions retain their own feedback history.
 */
export async function requireCurrentNonCalorieRecommendation(
  row: Pick<RecommendationRow, 'recommendation_kind' | 'fingerprint'>,
  asOf: string,
  currentDrafts?: readonly CoachRecommendationDraft[],
  expectedContextRevision?: string,
  controlOverride?: GoalControlState,
): Promise<void> {
  if (isCalorieDecisionKind(row.recommendation_kind)) return
  const control = controlOverride ?? (currentDrafts ? null : await loadGoalControlState(asOf))
  const drafts = currentDrafts ?? buildCoachRecommendationDrafts(control!)
  const current = drafts.find((draft) =>
    draft.fingerprint === row.fingerprint && draft.kind === row.recommendation_kind)
  if (!current) {
    throw new HttpError(409, 'This Coach recommendation is no longer supported by current evidence. Reopen Coach to review the latest assessment.')
  }
  // Existing isolated eligibility callers may omit this optional assertion;
  // real response endpoints always request a current context token.
  if (expectedContextRevision !== undefined) {
    if (!/^[a-f0-9]{64}$/.test(expectedContextRevision)) {
      throw new HttpError(428, 'This Coach card needs a current evidence revision. Reopen Coach and review the latest recommendation.')
    }
    const liveControl = control ?? controlOverride ?? await loadGoalControlState(asOf)
    if (coachRecommendationContextRevision(current, liveControl) !== expectedContextRevision) {
      throw new HttpError(409, 'The evidence behind this Coach recommendation has changed. Reopen Coach before deciding.')
    }
  }
}

export function isActivePlateauUniquenessConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; constraint?: unknown; message?: unknown }
  return candidate.code === '23505' && (
    candidate.constraint === 'coach_recommendations_one_active_plateau_revision_idx' ||
    (typeof candidate.message === 'string' &&
      candidate.message.includes('coach_recommendations_one_active_plateau_revision_idx'))
  )
}

/** The same guarded mutation used by the API; injectable only with a
 * read-only verifier for isolated SQL integration. No mutation is attempted
 * when the saved ID is stale, missing, or a non-action question.
 */
export async function writeCoachRecommendationResponse(
  sql: Sql,
  id: string,
  response: CoachRecommendationResponse,
  asOf: string,
  assertCurrent: (row: RecommendationRow) => Promise<void>,
  ownerStarted = false,
  expectedResponseAt?: string | null,
): Promise<void> {
  if (expectedResponseAt === undefined || (expectedResponseAt !== null &&
      (typeof expectedResponseAt !== 'string' || expectedResponseAt.length === 0 || expectedResponseAt.length > 80))) {
    throw new HttpError(428, 'This Coach card needs a fresh response version. Reload Coach before deciding.')
  }
  if (response === 'do_this' && !ownerStarted) {
    throw new HttpError(400, 'Starting Coach advice requires explicit acknowledgement. Refresh Coach and try again.')
  }
  // Choosing a Lab handoff never proves an experiment was created. Older
  // clients must not persist a false conversion or hide valid advice.
  if (response === 'turn_into_experiment') {
    throw new HttpError(409, 'Explore the experiment first; previewing it does not confirm a conversion.')
  }
  const row = await recommendationById(sql, id)
  if (row.recommendation_kind === 'follow_up_question') {
    throw new HttpError(409, 'Follow-up questions do not use recommendation response states')
  }
  // Evidence collection is a navigation task, not an intervention the owner
  // can report as already started. Keep old or direct clients fail-closed.
  if (response === 'do_this' && row.recommendation_kind === 'improve_evidence') {
    throw new HttpError(409, 'Reviewing evidence does not start a Coach intervention')
  }
  await assertCurrent(row)
  const suppressUntil = response === 'not_now' ? addCalendarDays(asOf, 7) : null
  const followUpOn = response === 'do_this' ? addCalendarDays(asOf, 7) : null
  try {
    const changed = await sql.query(
      `UPDATE coach_recommendations
        SET response_state = $2,
            metadata = CASE WHEN $2 = 'do_this'
              THEN jsonb_set(COALESCE(metadata, '{}'::jsonb), '{ownerStarted}', 'true'::jsonb, true)
              ELSE COALESCE(metadata, '{}'::jsonb) - 'ownerStarted' END,
            suppress_until = $3::date,
            follow_up_on = $4::date,
            response_at = now(),
            outcome_state = NULL,
            outcome_at = NULL,
            updated_at = now()
      WHERE id = $1::uuid
        AND response_at::text IS NOT DISTINCT FROM $5::text
        AND (
          $2::text <> 'do_this'
          OR coach_recommendations.recommendation_kind NOT IN ('review_intake_adjustment', 'review_activity_adjustment')
          OR NOT EXISTS (
            SELECT 1
              FROM coach_recommendations AS competing
             WHERE competing.id <> coach_recommendations.id
               AND competing.recommendation_kind IN ('review_intake_adjustment', 'review_activity_adjustment')
               AND competing.response_state = 'do_this'
               AND competing.metadata ->> 'ownerStarted' = 'true'
               AND competing.outcome_state IS NULL
               AND competing.metadata ->> 'decisionRevision' = coach_recommendations.metadata ->> 'decisionRevision'
          )
        )
      RETURNING id::text AS id`,
      [id, response, suppressUntil, followUpOn, expectedResponseAt],
    )
    if (changed.length !== 1) {
      throw new HttpError(409, 'This Coach decision changed or a competing plateau option is already active. Reopen Coach to review the latest state.')
    }
  } catch (error) {
    if (isActivePlateauUniquenessConflict(error)) {
      throw new HttpError(409, 'Another plateau option has already been started. Reopen Coach to review the active decision.')
    }
    throw error
  }
}

export async function respondCoachRecommendation(
  id: string,
  response: CoachRecommendationResponse,
  asOf: string,
  ownerStarted = false,
  expectedResponseAt?: string | null,
  expectedContextRevision?: string,
): Promise<CoachIntelligenceState> {
  const sql = await getSql()
  await writeCoachRecommendationResponse(
    sql, id, response, asOf,
    async (row) => {
      await requireCurrentCalorieRecommendation(row, asOf)
      if (!isCalorieDecisionKind(row.recommendation_kind) &&
          (typeof expectedContextRevision !== 'string' || !/^[a-f0-9]{64}$/.test(expectedContextRevision))) {
        throw new HttpError(428, 'This Coach card needs a current evidence revision. Reopen Coach and review the latest recommendation.')
      }
      await requireCurrentNonCalorieRecommendation(row, asOf, undefined, expectedContextRevision)
    },
    ownerStarted,
    expectedResponseAt,
  )
  return loadCoachIntelligenceState(asOf)
}

/** Atomic outcome CAS: two tabs cannot reinterpret or overwrite feedback about
 * another response. Eligibility, provenance and elapsed review window must all
 * still be true inside the UPDATE, not only in a preceding read.
 */
export async function writeCoachRecommendationOutcome(
  sql: Sql,
  id: string,
  outcome: CoachRecommendationOutcome,
  asOf: string,
  expectedResponseAt?: string,
): Promise<void> {
  if (typeof expectedResponseAt !== 'string' || expectedResponseAt.length === 0 ||
      expectedResponseAt.length > 80) {
    throw new HttpError(428, 'Refresh Coach before recording an outcome for this action.')
  }
  const rows = await sql.query(
    `UPDATE coach_recommendations
        SET outcome_state = $2,
            outcome_at = now(),
            updated_at = now()
      WHERE id = $1::uuid
        AND response_state = 'do_this'
        AND metadata ->> 'ownerStarted' = 'true'
        AND outcome_state IS NULL
        AND follow_up_on IS NOT NULL
        AND follow_up_on <= $3::date
        AND response_at::text = $4::text
      RETURNING id::text AS id`,
    [id, outcome, asOf, expectedResponseAt],
  )
  if (rows.length !== 1) {
    throw new HttpError(409, 'This Coach outcome is no longer pending for the saved action. Review the latest Coach state.')
  }
}

export async function recordCoachRecommendationOutcome(
  id: string,
  outcome: CoachRecommendationOutcome,
  asOf: string,
  expectedResponseAt?: string,
): Promise<CoachIntelligenceState> {
  const sql = await getSql()
  await writeCoachRecommendationOutcome(sql, id, outcome, asOf, expectedResponseAt)
  return loadCoachIntelligenceState(asOf)
}
