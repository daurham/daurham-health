import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  NUTRITION_CONFIG,
  NUTRITION_MEALS,
  applyGramServing,
  applyHundredGramServing,
  rankFoodsForQuery,
  shouldOfferFoodDescription,
  snapshotFromDefinition,
  validatePackagedReview,
  type NutritionEntry,
  type NutritionFood,
  type NutritionMeal,
  type PackagedFoodCandidate,
} from '@/domain/nutrition'
import { cn } from '@/lib'
import type { ReviewFieldError } from '@/domain/paper-load'
import {
  BarcodeLookupClientError,
  createNutritionEntry,
  createNutritionFood,
  describeFoodText,
  lookupNutritionBarcode,
  patchNutritionEntry,
  patchNutritionFood,
  saveNutritionTarget,
  savePackagedFoodAndLog,
  searchNutritionFoods,
} from './api'
import { BarcodeScanner } from './BarcodeScanner'
import { DescribeFoodSheet } from './DescribeFood'
import type { FoodDescriptionReview } from './api'
import { LabelCaptureSheet } from './LabelCapture'
import { MealCaptureSheet } from './MealCapture'
import { catalogKindLabel, formatGrams, formatKcal, formatQuantity, mealLabel, provenanceLabel } from './format'
import { NutritionSheet } from './Sheet'

const inputClass =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-zinc-500 md:text-sm'
const labelClass = 'mb-1 block text-sm font-medium text-zinc-700'
const primaryClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50'
const secondaryClass =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900'

type QuickAdd = {
  recents: NutritionFood[]
  staples: NutritionFood[]
  recipes: NutritionFood[]
}

type AddFoodSheetProps = {
  date: string
  quickAdd: QuickAdd
  onClose: () => void
  onLogged: (entry: NutritionEntry, food?: NutritionFood) => void
  onMealLogged?: (entries: NutritionEntry[]) => void
  onQuickLog: (food: NutritionFood) => void
  onOpenFood: (food: NutritionFood) => void
}

