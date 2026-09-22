import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { trailingPeriod } from '@/domain/progress'
import { utcCalendarDateFromNow } from '@/domain/progress/dates'
import type {
  CompareExercise,
  MetricResult,
  NutritionPeriodSummary,
  ProgressCompare,
  ProgressCheckpoint,
} from '@/domain/progress'
import { cn } from '@/lib'
import { formatGrams, formatKcal } from '@/features/nutrition/format'
import {
  createProgressCheckpoint,
  deleteProgressCheckpoint,
  fetchProgressCheckpoints,
  fetchProgressCompare,
  updateProgressCheckpoint,
} from './api'
import type { EvidenceTopic } from './EvidencePanel'
import {
  formatBodyCanonical,
  formatCalendarDate,
  formatCoverageDays,
  formatPercent,
  formatPerformed,
  formatTargetDifference,
} from './format'

function metricNumber(result: MetricResult<{ value: number }>): string {
  if (result.status !== 'available') {
    return '—'
  }
  return result.value.value.toLocaleString('en-US', { maximumFractionDigits: 1 })
}

function defaultCompareParams(asOf: string): { startA: string; endA: string; startB: string; endB: string } {
  const current = trailingPeriod('30d', asOf)
  return {
    startA: current.comparisonStart ?? current.start,
    endA: current.comparisonEnd ?? current.start,
    startB: current.start,
    endB: current.end,
  }
}

export function CompareSection({ onEvidence }: { onEvidence: (topic: EvidenceTopic) => void }) {
  const [params, setParams] = useSearchParams()
  const asOf = utcCalendarDateFromNow(new Date())
  const defaults = useMemo(() => defaultCompareParams(asOf), [asOf])
  const checkpointId = params.get('checkpoint')
  const startA = params.get('startA') ?? defaults.startA
  const endA = params.get('endA') ?? defaults.endA
  const startB = params.get('startB') ?? defaults.startB
  const endB = params.get('endB') ?? defaults.endB
  const [compare, setCompare] = useState<ProgressCompare | null>(null)
  const [checkpoints, setCheckpoints] = useState<ProgressCheckpoint[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchProgressCheckpoints()
      .then(setCheckpoints)
      .catch(() => setCheckpoints([]))
  }, [])

  useEffect(() => {
    const query = new URLSearchParams()
    if (checkpointId) {
      query.set('checkpointId', checkpointId)
      query.set('asOf', asOf)
    } else {
      query.set('startA', startA)
      query.set('endA', endA)
      query.set('startB', startB)
      query.set('endB', endB)
    }
    let cancelled = false
    setStatus('loading')
    setError(null)
    fetchProgressCompare(query)
      .then((next) => {
        if (!cancelled) {
          setCompare(next)
          setStatus('ready')
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setCompare(null)
          setStatus('error')
          setError(caught instanceof Error ? caught.message : 'Could not compare periods')
        }
      })
    return () => {
      cancelled = true
    }
  }, [asOf, checkpointId, startA, endA, startB, endB])

  function setRangeField(name: 'startA' | 'endA' | 'startB' | 'endB', value: string) {
    const copy = new URLSearchParams(params)
    copy.delete('checkpoint')
    copy.set(name, value)
    copy.set('startA', name === 'startA' ? value : startA)
    copy.set('endA', name === 'endA' ? value : endA)
    copy.set('startB', name === 'startB' ? value : startB)
    copy.set('endB', name === 'endB' ? value : endB)
    setParams(copy, { replace: true })
  }

  function setCheckpoint(id: string) {
    const copy = new URLSearchParams(params)
    if (id) {
      copy.set('checkpoint', id)
    } else {
      copy.delete('checkpoint')
    }
    setParams(copy, { replace: true })
  }

  async function refreshCheckpoints(selectId?: string) {
    const next = await fetchProgressCheckpoints()
    setCheckpoints(next)
    if (selectId) {
      setCheckpoint(selectId)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Compare</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Factual differences between two recorded periods, or since a checkpoint you created.
        </p>
      </div>

      <div className="rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Period A</legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="date"
                aria-label="Period A start"
                value={startA}
                onChange={(event) => setRangeField('startA', event.target.value)}
                className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
              />
              <input
                type="date"
                aria-label="Period A end"
                value={endA}
                onChange={(event) => setRangeField('endA', event.target.value)}
                className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Period B</legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="date"
                aria-label="Period B start"
                value={startB}
                onChange={(event) => setRangeField('startB', event.target.value)}
                className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
              />
              <input
                type="date"
                aria-label="Period B end"
                value={endB}
                onChange={(event) => setRangeField('endB', event.target.value)}
                className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
              />
            </div>
          </fieldset>
        </div>
        <label className="mt-4 block text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Since checkpoint</span>
          <select
            className="mt-2 min-h-10 w-full rounded-md border border-zinc-300 px-3 text-sm md:max-w-sm"
            value={checkpointId ?? ''}
            onChange={(event) => setCheckpoint(event.target.value)}
            aria-label="Since checkpoint"
          >
            <option value="">Compare explicit periods</option>
            {checkpoints.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {formatCalendarDate(item.checkpointDate)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <CheckpointManager
        checkpoints={checkpoints}
        onChange={(id) => void refreshCheckpoints(id)}
        onDeleted={(id) => {
          if (checkpointId === id) {
            setCheckpoint('')
          }
          void refreshCheckpoints()
        }}
      />

      {status === 'loading' ? <div className="h-32 animate-pulse rounded-lg bg-zinc-200" aria-busy="true" /> : null}
      {status === 'error' ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error ?? 'Compare is unavailable.'}
        </p>
      ) : null}
      {status === 'ready' && compare ? <CompareResults compare={compare} onEvidence={onEvidence} /> : null}
    </div>
  )
}

