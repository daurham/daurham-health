import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { NutritionCatalogKind } from '@/domain/nutrition'
import type { NutritionFood, NutritionFoodManagement } from '@/domain/nutrition'
import { primaryButtonClass, quietButtonClass, secondaryButtonClass } from '@/lib'
import { createNutritionFood, fetchPantryFoods, patchNutritionFood } from './api'
import { FoodEditorSheet } from './panels'
import { RecipeIngredientSheet } from './RecipeIngredientSheet'
import { LabelCaptureSheet } from './LabelCapture'
import { useHealthCalendarDate } from '@/lib'
import { NutritionSheet } from './Sheet'

type PantryFilter = 'all' | 'ingredient' | 'packaged' | 'custom' | 'staple'
type PantryArchiveFilter = 'active' | 'archived' | 'all'
type PantrySort = 'recent' | 'used' | 'alpha'

function normalizeFoodName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function possibleDuplicates(
  foods: readonly NutritionFoodManagement[],
  input: {
    name: string
    brand: string
    servingQuantity: string
    servingUnit: string
  },
): NutritionFoodManagement[] {
  const normalized = normalizeFoodName(input.name)
  const normalizedBrand = normalizeFoodName(input.brand)
  const normalizedServingUnit = normalizeFoodName(input.servingUnit)
  const servingQuantity = Number(input.servingQuantity)
  if (normalized.length < 3) return []
  return foods
    .map((food) => {
      const foodName = normalizeFoodName(food.name)
      const foodBrand = normalizeFoodName(food.brand ?? '')
      const foodServingUnit = normalizeFoodName(food.servingUnit)
      const sameName = foodName === normalized
      const nearName = foodName.includes(normalized) || normalized.includes(foodName)
      const brandCompatible = !normalizedBrand || !foodBrand || foodBrand === normalizedBrand
      const servingUnitCompatible =
        !normalizedServingUnit || !foodServingUnit || foodServingUnit === normalizedServingUnit
      const servingQuantityCompatible =
        !Number.isFinite(servingQuantity) ||
        Math.abs(food.servingQuantity - servingQuantity) <= Math.max(0.05, Math.abs(servingQuantity) * 0.1)
      const score =
        (sameName ? 4 : nearName ? 2 : 0) +
        (brandCompatible ? 1 : 0) +
        (servingUnitCompatible ? 1 : 0) +
        (servingQuantityCompatible ? 1 : 0)
      return { food, score, sameName, nearName, brandCompatible }
    })
    .filter((candidate) => candidate.brandCompatible && (candidate.sameName || candidate.nearName) && candidate.score >= 4)
    .sort((left, right) => right.score - left.score || left.food.name.localeCompare(right.food.name))
    .slice(0, 4)
    .map((candidate) => candidate.food)
}

