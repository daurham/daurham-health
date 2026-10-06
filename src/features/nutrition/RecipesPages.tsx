import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { NutritionFood } from '@/domain/nutrition'
import {
  applyRecipeAssistToBuilder,
  assistedLinesBlockSave,
  RECIPE_ASSIST_QUERY_MAX,
  replaceOneUnresolved,
  transferSuggestedMeasure,
  type RecipeAssistDraft,
} from '@/domain/nutrition/recipe-assist'
import { composeRecipe, supportedDisplayUnits, type RecipeFoodBasis } from '@/domain/nutrition/recipes'
import { healthCalendarDateFromNow } from '@/domain/time'
import { LoadErrorNotice, primaryButtonClass, secondaryButtonClass } from '@/lib'
import { patchNutritionFood } from './api'
import { parseNutritionDateParam } from './date'
import { formatNumber } from './format'
import { LabelCaptureSheet } from './LabelCapture'
import { RecipeAssistSheet } from './RecipeAssistSheet'
import { RecipeIngredientSheet } from './RecipeIngredientSheet'
import { RecipePortionSheet } from './RecipePortionSheet'
import {
  archiveRecipe,
  commitRecipeVersion,
  convertLegacyRecipe,
  createRecipe,
  fetchRecipe,
  fetchRecipeIndex,
  fetchRecipeVersion,
  previewRecipeChange,
  restoreRecipe,
  type LegacyRecipeListItem,
  type RecipeDetail,
  type RecipeIndex,
  type RecipePreview,
} from './recipes-api'

const fieldClass = 'mt-1 block min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base'

function loggableFrom(recipe: RecipeDetail) {
  return {
    recipeId: recipe.id,
    recipeVersionId: recipe.version.id,
    name: recipe.version.name,
    version: recipe.version.version,
    caloriesKcal: recipe.version.caloriesKcal,
    proteinG: recipe.version.proteinG,
    carbsG: recipe.version.carbsG,
    fatG: recipe.version.fatG,
    fiberG: recipe.version.fiberG,
    sodiumMg: recipe.version.sodiumMg,
    yieldServings: recipe.version.yieldServings,
    finishedWeightG: recipe.version.finishedWeightG,
  }
}

function recipeKcal(value: number): string {
  return `${formatNumber(value, 1)} kcal`
}

function macroText(value: number | null, label: string): string {
  if (value == null) return `${label} not fully known`
  return `${formatNumber(value, 1)} g`
}

function queryForLine(lines: readonly DraftLine[], lineKey: string | null): string {
  const line = lines.find((item) => item.key === lineKey)
  return line?.status === 'unresolved' ? line.name : ''
}

function resolvedFromFood(food: NutritionFood, line: DraftLine | undefined): DraftLine {
  if (!line || line.status !== 'unresolved') {
    return { key: line?.key ?? crypto.randomUUID(), status: 'resolved', food, amount: '1', unit: 'serving', suggestion: null }
  }
  const measure = transferSuggestedMeasure({
    quantity: line.quantity,
    unit: line.unit,
    supportedUnits: supportedDisplayUnits({
      baseServingUnitSnapshot: food.servingUnit,
      baseWeightGramsSnapshot: food.servingGrams,
    }),
  })
  return {
    key: line.key,
    status: 'resolved',
    food,
    amount: measure.amount,
    unit: measure.unit,
    suggestion: line.sourceText,
  }
}

function foodBasis(food: NutritionFood): RecipeFoodBasis {
  return {
    id: food.id,
    name: food.name,
    servingQuantity: food.servingQuantity,
    servingUnit: food.servingUnit,
    servingGrams: food.servingGrams,
    calories: food.calories,
    protein: food.protein,
    carbs: food.carbs,
    fat: food.fat,
    fiber: food.fiber,
    sodium: food.sodium ?? null,
    sourceKind: food.sourceKind,
    barcode: food.barcode,
    archived: food.archived,
  }
}

