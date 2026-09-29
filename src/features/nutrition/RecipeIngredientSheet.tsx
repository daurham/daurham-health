import { lazy, Suspense, useRef, useState } from 'react'
import { NUTRITION_CONFIG } from '@/domain/nutrition'
import {
  COMPOSITE_FOOD_GUIDANCE,
  looksLikeCompositeFoodDescription,
  scalePer100Grams,
} from '@/domain/nutrition/recipe-ingredients'
import { healthCalendarDateFromNow } from '@/domain/time'
import { primaryButtonClass, secondaryButtonClass } from '@/lib'
import {
  createNutritionFood,
  describeFoodText,
  lookupNutritionBarcode,
  saveAiReusableFood,
  savePackagedFoodAndLog,
  saveUsdaReusableFood,
  searchNutritionFoods,
  searchUsdaFoods,
  type UsdaFoodChoice,
  type UsdaPortionChoice,
} from './api'
import type { NutritionFood, PackagedFoodCandidate } from '@/domain/nutrition'
import { NutritionSheet } from './Sheet'

const BarcodeScanner = lazy(() => import('./BarcodeScanner').then((module) => ({ default: module.BarcodeScanner })))

const fieldClass = 'mt-1 block min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base'

type Step = 'choose' | 'foods' | 'usda' | 'usda-review' | 'barcode' | 'barcode-review' | 'manual' | 'ai' | 'ai-review'

type AiDraft = {
  text: string
  name: string
  servingQuantity: string
  servingUnit: string
  servingGrams: string
  calories: string
  protein: string
  carbs: string
  fat: string
  fiber: string
  sodium: string
  provider: 'gemini' | 'home_ai'
  model: string | null
  originalName: string
  originalCalories: number
  originalProtein: number
  originalCarbs: number
  originalFat: number
  originalFiber: number | null
  originalSodium: number | null
}