function displayDate(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`))
}

function foodKindLabel(kind: NutritionCatalogKind): string {
  if (kind === 'ingredient') return 'Ingredient'
  if (kind === 'packaged') return 'Packaged'
  if (kind === 'custom') return 'Custom'
  return 'Recipe'
}

function optionalNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function PantryPage() {
  const [foods, setFoods] = useState<NutritionFoodManagement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PantryFilter>('all')
  const [archiveFilter, setArchiveFilter] = useState<PantryArchiveFilter>('active')
  const [sort, setSort] = useState<PantrySort>('recent')
  const [editing, setEditing] = useState<NutritionFood | null>(null)
  const [adding, setAdding] = useState(false)
  const [sourceFlow, setSourceFlow] = useState(false)
  const [labelFlow, setLabelFlow] = useState(false)
  const date = useHealthCalendarDate()
  const [busyId, setBusyId] = useState<string | null>(null)

  async function reload() {
    setError(null)
    try {
      setFoods(await fetchPantryFoods())
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load Pantry')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void reload()
  }, [])

  const visible = useMemo(() => {
    const needle = normalizeFoodName(query)
    const filtered = foods.filter((food) => {
      if (archiveFilter === 'active' && food.archived) return false
      if (archiveFilter === 'archived' && !food.archived) return false
      if (filter === 'staple' && !food.isStaple) return false
      if (filter !== 'all' && filter !== 'staple' && food.catalogKind !== filter) return false
      if (!needle) return true
      return normalizeFoodName(`${food.name} ${food.brand ?? ''}`).includes(needle)
    })
    return filtered.sort((left, right) => {
      if (sort === 'used') {
        return right.usageCount - left.usageCount || left.name.localeCompare(right.name)
      }
      if (sort === 'recent') {
        return (right.lastUsedDate ?? '').localeCompare(left.lastUsedDate ?? '') || left.name.localeCompare(right.name)
      }
      return left.name.localeCompare(right.name)
    })
  }, [archiveFilter, filter, foods, query, sort])

  async function setArchived(food: NutritionFoodManagement, archived: boolean) {
    if (busyId) return
    setBusyId(food.id)
    setError(null)
    try {
      await patchNutritionFood(food.id, { archived })
      await reload()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update Pantry')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/nutrition" className="text-sm text-zinc-500 hover:text-zinc-900">← Nutrition</Link>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Pantry</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">
            Manage reusable foods. Editing a definition affects future logs only; old Nutrition entries stay as recorded.
          </p>
        </div>
        <button type="button" className={primaryButtonClass} onClick={() => setSourceFlow(true)}>
          Add food
        </button>
        <button type="button" className={secondaryButtonClass} onClick={() => setAdding(true)}>Advanced manual</button>
      </div>

      {error ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

      <div className="grid gap-3 rounded-xl border border-zinc-200 bg-white p-3 md:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
        <label className="min-w-0">
          <span className="sr-only">Search Pantry</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search foods or brands"
            className="min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base md:text-sm"
          />
        </label>
        <select value={filter} onChange={(event) => setFilter(event.target.value as PantryFilter)} className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm">
          <option value="all">All foods</option>
          <option value="ingredient">Ingredients</option>
          <option value="packaged">Packaged</option>
          <option value="custom">Custom</option>
          <option value="staple">Staples</option>
        </select>
        <select value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value as PantryArchiveFilter)} className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm">
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All states</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as PantrySort)} className="min-h-11 rounded-md border border-zinc-300 bg-white px-3 text-sm">
          <option value="recent">Recently used</option>
          <option value="used">Most used</option>
          <option value="alpha">A–Z</option>
        </select>
      </div>

      {loading ? (
        <div className="space-y-2" aria-label="Loading Pantry">
          {Array.from({ length: 5 }, (_, index) => <div key={index} className="h-20 animate-pulse rounded-lg bg-zinc-100" />)}
        </div>
      ) : visible.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-white p-5 text-sm text-zinc-600">No Pantry foods match these filters.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 overflow-hidden rounded-xl border border-zinc-200 bg-white">
          {visible.map((food) => (
            <li key={food.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold text-zinc-900">{food.name}</h2>
                    {food.brand ? <span className="text-sm text-zinc-500">{food.brand}</span> : null}
                    {food.isStaple ? <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">Staple</span> : null}
                    {food.archived ? <span className="rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600">Archived</span> : null}
                  </div>
                  <p className="mt-1 text-sm text-zinc-700">
                    {food.servingQuantity} {food.servingUnit} · {Math.round(food.calories).toLocaleString('en-US')} kcal
                    {food.protein == null ? '' : ` · ${Math.round(food.protein * 10) / 10} g protein`}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {foodKindLabel(food.catalogKind)}
                    {' · '}
                    {food.usageCount === 0 ? 'Never logged' : `Used ${food.usageCount} time${food.usageCount === 1 ? '' : 's'}`}
                    {food.lastUsedDate ? ` · Last ${displayDate(food.lastUsedDate)}` : ''}
                    {food.recipeUseCount > 0 ? ` · ${food.recipeUseCount} recipe${food.recipeUseCount === 1 ? '' : 's'}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button type="button" className={secondaryButtonClass} onClick={() => setEditing(food)}>Edit</button>
                  {food.archived ? (
                    <button type="button" className={quietButtonClass} disabled={busyId === food.id} onClick={() => void setArchived(food, false)}>
                      Restore
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={quietButtonClass}
                      disabled={busyId === food.id}
                      onClick={() => {
                        if (globalThis.confirm(`Archive “${food.name}”? It will disappear from normal search and logging. Previous logs and Recipe Versions stay unchanged.`)) {
                          void setArchived(food, true)
                        }
                      }}
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <FoodEditorSheet
          food={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void reload()
          }}
        />
      ) : null}

      {sourceFlow ? (
        <RecipeIngredientSheet
          initialStep="choose"
          onClose={() => setSourceFlow(false)}
          onFood={() => { setSourceFlow(false); void reload() }}
          onLabel={() => { setSourceFlow(false); setLabelFlow(true) }}
        />
      ) : null}
      {labelFlow ? (
        <LabelCaptureSheet
          date={date}
          purpose="recipe"
          onClose={() => setLabelFlow(false)}
          onBack={() => { setLabelFlow(false); setSourceFlow(true) }}
          onLogged={() => { setLabelFlow(false); void reload() }}
          onSavedFood={() => { setLabelFlow(false); void reload() }}
        />
      ) : null}
      {adding ? (
        <NewPantryFoodSheet
          foods={foods}
          onClose={() => setAdding(false)}
          onOpenExisting={(food) => {
            setAdding(false)
            setEditing(food)
          }}
          onCreated={() => {
            setAdding(false)
            void reload()
          }}
        />
      ) : null}
    </section>
  )
}

