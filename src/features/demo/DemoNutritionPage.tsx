import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { DEMO_AS_OF, DEMO_RANGE_START } from '@/demo/constants'
import { demoFoods, demoNutritionEntries } from '@/demo/repository'
import { addCalendarDays } from '@/domain/progress/dates'
import { formatGrams, formatKcal, mealLabel, macroHeadline, remainingHeadline } from '@/features/nutrition/format'
import { nutritionDayTotals } from '@/domain/nutrition/totals'
import { resolveNutritionTarget } from '@/domain/nutrition/targets'
import { demoDataset } from '@/demo/dataset'
import { formatCalendarDate } from '@/features/progress/format'

export function DemoNutritionPage() {
  const [params] = useSearchParams()
  const requested = params.get('date')
  const date = requested && requested >= DEMO_RANGE_START && requested <= DEMO_AS_OF ? requested : DEMO_AS_OF
  const entries = demoNutritionEntries(date) ?? []
  const totals = entries.length > 0 ? nutritionDayTotals(entries) : null
  const target = resolveNutritionTarget(demoDataset().targets, date)
  const previous = date > DEMO_RANGE_START ? addCalendarDays(date, -1) : null
  const next = date < DEMO_AS_OF ? addCalendarDays(date, 1) : null
  const foods = demoFoods()

  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nutrition</h1>
        <p className="mt-1 text-sm text-zinc-600">{formatCalendarDate(date)}</p>
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {previous ? (
          <Link to={`/demo/nutrition?date=${previous}`} className="font-medium underline">
            Previous day
          </Link>
        ) : null}
        {next ? (
          <Link to={`/demo/nutrition?date=${next}`} className="font-medium underline">
            Next day
          </Link>
        ) : null}
      </div>
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        {totals && target ? (
          <ul className="space-y-1 text-sm">
            <Nutrient label="Calories" line={macroHeadline(totals.calories, target.caloriesTarget, 'kcal')} remainder={remainingHeadline(totals.calories, target.caloriesTarget, 'kcal')} />
            <Nutrient label="Protein" line={macroHeadline(totals.protein, target.proteinTarget, 'g')} remainder={remainingHeadline(totals.protein, target.proteinTarget, 'g')} />
            <Nutrient label="Carbs" line={macroHeadline(totals.carbs, target.carbsTarget, 'g')} remainder={remainingHeadline(totals.carbs, target.carbsTarget, 'g')} />
            <Nutrient label="Fat" line={macroHeadline(totals.fat, target.fatTarget, 'g')} remainder={remainingHeadline(totals.fat, target.fatTarget, 'g')} />
            <Nutrient label="Fiber" line={macroHeadline(totals.fiber, target.fiberTarget, 'g')} remainder={remainingHeadline(totals.fiber, target.fiberTarget, 'g')} />
          </ul>
        ) : (
          <p className="text-sm text-zinc-700">No food logged this day.</p>
        )}
      </section>
      {entries.length > 0 ? (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.id} className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm">
              <p className="font-medium">{entry.foodName}</p>
              <p className="text-zinc-600">
                {entry.meal ? mealLabel(entry.meal) : 'Entry'} · {formatKcal(entry.calories)}
                {entry.protein != null ? ` · ${formatGrams(entry.protein)} protein` : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      <section className="rounded-lg border border-zinc-200 bg-white p-4">
        <h2 className="text-sm font-semibold tracking-tight">Saved foods</h2>
        <ul className="mt-2 space-y-1 text-sm text-zinc-700">
          {foods.map((food) => (
            <li key={food.id}>
              {food.name}
              {food.brand ? ` · ${food.brand}` : ''} · {formatKcal(food.calories)}
            </li>
          ))}
        </ul>
      </section>
      <SampleMeal />
      <SampleLabel />
    </section>
  )
}

function Nutrient({ label, line, remainder }: { label: string; line: string; remainder: string | null }) {
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span>
        {label} {line}
      </span>
      {remainder ? <span className="shrink-0 text-zinc-500">{remainder}</span> : null}
    </li>
  )
}

function SampleMeal() {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold tracking-tight">Meal photo</h2>
      <p className="mt-1 text-sm text-zinc-600">Capture runs in the private app. This sample is already prepared.</p>
      <button type="button" className="mt-3 text-sm font-medium underline" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide sample meal photo result' : 'See sample meal photo result'}
      </button>
      {open ? (
        <ul className="mt-3 space-y-1 text-sm text-zinc-800">
          <li>Rolled oats · 80 g · 310 kcal</li>
          <li>Blueberries · 70 g · 40 kcal</li>
          <li>Greek yogurt · 170 g · 170 kcal</li>
        </ul>
      ) : null}
    </section>
  )
}

function SampleLabel() {
  const [open, setOpen] = useState(false)
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4">
      <h2 className="text-sm font-semibold tracking-tight">Nutrition label</h2>
      <p className="mt-1 text-sm text-zinc-600">Label extraction stays in the private app. This sample is already prepared.</p>
      <button type="button" className="mt-3 text-sm font-medium underline" onClick={() => setOpen((value) => !value)}>
        {open ? 'Hide sample label extraction' : 'See sample nutrition label extraction'}
      </button>
      {open ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-zinc-500">Serving</dt>
          <dd>1 bar (60 g)</dd>
          <dt className="text-zinc-500">Calories</dt>
          <dd>240 kcal</dd>
          <dt className="text-zinc-500">Protein</dt>
          <dd>10 g</dd>
          <dt className="text-zinc-500">Carbs</dt>
          <dd>28 g</dd>
          <dt className="text-zinc-500">Fat</dt>
          <dd>9 g</dd>
          <dt className="text-zinc-500">Fiber</dt>
          <dd>4 g</dd>
        </dl>
      ) : null}
    </section>
  )
}
