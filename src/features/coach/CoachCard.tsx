import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { CoachState, CoachTaskView } from '@/domain/coach'
import { primaryButtonClass, quietButtonClass } from '@/lib'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'
import {
  acceptCoachTask,
  endCoachTask,
  logCoachSelfReport,
  logCoachTraining,
  passCoachTask,
} from './api'
import { coachDateLabel, formatStretchValue, selectPrimaryCoachTask } from './presentation'

function progressText(task: CoachTaskView): string | null {
  const progress = task.progress
  if (!progress) return null
  if (progress.label) {
    if (progress.target == null || progress.current == null) return progress.label
    if (progress.unit === 'steps') {
      return `${Math.round(progress.current).toLocaleString('en-US')} / ${Math.round(progress.target).toLocaleString('en-US')}`
    }
    if (progress.unit === 'g') return `${Math.round(progress.current)} / ${Math.round(progress.target)} g`
    if (progress.unit === 'sessions' || progress.unit === 'session') {
      return `${Math.round(progress.current)} / ${Math.round(progress.target)} ${progress.target === 1 ? 'session' : 'sessions'}`
    }
    return progress.label
  }
  return null
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

type CoachActions = {
  pending: boolean
  onPass: (task: CoachTaskView) => void
  onAccept: (task: CoachTaskView) => void
  onEnd: (task: CoachTaskView) => void
  onLog: (task: CoachTaskView) => void
  onAcknowledge: (task: CoachTaskView) => void
}

export function CoachCard({
  state,
  pending,
  error,
  onState,
}: {
  state: CoachState | null
  pending?: boolean
  error?: string | null
  onState: (state: CoachState) => void
}) {
  const prefix = useAppPathPrefix()
  const [inboxOpen, setInboxOpen] = useState(false)
  const [logTask, setLogTask] = useState<CoachTaskView | null>(null)
  const [endTask, setEndTask] = useState<CoachTaskView | null>(null)
  const [acknowledgedStretchId, setAcknowledgedStretchId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionPending, setActionPending] = useState(false)

  if (!state && !error) {
    return pending ? <div className="h-24 animate-pulse rounded-lg bg-zinc-200" aria-label="Loading Coach" /> : null
  }
  if (!state) {
    return (
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Coach</h2>
        <p className="mt-2 text-sm text-zinc-600">{error ?? 'Coach is unavailable.'}</p>
      </section>
    )
  }

  const weekly = state.weeklyFocus
  const stretch = state.stretchQuest
  const primary = selectPrimaryCoachTask(state, acknowledgedStretchId)
  const visibleCount = [weekly, state.dailyQuest, stretch].filter(Boolean).length
  if (visibleCount === 0) return null
  const compactStretch = stretch && stretch.id !== primary?.id ? stretch : null

  async function update(task: CoachTaskView, operation: (id: string) => Promise<CoachState>) {
    setActionPending(true)
    setActionError(null)
    try {
      onState(await operation(task.id))
      setEndTask(null)
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not update Coach')
    } finally {
      setActionPending(false)
    }
  }

  const actions: CoachActions = {
    pending: actionPending,
    onPass: (task) => void update(task, passCoachTask),
    onAccept: (task) => void update(task, acceptCoachTask),
    onEnd: (task) => { setInboxOpen(false); setActionError(null); setEndTask(task) },
    onLog: (task) => { setInboxOpen(false); setLogTask(task) },
    onAcknowledge: (task) => { setAcknowledgedStretchId(task.id); setInboxOpen(false) },
  }

  return (
    <>
      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white" aria-label="Coach">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Coach</h2>
          {visibleCount > 1 ? (
            <button type="button" className={quietButtonClass} onClick={() => setInboxOpen(true)}>
              {state.activeCount > 0 ? `Coach · ${state.activeCount}` : 'Coach inbox'}
            </button>
          ) : null}
        </div>

        {weekly ? (
          <div className="mx-4 mt-3 rounded-md bg-zinc-50 px-3 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Focus this week</p>
                <p className="mt-1 text-sm font-semibold text-zinc-900">{weekly.title}</p>
                {weekly.status === 'active' ? (
                  <>
                    <p className="mt-0.5 text-sm text-zinc-600">{weekly.detail}</p>
                    {progressText(weekly) ? <p className="mt-1 text-xs font-medium text-zinc-600">{progressText(weekly)}</p> : null}
                  </>
                ) : <p className="mt-1 text-xs font-medium text-zinc-500">{resolvedCopy(weekly)}</p>}
              </div>
              {weekly.status === 'active' ? (
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {weekly.actionHref ? (
                    <Link to={prefixedPath(prefix, weekly.actionHref)} className="min-h-11 inline-flex items-center text-xs font-medium text-zinc-700 hover:underline">Open</Link>
                  ) : null}
                  <button type="button" className="min-h-11 text-xs font-medium text-zinc-500 hover:text-zinc-900" disabled={actionPending} onClick={() => actions.onPass(weekly)}>Not this week</button>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {primary ? (
          <div className="p-4" data-coach-primary={primary.taskKind}>
            <CoachTaskContent task={primary} actions={actions} />
          </div>
        ) : null}
        {compactStretch ? <div className="mx-4 mb-4 border-t border-zinc-100 pt-3"><StretchSummary task={compactStretch} /></div> : null}
        {actionError ? <p className="px-4 pb-4 text-sm text-red-700" role="alert">{actionError}</p> : null}
      </section>

      {inboxOpen ? <CoachInbox state={state} onClose={() => setInboxOpen(false)} actions={actions} error={actionError} /> : null}
      {endTask ? (
        <div className="motion-scrim-enter fixed inset-0 z-50 flex items-end bg-black/30 sm:items-center sm:justify-center" role="presentation">
          <section className="motion-panel-enter w-full rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-md sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="End Stretch Quest">
            <h2 className="text-lg font-semibold tracking-tight">End quest?</h2>
            <p className="mt-2 text-sm text-zinc-600">This challenge will close without a reward. Any Training PR you achieved stays in your Training history. There is no penalty.</p>
            {actionError ? <p className="mt-3 text-sm text-red-700" role="alert">{actionError}</p> : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button type="button" className={primaryButtonClass} disabled={actionPending} onClick={() => void update(endTask, endCoachTask)}>{actionPending ? 'Ending…' : 'End quest'}</button>
              <button type="button" className={quietButtonClass} disabled={actionPending} onClick={() => setEndTask(null)}>Keep going</button>
            </div>
          </section>
        </div>
      ) : null}
      {logTask ? (
        <CoachLogSheet task={logTask} onClose={() => setLogTask(null)} onSaved={(next) => { setLogTask(null); onState(next) }} />
      ) : null}
    </>
  )
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
            <span>{verificationCopy(task)}</span>
            {progressText(task) ? <span>{progressText(task)}</span> : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {task.actionKind === 'open' && task.actionHref ? (
              <Link to={prefixedPath(prefix, task.actionHref)} className={primaryButtonClass}>Open</Link>
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
          {task.status === 'completed' && task.evidenceLabel ? <span className="text-xs text-zinc-500">{task.evidenceLabel}</span> : null}
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
  const best = task.progress?.current ?? null
  const newPr = task.status === 'active' && best != null && task.baselineValue != null && best > task.baselineValue
  const completed = task.status === 'completed'
  if (task.status !== 'active' && task.status !== 'offered' && !completed) return <StretchSummary task={task} />
  return (
    <div className={completed ? 'motion-notice-enter' : undefined}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Stretch Quest</p>
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
              {isStrength ? 'e1RM is estimated performance, not the literal load to put on the bar. Any valid high-confidence weight × rep combination can count.' : 'Measured from one qualifying working set saved in Training.'}
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
                <Link to={prefixedPath(prefix, task.actionHref ?? '/training')} className={primaryButtonClass}>Open Training</Link>
                <button type="button" className={quietButtonClass} disabled={actions.pending} onClick={() => actions.onEnd(task)}>End quest</button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}

function StretchSummary({ task }: { task: CoachTaskView }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Stretch Quest</p>
      <p className="mt-1 text-sm font-medium text-zinc-900">{task.status === 'completed' ? '✓ Stretch conquered' : resolvedCopy(task)}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{task.title}</p>
      {task.status === 'completed' ? <p className="mt-1 text-xs text-zinc-500">Achieved {formatStretchValue(task, task.progress?.current ?? null)} · Target {formatStretchValue(task, task.targetValue)} · Verified by Training</p> : null}
    </div>
  )
}

export function CoachInbox({ state, onClose, actions, error }: { state: CoachState; onClose: () => void; actions: CoachActions; error?: string | null }) {
  const rows = [state.stretchQuest, state.dailyQuest, state.weeklyFocus].filter((task): task is CoachTaskView => task != null)
  return (
    <div className="motion-scrim-enter fixed inset-0 z-50 flex items-end bg-black/30 sm:items-center sm:justify-center" role="presentation">
      <section className="motion-panel-enter max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-md sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="Coach inbox">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Coach</h2>
          <button type="button" className={quietButtonClass} onClick={onClose}>Close</button>
        </div>
        {error ? <p className="mt-3 text-sm text-red-700" role="alert">{error}</p> : null}
        <ul className="mt-4 divide-y divide-zinc-200">
          {rows.map((task) => (
            <li key={task.id} className="py-3" aria-label={task.taskKind === 'stretch_quest' ? 'Stretch Quest' : task.taskKind === 'daily_quest' ? 'Today' : 'This week'}>
              <CoachTaskContent task={task} actions={actions} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
function CoachLogSheet({
  task,
  onClose,
  onSaved,
}: {
  task: CoachTaskView
  onClose: () => void
  onSaved: (state: CoachState) => void
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
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 sm:items-center sm:justify-center" role="presentation">
      <section className="w-full rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-md sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="Log Coach quest">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Log it</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">{task.title}</h2>
          </div>
          <button type="button" className={quietButtonClass} onClick={onClose}>Close</button>
        </div>

        <div className="mt-4 space-y-4">
          {task.actionKind === 'log_training' ? (
            <label className="block">
              <span className="text-sm font-medium text-zinc-800">
                {task.targetUnit === 'reps' ? 'Reps completed' : 'Minutes completed'}
              </span>
              <input
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
      </section>
    </div>
  )
}
