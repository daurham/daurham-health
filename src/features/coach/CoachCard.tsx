import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { CoachState, CoachTaskView } from '@/domain/coach'
import type { CoachLabItem } from '@/domain/coach-lab'
import { XpAmount } from '@/components/XpAmount'
import { primaryButtonClass, quietButtonClass } from '@/lib'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'
import { metersToMiles } from '@/domain/units'
import { xpForRewardBand } from '@/domain/rewards'
import { CoachDialog } from './CoachDialog'
import { acceptCoachTask, CoachApiError, endCoachTask, fetchCoach, logCoachSelfReport, logCoachTraining, passCoachTask, snoozeCoachLabItem } from './api'
import { coachDateLabel, formatStretchValue, isCurrentResolvedCoachTask, pendingStretchAcknowledgement } from './presentation'

function progressText(task: CoachTaskView): string | null {
  const progress = task.progress
  if (!progress?.label) return null
  if (progress.target == null || progress.current == null) return progress.label
  if (progress.unit === 'steps') return `${Math.round(progress.current).toLocaleString('en-US')} / ${Math.round(progress.target).toLocaleString('en-US')}`
  if (progress.unit === 'g') return `${Math.round(progress.current)} / ${Math.round(progress.target)} g`
  if (progress.unit === 'sessions' || progress.unit === 'session') return `${Math.round(progress.current)} / ${Math.round(progress.target)} ${progress.target === 1 ? 'session' : 'sessions'}`
  return progress.label
}

function verificationCopy(task: CoachTaskView): string {
  if (task.taskKind === 'stretch_quest') return 'Verified by Training'
  if (task.verificationMode === 'canonical') return 'Verified by Health'
  if (task.verificationMode === 'training_log') return 'Logs to Training'
  return 'Reported by you'
}

function resolvedCopy(task: CoachTaskView): string {
  if (task.status === 'completed') return task.evidenceLabel ?? 'Complete'
  if (task.taskKind === 'stretch_quest') {
    if (task.status === 'passed') return 'Passed'
    if (task.status === 'failed') return 'Challenge ended'
    if (task.status === 'expired') return 'Offer expired'
  }
  if (task.status === 'passed') return task.taskKind === 'weekly_focus' ? 'Skipped this week' : 'Passed today'
  if (task.status === 'expired') return 'Expired'
  return ''
}

function missionType(task: CoachTaskView): string {
  if (task.taskKind === 'daily_quest') return 'Today'
  if (task.taskKind === 'stretch_quest') return 'Stretch'
  return 'This week'
}

function missionMeta(task: CoachTaskView): string {
  if (task.status === 'completed') return task.evidenceLabel ? `Complete · ${task.evidenceLabel}` : 'Complete'
  if (task.status !== 'active' && task.status !== 'offered') return resolvedCopy(task)
  if (task.taskKind === 'stretch_quest') {
    const target = task.targetValue == null ? null : formatStretchValue(task, task.targetValue)
    const timing = task.expiresOn ? `${task.status === 'offered' ? 'Offer ends' : 'Ends'} ${coachDateLabel(task.expiresOn)}` : null
    return [target ? `Target ${target}` : null, timing].filter(Boolean).join(' · ')
  }
  return progressText(task) ?? verificationCopy(task)
}

type CoachActions = {
  pending: boolean
  onPass: (task: CoachTaskView) => void
  onAccept: (task: CoachTaskView) => void
  onEnd: (task: CoachTaskView) => void
  onLog: (task: CoachTaskView) => void
  onAcknowledge: (task: CoachTaskView) => void
  onSnooze?: (item: CoachLabItem) => void
  onNavigate?: () => void
}