export function AddFoodSheet({ date, quickAdd, onClose, onLogged, onMealLogged, onQuickLog, onOpenFood }: AddFoodSheetProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NutritionFood[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [manual, setManual] = useState(false)
  const [scan, setScan] = useState(false)
  const [label, setLabel] = useState(false)
  const [mealPhoto, setMealPhoto] = useState(false)
  const [describe, setDescribe] = useState<FoodDescriptionReview | null>(null)
  const [describeUnavailable, setDescribeUnavailable] = useState(false)
  const [describeError, setDescribeError] = useState<string | null>(null)
  const [describeBusy, setDescribeBusy] = useState(false)
  const [confirmFood, setConfirmFood] = useState<NutritionFood | null>(null)
  const [candidate, setCandidate] = useState<PackagedFoodCandidate | null>(null)
  const [lookupError, setLookupError] = useState<{
    code: 'not_found' | 'provider_unavailable' | 'invalid_barcode'
    message: string
    barcode: string | null
  } | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const lookupLock = useRef(false)

  useEffect(() => {
    const needle = query.trim()
    if (needle.length === 0) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      searchNutritionFoods(needle, controller.signal)
        .then((foods) => {
          setResults(rankFoodsForQuery(foods, needle, { recentIds: quickAdd.recents.map((item) => item.id) }))
        })
        .catch(() => {
          if (controller.signal.aborted) {
            return
          }
          setResults([])
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearching(false)
          }
        })
    }, 150)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [query, quickAdd.recents])

  async function onBarcode(raw: string) {
    if (lookupLock.current) {
      return
    }
    lookupLock.current = true
    setLookupBusy(true)
    setLookupError(null)
    try {
      const result = await lookupNutritionBarcode(raw)
      if (result.status === 'local') {
        setScan(false)
        setConfirmFood(result.food)
        return
      }
      setScan(false)
      setCandidate(result.candidate)
    } catch (caught) {
      if (caught instanceof BarcodeLookupClientError) {
        const code =
          caught.code === 'not_found' || caught.code === 'provider_unavailable' || caught.code === 'invalid_barcode'
            ? caught.code
            : 'invalid_barcode'
        setLookupError({ code, message: caught.message, barcode: caught.barcode ?? raw })
        setScan(false)
        return
      }
      setLookupError({
        code: 'provider_unavailable',
        message: caught instanceof Error ? caught.message : 'Product lookup is temporarily unavailable.',
        barcode: raw,
      })
      setScan(false)
    } finally {
      lookupLock.current = false
      setLookupBusy(false)
    }
  }

  if (confirmFood) {
    return (
      <QuantitySheet
        date={date}
        food={confirmFood}
        sourceKind={confirmFood.sourceKind === 'barcode' ? 'barcode' : 'manual'}
        onClose={onClose}
        onBack={() => setConfirmFood(null)}
        onLogged={(entry) => {
          onLogged(entry, confirmFood)
          onClose()
        }}
      />
    )
  }

  if (candidate) {
    return (
      <PackagedReviewSheet
        date={date}
        candidate={candidate}
        onClose={onClose}
        onBack={() => setCandidate(null)}
        onLogged={(entry, food) => {
          onLogged(entry, food)
          onClose()
        }}
      />
    )
  }

  if (lookupError) {
    return (
      <NutritionSheet title="Barcode" onClose={onClose}>
        <p className="text-sm text-zinc-800">{lookupError.message}</p>
        {lookupError.barcode ? <p className="mt-2 font-mono text-sm text-zinc-600">{lookupError.barcode}</p> : null}
        <div className="mt-4 space-y-2">
          {lookupError.code === 'not_found' ? (
            <button
              type="button"
              className={primaryClass}
              onClick={() => {
                setCandidate(emptyCandidate(lookupError.barcode ?? ''))
                setLookupError(null)
              }}
            >
              Create food for this barcode
            </button>
          ) : null}
          {lookupError.code === 'provider_unavailable' ? (
            <button
              type="button"
              className={primaryClass}
              onClick={() => {
                setLookupError(null)
                setScan(true)
              }}
            >
              Retry
            </button>
          ) : null}
          <button
            type="button"
            className={secondaryClass + ' w-full'}
            onClick={() => {
              setLookupError(null)
              setManual(true)
            }}
          >
            Enter food manually
          </button>
          <button type="button" className="text-sm text-zinc-600 underline" onClick={() => setLookupError(null)}>
            Back
          </button>
        </div>
      </NutritionSheet>
    )
  }

  if (scan) {
    return (
      <NutritionSheet title="Scan barcode" onClose={onClose}>
        {lookupBusy ? <p className="mb-3 text-sm text-zinc-600">Looking up product…</p> : null}
        <BarcodeScanner disabled={lookupBusy} onDetect={(code) => void onBarcode(code)} onClose={() => setScan(false)} />
      </NutritionSheet>
    )
  }

  if (label) {
    return (
      <LabelCaptureSheet
        date={date}
        onClose={onClose}
        onBack={() => setLabel(false)}
        onLogged={(entry, food) => {
          onLogged(entry, food)
          onClose()
        }}
      />
    )
  }

  if (mealPhoto) {
    return (
      <MealCaptureSheet
        date={date}
        recents={quickAdd.recents}
        recipes={quickAdd.recipes}
        onClose={onClose}
        onBack={() => setMealPhoto(false)}
        onLogged={(entries) => {
          if (onMealLogged) {
            onMealLogged(entries)
          } else {
            for (const entry of entries) {
              onLogged(entry)
            }
          }
          onClose()
        }}
      />
    )
  }

  if (describe || describeUnavailable) {
    return (
      <DescribeFoodSheet
        key={describe ? 'review' : 'unavailable'}
        date={date}
        text={query.trim()}
        review={describe}
        unavailable={!describe}
        message={describeError}
        onClose={onClose}
        onBack={() => {
          setDescribe(null)
          setDescribeUnavailable(false)
        }}
        onRetry={() => {
          setDescribeBusy(true)
          void describeFoodText(query.trim())
            .then((review) => {
              setDescribe(review)
              setDescribeUnavailable(false)
            })
            .catch((caught: unknown) => {
              setDescribeUnavailable(true)
              setDescribeError(caught instanceof Error ? caught.message : null)
            })
            .finally(() => setDescribeBusy(false))
        }}
        onTryLocal={() => {
          setDescribeBusy(true)
          void describeFoodText(query.trim(), 'home_ai')
            .then((review) => {
              setDescribe(review)
              setDescribeUnavailable(false)
            })
            .catch((caught: unknown) => {
              setDescribeUnavailable(true)
              setDescribeError(caught instanceof Error ? caught.message : null)
            })
            .finally(() => setDescribeBusy(false))
        }}
        onManual={() => {
          setDescribe(null)
          setDescribeUnavailable(false)
          setManual(true)
        }}
        onLogged={(entries) => {
          if (onMealLogged) {
            onMealLogged(entries)
          } else {
            for (const entry of entries) {
              onLogged(entry)
            }
          }
          onClose()
        }}
      />
    )
  }

  if (manual) {
    return (
      <ManualEntrySheet
        date={date}
        onClose={onClose}
        onBack={() => setManual(false)}
        onLogged={(entry, food) => {
          onLogged(entry, food)
          onClose()
        }}
      />
    )
  }

  return (
    <NutritionSheet
      title="Add food"
      onClose={onClose}
      stickyHeader={
        <div className="space-y-3">
          <div>
            <label className={labelClass} htmlFor="nutrition-food-search">
              Search foods or describe what you ate
            </label>
            <input
              id="nutrition-food-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search foods or describe what you ate"
              className={inputClass}
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className={secondaryClass + ' px-2 text-center text-xs leading-tight'} onClick={() => setScan(true)}>
              Scan barcode
            </button>
            <button type="button" className={secondaryClass + ' px-2 text-center text-xs leading-tight'} onClick={() => setLabel(true)}>
              Scan nutrition label
            </button>
            <button type="button" className={secondaryClass + ' px-2 text-center text-xs leading-tight'} onClick={() => setMealPhoto(true)}>
              Meal photo
            </button>
            <button type="button" className={secondaryClass + ' px-2 text-center text-xs leading-tight'} onClick={() => setManual(true)}>
              Manual entry
            </button>
          </div>
        </div>
      }
    >
      {query.trim().length > 0 ? (
        <FoodSection
          title="Search"
          foods={results ?? []}
          empty={searching ? 'Searching…' : 'No matching saved foods.'}
          action={
            shouldOfferFoodDescription(query, results, searching) ? (
              <button
                type="button"
                className={secondaryClass + ' mt-3 w-full'}
                disabled={describeBusy}
                onClick={() => {
                  setDescribeBusy(true)
                  void describeFoodText(query.trim())
                    .then((review) => {
                      setDescribe(review)
                      setDescribeUnavailable(false)
                    })
                    .catch((caught: unknown) => {
                      setDescribe(null)
                      setDescribeUnavailable(true)
                      setDescribeError(caught instanceof Error ? caught.message : null)
                    })
                    .finally(() => setDescribeBusy(false))
                }}
              >
                {describeBusy ? 'Reading description…' : 'Use this description'}
              </button>
            ) : null
          }
          onSelect={setConfirmFood}
          onQuickLog={onQuickLog}
          onOpenFood={onOpenFood}
          showKind
        />
      ) : (
        <FoodSection
          title="Recent"
          foods={quickAdd.recents}
          empty="No recents yet. Logged catalog foods will appear here."
          onSelect={setConfirmFood}
          onQuickLog={onQuickLog}
          onOpenFood={onOpenFood}
        />
      )}
    </NutritionSheet>
  )
}

