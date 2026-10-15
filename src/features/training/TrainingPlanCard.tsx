import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TrainingPlanView } from '@/domain/training-plan'
import { primaryButtonClass, quietButtonClass } from '@/lib'
import { subscribeHealthDataChanges } from '@/lib/health-changes'
import { fetchTrainingPlan } from './api'
import { TrainingRotationPreview } from './TrainingRotationPreview'

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

/** Theme-aware view of evidence-based weekly qualification, not scheduled intent. */
export function TrainingPlanCard() {
  const [plan, setPlan] = useState<TrainingPlanView | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    let generation = 0
    const refresh = () => {
      const request = ++generation
      void fetchTrainingPlan()
        .then((next) => {
          if (!active || request !== generation) return
          setPlan(next)
          setError(null)
        })
        .catch((caught: unknown) => {
          if (active && request === generation) {
            setError(caught instanceof Error ? caught.message : 'Could not load Training Plan')
          }
        })
    }
    refresh()
    const unsubscribe = subscribeHealthDataChanges(refresh, { revalidateOnFocus: true })
    return () => {
      active = false
      generation += 1
      unsubscribe()
    }
  }, [])

  if (error) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Training Plan</h2>
        <p className="mt-1 text-sm text-zinc-500">{error}</p>
        <Link to="/training/plan" className="mt-3 inline-flex text-sm font-medium underline">Open plan</Link>
      </section>
    )
  }

  if (!plan) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Training Plan</h2>
        <p className="mt-1 text-sm text-zinc-500">Loading training progress…</p>
      </section>
    )
  }

  if (!plan.configured || !plan.baseline) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="font-semibold">Training Plan</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Set a weekly training target and a flexible routine rotation. Existing workout history can count this week.
        </p>
        <Link to="/training/plan" className={'mt-3 ' + primaryButtonClass}>Set up plan</Link>
      </section>
    )
  }

  const next = plan.nextSession
  const days = plan.weekTraining?.days ?? []
  const completedDays = plan.weekTraining?.completedDays ?? 0
  const target = plan.weeklyFrequencyTarget ?? 3

  return (
    <section className="space-y-4 overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-semibold">Training Plan</h2>
          <p className="mt-1 text-sm text-zinc-500">Your workouts, at your pace</p>
        </div>
        <Link to="/training/plan" className={quietButtonClass}>Adjust plan</Link>
      </div>

      <div className="rounded-xl border border-accent/20 bg-accent-muted/50 p-3 sm:p-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">This week</p>
            <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-accent">
              {completedDays} <span className="text-base font-medium text-zinc-500">/ {target} training days</span>
            </p>
          </div>
          {completedDays >= target ? (
            <span className="rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
              Weekly target met
            </span>
          ) : null}
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1.5" role="group" aria-label="Training days, Monday through Sunday">
          {days.map((day, index) => {
            const selected = day.date === plan.asOf
            const future = day.date > plan.asOf
            const preferred = plan.baseline?.preferredWeekdays.includes(index + 1)
            const status = day.qualifies ? 'Qualified training day' : future ? 'Not yet recorded' : 'No qualifying workout recorded'
            return (
              <div key={day.date} className="flex min-w-0 flex-col items-center gap-1.5" aria-label={day.date + ': ' + status} title={day.date + ' · ' + status}>
                <span className="text-xs font-medium text-zinc-600">{WEEKDAYS[index]}</span>
                <span className={`flex min-h-10 w-full min-w-0 items-center justify-center rounded-lg border text-base font-semibold ${
                  day.qualifies
                    ? 'border-success/35 bg-success/15 text-success'
                    : selected
                      ? 'border-accent/60 bg-accent-muted text-accent'
                      : 'border-zinc-200 bg-white text-zinc-500'
                }`}>
                  {day.qualifies ? '✓' : selected ? '•' : preferred ? '○' : '·'}
                </span>
              </div>
            )
          })}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
          <span><span className="font-bold text-success">✓</span> Qualified day</span>
          <span><span className="font-bold text-accent">•</span> Today</span>
          <span><span className="font-bold text-zinc-700">○</span> Preferred (optional)</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-zinc-600">
          Three distinct performed strength exercises count as one day, even across separate workout logs.
        </p>
      </div>

      <TrainingRotationPreview plan={plan} />

      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Next suggested routine</p>
        <p className="mt-1 font-semibold text-zinc-900">
          {next?.name ?? '—'}
          {plan.nextRepeatProgress && plan.nextRepeatProgress.total > 1
            ? ` · Session ${plan.nextRepeatProgress.session} of ${plan.nextRepeatProgress.total}`
            : ''}
        </p>
      </div>

      {next && next.available && next.templateId ? (
        <Link to={'/training/new?template=' + encodeURIComponent(next.templateId)} className={primaryButtonClass}>
          Start {next.name}
        </Link>
      ) : next && !next.available ? (
        <p className="text-xs text-warning">The next routine is unavailable. Update your plan to select another.</p>
      ) : null}
    </section>
  )
}