export function RecipesPage() {
  const navigate = useNavigate()
  const [index, setIndex] = useState<RecipeIndex | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyLegacyId, setBusyLegacyId] = useState<string | null>(null)
  const [showHiddenLegacy, setShowHiddenLegacy] = useState(false)

  useEffect(() => {
    let active = true
    fetchRecipeIndex()
      .then((next) => {
        if (active) setIndex(next)
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load recipes')
      })
    return () => {
      active = false
    }
  }, [])

  const legacyRecipes = index?.legacyRecipes ?? []
  const hiddenLegacyCount = legacyRecipes.filter((recipe) => recipe.archived).length
  const visibleLegacyRecipes = showHiddenLegacy ? legacyRecipes : legacyRecipes.filter((recipe) => !recipe.archived)

  async function changeLegacyVisibility(recipe: LegacyRecipeListItem, archived: boolean) {
    if (busyLegacyId) return
    if (
      archived &&
      !window.confirm(
        `Hide "${recipe.name}"? It will stop appearing in Add Food and Recent. Historical logs will stay unchanged.`,
      )
    ) {
      return
    }
    setBusyLegacyId(recipe.id)
    setError(null)
    try {
      const updated = await patchNutritionFood(recipe.id, { archived })
      setIndex((current) =>
        current
          ? {
              ...current,
              legacyRecipes: current.legacyRecipes.map((item) =>
                item.id === recipe.id ? { ...item, archived: updated.archived } : item,
              ),
            }
          : current,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update the legacy recipe')
    } finally {
      setBusyLegacyId(null)
    }
  }

  async function convertLegacy(recipe: LegacyRecipeListItem) {
    if (busyLegacyId) return
    setBusyLegacyId(recipe.id)
    setError(null)
    try {
      const converted = await convertLegacyRecipe(recipe.id)
      void navigate(`/nutrition/recipes/${converted.recipe.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not convert the legacy recipe')
      setBusyLegacyId(null)
    }
  }

  return (
    <section className="w-full min-w-0 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm text-zinc-500">
            <Link to="/nutrition" className="underline">
              Nutrition
            </Link>
          </p>
          <h1 className="text-xl font-semibold tracking-tight md:text-2xl">Recipes</h1>
        </div>
        <Link to="/nutrition/recipes/new" className={primaryButtonClass}>
          New recipe
        </Link>
      </div>
      {error ? <LoadErrorNotice message={error} /> : null}
      {index == null && !error ? <p className="text-sm text-zinc-600">Loading recipes…</p> : null}
      {index?.recipes.length === 0 ? <p className="text-sm text-zinc-600">No active recipes yet.</p> : null}
      <ul className="space-y-2">
        {index?.recipes.map((recipe) => (
          <li key={recipe.id}>
            <Link to={`/nutrition/recipes/${recipe.id}`} className="block rounded-xl border border-zinc-200 bg-white px-4 py-3">
              <p className="font-medium">{recipe.name}</p>
              <p className="text-sm text-zinc-600">v{recipe.version}{recipe.isCurrent ? ' · current' : ''}</p>
              <p className="text-sm text-zinc-800">{recipeKcal(recipe.caloriesKcal)} whole recipe</p>
              {recipe.yieldServings != null ? (
                <p className="text-sm text-zinc-600">{formatNumber(recipe.yieldServings, 1)} servings</p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>

      {legacyRecipes.length > 0 ? (
        <section id="legacy-recipes" className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="font-semibold">Legacy recipes from the old app</h2>
              <p className="mt-1 max-w-3xl text-sm text-zinc-700">
                These were migrated as flat food records before the current versioned Recipe system existed. Convert rebuilds a
                composed recipe from its old ingredient links and then hides the flat copy, so it stops competing in Add Food.
                Hiding a copy never changes old nutrition logs.
              </p>
            </div>
            {hiddenLegacyCount > 0 ? (
              <button
                type="button"
                className={secondaryButtonClass}
                onClick={() => setShowHiddenLegacy((current) => !current)}
              >
                {showHiddenLegacy ? 'Hide archived' : `Show hidden (${hiddenLegacyCount})`}
              </button>
            ) : null}
          </div>
          {visibleLegacyRecipes.length === 0 ? (
            <p className="text-sm text-zinc-600">All legacy recipe copies are hidden.</p>
          ) : (
            <ul className="space-y-2">
              {visibleLegacyRecipes.map((recipe) => (
                <li key={recipe.id} className={`rounded-lg border border-zinc-200 bg-white p-3 ${recipe.archived ? 'opacity-70' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{recipe.name}</p>
                      <p className="text-sm text-zinc-600">
                        Legacy recipe · {recipeKcal(recipe.caloriesKcal)}
                        {recipe.usageCount > 0 ? ` · used ${recipe.usageCount} time${recipe.usageCount === 1 ? '' : 's'}` : ''}
                      </p>
                      {recipe.fiberG == null || recipe.sodiumMg == null ? (
                        <p className="mt-1 text-sm text-zinc-600">Old flat nutrition is missing fiber and/or sodium.</p>
                      ) : null}
                      {recipe.matchingRecipeId ? (
                        <p className="mt-1 text-sm text-zinc-700">A current Recipe with this exact name already exists.</p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {recipe.matchingRecipeId ? (
                        <Link to={`/nutrition/recipes/${recipe.matchingRecipeId}`} className={secondaryButtonClass}>
                          Open current recipe
                        </Link>
                      ) : recipe.archived ? null : (
                        <button
                          type="button"
                          className={primaryButtonClass}
                          disabled={busyLegacyId != null}
                          onClick={() => void convertLegacy(recipe)}
                        >
                          {busyLegacyId === recipe.id ? 'Converting…' : 'Convert to recipe'}
                        </button>
                      )}
                      <button
                        type="button"
                        className={secondaryButtonClass}
                        disabled={busyLegacyId != null}
                        onClick={() => void changeLegacyVisibility(recipe, !recipe.archived)}
                      >
                        {recipe.archived ? 'Restore old copy' : 'Hide old copy'}
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </section>
  )
}

type ResolvedLine = {
  key: string
  status: 'resolved'
  food: NutritionFood
  amount: string
  unit: string
  suggestion: string | null
}

type UnresolvedLine = {
  key: string
  status: 'unresolved'
  name: string
  quantity: number | null
  unit: string | null
  sourceText: string
  sourceRefs: string[]
}

type DraftLine = ResolvedLine | UnresolvedLine

export function NewRecipePage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [yieldServings, setYieldServings] = useState('')
  const [finishedWeightG, setFinishedWeightG] = useState('')
  const [lines, setLines] = useState<DraftLine[]>([])
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [flow, setFlow] = useState<null | { kind: 'sources' | 'label'; lineKey: string | null }>(null)
  const [assist, setAssist] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!name && !notes && lines.length === 0) {
      return
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [lines.length, name, notes])

  const unresolved = lines.some((line) => line.status === 'unresolved')
  const preview = useMemo(() => {
    if (assistedLinesBlockSave(lines)) return null
    return composeRecipe({
      name: name || 'Preview',
      notes,
      yieldServings: yieldServings.trim() ? Number(yieldServings) : null,
      finishedWeightG: finishedWeightG.trim() ? Number(finishedWeightG) : null,
      ingredients: lines.flatMap((line) =>
        line.status === 'resolved' ? [{ food: foodBasis(line.food), amount: Number(line.amount), unit: line.unit }] : [],
      ),
    })
  }, [finishedWeightG, lines, name, notes, yieldServings])

  function addFood(food: NutritionFood) {
    const lineKey = flow?.lineKey
    if (lineKey) {
      setLines((current) =>
        replaceOneUnresolved(current, lineKey, resolvedFromFood(food, current.find((line) => line.key === lineKey))),
      )
      setFocusKey(lineKey)
      setFlow(null)
      return
    }
    const key = crypto.randomUUID()
    setFocusKey(key)
    setLines((current) => [...current, { key, status: 'resolved', food, amount: '1', unit: 'serving', suggestion: null }])
    setFlow(null)
  }

  function applyDraft(draft: RecipeAssistDraft): string | null {
    const applied = applyRecipeAssistToBuilder({
      name,
      notes,
      yieldServings,
      finishedWeightG,
      ingredientCount: lines.length,
      draft,
    })
    if ('error' in applied) return applied.error
    setName(applied.name)
    setYieldServings(applied.yieldServings)
    setLines(applied.lines)
    setAssist(false)
    return null
  }

  function move(index: number, direction: -1 | 1) {
    setLines((current) => {
      const next = [...current]
      const target = index + direction
      const item = next[index]
      const other = next[target]
      if (!item || !other) return current
      next[index] = other
      next[target] = item
      return next
    })
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      if (assistedLinesBlockSave(lines)) {
        setError('Resolve each ingredient before saving.')
        setSaving(false)
        return
      }
      const created = await createRecipe({
        name,
        notes,
        yieldServings: yieldServings.trim() ? Number(yieldServings) : null,
        finishedWeightG: finishedWeightG.trim() ? Number(finishedWeightG) : null,
        ingredients: lines.flatMap((line) =>
          line.status === 'resolved' ? [{ foodId: line.food.id, amount: Number(line.amount), unit: line.unit }] : [],
        ),
      })
      void navigate(`/nutrition/recipes/${created.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save recipe')
      setSaving(false)
    }
  }

  const previewError = preview && 'error' in preview ? preview.error : null
  const previewRecipe = preview && !('error' in preview) ? preview : null

  return (
    <section className="w-full min-w-0 space-y-4">
      <div>
        <p className="text-sm text-zinc-500">
          <Link to="/nutrition/recipes" className="underline">
            Recipes
          </Link>
        </p>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">New recipe</h1>
      </div>
      <form className="space-y-4" onSubmit={(event) => void onSubmit(event)}>
        <label className="block text-sm">
          Name
          <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
        <label className="block text-sm">
          Notes
          <textarea className={fieldClass} value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            Servings
            <input className={fieldClass} inputMode="decimal" value={yieldServings} onChange={(event) => setYieldServings(event.target.value)} />
          </label>
          <label className="block text-sm">
            Finished weight (g)
            <input className={fieldClass} inputMode="decimal" value={finishedWeightG} onChange={(event) => setFinishedWeightG(event.target.value)} />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={secondaryButtonClass} onClick={() => setFlow({ kind: 'sources', lineKey: null })}>
            Add ingredient
          </button>
          {lines.length === 0 ? (
            <button type="button" className={secondaryButtonClass} onClick={() => setAssist(true)}>
              Draft from recipe text
            </button>
          ) : null}
        </div>
        <ol className="space-y-3">
          {lines.map((line, index) => (
            <li key={line.key} className="rounded-xl border border-zinc-200 bg-white p-3">
              {line.status === 'unresolved' ? (
                <div className="space-y-2">
                  <p className="font-medium">{line.name}</p>
                  <p className="text-sm text-zinc-700">
                    Suggested {line.quantity ?? 'quantity not stated'}
                    {line.unit ? ` ${line.unit}` : ''}
                  </p>
                  <p className="text-sm text-zinc-600">Suggested from: {line.sourceText}</p>
                  <p className="text-sm text-zinc-600">Unresolved. This is not a saved food.</p>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className={secondaryButtonClass} onClick={() => setFlow({ kind: 'sources', lineKey: line.key })}>
                      Resolve food
                    </button>
                    <button type="button" className={secondaryButtonClass} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-medium">{line.food.name}</p>
                  <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input
                      className={fieldClass}
                      inputMode="decimal"
                      aria-label={`Amount for ${line.food.name}`}
                      autoFocus={line.key === focusKey}
                      value={line.amount}
                      onChange={(event) =>
                        setLines((current) => current.map((item) => (item.key === line.key ? { ...item, amount: event.target.value } : item)))
                      }
                    />
                    <input
                      className={fieldClass}
                      aria-label={`Unit for ${line.food.name}`}
                      value={line.unit}
                      onChange={(event) =>
                        setLines((current) => current.map((item) => (item.key === line.key ? { ...item, unit: event.target.value } : item)))
                      }
                    />
                    <button type="button" className={secondaryButtonClass} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>
                      Remove
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">
                    {supportedDisplayUnits({
                      baseServingUnitSnapshot: line.food.servingUnit,
                      baseWeightGramsSnapshot: line.food.servingGrams,
                    }).join(', ')}
                  </p>
                  {line.suggestion ? <p className="mt-2 text-sm text-zinc-600">Suggested from: {line.suggestion}</p> : null}
                  <div className="mt-2 flex gap-2">
                    <button type="button" className={secondaryButtonClass} onClick={() => move(index, -1)} disabled={index === 0}>
                      Up
                    </button>
                    <button type="button" className={secondaryButtonClass} onClick={() => move(index, 1)} disabled={index === lines.length - 1}>
                      Down
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ol>
        {unresolved ? <p className="text-sm text-zinc-700">Resolve each ingredient before this recipe has nutrition.</p> : null}
        {previewError ? <p className="text-sm text-red-800">{previewError}</p> : null}
        {previewRecipe ? (
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-500">Estimate until save</p>
            <p>{recipeKcal(previewRecipe.caloriesKcal)} whole recipe</p>
            <p className="text-sm text-zinc-700">{macroText(previewRecipe.proteinG, 'Protein')}</p>
            <p className="text-sm text-zinc-700">{macroText(previewRecipe.carbsG, 'Carbs')}</p>
            <p className="text-sm text-zinc-700">{macroText(previewRecipe.fatG, 'Fat')}</p>
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-800">{error}</p> : null}
        <button type="submit" className={primaryButtonClass} disabled={saving || assistedLinesBlockSave(lines) || previewError != null}>
          Save recipe
        </button>
      </form>
      {assist ? <RecipeAssistSheet onClose={() => setAssist(false)} onApply={applyDraft} /> : null}
      {flow?.kind === 'sources' ? (
        <RecipeIngredientSheet
          onClose={() => setFlow(null)}
          onFood={addFood}
          onLabel={() => setFlow({ kind: 'label', lineKey: flow.lineKey })}
          initialQuery={queryForLine(lines, flow.lineKey).slice(0, RECIPE_ASSIST_QUERY_MAX)}
        />
      ) : null}
      {flow?.kind === 'label' ? (
        <LabelCaptureSheet
          date={healthCalendarDateFromNow()}
          purpose="recipe"
          onClose={() => setFlow({ kind: 'sources', lineKey: flow.lineKey })}
          onBack={() => setFlow({ kind: 'sources', lineKey: flow.lineKey })}
          onLogged={() => undefined}
          onSavedFood={addFood}
        />
      ) : null}
    </section>
  )
}

export function RecipeDetailPage() {
  const { recipeId = '' } = useParams()
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [searchParams] = useSearchParams()
  const [logging, setLogging] = useState(false)

  useEffect(() => {
    let active = true
    fetchRecipe(recipeId)
      .then((next) => {
        if (active) setRecipe(next)
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load recipe')
      })
    return () => {
      active = false
    }
  }, [recipeId])

  async function changeActive(next: 'archive' | 'restore') {
    setBusy(true)
    setError(null)
    try {
      setRecipe(next === 'archive' ? await archiveRecipe(recipeId) : await restoreRecipe(recipeId))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update recipe')
    } finally {
      setBusy(false)
    }
  }

  if (error && !recipe) return <LoadErrorNotice message={error} />
  if (!recipe) return <p className="text-sm text-zinc-600">Loading recipe…</p>
  const version = recipe.version
  if (logging) {
    return (
      <RecipePortionSheet
        date={parseNutritionDateParam(searchParams.get('date'))}
        recipe={loggableFrom(recipe)}
        title={version.isCurrent ? `Log ${version.name}` : `Log ${version.name} · v${version.version}`}
        onClose={() => setLogging(false)}
        onLogged={() => setLogging(false)}
      />
    )
  }

  return (
    <section className="w-full min-w-0 space-y-4">
      <p className="text-sm text-zinc-500">
        <Link to="/nutrition/recipes" className="underline">
          Recipes
        </Link>
      </p>
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{version.name}</h1>
        <p className="text-sm text-zinc-600">
          v{version.version} · {version.isCurrent ? 'current' : 'historical'}
          {recipe.isActive ? '' : ' · archived'}
        </p>
        {version.isCurrent ? null : <p className="mt-2 text-sm text-zinc-700">This Recipe Version is preserved for history.</p>}
        {!recipe.isActive ? <p className="mt-2 text-sm text-zinc-700">Archived Recipe. Restore this Recipe before editing.</p> : null}
      </div>
      {version.isCurrent ? (
        <button type="button" className={primaryButtonClass} onClick={() => setLogging(true)}>
          Log recipe
        </button>
      ) : null}
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-sm text-zinc-500">Whole recipe</p>
        <p className="text-lg">{recipeKcal(version.caloriesKcal)}</p>
        <p>{macroText(version.proteinG, 'Protein')}</p>
        <p>{macroText(version.carbsG, 'Carbs')}</p>
        <p>{macroText(version.fatG, 'Fat')}</p>
        <p>{macroText(version.fiberG, 'Fiber')}</p>
        <p>{version.sodiumMg == null ? 'Sodium not fully known' : `${formatNumber(version.sodiumMg, 0)} mg sodium`}</p>
        {version.yieldServings != null ? <p className="mt-2 text-sm text-zinc-700">{formatNumber(version.yieldServings, 1)} servings</p> : null}
        {version.finishedWeightG != null ? <p className="text-sm text-zinc-700">{formatNumber(version.finishedWeightG, 1)} g finished weight</p> : null}
      </div>
      <ol className="space-y-2">
        {version.ingredients.map((line) => (
          <li key={line.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <p className="font-medium">{line.foodNameSnapshot}</p>
            <p className="text-sm text-zinc-600">
              {formatNumber(line.amount, 1)} {line.unit}
            </p>
            <p className="text-sm">{recipeKcal(line.lineCaloriesKcal)}</p>
            <p className="text-sm text-zinc-700">{macroText(line.lineProteinG, 'Protein')}</p>
            <p className="text-sm text-zinc-700">{macroText(line.lineCarbsG, 'Carbs')}</p>
            <p className="text-sm text-zinc-700">{macroText(line.lineFatG, 'Fat')}</p>
            <p className="text-sm text-zinc-700">{macroText(line.lineFiberG, 'Fiber')}</p>
            <p className="text-sm text-zinc-700">
              {line.lineSodiumMg == null ? 'Sodium not fully known' : `${formatNumber(line.lineSodiumMg, 0)} mg sodium`}
            </p>
          </li>
        ))}
      </ol>
      {version.notes ? <p className="text-sm text-zinc-700">{version.notes}</p> : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      {version.isCurrent && recipe.isActive ? (
        <Link to={`/nutrition/recipes/${recipe.id}/edit`} className={primaryButtonClass}>
          Edit recipe
        </Link>
      ) : null}
      <div>
        <h2 className="text-base font-medium">Version history</h2>
        <ul className="mt-2 space-y-1">
          {(recipe.history ?? []).map((item) => (
            <li key={item.id}>
              <Link
                to={item.isCurrent ? `/nutrition/recipes/${recipe.id}` : `/nutrition/recipes/${recipe.id}/versions/${item.version}`}
                className="text-sm underline"
              >
                v{item.version}
                {item.isCurrent ? ' current' : ''}
                {item.name !== version.name ? ` · ${item.name}` : ''}
              </Link>
            </li>
          ))}
        </ul>
      </div>
      {version.isCurrent && recipe.isActive ? (
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void changeActive('archive')}>
          Archive
        </button>
      ) : null}
      {version.isCurrent && !recipe.isActive ? (
        <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void changeActive('restore')}>
          Restore
        </button>
      ) : null}
    </section>
  )
}

export function RecipeVersionPage() {
  const { recipeId = '', version: versionParam = '' } = useParams()
  const [searchParams] = useSearchParams()
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [logging, setLogging] = useState(false)
  useEffect(() => {
    let active = true
    fetchRecipeVersion(recipeId, Number(versionParam))
      .then((next) => {
        if (active) setRecipe(next)
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load recipe')
      })
    return () => {
      active = false
    }
  }, [recipeId, versionParam])
  if (error && !recipe) return <LoadErrorNotice message={error} />
  if (!recipe) return <p className="text-sm text-zinc-600">Loading recipe…</p>
  const version = recipe.version
  if (logging) {
    return (
      <RecipePortionSheet
        date={parseNutritionDateParam(searchParams.get('date'))}
        recipe={loggableFrom(recipe)}
        title={`Log ${version.name} · v${version.version}`}
        onClose={() => setLogging(false)}
        onLogged={() => setLogging(false)}
      />
    )
  }
  return (
    <section className="w-full min-w-0 space-y-4">
      <p className="text-sm text-zinc-500">
        <Link to={`/nutrition/recipes/${recipe.id}`} className="underline">
          Current recipe
        </Link>
      </p>
      <div>
        <h1 className="text-xl font-semibold tracking-tight md:text-2xl">{version.name}</h1>
        <p className="text-sm text-zinc-600">v{version.version} · {version.isCurrent ? 'current' : 'historical'}</p>
        {version.isCurrent ? null : <p className="mt-2 text-sm text-zinc-700">This Recipe Version is preserved for history.</p>}
      </div>
      <button type="button" className={primaryButtonClass} onClick={() => setLogging(true)}>
        Log this version
      </button>
      <div className="rounded-xl border border-zinc-200 bg-white p-4">
        <p className="text-sm text-zinc-500">Whole recipe</p>
        <p className="text-lg">{recipeKcal(version.caloriesKcal)}</p>
        <p>{macroText(version.proteinG, 'Protein')}</p>
        <p>{macroText(version.carbsG, 'Carbs')}</p>
        <p>{macroText(version.fatG, 'Fat')}</p>
        <p>{macroText(version.fiberG, 'Fiber')}</p>
        <p>{version.sodiumMg == null ? 'Sodium not fully known' : `${formatNumber(version.sodiumMg, 0)} mg sodium`}</p>
      </div>
      <ol className="space-y-2">
        {version.ingredients.map((line) => (
          <li key={line.id} className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <p className="font-medium">{line.foodNameSnapshot}</p>
            <p className="text-sm text-zinc-600">
              {formatNumber(line.amount, 1)} {line.unit}
            </p>
            <p className="text-sm">{recipeKcal(line.lineCaloriesKcal)}</p>
            <p className="text-sm text-zinc-700">{macroText(line.lineProteinG, 'Protein')}</p>
          </li>
        ))}
      </ol>
      {version.notes ? <p className="text-sm text-zinc-700">{version.notes}</p> : null}
    </section>
  )
}

type EditLine = { key: string; foodId: string | null; name: string; amount: string; unit: string }

export function RecipeEditPage() {
  const { recipeId = '' } = useParams()
  const navigate = useNavigate()
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null)
  const [name, setName] = useState('')
  const [notes, setNotes] = useState('')
  const [yieldServings, setYieldServings] = useState('')
  const [finishedWeightG, setFinishedWeightG] = useState('')
  const [lines, setLines] = useState<EditLine[]>([])
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const [flow, setFlow] = useState<null | 'sources' | 'label'>(null)
  const [preview, setPreview] = useState<RecipePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    fetchRecipe(recipeId)
      .then((next) => {
        if (!active) return
        setRecipe(next)
        setName(next.version.name)
        setNotes(next.version.notes ?? '')
        setYieldServings(next.version.yieldServings == null ? '' : String(next.version.yieldServings))
        setFinishedWeightG(next.version.finishedWeightG == null ? '' : String(next.version.finishedWeightG))
        setLines(
          next.version.ingredients.map((line) => ({
            key: line.id,
            foodId: line.foodId,
            name: line.foodNameSnapshot,
            amount: String(line.amount),
            unit: line.unit,
          })),
        )
      })
      .catch((caught: unknown) => {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load recipe')
      })
    return () => {
      active = false
    }
  }, [recipeId])

  const dirty =
    recipe != null &&
    (name !== recipe.version.name ||
      notes !== (recipe.version.notes ?? '') ||
      yieldServings !== (recipe.version.yieldServings == null ? '' : String(recipe.version.yieldServings)) ||
      finishedWeightG !== (recipe.version.finishedWeightG == null ? '' : String(recipe.version.finishedWeightG)) ||
      lines.length !== recipe.version.ingredients.length ||
      lines.some((line, index) => {
        const original = recipe.version.ingredients[index]
        return (
          original == null ||
          line.foodId !== original.foodId ||
          line.name !== original.foodNameSnapshot ||
          line.amount !== String(original.amount) ||
          line.unit !== original.unit
        )
      }))

  useEffect(() => {
    if (!dirty) {
      return
    }
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  function addFood(food: NutritionFood) {
    const key = crypto.randomUUID()
    setFocusKey(key)
    setLines((current) => [...current, { key, foodId: food.id, name: food.name, amount: '1', unit: 'serving' }])
    setPreview(null)
    setFlow(null)
  }

  function draftInput() {
    return {
      sourceVersionId: recipe?.version.id ?? '',
      name,
      notes,
      yieldServings: yieldServings.trim() ? Number(yieldServings) : null,
      finishedWeightG: finishedWeightG.trim() ? Number(finishedWeightG) : null,
      ingredients: lines.map((line) => ({ foodId: line.foodId, amount: Number(line.amount), unit: line.unit })),
    }
  }

  async function review() {
    setError(null)
    setSaving(true)
    try {
      setPreview(await previewRecipeChange(recipeId, draftInput()))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not review recipe')
    } finally {
      setSaving(false)
    }
  }

  async function save() {
    if (!preview?.previewFingerprint) return
    setSaving(true)
    setError(null)
    try {
      const saved = await commitRecipeVersion(recipeId, { ...draftInput(), previewFingerprint: preview.previewFingerprint })
      void navigate(`/nutrition/recipes/${saved.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save recipe')
      setSaving(false)
    }
  }

  if (error && !recipe) return <LoadErrorNotice message={error} />
  if (!recipe) return <p className="text-sm text-zinc-600">Loading recipe…</p>
  if (!recipe.isActive) {
    return (
      <section className="space-y-3">
        <h1 className="text-xl font-semibold">Archived Recipe</h1>
        <p>Restore this Recipe before editing.</p>
        <Link to={`/nutrition/recipes/${recipe.id}`} className={secondaryButtonClass}>
          Back to recipe
        </Link>
      </section>
    )
  }

  return (
    <section className="w-full min-w-0 space-y-4">
      <p className="text-sm text-zinc-500">
        <Link to={`/nutrition/recipes/${recipe.id}`} className="underline">
          {recipe.version.name}
        </Link>
      </p>
      <h1 className="text-xl font-semibold tracking-tight">Edit recipe</h1>
      <p className="text-sm text-zinc-600">Saving updates this recipe. The previous version stays in history so past logs keep their original nutrition.</p>
      <label className="block text-sm">
        Name
        <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} />
      </label>
      <label className="block text-sm">
        Notes
        <textarea className={fieldClass} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          Servings
          <input className={fieldClass} inputMode="decimal" value={yieldServings} onChange={(event) => setYieldServings(event.target.value)} />
        </label>
        <label className="block text-sm">
          Finished weight (g)
          <input className={fieldClass} inputMode="decimal" value={finishedWeightG} onChange={(event) => setFinishedWeightG(event.target.value)} />
        </label>
      </div>
      <button type="button" className={secondaryButtonClass} onClick={() => setFlow('sources')}>
        Add ingredient
      </button>
      <ol className="space-y-3">
        {lines.map((line, index) => (
          <li key={line.key} className="rounded-xl border border-zinc-200 bg-white p-3">
            <p className="font-medium">{line.name}</p>
            {line.foodId == null ? <p className="text-sm text-red-800">Replace or remove this ingredient. Its food is no longer available.</p> : null}
            <div className="mt-2 grid grid-cols-[1fr_1fr_auto] gap-2">
              <input className={fieldClass} aria-label={`Amount for ${line.name}`} autoFocus={line.key === focusKey} value={line.amount} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, amount: event.target.value } : item))} />
              <input className={fieldClass} aria-label={`Unit for ${line.name}`} value={line.unit} onChange={(event) => setLines((current) => current.map((item) => item.key === line.key ? { ...item, unit: event.target.value } : item))} />
              <button type="button" className={secondaryButtonClass} onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}>
                Remove
              </button>
            </div>
            <div className="mt-2 flex gap-2">
              <button type="button" className={secondaryButtonClass} disabled={index === 0} onClick={() => setLines((current) => moveLine(current, index, -1))}>
                Up
              </button>
              <button type="button" className={secondaryButtonClass} disabled={index === lines.length - 1} onClick={() => setLines((current) => moveLine(current, index, 1))}>
                Down
              </button>
            </div>
          </li>
        ))}
      </ol>
      {error ? <p className="text-sm text-red-800">{error}</p> : null}
      <button type="button" className={secondaryButtonClass} disabled={saving || lines.length === 0} onClick={() => void review()}>
        Review changes
      </button>
      {preview ? <RecipeReview preview={preview} saving={saving} onSave={() => void save()} /> : null}
      {flow === 'sources' ? (
        <RecipeIngredientSheet onClose={() => setFlow(null)} onFood={addFood} onLabel={() => setFlow('label')} />
      ) : null}
      {flow === 'label' ? (
        <LabelCaptureSheet
          date={healthCalendarDateFromNow()}
          purpose="recipe"
          onClose={() => setFlow('sources')}
          onBack={() => setFlow('sources')}
          onLogged={() => undefined}
          onSavedFood={addFood}
        />
      ) : null}
    </section>
  )
}