export function CoachCard({ state, pending, error, onState }: {
  state: CoachState | null
  pending?: boolean
  error?: string | null
  onState: (state: CoachState) => void
}) {
  const location = useLocation()
  const [inboxOpen, setInboxOpen] = useState(false)
  const [detailTask, setDetailTask] = useState<CoachTaskView | null>(null)
  const [logTask, setLogTask] = useState<CoachTaskView | null>(null)
  const [endTask, setEndTask] = useState<CoachTaskView | null>(null)
  const [acknowledgedStretchId, setAcknowledgedStretchId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [xpNotice, setXpNotice] = useState<number | null>(null)
  const celebrationTimerRef = useRef<number | null>(null)
  const returnFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    setInboxOpen(false)
    setDetailTask(null)
    setLogTask(null)
    setEndTask(null)
  }, [location.key])

  useEffect(() => () => {
    if (celebrationTimerRef.current != null) window.clearTimeout(celebrationTimerRef.current)
  }, [])

  function closeOverlays() {
    setInboxOpen(false)
    setDetailTask(null)
    setLogTask(null)
    setEndTask(null)
  }

  function rememberFocus(element?: HTMLElement | null) {
    if (element) {
      returnFocusRef.current = element
      return
    }
    if (document.activeElement instanceof HTMLElement) returnFocusRef.current = document.activeElement
  }

  if (!state && !error) return pending ? <div className="h-24 animate-pulse rounded-lg bg-zinc-200" aria-label="Loading Coach" /> : null
  if (!state) return (
    <section className="rounded-lg border border-zinc-200 bg-white p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Coach</h2>
      <p className="mt-1 text-sm text-zinc-600">{error ?? 'Coach is unavailable.'}</p>
    </section>
  )

  const weekly = state.weeklyFocus
  const stretch = state.stretchQuest
  const daily = state.dailyQuest
  const labItems = (state.labItems ?? []).slice(0, 3)
  const labOverflow = (state.labOverflowCount ?? 0) + Math.max(0, (state.labItems?.length ?? 0) - 3)
  const pendingAck = pendingStretchAcknowledgement(state, acknowledgedStretchId)
  const visibleStretch = stretch && (stretch.status === 'active' || stretch.status === 'offered' || isCurrentResolvedCoachTask(stretch, state.date)) ? stretch : null
  const missions = [daily, visibleStretch, weekly].filter((task): task is CoachTaskView => task != null)
  const visibleCount = missions.length + labItems.length + labOverflow
  if (visibleCount === 0 && !notice && !actionError) return null

  function celebrateIfCompleted(task: CoachTaskView, next: CoachState) {
    const resolved = [next.dailyQuest, next.stretchQuest, next.weeklyFocus].find((item) => item?.id === task.id) ?? null
    if (task.status !== 'completed' && resolved?.status === 'completed') {
      const amount = xpForRewardBand(resolved.rewardBand)
      setXpNotice(amount)
      if (celebrationTimerRef.current != null) window.clearTimeout(celebrationTimerRef.current)
      celebrationTimerRef.current = window.setTimeout(() => setXpNotice(null), 2600)
    }
  }

  async function update(task: CoachTaskView, operation: (id: string) => Promise<CoachState>) {
    setActionPending(true)
    setActionError(null)
    setNotice(null)
    try {
      const next = await operation(task.id)
      celebrateIfCompleted(task, next)
      onState(next)
      setDetailTask(null)
      setEndTask(null)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not update Coach')
    } finally {
      setActionPending(false)
    }
  }

  async function snooze(item: CoachLabItem) {
    setActionPending(true)
    setActionError(null)
    setNotice(null)
    try {
      const next = await snoozeCoachLabItem(item)
      onState(next)
      setInboxOpen(false)
      setNotice(`Hidden from Coach until ${coachDateLabel(next.snoozedUntil)}. It is still available in Personal Lab.`)
    } catch (caught) {
      if (caught instanceof CoachApiError && caught.status === 409) {
        setNotice('This Lab opportunity changed. Refreshing Coach…')
        try {
          onState(await fetchCoach())
          setInboxOpen(false)
          setNotice('This Lab opportunity changed. Coach has been refreshed.')
        } catch {
          setActionError('Could not refresh Coach. Try again.')
          setNotice(null)
        }
      } else {
        setActionError(caught instanceof Error ? caught.message : 'Could not update Coach')
      }
    } finally {
      setActionPending(false)
    }
  }

  const actions: CoachActions = {
    pending: actionPending,
    onPass: task => void update(task, passCoachTask),
    onAccept: task => void update(task, acceptCoachTask),
    onEnd: task => {
      rememberFocus()
      setInboxOpen(false)
      setDetailTask(null)
      setActionError(null)
      setEndTask(task)
    },
    onLog: task => {
      rememberFocus()
      setInboxOpen(false)
      setDetailTask(null)
      setLogTask(task)
    },
    onAcknowledge: task => {
      setAcknowledgedStretchId(task.id)
      setInboxOpen(false)
      setDetailTask(null)
    },
    onSnooze: item => void snooze(item),
    onNavigate: closeOverlays,
  }

  function openTask(task: CoachTaskView, element: HTMLElement) {
    rememberFocus(element)
    setActionError(null)
    setDetailTask(task)
  }

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-zinc-200 bg-white" aria-label="Coach">
        <div className="flex items-center justify-between gap-3 px-3 pb-2 pt-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Coach</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Missions that matter now</p>
          </div>
          {(labItems.length > 0 || labOverflow > 0) ? (
            <button
              type="button"
              className={quietButtonClass}
              onClick={(event) => {
                rememberFocus(event.currentTarget)
                setInboxOpen(true)
              }}
            >
              Lab · {labItems.length + labOverflow}
            </button>
          ) : null}
        </div>

        <div className="divide-y divide-zinc-100 border-t border-zinc-100">
          {missions.map((task) => (
            <MissionRow
              key={task.id}
              task={task}
              pending={actionPending}
              attention={task.id === pendingAck}
              onOpen={openTask}
              onQuickLog={task.taskKind === 'daily_quest' && task.status === 'active' && task.actionKind !== 'open' ? () => actions.onLog(task) : undefined}
            />
          ))}
        </div>

        {notice ? (
          <div className="motion-notice-enter mx-3 my-2 flex items-start gap-3 border-t border-zinc-100 pt-2 text-xs text-zinc-600" role="status">
            <p className="min-w-0 flex-1">{notice}</p>
            <button type="button" className={`${quietButtonClass} shrink-0 text-xs`} aria-label="Dismiss Coach notice" onClick={() => setNotice(null)}>Dismiss</button>
          </div>
        ) : null}
        {xpNotice != null ? (
          <div className="xp-celebration mx-3 mb-3 flex items-center justify-between gap-3 rounded-lg bg-reward-muted px-3 py-2" role="status" aria-live="polite">
            <span className="text-sm font-semibold text-zinc-900">Mission complete</span>
            <XpAmount amount={xpNotice} sign />
          </div>
        ) : null}
        {actionError ? <p className="px-3 py-2 text-sm text-red-700" role="alert">{actionError}</p> : null}
      </section>

      {detailTask ? (
        <CoachDialog title={missionType(detailTask)} onClose={() => setDetailTask(null)} returnFocusTo={returnFocusRef.current}>
          <div className="mt-3">
            <CoachTaskContent task={detailTask} actions={actions} />
          </div>
        </CoachDialog>
      ) : null}

      {inboxOpen ? <CoachInbox state={state} onClose={() => setInboxOpen(false)} actions={actions} error={actionError} returnFocusTo={returnFocusRef.current} /> : null}
      {endTask ? <CoachDialog title="End Stretch Quest" onClose={() => setEndTask(null)} returnFocusTo={returnFocusRef.current}><p className="mt-3 text-sm text-zinc-600">This challenge will close without a reward. Any Training PR you achieved stays in your Training history. There is no penalty.</p>{actionError ? <p className="mt-3 text-sm text-red-700" role="alert">{actionError}</p> : null}<div className="mt-4 flex flex-wrap gap-3"><button type="button" className={primaryButtonClass} disabled={actionPending} onClick={() => void update(endTask, endCoachTask)}>{actionPending ? 'Ending…' : 'End quest'}</button><button type="button" data-coach-initial-focus className={quietButtonClass} disabled={actionPending} onClick={() => setEndTask(null)}>Keep going</button></div></CoachDialog> : null}
      {logTask ? <CoachLogSheet task={logTask} onClose={() => setLogTask(null)} returnFocusTo={returnFocusRef.current} onSaved={next => { celebrateIfCompleted(logTask, next); setLogTask(null); onState(next) }} /> : null}
    </>
  )
}

