import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { CoachState, CoachTaskView } from '@/domain/coach'
import { primaryButtonClass, quietButtonClass } from '@/lib'
import { prefixedPath, useAppPathPrefix } from '@/lib/app-prefix'
import {
  logCoachSelfReport,
  logCoachTraining,
  passCoachTask,
} from './api'

function progressText(task: CoachTaskView): string | null {
  const progress = task.progress
  if (!progress) return null
  if (progress.label) {
    if (progress.target == null || progress.current == null) return progress.label
    if (progress.unit === 'steps') {
      return `${Math.round(progress.current).toLocaleString('en-US')} / ${Math.round(progress.target).toLocaleString('en-US')}`
    }
    if (progress.unit === 'g') {
      return `${Math.round(progress.current)} / ${Math.round(progress.target)} g`
    }
    if (progress.unit === 'sessions' || progress.unit === 'session') {
      return `${Math.round(progress.current)} / ${Math.round(progress.target)} ${progress.target === 1 ? 'session' : 'sessions'}`
    }
    return progress.label
  }
  return null
}

function verificationCopy(task: CoachTaskView): string {
  if (task.verificationMode === 'canonical') return 'Verified by Health'
  if (task.verificationMode === 'training_log') return 'Logs to Training'
  return 'Reported by you'
}

function resolvedCopy(task: CoachTaskView): string {
  if (task.status === 'completed') return task.evidenceLabel ?? 'Complete'
  if (task.status === 'passed') return task.taskKind === 'weekly_focus' ? 'Skipped this week' : 'Passed today'
  if (task.status === 'expired') return 'Expired'
  return ''
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
  const daily = state.dailyQuest
  const hasVisible = weekly != null || daily != null
  if (!hasVisible) return null

  async function pass(task: CoachTaskView) {
    setActionPending(true)
    setActionError(null)
    try {
      onState(await passCoachTask(task.id))
    } catch (caught) {
      setActionError(caught instanceof Error ? caught.message : 'Could not update Coach')
    } finally {
      setActionPending(false)
    }
  }

  return (
    <>
      <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
        <div className="flex items-center justify-between gap-3 px-4 pt-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Coach</h2>
          {state.activeCount > 1 ? (
            <button type="button" className={quietButtonClass} onClick={() => setInboxOpen(true)}>
              Coach · {state.activeCount}
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
                ) : (
                  <p className="mt-1 text-xs font-medium text-zinc-500">{resolvedCopy(weekly)}</p>
                )}
              </div>
              {weekly.status === 'active' ? (
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-zinc-500 hover:text-zinc-900"
                  disabled={actionPending}
                  onClick={() => void pass(weekly)}
                >
                  Not this week
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {daily ? (
          <div className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Today's quest</p>
            {daily.status === 'active' ? (
              <>
                <p className="mt-1 text-lg font-semibold tracking-tight text-zinc-900">{daily.title}</p>
                <p className="mt-1 text-sm text-zinc-600">{daily.detail}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500">
                  <span>{verificationCopy(daily)}</span>
                  {progressText(daily) ? <span>{progressText(daily)}</span> : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {daily.actionKind === 'open' && daily.actionHref ? (
                    <Link to={prefixedPath(prefix, daily.actionHref)} className={primaryButtonClass}>
                      Open
                    </Link>
                  ) : (
                    <button type="button" className={primaryButtonClass} onClick={() => setLogTask(daily)}>
                      Log it
                    </button>
                  )}
                  <button
                    type="button"
                    className={quietButtonClass}
                    disabled={actionPending}
                    onClick={() => void pass(daily)}
                  >
                    Pass
                  </button>
                </div>
              </>
            ) : (
              <div className="motion-notice mt-1 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {daily.status === 'completed' ? '✓ Quest complete' : resolvedCopy(daily)}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">{daily.title}</p>
                </div>
                {daily.status === 'completed' && daily.evidenceLabel ? (
                  <span className="shrink-0 text-xs text-zinc-500">{daily.evidenceLabel}</span>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
        {actionError ? <p className="px-4 pb-4 text-sm text-red-700">{actionError}</p> : null}
      </section>

      {inboxOpen ? (
        <CoachInbox state={state} onClose={() => setInboxOpen(false)} />
      ) : null}
      {logTask ? (
        <CoachLogSheet
          task={logTask}
          onClose={() => setLogTask(null)}
          onSaved={(next) => {
            setLogTask(null)
            onState(next)
          }}
        />
      ) : null}
    </>
  )
}

function CoachInbox({ state, onClose }: { state: CoachState; onClose: () => void }) {
  const rows = [state.dailyQuest, state.weeklyFocus].filter((task): task is CoachTaskView => task != null)
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/30 sm:items-center sm:justify-center" role="presentation">
      <section className="max-h-[80vh] w-full overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-md sm:rounded-2xl" role="dialog" aria-modal="true" aria-label="Coach inbox">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold tracking-tight">Coach</h2>
          <button type="button" className={quietButtonClass} onClick={onClose}>Close</button>
        </div>
        <ul className="mt-4 divide-y divide-zinc-200">
          {rows.map((task) => (
            <li key={task.id} className="py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                {task.taskKind === 'daily_quest' ? 'Today' : 'This week'}
              </p>
              <p className="mt-1 text-sm font-medium text-zinc-900">{task.title}</p>
              <p className="mt-1 text-sm text-zinc-600">
                {task.status === 'active' ? verificationCopy(task) : resolvedCopy(task)}
              </p>
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
