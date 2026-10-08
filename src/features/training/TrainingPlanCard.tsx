import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TrainingPlanView } from '@/domain/training-plan'
import { primaryButtonClass, quietButtonClass } from '@/lib'
import { fetchTrainingPlan } from './api'

function intentLabel(intent: string): string {
  switch (intent) {
    case 'training_preferred':
      return 'Training preferred'
    case 'training_moved_here':
      return 'Training moved here'
    case 'training_moved_away':
      return 'Training moved away'
    case 'active_recovery':
      return 'Open day'
    case 'flexible':
      return 'Open day'
    case 'paused_or_away':
      return 'Away / paused'
    default:
      return 'Open day'
  }
}

export function TrainingPlanCard() {
  const [plan, setPlan] = useState<TrainingPlanView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchTrainingPlan()
      .then((next) => {
        if (!cancelled) setPlan(next)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load Training Plan')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Training Plan</h2>
        <p className="mt-1 text-sm text-zinc-500">{error}</p>
        <Link to="/training/plan" className="mt-3 inline-flex text-sm font-medium underline">
          Open plan
        </Link>
      </section>
    )
  }

  if (!plan) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Training Plan</h2>
        <p className="mt-1 text-sm text-zinc-500">Loading plan…</p>
      </section>
    )
  }

  if (!plan.configured || !plan.baseline) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Training Plan</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Choose days you prefer to work out and how many times each routine repeats. Other days stay open.
        </p>
        <Link to="/training/plan" className={'mt-3 ' + primaryButtonClass}>
          Set up plan
        </Link>
      </section>
    )
  }

  const next = plan.nextSession
  return (
    <section className="space-y-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Training Plan</h2>
          <p className="mt-1 text-sm text-zinc-600">
            {plan.completedProgrammedSessions}/{plan.weeklyFrequencyTarget} programmed sessions this week
          </p>
        </div>
        <Link to="/training/plan" className={quietButtonClass}>
          Adjust
        </Link>
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <div className="rounded-md bg-zinc-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Today</p>
          <p className="mt-0.5 font-medium text-zinc-900">
            {plan.today ? intentLabel(plan.today.effectiveIntent) : '—'}
          </p>
        </div>
        <div className="rounded-md bg-zinc-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Next session</p>
          <p className="mt-0.5 font-medium text-zinc-900">{next?.name ?? '—'}{plan.nextRepeatProgress && plan.nextRepeatProgress.total > 1 ? ` · ${plan.nextRepeatProgress.session}/${plan.nextRepeatProgress.total}` : ''}</p>
        </div>
      </div>

      {next && next.available && next.templateId ? (
        <Link to={'/training/new?template=' + encodeURIComponent(next.templateId)} className={primaryButtonClass}>
          Start {next.name} now
        </Link>
      ) : next && !next.available ? (
        <p className="text-xs text-amber-700">
          The next routine is no longer active. Update the plan before starting it.
        </p>
      ) : null}
    </section>
  )
}