function MissionRow({
  task,
  pending,
  attention,
  onOpen,
  onQuickLog,
}: {
  task: CoachTaskView
  pending: boolean
  attention: boolean
  onOpen: (task: CoachTaskView, element: HTMLElement) => void
  onQuickLog?: () => void
}) {
  const complete = task.status === 'completed'
  return (
    <div className={`flex min-w-0 items-center gap-2 px-3 py-2.5 ${attention ? 'bg-reward-muted/40' : ''}`} data-coach-mission={task.taskKind}>
      <button
        type="button"
        className="motion-interactive min-w-0 flex-1 rounded-md py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={(event) => onOpen(task, event.currentTarget)}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className={`shrink-0 text-[11px] font-semibold uppercase tracking-wide ${task.taskKind === 'daily_quest' ? 'text-accent' : 'text-zinc-500'}`}>
            {missionType(task)}
          </span>
          <XpAmount amount={xpForRewardBand(task.rewardBand)} sign />
          {complete ? <span className="shrink-0 text-xs font-semibold text-toward">✓</span> : null}
        </div>
        <p className="mt-1 truncate text-sm font-semibold text-zinc-900">{task.title}</p>
        <p className="mt-0.5 truncate text-xs text-zinc-500">{missionMeta(task)}</p>
      </button>
      {onQuickLog ? (
        <button
          type="button"
          className="motion-pressable inline-flex min-h-9 shrink-0 items-center rounded-md bg-accent px-3 text-xs font-semibold text-accent-fg hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
          disabled={pending}
          onClick={onQuickLog}
        >
          Log
        </button>
      ) : (
        <span className="shrink-0 text-zinc-400" aria-hidden="true">›</span>
      )}
    </div>
  )
}

