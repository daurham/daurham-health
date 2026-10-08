import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { compactRoutineSequence, expandRoutineBlocks, type TrainingDayIntent, type TrainingPlanView } from '@/domain/training-plan'
import type { WorkoutTemplate } from '@/domain/training'
import { primaryButtonClass, quietButtonClass, secondaryButtonClass } from '@/lib'
import {
  clearTrainingDayOverride,
  fetchTemplates,
  fetchTrainingPlan,
  movePlannedTrainingDay,
  saveTrainingPlan,
  setTrainingDayOverride,
} from './api'

const WEEKDAYS = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
] as const

function intentLabel(intent: TrainingDayIntent): string {
  switch (intent) {
    case 'training_preferred':
      return 'Training'
    case 'training_moved_here':
      return 'Training · moved here'
    case 'training_moved_away':
      return 'Workout rescheduled'
    case 'active_recovery':
      return 'Open day'
    case 'flexible':
      return 'Open day'
    case 'paused_or_away':
      return 'Away / paused'
    default:
      return 'Open day'
  }
}

function displayDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(Date.UTC(year!, (month ?? 1) - 1, day)))
}

export function TrainingPlanPage() {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [plan, setPlan] = useState<TrainingPlanView | null>(null)
  const [frequency, setFrequency] = useState(3)
  const [preferredWeekdays, setPreferredWeekdays] = useState<number[]>([1, 3, 5])
  const [sequence, setSequence] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [addRoutineCode, setAddRoutineCode] = useState('')
  const [moveFrom, setMoveFrom] = useState('')
  const [moveTo, setMoveTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function applyPlan(next: TrainingPlanView, availableTemplates: WorkoutTemplate[]) {
    setPlan(next)
    if (next.baseline) {
      setFrequency(next.baseline.weeklyFrequencyTarget)
      setPreferredWeekdays(next.baseline.preferredWeekdays)
      setSequence(next.baseline.sequence.map((item) => item.routineCode))
      setNote(next.baseline.note ?? '')
    } else if (availableTemplates.length > 0) {
      setSequence((current) => current.length > 0 ? current : [availableTemplates[0]!.routineCode])
    }
  }

  useEffect(() => {
    let cancelled = false
    Promise.all([fetchTemplates(), fetchTrainingPlan()])
      .then(([nextTemplates, nextPlan]) => {
        if (!cancelled) {
          setTemplates(nextTemplates)
          applyPlan(nextPlan, nextTemplates)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load Training Plan')
      })
    return () => {
      cancelled = true
    }
  }, [])

  const templateByRoutine = useMemo(
    () => new Map(templates.map((template) => [template.routineCode, template] as const)),
    [templates],
  )
  const blocks = compactRoutineSequence(sequence)
  const addable = templates.filter((template) => !sequence.includes(template.routineCode))
  const movableSources = plan?.week.filter((day) =>
    ['training_preferred', 'training_moved_here'].includes(day.effectiveIntent),
  ) ?? []

  function toggleWeekday(day: number) {
    setPreferredWeekdays((current) =>
      current.includes(day)
        ? current.filter((item) => item !== day)
        : [...current, day].sort((a, b) => a - b),
    )
  }

  function moveSequence(index: number, offset: -1 | 1) {
    setSequence((current) => {
      const next = compactRoutineSequence(current)
      const target = index + offset
      if (target < 0 || target >= next.length) return current
      const [item] = next.splice(index, 1)
      if (!item) return current
      next.splice(target, 0, item)
      return expandRoutineBlocks(next)
    })
  }

  async function saveBaseline() {
    setBusy(true)
    setError(null)
    try {
      if (sequence.length === 0) throw new Error('Add at least one routine to the sequence.')
      if (preferredWeekdays.length === 0) throw new Error('Choose at least one preferred Training day.')
      const next = await saveTrainingPlan({
        weeklyFrequencyTarget: frequency,
        defaultNonTrainingIntent: 'flexible',
        preferredWeekdays,
        sequenceRoutineCodes: sequence,
        note,
      })
      applyPlan(next, templates)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save Training Plan')
    } finally {
      setBusy(false)
    }
  }

  async function override(date: string, intentKind: 'training_preferred' | 'rest' | 'active_recovery' | 'flexible' | 'paused_or_away') {
    setBusy(true)
    setError(null)
    try {
      const next = await setTrainingDayOverride(date, { intentKind, note: null })
      applyPlan(next, templates)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not adjust this week')
    } finally {
      setBusy(false)
    }
  }

  async function resetOverride(date: string) {
    setBusy(true)
    setError(null)
    try {
      const next = await clearTrainingDayOverride(date)
      applyPlan(next, templates)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reset this day')
    } finally {
      setBusy(false)
    }
  }

  async function moveDay() {
    if (!moveFrom || !moveTo) return
    setBusy(true)
    setError(null)
    try {
      const next = await movePlannedTrainingDay({ fromDate: moveFrom, toDate: moveTo })
      applyPlan(next, templates)
      setMoveFrom('')
      setMoveTo('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move Training day')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm text-zinc-500">
          <Link to="/training" className="hover:underline">Training</Link>
          {' / '}
          Plan
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Training Plan</h1>
        <p className="mt-1 max-w-2xl text-sm text-zinc-600">
          Set your routine rotation and the days you prefer to train. Other days are open, not compulsory rest or recovery days.
        </p>
      </div>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}

      <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
        <div>
          <h2 className="font-semibold">Baseline plan</h2>
          <p className="mt-1 text-sm text-zinc-500">Edits create a new effective version; old plan versions remain available to historical analysis.</p>
        </div>

        <label className="block text-sm font-medium text-zinc-700">
          Weekly programmed-session target
          <input
            type="number"
            min="1"
            max="7"
            value={frequency}
            onChange={(event) => setFrequency(Number(event.target.value))}
            className="mt-1 min-h-11 w-28 rounded-md border border-zinc-300 px-3 text-base"
          />
        </label>

        <fieldset>
          <legend className="text-sm font-medium text-zinc-700">Preferred weekdays</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => {
              const selected = preferredWeekdays.includes(day.value)
              return (
                <button
                  key={day.value}
                  type="button"
                  aria-pressed={selected}
                  className={`${selected ? primaryButtonClass : secondaryButtonClass} !w-auto min-w-12 flex-none px-3`}
                  onClick={() => toggleWeekday(day.value)}
                >
                  {day.label}
                </button>
              )
            })}
          </div>
        </fieldset>

        <p className="text-sm text-zinc-600">Non-training days are open by default. Rest and recovery are tracked when they happen.</p>

        <div>
          <p className="text-sm font-medium text-zinc-700">Routine rotation</p>
          <p className="mt-1 text-xs text-zinc-500">Set how many times to complete each routine before switching. For six A, six B, six C, choose 6 for each.</p>
          <div className="mt-2 space-y-2">
            {blocks.map(({ routineCode, count }, index) => {
              const template = templateByRoutine.get(routineCode)
              const label = template?.name ?? routineCode + ' (inactive)'
              return (
                <div key={routineCode} className="flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2">
                  <span className="w-6 text-xs font-semibold text-zinc-500">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{label}</span>
                  <label className="flex shrink-0 items-center gap-1 text-xs text-zinc-600">
                    Times
                    <input type="number" min={1} max={12} value={count} aria-label={`Sessions of ${label}`} className="min-h-11 w-14 rounded-md border border-zinc-300 bg-white px-2 text-center text-base" onChange={(event) => {
                      const count = Math.max(1, Math.min(12, Math.floor(Number(event.target.value) || 1)))
                      setSequence((current) => expandRoutineBlocks(compactRoutineSequence(current).map((block, i) => i === index ? { ...block, count } : block)))
                    }} />
                  </label>
                  <button type="button" className={quietButtonClass} disabled={index === 0} onClick={() => moveSequence(index, -1)}>↑</button>
                  <button type="button" className={quietButtonClass} disabled={index === blocks.length - 1} onClick={() => moveSequence(index, 1)}>↓</button>
                  <button type="button" className={quietButtonClass} onClick={() => setSequence((current) => current.filter((item) => item !== routineCode))}>Remove</button>
                </div>
              )
            })}
          </div>
          {addable.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={addRoutineCode}
                onChange={(event) => setAddRoutineCode(event.target.value)}
                className="min-h-11 min-w-56 rounded-md border border-zinc-300 bg-white px-3 text-base"
              >
                <option value="">Choose routine…</option>
                {addable.map((template) => (
                  <option key={template.id} value={template.routineCode}>{template.name}</option>
                ))}
              </select>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={!addRoutineCode}
                onClick={() => {
                  if (!addRoutineCode) return
                  setSequence((current) => [...current, addRoutineCode])
                  setAddRoutineCode('')
                }}
              >
                Add
              </button>
            </div>
          ) : null}
        </div>

        <label className="block text-sm font-medium text-zinc-700">
          Plan note <span className="font-normal text-zinc-500">(optional)</span>
          <textarea
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            className="mt-1 min-h-20 w-full rounded-md border border-zinc-300 px-3 py-2 text-base"
          />
        </label>

        <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void saveBaseline()}>
          {busy ? 'Saving…' : plan?.configured ? 'Save new plan version' : 'Save plan'}
        </button>
      </section>

      {plan?.configured ? (
        <section className="space-y-4 rounded-lg border border-zinc-200 bg-white p-4">
          <div>
            <h2 className="font-semibold">Adjust this week</h2>
            <p className="mt-1 text-sm text-zinc-500">
              {plan.completedProgrammedSessions}/{plan.weeklyFrequencyTarget} programmed sessions completed. Overrides do not rewrite the baseline plan.
            </p>
          </div>

          <div className="space-y-2">
            {plan.week.map((day) => (
              <article key={day.date} className="rounded-md border border-zinc-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">{WEEKDAYS[day.weekday - 1]?.label} · {displayDate(day.date)}</p>
                    <p className="text-sm text-zinc-600">{intentLabel(day.effectiveIntent)}</p>
                    {day.linkedDate ? <p className="text-xs text-zinc-500">Linked with {displayDate(day.linkedDate)}</p> : null}
                  </div>
                  <div className="flex max-w-full flex-wrap items-center gap-2">
                    <button type="button" className={`${secondaryButtonClass} !w-auto px-3`} disabled={busy} onClick={() => void override(day.date, 'training_preferred')}>Plan workout</button>
                    <button type="button" className={`${secondaryButtonClass} !w-auto px-3`} disabled={busy} onClick={() => void override(day.date, 'flexible')}>Keep open</button>
                    <button type="button" className={`${secondaryButtonClass} !w-auto px-3`} disabled={busy} onClick={() => void override(day.date, 'paused_or_away')}>Away</button>
                    {day.overrideIntent ? <button type="button" className={`${secondaryButtonClass} !w-auto px-3`} disabled={busy} onClick={() => void resetOverride(day.date)}>Reset</button> : null}
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="border-t border-zinc-100 pt-4">
            <h3 className="text-sm font-semibold text-zinc-800">Move a planned session</h3>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="text-sm text-zinc-700">
                From
                <select value={moveFrom} onChange={(event) => setMoveFrom(event.target.value)} className="mt-1 block min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-base">
                  <option value="">Choose day…</option>
                  {movableSources.map((day) => <option key={day.date} value={day.date}>{WEEKDAYS[day.weekday - 1]?.label} · {displayDate(day.date)}</option>)}
                </select>
              </label>
              <label className="text-sm text-zinc-700">
                To
                <select value={moveTo} onChange={(event) => setMoveTo(event.target.value)} className="mt-1 block min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-base">
                  <option value="">Choose day…</option>
                  {plan.week
                    .filter(
                      (day) =>
                        day.date !== moveFrom &&
                        !['training_preferred', 'training_moved_here'].includes(day.effectiveIntent),
                    )
                    .map((day) => (
                      <option key={day.date} value={day.date}>
                        {WEEKDAYS[day.weekday - 1]?.label} · {displayDate(day.date)}
                      </option>
                    ))}
                </select>
              </label>
              <button type="button" className={secondaryButtonClass} disabled={busy || !moveFrom || !moveTo} onClick={() => void moveDay()}>
                Move
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <p className="text-xs leading-5 text-zinc-500">
        Daily Context records what happened, while this plan only captures your preferences and routine rotation.
      </p>
    </section>
  )
}
