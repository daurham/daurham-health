import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { GoalControlState } from '@/domain/goal-control'
import {
  WEEKLY_COACH_INSUFFICIENT_COPY,
  type WeeklyCandidate,
  type WeeklyCoachBrief,
  type WeeklyCoachCommentary,
} from '@/domain/weekly-coach'
import { healthFetch, quietButtonClass, readApiError } from '@/lib'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatWeeklyRange(start: string, end: string): string {
  const left = part(start)
  const right = part(end)
  if (left.month === right.month && left.year === right.year) {
    return `${MONTHS[left.month]} ${left.day}–${right.day}`
  }
  return `${MONTHS[left.month]} ${left.day}–${MONTHS[right.month]} ${right.day}`
}

export function WeeklyCoachEntry() {
  const prefix = useAppPathPrefix()
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-zinc-900">Weekly Coach</h2>
      <p className="mt-1 text-sm text-zinc-600">A brief of the last seven completed days.</p>
      <Link to={prefixedPath(prefix, '/progress/weekly')} className={`${quietButtonClass} mt-3 inline-flex min-h-11 items-center`}>
        Open weekly brief
      </Link>
    </section>
  )
}

export function WeeklyCoachView({
  brief,
  commentary,
  notice,
  decision,
  exampleLabel,
  generating = false,
  onGenerate,
}: {
  brief: WeeklyCoachBrief
  commentary: WeeklyCoachCommentary | null
  notice: string | null
  decision?: GoalControlState | null
  exampleLabel?: string
  generating?: boolean
  onGenerate?: () => void
}) {
  const prefix = useAppPathPrefix()
  const wentWell = ordered(brief, commentary?.wentWellIds, brief.wentWell)
  const watching = ordered(brief, commentary?.worthWatchingIds, brief.worthWatching)
  const focus = commentary
    ? brief.candidates.find((item) => item.id === commentary.focusId && item.section === 'focus') ?? null
    : brief.focus
  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Your Week</p>
        <h1 className="text-2xl font-semibold tracking-tight">{formatWeeklyRange(brief.period.start, brief.period.end)}</h1>
        <p className="text-sm text-zinc-600">
          Comparison {formatWeeklyRange(brief.previousPeriod.start, brief.previousPeriod.end)}
        </p>
        {exampleLabel ? <p className="text-sm text-zinc-600">{exampleLabel}</p> : null}
      </header>
      {decision ? <WeeklyDecisionCard decision={decision} prefix={prefix} /> : null}
      {brief.state === 'insufficient_evidence' && !decision ? <p className="text-sm text-zinc-700">{WEEKLY_COACH_INSUFFICIENT_COPY}</p> : null}
      {notice ? <p className="text-sm text-zinc-600">{notice}</p> : null}
      {commentary?.intro && !decision ? <p className="text-sm text-zinc-500">{commentary.intro}</p> : null}
      <section className="space-y-2">
        <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">Weekly evidence</h2>
        <ul className="space-y-2">
          {brief.facts.map((fact) => (
            <li key={fact.id} className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-900">
              {fact.text}
            </li>
          ))}
        </ul>
      </section>
      <CandidateSection title="What went well" items={wentWell} comments={commentary?.comments ?? {}} prefix={prefix} />
      <CandidateSection title="Worth watching" items={watching} comments={commentary?.comments ?? {}} prefix={prefix} />
      {!decision && focus ? (
        <CandidateSection title="Focus this week" items={[focus]} comments={commentary?.comments ?? {}} prefix={prefix} showAction />
      ) : null}
      {onGenerate && brief.canGenerate && !commentary ? (
        <button type="button" className={`${quietButtonClass} min-h-11`} disabled={generating} onClick={onGenerate}>
          {generating ? 'Generating…' : 'Generate coach brief'}
        </button>
      ) : null}
    </div>
  )
}