function moveLine<T>(lines: T[], index: number, direction: -1 | 1): T[] {
  const next = [...lines]
  const target = index + direction
  const item = next[index]
  const other = next[target]
  if (!item || !other) return lines
  next[index] = other
  next[target] = item
  return next
}

function RecipeReview({ preview, saving, onSave }: { preview: RecipePreview; saving: boolean; onSave: () => void }) {
  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-medium">Review recipe update</h2>
      <p className="text-sm text-zinc-700">
        Saving makes v{preview.candidateVersionNumber} current. v{preview.currentVersion} stays in history so previous logs are unchanged.
      </p>
      {preview.metadataChanges.map((change) => (
        <p key={change.field} className="text-sm">
          {change.field === 'name' ? 'Name' : 'Notes'}: {change.from || '—'} → {change.to || '—'}
        </p>
      ))}
      {preview.yieldChanges.map((change) => (
        <p key={change.field} className="text-sm">
          {change.field === 'yieldServings' ? 'Servings' : 'Finished weight'}: {change.from ?? '—'} → {change.to ?? '—'}
        </p>
      ))}
      {preview.ingredientBasisChanges.map((change) => (
        <div key={`${change.name}-${change.position ?? 'x'}`} className="text-sm">
          <p>Ingredient data changed since v{preview.currentVersion}</p>
          <p className="font-medium">{change.to?.basis.name ?? change.name}</p>
          <p>
            v{preview.currentVersion} basis {basisSummary(change.from?.basis)}
          </p>
          <p>Current food {basisSummary(change.to?.basis)}</p>
          <p>v{preview.candidateVersionNumber} will use the current food values.</p>
        </div>
      ))}
      {preview.ingredientChanges
        .filter((change) => !change.categories.includes('unchanged') && !change.categories.includes('food_basis_changed'))
        .map((change) => (
          <p key={`${change.categories.join('-')}-${change.position ?? change.previousPosition}`} className="text-sm">
            {change.name}: {change.categories.join(', ')}
            {change.categories.includes('amount_changed') && change.from && change.to ? ` ${change.from.amount} ${change.from.unit} → ${change.to.amount} ${change.to.unit}` : ''}
          </p>
        ))}
      <p className="text-sm">Calories {deltaText(preview.nutritionDelta.caloriesKcal, 'kcal')}</p>
      <p className="text-sm">Protein {deltaText(preview.nutritionDelta.proteinG, 'g')}</p>
      <p className="text-sm">Carbs {deltaText(preview.nutritionDelta.carbsG, 'g')}</p>
      <p className="text-sm">Fat {deltaText(preview.nutritionDelta.fatG, 'g')}</p>
      <p className="text-sm">
        Fiber {nutritionChangeText(preview.currentWholeNutrition.fiberG, preview.candidateWholeNutrition?.fiberG ?? null, 'g')}
      </p>
      <p className="text-sm">
        Sodium {nutritionChangeText(preview.currentWholeNutrition.sodiumMg, preview.candidateWholeNutrition?.sodiumMg ?? null, 'mg')}
      </p>
      {preview.warnings.map((warning) => (
        <p key={warning} className="text-sm text-zinc-700">
          {warning}
        </p>
      ))}
      {preview.canCommit ? (
        <button type="button" className={primaryButtonClass} disabled={saving} onClick={onSave}>
          Save recipe update
        </button>
      ) : null}
    </div>
  )
}

