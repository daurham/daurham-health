import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  NUTRITION_CONFIG,
  nutritionDayTotals,
  snapshotFromDefinition,
  type NutritionEntry,
  type NutritionFood,
  type PendingNutritionCapture,
} from '@/domain/nutrition'
import {
  cn,
  interactiveRowClass,
  PendingLoadRegion,
  primaryButtonClass,
  useAtomicKeyedResource,
} from '@/lib'
import type { NutrientTotal } from '@/domain/nutrition'
import {
  createNutritionEntry,
  deleteNutritionEntry,
  dismissNutritionCapture,
  fetchNutritionDay,
  fetchNutritionFood,
  fetchPendingNutritionCaptures,
  type NutritionDayPayload,
} from './api'
import { LabelCaptureSheet } from './LabelCapture'
import { MealCaptureSheet } from './MealCapture'
import {
  adjacentNutritionDates,
  formatNutritionDayLabel,
  nutritionLoadErrorMessage,
  parseNutritionDateParam,
  shiftNutritionDate,
  todayNutritionDate,
} from './date'
import {
  formatGrams,
  formatKcal,
  formatQuantity,
  groupedEntries,
  clusterMealLogItems,
  macroHeadline,
  progressRatio,
  remainingHeadline,
} from './format'
import { AddFoodSheet, EntryEditorSheet, FoodEditorSheet, TargetSheet } from './panels'

type Panel =
  | { kind: 'add' }
  | { kind: 'entry'; entry: NutritionEntry }
  | { kind: 'targets' }
  | { kind: 'food'; food: NutritionFood }
  | { kind: 'label'; jobId: string }
  | { kind: 'meal'; jobId: string }

