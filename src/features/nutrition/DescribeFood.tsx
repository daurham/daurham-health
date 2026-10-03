import { useState } from 'react'
import {
  MEAL_PORTION_SCALES,
  NUTRITION_CONFIG,
  NUTRITION_MEALS,
  canScaleDescriptionItem,
  formatDescriptionItemPortion,
  reconstructDescriptionText,
  scaleDescriptionItem,
  scaleMealEstimate,
  sumDescriptionEstimateItems,
  validateMealEstimateReview,
  type DescriptionEstimateCandidate,
  type DescriptionEstimateItem,
  type MealEstimateNutrients,
  type MealPortionScale,
  type NutritionEntry,
  type NutritionFood,
} from '@/domain/nutrition'
import { commitFoodDescription, describeFoodText, saveAiReusableFood } from './api'
import { mealLabel } from './format'
import { NutritionSheet } from './Sheet'
import { CatalogCommitFooter } from './CatalogCommitFooter'

const inputClass =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-zinc-500 md:text-sm'
const labelClass = 'mb-1 block text-sm font-medium text-zinc-700'
const primaryClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50'
const secondaryClass =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900'

const PORTION_LABELS: Record<MealPortionScale, string> = {
  0.75: '-25%',
  0.9: '-10%',
  1: 'As estimated',
  1.1: '+10%',
  1.25: '+25%',
}

export function DescribeFoodSheet({
  date,
  text,
  review,
  unavailable,
  message,
  provider,
  onClose,
  onBack,
  onLogged,
  onSavedFood,
  onManual,
  onRetry,
  onTryLocal,
}: {
  date: string
  text: string
  review: DescriptionEstimateCandidate | null
  unavailable: boolean
  message?: string | null
  provider: 'gemini' | 'home_ai'
  onClose: () => void
  onBack: () => void
  onLogged: (entries: NutritionEntry[]) => void
  onSavedFood?: (food: NutritionFood) => void
  onManual: () => void
  onRetry?: () => void
  onTryLocal?: () => void
}) {
  if (unavailable || !review) {
    return (
      <NutritionSheet title="Review estimate" onClose={onClose}>
        <p className="text-sm text-zinc-800">{message || 'Meal analysis is temporarily unavailable.'}</p>
        {text ? <p className="mt-3 whitespace-pre-wrap text-sm text-zinc-600">{text}</p> : null}
        <div className="mt-4 space-y-2">
          {onRetry ? (
            <button type="button" className={primaryClass} onClick={onRetry}>
              Retry Gemini
            </button>
          ) : null}
          {onTryLocal ? (
            <button type="button" className={secondaryClass + ' w-full'} onClick={onTryLocal}>
              Try local AI
            </button>
          ) : null}
          <button type="button" className={secondaryClass + ' w-full'} onClick={onManual}>
            Build meal manually
          </button>
          <button type="button" className="text-sm text-zinc-600 underline" onClick={onBack}>
            Back
          </button>
        </div>
      </NutritionSheet>
    )
  }

  return (
    <DescriptionEstimateSheet
      date={date}
      text={text}
      review={review}
      provider={provider}
      onClose={onClose}
      onBack={onBack}
      onLogged={onLogged}
      onSavedFood={onSavedFood}
    />
  )
}

