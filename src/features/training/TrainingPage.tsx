import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { WorkoutSessionSummary } from '@/domain/training'
import type { PendingTranscriptionJob } from '@/domain/training-transcription'
import { interactiveCardClass, ListPlaceholder, primaryButtonClass, secondaryButtonClass } from '@/lib'
import { fetchSessions, fetchTranscriptionJobs } from './api'
import { formatWorkoutDate } from './format'

const POLL_MS = 4000

export function TrainingPage() {
  const [sessions, setSessions] = useState<WorkoutSessionSummary[]>([])
  const [jobs, setJobs] = useState<PendingTranscriptionJob[]>([])
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

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    async function loadJobs() {
      try {
        const next = await fetchTranscriptionJobs()
        if (cancelled) {
          return
        }
        setJobs(next)
        if (next.some((job) => job.status === 'queued' || job.status === 'processing')) {
          timer = window.setTimeout(() => {
            void loadJobs()
          }, POLL_MS)
        }
      } catch {
        if (!cancelled) {
          setJobs([])
        }
      }
    }

    void loadJobs()
    return () => {
      cancelled = true
      if (timer) {
        window.clearTimeout(timer)
      }
    }
  }, [])

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Training</h1>
          <p className="mt-2 text-zinc-600">Log sessions against your current templates.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/training/new" className={primaryButtonClass}>
            Start Workout
          </Link>
          <Link to="/training/import" className={secondaryButtonClass}>
            Import Workout Photo
          </Link>
        </div>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {jobs.length > 0 ? <PendingReviewsCard jobs={jobs} /> : null}

      <div>
        <h2 className="text-lg font-semibold tracking-tight">Recent Workouts</h2>
        {loading && sessions.length === 0 ? (
          <ListPlaceholder rows={4} label="Loading workouts" />
        ) : sessions.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">
            {error
              ? 'History is unavailable until Training tables are migrated.'
              : 'No workouts yet. Start a workout to record sets in Health.'}
          </p>
        ) : (
          <ul className="page-enter mt-4 space-y-2">
            {sessions.map((session) => (
              <li key={session.id}>
                <Link
                  to={`/training/${session.id}`}
                  className={`flex min-h-14 items-center justify-between gap-3 px-4 py-3 ${interactiveCardClass}`}
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

function PendingReviewsCard({ jobs }: { jobs: PendingTranscriptionJob[] }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-lg font-semibold tracking-tight">Pending Reviews</h2>
      <p className="mt-1 text-sm text-zinc-600">
        Photo jobs stay available on every signed-in device until you review and save them.
      </p>
      <ul className="mt-4 space-y-2">
        {jobs.map((job) => (
          <li key={job.id}>
            <Link
              to={`/training/import?job=${job.id}`}
              className={`flex min-h-14 items-center justify-between gap-3 bg-zinc-50 px-4 py-3 ${interactiveCardClass}`}
            >
              <span className="min-w-0">
                <span className="block font-medium">{pendingReviewLabel(job.status)}</span>
                <span className="mt-0.5 block truncate text-sm text-zinc-500">
                  {job.filename ?? 'Workout photo'}
                  {job.status === 'failed' && job.failureMessage ? ` · ${job.failureMessage}` : ''}
                </span>
              </span>
              <span className="shrink-0 text-sm text-zinc-500">
                {job.status === 'completed' ? 'Review' : 'Open'}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function pendingReviewLabel(status: PendingTranscriptionJob['status']): string {
  switch (status) {
    case 'queued':
      return 'Uploading / queued'
    case 'processing':
      return 'Analyzing'
    case 'completed':
      return 'Ready to review'
    case 'failed':
      return 'Failed'
  }
}
