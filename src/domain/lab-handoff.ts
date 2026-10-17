export type LabExperimentHandoffSource = 'coach' | 'weekly_coach'

export type CoachExperimentLinkHandoff = {
  recommendationId: string
  contextRevision: string
  responseAt: string | null
}

export type LabExperimentHandoff = {
  coachRecommendation?: CoachExperimentLinkHandoff
  title: string
  rationale: string
  source: LabExperimentHandoffSource
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const REVISION = /^[a-f0-9]{64}$/
const TITLE_MAX = 200
const RATIONALE_MAX = 4000

function clipped(value: string, max: number): string {
  return value.trim().slice(0, max)
}

export function labExperimentHandoffPath(input: LabExperimentHandoff): string {
  const params = new URLSearchParams()
  const title = clipped(input.title, TITLE_MAX)
  const rationale = clipped(input.rationale, RATIONALE_MAX)
  if (title) params.set('title', title)
  if (rationale) params.set('rationale', rationale)
  params.set('from', input.source)
  const link = input.source === 'coach' ? input.coachRecommendation : undefined
  if (link && UUID.test(link.recommendationId) && REVISION.test(link.contextRevision) &&
      (link.responseAt === null || (link.responseAt.length > 0 && link.responseAt.length <= 80))) {
    params.set('coachId', link.recommendationId)
    params.set('coachRevision', link.contextRevision)
    params.set('coachResponseAt', link.responseAt ?? '')
  }
  return `/lab/experiments/new?${params.toString()}`
}

export function readLabExperimentHandoff(params: URLSearchParams): LabExperimentHandoff | null {
  const source = params.get('from')
  if (source !== 'coach' && source !== 'weekly_coach') return null
  const id = params.get('coachId')
  const revision = params.get('coachRevision')
  const responseAt = params.get('coachResponseAt')
  const coachRecommendation = source === 'coach' && id && UUID.test(id) &&
    revision && REVISION.test(revision) && responseAt !== null && responseAt.length <= 80
    ? { recommendationId: id, contextRevision: revision, responseAt: responseAt || null }
    : undefined
  return {
    ...(coachRecommendation ? { coachRecommendation } : {}),
    title: clipped(params.get('title') ?? '', TITLE_MAX),
    rationale: clipped(params.get('rationale') ?? '', RATIONALE_MAX),
    source,
  }
}

export function labExperimentHandoffLabel(source: LabExperimentHandoffSource): string {
  return source === 'coach' ? 'Coach recommendation' : 'Weekly Coach review'
}

/** URL parameters are navigation hints, never authority for the owner API. */
export function labExperimentDetailHandoffPath(experimentId: string, handoff: LabExperimentHandoff): string {
  const base = `/lab/experiments/${experimentId}`
  if (!UUID.test(experimentId) || handoff.source !== 'coach' || !handoff.coachRecommendation) return base
  return labExperimentHandoffPath({ ...handoff, title: '', rationale: '' })
    .replace('/lab/experiments/new', base)
}
