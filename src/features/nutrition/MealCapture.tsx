import { useEffect, useMemo, useState } from 'react'
import {
  NUTRITION_CONFIG,
  NUTRITION_MEALS,
  applyRecipeSelection,
  draftFromMealCandidate,
  emptyMealCandidate,
  looksLikeHiddenFat,
  isMealRetryCode,
  mealFailureMessage,
  mealReviewTotals,
  validateMealReview,
  type MealReviewComponent,
  type MealReviewDraft,
  type NutritionEntry,
  type NutritionFood,
  type NutritionMealJobResponse,
} from '@/domain/nutrition'
import type { ReviewFieldError } from '@/domain/paper-load'
import {
  BarcodeLookupClientError,
  MealClientError,
  commitNutritionMealReview,
  createNutritionFood,
  createNutritionMealJob,
  fetchNutritionMealJob,
  reanalyzeNutritionMealJob,
  nutritionMealImageUrl,
  searchNutritionFoods,
} from './api'
import { MealPhotoPrepareError, prepareMealPhoto } from './prepare-meal-photo'
import { formatGrams, formatKcal, mealLabel } from './format'
import { NutritionSheet } from './Sheet'

const POLL_MS = 4000
const inputClass =
  'min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 outline-none focus:border-zinc-500 md:text-sm'
const labelClass = 'mb-1 block text-sm font-medium text-zinc-700'
const primaryClass =
  'inline-flex min-h-11 w-full items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white disabled:opacity-50'
const secondaryClass =
  'inline-flex min-h-11 items-center justify-center rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-900'

type MealCaptureProps = {
  date: string
  jobId?: string | null
  recents?: NutritionFood[]
  recipes?: NutritionFood[]
  onClose: () => void
  onBack: () => void
  onLogged: (entries: NutritionEntry[]) => void
}

