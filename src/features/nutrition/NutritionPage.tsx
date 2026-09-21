import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  NUTRITION_CONFIG,
  nutritionDayTotals,
  snapshotFromDefinition,
  type NutritionEntry,
  type NutritionFood,
  type PendingNutritionCapture,
} from '@/domain/nutrition'
import { cn } from '@/lib'
import {
  createNutritionEntry,
  deleteNutritionEntry,
  fetchNutritionDay,
  fetchNutritionFood,
  fetchNutritionLabelJobs,
  type NutritionDayPayload,
} from './api'
import { LabelCaptureSheet } from './LabelCapture'
import { formatNutritionDayLabel, parseNutritionDateParam, shiftNutritionDate, todayNutritionDate } from './date'
import {
  caloriesHeadline,
  formatGrams,
  formatKcal,
  formatQuantity,
  groupedEntries,
  nutrientText,
  overTargetDelta,
  progressRatio,
  proteinHeadline,
} from './format'
import { AddFoodSheet, EntryEditorSheet, FoodEditorSheet, TargetSheet } from './panels'

type Panel =
  | { kind: 'add' }
  | { kind: 'entry'; entry: NutritionEntry }
  | { kind: 'targets' }
  | { kind: 'food'; food: NutritionFood }
  | { kind: 'label'; jobId: string }