export function NutritionPage() {
  const [params, setParams] = useSearchParams()
  const urlDate = parseNutritionDateParam(params.get('date'))
  const [intentDate, setIntentDate] = useState(urlDate)
  const urlDateRef = useRef(urlDate)
  const today = todayNutritionDate()
  const loadDay = useCallback((date: string, signal: AbortSignal) => fetchNutritionDay(date, signal), [])
  const resource = useAtomicKeyedResource({
    requestedKey: intentDate,
    load: loadDay,
    prefetchKeys: adjacentNutritionDates,
  })
  const day = resource.data
  const date = resource.committedKey ?? intentDate
  const pending = resource.isPending
  const [panel, setPanel] = useState<Panel | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [undo, setUndo] = useState<NutritionEntry | null>(null)
  const [captures, setCaptures] = useState<PendingNutritionCapture[]>([])

  useEffect(() => {
    if (urlDate !== urlDateRef.current) {
      urlDateRef.current = urlDate
      setIntentDate(urlDate)
    }
  }, [urlDate])

  useEffect(() => {
    if (!resource.committedKey || params.get('date') === resource.committedKey) {
      return
    }
    urlDateRef.current = resource.committedKey
    const next = new URLSearchParams(params)
    next.set('date', resource.committedKey)
    setParams(next, { replace: true })
  }, [params, resource.committedKey, setParams])

  useEffect(() => {
    if (resource.error && resource.committedKey && intentDate !== resource.committedKey) {
      setIntentDate(resource.committedKey)
    }
  }, [intentDate, resource.committedKey, resource.error])

  useEffect(() => {
    if (params.get('action') !== 'add' || !day || panel?.kind === 'add') {
      return
    }
    setPanel({ kind: 'add' })
    const next = new URLSearchParams(params)
    next.delete('action')
    setParams(next, { replace: true })
  }, [day, panel, params, setParams])

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined

    async function loadCaptures() {
      try {
        const next = await fetchPendingNutritionCaptures()
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

  function requestDate(next: string) {
    setIntentDate(next)
  }

  function replaceEntries(entries: NutritionEntry[], extra?: Partial<NutritionDayPayload>) {
    resource.replaceData((current) => ({
      ...current,
      ...extra,
      entries,
      totals: nutritionDayTotals(entries),
    }))
  }

  async function dismissPending(job: PendingNutritionCapture) {
    try {
      await dismissNutritionCapture(job)
      setCaptures((current) => current.filter((item) => item.id !== job.id))
      if (panel && 'jobId' in panel && panel.jobId === job.id) {
        setPanel(null)
      }
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not dismiss that capture.')
    }
  }

  function prependRecent(food: NutritionFood) {
    resource.replaceData((current) => {
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
      mealGroupId: null,
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
      resource.replaceData((current) => {
        const entries = current.entries.map((entry) => (entry.id === optimisticId ? created : entry))
        return { ...current, entries, totals: nutritionDayTotals(entries) }
      })
    } catch (caught) {
      resource.replaceData((current) => {
        const entries = current.entries.filter((entry) => entry.id !== optimisticId)
        return { ...current, entries, totals: nutritionDayTotals(entries) }
      })
      setNotice(caught instanceof Error ? caught.message : 'Quick log failed')
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
      setNotice(caught instanceof Error ? caught.message : 'Could not delete entry')
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
      resource.replaceData((current) => {
        const entries = [...current.entries, created]
        return { ...current, entries, totals: nutritionDayTotals(entries) }
      })
    } catch (caught) {
      setNotice(caught instanceof Error ? caught.message : 'Could not undo delete')
    }
  }

  const groups = useMemo(() => groupedEntries(day?.entries ?? []), [day?.entries])
  const navBase = resource.pendingKey ?? intentDate

  return (
    <section className="w-full min-w-0 space-y-4 pb-[var(--shell-action-bar)] md:pb-0">
      <DayNav
        date={date}
        today={today}
        pendingVisible={resource.pendingVisible}
        onDate={requestDate}
        onShift={(days) => requestDate(shiftNutritionDate(navBase, days))}
      />

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Nutrition</h1>
          <p className="mt-1 text-sm text-zinc-600 md:text-base">{formatNutritionDayLabel(date, today)}</p>
        </div>
        <button
          type="button"
          onClick={() => setPanel({ kind: 'add' })}
          className={`${primaryButtonClass} hidden md:inline-flex`}
        >
          Add food
        </button>
      </div>

      {resource.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {nutritionLoadErrorMessage(resource.error.key)}
          <button
            type="button"
            className="ml-3 underline"
            onClick={() => {
              setIntentDate(resource.error!.key)
              resource.retry()
            }}
          >
            Retry
          </button>
        </p>
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
        <PendingCapturesCard
          jobs={captures}
          onOpen={(job) => setPanel({ kind: job.captureKind === 'meal_photo' ? 'meal' : 'label', jobId: job.id })}
          onDismiss={(job) => void dismissPending(job)}
        />
      ) : null}

      {!day ? (
        resource.error ? null : <p className="text-sm text-zinc-600">Loading…</p>
      ) : (
        <PendingLoadRegion pending={pending} pendingVisible={resource.pendingVisible}>
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_22rem] md:items-start">
            <aside className="min-w-0 space-y-4 md:order-2 md:sticky md:top-4">
              <SummaryCard day={day} onSetTargets={() => setPanel({ kind: 'targets' })} />
              <QuickAddCard recents={day.quickAdd.recents} onAdd={() => setPanel({ kind: 'add' })} onQuickLog={(food) => void quickLog(food)} />
            </aside>
            <div className="min-w-0 space-y-4 md:order-1">
              <EntryList
                groups={groups}
                empty={day.entries.length === 0}
                onAdd={() => setPanel({ kind: 'add' })}
                onOpen={(entry) => setPanel({ kind: 'entry', entry })}
              />
            </div>
          </div>
        </PendingLoadRegion>
      )}

      <button
        type="button"
        onClick={() => setPanel({ kind: 'add' })}
        className={`${primaryButtonClass} fixed right-4 z-30 min-h-12 min-w-12 rounded-full px-5 shadow-lg md:hidden`}
        style={{ bottom: 'calc(var(--shell-nav-offset) + 1rem)' }}
      >
        Add food
      </button>

      {panel?.kind === 'add' && day ? (
        <AddFoodSheet
          date={date}
          quickAdd={day.quickAdd}
          onClose={() => setPanel(null)}
          onLogged={(entry, food) => {
            resource.replaceData((current) => {
              const entries = [...current.entries.filter((item) => item.id !== entry.id), entry]
              return { ...current, entries, totals: nutritionDayTotals(entries) }
            })
            if (food) {
              prependRecent(food)
            }
            setPanel(null)
          }}
          onMealLogged={(entries) => {
            resource.replaceData((current) => {
              const ids = new Set(entries.map((item) => item.id))
              const next = [...current.entries.filter((item) => !ids.has(item.id)), ...entries]
              return { ...current, entries: next, totals: nutritionDayTotals(next) }
            })
            setPanel(null)
          }}
          onQuickLog={(food) => {
            setPanel(null)
            void quickLog(food)
          }}
          onOpenFood={(food) => setPanel({ kind: 'food', food })}
          onSavedFood={(food) => {
            prependRecent(food)
            setNotice('Saved to My Foods without logging.')
            setPanel(null)
          }}
        />
      ) : null}
      {panel?.kind === 'entry' ? (
        <EntryEditorSheet
          entry={panel.entry}
          onClose={() => setPanel(null)}
          onSaved={(entry) => {
            resource.replaceData((current) => {
              const entries = current.entries.map((item) => (item.id === entry.id ? entry : item))
              return { ...current, entries, totals: nutritionDayTotals(entries) }
            })
          }}
          onDeleted={(entry) => void onDeleted(entry)}
          onEditFood={(foodId) => {
            void fetchNutritionFood(foodId)
              .then((food) => setPanel({ kind: 'food', food }))
              .catch((caught: unknown) => {
                setNotice(caught instanceof Error ? caught.message : 'Could not load food')
              })
          }}
        />
      ) : null}
      {panel?.kind === 'targets' ? (
        <TargetSheet
          date={date}
          onClose={() => setPanel(null)}
          onSaved={() => {
            void fetchNutritionDay(date).then((next) => resource.replaceData(() => next))
          }}
        />
      ) : null}
      {panel?.kind === 'food' ? (
        <FoodEditorSheet
          food={panel.food}
          onClose={() => setPanel(null)}
          onSaved={(food) => {
            resource.replaceData((current) => {
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
          onDiscarded={() => {
            setCaptures((current) => current.filter((job) => job.id !== panel.jobId))
            setPanel(null)
          }}
          onLogged={(entry, food) => {
            resource.replaceData((current) => {
              const entries = [...current.entries.filter((item) => item.id !== entry.id), entry]
              return { ...current, entries, totals: nutritionDayTotals(entries) }
            })
            prependRecent(food)
            setCaptures((current) => current.filter((job) => job.id !== panel.jobId))
            setPanel(null)
          }}
          onSavedFood={(food) => {
            prependRecent(food)
            setNotice('Saved to My Foods without logging.')
            setCaptures((current) => current.filter((job) => job.id !== panel.jobId))
            setPanel(null)
          }}
        />
      ) : null}
      {panel?.kind === 'meal' ? (
        <MealCaptureSheet
          date={date}
          jobId={panel.jobId}
          recents={day?.quickAdd.recents}
          recipes={day?.quickAdd.recipes}
          onClose={() => setPanel(null)}
          onBack={() => setPanel(null)}
          onDiscarded={() => {
            setCaptures((current) => current.filter((job) => job.id !== panel.jobId))
            setPanel(null)
          }}
          onLogged={(entries) => {
            resource.replaceData((current) => {
              const ids = new Set(entries.map((item) => item.id))
              const next = [...current.entries.filter((item) => !ids.has(item.id)), ...entries]
              return { ...current, entries: next, totals: nutritionDayTotals(next) }
            })
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
  onDismiss,
}: {
  jobs: PendingNutritionCapture[]
  onOpen: (job: PendingNutritionCapture) => void
  onDismiss: (job: PendingNutritionCapture) => void
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
      <h2 className="text-sm font-semibold">Pending captures</h2>
      <ul className="mt-1">
        {jobs.map((job) => (
          <li key={job.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpen(job)}
              className="flex min-h-11 min-w-0 flex-1 items-center justify-between gap-2 text-left text-sm"
            >
              <span className="truncate">{job.captureKind === 'meal_photo' ? 'Meal photo' : 'Label photo'}</span>
              <span className="shrink-0 text-zinc-500">
                {job.status === 'completed' ? 'Ready to review' : job.status === 'failed' ? 'Failed' : 'Analyzing...'}
              </span>
            </button>
            <button
              type="button"
              className="shrink-0 px-2 text-sm text-zinc-600 underline"
              onClick={() => onDismiss(job)}
            >
              Dismiss
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function DayNav({
  date,
  today,
  pendingVisible,
  onDate,
  onShift,
}: {
  date: string
  today: string
  pendingVisible: boolean
  onDate: (date: string) => void
  onShift: (days: number) => void
}) {
  return (
    <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-2">
      <button
        type="button"
        aria-label="Previous day"
        className="min-h-11 min-w-11 rounded-md text-lg text-zinc-700 hover:bg-zinc-100"
        onClick={() => onShift(-1)}
      >
        ‹
      </button>
      <label className="flex min-w-0 flex-1 flex-col items-center">
        <span className="flex items-center gap-2 text-sm font-medium">
          {formatNutritionDayLabel(date, today)}
          {pendingVisible ? (
            <span className="inline-block h-3.5 w-3.5 animate-pulse rounded-full border-2 border-zinc-300 border-t-zinc-700" aria-hidden />
          ) : null}
        </span>
        <input
          type="date"
          aria-label="Nutrition date"
          className="mt-0.5 w-full max-w-40 rounded-md border border-zinc-300 bg-white px-2 py-1 text-center text-base md:text-sm"
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
        onClick={() => onShift(1)}
      >
        ›
      </button>
    </div>
  )
}

function SummaryCard({ day, onSetTargets }: { day: NutritionDayPayload; onSetTargets: () => void }) {
  const target = day.targets
  return (
    <section className="min-w-0 max-w-full rounded-xl border border-zinc-200 bg-white p-4">
      <MacroProgressRow
        label="Calories"
        total={day.totals.calories}
        target={target?.caloriesTarget ?? null}
        unit="kcal"
        emphasize
      />
      <div className="mt-4 space-y-4">
        <MacroProgressRow label="Protein" total={day.totals.protein} target={target?.proteinTarget ?? null} unit="g" />
        <MacroProgressRow label="Carbs" total={day.totals.carbs} target={target?.carbsTarget ?? null} unit="g" />
        <MacroProgressRow label="Fat" total={day.totals.fat} target={target?.fatTarget ?? null} unit="g" />
        <MacroProgressRow label="Fiber" total={day.totals.fiber} target={target?.fiberTarget ?? null} unit="g" secondary />
      </div>
      <button type="button" onClick={onSetTargets} className="mt-4 text-sm font-medium text-zinc-800 underline">
        {target ? 'Update targets' : 'Set targets'}
      </button>
    </section>
  )
}

function MacroProgressRow({
  label,
  total,
  target,
  unit,
  emphasize = false,
  secondary = false,
}: {
  label: string
  total: NutrientTotal
  target: number | null
  unit: 'kcal' | 'g'
  emphasize?: boolean
  secondary?: boolean
}) {
  const available = total.status === 'available' ? total.value : null
  const ratio = progressRatio(available, target)
  const remaining = remainingHeadline(total, target, unit)
  return (
    <div className={secondary ? 'opacity-90' : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{label}</p>
          <p className={emphasize ? 'mt-1 text-2xl font-semibold tracking-tight' : 'mt-1 text-lg font-medium'}>
            {macroHeadline(total, target, unit)}
          </p>
        </div>
        {remaining ? <p className="shrink-0 text-sm text-zinc-500">{remaining}</p> : null}
      </div>
      {ratio != null && !secondary ? (
        <div
          className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100"
          role="progressbar"
          aria-label={`${label} versus target`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(ratio * 100)}
        >
          <div
            className={cn('h-full rounded-full', ratio > 1.15 ? 'bg-warning' : 'bg-accent')}
            style={{ width: `${Math.round(Math.min(ratio, 1) * 100)}%` }}
          />
        </div>
      ) : null}
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
          className={primaryButtonClass}
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
            {clusterMealLogItems(group.entries).map((row) =>
              row.kind === 'meal' ? (
                <MealGroupRow key={row.key} row={row} onOpen={onOpen} />
              ) : (
                <li key={row.key}>
                  <EntryRowButton entry={row.entry} onOpen={onOpen} />
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  )
}

function EntryRowButton({ entry, onOpen }: { entry: NutritionEntry; onOpen: (entry: NutritionEntry) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(entry)}
      className={cn(
        'flex min-h-14 w-full min-w-0 items-center justify-between gap-3 px-4 py-3 text-left',
        interactiveRowClass,
      )}
    >
      <span className="min-w-0 flex-1">
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
  )
}

function MealGroupRow({
  row,
  onOpen,
}: {
  row: Extract<ReturnType<typeof clusterMealLogItems>[number], { kind: 'meal' }>
  onOpen: (entry: NutritionEntry) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'flex min-h-14 w-full min-w-0 items-center justify-between gap-3 px-4 py-3 text-left',
          interactiveRowClass,
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{row.label}</span>
          <span className="block truncate text-sm text-zinc-500">
            {formatKcal(row.calories)}
            {row.protein != null ? ` · ${formatGrams(row.protein)} protein` : ''}
          </span>
        </span>
        <span className="shrink-0 text-sm text-zinc-500">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open
        ? row.entries.map((entry) => (
            <div key={entry.id} className="border-t border-zinc-100 pl-4">
              <EntryRowButton entry={entry} onOpen={onOpen} />
            </div>
          ))
        : null}
    </li>
  )
}

function QuickAddCard({
  recents,
  onAdd,
  onQuickLog,
}: {
  recents: NutritionFood[]
  onAdd: () => void
  onQuickLog: (food: NutritionFood) => void
}) {
  return (
    <section className="hidden rounded-xl border border-zinc-200 bg-white p-4 md:block">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Recent</h2>
        <button type="button" onClick={onAdd} className="text-sm text-zinc-600 underline">
          Add food
        </button>
      </div>
      {recents.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">Add food to start logging.</p>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100">
          {recents.slice(0, 6).map((food) => (
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