function basisSummary(
  basis: { caloriesKcal: number | null; proteinG: number | null; fiberG: number | null; sodiumMg: number | null } | null | undefined,
): string {
  if (!basis) return '—'
  const calories = basis.caloriesKcal == null ? '— kcal' : recipeKcal(basis.caloriesKcal)
  const protein = basis.proteinG == null ? 'protein —' : `${formatNumber(basis.proteinG, 1)} g protein`
  const fiber = basis.fiberG == null ? 'fiber —' : `${formatNumber(basis.fiberG, 1)} g fiber`
  const sodium = basis.sodiumMg == null ? 'sodium —' : `${formatNumber(basis.sodiumMg, 0)} mg sodium`
  return `${calories} · ${protein} · ${fiber} · ${sodium}`
}

function deltaText(value: number | null, unit: string): string {
  if (value == null) return 'Unavailable'
  const sign = value > 0 ? '+' : ''
  return `${sign}${formatNumber(value, unit === 'mg' ? 0 : 1)} ${unit}`
}

function nutritionChangeText(current: number | null, next: number | null, unit: string): string {
  if (current == null && next == null) return 'still incomplete'
  if (current == null && next != null) return `now ${formatNumber(next, unit === 'mg' ? 0 : 1)} ${unit} · previously incomplete`
  if (current != null && next == null) return 'now incomplete'
  return deltaText((next ?? 0) - (current ?? 0), unit)
}