function FoodSection({
  title,
  foods,
  empty,
  action,
  onSelect,
  onQuickLog,
  onOpenFood,
  showKind = false,
}: {
  title: string
  foods: NutritionFood[]
  empty: string
  action?: ReactNode
  onSelect: (food: NutritionFood) => void
  onQuickLog: (food: NutritionFood) => void
  onOpenFood: (food: NutritionFood) => void
  showKind?: boolean
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      {foods.length === 0 ? (
        <div>
          <p className="mt-2 text-sm text-zinc-600">{empty}</p>
          {action}
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200">
          {foods.map((food) => (
            <li key={food.id} className="flex items-stretch bg-white">
              <button
                type="button"
                onClick={() => onSelect(food)}
                className="flex min-h-14 min-w-0 flex-1 flex-col justify-center px-3 py-2 text-left"
              >
                <span className="truncate font-medium">{food.name}</span>
                <span className="truncate text-sm text-zinc-500">
                  {[
                    food.brand,
                    showKind ? catalogKindLabel(food.catalogKind) : null,
                    formatQuantity(food.servingQuantity, food.servingUnit),
                    formatKcal(food.calories),
                    formatGrams(food.protein) ? `${formatGrams(food.protein)} protein` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </button>
              <button
                type="button"
                className="px-2 text-xs text-zinc-500 hover:text-zinc-900"
                onClick={() => onOpenFood(food)}
              >
                Edit
              </button>
              <button
                type="button"
                aria-label={`Quick log 1 serving of ${food.name}`}
                onClick={() => onQuickLog(food)}
                className="min-h-14 min-w-12 text-xl font-medium text-zinc-900"
              >
                +
              </button>
            </li>
          ))}
        </ul>
      )}
      {foods.length > 0 ? action : null}
    </section>
  )
}

type QuantitySheetProps = {
  date: string
  food: NutritionFood
  sourceKind?: NutritionFood['sourceKind']
  onClose: () => void
  onBack: () => void
  onLogged: (entry: NutritionEntry) => void
}

export function QuantitySheet({ date, food, sourceKind = 'manual', onClose, onBack, onLogged }: QuantitySheetProps) {
  const [quantity, setQuantity] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preview = useMemo(
    () =>
      snapshotFromDefinition(
        {
          calories: food.calories,
          protein: food.protein,
          carbs: food.carbs,
          fat: food.fat,
          fiber: food.fiber,
          servingGrams: food.servingGrams,
        },
        { quantity },
      ),
    [food, quantity],
  )

  async function log() {
    setBusy(true)
    setError(null)
    try {
      const entry = await createNutritionEntry({
        logDate: date,
        timezone: NUTRITION_CONFIG.calendarTimeZone,
        foodId: food.id,
        servingQuantity: quantity,
        sourceKind,
      })
      onLogged(entry)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not log food')
    } finally {
      setBusy(false)
    }
  }

  return (
    <NutritionSheet
      title={food.name}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" className={secondaryClass} onClick={onBack}>
            Back
          </button>
          <button type="button" className={primaryClass} onClick={() => void log()} disabled={busy}>
            {busy ? 'Logging…' : 'Log'}
          </button>
        </div>
      }
    >
      <QuantityControls quantity={quantity} unit={food.servingUnit} onChange={setQuantity} />
      {food.brand ? <p className="mt-2 text-sm text-zinc-500">{food.brand}</p> : null}
      <ScaledPreview preview={preview} />
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </NutritionSheet>
  )
}

function QuantityControls({
  quantity,
  unit,
  onChange,
}: {
  quantity: number
  unit: string
  onChange: (value: number) => void
}) {
  return (
    <div>
      <p className={labelClass} id="quantity-label">
        Quantity
      </p>
      <div className="flex items-center gap-2" role="group" aria-labelledby="quantity-label">
        <button
          type="button"
          aria-label="Decrease quantity"
          className="min-h-11 min-w-11 rounded-md border border-zinc-300 text-lg"
          onClick={() => onChange(Math.max(0.25, roundQty(quantity - 0.5)))}
        >
          −
        </button>
        <input
          aria-label="Serving quantity"
          inputMode="decimal"
          value={String(quantity)}
          onChange={(event) => {
            const next = Number(event.target.value)
            if (Number.isFinite(next) && next > 0) {
              onChange(next)
            }
          }}
          className={cn(inputClass, 'text-center')}
        />
        <button
          type="button"
          aria-label="Increase quantity"
          className="min-h-11 min-w-11 rounded-md border border-zinc-300 text-lg"
          onClick={() => onChange(roundQty(quantity + 0.5))}
        >
          +
        </button>
      </div>
      <p className="mt-2 text-sm text-zinc-600">{formatQuantity(quantity, unit)}</p>
    </div>
  )
}

function ScaledPreview({
  preview,
}: {
  preview: { calories: number; protein: number | null; carbs: number | null; fat: number | null; fiber: number | null }
}) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
      <PreviewStat label="Calories" value={formatKcal(preview.calories)} />
      <PreviewStat label="Protein" value={formatGrams(preview.protein) ?? '—'} />
      <PreviewStat label="Carbs" value={formatGrams(preview.carbs) ?? '—'} />
      <PreviewStat label="Fat" value={formatGrams(preview.fat) ?? '—'} />
    </dl>
  )
}

function PreviewStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-zinc-50 px-3 py-2">
      <dt className="text-xs uppercase tracking-wide text-zinc-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}

function roundQty(value: number): number {
  return Math.round(value * 100) / 100
}

function ManualEntrySheet({
  date,
  onClose,
  onBack,
  onLogged,
}: {
  date: string
  onClose: () => void
  onBack: () => void
  onLogged: (entry: NutritionEntry, food?: NutritionFood) => void
}) {
  const [name, setName] = useState('')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [fiber, setFiber] = useState('')
  const [notes, setNotes] = useState('')
  const [saveAsFood, setSaveAsFood] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setBusy(true)
    setError(null)
    try {
      const kcal = Number(calories)
      if (!name.trim() || !Number.isFinite(kcal)) {
        throw new Error('Name and calories are required')
      }
      const macros = {
        protein: optionalNumber(protein),
        carbs: optionalNumber(carbs),
        fat: optionalNumber(fat),
        fiber: optionalNumber(fiber),
      }
      if (saveAsFood) {
        const food = await createNutritionFood({
          name: name.trim(),
          servingQuantity: 1,
          servingUnit: 'serving',
          calories: kcal,
          ...macros,
          catalogKind: 'custom',
          sourceKind: 'manual',
        })
        const entry = await createNutritionEntry({
          logDate: date,
          timezone: NUTRITION_CONFIG.calendarTimeZone,
          foodId: food.id,
          servingQuantity: 1,
        })
        onLogged(entry, food)
        return
      }
      const entry = await createNutritionEntry({
        logDate: date,
        timezone: NUTRITION_CONFIG.calendarTimeZone,
        foodName: name.trim(),
        servingQuantity: 1,
        servingUnit: 'serving',
        calories: kcal,
        ...macros,
        notes: notes.trim() || null,
        sourceKind: 'manual',
      })
      onLogged(entry)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save entry')
    } finally {
      setBusy(false)
    }
  }

  return (
    <NutritionSheet
      title="Manual entry"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" className={secondaryClass} onClick={onBack}>
            Back
          </button>
          <button type="button" className={primaryClass} onClick={() => void submit()} disabled={busy}>
            {busy ? 'Saving…' : 'Log'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Name" htmlFor="manual-name">
          <input id="manual-name" className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Calories" htmlFor="manual-kcal">
          <input
            id="manual-kcal"
            className={inputClass}
            inputMode="decimal"
            value={calories}
            onChange={(event) => setCalories(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <OptionalMacro id="manual-protein" label="Protein g" value={protein} onChange={setProtein} />
          <OptionalMacro id="manual-carbs" label="Carbs g" value={carbs} onChange={setCarbs} />
          <OptionalMacro id="manual-fat" label="Fat g" value={fat} onChange={setFat} />
          <OptionalMacro id="manual-fiber" label="Fiber g" value={fiber} onChange={setFiber} />
        </div>
        <Field label="Notes" htmlFor="manual-notes">
          <input id="manual-notes" className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={saveAsFood} onChange={(event) => setSaveAsFood(event.target.checked)} />
          Save this as a reusable food
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    </NutritionSheet>
  )
}

export function EntryEditorSheet({
  entry,
  onClose,
  onSaved,
  onDeleted,
  onEditFood,
}: {
  entry: NutritionEntry
  onClose: () => void
  onSaved: (entry: NutritionEntry) => void
  onDeleted: (entry: NutritionEntry) => void
  onEditFood: (foodId: string) => void
}) {
  const [quantity, setQuantity] = useState(entry.servingQuantity)
  const [foodName, setFoodName] = useState(entry.foodName)
  const [calories, setCalories] = useState(String(entry.calories))
  const [protein, setProtein] = useState(entry.protein == null ? '' : String(entry.protein))
  const [carbs, setCarbs] = useState(entry.carbs == null ? '' : String(entry.carbs))
  const [fat, setFat] = useState(entry.fat == null ? '' : String(entry.fat))
  const [fiber, setFiber] = useState(entry.fiber == null ? '' : String(entry.fiber))
  const [meal, setMeal] = useState(entry.meal ?? '')
  const [notes, setNotes] = useState(entry.notes ?? '')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const linked = Boolean(entry.foodId)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const kcal = Number(calories)
      const macrosTouched =
        Number(calories) !== entry.calories ||
        optionalNumber(protein) !== entry.protein ||
        optionalNumber(carbs) !== entry.carbs ||
        optionalNumber(fat) !== entry.fat ||
        optionalNumber(fiber) !== entry.fiber
      const saved = await patchNutritionEntry(entry.id, {
        servingQuantity: quantity,
        foodName: linked ? undefined : foodName.trim(),
        meal: meal === '' ? null : (meal as NutritionMeal),
        notes: notes.trim() || null,
        ...(macrosTouched
          ? {
              calories: kcal,
              protein: optionalNumber(protein),
              carbs: optionalNumber(carbs),
              fat: optionalNumber(fat),
              fiber: optionalNumber(fiber),
            }
          : {}),
      })
      onSaved(saved)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update entry')
    } finally {
      setBusy(false)
    }
  }

  return (
    <NutritionSheet
      title="Edit log"
      onClose={onClose}
      footer={
        confirmDelete ? (
          <div className="flex gap-2">
            <button type="button" className={secondaryClass} onClick={() => setConfirmDelete(false)}>
              Keep
            </button>
            <button
              type="button"
              className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-zinc-800 px-4 text-sm font-medium text-white"
              onClick={() => onDeleted(entry)}
            >
              Delete log
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" className={secondaryClass} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
            <button type="button" className={primaryClass} onClick={() => void save()} disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        )
      }
    >
      <div className="space-y-3">
        {linked ? (
          <p className="text-sm text-zinc-600">
            Editing this log snapshot. The reusable food definition is unchanged unless you edit the food.
          </p>
        ) : (
          <Field label="Name" htmlFor="entry-name">
            <input id="entry-name" className={inputClass} value={foodName} onChange={(event) => setFoodName(event.target.value)} />
          </Field>
        )}
        {linked ? <p className="text-base font-medium">{entry.foodName}</p> : null}
        <QuantityControls quantity={quantity} unit={entry.servingUnit} onChange={setQuantity} />
        <Field label="Calories" htmlFor="entry-kcal">
          <input
            id="entry-kcal"
            className={inputClass}
            inputMode="decimal"
            value={calories}
            onChange={(event) => setCalories(event.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <OptionalMacro id="entry-protein" label="Protein g" value={protein} onChange={setProtein} />
          <OptionalMacro id="entry-carbs" label="Carbs g" value={carbs} onChange={setCarbs} />
          <OptionalMacro id="entry-fat" label="Fat g" value={fat} onChange={setFat} />
          <OptionalMacro id="entry-fiber" label="Fiber g" value={fiber} onChange={setFiber} />
        </div>
        <Field label="Meal" htmlFor="entry-meal">
          <select id="entry-meal" className={inputClass} value={meal} onChange={(event) => setMeal(event.target.value)}>
            <option value="">None</option>
            {NUTRITION_MEALS.map((item) => (
              <option key={item} value={item}>
                {mealLabel(item)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Notes" htmlFor="entry-notes">
          <input id="entry-notes" className={inputClass} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <p className="text-sm text-zinc-500">{provenanceLabel(entry.sourceKind)}</p>
        {entry.foodId ? (
          <button type="button" className="text-sm text-zinc-700 underline" onClick={() => onEditFood(entry.foodId!)}>
            Edit reusable food
          </button>
        ) : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    </NutritionSheet>
  )
}

export function TargetSheet({
  date,
  onClose,
  onSaved,
}: {
  date: string
  onClose: () => void
  onSaved: () => void
}) {
  const [calories, setCalories] = useState('2100')
  const [protein, setProtein] = useState('160')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [fiber, setFiber] = useState('')
  const [effectiveFrom, setEffectiveFrom] = useState(date)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      await saveNutritionTarget({
        effectiveFrom,
        caloriesTarget: Number(calories),
        proteinTarget: Number(protein),
        carbsTarget: optionalNumber(carbs),
        fatTarget: optionalNumber(fat),
        fiberTarget: optionalNumber(fiber),
      })
      onSaved()
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save targets')
    } finally {
      setBusy(false)
    }
  }

  return (
    <NutritionSheet
      title="Set targets"
      onClose={onClose}
      footer={
        <button type="button" className={primaryClass} onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save targets'}
        </button>
      }
    >
      <p className="mb-3 text-sm text-zinc-600">
        Creates a new effective-dated target. Earlier days keep their previous target.
      </p>
      <div className="space-y-3">
        <Field label="Effective from" htmlFor="target-from">
          <input
            id="target-from"
            type="date"
            className={inputClass}
            value={effectiveFrom}
            onChange={(event) => setEffectiveFrom(event.target.value)}
          />
        </Field>
        <Field label="Calories" htmlFor="target-kcal">
          <input id="target-kcal" className={inputClass} inputMode="numeric" value={calories} onChange={(event) => setCalories(event.target.value)} />
        </Field>
        <Field label="Protein g" htmlFor="target-protein">
          <input id="target-protein" className={inputClass} inputMode="decimal" value={protein} onChange={(event) => setProtein(event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <OptionalMacro id="target-carbs" label="Carbs g" value={carbs} onChange={setCarbs} />
          <OptionalMacro id="target-fat" label="Fat g" value={fat} onChange={setFat} />
          <OptionalMacro id="target-fiber" label="Fiber g" value={fiber} onChange={setFiber} />
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    </NutritionSheet>
  )
}

export function FoodEditorSheet({
  food,
  onClose,
  onSaved,
}: {
  food: NutritionFood
  onClose: () => void
  onSaved: (food: NutritionFood) => void
}) {
  const [name, setName] = useState(food.name)
  const [brand, setBrand] = useState(food.brand ?? '')
  const [unit, setUnit] = useState(food.servingUnit)
  const [calories, setCalories] = useState(String(food.calories))
  const [protein, setProtein] = useState(food.protein == null ? '' : String(food.protein))
  const [carbs, setCarbs] = useState(food.carbs == null ? '' : String(food.carbs))
  const [fat, setFat] = useState(food.fat == null ? '' : String(food.fat))
  const [fiber, setFiber] = useState(food.fiber == null ? '' : String(food.fiber))
  const [staple, setStaple] = useState(food.isStaple)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const saved = await patchNutritionFood(food.id, {
        name: name.trim(),
        brand: brand.trim() || null,
        servingUnit: unit.trim(),
        calories: Number(calories),
        protein: optionalNumber(protein),
        carbs: optionalNumber(carbs),
        fat: optionalNumber(fat),
        fiber: optionalNumber(fiber),
        isStaple: staple,
      })
      onSaved(saved)
      onClose()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update food')
    } finally {
      setBusy(false)
    }
  }

  return (
    <NutritionSheet
      title="Edit food"
      onClose={onClose}
      footer={
        <button type="button" className={primaryClass} onClick={() => void save()} disabled={busy}>
          {busy ? 'Saving…' : 'Save food'}
        </button>
      }
    >
      <p className="mb-3 text-sm text-zinc-600">
        Future logs use this definition. Previous entries stay as recorded.
      </p>
      <div className="space-y-3">
        <Field label="Name" htmlFor="food-name">
          <input id="food-name" className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Brand" htmlFor="food-brand">
          <input id="food-brand" className={inputClass} value={brand} onChange={(event) => setBrand(event.target.value)} />
        </Field>
        <Field label="Serving" htmlFor="food-unit">
          <input id="food-unit" className={inputClass} value={unit} onChange={(event) => setUnit(event.target.value)} />
        </Field>
        <Field label="Calories / serving" htmlFor="food-kcal">
          <input id="food-kcal" className={inputClass} inputMode="decimal" value={calories} onChange={(event) => setCalories(event.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <OptionalMacro id="food-protein" label="Protein g" value={protein} onChange={setProtein} />
          <OptionalMacro id="food-carbs" label="Carbs g" value={carbs} onChange={setCarbs} />
          <OptionalMacro id="food-fat" label="Fat g" value={fat} onChange={setFat} />
          <OptionalMacro id="food-fiber" label="Fiber g" value={fiber} onChange={setFiber} />
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={staple} onChange={(event) => setStaple(event.target.checked)} />
          Staple
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    </NutritionSheet>
  )
}

function emptyCandidate(barcode: string): PackagedFoodCandidate {
  return {
    barcode,
    barcodeRaw: barcode,
    source: 'open_food_facts',
    name: null,
    brand: null,
    serving: { quantity: 1, unit: 'serving', grams: null },
    nutrition: { calories: null, protein: null, carbs: null, fat: null, fiber: null },
    sourceBasis: { kind: 'missing', perServing: false, per100g: false },
    per100g: null,
    warnings: ['Not found in the product database.'],
    complete: false,
  }
}

function PackagedReviewSheet({
  date,
  candidate,
  onClose,
  onBack,
  onLogged,
}: {
  date: string
  candidate: PackagedFoodCandidate
  onClose: () => void
  onBack: () => void
  onLogged: (entry: NutritionEntry, food: NutritionFood) => void
}) {
  const [draft, setDraft] = useState(candidate)
  const [name, setName] = useState(candidate.name ?? '')
  const [brand, setBrand] = useState(candidate.brand ?? '')
  const [unit, setUnit] = useState(candidate.serving.unit ?? 'serving')
  const [grams, setGrams] = useState(candidate.serving.grams == null ? '' : String(candidate.serving.grams))
  const [calories, setCalories] = useState(candidate.nutrition.calories == null ? '' : String(candidate.nutrition.calories))
  const [protein, setProtein] = useState(candidate.nutrition.protein == null ? '' : String(candidate.nutrition.protein))
  const [carbs, setCarbs] = useState(candidate.nutrition.carbs == null ? '' : String(candidate.nutrition.carbs))
  const [fat, setFat] = useState(candidate.nutrition.fat == null ? '' : String(candidate.nutrition.fat))
  const [fiber, setFiber] = useState(candidate.nutrition.fiber == null ? '' : String(candidate.nutrition.fiber))
  const [errors, setErrors] = useState<ReviewFieldError[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const first = errors[0]?.path
    if (!first) {
      return
    }
    document.getElementById(`review-${first}`)?.focus()
  }, [errors])

  function errorFor(path: string): string | undefined {
    return errors.find((item) => item.path === path)?.message
  }

  function applyCandidate(next: PackagedFoodCandidate) {
    setDraft(next)
    setName(next.name ?? '')
    setBrand(next.brand ?? '')
    setUnit(next.serving.unit ?? 'serving')
    setGrams(next.serving.grams == null ? '' : String(next.serving.grams))
    setCalories(next.nutrition.calories == null ? '' : String(next.nutrition.calories))
    setProtein(next.nutrition.protein == null ? '' : String(next.nutrition.protein))
    setCarbs(next.nutrition.carbs == null ? '' : String(next.nutrition.carbs))
    setFat(next.nutrition.fat == null ? '' : String(next.nutrition.fat))
    setFiber(next.nutrition.fiber == null ? '' : String(next.nutrition.fiber))
    setErrors([])
  }

  async function saveAndLog() {
    const servingGrams = optionalNumber(grams)
    const kcal = calories.trim() === '' ? null : Number(calories)
    const nextErrors = validatePackagedReview({
      barcode: draft.barcode,
      name,
      servingUnit: unit,
      servingQuantity: 1,
      servingGrams,
      calories: kcal,
    })
    if (nextErrors.length > 0) {
      setErrors(nextErrors)
      return
    }
    setErrors([])
    setBusy(true)
    setError(null)
    try {
      const saved = await savePackagedFoodAndLog({
        barcode: draft.barcode,
        name: name.trim(),
        brand: brand.trim() || null,
        servingQuantity: 1,
        servingUnit: unit.trim(),
        servingGrams,
        calories: Number(calories),
        protein: optionalNumber(protein),
        carbs: optionalNumber(carbs),
        fat: optionalNumber(fat),
        fiber: optionalNumber(fiber),
        logDate: date,
        timezone: NUTRITION_CONFIG.calendarTimeZone,
        logQuantity: 1,
        log: true,
      })
      if (!saved.entry) {
        throw new Error('Food saved but logging failed. Scan again to log.')
      }
      onLogged(saved.entry, saved.food)
    } catch (caught) {
      if (caught instanceof BarcodeLookupClientError && caught.fields.length > 0) {
        setErrors(caught.fields)
        return
      }
      setError(caught instanceof Error ? caught.message : 'Could not save food')
    } finally {
      setBusy(false)
    }
  }

  const derived = draft.sourceBasis.kind === 'per_100g_derived'

  return (
    <NutritionSheet
      title="Review food"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" className={secondaryClass} onClick={onBack}>
            Back
          </button>
          <button type="button" className={primaryClass} onClick={() => void saveAndLog()} disabled={busy}>
            {busy ? 'Saving…' : 'Save & Log'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {draft.warnings.map((warning) => (
          <p key={warning} className="text-sm text-zinc-600">
            {warning}
          </p>
        ))}
        <Field label="Barcode" htmlFor="review-barcode">
          <input id="review-barcode" className={inputClass} value={draft.barcode} readOnly />
        </Field>
        <ReviewField
          label="Name"
          id="review-name"
          value={name}
          error={errorFor('name')}
          onChange={(value) => {
            setName(value)
            setErrors((current) => current.filter((item) => item.path !== 'name'))
          }}
        />
        <ReviewField label="Brand" id="review-brand" value={brand} onChange={setBrand} />
        <ReviewField
          label="Serving"
          id="review-servingUnit"
          value={unit}
          error={errorFor('servingUnit')}
          onChange={(value) => {
            setUnit(value)
            setErrors((current) => current.filter((item) => item.path !== 'servingUnit'))
          }}
        />
        <ReviewField
          label="Serving weight g"
          id="review-servingGrams"
          value={grams}
          error={errorFor('servingGrams')}
          inputMode="decimal"
          onChange={(value) => {
            setGrams(value)
            setErrors((current) => current.filter((item) => item.path !== 'servingGrams'))
            const parsed = Number(value)
            const canDerive =
              draft.per100g != null &&
              (draft.sourceBasis.kind === 'per_100g_unspecified' || draft.sourceBasis.kind === 'per_100g_derived')
            if (canDerive && Number.isFinite(parsed) && parsed > 0) {
              const next = applyGramServing(
                {
                  ...draft,
                  name: name.trim() || draft.name,
                  brand: brand.trim() || draft.brand,
                  serving: { ...draft.serving, unit: unit.trim() || draft.serving.unit },
                },
                parsed,
              )
              setDraft(next)
              setCalories(next.nutrition.calories == null ? '' : String(next.nutrition.calories))
              setProtein(next.nutrition.protein == null ? '' : String(next.nutrition.protein))
              setCarbs(next.nutrition.carbs == null ? '' : String(next.nutrition.carbs))
              setFat(next.nutrition.fat == null ? '' : String(next.nutrition.fat))
              setFiber(next.nutrition.fiber == null ? '' : String(next.nutrition.fiber))
            }
          }}
        />
        {draft.sourceBasis.kind === 'per_100g_unspecified' && draft.per100g ? (
          <button
            type="button"
            className={secondaryClass + ' w-full'}
            onClick={() => {
              const next = applyHundredGramServing({
                ...draft,
                name: name.trim() || draft.name,
                brand: brand.trim() || draft.brand,
              })
              applyCandidate(next)
              setUnit(next.serving.unit ?? '100 g')
            }}
          >
            Use 100 g serving
          </button>
        ) : null}
        <ReviewField
          label={derived ? 'Calories (derived)' : 'Calories'}
          id="review-calories"
          value={calories}
          error={errorFor('calories')}
          inputMode="decimal"
          onChange={(value) => {
            setCalories(value)
            setErrors((current) => current.filter((item) => item.path !== 'calories'))
          }}
        />
        <div className="grid grid-cols-2 gap-3">
          <OptionalMacro id="review-protein" label="Protein g" value={protein} onChange={setProtein} />
          <OptionalMacro id="review-carbs" label="Carbs g" value={carbs} onChange={setCarbs} />
          <OptionalMacro id="review-fat" label="Fat g" value={fat} onChange={setFat} />
          <OptionalMacro id="review-fiber" label="Fiber g" value={fiber} onChange={setFiber} />
        </div>
        <p className="text-sm text-zinc-500">Source · Open Food Facts</p>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    </NutritionSheet>
  )
}

function ReviewField({
  label,
  id,
  value,
  error,
  onChange,
  inputMode,
}: {
  label: string
  id: string
  value: string
  error?: string
  onChange: (value: string) => void
  inputMode?: 'decimal' | 'numeric'
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={cn(inputClass, error && 'border-red-500')}
        value={value}
        inputMode={inputMode}
        aria-invalid={error ? true : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <p className="mt-1 text-sm text-red-700">{error}</p> : null}
    </div>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelClass} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  )
}

function OptionalMacro({
  id,
  label,
  value,
  onChange,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <Field label={label} htmlFor={id}>
      <input id={id} className={inputClass} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  )
}

function optionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}