export function MealCaptureSheet({ date, jobId, recents = [], recipes = [], onClose, onBack, onLogged }: MealCaptureProps) {
  const [phase, setPhase] = useState<'pick' | 'preview' | 'working' | 'review' | 'failed'>(jobId ? 'working' : 'pick')
  const [activeJobId, setActiveJobId] = useState<string | null>(jobId ?? null)
  const [payload, setPayload] = useState<NutritionMealJobResponse | null>(null)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [preparedFile, setPreparedFile] = useState<File | null>(null)
  const [context, setContext] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [errorCode, setErrorCode] = useState<string | null>(null)
  const [manual, setManual] = useState(false)

  useEffect(() => {
    return () => {
      if (localPreview) {
        URL.revokeObjectURL(localPreview)
      }
    }
  }, [localPreview])

  useEffect(() => {
    if (phase !== 'working' || !activeJobId) {
      return
    }
    let cancelled = false
    let timer: number | undefined

    async function poll() {
      try {
        const next = await fetchNutritionMealJob(activeJobId!)
        if (cancelled) {
          return
        }
        setPayload(next)
        if (next.job.status === 'completed' && next.candidate) {
          setPhase('review')
          return
        }
        if (next.job.status === 'failed') {
          setError(next.failure?.message ?? 'Meal photo analysis failed.')
          setErrorCode(next.failure?.code ?? 'PIPELINE_FAILED')
          setPhase('failed')
          return
        }
        timer = window.setTimeout(() => {
          void poll()
        }, POLL_MS)
      } catch (caught) {
        if (cancelled) {
          return
        }
        if (caught instanceof MealClientError) {
          setError(mealFailureMessage(caught.code))
          setErrorCode(caught.code)
        } else {
          setError('Meal analysis is temporarily unavailable.')
          setErrorCode('HOME_AI_UNAVAILABLE')
        }
        setPhase('failed')
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timer) {
        window.clearTimeout(timer)
      }
    }
  }, [phase, activeJobId])

  async function onFile(file: File | undefined) {
    if (!file) {
      return
    }
    setError(null)
    setErrorCode(null)
    try {
      const prepared = await prepareMealPhoto(file)
      const preview = URL.createObjectURL(prepared.file)
      setPreparedFile(prepared.file)
      setActiveJobId(null)
      setLocalPreview((current) => {
        if (current) {
          URL.revokeObjectURL(current)
        }
        return preview
      })
      setPhase('preview')
    } catch (caught) {
      if (caught instanceof MealPhotoPrepareError) {
        setError(caught.message)
        setErrorCode(caught.code)
        setPhase('failed')
        return
      }
      if (caught instanceof MealClientError) {
        setError(mealFailureMessage(caught.code))
        setErrorCode(caught.code)
      } else {
        setError('Meal analysis is temporarily unavailable.')
        setErrorCode('HOME_AI_UNAVAILABLE')
      }
      setPhase('failed')
    }
  }

  async function analyze(provider: 'gemini' | 'home_ai') {
    if (!activeJobId && !preparedFile) {
      setPhase('pick')
      return
    }
    setError(null)
    setErrorCode(null)
    const previousId = activeJobId
    const file = preparedFile
    setPhase('working')
    setActiveJobId(null)
    try {
      const note = context.trim()
      const job = previousId
        ? await reanalyzeNutritionMealJob(previousId, { userContext: note, provider })
        : await createNutritionMealJob(file as File, { userContext: note, provider })
      setActiveJobId(job.id)
    } catch (caught) {
      if (previousId) {
        setActiveJobId(previousId)
      }
      if (caught instanceof MealClientError) {
        setError(mealFailureMessage(caught.code))
        setErrorCode(caught.code)
      } else {
        setError('Meal analysis is temporarily unavailable.')
        setErrorCode('GEMINI_UNAVAILABLE')
      }
      setPhase('failed')
    }
  }

  function editContext() {
    setContext(payload?.userContext ?? context)
    setPhase('preview')
  }

  if (phase === 'review' || manual) {
    const candidate = payload?.candidate ?? emptyMealCandidate()
    return (
      <MealReviewSheet
        date={date}
        jobId={activeJobId}
        candidate={candidate}
        foods={[...(payload?.foods ?? []), ...recipes]}
        recipeOptions={
          payload?.recipeCandidates ??
          recipes.map((food) => ({ id: food.id, name: food.name, catalogKind: food.catalogKind }))
        }
        hiddenFatFoods={payload?.hiddenFatFoods ?? []}
        catalogFoods={[...recents, ...recipes, ...(payload?.foods ?? [])]}
        imageUrl={activeJobId && payload?.job.imageAvailable ? nutritionMealImageUrl(activeJobId) : localPreview}
        userContext={payload?.userContext ?? (context.trim() || null)}
        onEditContext={activeJobId || preparedFile ? editContext : undefined}
        onClose={onClose}
        onBack={() => {
          setManual(false)
          setPhase(jobId ? 'working' : 'pick')
        }}
        onLogged={onLogged}
      />
    )
  }

  if (phase === 'failed') {
    return (
      <NutritionSheet title="Meal photo" onClose={onClose}>
        <p className="text-sm text-zinc-800">{error}</p>
        {localPreview ? <img src={localPreview} alt="Meal" className="mt-3 max-h-48 w-full rounded-lg object-contain bg-zinc-100" /> : null}
        <div className="mt-4 space-y-2">
          {errorCode && isMealRetryCode(errorCode) ? (
            <>
              <button type="button" className={primaryClass} onClick={() => void analyze('gemini')}>
                Retry Gemini
              </button>
              <button type="button" className={secondaryClass + ' w-full'} onClick={editContext}>
                Edit context
              </button>
              <button type="button" className={secondaryClass + ' w-full'} onClick={() => void analyze('home_ai')}>
                Try local AI
              </button>
            </>
          ) : errorCode !== 'UNSUPPORTED' ? (
            <button type="button" className={primaryClass} onClick={() => setPhase('pick')}>
              Use another photo
            </button>
          ) : null}
          <button type="button" className={secondaryClass + ' w-full'} onClick={() => setManual(true)}>
            Build meal manually
          </button>
          <button type="button" className="text-sm text-zinc-600 underline" onClick={onBack}>
            Back
          </button>
        </div>
      </NutritionSheet>
    )
  }

  if (phase === 'working') {
    return (
      <NutritionSheet title="Identifying foods" onClose={onClose}>
        {localPreview ? <img src={localPreview} alt="Meal" className="mb-3 max-h-48 w-full rounded-lg object-contain bg-zinc-100" /> : null}
        <p className="text-sm text-zinc-600">Identifying foods from the photo… You can leave and come back from Pending captures.</p>
        <button type="button" className={secondaryClass + ' mt-4 w-full'} onClick={onBack}>
          Back
        </button>
      </NutritionSheet>
    )
  }

  if (phase === 'preview') {
    const previewSrc = localPreview ?? (activeJobId ? nutritionMealImageUrl(activeJobId) : null)
    return (
      <NutritionSheet title="Meal photo" onClose={onClose}>
        {previewSrc ? <img src={previewSrc} alt="Meal" className="max-h-64 w-full rounded-lg object-contain bg-zinc-100" /> : null}
        <label className="mt-4 block">
          <span className={labelClass}>Add context (optional)</span>
          <textarea
            className={inputClass + ' min-h-28 py-2'}
            maxLength={2000}
            value={context}
            placeholder="Tell AI anything useful about this meal — ingredients, portions, preparation, sauces, substitutions, etc."
            onChange={(event) => setContext(event.target.value)}
          />
        </label>
        <div className="mt-4 space-y-2">
          <button type="button" className={primaryClass} disabled={!preparedFile && !activeJobId} onClick={() => void analyze('gemini')}>
            Analyze meal
          </button>
          <button type="button" className="text-sm text-zinc-600 underline" onClick={() => setPhase('pick')}>
            Back
          </button>
        </div>
      </NutritionSheet>
    )
  }

  return (
    <NutritionSheet title="Meal photo" onClose={onClose}>
      <p className="text-sm text-zinc-600">Photograph the plate. Check the foods and portions before saving.</p>
      <div className="mt-4 space-y-3">
        <label className={primaryClass}>
          Take photo
          <input type="file" accept="image/jpeg,image/png,image/*" capture="environment" className="sr-only" onChange={(event) => void onFile(event.target.files?.[0])} />
        </label>
        <label className={secondaryClass + ' w-full'}>
          Choose photo
          <input type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(event) => void onFile(event.target.files?.[0])} />
        </label>
        <button type="button" className="text-sm text-zinc-600 underline" onClick={onBack}>
          Back
        </button>
      </div>
    </NutritionSheet>
  )
}

