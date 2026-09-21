import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { WorkoutSessionSummary } from '@/domain/training'
import { fetchSessions } from './api'
import { formatWorkoutDate } from './format'

export function TrainingPage() {
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchSessions()
      .then((next) => {
        if (!cancelled) {
          setSessions(next)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : 'Could not load workouts')
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
  }, [])

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Training</h1>
          <p className="mt-2 text-zinc-600">Log sessions against your current templates.</p>
        </div>
        <Link
          to="/training/new"
          className="inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Start Workout
        </Link>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Recent Workouts</h2>
        {loading ? (
          <p className="mt-3 text-sm text-zinc-600">Loading workouts…</p>
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">
            {error
              ? 'History is unavailable until Training tables are migrated.'
              : 'No workouts yet. Start a workout to record sets in Health.'}
          </p>
        ) : (
          <ul className="mt-4 space-y-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  to={`/training/${session.id}`}
                  className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3"
                >
                  <span className="font-medium">
                    {formatWorkoutDate(session.workoutDate)}
                    {' · '}
                    {session.templateName ?? 'Workout'}
                  </span>
                  {session.effort != null ? (
                    <span className="text-sm text-zinc-500">Effort {session.effort}</span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
