export type LabExperimentHandoffSource = 'coach' | 'weekly_coach'

export type LabExperimentHandoff = {
  title: string
  rationale: string
  source: LabExperimentHandoffSource
}

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
  return `/lab/experiments/new?${params.toString()}`
}

export function readLabExperimentHandoff(params: URLSearchParams): LabExperimentHandoff | null {
  const source = params.get('from')
  if (source !== 'coach' && source !== 'weekly_coach') return null
  return {
    title: clipped(params.get('title') ?? '', TITLE_MAX),
    rationale: clipped(params.get('rationale') ?? '', RATIONALE_MAX),
    source,
  }
}

export function labExperimentHandoffLabel(source: LabExperimentHandoffSource): string {
  return source === 'coach' ? 'Coach recommendation' : 'Weekly Coach review'
}
