import { randomUUID } from 'node:crypto'
import {
  NUTRITION_CONFIG,
  NutritionInterpretError,
  descriptionFailureMessage,
  descriptionPortion,
  dropInterpreterNutrients,
  localFoodDescriptionInterpreter,
  matchMealComponent,
  parseFoodDescription,
  type FoodDescriptionInterpreter,
  type NutritionFood,
} from '../../src/domain/nutrition/index.js'
import { HttpError } from '../http.js'
import { getSql } from '../db.js'
import { commitNutritionMeal } from './meal.js'
import { getFood, insertFood, listFoods } from './queries.js'
import { createUsdaFdcProvider, type UsdaFoodCandidate, type UsdaSearchResult } from './providers/usda-fdc.js'

const LOCAL_MATCH_SCORE = 80

export type DescriptionPreview = {
  original: string
  components: Array<{
    id: string
    proposedName: string
    quantity: number | null
    unit: string
    preparation: string | null
    ambiguity: string | null
    matches: Array<{
      foodId: string
      name: string
      score: number
      servingQuantity: number
      servingUnit: string
      servingGrams: number | null
      calories: number
      protein: number | null
      carbs: number | null
      fat: number | null
      fiber: number | null
    }>
    usda: Array<Pick<UsdaFoodCandidate, 'fdcId' | 'name' | 'servingQuantity' | 'servingUnit' | 'servingGrams' | 'calories' | 'protein' | 'carbs' | 'fat' | 'fiber'>>
    selectedFoodId: string | null
  }>
}

type UsdaLookup = {
  search(query: string): Promise<UsdaSearchResult>
  getFood(fdcId: number): Promise<UsdaFoodCandidate | null>
}

export async function previewFoodDescription(
  text: string,
  options?: { interpret?: FoodDescriptionInterpreter; usda?: UsdaLookup; foods?: NutritionFood[] },
): Promise<DescriptionPreview> {
  const interpreter = options?.interpret ?? localFoodDescriptionInterpreter
  const interpreted = dropInterpreterNutrients(await interpreter.interpret(text))
  const candidate = interpreted.components.length > 0 || options?.interpret ? interpreted : parseFoodDescription(text)
  if (candidate.components.length === 0 && options?.interpret && options.interpret !== localFoodDescriptionInterpreter) {
    throw new NutritionInterpretError('GEMINI_SEMANTIC', descriptionFailureMessage('GEMINI_SEMANTIC'))
  }
  const foods = options?.foods ?? (await listFoods(null, 400))
  const usda = options?.usda ?? createUsdaFdcProvider()
  const components = []
  for (const component of candidate.components) {
    const ranked = matchMealComponent(component.proposedName, foods)
    const selected = ranked.find((item) => item.score >= LOCAL_MATCH_SCORE) ?? null
    let usdaCandidates: DescriptionPreview['components'][number]['usda'] = []
    if (!selected) {
      const found = await usda.search(component.proposedName)
      if (found.status === 'found') {
        usdaCandidates = found.candidates
      }
    }
    components.push({
      id: component.id,
      proposedName: component.proposedName,
      quantity: component.quantity,
      unit: component.unit,
      preparation: component.preparation,
      ambiguity: component.ambiguity,
      matches: ranked.slice(0, 5).map((item) => ({
        foodId: item.food.id,
        name: item.food.name,
        score: item.score,
        servingQuantity: item.food.servingQuantity,
        servingUnit: item.food.servingUnit,
        servingGrams: item.food.servingGrams,
        calories: item.food.calories,
        protein: item.food.protein,
        carbs: item.food.carbs,
        fat: item.food.fat,
        fiber: item.food.fiber,
      })),
      usda: usdaCandidates,
      selectedFoodId: selected?.food.id ?? null,
    })
  }
  return { original: candidate.original || text.trim(), components }
}

async function foodForFdc(fdcId: number, usda: UsdaLookup): Promise<NutritionFood> {
  const sql = await getSql()
  const fingerprint = `usda-fdc|${fdcId}`
  const existing = (await sql.query(
    `SELECT entity_id FROM source_record_links WHERE external_fingerprint = $1 AND entity_type = 'nutrition_food' LIMIT 1`,
    [fingerprint],
  )) as Array<{ entity_id: string }>
  if (existing[0]?.entity_id) {
    const food = await getFood(existing[0].entity_id)
    if (food) {
      return food
    }
  }
  const candidate = await usda.getFood(fdcId)
  if (!candidate) {
    throw new HttpError(502, 'Ingredient lookup is temporarily unavailable.')
  }
  const sources = (await sql.query(`SELECT id FROM data_sources WHERE key = 'health_app' LIMIT 1`)) as Array<{ id: string }>
  const sourceId = sources[0]?.id
  if (!sourceId) {
    throw new HttpError(500, 'health_app data source is not configured')
  }
  let food: NutritionFood
  try {
    food = await insertFood([
      candidate.name,
      null,
      null,
      'ingredient',
      candidate.servingQuantity,
      candidate.servingUnit,
      candidate.servingGrams,
      candidate.calories,
      candidate.protein,
      candidate.carbs,
      candidate.fat,
      candidate.fiber,
      'import',
      false,
      `USDA FoodData Central ${fdcId}`,
    ])
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!message.includes('nutrition_foods_name_brand_kind_uidx')) {
      throw error
    }
    const foods = await listFoods(candidate.name, 20)
    const match = foods.find((item) => item.name.toLowerCase() === candidate.name.toLowerCase())
    if (!match) {
      throw error
    }
    food = match
  }
  await sql.query(
    `INSERT INTO source_record_links (
       id, source_id, import_job_id, external_id, external_fingerprint, entity_type, entity_id, source_payload
     ) VALUES ($1,$2,NULL,$3,$4,'nutrition_food',$5,$6::jsonb)
     ON CONFLICT (source_id, external_fingerprint) DO NOTHING`,
    [randomUUID(), sourceId, String(fdcId), fingerprint, food.id, JSON.stringify({ fdcId })],
  )
  return food
}

export async function commitFoodDescription(body: {
  text: string
  logDate: string
  timezone?: string
  meal?: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other' | null
  components: Array<{
    id: string
    included: boolean
    proposedName: string
    foodId: string | null
    fdcId?: number | null
    quantity: number | null
    unit: string
    grams: number | null
  }>
}, usda: UsdaLookup = createUsdaFdcProvider()) {
  const resolved = []
  for (const component of body.components) {
    if (!component.included) {
      resolved.push(component)
      continue
    }
    let foodId = component.foodId
    if (!foodId && component.fdcId) {
      foodId = (await foodForFdc(component.fdcId, usda)).id
    }
    const food = foodId ? await getFood(foodId) : null
    if (!food) {
      throw new HttpError(400, `Choose a Health food for ${component.proposedName}.`)
    }
    const portion = descriptionPortion({ quantity: component.quantity, unit: component.unit, food })
    if (!portion.resolved) {
      throw new HttpError(400, component.quantity == null
        ? `Enter a portion for ${component.proposedName}.`
        : `${component.proposedName} needs a gram amount or a matching serving.`)
    }
    resolved.push({ ...component, foodId: food.id, grams: portion.grams })
  }
  return commitNutritionMeal({
    descriptionText: body.text,
    logDate: body.logDate,
    timezone: body.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
    meal: body.meal ?? null,
    components: resolved.map((component) => ({
      id: component.id,
      included: component.included,
      foodId: component.foodId,
      proposedName: component.proposedName,
      quantity: component.quantity,
      unit: component.unit,
      grams: component.grams,
    })),
  })
}