export function NutritionPage() {
  const [params, setParams] = useSearchParams()
  const date = parseNutritionDateParam(params.get('date'))
  const today = todayNutritionDate()
  const [day, setDay] = useState<NutritionDayPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [panel, setPanel] = useState<Panel | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [undo, setUndo] = useState<NutritionEntry | null>(null)
  const [captures, setCaptures] = useState<PendingNutritionCapture[]>([])

  useEffect(() => {
    if (params.get('date') !== date) {
      setParams({ date }, { replace: true })
    }
  }, [date, params, setParams])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchNutritionDay(date)
      .then((next) => {
        if (!cancelled) {
          setDay(next)
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setDay(null)
          setError(caught instanceof Error ? caught.message : 'Could not load nutrition')
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [date])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    async function loadCaptures() {
      try {
        const next = await fetchNutritionLabelJobs()
        if (cancelled) {
          return
        }
        setCaptures(next)
        if (next.some((job) => job.status === 'queued' || job.status === 'processing')) {
          timer = window.setTimeout(() => {
            void loadCaptures()
          }, 4000)
        }
      } catch {
        if (!cancelled) {
          setCaptures([])
        }
      }
    }

    void loadCaptures()
    return () => {
      cancelled = true
      if (timer) {
        window.clearTimeout(timer)
      }
    }
  }, [date, panel])

  function setDate(next: string) {
    setParams({ date: next }, { replace: true })
  }

  function replaceEntries(entries: NutritionEntry[], extra?: Partial<NutritionDayPayload>) {
    setDay((current) =>
      current
        ? {
            ...current,
            ...extra,
            entries,
            totals: nutritionDayTotals(entries),
          }
        : current,
    )
  }

  function prependRecent(food: NutritionFood) {
    setDay((current) => {
      if (!current) {
        return current
      }
      const recents = [food, ...current.quickAdd.recents.filter((item) => item.id !== food.id)].slice(0, 12)
      return { ...current, quickAdd: { ...current.quickAdd, recents } }
    })
  }

  async function quickLog(food: NutritionFood) {
    if (!day) {
      return
    }
    const snapshot = snapshotFromDefinition(
      {
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        servingGrams: food.servingGrams,
      },
      { quantity: 1 },
    )
    const optimisticId = `tmp-${crypto.randomUUID()}`
    const optimistic: NutritionEntry = {
      id: optimisticId,
      logDate: date,
      consumedAt: null,
      timezone: NUTRITION_CONFIG.calendarTimeZone,
      meal: null,
      foodId: food.id,
      foodName: food.name,
      brand: food.brand,
      servingQuantity: 1,
      servingUnit: food.servingUnit,
      grams: snapshot.grams,
      calories: snapshot.calories,
      protein: snapshot.protein,
      carbs: snapshot.carbs,
      fat: snapshot.fat,
      fiber: snapshot.fiber,
      sourceKind: 'manual',
      notes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    replaceEntries([...day.entries, optimistic])
    prependRecent(food)
    setNotice(null)
    try {
      const created = await createNutritionEntry({
        logDate: date,
        timezone: NUTRITION_CONFIG.calendarTimeZone,
        foodId: food.id,
        servingQuantity: 1,
      })
      setDay((current) => {
        if (!current) {
          return current
        }
        const entries = current.entries.map((entry) => (entry.id === optimisticId ? created : entry))
        return { ...current, entries, totals: nutritionDayTotals(entries) }
      })
    } catch (caught) {
      setDay((current) => {
        if (!current) {
          return current
        }
        const entries = current.entries.filter((entry) => entry.id !== optimisticId)
        return { ...current, entries, totals: nutritionDayTotals(entries) }
      })
      setError(caught instanceof Error ? caught.message : 'Quick log failed')
    }
  }

  async function onDeleted(entry: NutritionEntry) {
    setPanel(null)
    if (!day) {
      return
    }
    const previous = day.entries
    replaceEntries(day.entries.filter((item) => item.id !== entry.id))
    setUndo(entry)
    setNotice('Entry deleted')
    try {
      await deleteNutritionEntry(entry.id)
    } catch (caught) {
      replaceEntries(previous)
      setUndo(null)
      setError(caught instanceof Error ? caught.message : 'Could not delete entry')
    }
  }

  async function undoDelete() {
    if (!undo) {
      return
    }
    const restored = undo
    setUndo(null)
    setNotice(null)
    try {
      const created = await createNutritionEntry({
        logDate: restored.logDate,
        timezone: restored.timezone,
        meal: restored.meal,
        foodId: restored.foodId,
        foodName: restored.foodName,
        brand: restored.brand,
        servingQuantity: restored.servingQuantity,
        servingUnit: restored.servingUnit,
        grams: restored.grams,
        calories: restored.calories,
        protein: restored.protein,
        carbs: restored.carbs,
        fat: restored.fat,
        fiber: restored.fiber,
        notes: restored.notes,
        sourceKind: restored.sourceKind,
      })
      setDay((current) => {
        if (!current) {
          return current
        }
        const entries = [...current.entries, created]
        return { ...current, entries, totals: nutritionDayTotals(entries) }
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not undo delete')
    }
  }

  const targets = day?.targets ?? null
  const calorieOver = overTargetDelta(day?.totals.calories.value ?? null, targets?.caloriesTarget ?? null)
  const calorieRatio = progressRatio(day?.totals.calories.value ?? null, targets?.caloriesTarget ?? null)
  const groups = useMemo(() => groupedEntries(day?.entries ?? []), [day?.entries])

  return (
    <section className="space-y-4">
      <DayNav date={date} today={today} onDate={setDate} />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Nutrition</h1>
          <p className="mt-1 text-sm text-zinc-600 md:text-base">{formatNutritionDayLabel(date, today)}</p>
        </div>
        <button
          type="button"
          onClick={() => setPanel({ kind: 'add' })}
          className="hidden min-h-11 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white md:inline-flex"
        >
          Add food
        </button>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700">
          {notice}
          {undo ? (
            <button type="button" className="ml-3 underline" onClick={() => void undoDelete()}>
              Undo
            </button>
          ) : null}
        </p>
      ) : null}

      {captures.length > 0 ? (
        <PendingCapturesCard jobs={captures} onOpen={(jobId) => setPanel({ kind: 'label', jobId })} />
      ) : null}

      {loading && !day ? (
        <p className="text-sm text-zinc-600">Loading…</p>
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start">
          <aside className="space-y-4 md:order-2 md:sticky md:top-4">
            {day ? (
              <SummaryCard
                day={day}
                calorieRatio={calorieRatio}
                calorieOver={calorieOver}
                onSetTargets={() => setPanel({ kind: 'targets' })}
              />
            ) : null}
            {day ? (
              <QuickAddCard
                recents={day.quickAdd.recents}
                staples={day.quickAdd.staples}
                onAdd={() => setPanel({ kind: 'add' })}
                onQuickLog={(food) => void quickLog(food)}
              />
            ) : null}
          </aside>
          <div className="space-y-4 md:order-1">
            <EntryList groups={groups} empty={!day || day.entries.length === 0} onAdd={() => setPanel({ kind: 'add' })} onOpen={(entry) => setPanel({ kind: 'entry', entry })} />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setPanel({ kind: 'add' })}
        className="fixed right-4 z-30 inline-flex min-h-12 min-w-12 items-center justify-center rounded-full bg-zinc-900 px-5 text-sm font-medium text-white shadow-lg md:hidden"
        style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
      >
        Add food
      </button>

      {panel?.kind === 'add' && day ? (
        <AddFoodSheet
          date={date}
          quickAdd={day.quickAdd}
          onClose={() => setPanel(null)}
          onLogged={(entry, food) => {
            setDay((current) => {
              if (!current) {
                return current
              }
              const entries = [...current.entries.filter((item) => item.id !== entry.id), entry]
              const next = { ...current, entries, totals: nutritionDayTotals(entries) }
              return next
            })
            if (food) {
              prependRecent(food)
            }
            setPanel(null)
          }}
          onQuickLog={(food) => {
            setPanel(null)
            void quickLog(food)
          }}
          onOpenFood={(food) => setPanel({ kind: 'food', food })}
        />
      ) : null}
      {panel?.kind === 'entry' ? (
        <EntryEditorSheet
          entry={panel.entry}
          onClose={() => setPanel(null)}
          onSaved={(entry) => {
            setDay((current) => {
              if (!current) {
                return current
              }
              const entries = current.entries.map((item) => (item.id === entry.id ? entry : item))
              return { ...current, entries, totals: nutritionDayTotals(entries) }
            })
          }}
          onDeleted={(entry) => void onDeleted(entry)}
          onEditFood={(foodId) => {
            void fetchNutritionFood(foodId)
              .then((food) => setPanel({ kind: 'food', food }))
              .catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : 'Could not load food')
              })
          }}
        />
      ) : null}
      {panel?.kind === 'targets' ? (
        <TargetSheet
          date={date}
          onClose={() => setPanel(null)}
          onSaved={() => {
            void fetchNutritionDay(date).then(setDay)
          }}
        />
      ) : null}
      {panel?.kind === 'food' ? (
        <FoodEditorSheet
          food={panel.food}
          onClose={() => setPanel(null)}
          onSaved={(food) => {
            setDay((current) => {
              if (!current) {
                return current
              }
              const replace = (list: NutritionFood[]) => list.map((item) => (item.id === food.id ? food : item))
              return {
                ...current,
                quickAdd: {
                  recents: replace(current.quickAdd.recents),
                  staples: food.isStaple
                    ? [food, ...current.quickAdd.staples.filter((item) => item.id !== food.id)]
                    : current.quickAdd.staples.filter((item) => item.id !== food.id),
                  recipes: replace(current.quickAdd.recipes),
                },
              }
            })
          }}
        />
      ) : null}
      {panel?.kind === 'label' ? (
        <LabelCaptureSheet
          date={date}
          jobId={panel.jobId}
          onClose={() => setPanel(null)}
          onBack={() => setPanel(null)}
          onLogged={(entry, food) => {
            setDay((current) => {
              if (!current) {
                return current
              }
              const entries = [...current.entries.filter((item) => item.id !== entry.id), entry]
              return { ...current, entries, totals: nutritionDayTotals(entries) }
            })
            prependRecent(food)
            setCaptures((current) => current.filter((job) => job.id !== panel.jobId))
            setPanel(null)
          }}
        />
      ) : null}
    </section>
  )
}