function MealReviewSheet({
  date,
  jobId,
  candidate,
  foods,
  recipeOptions,
  hiddenFatFoods,
  catalogFoods,
  imageUrl,
  userContext,
  onEditContext,
  onClose,
  onBack,
  onLogged,
}: {
  date: string
  jobId: string | null
  candidate: ReturnType<typeof emptyMealCandidate>
  foods: NutritionFood[]
  recipeOptions: Array<{ id: string; name: string; catalogKind: string }>
  hiddenFatFoods: Array<{ id: string; name: string; servingUnit: string }>
  catalogFoods: NutritionFood[]
  imageUrl: string | null
  userContext?: string | null
  onEditContext?: () => void
  onClose: () => void
  onBack: () => void
  onLogged: (entries: NutritionEntry[]) => void
}) {
  const [draft, setDraft] = useState<MealReviewDraft>(() => draftFromMealCandidate(candidate, foods))
  const [foodMap, setFoodMap] = useState(() => new Map(foods.map((food) => [food.id, food])))
  const [errors, setErrors] = useState<ReviewFieldError[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState<string | null>(null)

  const recipeFood = draft.recipeFoodId ? foodMap.get(draft.recipeFoodId) ?? null : null
  const totals = useMemo(() => mealReviewTotals(draft.components, foodMap, recipeFood), [draft.components, foodMap, recipeFood])

  function updateComponent(id: string, patch: Partial<MealReviewComponent>) {
    setDraft((current) => ({
      ...current,
      components: current.components.map((component) => (component.id === id ? { ...component, ...patch } : component)),
    }))
    setErrors((current) => current.filter((item) => !item.path.includes(id)))
  }

  function selectRecipe(recipeId: string | null) {
    const recipe = recipeId ? foodMap.get(recipeId) ?? foods.find((food) => food.id === recipeId) ?? null : null
    setDraft((current) => applyRecipeSelection(current, recipe, candidate.components.map((item) => item.proposedName)))
  }

  function chooseFood(componentId: string, food: NutritionFood) {
    setFoodMap((current) => new Map(current).set(food.id, food))
    const current = draft.components.find((item) => item.id === componentId)
    updateComponent(componentId, {
      foodId: food.id,
      unit: current?.grams != null ? 'g' : food.servingUnit,
      identificationUncertain: false,
      included: true,
    })
  }

  async function saveMeal() {
    const nextErrors = validateMealReview(draft)
    if (nextErrors.length > 0) {
      setErrors(nextErrors)
      return
    }
    setBusy(true)
    setError(null)
    try {
      const saved = await commitNutritionMealReview({
        jobId: jobId ?? undefined,
        logDate: date,
        timezone: NUTRITION_CONFIG.calendarTimeZone,
        meal: draft.meal === '' ? null : draft.meal,
        recipeFoodId: draft.recipeFoodId,
        components: draft.components.map((component) => ({
          id: component.id,
          included: component.included && !component.collapsedByRecipe,
          foodId: component.foodId,
          proposedName: component.proposedName,
          quantity: component.quantity,
          unit: component.unit,
          grams: component.grams,
        })),
        resolvedFlags: draft.resolvedFlags,
      })
      onLogged(saved.entries)
    } catch (caught) {
      if (caught instanceof BarcodeLookupClientError && caught.fields.length > 0) {
        setErrors(caught.fields)
        return
      }
      setError(caught instanceof Error ? caught.message : 'Could not save meal')
    } finally {
      setBusy(false)
    }
  }

  const unresolvedFlags = candidate.possibleUnaccountedItems.filter((item) => !draft.resolvedFlags.includes(item))

  function addOil(unit: 'tsp' | 'tbsp', flag: string) {
    const option = hiddenFatFoods[0]
    const food = option ? foodMap.get(option.id) : null
    if (!food) {
      return
    }
    setDraft((current) => ({
      ...current,
      resolvedFlags: [...current.resolvedFlags, flag],
      components: [
        ...current.components,
        {
          id: `oil-${crypto.randomUUID()}`,
          included: true,
          proposedName: food.name,
          foodId: food.id,
          quantity: 1,
          unit,
          grams: null,
          portionDescription: `1 ${unit}`,
          portionConfidence: null,
          identificationUncertain: false,
          estimated: false,
          collapsedByRecipe: false,
        },
      ],
    }))
  }

  return (
    <NutritionSheet
      title="Review meal"
      onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button type="button" className={secondaryClass} onClick={onBack}>
            Back
          </button>
          <button type="button" className={primaryClass} onClick={() => void saveMeal()} disabled={busy}>
            {busy ? 'Saving…' : 'Save meal'}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-zinc-600">Check the foods and portions before saving.</p>
        {imageUrl ? <img src={imageUrl} alt="Meal" className="max-h-40 w-full rounded-lg object-contain bg-zinc-100" /> : null}
        {userContext ? (
          <div>
            <p className="text-sm font-medium text-zinc-800">Your context</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700">{userContext}</p>
          </div>
        ) : null}
        {onEditContext ? (
          <button type="button" className="text-sm text-zinc-600 underline" onClick={onEditContext}>
            Edit context
          </button>
        ) : null}
        {candidate.components.flatMap((component) =>
          component.ambiguities.map((ambiguity) => (
            <p key={`${component.id}-${ambiguity}`} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {ambiguity}
            </p>
          )),
        )}
        {candidate.notes.map((note) => (
          <p key={note} className="text-sm text-zinc-600">
            {note}
          </p>
        ))}
        {errors.length > 0 ? <p className="text-sm text-red-700">{errors[0]?.message}</p> : null}

        <div>
          <label className={labelClass} htmlFor="meal-slot">Meal</label>
          <select
            id="meal-slot"
            className={inputClass}
            value={draft.meal}
            onChange={(event) => setDraft((current) => ({ ...current, meal: event.target.value as MealReviewDraft['meal'] }))}
          >
            <option value="">Unspecified</option>
            {NUTRITION_MEALS.map((meal) => (
              <option key={meal} value={meal}>{mealLabel(meal)}</option>
            ))}
          </select>
        </div>

        {recipeOptions.length > 0 ? (
          <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
            <p className="text-sm font-medium">Possible saved recipe</p>
            <div className="mt-2 space-y-2">
              {recipeOptions.map((recipe) => (
                <label key={recipe.id} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="meal-recipe" checked={draft.recipeFoodId === recipe.id} onChange={() => selectRecipe(recipe.id)} />
                  Use saved recipe: {recipe.name}
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" name="meal-recipe" checked={!draft.recipeFoodId} onChange={() => selectRecipe(null)} />
                Log components separately
              </label>
            </div>
          </div>
        ) : null}

        {draft.components.map((component) => (
          <ComponentCard
            key={component.id}
            component={component}
            food={component.foodId ? foodMap.get(component.foodId) ?? null : null}
            catalog={catalogFoods}
            creating={creating === component.id}
            onCreate={() => setCreating(component.id)}
            onCancelCreate={() => setCreating(null)}
            onCreated={(food) => {
              setCreating(null)
              chooseFood(component.id, food)
            }}
            onChange={(patch) => updateComponent(component.id, patch)}
            onChoose={chooseFood}
            onSkip={() => updateComponent(component.id, { included: false, collapsedByRecipe: false })}
          />
        ))}

        <button
          type="button"
          className={secondaryClass + ' w-full'}
          onClick={() => {
            setDraft((current) => ({
              ...current,
              components: [
                ...current.components,
                {
                  id: `added-${crypto.randomUUID()}`,
                  included: true,
                  proposedName: 'Added food',
                  foodId: null,
                  quantity: 1,
                  unit: 'serving',
                  grams: null,
                  portionDescription: null,
                  portionConfidence: null,
                  identificationUncertain: true,
                  estimated: false,
                  collapsedByRecipe: false,
                },
              ],
            }))
          }}
        >
          Add component
        </button>

        {unresolvedFlags.map((flag) => (
          <div key={flag} className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
            <p className="font-medium">{looksLikeHiddenFat(flag) ? 'Possible cooking oil' : 'Possible missing item'}: {flag}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" className={secondaryClass} onClick={() => setDraft((current) => ({ ...current, resolvedFlags: [...current.resolvedFlags, flag] }))}>
                No oil
              </button>
              {hiddenFatFoods[0] ? (
                <>
                  <button type="button" className={secondaryClass} onClick={() => addOil('tsp', flag)}>1 tsp</button>
                  <button type="button" className={secondaryClass} onClick={() => addOil('tbsp', flag)}>1 tbsp</button>
                </>
              ) : null}
            </div>
          </div>
        ))}

        <div className="rounded-md border border-zinc-200 bg-white px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Calculated total</p>
          <p className="mt-1 text-lg font-medium">{formatKcal(totals.calories)}</p>
          <p className="text-sm text-zinc-600">
            {[formatGrams(totals.protein) ? `${formatGrams(totals.protein)} protein` : null, formatGrams(totals.carbs) ? `${formatGrams(totals.carbs)} carbs` : null, formatGrams(totals.fat) ? `${formatGrams(totals.fat)} fat` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </div>
    </NutritionSheet>
  )
}

function ComponentCard({
  component,
  food,
  catalog,
  creating,
  onCreate,
  onCancelCreate,
  onCreated,
  onChange,
  onChoose,
  onSkip,
}: {
  component: MealReviewComponent
  food: NutritionFood | null
  catalog: NutritionFood[]
  creating: boolean
  onCreate: () => void
  onCancelCreate: () => void
  onCreated: (food: NutritionFood) => void
  onChange: (patch: Partial<MealReviewComponent>) => void
  onChoose: (componentId: string, food: NutritionFood) => void
  onSkip: () => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<NutritionFood[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => {
    const needle = query.trim()
    if (needle.length === 0) {
      setResults([])
      return
    }
    setSearching(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => {
      searchNutritionFoods(needle, controller.signal)
        .then(setResults)
        .catch(() => {
          if (!controller.signal.aborted) {
            setResults([])
          }
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
  }, [query])

  if (!component.included) {
    return (
      <div className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-500">
        Skipped {component.proposedName}
        <button type="button" className="ml-2 underline" onClick={() => onChange({ included: true })}>Undo</button>
      </div>
    )
  }

  if (component.collapsedByRecipe) {
    return (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-600">
        {component.proposedName} — included in saved recipe
      </div>
    )
  }

  return (
    <div className="rounded-md border border-zinc-200 px-3 py-3">
      <input className={inputClass} value={component.proposedName} onChange={(event) => onChange({ proposedName: event.target.value })} aria-label="Component name" />
      {food ? <p className="mt-1 text-sm text-zinc-600">Matched: {food.name}</p> : <p className="mt-1 text-sm text-zinc-600">No matching Health food</p>}
      {component.portionDescription ? (
        <p className="text-sm text-zinc-500">Estimated: {component.portionDescription}{component.estimated ? ' · from photo' : ''}</p>
      ) : null}
      {component.portionConfidence === 'low' || component.identificationUncertain ? (
        <p className="text-sm text-amber-800">{component.identificationUncertain ? 'Food identification uncertain' : 'Portion uncertain'}</p>
      ) : null}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>Amount</label>
          <input
            className={inputClass}
            inputMode="decimal"
            value={component.grams != null ? String(component.grams) : component.quantity == null ? '' : String(component.quantity)}
            onChange={(event) => {
              const value = event.target.value.trim() === '' ? null : Number(event.target.value)
              if (component.grams != null || component.unit === 'g') {
                onChange({ grams: value, unit: 'g', estimated: false })
              } else {
                onChange({ quantity: value, estimated: false })
              }
            }}
          />
        </div>
        <div>
          <label className={labelClass}>Unit</label>
          <input className={inputClass} value={component.unit} onChange={(event) => onChange({ unit: event.target.value, grams: event.target.value === 'g' ? component.grams : null })} />
        </div>
      </div>
      {!food ? (
        <div className="mt-3 space-y-2">
          <input className={inputClass} placeholder="Search Health foods" value={query} onChange={(event) => setQuery(event.target.value)} />
          {searching ? <p className="text-sm text-zinc-500">Searching…</p> : null}
          {results.map((item) => (
            <button key={item.id} type="button" className="block w-full rounded-md px-2 py-2 text-left text-sm hover:bg-zinc-50" onClick={() => onChoose(component.id, item)}>
              {item.name}
            </button>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={secondaryClass} onClick={onCreate}>Create food</button>
            <button type="button" className={secondaryClass} onClick={onSkip}>Skip</button>
          </div>
        </div>
      ) : catalog.length > 0 ? (
        <div className="mt-2">
          <label className={labelClass}>Choose another Health food</label>
          <select
            className={inputClass}
            value={component.foodId ?? ''}
            onChange={(event) => {
              const next = catalog.find((item) => item.id === event.target.value)
              if (next) {
                onChoose(component.id, next)
              }
            }}
          >
            {catalog.map((item) => (
              <option key={item.id} value={item.id}>{item.name}</option>
            ))}
          </select>
        </div>
      ) : null}
      {creating ? <CreateFoodInline name={component.proposedName} onCancel={onCancelCreate} onCreated={onCreated} /> : null}
    </div>
  )
}

function CreateFoodInline({
  name,
  onCancel,
  onCreated,
}: {
  name: string
  onCancel: () => void
  onCreated: (food: NutritionFood) => void
}) {
  const [foodName, setFoodName] = useState(name)
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="mt-3 space-y-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-sm font-medium">Create Health food</p>
      <input className={inputClass} value={foodName} onChange={(event) => setFoodName(event.target.value)} />
      <input className={inputClass} inputMode="decimal" placeholder="Calories per serving" value={calories} onChange={(event) => setCalories(event.target.value)} />
      <input className={inputClass} inputMode="decimal" placeholder="Protein g (optional)" value={protein} onChange={(event) => setProtein(event.target.value)} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <div className="flex gap-2">
        <button type="button" className={secondaryClass} onClick={onCancel}>Cancel</button>
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
              protein: protein.trim() === '' ? undefined : Number(protein),
              catalogKind: 'custom',
              sourceKind: 'manual',
            })
              .then(onCreated)
              .catch((caught: unknown) => {
                setError(caught instanceof Error ? caught.message : 'Could not create food')
              })
              .finally(() => setBusy(false))
          }}
        >
          Save food
        </button>
      </div>
    </div>
  )
}