function LabContent({ item, actions }: { item: CoachLabItem; actions: CoachActions }) {
  const prefix = useAppPathPrefix()
  return <>
    <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Personal Lab{item.urgency === 'due' ? ' · Retest due' : item.urgency === 'available' ? ' · Retest available' : ''}</p>
    <p className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">{item.title}</p>
    <p className="mt-1 text-sm text-zinc-600">{item.detail}</p>
    <div className="mt-3 flex flex-wrap gap-3"><Link to={prefixedPath(prefix, item.href)} onClick={actions.onNavigate} className={primaryButtonClass}>{item.kind === 'experiment_suggestion' ? 'Review experiment' : 'Open benchmark'}</Link><button type="button" className={quietButtonClass} disabled={actions.pending} onClick={() => actions.onSnooze?.(item)}>Not now</button></div>
  </>
}
function CoachTaskContent({ task, actions }: { task: CoachTaskView; actions: CoachActions }) {
  const prefix = useAppPathPrefix()
  if (task.taskKind === 'stretch_quest') return <StretchContent task={task} actions={actions} />
  return (
    <>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">{task.taskKind === 'weekly_focus' ? 'This week' : "Today's quest"}</p>
      {task.status === 'active' ? (
        <>
          <p className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">{task.title}</p>
          <p className="mt-1 text-sm text-zinc-600">{task.detail}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
            <XpAmount amount={xpForRewardBand(task.rewardBand)} sign />
            <span>{verificationCopy(task)}</span>
            {progressText(task) ? <span>{progressText(task)}</span> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {task.actionKind === 'open' && task.actionHref ? (
              <Link to={prefixedPath(prefix, task.actionHref)} className={primaryButtonClass} onClick={actions.onNavigate}>Open</Link>
            ) : <button type="button" className={primaryButtonClass} disabled={actions.pending} onClick={() => actions.onLog(task)}>Log it</button>}
            <button type="button" className={quietButtonClass} disabled={actions.pending} onClick={() => actions.onPass(task)}>{task.taskKind === 'weekly_focus' ? 'Not this week' : 'Pass'}</button>
          </div>
        </>
      ) : (
        <div className="motion-notice-enter mt-1 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-900">{task.status === 'completed' ? '✓ Quest complete' : resolvedCopy(task)}</p>
            <p className="mt-0.5 text-xs text-zinc-500">{task.title}</p>
          </div>
          {task.status === 'completed' ? <span className="flex flex-wrap items-center gap-2"><XpAmount amount={xpForRewardBand(task.rewardBand)} sign />{task.evidenceLabel ? <span className="text-xs text-zinc-500">{task.evidenceLabel}</span> : null}</span> : null}
        </div>
      )}
    </>
  )
}

function StretchContent({ task, actions }: { task: CoachTaskView; actions: CoachActions }) {
  const prefix = useAppPathPrefix()
  const metadata = task.metadata.stretch && typeof task.metadata.stretch === 'object'
    ? task.metadata.stretch as Record<string, unknown>
    : null
  const isStrength = metadata?.strategy === 'strength_e1rm'
  const isPace = metadata?.strategy === 'pace'
  const baselineMeta = metadata?.baseline && typeof metadata.baseline === 'object' ? metadata.baseline as Record<string, unknown> : null
  const evidenceMeta = baselineMeta?.evidence && typeof baselineMeta.evidence === 'object' ? baselineMeta.evidence as Record<string, unknown> : null
  const paceMinimumDistance = typeof evidenceMeta?.distanceM === 'number' ? metersToMiles(evidenceMeta.distanceM) : null
  const best = task.progress?.current ?? null
  const newPr = task.status === 'active' && best != null && task.baselineValue != null &&
    (isPace ? best < task.baselineValue : best > task.baselineValue)
  const completed = task.status === 'completed'
  if (task.status !== 'active' && task.status !== 'offered' && !completed) return <StretchSummary task={task} />
  return (
    <div className={completed ? 'motion-notice-enter' : undefined}>
      <div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Stretch Quest</p><XpAmount amount={xpForRewardBand(task.rewardBand)} sign /></div>
      <p className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">{completed ? '✓ Stretch conquered' : task.title}</p>
      {completed ? <p className="mt-1 text-sm text-zinc-600">{task.title}</p> : <p className="mt-1 text-sm text-zinc-600">{task.detail}</p>}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div className="min-w-0"><dt className="text-xs text-zinc-500">{completed ? 'Achieved' : task.status === 'offered' ? 'Baseline' : newPr ? 'New PR' : 'Best attempt'}</dt><dd className="mt-0.5 font-semibold text-zinc-900">{formatStretchValue(task, task.status === 'offered' ? task.baselineValue : best)}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-zinc-500">Target</dt><dd className="mt-0.5 font-semibold text-zinc-900">{formatStretchValue(task, task.targetValue)}</dd></div>
      </dl>
      {completed ? (
        <>
          <p className="mt-2 text-xs text-zinc-500">Verified by Training</p>
          <button type="button" className={`${quietButtonClass} mt-2`} onClick={() => actions.onAcknowledge(task)}>Got it</button>
        </>
      ) : (
        <>
          {newPr ? <p className="mt-2 text-sm text-zinc-600">Quest not conquered yet.</p> : null}
          <p className="mt-2 text-xs text-zinc-500">{task.status === 'offered' ? 'Offer expires' : 'Challenge ends'} {coachDateLabel(task.expiresOn)} · {task.status === 'offered' ? '7 days to attempt after acceptance' : 'Verified by Training'}</p>
          {task.status === 'offered' ? (
            <p className="mt-2 text-xs leading-relaxed text-zinc-600">
              {isStrength
                ? 'e1RM is estimated performance, not the literal load to put on the bar. Any valid high-confidence weight × rep combination can count.'
                : isPace
                  ? `Pace comes from one continuous Training set.${paceMinimumDistance == null ? '' : ` Cover at least ${paceMinimumDistance.toLocaleString('en-US', { maximumFractionDigits: 2 })} mi.`}`
                  : 'Measured from one qualifying working set saved in Training.'}
              {metadata?.perSide === true ? ' Both sides must be completed; the lower side counts.' : null}
            </p>
          ) : isStrength ? <p className="mt-2 text-xs leading-relaxed text-zinc-600">The e1RM target is an estimate, not a prescribed bar load. Any valid high-confidence weight × rep combination can count.</p> : null}
          <div className="mt-3 flex flex-wrap gap-3">
            {task.status === 'offered' ? (
              <>
                <button type="button" className={primaryButtonClass} disabled={actions.pending} onClick={() => actions.onAccept(task)}>Accept</button>
                <button type="button" className={quietButtonClass} disabled={actions.pending} onClick={() => actions.onPass(task)}>Pass</button>
              </>
            ) : (
              <>
                <Link to={prefixedPath(prefix, task.actionHref ?? '/training')} className={primaryButtonClass} onClick={actions.onNavigate}>Open Training</Link>
                <button type="button" className={quietButtonClass} disabled={actions.pending} onClick={() => actions.onEnd(task)}>End quest</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function StretchSummary({ task, onAcknowledge }: { task: CoachTaskView; onAcknowledge?: () => void }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2"><p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Stretch Quest</p><XpAmount amount={xpForRewardBand(task.rewardBand)} sign /></div>
      <p className="mt-1 text-sm font-medium text-zinc-900">{task.status === 'completed' ? '✓ Stretch conquered' : task.status === 'offered' ? 'Offer available' : task.status === 'active' ? 'In progress' : resolvedCopy(task)}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{task.title}</p>
      {task.status === 'completed' ? <p className="mt-1 text-xs text-zinc-500">Achieved {formatStretchValue(task, task.progress?.current ?? null)} · Target {formatStretchValue(task, task.targetValue)} · Verified by Training</p> : null}
      {onAcknowledge ? <button type="button" className={quietButtonClass} onClick={onAcknowledge}>Got it</button> : null}
    </div>
  )
}

export function CoachInbox({ state, onClose, actions, error, returnFocusTo }: {
  state: CoachState
  onClose: () => void
  actions: CoachActions
  error?: string | null
  returnFocusTo?: HTMLElement | null
}) {
  const prefix = useAppPathPrefix()
  const inboxActions = { ...actions, onNavigate: () => { actions.onNavigate?.(); onClose() } }
  const stretch = state.stretchQuest
  const visibleStretch = stretch && (stretch.status === 'active' || stretch.status === 'offered' || isCurrentResolvedCoachTask(stretch, state.date)) ? stretch : null
  const lab = (state.labItems ?? []).slice(0, 3)
  const overflow = (state.labOverflowCount ?? 0) + Math.max(0, (state.labItems?.length ?? 0) - 3)
  return (
    <CoachDialog title="Coach inbox" onClose={onClose} returnFocusTo={returnFocusTo}>
      {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
      <div className="mt-4 divide-y divide-zinc-200">
        {state.dailyQuest ? <section className="py-3" aria-label="Today"><h3 className="text-xs font-semibold uppercase tracking-wide text-accent">Today</h3><div className="mt-2"><CoachTaskContent task={state.dailyQuest} actions={inboxActions} /></div></section> : null}
        {visibleStretch ? <section className="py-3" aria-label="Stretch"><h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Stretch</h3><div className="mt-2"><CoachTaskContent task={visibleStretch} actions={inboxActions} /></div></section> : null}
        {state.weeklyFocus ? <section className="py-3" aria-label="This week"><h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">This week</h3><div className="mt-2"><CoachTaskContent task={state.weeklyFocus} actions={inboxActions} /></div></section> : null}
        {lab.length || overflow ? <section className="py-3" aria-label="Lab"><h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Lab</h3><ul className="mt-2 divide-y divide-zinc-100">{lab.map(item => <li key={`${item.kind}:${item.sourceKey}`} className="py-3"><LabContent item={item} actions={inboxActions} /></li>)}</ul>{overflow > 0 ? <Link to={prefixedPath(prefix, '/lab')} className={quietButtonClass} onClick={() => { actions.onNavigate?.(); onClose() }}>Open Lab · {overflow} more</Link> : null}</section> : null}
      </div>
    </CoachDialog>
  )
}
function CoachLogSheet({
  task,
  onClose,
  onSaved,
  returnFocusTo,
}: {
  task: CoachTaskView
  onClose: () => void
  onSaved: (state: CoachState) => void
  returnFocusTo?: HTMLElement | null
}) {
  const training = task.metadata.training && typeof task.metadata.training === 'object'
    ? task.metadata.training as Record<string, unknown>
    : null
  const selfReportKind = typeof task.metadata.selfReportKind === 'string' ? task.metadata.selfReportKind : null
  const defaultValue = task.targetValue == null ? '' : String(task.targetValue)
  const [submissionId] = useState(() => globalThis.crypto.randomUUID())
  const [actualValue, setActualValue] = useState(defaultValue)
  const [durationMin, setDurationMin] = useState(task.targetUnit === 'min' ? defaultValue : '')
  const [distance, setDistance] = useState('')
  const [distanceUnit, setDistanceUnit] = useState<'mi' | 'km'>('mi')
  const [description, setDescription] = useState('')
  const [note, setNote] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const allowDistance = training?.allowDistance === true

  async function submit() {
    setPending(true)
    setError(null)
    try {
      const next =
        task.actionKind === 'log_training'
          ? await logCoachTraining(task.id, {
              submissionId,
              actualValue: Number(actualValue),
              distance: allowDistance && distance.trim() ? Number(distance) : null,
              distanceUnit: allowDistance && distance.trim() ? distanceUnit : null,
              note: note.trim() || null,
            })
          : await logCoachSelfReport(task.id, {
              submissionId,
              durationMin: task.targetUnit === 'min' ? Number(durationMin) : null,
              description: selfReportKind === 'meal_prep' ? description.trim() || null : null,
              note: note.trim() || null,
            })
      onSaved(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save this Coach task')
    } finally {
      setPending(false)
    }
  }

  return (
    <CoachDialog title="Log Coach quest" onClose={onClose} returnFocusTo={returnFocusTo}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Log it</p>
            <h3 className="mt-1 text-base font-semibold tracking-tight">{task.title}</h3>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {task.actionKind === 'log_training' ? (
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">
                {task.targetUnit === 'reps' ? 'Reps completed' : 'Minutes completed'}
              </span>
              <input
                data-coach-initial-focus
                type="number"
                min="0"
                step={task.targetUnit === 'reps' ? '1' : '0.5'}
                value={actualValue}
                onChange={(event) => setActualValue(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3 text-base"
              />
            </label>
          ) : task.targetUnit === 'min' ? (
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">Minutes completed</span>
              <input
                data-coach-initial-focus
                type="number"
                min="0"
                step="1"
                value={durationMin}
                onChange={(event) => setDurationMin(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3 text-base"
              />
            </label>
          ) : null}

          {allowDistance ? (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label>
                <span className="text-sm font-medium text-zinc-800">Distance (optional)</span>
                <input
                  data-coach-initial-focus
                type="number"
                  min="0"
                  step="0.01"
                  value={distance}
                  onChange={(event) => setDistance(event.target.value)}
                  className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3 text-base"
                />
              </label>
              <label>
                <span className="text-sm font-medium text-zinc-800">Unit</span>
                <select
                  value={distanceUnit}
                  onChange={(event) => setDistanceUnit(event.target.value as 'mi' | 'km')}
                  className="mt-1 min-h-11 rounded-md border border-zinc-300 px-3 text-base"
                >
                  <option value="mi">mi</option>
                  <option value="km">km</option>
                </select>
              </label>
            </div>
          ) : null}

          {selfReportKind === 'meal_prep' ? (
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">What did you prep? (optional)</span>
              <input
                type="text"
                maxLength={160}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 px-3 text-base"
                placeholder="Chicken rice bowls, turkey chili…"
              />
            </label>
          ) : null}

          <label className="block">
            <span className="text-sm font-medium text-zinc-800">Note (optional)</span>
            <textarea
              rows={3}
              maxLength={500}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-base"
            />
          </label>
        </div>

        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <div className="mt-4 flex gap-2">
          <button type="button" className={primaryButtonClass} disabled={pending} onClick={() => void submit()}>
            {pending ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className={quietButtonClass} disabled={pending} onClick={onClose}>
            Cancel
          </button>
        </div>
    </CoachDialog>
  )
}
