import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { WorkoutSession } from '@/domain/training'
import { fetchSession } from './api'
import { formatLoad, formatPounds, formatSetPerformance, formatWorkoutDate } from './format'

export function WorkoutDetailPage() {
  const { sessionId } = useParams()
  const [session, setSession] = useState<WorkoutSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const loadedId = useRef<string | null>(null)

  useEffect(() => {
    if (!sessionId) {
      setError('Workout was not found')
      setLoading(false)
      return
    }
    let cancelled = false
    const sameWorkout = loadedId.current === sessionId
    if (!sameWorkout) {
      setSession(null)
      setLoading(true)
    }
    setError(null)
    fetchSession(sessionId)
      .then((next) => {
        if (!cancelled) {
          loadedId.current = sessionId
          setSession(next)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load workout')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, reloadToken])

  return (
    <section className="space-y-6">
      <p className="text-sm text-zinc-500">
        <Link to="/training" className="hover:underline">
          Training
        </Link>
        {' / '}
        Workout
      </p>
      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {session ? 'Could not refresh this workout. Showing the last loaded session.' : error}
          {sessionId ? (
            <button type="button" className="ml-3 font-medium underline" onClick={() => setReloadToken((value) => value + 1)}>
              Retry
            </button>
          ) : null}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-zinc-600">Loading workout…</p> : null}
      {session ? <SessionDetail session={session} /> : null}
    </section>
  )
}

function SessionDetail({ session }: { session: WorkoutSession }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {formatWorkoutDate(session.workoutDate)}
          {' · '}
          {session.templateName ?? 'Workout'}
        </h1>
        {session.routineCode ? (
          <p className="mt-1 text-sm text-zinc-500">
            Routine {session.routineCode}
            {session.templateVersion ? ` · v${session.templateVersion}` : ''}
          </p>
        ) : null}
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-sm sm:grid-cols-4">
        <Meta label="Duration" value={session.durationMin == null ? '—' : `${session.durationMin} min`} />
        <Meta label="Effort" value={session.effort == null ? '—' : String(session.effort)} />
        <Meta label="Pain" value={session.painLevel == null ? '—' : String(session.painLevel)} />
        <Meta
          label="Bodyweight"
          value={session.bodyweightKg == null ? '—' : `${formatPounds(session.bodyweightKg)} lb`}
        />
      </dl>
      {session.notes ? (
        <p className="rounded-lg border border-zinc-200 bg-white p-4 text-sm">{session.notes}</p>
      ) : null}
      <div className="space-y-4">
        {session.exercises.map((exercise) => (
          <article key={exercise.id} className="rounded-lg border border-zinc-200 bg-white p-4">
            <h2 className="font-semibold">{exercise.exerciseName}</h2>
            {exercise.notes ? <p className="mt-1 text-sm text-zinc-600">{exercise.notes}</p> : null}
            <ul className="mt-3 space-y-2">
              {exercise.sets.map((set) => (
                <li key={set.id} className="flex justify-between gap-3 text-sm">
                  <span className="text-zinc-500">Set {set.setNumber}</span>
                  <span className="font-medium">
                    {formatLoad(set.loadState, set.weightKg)}
                    {' · '}
                    {formatSetPerformance(set)}
                  </span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  )
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  )
}
