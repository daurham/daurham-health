import { useEffect, useState } from 'react'
import { NavLink, Outlet, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import type { ProgressOverview, ProgressRange } from '@/domain/progress'
import { cn } from '@/lib'
import { fetchProgressOverview } from './api'
import { RANGE_OPTIONS } from './copy'
import { BodySection } from './BodySection'
import { EvidencePanel, type EvidenceTopic } from './EvidencePanel'
import { OverviewSection } from './OverviewSection'
import { parseProgressRangeParam, progressSearch } from './range'
import { StrengthLab, StrengthSection } from './StrengthSection'
import { TimelineSection } from './TimelineSection'

type ProgressOutletContext = {
  overview: ProgressOverview
  range: ProgressRange
  onEvidence: (topic: EvidenceTopic) => void
}

const TABS = [
  { to: '/progress', label: 'Overview', end: true },
  { to: '/progress/strength', label: 'Strength', end: false },
  { to: '/progress/body', label: 'Body', end: false },
  { to: '/progress/timeline', label: 'Timeline', end: false },
] as const

export function ProgressPage() {
  const [params, setParams] = useSearchParams()
  const range = parseProgressRangeParam(params.get('range'))
  const [overview, setOverview] = useState<ProgressOverview | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [evidence, setEvidence] = useState<EvidenceTopic | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError(null)
    fetchProgressOverview(range)
      .then((next) => {
        if (!cancelled) {
          setOverview(next)
          setStatus('ready')
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setOverview(null)
          setStatus('error')
          setError(caught instanceof Error ? caught.message : 'Could not load Progress')
        }
      })
    return () => {
      cancelled = true
    }
  }, [range])

  function setRange(next: ProgressRange) {
    const copy = new URLSearchParams(params)
    copy.set('range', next)
    setParams(copy, { replace: true })
  }

  const outletContext: ProgressOutletContext | null =
    overview && status === 'ready'
      ? {
          overview,
          range,
          onEvidence: setEvidence,
        }
      : null

  return (
    <section className="space-y-4 md:space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Progress</h1>
        <p className="mt-1 hidden text-zinc-600 md:mt-2 md:block">
          What changed in training and body — from recorded work, not guesses.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1" role="group" aria-label="Progress range">
        {RANGE_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setRange(option.id)}
            className={cn(
              'min-h-11 shrink-0 rounded-md px-3 py-2 text-sm font-medium',
              option.id === range ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
            )}
            aria-pressed={option.id === range}
          >
            {option.label}
          </button>
        ))}
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-zinc-200 pb-1">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={`${tab.to}${progressSearch(range)}`}
            end={tab.end}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-2 text-sm font-medium',
                isActive ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900',
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {status === 'loading' ? <ProgressSkeleton /> : null}
      {status === 'error' ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error ?? 'Progress is unavailable.'} Values are not shown as zero when a request fails.
        </p>
      ) : null}
      {status === 'ready' && overview && outletContext ? <Outlet context={outletContext} /> : null}
      {evidence ? <EvidencePanel topic={evidence} onClose={() => setEvidence(null)} /> : null}
    </section>
  )
}

function ProgressSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-3" aria-busy="true" aria-label="Loading progress">
      {[0, 1, 2].map((item) => (
        <div key={item} className="h-28 animate-pulse rounded-lg bg-zinc-200" />
      ))}
    </div>
  )
}

export function ProgressOverviewRoute() {
  const { overview, onEvidence } = useOutletContext<ProgressOutletContext>()
  return <OverviewSection overview={overview} onEvidence={onEvidence} />
}

export function ProgressStrengthRoute() {
  const { overview, range, onEvidence } = useOutletContext<ProgressOutletContext>()
  return <StrengthSection overview={overview} range={range} onEvidence={onEvidence} />
}

export function ProgressStrengthLabRoute() {
  const { exerciseId } = useParams()
  const { overview, range, onEvidence } = useOutletContext<ProgressOutletContext>()
  return (
    <StrengthLab
      overview={overview}
      range={range}
      exerciseId={exerciseId ?? ''}
      onEvidence={onEvidence}
    />
  )
}

export function ProgressBodyRoute() {
  const { overview, onEvidence } = useOutletContext<ProgressOutletContext>()
  return <BodySection overview={overview} onEvidence={onEvidence} />
}

export function ProgressTimelineRoute() {
  const { overview } = useOutletContext<ProgressOutletContext>()
  return <TimelineSection overview={overview} />
}
