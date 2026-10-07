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
              {state.confidence} confidence
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
      {state.trainingAdherence.state === 'rest_day_on_track' ? (
        <p className="mt-2 text-xs text-zinc-500">Rest-aware: {state.trainingAdherence.detail}</p>
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