function PendingCapturesCard({
  jobs,
  onOpen,
}: {
  jobs: PendingNutritionCapture[]
  onOpen: (jobId: string) => void
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <h2 className="text-sm font-semibold">Pending captures</h2>
      <ul className="mt-1">
        {jobs.map((job) => (
          <li key={job.id}>
            <button
              type="button"
              onClick={() => onOpen(job.id)}
              className="flex min-h-11 w-full items-center justify-between gap-2 text-left text-sm"
            >
              <span className="truncate">Label photo</span>
              <span className="shrink-0 text-zinc-500">
                {job.status === 'completed' ? 'Ready to review' : job.status === 'failed' ? 'Failed' : 'Analyzing...'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function DayNav({ date, today, onDate }: { date: string; today: string; onDate: (date: string) => void }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50/95 px-4 py-2 backdrop-blur">
      <button
        type="button"
        aria-label="Previous day"
        className="min-h-11 min-w-11 rounded-md text-lg text-zinc-700 hover:bg-zinc-100"
        onClick={() => onDate(shiftNutritionDate(date, -1))}
      >
        ‹
      </button>
      <label className="flex min-w-0 flex-1 flex-col items-center">
        <span className="text-sm font-medium">{formatNutritionDayLabel(date, today)}</span>
        <input
          type="date"
          aria-label="Nutrition date"
          className="mt-0.5 w-full max-w-40 rounded-md border border-zinc-300 bg-white px-2 py-1 text-center text-sm"
          value={date}
          onChange={(event) => {
            if (event.target.value) {
              onDate(event.target.value)
            }
          }}
        />
      </label>
      <button
        type="button"
        aria-label="Next day"
        className="min-h-11 min-w-11 rounded-md text-lg text-zinc-700 hover:bg-zinc-100"
        onClick={() => onDate(shiftNutritionDate(date, 1))}
      >
        ›
      </button>
    </div>
  )
}

function SummaryCard({
  day,
  calorieRatio,
  calorieOver,
  onSetTargets,
}: {
  day: NutritionDayPayload
  calorieRatio: number | null
  calorieOver: number | null
  onSetTargets: () => void
}) {
  const target = day.targets
  return (
    <section className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Calories</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{caloriesHeadline(day.totals.calories, target?.caloriesTarget ?? null)}</p>
      {calorieRatio != null ? (
        <div className="mt-3">
          <div
            className="h-2 overflow-hidden rounded-full bg-zinc-100"
            role="progressbar"
            aria-label="Calories consumed versus target"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(calorieRatio * 100)}
            aria-valuetext={caloriesHeadline(day.totals.calories, target?.caloriesTarget ?? null)}
          >
            <div className="h-full rounded-full bg-zinc-800" style={{ width: `${Math.round(calorieRatio * 100)}%` }} />
          </div>
          {calorieOver != null ? <p className="mt-1 text-sm text-zinc-500">+{Math.round(calorieOver)}</p> : null}
        </div>
      ) : null}

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Protein</p>
        <p className="mt-1 text-lg font-medium">{proteinHeadline(day.totals.protein, target?.proteinTarget ?? null)}</p>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <MacroStat label="Carbs" total={day.totals.carbs} />
        <MacroStat label="Fat" total={day.totals.fat} />
        <MacroStat label="Fiber" total={day.totals.fiber} />
      </dl>

      <button type="button" onClick={onSetTargets} className="mt-4 text-sm font-medium text-zinc-800 underline">
        {target ? 'Update targets' : 'Set targets'}
      </button>
    </section>
  )
}

function MacroStat({ label, total }: { label: string; total: NutritionDayPayload['totals']['carbs'] }) {
  return (
    <div>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="font-medium">{nutrientText(total, 'g')}</dd>
    </div>
  )
}

function EntryList({
  groups,
  empty,
  onAdd,
  onOpen,
}: {
  groups: ReturnType<typeof groupedEntries>
  empty: boolean
  onAdd: () => void
  onOpen: (entry: NutritionEntry) => void
}) {
  if (empty) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-8 text-center">
        <p className="text-sm text-zinc-600">No food logged yet.</p>
        <button
          type="button"
          onClick={onAdd}
          className="mt-3 inline-flex min-h-11 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
        >
          Add food
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.key}>
          <h2 className="text-sm font-semibold text-zinc-700">{group.label}</h2>
          <ul className="mt-2 divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
            {group.entries.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onOpen(entry)}
                  className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{entry.foodName}</span>
                    <span className="block truncate text-sm text-zinc-500">
                      {[entry.brand, formatQuantity(entry.servingQuantity, entry.servingUnit)].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-sm text-zinc-700">
                    <span className="block">{formatKcal(entry.calories)}</span>
                    {formatGrams(entry.protein) ? <span className="block text-zinc-500">{formatGrams(entry.protein)} protein</span> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function QuickAddCard({
  recents,
  staples,
  onAdd,
  onQuickLog,
}: {
  recents: NutritionFood[]
  staples: NutritionFood[]
  onAdd: () => void
  onQuickLog: (food: NutritionFood) => void
}) {
  const foods = recents.length > 0 ? recents.slice(0, 6) : staples.slice(0, 6)
  const title = recents.length > 0 ? 'Recent' : 'Staples'
  return (
    <section className="hidden rounded-xl border border-zinc-200 bg-white p-4 md:block">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <button type="button" onClick={onAdd} className="text-sm text-zinc-600 underline">
          Browse
        </button>
      </div>
      {foods.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">Add food to start logging.</p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100">
          {foods.map((food) => (
            <li key={food.id} className="flex items-center gap-2 py-1">
              <span className="min-w-0 flex-1 truncate text-sm">{food.name}</span>
              <button
                type="button"
                aria-label={`Quick log 1 serving of ${food.name}`}
                className={cn('min-h-11 min-w-11 rounded-md text-lg')}
                onClick={() => onQuickLog(food)}
              >
                +
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