function CheckpointManager({
  checkpoints,
  onChange,
  onDeleted,
}: {
  checkpoints: ProgressCheckpoint[]
  onChange: (id?: string) => void
  onDeleted: (id: string) => void
}) {
  const [label, setLabel] = useState('')
  const [date, setDate] = useState(utcCalendarDateFromNow(new Date()))
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  async function onCreate(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      const created = await createProgressCheckpoint({
        checkpointDate: date,
        label,
        notes: notes.trim() === '' ? null : notes,
      })
      setLabel('')
      setNotes('')
      onChange(created.id)
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : 'Could not save checkpoint')
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
      <h3 className="text-sm font-semibold tracking-tight">Checkpoints</h3>
      <p className="mt-1 text-sm text-zinc-600">User annotations. Deleting one does not change training or body history.</p>
      <form onSubmit={(event) => void onCreate(event)} className="mt-3 grid gap-2 md:grid-cols-[8rem_1fr_auto]">
        <input
          type="date"
          required
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
          aria-label="Checkpoint date"
        />
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Started current program"
          className="min-h-10 rounded-md border border-zinc-300 px-3 text-sm"
          aria-label="Checkpoint label"
        />
        <button type="submit" className="min-h-10 rounded-md bg-zinc-900 px-3 text-sm font-medium text-white">
          Create checkpoint
        </button>
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Optional notes"
          className="min-h-16 rounded-md border border-zinc-300 px-3 py-2 text-sm md:col-span-3"
          aria-label="Checkpoint notes"
        />
      </form>
      {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
      {checkpoints.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-600">No checkpoints yet.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {checkpoints.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-zinc-200 px-3 py-2">
              {editing === item.id ? (
                <CheckpointEdit
                  checkpoint={item}
                  onCancel={() => setEditing(null)}
                  onSaved={() => {
                    setEditing(null)
                    onChange()
                  }}
                />
              ) : (
                <>
                  <div>
                    <p className="font-medium">{item.label}</p>
                    <p className="text-sm text-zinc-600">{formatCalendarDate(item.checkpointDate)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="min-h-9 rounded-md px-3 text-sm text-zinc-700 hover:bg-zinc-100"
                      onClick={() => setEditing(item.id)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="min-h-9 rounded-md px-3 text-sm text-red-700 hover:bg-red-50"
                      onClick={() => {
                        if (window.confirm(`Delete “${item.label}”? Training and body records are not affected.`)) {
                          void deleteProgressCheckpoint(item.id)
                            .then(() => onDeleted(item.id))
                            .catch((caught: unknown) => {
                              setError(caught instanceof Error ? caught.message : 'Could not delete checkpoint')
                            })
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function CheckpointEdit({
  checkpoint,
  onCancel,
  onSaved,
}: {
  checkpoint: ProgressCheckpoint
  onCancel: () => void
  onSaved: () => void
}) {
  const [label, setLabel] = useState(checkpoint.label)
  const [date, setDate] = useState(checkpoint.checkpointDate)
  const [notes, setNotes] = useState(checkpoint.notes ?? '')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="flex w-full flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void updateProgressCheckpoint(checkpoint.id, {
          label,
          checkpointDate: date,
          notes: notes.trim() === '' ? null : notes,
        })
          .then(onSaved)
          .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not update'))
      }}
    >
      <div className="flex flex-wrap gap-2">
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="min-h-9 rounded-md border border-zinc-300 px-2 text-sm" />
        <input value={label} onChange={(event) => setLabel(event.target.value)} className="min-h-9 min-w-40 flex-1 rounded-md border border-zinc-300 px-2 text-sm" />
        <button type="submit" className="min-h-9 rounded-md bg-zinc-900 px-3 text-sm text-white">
          Save
        </button>
        <button type="button" className="min-h-9 rounded-md px-3 text-sm" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <input value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-9 rounded-md border border-zinc-300 px-2 text-sm" placeholder="Notes" />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  )
}

function CompareResults({
  compare,
  onEvidence,
}: {
  compare: ProgressCompare
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const since = compare.mode === 'since_checkpoint'
  const left = since ? 'Baseline' : 'Period A'
  const right = since ? 'Now' : 'Period B'
  const weightA = since ? compare.body.weight.aStart : compare.body.weight.aEnd
  const weightB = since ? compare.body.weight.bEnd : compare.body.weight.bEnd
  const showWeight = weightA != null || weightB != null
  const showWorkouts = compare.training.workoutCount.a.status === 'available' || compare.training.workoutCount.b.status === 'available'
  const showWeeklyRate =
    compare.training.workoutsPerWeek.a.status === 'available' ||
    compare.training.workoutsPerWeek.b.status === 'available'
  const rows = [
    showWeight
      ? {
          label: 'Weight',
          a: weightA ? formatBodyCanonical(weightA.unit, weightA.value) : '—',
          b: weightB ? formatBodyCanonical(weightB.unit, weightB.value) : '—',
        }
      : null,
    showWorkouts
      ? {
          label: 'Workouts',
          a: metricNumber(compare.training.workoutCount.a),
          b: metricNumber(compare.training.workoutCount.b),
        }
      : null,
    showWeeklyRate
      ? {
          label: 'Workouts/week',
          a: metricNumber(compare.training.workoutsPerWeek.a),
          b: metricNumber(compare.training.workoutsPerWeek.b),
        }
      : null,
    {
      label: 'Performance bests',
      a: metricNumber(compare.training.performanceBestCount.a),
      b: metricNumber(compare.training.performanceBestCount.b),
    },
  ].filter((row): row is { label: string; a: string; b: string } => row != null)

  return (
    <div className="space-y-5">
      {since && compare.checkpoint ? (
        <p className="text-sm text-zinc-600">
          Since <span className="font-medium text-zinc-900">{compare.checkpoint.label}</span>
          {' · '}
          {formatCalendarDate(compare.checkpoint.checkpointDate)}
        </p>
      ) : (
        <p className="text-sm text-zinc-600">
          {formatCalendarDate(compare.periodA.start)}–{formatCalendarDate(compare.periodA.end)} vs {formatCalendarDate(compare.periodB.start)}–{formatCalendarDate(compare.periodB.end)}
        </p>
      )}

      <section className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="hidden min-w-full text-sm md:table">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2 font-semibold" />
              <th className="px-3 py-2 font-semibold">{left}</th>
              <th className="px-3 py-2 font-semibold">{right}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-zinc-100">
                <td className="px-3 py-2 text-zinc-600">{row.label}</td>
                <td className="px-3 py-2 font-medium">{row.a}</td>
                <td className="px-3 py-2 font-medium">{row.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-3 p-3 md:hidden">
          {rows.map((row) => (
            <div key={row.label}>
              <p className="text-xs uppercase tracking-wide text-zinc-500">{row.label}</p>
              <p className="mt-1 text-sm">
                <span className="text-zinc-500">{left}: </span>
                {row.a}
                <span className="mx-2 text-zinc-300">·</span>
                <span className="text-zinc-500">{right}: </span>
                {row.b}
              </p>
            </div>
          ))}
        </div>
      </section>

      {compare.body.weight.change.status === 'available' && compare.body.weight.aEnd && compare.body.weight.bEnd ? (
        <p className="text-sm text-zinc-600">
          Weight {formatBodyCanonical(compare.body.weight.unit, compare.body.weight.change.value.absolute).replace(/^/, compare.body.weight.change.value.absolute > 0 ? '+' : '')}
        </p>
      ) : null}

      <NutritionCompareBlock compare={compare} left={left} right={right} onEvidence={onEvidence} />

      <section>
        <h3 className="text-sm font-semibold tracking-tight">Exercises</h3>
        {compare.exercises.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">Not enough recorded data in this period.</p>
        ) : (
          <>
            <div className="mt-2 hidden overflow-x-auto md:block">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
                    <th className="px-3 py-2 font-semibold">Exercise</th>
                    <th className="px-3 py-2 font-semibold">{left}</th>
                    <th className="px-3 py-2 font-semibold">{right}</th>
                    <th className="px-3 py-2 font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {compare.exercises.map((exercise) => (
                    <tr key={exercise.exerciseId} className="border-t border-zinc-100 align-top">
                      <td className="px-3 py-2 font-medium">{exercise.name}</td>
                      <td className="px-3 py-2">{performanceCopy(exercise.a.bestPerformed)}</td>
                      <td className="px-3 py-2">{performanceCopy(exercise.b.bestPerformed)}</td>
                      <td className="px-3 py-2">
                        <ExerciseChange exercise={exercise} onEvidence={onEvidence} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 space-y-2 md:hidden">
              {compare.exercises.map((exercise) => (
                <article key={exercise.exerciseId} className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
                  <p className="font-medium">{exercise.name}</p>
                  <p className="mt-2 text-sm text-zinc-600">
                    {left}: {performanceCopy(exercise.a.bestPerformed)}
                  </p>
                  <p className="text-sm text-zinc-600">
                    {right}: {performanceCopy(exercise.b.bestPerformed)}
                  </p>
                  <div className="mt-2">
                    <ExerciseChange exercise={exercise} onEvidence={onEvidence} />
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  )
}

function nutritionSideCopy(summary: NutritionPeriodSummary): {
  logged: string
  calories: string
  protein: string
  proteinObserved: string
} {
  return {
    logged: formatCoverageDays(summary.loggedDays, summary.calendarDays),
    calories:
      summary.calories.averageOnLoggedDays != null ? formatKcal(summary.calories.averageOnLoggedDays) : '—',
    protein:
      summary.protein.averageOnObservedDays != null
        ? (formatGrams(summary.protein.averageOnObservedDays) ?? 'Unavailable')
        : summary.loggedDays > 0
          ? 'Unavailable'
          : '—',
    proteinObserved:
      summary.protein.observedDays > 0 ? `${summary.protein.observedDays} days` : summary.loggedDays > 0 ? '0 observed' : '—',
  }
}

function NutritionCompareBlock({
  compare,
  left,
  right,
  onEvidence,
}: {
  compare: ProgressCompare
  left: string
  right: string
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const since = compare.mode === 'since_checkpoint'
  const a = nutritionSideCopy(compare.nutrition.a)
  const b = nutritionSideCopy(compare.nutrition.b)
  const shown = since ? compare.nutrition.b : null
  if (compare.nutrition.a.loggedDays === 0 && compare.nutrition.b.loggedDays === 0) {
    return null
  }

  const rows = [
    { label: 'Logged days', a: a.logged, b: b.logged },
    { label: 'Calories avg on logged days', a: a.calories, b: b.calories },
    { label: 'Protein avg on observed days', a: a.protein, b: b.protein },
    { label: 'Protein observed', a: a.proteinObserved, b: b.proteinObserved },
  ]

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight">Nutrition</h3>
        <button
          type="button"
          className="text-sm text-zinc-600 hover:text-zinc-900"
          onClick={() =>
            onEvidence({
              title: 'Nutrition compare',
              facts: [
                { label: `${left} logged`, value: a.logged },
                { label: `${right} logged`, value: b.logged },
                { label: `${left} calories avg`, value: a.calories },
                { label: `${right} calories avg`, value: b.calories },
              ],
              evidence: [
                ...compare.nutrition.a.evidence.dates.map((date) => ({ domain: 'nutrition' as const, date })),
                ...compare.nutrition.b.evidence.dates.map((date) => ({ domain: 'nutrition' as const, date })),
              ],
            })
          }
        >
          View evidence
        </button>
      </div>
      {compare.nutrition.coverageDiffers ? (
        <p className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          Nutrition coverage differs between these periods. Averages describe logged days only, not full-period intake.
        </p>
      ) : null}
      {since && shown ? (
        <div className="rounded-lg border border-zinc-200 bg-white px-3 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Since {compare.checkpoint?.label ?? 'checkpoint'}
          </p>
          <p className="mt-1 font-medium">{formatCoverageDays(shown.loggedDays, shown.calendarDays)} logged</p>
          {shown.calories.averageOnLoggedDays != null ? (
            <p className="mt-1 text-sm text-zinc-600">{formatKcal(shown.calories.averageOnLoggedDays)} avg on logged days</p>
          ) : null}
          {shown.protein.averageOnObservedDays != null ? (
            <p className="text-sm text-zinc-600">
              {formatGrams(shown.protein.averageOnObservedDays)} protein avg across {shown.protein.observedDays} observed
              day{shown.protein.observedDays === 1 ? '' : 's'}
            </p>
          ) : shown.loggedDays > 0 ? (
            <p className="text-sm text-zinc-600">Protein unavailable</p>
          ) : null}
          {shown.calories.targetContext ? (
            <p className="mt-1 text-sm text-zinc-600">
              Calories vs target {formatTargetDifference(shown.calories.targetContext.averageDifference, 'kcal')} avg
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
        <table className="hidden min-w-full text-sm md:table">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="px-3 py-2 font-semibold" />
              <th className="px-3 py-2 font-semibold">{left}</th>
              <th className="px-3 py-2 font-semibold">{right}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-zinc-100">
                <td className="px-3 py-2 text-zinc-600">{row.label}</td>
                <td className="px-3 py-2 font-medium">{row.a}</td>
                <td className="px-3 py-2 font-medium">{row.b}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="space-y-3 p-3 md:hidden">
          {rows.map((row) => (
            <div key={row.label}>
              <p className="text-xs uppercase tracking-wide text-zinc-500">{row.label}</p>
              <p className="mt-1 text-sm">
                <span className="text-zinc-500">{left}: </span>
                {row.a}
                <span className="mx-2 text-zinc-300">·</span>
                <span className="text-zinc-500">{right}: </span>
                {row.b}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function performanceCopy(value: CompareExercise['a']['bestPerformed']): string {
  if (!value) {
    return '—'
  }
  return formatPerformed(value)
}

function ExerciseChange({
  exercise,
  onEvidence,
}: {
  exercise: CompareExercise
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const facts: EvidenceTopic['facts'] = []
  if (exercise.a.bestPerformed) {
    facts.push({ label: 'Baseline', value: `${formatCalendarDate(exercise.a.bestPerformed.date)} · ${formatPerformed(exercise.a.bestPerformed)}` })
  }
  if (exercise.b.bestPerformed) {
    facts.push({ label: 'Current', value: `${formatCalendarDate(exercise.b.bestPerformed.date)} · ${formatPerformed(exercise.b.bestPerformed)}` })
  }
  const actions = [
    exercise.a.bestPerformed ? { label: 'View baseline workout', to: `/training/${exercise.a.bestPerformed.sessionId}` } : null,
    exercise.b.bestPerformed ? { label: 'View current workout', to: `/training/${exercise.b.bestPerformed.sessionId}` } : null,
  ].filter((item): item is { label: string; to: string } => item != null)
  const change =
    exercise.performanceType === 'timed'
      ? exercise.timedChange === 'heavier_equal_duration'
        ? 'Heavier load at equal duration'
        : exercise.timedChange === 'longer_equal_load'
          ? 'Longer duration at equal load'
          : null
      : exercise.estimatedStrengthChangePercent != null
        ? `Estimated strength ${formatPercent(exercise.estimatedStrengthChangePercent)}`
        : null
  return (
    <div>
      <p className={cn('text-sm', change ? 'text-zinc-800' : 'text-zinc-500')}>{change ?? '—'}</p>
      {facts.length > 0 ? (
        <button
          type="button"
          className="mt-1 text-sm font-medium text-zinc-700 underline"
          onClick={() =>
            onEvidence({
              title: exercise.name,
              facts,
              evidence: exercise.evidence,
              actions,
            })
          }
        >
          View evidence
        </button>
      ) : null}
    </div>
  )
}
