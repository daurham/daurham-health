import { useMemo, useState } from 'react'
import {
  NUTRITION_CONFIG,
  descriptionComponentTotals,
  descriptionPortion,
  type NutritionEntry,
  type NutritionFood,
} from '@/domain/nutrition'
import { commitFoodDescription, createNutritionFood, type FoodDescriptionReview } from './api'
import { formatGrams, formatKcal } from './format'
import { NutritionSheet } from './Sheet'

const inputClass =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-zinc-500 md:text-sm'
const primaryClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50'
const secondaryClass =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900'

type Choice = {
  key: string
  label: string
  food: NutritionFood
  fdcId: number | null
}

type Row = {
  id: string
  proposedName: string
  quantity: string
  unit: string
  ambiguity: string | null
  included: boolean
  choiceKey: string
  choices: Choice[]
  creating: boolean
}

function stubFood(input: {
  id: string
  name: string
  servingQuantity: number
  servingUnit: string
  servingGrams: number | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
}): NutritionFood {
  return {
    id: input.id,
    name: input.name,
    brand: null,
    barcode: null,
    catalogKind: 'ingredient',
    servingQuantity: input.servingQuantity,
    servingUnit: input.servingUnit,
    servingGrams: input.servingGrams,
    calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    fiber: input.fiber,
    sourceKind: 'import',
    isStaple: false,
    archived: false,
    notes: null,
    createdAt: '',
    updatedAt: '',
  }
}

function rowsFromReview(review: FoodDescriptionReview): Row[] {
  return review.components.map((component) => {
    const choices: Choice[] = [
      ...component.matches.map((match) => ({
        key: `food:${match.foodId}`,
        label: match.name,
        fdcId: null,
        food: stubFood({ ...match, id: match.foodId }),
      })),
      ...component.usda.map((item) => ({
        key: `fdc:${item.fdcId}`,
        label: `${item.name} · USDA`,
        fdcId: item.fdcId,
        food: stubFood({
          id: `fdc-${item.fdcId}`,
          name: item.name,
          servingQuantity: item.servingQuantity,
          servingUnit: item.servingUnit,
          servingGrams: item.servingGrams,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          fiber: item.fiber,
        }),
      })),
    ]
    const selected = component.selectedFoodId ? `food:${component.selectedFoodId}` : ''
    return {
      id: component.id,
      proposedName: component.proposedName,
      quantity: component.quantity == null ? '' : String(component.quantity),
      unit: component.unit,
      ambiguity: component.ambiguity,
      included: true,
      choiceKey: choices.some((choice) => choice.key === selected) ? selected : '',
      choices,
      creating: false,
    }
  })
}