export function RecipeIngredientSheet({
  onClose,
  onFood,
  onLabel,
  initialQuery = '',
  initialStep = 'choose',
}: {
  onClose: () => void
  onFood: (food: NutritionFood) => void
  onLabel: () => void
  initialQuery?: string
  initialStep?: Step
}) {
  const boundedQuery = initialQuery.trim().slice(0, 120)
  const [step, setStep] = useState<Step>(initialStep)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const returned = useRef(false)
  const saving = useRef(false)
  const [query, setQuery] = useState(boundedQuery)
  const [foods, setFoods] = useState<NutritionFood[]>([])
  const [usdaQuery, setUsdaQuery] = useState(boundedQuery)
  const [usdaFoods, setUsdaFoods] = useState<UsdaFoodChoice[]>([])
  const [usdaChoice, setUsdaChoice] = useState<UsdaFoodChoice | null>(null)
  const [portion, setPortion] = useState<UsdaPortionChoice | null>(null)
  const [scan, setScan] = useState(false)
  const [barcode, setBarcode] = useState('')
  const [candidate, setCandidate] = useState<PackagedFoodCandidate | null>(null)
  const [packName, setPackName] = useState('')
  const [packBrand, setPackBrand] = useState('')
  const [packQuantity, setPackQuantity] = useState('1')
  const [packUnit, setPackUnit] = useState('serving')
  const [packGrams, setPackGrams] = useState('')
  const [packCalories, setPackCalories] = useState('')
  const [packProtein, setPackProtein] = useState('')
  const [packCarbs, setPackCarbs] = useState('')
  const [packFat, setPackFat] = useState('')
  const [manualName, setManualName] = useState(boundedQuery)
  const [manualQuantity, setManualQuantity] = useState('1')
  const [manualUnit, setManualUnit] = useState('serving')
  const [manualGrams, setManualGrams] = useState('')
  const [manualCalories, setManualCalories] = useState('')
  const [manualProtein, setManualProtein] = useState('')
  const [manualCarbs, setManualCarbs] = useState('')
  const [manualFat, setManualFat] = useState('')
  const [description, setDescription] = useState('')
  const [ai, setAi] = useState<AiDraft | null>(null)
  const [composite, setComposite] = useState(false)

  function finish(food: NutritionFood) {
    if (returned.current) {
      return
    }
    returned.current = true
    onFood(food)
  }

  async function run<T>(action: () => Promise<T>): Promise<T | null> {
    if (saving.current || returned.current) {
      return null
    }
    saving.current = true
    setBusy(true)
    setError(null)
    try {
      return await action()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save food')
      return null
    } finally {
      if (!returned.current) {
        saving.current = false
      }
      setBusy(false)
    }
  }

  async function searchFoods() {
    const matches = await run(() => searchNutritionFoods(query))
    if (matches) {
      setFoods(matches)
    }
  }

  async function searchUsda() {
    const matches = await run(() => searchUsdaFoods(usdaQuery))
    if (matches) {
      setUsdaFoods(matches)
    }
  }

  async function saveUsda() {
    if (!usdaChoice || !portion) {
      return
    }
    const saved = await run(() =>
      saveUsdaReusableFood({
        fdcId: usdaChoice.fdcId,
        amount: portion.amount,
        unit: portion.unit,
        grams: portion.grams,
      }),
    )
    if (saved) {
      finish(saved.food)
    }
  }

  async function lookupBarcode(code: string) {
    setScan(false)
    setBarcode(code)
    const result = await run(() => lookupNutritionBarcode(code))
    if (!result) {
      return
    }
    if (result.status === 'local') {
      finish(result.food)
      return
    }
    const next = result.candidate
    setCandidate(next)
    setPackName(next.name ?? '')
    setPackBrand(next.brand ?? '')
    setPackQuantity(String(next.serving.quantity || 1))
    setPackUnit(next.serving.unit ?? 'serving')
    setPackGrams(next.serving.grams == null ? '' : String(next.serving.grams))
    setPackCalories(next.nutrition.calories == null ? '' : String(next.nutrition.calories))
    setPackProtein(next.nutrition.protein == null ? '' : String(next.nutrition.protein))
    setPackCarbs(next.nutrition.carbs == null ? '' : String(next.nutrition.carbs))
    setPackFat(next.nutrition.fat == null ? '' : String(next.nutrition.fat))
    setStep('barcode-review')
  }

  async function saveBarcode() {
    if (!candidate) {
      return
    }
    const saved = await run(() =>
      savePackagedFoodAndLog({
        barcode: candidate.barcode,
        name: packName,
        brand: packBrand.trim() || null,
        servingQuantity: Number(packQuantity),
        servingUnit: packUnit,
        servingGrams: packGrams.trim() ? Number(packGrams) : null,
        calories: Number(packCalories),
        protein: packProtein.trim() ? Number(packProtein) : null,
        carbs: packCarbs.trim() ? Number(packCarbs) : null,
        fat: packFat.trim() ? Number(packFat) : null,
        log: false,
        logDate: healthCalendarDateFromNow(),
        timezone: NUTRITION_CONFIG.calendarTimeZone,
      }),
    )
    if (saved) {
      finish(saved.food)
    }
  }

  async function saveManual() {
    const saved = await run(() =>
      createNutritionFood({
        name: manualName,
        catalogKind: 'ingredient',
        servingQuantity: Number(manualQuantity),
        servingUnit: manualUnit,
        servingGrams: manualGrams.trim() ? Number(manualGrams) : null,
        calories: Number(manualCalories),
        protein: manualProtein.trim() ? Number(manualProtein) : null,
        carbs: manualCarbs.trim() ? Number(manualCarbs) : null,
        fat: manualFat.trim() ? Number(manualFat) : null,
        sourceKind: 'manual',
      }),
    )
    if (saved) {
      finish(saved)
    }
  }

  async function estimate(provider: 'gemini' | 'home_ai') {
    const review = await run(() => describeFoodText(description, provider))
    if (!review) {
      return
    }
    const first = review.items[0]
    setComposite(looksLikeCompositeFoodDescription(description, review.items.length))
    setAi({
      text: description,
      name: review.name,
      servingQuantity: first?.quantity == null ? '1' : String(first.quantity),
      servingUnit: first?.unit || 'serving',
      servingGrams: first?.estimatedGrams == null ? '' : String(first.estimatedGrams),
      calories: String(review.calories),
      protein: String(review.proteinGrams),
      carbs: String(review.carbsGrams),
      fat: String(review.fatGrams),
      fiber: review.fiberGrams == null ? '' : String(review.fiberGrams),
      sodium: review.sodiumMg == null ? '' : String(review.sodiumMg),
      provider,
      model: review.model ?? null,
      originalName: review.name,
      originalCalories: review.calories,
      originalProtein: review.proteinGrams,
      originalCarbs: review.carbsGrams,
      originalFat: review.fatGrams,
      originalFiber: review.fiberGrams,
      originalSodium: review.sodiumMg,
    })
    setStep(looksLikeCompositeFoodDescription(description, review.items.length) ? 'ai' : 'ai-review')
  }

  async function saveAi() {
    if (!ai) {
      return
    }
    const calories = Number(ai.calories)
    const protein = Number(ai.protein)
    const carbs = Number(ai.carbs)
    const fat = Number(ai.fat)
    const fiber = ai.fiber.trim() ? Number(ai.fiber) : null
    const sodium = ai.sodium.trim() ? Number(ai.sodium) : null
    const saved = await run(() =>
      saveAiReusableFood({
        name: ai.name,
        text: ai.text,
        servingQuantity: Number(ai.servingQuantity),
        servingUnit: ai.servingUnit,
        servingGrams: ai.servingGrams.trim() ? Number(ai.servingGrams) : null,
        calories,
        protein,
        carbs,
        fat,
        fiber,
        sodium,
        provider: ai.provider,
        model: ai.model,
        originalCalories: ai.originalCalories,
        adjusted:
          calories !== ai.originalCalories ||
          protein !== ai.originalProtein ||
          carbs !== ai.originalCarbs ||
          fat !== ai.originalFat ||
          fiber !== ai.originalFiber ||
          sodium !== ai.originalSodium ||
          ai.name.trim() !== ai.originalName.trim(),
      }),
    )
    if (saved) {
      finish(saved.food)
    }
  }

  const usdaNutrition = usdaChoice && portion ? scalePer100Grams(usdaChoice, portion.grams) : null

  return (
    <NutritionSheet title="Add ingredient" onClose={onClose}>
      <div className="space-y-3">
        {error ? <p className="text-sm text-red-800">{error}</p> : null}
        {step === 'choose' ? (
          <div className="space-y-2">
            <button type="button" className={`${secondaryButtonClass} w-full`} onClick={() => setStep('foods')}>
              Search My Foods
            </button>
            <button type="button" className={`${secondaryButtonClass} w-full`} onClick={() => setStep('usda')}>
              Search USDA
            </button>
            <button type="button" className={`${secondaryButtonClass} w-full`} onClick={() => setStep('barcode')}>
              Scan barcode
            </button>
            <button type="button" className={`${secondaryButtonClass} w-full`} onClick={onLabel}>
              Nutrition label
            </button>
            <button type="button" className={`${secondaryButtonClass} w-full`} onClick={() => setStep('manual')}>
              Add manually
            </button>
            <button type="button" className={`${secondaryButtonClass} w-full`} onClick={() => setStep('ai')}>
              Describe a food
            </button>
          </div>
        ) : null}
        {step === 'foods' ? (
          <div className="space-y-2">
            <label className="block text-sm">
              Search My Foods
              <input className={fieldClass} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void searchFoods()}>
              Search
            </button>
            <ul className="space-y-1">
              {foods.map((food) => (
                <li key={food.id}>
                  <button type="button" className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-left" onClick={() => finish(food)}>
                    <span className="block font-medium">{food.name}</span>
                    {food.sourceKind === 'usda' ? <span className="block text-sm text-zinc-600">USDA</span> : null}
                    {food.sourceKind === 'description_ai' ? <span className="block text-sm text-zinc-600">Estimated · AI-assisted</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {step === 'usda' ? (
          <div className="space-y-2">
            <p className="text-sm text-zinc-600">Search does not save a food. Review a serving before adding it.</p>
            <label className="block text-sm">
              Search USDA
              <input className={fieldClass} value={usdaQuery} onChange={(event) => setUsdaQuery(event.target.value)} />
            </label>
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void searchUsda()}>
              Search
            </button>
            <ul className="space-y-1">
              {usdaFoods.map((food) => (
                <li key={food.fdcId}>
                  <button
                    type="button"
                    className="w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-left"
                    onClick={() => {
                      setUsdaChoice(food)
                      setPortion(food.portions[0] ?? null)
                      setStep('usda-review')
                    }}
                  >
                    <span className="block font-medium">{food.name}</span>
                    <span className="block text-sm text-zinc-600">USDA · FDC {food.fdcId}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {step === 'usda-review' && usdaChoice && portion && usdaNutrition ? (
          <div className="space-y-2">
            <p className="font-medium">{usdaChoice.name}</p>
            <p className="text-sm text-zinc-600">USDA · FDC {usdaChoice.fdcId}</p>
            <p className="text-sm text-zinc-600">USDA reference. This is not an estimate.</p>
            <label className="block text-sm">
              Serving basis
              <select
                className={fieldClass}
                value={portion.label}
                onChange={(event) => setPortion(usdaChoice.portions.find((item) => item.label === event.target.value) ?? portion)}
              >
                {usdaChoice.portions.map((item) => (
                  <option key={item.label} value={item.label}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-zinc-800">
              {portion.amount} {portion.unit} · {portion.grams} g · {usdaNutrition.calories} kcal
            </p>
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void saveUsda()}>
              {busy ? 'Saving…' : 'Save & add to recipe'}
            </button>
          </div>
        ) : null}
        {step === 'barcode' ? (
          <div className="space-y-2">
            {scan ? (
              <Suspense fallback={<p className="text-sm text-zinc-600">Opening camera…</p>}>
                <BarcodeScanner disabled={busy} onDetect={(code) => void lookupBarcode(code)} onClose={() => setScan(false)} />
              </Suspense>
            ) : (
              <>
                <button type="button" className={primaryButtonClass} onClick={() => setScan(true)}>
                  Scan barcode
                </button>
                <label className="block text-sm">
                  Or enter a barcode
                  <input className={fieldClass} inputMode="numeric" value={barcode} onChange={(event) => setBarcode(event.target.value)} />
                </label>
                <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => void lookupBarcode(barcode)}>
                  Look up
                </button>
              </>
            )}
          </div>
        ) : null}
        {step === 'barcode-review' ? (
          <div className="space-y-2">
            <p className="text-sm text-zinc-600">Review this product before it becomes a reusable food.</p>
            <label className="block text-sm">
              Name
              <input className={fieldClass} value={packName} onChange={(event) => setPackName(event.target.value)} />
            </label>
            <label className="block text-sm">
              Brand
              <input className={fieldClass} value={packBrand} onChange={(event) => setPackBrand(event.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                Serving amount
                <input className={fieldClass} inputMode="decimal" value={packQuantity} onChange={(event) => setPackQuantity(event.target.value)} />
              </label>
              <label className="block text-sm">
                Serving unit
                <input className={fieldClass} value={packUnit} onChange={(event) => setPackUnit(event.target.value)} />
              </label>
            </div>
            <label className="block text-sm">
              Serving weight (g)
              <input className={fieldClass} inputMode="decimal" value={packGrams} onChange={(event) => setPackGrams(event.target.value)} />
            </label>
            <label className="block text-sm">
              Calories
              <input className={fieldClass} inputMode="decimal" value={packCalories} onChange={(event) => setPackCalories(event.target.value)} />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-sm">
                Protein
                <input className={fieldClass} inputMode="decimal" value={packProtein} onChange={(event) => setPackProtein(event.target.value)} />
              </label>
              <label className="block text-sm">
                Carbs
                <input className={fieldClass} inputMode="decimal" value={packCarbs} onChange={(event) => setPackCarbs(event.target.value)} />
              </label>
              <label className="block text-sm">
                Fat
                <input className={fieldClass} inputMode="decimal" value={packFat} onChange={(event) => setPackFat(event.target.value)} />
              </label>
            </div>
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void saveBarcode()}>
              {busy ? 'Saving…' : 'Save & add to recipe'}
            </button>
          </div>
        ) : null}
        {step === 'manual' ? (
          <div className="space-y-2">
            <label className="block text-sm">
              Name
              <input className={fieldClass} value={manualName} onChange={(event) => setManualName(event.target.value)} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                Serving amount
                <input className={fieldClass} inputMode="decimal" value={manualQuantity} onChange={(event) => setManualQuantity(event.target.value)} />
              </label>
              <label className="block text-sm">
                Serving unit
                <input className={fieldClass} value={manualUnit} onChange={(event) => setManualUnit(event.target.value)} />
              </label>
            </div>
            <label className="block text-sm">
              Serving weight (g)
              <input className={fieldClass} inputMode="decimal" value={manualGrams} onChange={(event) => setManualGrams(event.target.value)} />
            </label>
            <label className="block text-sm">
              Calories
              <input className={fieldClass} inputMode="decimal" value={manualCalories} onChange={(event) => setManualCalories(event.target.value)} />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-sm">
                Protein
                <input className={fieldClass} inputMode="decimal" value={manualProtein} onChange={(event) => setManualProtein(event.target.value)} />
              </label>
              <label className="block text-sm">
                Carbs
                <input className={fieldClass} inputMode="decimal" value={manualCarbs} onChange={(event) => setManualCarbs(event.target.value)} />
              </label>
              <label className="block text-sm">
                Fat
                <input className={fieldClass} inputMode="decimal" value={manualFat} onChange={(event) => setManualFat(event.target.value)} />
              </label>
            </div>
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void saveManual()}>
              {busy ? 'Saving…' : 'Save & add to recipe'}
            </button>
          </div>
        ) : null}
        {step === 'ai' ? (
          <div className="space-y-2">
            <p className="text-sm text-zinc-600">Describe one reusable food, such as one homemade turkey meatball, about 45 g.</p>
            <label className="block text-sm">
              Describe a food
              <textarea className={fieldClass} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
            </label>
            {composite ? <p className="text-sm text-zinc-800">{COMPOSITE_FOOD_GUIDANCE}</p> : null}
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void estimate('gemini')}>
              {busy ? 'Estimating…' : error ? 'Retry' : 'Estimate'}
            </button>
            {error ? (
              <>
                <button type="button" className={`${secondaryButtonClass} w-full`} disabled={busy} onClick={() => void estimate('home_ai')}>
                  Try local AI
                </button>
                <button type="button" className={`${secondaryButtonClass} w-full`} onClick={() => setStep('manual')}>
                  Continue manually
                </button>
                <button type="button" className={`${secondaryButtonClass} w-full`} onClick={onClose}>
                  Cancel
                </button>
              </>
            ) : null}
            {composite && ai ? (
              <button type="button" className={secondaryButtonClass} onClick={() => setStep('ai-review')}>
                Save as one reusable food
              </button>
            ) : null}
          </div>
        ) : null}
        {step === 'ai-review' && ai ? (
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-800">Estimated · AI-assisted</p>
            <p className="text-sm text-zinc-600">This is not verified USDA or label nutrition. Review it before saving.</p>
            <label className="block text-sm">
              Name
              <input className={fieldClass} value={ai.name} onChange={(event) => setAi({ ...ai, name: event.target.value })} />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                Serving amount
                <input className={fieldClass} inputMode="decimal" value={ai.servingQuantity} onChange={(event) => setAi({ ...ai, servingQuantity: event.target.value })} />
              </label>
              <label className="block text-sm">
                Serving unit
                <input className={fieldClass} value={ai.servingUnit} onChange={(event) => setAi({ ...ai, servingUnit: event.target.value })} />
              </label>
            </div>
            <label className="block text-sm">
              Serving weight (g)
              <input className={fieldClass} inputMode="decimal" value={ai.servingGrams} onChange={(event) => setAi({ ...ai, servingGrams: event.target.value })} />
            </label>
            <label className="block text-sm">
              Calories
              <input className={fieldClass} inputMode="decimal" value={ai.calories} onChange={(event) => setAi({ ...ai, calories: event.target.value })} />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="block text-sm">
                Protein
                <input className={fieldClass} inputMode="decimal" value={ai.protein} onChange={(event) => setAi({ ...ai, protein: event.target.value })} />
              </label>
              <label className="block text-sm">
                Carbs
                <input className={fieldClass} inputMode="decimal" value={ai.carbs} onChange={(event) => setAi({ ...ai, carbs: event.target.value })} />
              </label>
              <label className="block text-sm">
                Fat
                <input className={fieldClass} inputMode="decimal" value={ai.fat} onChange={(event) => setAi({ ...ai, fat: event.target.value })} />
              </label>
            </div>
            <button type="button" className={primaryButtonClass} disabled={busy} onClick={() => void saveAi()}>
              {busy ? 'Saving…' : 'Save & add to recipe'}
            </button>
          </div>
        ) : null}
        {step !== 'choose' ? (
          <button type="button" className={secondaryButtonClass} onClick={() => { setError(null); setStep('choose') }}>
            Back
          </button>
        ) : (
          <button type="button" className={secondaryButtonClass} onClick={onClose}>
            Cancel
          </button>
        )}
      </div>
    </NutritionSheet>
  )
}
