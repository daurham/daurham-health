import {
  createSessionResponseSchema,
  exerciseListResponseSchema,
  sessionDetailResponseSchema,
  sessionListResponseSchema,
  templateListResponseSchema,
  type ExerciseDefinition,
  type ManualWorkoutRequest,
  type WorkoutSession,
  type WorkoutSessionSummary,
  type WorkoutTemplate,
} from '@/domain/training'

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown }
    if (typeof body.error === 'string' && body.error.length > 0) {
      return body.error
    }
  } catch {
    // Fall through to a generic message.
  }
  return 'Request failed'
}

export async function fetchExercises(): Promise<ExerciseDefinition[]> {
  const response = await fetch('/api/training/exercises')
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return exerciseListResponseSchema.parse(await response.json()).exercises
}

export async function fetchTemplates(): Promise<WorkoutTemplate[]> {
  const response = await fetch('/api/training/templates')
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return templateListResponseSchema.parse(await response.json()).templates
}

export async function fetchSessions(): Promise<WorkoutSessionSummary[]> {
  const response = await fetch('/api/training/sessions')
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return sessionListResponseSchema.parse(await response.json()).sessions
}

export async function fetchSession(id: string): Promise<WorkoutSession> {
  const response = await fetch(`/api/training/sessions/${id}`)
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return sessionDetailResponseSchema.parse(await response.json()).session
}

export async function createSession(request: ManualWorkoutRequest): Promise<WorkoutSession> {
  const response = await fetch('/api/training/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new Error(await readError(response))
  }
  return createSessionResponseSchema.parse(await response.json()).session
}
