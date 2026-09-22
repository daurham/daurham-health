import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import type { ProgressOverview, ProgressRange, ProgressTimeline } from '@/domain/progress'
import { cn } from '@/lib'
import { fetchProgressOverview, fetchProgressTimeline } from './api'
import { ActivityProgressPage } from './ActivitySection'
import { ActivitySleepOverview } from './ActivitySleepOverview'
import { ProgressRangeControl } from './ProgressRangeControl'
import { SleepProgressPage } from './SleepSection'
import { BodySection } from './BodySection'
import { EvidencePanel, type EvidenceTopic } from './EvidencePanel'
import { OverviewSection } from './OverviewSection'
import { parseProgressRangeParam, progressSearch } from './range'
import { StrengthLab, StrengthSection } from './StrengthSection'
import { CompareSection } from './CompareSection'
import { TimelineSection } from './TimelineSection'

type ProgressOutletContext = {
  overview: ProgressOverview
  range: ProgressRange
  onEvidence: (topic: EvidenceTopic) => void
}

const TABS = [
  { to: '/progress', label: 'Overview', end: true },
  { to: '/progress/activity', label: 'Activity', end: false },
  { to: '/progress/sleep', label: 'Sleep', end: false },
  { to: '/progress/strength', label: 'Strength', end: false },
  { to: '/progress/body', label: 'Body', end: false },
  { to: '/progress/timeline', label: 'Timeline', end: false },
  { to: '/progress/compare', label: 'Compare', end: false },
] as const

export function ProgressPage() {
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const range = parseProgressRangeParam(params.get('range'))
  const compareView = location.pathname.endsWith('/compare')
  const healthView = location.pathname === '/progress/activity' || location.pathname === '/progress/sleep'
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
    <section className="space-y-3 md:space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Progress</h1>
        <p className="mt-1 hidden text-sm text-zinc-600 md:block">
          What changed in training and body — from recorded work, not guesses.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white px-2 py-2 md:px-3">
        {compareView || healthView ? null : <ProgressRangeControl range={range} onChange={setRange} />}
        <nav
          className={cn('flex flex-wrap gap-1', compareView || healthView ? '' : 'mt-2 border-t border-zinc-100 pt-2')}
          aria-label="Progress sections"
        >
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={`${tab.to}${progressSearch(range)}`}
              end={tab.end}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium',
                  isActive ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900',
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {!healthView && status === 'loading' ? <ProgressSkeleton /> : null}
      {!healthView && status === 'error' ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error ?? 'Progress is unavailable.'} Values are not shown as zero when a request fails.
        </p>
      ) : null}
      {healthView || (status === 'ready' && overview && outletContext) ? <Outlet context={outletContext ?? undefined} /> : null}
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
  const { overview, range, onEvidence } = useOutletContext<ProgressOutletContext>()
  return (
    <div className="space-y-5 md:space-y-6">
      <OverviewSection overview={overview} onEvidence={onEvidence} />
      <ActivitySleepOverview range={range} />
    </div>
  )
}

export function ProgressActivityRoute() {
  return <ActivityProgressPage />
}

export function ProgressSleepRoute() {
  return <SleepProgressPage />
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
  const { range, onEvidence } = useOutletContext<ProgressOutletContext>()
  const [timeline, setTimeline] = useState<ProgressTimeline | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setStatus('loading')
    setError(null)
    fetchProgressTimeline(range)
      .then((next) => {
        if (!cancelled) {
          setTimeline(next)
          setStatus('ready')
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setTimeline(null)
          setStatus('error')
          setError(caught instanceof Error ? caught.message : 'Could not load Timeline')
        }
      })
    return () => {
      cancelled = true
    }
  }, [range])

  if (status === 'loading') {
    return <div className="h-40 animate-pulse rounded-lg bg-zinc-200" aria-busy="true" aria-label="Loading timeline" />
  }
  if (status === 'error' || !timeline) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        {error ?? 'Timeline is unavailable.'} Values are not shown as zero when a request fails.
      </p>
    )
  }
  return <TimelineSection timeline={timeline} range={range} onEvidence={onEvidence} />
}

export function ProgressCompareRoute() {
  const { onEvidence } = useOutletContext<ProgressOutletContext>()
  return <CompareSection onEvidence={onEvidence} />
}