function WeeklyDecisionCard({ decision, prefix }: { decision: GoalControlState; prefix: string }) {
  const opportunity = decision.primaryOpportunity
  const activeGoals = decision.goals.filter((goal) => goal.lifecycle === 'active')
  const meeting = activeGoals.filter((goal) => goal.state === 'meeting' || goal.state === 'on_track').length
  const attention = activeGoals.filter((goal) => goal.state === 'needs_attention').length
  const unknown = activeGoals.filter((goal) => goal.state === 'unknown').length
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Weekly decision</p>
          <h2 className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">{decision.headline}</h2>
          <p className="mt-1 text-sm text-zinc-600">{decision.summary}</p>
        </div>
        <span className="rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
          {decision.confidence} confidence
        </span>
      </div>
      {activeGoals.length > 0 ? (
        <p className="mt-3 text-xs text-zinc-500">
          Active goals · {meeting} meeting/on track · {attention} need attention{unknown > 0 ? ` · ${unknown} need more evidence` : ''}
        </p>
      ) : null}
      {opportunity ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Link to={prefixedPath(prefix, opportunity.detailPath)} className={quietButtonClass}>
            {opportunity.actionText}
          </Link>
          <Link
            to={prefixedPath(prefix, `/ask-health?${askSearch(opportunity.title)}`)}
            className={quietButtonClass}
          >
            Ask Health
          </Link>
        </div>
      ) : null}
      <div className={`mt-3 grid gap-2 text-sm ${decision.maintenance ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
        <div className="rounded-md bg-zinc-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Training</p>
          <p className="mt-1 text-zinc-700">{decision.trainingAdherence.detail}</p>
        </div>
        <div className="rounded-md bg-zinc-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Nutrition evidence</p>
          <p className="mt-1 text-zinc-700">{decision.nutritionQuality.detail}</p>
        </div>
        {decision.maintenance ? (
          <div className="rounded-md bg-zinc-50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Weight response</p>
            <p className="mt-1 text-zinc-700">{decision.maintenance.plateau.headline}</p>
            {decision.maintenance.estimate.state === 'available' && decision.maintenance.estimate.observedMaintenanceKcal != null ? (
              <p className="mt-1 text-xs text-zinc-500">
                Observed maintenance ≈ {Math.round(decision.maintenance.estimate.observedMaintenanceKcal).toLocaleString('en-US')} kcal/day · {decision.maintenance.estimate.confidence} confidence
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      {(decision.relationships.length > 0 || decision.limitations.length > 0) ? (
        <details className="mt-3 rounded-md border border-zinc-200 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-zinc-700">Why this decision?</summary>
          {decision.relationships.length > 0 ? (
            <ul className="mt-2 space-y-1 text-sm text-zinc-600">
              {decision.relationships.map((item) => <li key={item.id}>{item.summary}</li>)}
            </ul>
          ) : null}
          {decision.maintenance?.noiseFactors.length ? (
            <ul className="mt-2 space-y-1 text-xs text-zinc-500">
              {decision.maintenance.noiseFactors.slice(0, 4).map((item) => <li key={item.id}>{item.title}. {item.detail}</li>)}
            </ul>
          ) : null}
          {decision.limitations.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-zinc-500">
              {decision.limitations.map((item) => <li key={item.code}>{item.text}</li>)}
            </ul>
          ) : null}
        </details>
      ) : null}
    </section>
  )
}

function CandidateSection({
  title,
  items,
  comments,
  prefix,
  showAction = false,
}: {
  title: string
  items: WeeklyCandidate[]
  comments: Record<string, string>
  prefix: string
  showAction?: boolean
}) {
  if (items.length === 0) {
    return null
  }
  return (
    <section className="space-y-2">
      <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">{title}</h2>
      {items.map((item) => (
        <article key={item.id} className="rounded-lg border border-zinc-200 bg-white p-4">
          <p className="text-sm text-zinc-900">{showAction && item.actionText ? item.actionText : item.fact}</p>
          {comments[item.id] ? <p className="mt-1 text-sm text-zinc-500">{comments[item.id]}</p> : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Link to={prefixedPath(prefix, item.detailPath)} className={`${quietButtonClass} inline-flex min-h-11 items-center`}>
              Explore
            </Link>
            <Link
              to={prefixedPath(prefix, `/ask-health?${askSearch(item.fact)}`)}
              className={`${quietButtonClass} inline-flex min-h-11 items-center`}
            >
              Ask Health
            </Link>
          </div>
        </article>
      ))}
    </section>
  )
}

function ordered(brief: WeeklyCoachBrief, ids: string[] | undefined, fallback: WeeklyCandidate[]): WeeklyCandidate[] {
  if (!ids) {
    return fallback
  }
  return ids.flatMap((id) => {
    const item = brief.candidates.find((candidate) => candidate.id === id)
    return item ? [item] : []
  })
}

function askSearch(fact: string): string {
  const params = new URLSearchParams()
  params.set('lens', 'general')
  params.set('range', '30d')
  params.set('question', `What does this weekly evidence show? ${fact}`)
  return params.toString()
}

function part(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number)
  return { year: year ?? 0, month: (month ?? 1) - 1, day: day ?? 1 }
}

type WeeklyCoachResponse = {
  brief: WeeklyCoachBrief
  commentary: WeeklyCoachCommentary | null
  notice: string | null
  decision: GoalControlState
}

export function WeeklyCoachPage() {
  const [payload, setPayload] = useState<WeeklyCoachResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    healthFetch('/api/progress/weekly', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await readApiError(response))
        }
        return (await response.json()) as WeeklyCoachResponse
      })
      .then((body) => {
        if (!controller.signal.aborted) {
          setPayload(body)
        }
      })
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : 'Weekly Coach is unavailable right now.')
        }
      })
    return () => controller.abort()
  }, [])

  async function generate() {
    setGenerating(true)
    setError(null)
    try {
      const response = await healthFetch('/api/progress/weekly', { method: 'POST' })
      if (!response.ok) {
        throw new Error(await readApiError(response))
      }
      setPayload((await response.json()) as WeeklyCoachResponse)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Coach wording is unavailable right now.')
    } finally {
      setGenerating(false)
    }
  }

  if (error && !payload) {
    return <p className="text-sm text-zinc-600">{error}</p>
  }
  if (!payload) {
    return <p className="text-sm text-zinc-500">Loading the completed week…</p>
  }
  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-zinc-600">{error}</p> : null}
      <WeeklyCoachView
        brief={payload.brief}
        commentary={payload.commentary}
        notice={payload.notice}
        decision={payload.decision}
        generating={generating}
        onGenerate={() => {
          void generate()
        }}
      />
    </div>
  )
}
