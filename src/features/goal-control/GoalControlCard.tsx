import { Link } from 'react-router-dom'
import type { GoalControlState } from '@/domain/goal-control'
import { quietButtonClass } from '@/lib'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'

export function GoalControlCard({
  state,
  pending,
  error,
}: {
  state: GoalControlState | null
  pending?: boolean
  error?: string | null
}) {
  const prefix = useAppPathPrefix()
  if (!state && !error) {
    return pending ? (
      <section className="rounded-lg border border-zinc-200 bg-white px-3 py-3" aria-label="Loading goal overview" aria-busy="true">
        <div className="h-3 w-24 animate-pulse rounded bg-zinc-200" />
        <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-zinc-100" />
      </section>
    ) : null
  }
  if (!state) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Goal overview</h2>
        <p className="mt-1 text-sm text-zinc-600">{error ?? 'Goal control is unavailable.'}</p>
      </section>
    )
  }

  const opportunity = state.primaryOpportunity
  return (
    <section className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Goal overview</h2>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600">
              Goal evidence · {state.confidence} confidence
            </span>
          </div>
          <p className="mt-1 font-semibold tracking-tight text-zinc-900">{state.headline}</p>
          <p className="mt-1 text-sm text-zinc-600">{state.summary}</p>
        </div>
        {opportunity ? (
          <Link to={prefixedPath(prefix, opportunity.detailPath)} className={quietButtonClass}>
            Open
          </Link>
        ) : (
          <Link to={prefixedPath(prefix, '/progress/weekly')} className={quietButtonClass}>
            Weekly detail
          </Link>
        )}
      </div>
      {state.maintenance?.estimate.state === 'available' && state.maintenance.estimate.observedMaintenanceKcal != null ? (
        <div className="mt-2 text-xs text-zinc-500">
          <p>
            Observed maintenance estimate ≈ {Math.round(state.maintenance.estimate.observedMaintenanceKcal).toLocaleString('en-US')} kcal/day
            {' '}· Maintenance estimate confidence: {state.maintenance.estimate.confidence}
            {state.maintenance.estimate.rangeLowKcal != null && state.maintenance.estimate.rangeHighKcal != null ? (
              <> · Estimated range {Math.round(state.maintenance.estimate.rangeLowKcal).toLocaleString('en-US')}–{Math.round(state.maintenance.estimate.rangeHighKcal).toLocaleString('en-US')} kcal/day</>
            ) : null}
          </p>
          <details className="mt-1">
            <summary className="cursor-pointer">Maintenance estimate evidence</summary>
            <p className="mt-1">
              {state.maintenance.estimate.period?.days ?? 'Unknown'} calendar days examined
              {' '}· {state.maintenance.estimate.quality.nutrition.reliableDays} reliable nutrition days
              {' '}· {state.maintenance.estimate.quality.body.usedMeasurements} comparable weight measurements.
              {' '}These are evidence counts, not proof of complete intake.
            </p>
            <p className="mt-1">{state.maintenance.estimate.explanation}</p>
          </details>
        </div>
      ) : null}
      {state.trainingAdherence.configured ? (
        <p className="mt-2 text-xs text-zinc-500">
          <span className="font-medium">
            {state.trainingAdherence.todayIntent === 'rest' ? 'Rest-aware Training:' : 'Training:'}
          </span>{' '}
          {state.trainingAdherence.qualifiedTrainingDays == null
            ? 'Qualified-day count unavailable; programmed sessions are not target credit.'
            : `${state.trainingAdherence.qualifiedTrainingDays}/${state.trainingAdherence.weeklyFrequencyTarget} qualified strength days · ${state.trainingAdherence.remainingQualifiedDays} to target.`}
          <span className="block">{state.trainingAdherence.detail}</span>
        </p>
      ) : null}
      {state.limitations.length > 0 ? (
        <details className="mt-2 text-xs text-zinc-500">
          <summary className="cursor-pointer">Why?</summary>
          <ul className="mt-1 space-y-1">
            {state.limitations.slice(0, 3).map((item) => <li key={item.code}>{item.text}</li>)}
          </ul>
        </details>
      ) : null}
    </section>
  )
}