export function DescribeFoodSheet({
  date,
  text,
  review,
  unavailable,
  message,
  onClose,
  onBack,
  onLogged,
  onManual,
  onRetry,
  onTryLocal,
}: {
  date: string
  text: string
  review: FoodDescriptionReview | null
  unavailable: boolean
  message?: string | null
  onClose: () => void
  onBack: () => void
  onLogged: (entries: NutritionEntry[]) => void
  onManual: () => void
  onRetry?: () => void
  onTryLocal?: () => void
}) {
  const [rows, setRows] = useState<Row[]>(() => (review ? rowsFromReview(review) : []))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const totals = useMemo(() => {
    return descriptionComponentTotals(
      rows.map((row) => {
        const choice = row.choices.find((item) => item.key === row.choiceKey) ?? null
        const quantity = Number(row.quantity)
        return {
          included: row.included,
          quantity: Number.isFinite(quantity) ? quantity : null,
          unit: row.unit,
          food: choice?.food ?? null,
        }
      }),
    )
  }, [rows])

  function update(id: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const saved = await commitFoodDescription({
        text,
        logDate: date,
        timezone: NUTRITION_CONFIG.calendarTimeZone,
        components: rows.map((row) => {
          const choice = row.choices.find((item) => item.key === row.choiceKey) ?? null
          const quantity = Number(row.quantity)
          const food = choice?.food ?? null
          const portion = descriptionPortion({
            quantity: Number.isFinite(quantity) ? quantity : null,
            unit: row.unit,
            food,
          })
          return {
            id: row.id,
            included: row.included,
            proposedName: row.proposedName,
            foodId: choice && !choice.fdcId ? choice.food.id : null,
            fdcId: choice?.fdcId ?? null,
            quantity: Number.isFinite(quantity) ? quantity : null,
            unit: row.unit,
            grams: portion.grams,
          }
        }),
      })
      onLogged(saved.entries)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save meal')
    } finally {
      setBusy(false)
    }
  }

  if (unavailable || !review) {
    return (
      <NutritionSheet title="Review food description" onClose={onClose}>
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
    <NutritionSheet
      title="Review food description"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" className={secondaryClass} onClick={onBack}>
            Back
          </button>
          <button type="button" className={primaryClass} disabled={busy} onClick={() => void save()}>
            {busy ? 'Saving…' : 'Save meal'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">Original: {review.original}</p>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {rows.map((row) => {
          const choice = row.choices.find((item) => item.key === row.choiceKey) ?? null
          const quantity = Number(row.quantity)
          const portion = descriptionPortion({
            quantity: Number.isFinite(quantity) ? quantity : null,
            unit: row.unit,
            food: choice?.food ?? null,
          })
          return (
            <section key={row.id} className="rounded-lg border border-zinc-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-medium capitalize">{row.proposedName}</h3>
                <button type="button" className="text-sm text-zinc-500" onClick={() => update(row.id, { included: false })}>
                  Remove
                </button>
              </div>
              {row.included ? (
                <div className="mt-3 space-y-2">
                  <label className="block text-sm text-zinc-600">
                    Matched food
                    <select
                      className={inputClass + ' mt-1'}
                      value={row.choiceKey}
                      onChange={(event) => update(row.id, { choiceKey: event.target.value })}
                    >
                      <option value="">Choose a food</option>
                      {row.choices.map((item) => (
                        <option key={item.key} value={item.key}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="grid grid-cols-[1fr_7rem] gap-2">
                    <input
                      className={inputClass}
                      inputMode="decimal"
                      aria-label={`Amount for ${row.proposedName}`}
                      value={row.quantity}
                      onChange={(event) => update(row.id, { quantity: event.target.value })}
                    />
                    <input
                      className={inputClass}
                      aria-label={`Unit for ${row.proposedName}`}
                      value={row.unit}
                      onChange={(event) => update(row.id, { unit: event.target.value })}
                    />
                  </div>
                  {row.ambiguity || !portion.resolved ? (
                    <p className="text-sm text-amber-800">
                      {row.ambiguity ?? 'This amount is not resolved.'}
                      <button type="button" className="ml-2 underline" onClick={() => update(row.id, { unit: 'g', quantity: '' })}>
                        Use grams instead
                      </button>
                    </p>
                  ) : null}
                  <button type="button" className="text-sm text-zinc-600 underline" onClick={() => update(row.id, { creating: !row.creating })}>
                    Create missing food
                  </button>
                  {row.creating ? (
                    <CreateFood
                      name={row.proposedName}
                      onCreated={(food) => {
                        const key = `food:${food.id}`
                        update(row.id, {
                          creating: false,
                          choiceKey: key,
                          choices: [...row.choices, { key, label: food.name, food, fdcId: null }],
                        })
                      }}
                    />
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 text-sm text-zinc-500">Removed</p>
              )}
            </section>
          )
        })}
        <button
          type="button"
          className={secondaryClass + ' w-full'}
          onClick={() =>
            setRows((current) => [
              ...current,
              {
                id: `extra-${current.length + 1}`,
                proposedName: 'food',
                quantity: '1',
                unit: 'serving',
                ambiguity: null,
                included: true,
                choiceKey: '',
                choices: [],
                creating: true,
              },
            ])
          }
        >
          Add component
        </button>
        <p className="text-sm text-zinc-800">
          Calculated total {totals ? `${formatKcal(totals.calories)} · ${formatGrams(totals.protein) ?? '—'} protein` : '—'}
        </p>
      </div>
    </NutritionSheet>
  )
}

function CreateFood({ name, onCreated }: { name: string; onCreated: (food: NutritionFood) => void }) {
  const [foodName, setFoodName] = useState(name)
  const [calories, setCalories] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <div className="space-y-2 rounded-md bg-zinc-50 p-3">
      <input className={inputClass} value={foodName} onChange={(event) => setFoodName(event.target.value)} />
      <input className={inputClass} inputMode="decimal" placeholder="Calories per serving" value={calories} onChange={(event) => setCalories(event.target.value)} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <button
        type="button"
        className={primaryClass}
        disabled={busy}
        onClick={() => {
          const kcal = Number(calories)
          if (!foodName.trim() || !Number.isFinite(kcal) || kcal < 0) {
            setError('Name and calories are required.')
            return
          }
          setBusy(true)
          void createNutritionFood({
            name: foodName.trim(),
            servingQuantity: 1,
            servingUnit: 'serving',
            calories: kcal,
            catalogKind: 'custom',
            sourceKind: 'manual',
          })
            .then(onCreated)
            .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not create food'))
            .finally(() => setBusy(false))
        }}
      >
        Save food
      </button>
    </div>
  )
}
