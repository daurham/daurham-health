import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import type { ProgressOverview, ProgressRange, ProgressTimeline } from '@/domain/progress'
import { cn, LoadErrorNotice, selectedTabClass, tabClass } from '@/lib'
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
  const [reloadToken, setReloadToken] = useState(0)
  const [evidence, setEvidence] = useState<EvidenceTopic | null>(null)
  const overviewRef = useRef<ProgressOverview | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    const current = overviewRef.current
    if (current?.period.range !== range) {
      setStatus('loading')
    }
    setError(null)
    fetchProgressOverview(range, controller.signal)
      .then((next) => {
        if (!active) {
          return
        }
        overviewRef.current = next
        setOverview(next)
        setStatus('ready')
        setError(null)
      })
      .catch((caught: unknown) => {
        if (!active || controller.signal.aborted) {
          return
        }
        const message = caught instanceof Error ? caught.message : 'Could not load Progress'
        const previous = overviewRef.current
        if (previous?.period.range === range) {
          setError(message)
          setStatus('ready')
          return
        }
        overviewRef.current = null
        setOverview(null)
        setStatus('error')
        setError(message)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [range, reloadToken])

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
                  isActive ? selectedTabClass : tabClass,
                )
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
      </div>

      {!healthView && status === 'loading' ? <ProgressSkeleton /> : null}
      {!healthView && error ? (
        <LoadErrorNotice
          message={
            status === 'ready'
              ? 'Could not refresh Progress. Showing the last loaded range.'
              : `${error} Values are not shown as zero when a request fails.`
          }
          onRetry={() => setReloadToken((value) => value + 1)}
        />
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
  const [reloadToken, setReloadToken] = useState(0)
  const timelineRef = useRef<ProgressTimeline | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    if (timelineRef.current?.period.range !== range) {
      setStatus('loading')
    }
    setError(null)
    fetchProgressTimeline(range, controller.signal)
      .then((next) => {
        if (!active) {
          return
        }
        timelineRef.current = next
        setTimeline(next)
        setStatus('ready')
        setError(null)
      })
      .catch((caught: unknown) => {
        if (!active || controller.signal.aborted) {
          return
        }
        const message = caught instanceof Error ? caught.message : 'Could not load Timeline'
        if (timelineRef.current?.period.range === range) {
          setError(message)
          setStatus('ready')
          return
        }
        timelineRef.current = null
        setTimeline(null)
        setStatus('error')
        setError(message)
      })
    return () => {
      active = false
      controller.abort()
    }
  }, [range, reloadToken])

  if (status === 'loading') {
    return <div className="h-40 animate-pulse rounded-lg bg-zinc-200" aria-busy="true" aria-label="Loading timeline" />
  }
  if (status === 'error' || !timeline) {
    return (
      <LoadErrorNotice
        message={`${error ?? 'Timeline is unavailable.'} Values are not shown as zero when a request fails.`}
        onRetry={() => setReloadToken((value) => value + 1)}
      />
    )
  }
  return (
    <div className="space-y-3">
      {error ? (
        <LoadErrorNotice
          message="Could not refresh Timeline. Showing the last loaded range."
          onRetry={() => setReloadToken((value) => value + 1)}
        />
      ) : null}
      <TimelineSection timeline={timeline} range={range} onEvidence={onEvidence} />
    </div>
  )
}

export function ProgressCompareRoute() {
  const { onEvidence } = useOutletContext<ProgressOutletContext>()
  return <CompareSection onEvidence={onEvidence} />
}