function DescriptionEstimateSheet({
  date,
  text,
  review,
  provider,
  onClose,
  onBack,
  onLogged,
  onSavedFood,
}: {
  date: string
  text: string
  review: DescriptionEstimateCandidate
  provider: 'gemini' | 'home_ai'
  onClose: () => void
  onBack: () => void
  onLogged: (entries: NutritionEntry[]) => void
  onSavedFood?: (food: NutritionFood) => void
}) {
  const [current, setCurrent] = useState(review)
  const [name, setName] = useState(review.name)
  const [meal, setMeal] = useState<(typeof NUTRITION_MEALS)[number] | ''>('')
  const [baselineItems, setBaselineItems] = useState(review.items)
  const [baseline, setBaseline] = useState<MealEstimateNutrients>(() => sumDescriptionEstimateItems(review.items))
  const [items, setItems] = useState(review.items)
  const [scale, setScale] = useState<MealPortionScale>(1)
  const [values, setValues] = useState<MealEstimateNutrients>(baseline)
  const [needsRecalc, setNeedsRecalc] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function applyScale(next: MealPortionScale) {
    setScale(next)
    setValues(scaleMealEstimate(baseline, next))
  }

  function updateItem(id: string, quantity: number | null, unit: string) {
    const original = baselineItems.find((item) => item.id === id)
    if (!original) {
      return
    }
    if (canScaleDescriptionItem(original, quantity, unit)) {
      const nextItems = items.map((item) => (item.id === id ? scaleDescriptionItem(original, quantity, unit) : item))
      setItems(nextItems)
      setValues(sumDescriptionEstimateItems(nextItems))
      setNeedsRecalc(false)
      return
    }
    setItems((currentItems) => currentItems.map((item) => (item.id === id ? { ...item, quantity, unit } : item)))
    setNeedsRecalc(true)
  }

  async function recalculate() {
    setBusy(true)
    setError(null)
    try {
      const next = await describeFoodText(reconstructDescriptionText(items) || text, provider)
      const nextBaseline = sumDescriptionEstimateItems(next.items)
      setCurrent(next)
      setName(next.name)
      setBaselineItems(next.items)
      setBaseline(nextBaseline)
      setItems(next.items)
      setValues(nextBaseline)
      setScale(1)
      setNeedsRecalc(false)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not recalculate')
    } finally {
      setBusy(false)
    }
  }

  function reusableFoodInput() {
    const grams = items.length > 0 && items.every((item) => item.estimatedGrams != null)
      ? items.reduce((sum, item) => sum + (item.estimatedGrams ?? 0), 0)
      : null
    const single = items.length === 1 ? items[0] : null
    return {
      name: name.trim(),
      text: current.original || text,
      servingQuantity: single?.quantity && single.quantity > 0 ? single.quantity : 1,
      servingUnit: single?.unit.trim() || 'meal',
      servingGrams: grams && grams > 0 ? grams : null,
      calories: values.calories,
      protein: values.proteinGrams,
      carbs: values.carbsGrams,
      fat: values.fatGrams,
      fiber: values.fiberGrams,
      sodium: values.sodiumMg,
      provider,
      model: current.model ?? null,
      originalCalories: baseline.calories,
      adjusted:
        name.trim() !== review.name.trim() ||
        scale !== 1 ||
        values.calories !== baseline.calories ||
        values.proteinGrams !== baseline.proteinGrams ||
        values.carbsGrams !== baseline.carbsGrams ||
        values.fatGrams !== baseline.fatGrams ||
        values.fiberGrams !== baseline.fiberGrams ||
        values.sodiumMg !== baseline.sodiumMg,
    } as const
  }

  async function save(log: boolean) {
    const nextErrors = validateMealEstimateReview({ name, calories: values.calories })
    if (nextErrors.length > 0) {
      setError(nextErrors[0]?.message ?? 'Review the estimate before saving.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let reusable: NutritionFood | null = null
      try {
        reusable = (await saveAiReusableFood(reusableFoodInput())).food
      } catch (caught) {
        const duplicate = caught instanceof Error && /already exists/i.test(caught.message)
        if (!log || !duplicate) {
          throw caught
        }
      }
      if (!log) {
        if (!reusable) {
          throw new Error('Could not save this AI food to Pantry.')
        }
        onSavedFood?.(reusable)
        return
      }
      const saved = await commitFoodDescription({
        text: current.original || text,
        logDate: date,
        timezone: NUTRITION_CONFIG.calendarTimeZone,
        meal: meal === '' ? null : meal,
        name: name.trim(),
        calories: values.calories,
        proteinGrams: values.proteinGrams,
        carbsGrams: values.carbsGrams,
        fatGrams: values.fatGrams,
        fiberGrams: values.fiberGrams,
        sodiumMg: values.sodiumMg,
        portionScale: scale,
        items,
      })
      onLogged(saved.entries)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : log ? 'Could not save meal' : 'Could not save food')
    } finally {
      setBusy(false)
    }
  }

  return (
    <NutritionSheet title="Review estimate" onClose={onClose}>
      <p className="text-sm text-zinc-600">{current.original || text}</p>
      <label className="mt-4 block">
        <span className={labelClass}>Meal name</span>
        <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      {items.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-zinc-700">What AI understood</p>
          <div className="mt-2 space-y-3">
            {items.map((item) => (
              <DescriptionItemCard key={item.id} item={item} onChange={updateItem} />
            ))}
          </div>
        </div>
      ) : null}
      {current.assumptions.length > 0 ? (
        <div className="mt-4">
          <p className="text-sm font-medium text-zinc-700">Assumptions</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-zinc-500">
            {current.assumptions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {needsRecalc ? (
        <button type="button" className={secondaryClass + ' mt-4 w-full'} disabled={busy} onClick={() => void recalculate()}>
          Recalculate
        </button>
      ) : null}
      <div className="mt-4">
        <p className="text-sm font-medium text-zinc-700">Portion estimate</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {MEAL_PORTION_SCALES.map((option) => (
            <button
              key={option}
              type="button"
              className={`min-h-11 rounded-md px-3 text-sm ${scale === option ? 'bg-zinc-900 text-white' : 'border border-zinc-300 bg-white text-zinc-900'}`}
              onClick={() => applyScale(option)}
            >
              {PORTION_LABELS[option]}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <p className="text-sm font-medium text-zinc-700">Estimated nutrition</p>
        <EstimateField label="Calories" suffix="kcal" value={values.calories} onChange={(calories) => setValues((currentValues) => ({ ...currentValues, calories: calories ?? 0 }))} />
        <EstimateField label="Protein" suffix="g" value={values.proteinGrams} onChange={(proteinGrams) => setValues((currentValues) => ({ ...currentValues, proteinGrams: proteinGrams ?? 0 }))} />
        <EstimateField label="Carbs" suffix="g" value={values.carbsGrams} onChange={(carbsGrams) => setValues((currentValues) => ({ ...currentValues, carbsGrams: carbsGrams ?? 0 }))} />
        <EstimateField label="Fat" suffix="g" value={values.fatGrams} onChange={(fatGrams) => setValues((currentValues) => ({ ...currentValues, fatGrams: fatGrams ?? 0 }))} />
        <EstimateField
          label="Fiber"
          suffix="g"
          value={values.fiberGrams}
          onChange={(fiberGrams) => setValues((currentValues) => ({ ...currentValues, fiberGrams }))}
        />
        <EstimateField
          label="Sodium"
          suffix="mg"
          value={values.sodiumMg}
          onChange={(sodiumMg) => setValues((currentValues) => ({ ...currentValues, sodiumMg }))}
        />
      </div>
      <label className="mt-4 block">
        <span className={labelClass}>Meal</span>
        <select className={inputClass} value={meal} onChange={(event) => setMeal(event.target.value as typeof meal)}>
          <option value="">Unset</option>
          {NUTRITION_MEALS.map((item) => (
            <option key={item} value={item}>
              {mealLabel(item)}
            </option>
          ))}
        </select>
      </label>
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
      <div className="mt-4">
        <CatalogCommitFooter
          date={date}
          busy={busy}
          onBack={onBack}
          onSaveForLater={() => void save(false)}
          onAddToDate={() => void save(true)}
        />
      </div>
    </NutritionSheet>
  )
}

function DescriptionItemCard({
  item,
  onChange,
}: {
  item: DescriptionEstimateItem
  onChange: (id: string, quantity: number | null, unit: string) => void
}) {
  return (
    <section className="rounded-lg border border-zinc-200 p-3">
      <h3 className="font-medium capitalize">{item.name}</h3>
      <p className="mt-1 text-sm text-zinc-500">{formatDescriptionItemPortion(item)}</p>
      <div className="mt-3 grid grid-cols-[1fr_7rem] gap-2">
        <input
          className={inputClass}
          inputMode="decimal"
          aria-label={`Amount for ${item.name}`}
          value={item.quantity ?? ''}
          onChange={(event) => {
            const next = event.target.value.trim()
            if (!next) {
              onChange(item.id, null, item.unit)
              return
            }
            const parsed = Number(next)
            onChange(item.id, Number.isFinite(parsed) ? parsed : item.quantity, item.unit)
          }}
        />
        <input
          className={inputClass}
          aria-label={`Unit for ${item.name}`}
          value={item.unit}
          onChange={(event) => onChange(item.id, item.quantity, event.target.value)}
        />
      </div>
      {item.assumption ? <p className="mt-2 text-sm text-zinc-500">{item.assumption}</p> : null}
    </section>
  )
}

function EstimateField({
  label,
  suffix,
  value,
  onChange,
}: {
  label: string
  suffix: string
  value: number | null
  onChange: (value: number | null) => void
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <div className="flex items-center gap-2">
        <input
          className={inputClass}
          inputMode="decimal"
          type="text"
          value={value ?? ''}
          onChange={(event) => {
            const next = event.target.value.trim()
            if (!next) {
              onChange(label === 'Fiber' || label === 'Sodium' ? null : 0)
              return
            }
            const parsed = Number(next)
            onChange(Number.isFinite(parsed) ? parsed : value)
          }}
        />
        <span className="text-sm text-zinc-500">{suffix}</span>
      </div>
    </label>
  )
}
