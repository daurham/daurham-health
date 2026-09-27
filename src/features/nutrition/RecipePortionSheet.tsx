import { useMemo, useState } from 'react'
import {
  NUTRITION_CONFIG,
  recipeDefinedAverageGrams,
  resolveRecipePortion,
  type LoggableRecipeVersion,
  type NutritionEntry,
  type RecipePortionKind,
} from '@/domain/nutrition'
import { primaryButtonClass, secondaryButtonClass } from '@/lib'
import { addToDateLabel } from './catalog-actions'
import { formatGrams, formatNumber } from './format'
import { logRecipeEntry } from './api'
import { NutritionSheet } from './Sheet'

const primaryClass = `${primaryButtonClass} w-full`
const secondaryClass = `${secondaryButtonClass} w-full`

export function RecipePortionSheet({
  date,
  recipe,
  title,
  onClose,
  onBack,
  onLogged,
}: {
  date: string
  recipe: LoggableRecipeVersion
  title: string
  onClose: () => void
  onBack?: () => void
  onLogged: (entry: NutritionEntry) => void
}) {
  const modes = availableModes(recipe)
  const [kind, setKind] = useState<RecipePortionKind>(modes[0] ?? 'fraction')
  const [amount, setAmount] = useState('1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const parsed = Number(amount)
  const resolved = useMemo(() => resolveRecipePortion(recipe, kind, parsed), [recipe, kind, parsed])
  const average = recipeDefinedAverageGrams(recipe)

  async function log() {
    if (busy) return
    if ('error' in resolved) {
      setError(resolved.error)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const entry = await logRecipeEntry({
        recipeVersionId: recipe.recipeVersionId,
        logDate: date,
        portionKind: kind,
        amount: parsed,
        timezone: NUTRITION_CONFIG.calendarTimeZone,
      })
      onLogged(entry)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not log recipe')
      setBusy(false)
    }
  }

  return (
    <NutritionSheet
      title={title}
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          {onBack ? (
            <button type="button" className={secondaryClass} onClick={onBack}>
              Back
            </button>
          ) : null}
          <button type="button" className={primaryClass} disabled={busy || 'error' in resolved} onClick={() => void log()}>
            {busy ? 'Logging…' : addToDateLabel(date)}
          </button>
        </div>
      }
    >
      <p className="text-sm text-zinc-600">
        {recipe.name} · Recipe v{recipe.version}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {modes.map((mode) => (
          <button
            key={mode}
            type="button"
            className={mode === kind ? primaryButtonClass : secondaryButtonClass}
            onClick={() => {
              setKind(mode)
              setAmount('1')
              setError(null)
            }}
          >
            {modeLabel(mode)}
          </button>
        ))}
      </div>
      <label className="mt-4 block text-sm text-zinc-700" htmlFor="recipe-portion-amount">
        {kind === 'grams' ? 'Grams' : kind === 'servings' ? 'Servings' : 'Fraction of the recipe'}
      </label>
      <input
        id="recipe-portion-amount"
        className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
        inputMode="decimal"
        value={amount}
        onChange={(event) => {
          setAmount(event.target.value)
          setError(null)
        }}
      />
      <div className="mt-2 flex flex-wrap gap-2">
        {presets(kind).map((preset) => (
          <button key={preset.label} type="button" className={secondaryButtonClass} onClick={() => setAmount(preset.amount)}>
            {preset.label}
          </button>
        ))}
      </div>
      {average != null ? (
        <p className="mt-3 text-sm text-zinc-500">Recipe-defined average {formatNumber(average, 1)} g per serving. A weighed portion is a separate input.</p>
      ) : null}
      {'error' in resolved ? (
        <p className="mt-3 text-sm text-zinc-700">{resolved.error}</p>
      ) : (
        <div className="mt-4 rounded-xl border border-zinc-200 bg-white p-3 text-sm">
          <p>{formatNumber(resolved.calories, 2)} kcal</p>
          <p>{macroLine(resolved.protein, 'Protein')}</p>
          <p>{macroLine(resolved.carbs, 'Carbs')}</p>
          <p>{macroLine(resolved.fat, 'Fat')}</p>
          <p className="mt-2 text-zinc-600">{resolved.description}</p>
        </div>
      )}
      {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
    </NutritionSheet>
  )
}

function availableModes(recipe: LoggableRecipeVersion): RecipePortionKind[] {
  const modes: RecipePortionKind[] = []
  if (recipe.yieldServings != null) modes.push('servings')
  modes.push('fraction')
  if (recipe.finishedWeightG != null) modes.push('grams')
  return modes
}

function modeLabel(kind: RecipePortionKind): string {
  if (kind === 'servings') return 'By serving'
  if (kind === 'grams') return 'By weight'
  return 'By batch'
}

function presets(kind: RecipePortionKind): Array<{ label: string; amount: string }> {
  if (kind === 'servings') {
    return [
      { label: '0.5', amount: '0.5' },
      { label: '1', amount: '1' },
      { label: '1.5', amount: '1.5' },
      { label: '2', amount: '2' },
    ]
  }
  if (kind === 'grams') return []
  return [
    { label: '1/4', amount: '0.25' },
    { label: '1/3', amount: String(1 / 3) },
    { label: '1/2', amount: '0.5' },
    { label: 'whole', amount: '1' },
  ]
}

function macroLine(value: number | null, label: string): string {
  if (value == null) return `${label} not fully known`
  return `${label} ${formatGrams(value) ?? '—'}`
}