function NewPantryFoodSheet({
  foods,
  onClose,
  onOpenExisting,
  onCreated,
}: {
  foods: NutritionFoodManagement[]
  onClose: () => void
  onOpenExisting: (food: NutritionFoodManagement) => void
  onCreated: (food: NutritionFood) => void
}) {
  const [name, setName] = useState('')
  const [brand, setBrand] = useState('')
  const [kind, setKind] = useState<Exclude<NutritionCatalogKind, 'recipe'>>('ingredient')
  const [servingQuantity, setServingQuantity] = useState('1')
  const [servingUnit, setServingUnit] = useState('serving')
  const [servingGrams, setServingGrams] = useState('')
  const [calories, setCalories] = useState('')
  const [protein, setProtein] = useState('')
  const [carbs, setCarbs] = useState('')
  const [fat, setFat] = useState('')
  const [fiber, setFiber] = useState('')
  const [sodium, setSodium] = useState('')
  const [notes, setNotes] = useState('')
  const [staple, setStaple] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const duplicates = useMemo(
    () => possibleDuplicates(foods, { name, brand, servingQuantity, servingUnit }),
    [brand, foods, name, servingQuantity, servingUnit],
  )

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const saved = await createNutritionFood({
        name: name.trim(),
        brand: brand.trim() || null,
        catalogKind: kind,
        servingQuantity: Number(servingQuantity),
        servingUnit: servingUnit.trim(),
        servingGrams: optionalNumber(servingGrams),
        calories: Number(calories),
        protein: optionalNumber(protein),
        carbs: optionalNumber(carbs),
        fat: optionalNumber(fat),
        fiber: optionalNumber(fiber),
        sodium: optionalNumber(sodium),
        sourceKind: 'manual',
        isStaple: staple,
        notes: notes.trim() || null,
      })
      onCreated(saved)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create food')
    } finally {
      setBusy(false)
    }
  }

  const inputClass = 'mt-1 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base md:text-sm'

  return (
    <NutritionSheet
      title="Add Pantry food"
      onClose={onClose}
      footer={<button type="submit" form="new-pantry-food" className={primaryButtonClass} disabled={busy}>{busy ? 'Saving…' : 'Save food'}</button>}
    >
      <form id="new-pantry-food" className="space-y-3" onSubmit={submit}>
        <label className="block text-sm font-medium">Name<input autoFocus className={inputClass} value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label className="block text-sm font-medium">Brand<input className={inputClass} value={brand} onChange={(event) => setBrand(event.target.value)} /></label>
        {duplicates.length > 0 ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Possible duplicates</p>
            <ul className="mt-2 space-y-2">
              {duplicates.map((food) => (
                <li key={food.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>
                    {food.name}
                    {food.brand ? ` · ${food.brand}` : ''}
                    {food.archived ? ' · archived' : ''}
                    {food.servingQuantity ? ` · ${food.servingQuantity} ${food.servingUnit}` : ''}
                  </span>
                  <button type="button" className={quietButtonClass} onClick={() => onOpenExisting(food)}>
                    Edit existing
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs">You can still create this food. Pantry never auto-merges definitions.</p>
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">Kind<select className={inputClass} value={kind} onChange={(event) => setKind(event.target.value as Exclude<NutritionCatalogKind, 'recipe'>)}><option value="ingredient">Ingredient</option><option value="packaged">Packaged</option><option value="custom">Custom</option></select></label>
          <label className="block text-sm font-medium">Serving quantity<input className={inputClass} inputMode="decimal" value={servingQuantity} onChange={(event) => setServingQuantity(event.target.value)} required /></label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="block text-sm font-medium">Serving unit<input className={inputClass} value={servingUnit} onChange={(event) => setServingUnit(event.target.value)} required /></label>
          <label className="block text-sm font-medium">Serving grams<input className={inputClass} inputMode="decimal" value={servingGrams} onChange={(event) => setServingGrams(event.target.value)} /></label>
        </div>
        <label className="block text-sm font-medium">Calories<input className={inputClass} inputMode="decimal" value={calories} onChange={(event) => setCalories(event.target.value)} required /></label>
        <div className="grid grid-cols-2 gap-3">
          {[
            ['Protein g', protein, setProtein],
            ['Carbs g', carbs, setCarbs],
            ['Fat g', fat, setFat],
            ['Fiber g', fiber, setFiber],
            ['Sodium mg', sodium, setSodium],
          ].map(([label, value, setter]) => (
            <label key={label as string} className="block text-sm font-medium">{label as string}
              <input className={inputClass} inputMode="decimal" value={value as string} onChange={(event) => (setter as (value: string) => void)(event.target.value)} />
            </label>
          ))}
        </div>
        <label className="block text-sm font-medium">Notes<textarea className={inputClass + ' py-2'} rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={staple} onChange={(event) => setStaple(event.target.checked)} /> Staple</label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
      </form>
    </NutritionSheet>
  )
}
