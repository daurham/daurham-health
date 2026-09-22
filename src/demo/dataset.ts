import { ACTIVITY_TIMEZONE } from '../domain/activity/config.js'
import type { ActivityDailyRow } from '../domain/activity/analytics.js'
import type { NutritionEntry, NutritionFood, NutritionTarget } from '../domain/nutrition/types.js'
import { addCalendarDays, parseCalendarDateUtc } from '../domain/progress/dates.js'
import type { ProgressActivityWorkout } from '../domain/progress/health-timeline.js'
import type { ProgressCheckpoint } from '../domain/progress/checkpoints.js'
import type {
  BodyObservation,
  CanonicalSetRecord,
  ProgressExerciseDefinition,
  ProgressWorkoutSummary,
} from '../domain/progress/types.js'
import { SLEEP_NIGHT_CALCULATION_VERSION, SLEEP_TIMEZONE } from '../domain/sleep/config.js'
import type { SleepNightlySummary } from '../domain/sleep/summarize.js'
import { DEMO_AS_OF, DEMO_DATA_VERSION, DEMO_RANGE_START } from './constants.js'

const SOURCE = 'Wrist tracker'
const UNLOGGED_NUTRITION = new Set(['2026-08-12'])
const MISSING_ACTIVITY = new Set(['2026-02-17', '2026-06-21'])
const MISSING_STEPS = '2026-03-03'
const EXPLICIT_ZERO_EXERCISE = '2026-04-02'
const PARTIAL_SLEEP = new Set(['2026-03-11', '2026-07-08'])
const MISSING_SLEEP = new Set(['2026-02-19', '2026-05-21', '2026-08-30'])
const LOW_STAGE_SLEEP = '2026-04-16'

export type DemoDataset = {
  version: string
  asOf: string
  exercises: ProgressExerciseDefinition[]
  sets: CanonicalSetRecord[]
  workouts: ProgressWorkoutSummary[]
  body: BodyObservation[]
  foods: NutritionFood[]
  entries: NutritionEntry[]
  targets: NutritionTarget[]
  activity: ActivityDailyRow[]
  activityWorkouts: ProgressActivityWorkout[]
  sleep: SleepNightlySummary[]
  checkpoints: ProgressCheckpoint[]
}

const EXERCISES: ProgressExerciseDefinition[] = [
  {
    id: 'demo-ex-squat',
    name: 'Box Squat',
    externalId: null,
    performanceType: 'loaded_reps',
    analyticsLoadType: 'external',
    analyticsRepMode: 'standard',
    measurementKind: 'reps',
    unilateral: false,
  },
  {
    id: 'demo-ex-bench',
    name: 'Bench Press',
    externalId: null,
    performanceType: 'loaded_reps',
    analyticsLoadType: 'external',
    analyticsRepMode: 'standard',
    measurementKind: 'reps',
    unilateral: false,
  },
  {
    id: 'demo-ex-press',
    name: 'Overhead Press',
    externalId: null,
    performanceType: 'loaded_reps',
    analyticsLoadType: 'external',
    analyticsRepMode: 'standard',
    measurementKind: 'reps',
    unilateral: false,
  },
  {
    id: 'demo-ex-goblet',
    name: 'Goblet Squat',
    externalId: null,
    performanceType: 'loaded_reps',
    analyticsLoadType: 'external',
    analyticsRepMode: 'standard',
    measurementKind: 'reps',
    unilateral: false,
  },
  {
    id: 'demo-ex-lunge',
    name: 'Reverse Lunge',
    externalId: null,
    performanceType: 'loaded_reps',
    analyticsLoadType: 'external',
    analyticsRepMode: 'per_side',
    measurementKind: 'reps',
    unilateral: true,
  },
  {
    id: 'demo-ex-carry',
    name: 'Farmer Carry',
    externalId: null,
    performanceType: 'timed',
    analyticsLoadType: 'external',
    analyticsRepMode: 'standard',
    measurementKind: 'duration',
    unilateral: false,
  },
]

const ROUTINES: Array<{ code: string; name: string; exerciseIds: string[] }> = [
  { code: 'A', name: 'Lower A', exerciseIds: ['demo-ex-squat', 'demo-ex-bench', 'demo-ex-carry'] },
  { code: 'B', name: 'Lower B', exerciseIds: ['demo-ex-goblet', 'demo-ex-lunge', 'demo-ex-carry'] },
  { code: 'C', name: 'Upper', exerciseIds: ['demo-ex-bench', 'demo-ex-press', 'demo-ex-squat'] },
]

function hashDate(date: string): number {
  let hash = 2166136261
  for (let index = 0; index < date.length; index += 1) {
    hash ^= date.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function eachDate(start: string, end: string): string[] {
  const dates: string[] = []
  let cursor = start
  while (cursor <= end) {
    dates.push(cursor)
    cursor = addCalendarDays(cursor, 1)
  }
  return dates
}

function weekday(date: string): number {
  return parseCalendarDateUtc(date).getUTCDay()
}

function atPhoenix(date: string, hour: number, minute: number): string {
  const utc = parseCalendarDateUtc(date)
  utc.setUTCHours(hour + 7, minute, 0, 0)
  return utc.toISOString()
}

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step
}

function loadFor(exerciseId: string, appearance: number): number {
  const bases: Record<string, { base: number; step: number }> = {
    'demo-ex-squat': { base: 70, step: 2.5 },
    'demo-ex-bench': { base: 50, step: 1.25 },
    'demo-ex-press': { base: 30, step: 1.25 },
    'demo-ex-goblet': { base: 24, step: 2 },
    'demo-ex-lunge': { base: 16, step: 2 },
    'demo-ex-carry': { base: 24, step: 2 },
  }
  const spec = bases[exerciseId] ?? { base: 20, step: 1 }
  return roundTo(spec.base + spec.step * Math.floor(appearance / 2), spec.step)
}

function foodStamp(date: string): string {
  return `${date}T15:00:00.000Z`
}

function makeFood(input: {
  id: string
  name: string
  brand: string | null
  calories: number
  protein: number
  carbs: number
  fat: number
  fiber: number | null
  servingQuantity: number
  servingUnit: string
}): NutritionFood {
  return {
    id: input.id,
    name: input.name,
    brand: input.brand,
    barcode: null,
    catalogKind: 'custom',
    servingQuantity: input.servingQuantity,
    servingUnit: input.servingUnit,
    servingGrams: null,
    calories: input.calories,
    protein: input.protein,
    carbs: input.carbs,
    fat: input.fat,
    fiber: input.fiber,
    sourceKind: 'manual',
    isStaple: true,
    archived: false,
    notes: null,
    createdAt: '2026-01-06T15:00:00.000Z',
    updatedAt: '2026-01-06T15:00:00.000Z',
  }
}

const FOODS: NutritionFood[] = [
  makeFood({ id: 'demo-food-oats', name: 'Rolled oats', brand: null, calories: 310, protein: 11, carbs: 54, fat: 6, fiber: 8, servingQuantity: 80, servingUnit: 'g' }),
  makeFood({ id: 'demo-food-yogurt', name: 'Greek yogurt', brand: 'Plain', calories: 170, protein: 18, carbs: 8, fat: 5, fiber: 0, servingQuantity: 170, servingUnit: 'g' }),
  makeFood({ id: 'demo-food-chicken', name: 'Chicken thigh', brand: null, calories: 280, protein: 32, carbs: 0, fat: 16, fiber: 0, servingQuantity: 160, servingUnit: 'g' }),
  makeFood({ id: 'demo-food-rice', name: 'Jasmine rice', brand: null, calories: 240, protein: 5, carbs: 52, fat: 1, fiber: 1, servingQuantity: 180, servingUnit: 'g' }),
  makeFood({ id: 'demo-food-salmon', name: 'Salmon fillet', brand: null, calories: 360, protein: 39, carbs: 0, fat: 22, fiber: 0, servingQuantity: 170, servingUnit: 'g' }),
  makeFood({ id: 'demo-food-potato', name: 'Roasted potatoes', brand: null, calories: 220, protein: 4, carbs: 42, fat: 5, fiber: 4, servingQuantity: 200, servingUnit: 'g' }),
  makeFood({ id: 'demo-food-shake', name: 'Whey protein shake', brand: null, calories: 160, protein: 32, carbs: 6, fat: 2, fiber: 1, servingQuantity: 1, servingUnit: 'scoop' }),
  makeFood({ id: 'demo-food-greens', name: 'Mixed greens', brand: null, calories: 40, protein: 3, carbs: 6, fat: 0, fiber: 3, servingQuantity: 80, servingUnit: 'g' }),
  makeFood({ id: 'demo-food-coffee', name: 'Coffee', brand: null, calories: 5, protein: 0, carbs: 0, fat: 0, fiber: 0, servingQuantity: 240, servingUnit: 'ml' }),
]

function entryFrom(date: string, food: NutritionFood, meal: NutritionEntry['meal'], scale: number, fiber: number | null, index: number): NutritionEntry {
  const factor = scale
  return {
    id: `demo-entry-${date}-${index}`,
    logDate: date,
    consumedAt: null,
    timezone: 'America/Phoenix',
    meal,
    foodId: food.id,
    foodName: food.name,
    brand: food.brand,
    servingQuantity: Math.round(food.servingQuantity * factor * 10) / 10,
    servingUnit: food.servingUnit,
    grams: null,
    calories: Math.round(food.calories * factor),
    protein: food.protein == null ? null : Math.round(food.protein * factor * 10) / 10,
    carbs: food.carbs == null ? null : Math.round(food.carbs * factor * 10) / 10,
    fat: food.fat == null ? null : Math.round(food.fat * factor * 10) / 10,
    fiber,
    sourceKind: 'manual',
    notes: null,
    mealGroupId: null,
    createdAt: foodStamp(date),
    updatedAt: foodStamp(date),
  }
}

function nutritionEntriesFor(date: string, training: boolean): NutritionEntry[] {
  const food = (id: string) => FOODS.find((item) => item.id === id)!
  const wobble = (hashDate(date) % 5) * 0.04
  const entries: NutritionEntry[] = [
    entryFrom(date, food('demo-food-oats'), 'breakfast', 1 + wobble, food('demo-food-oats').fiber, 1),
    entryFrom(date, food('demo-food-chicken'), 'lunch', training ? 1.7 : 1.15, 0, 2),
    entryFrom(date, food('demo-food-rice'), 'lunch', training ? 1.15 : 0.9, food('demo-food-rice').fiber, 3),
    entryFrom(date, food('demo-food-salmon'), 'dinner', training ? 1.15 : 0.85, 0, 4),
    entryFrom(date, food('demo-food-potato'), 'dinner', 1, food('demo-food-potato').fiber, 5),
    entryFrom(date, food('demo-food-coffee'), 'other', 1, 0, 6),
  ]
  if (training) {
    entries.push(entryFrom(date, food('demo-food-shake'), 'snack', 1.15, 1, 7))
  } else {
    entries.push(entryFrom(date, food('demo-food-yogurt'), 'snack', 1, 0, 7))
  }
  if (date !== DEMO_AS_OF && hashDate(date) % 5 === 0) {
    entries.push(entryFrom(date, food('demo-food-greens'), 'dinner', 1, null, 8))
  }
  return entries
}

function sleepNight(date: string): SleepNightlySummary | null {
  if (MISSING_SLEEP.has(date) || date < '2026-01-07') {
    return null
  }
  const partial = PARTIAL_SLEEP.has(date)
  const lowStage = date === LOW_STAGE_SLEEP
  const minutes = partial ? (date === '2026-03-11' ? 150 : 95) : 400 + (hashDate(date) % 70)
  const stageCoveragePct = partial ? null : lowStage ? 55 : 96
  const analysisEligible = minutes >= 240
  const stageAnalysisEligible = analysisEligible && stageCoveragePct != null && stageCoveragePct >= 90
  const core = stageAnalysisEligible ? Math.round(minutes * 0.52) : lowStage ? 140 : null
  const deep = stageAnalysisEligible ? Math.round(minutes * 0.16) : lowStage ? 50 : null
  const rem = stageAnalysisEligible ? Math.round(minutes * 0.22) : lowStage ? 46 : null
  const unspecified = stageAnalysisEligible ? Math.max(0, minutes - (core ?? 0) - (deep ?? 0) - (rem ?? 0)) : null
  const previous = addCalendarDays(date, -1)
  const startAt = atPhoenix(previous, 22, 10 + (hashDate(date) % 20))
  const endAt = new Date(Date.parse(startAt) + minutes * 60_000).toISOString()
  const status = partial || !analysisEligible ? 'partial_observation' : 'analysis_eligible'
  return {
    sleepDate: date,
    timezone: SLEEP_TIMEZONE,
    logicalSourceKey: 'demo-wrist',
    sourceName: SOURCE,
    startAt,
    endAt,
    totalSleepMinutes: minutes,
    timeInBedMinutes: minutes + (partial ? 20 : 35),
    awakeMinutes: partial ? 12 : 18,
    coreMinutes: core,
    deepMinutes: deep,
    remMinutes: rem,
    unspecifiedSleepMinutes: unspecified,
    stageCoveragePct,
    stageConflictMinutes: 0,
    observationStatus: status,
    analysisEligible,
    stageAnalysisEligible,
    selectionReason: partial ? 'partial_only' : 'source_priority',
    calculationVersion: SLEEP_NIGHT_CALCULATION_VERSION,
    evidence: {
      selectedLogicalSource: 'demo-wrist',
      selectedSourceName: SOURCE,
      selectedDurationMinutes: minutes,
      selectedStatus: status,
      alternatives: [],
      sourcePriority: ['demo-wrist'],
      completenessOverride: false,
      intervalCount: 1,
      stageCoveragePct,
      additionalEpisodeCount: 0,
      calculationVersion: SLEEP_NIGHT_CALCULATION_VERSION,
    },
  }
}

function workingSet(input: {
  setId: string
  sessionId: string
  sessionExerciseId: string
  exerciseId: string
  sessionDate: string
  position: number
  setNumber: number
  setType: string
  weightKg: number
  reps: number | null
  durationSec: number | null
  leftReps: number | null
  rightReps: number | null
}): CanonicalSetRecord {
  return {
    setId: input.setId,
    sessionId: input.sessionId,
    sessionExerciseId: input.sessionExerciseId,
    exerciseId: input.exerciseId,
    sessionDate: input.sessionDate,
    sessionCreatedAt: atPhoenix(input.sessionDate, 9, 0),
    sessionExercisePosition: input.position,
    setNumber: input.setNumber,
    setType: input.setType,
    loadState: 'external',
    weightKg: input.weightKg,
    reps: input.reps,
    durationSec: input.durationSec,
    leftReps: input.leftReps,
    rightReps: input.rightReps,
    leftDurationSec: null,
    rightDurationSec: null,
  }
}

export function buildDemoDataset(): DemoDataset {
  const dates = eachDate(DEMO_RANGE_START, DEMO_AS_OF)
  const trainingDates = dates.filter((date) => {
    const day = weekday(date)
    return day === 2 || day === 4 || day === 6
  })
  const trainingSet = new Set(trainingDates)
  const appearances = new Map<string, number>()
  const sets: CanonicalSetRecord[] = []
  const workouts: ProgressWorkoutSummary[] = []

  trainingDates.forEach((date, sessionIndex) => {
    const routine = ROUTINES[sessionIndex % ROUTINES.length]!
    const sessionId = `demo-session-${String(sessionIndex + 1).padStart(3, '0')}`
    workouts.push({
      sessionId,
      sessionDate: date,
      createdAt: atPhoenix(date, 9, 0),
      templateName: routine.name,
      routineCode: routine.code,
      effort: null,
      durationMin: 46 + (hashDate(date) % 12),
    })
    routine.exerciseIds.forEach((exerciseId, position) => {
      const appearance = appearances.get(exerciseId) ?? 0
      appearances.set(exerciseId, appearance + 1)
      const sessionExerciseId = `${sessionId}:${exerciseId}`
      const load = loadFor(exerciseId, appearance)
      sets.push(
        workingSet({
          setId: `${sessionId}-${exerciseId}-warmup`,
          sessionId,
          sessionExerciseId,
          exerciseId,
          sessionDate: date,
          position,
          setNumber: 0,
          setType: 'warmup',
          weightKg: Math.max(8, roundTo(load * 0.6, 1)),
          reps: exerciseId === 'demo-ex-carry' ? null : 5,
          durationSec: exerciseId === 'demo-ex-carry' ? 20 : null,
          leftReps: null,
          rightReps: null,
        }),
      )
      for (let setNumber = 1; setNumber <= 3; setNumber += 1) {
        if (exerciseId === 'demo-ex-carry') {
          sets.push(
            workingSet({
              setId: `${sessionId}-${exerciseId}-${setNumber}`,
              sessionId,
              sessionExerciseId,
              exerciseId,
              sessionDate: date,
              position,
              setNumber,
              setType: 'working',
              weightKg: load,
              reps: null,
              durationSec: 35 + appearance,
              leftReps: null,
              rightReps: null,
            }),
          )
          continue
        }
        if (exerciseId === 'demo-ex-lunge') {
          const left = 6 + Math.floor(appearance / 5)
          const right = left + (appearance < 8 ? 2 : 0)
          sets.push(
            workingSet({
              setId: `${sessionId}-${exerciseId}-${setNumber}`,
              sessionId,
              sessionExerciseId,
              exerciseId,
              sessionDate: date,
              position,
              setNumber,
              setType: 'working',
              weightKg: load,
              reps: null,
              durationSec: null,
              leftReps: left,
              rightReps: right,
            }),
          )
          continue
        }
        const reps = exerciseId === 'demo-ex-squat' ? 5 : exerciseId === 'demo-ex-press' ? 6 : 8
        sets.push(
          workingSet({
            setId: `${sessionId}-${exerciseId}-${setNumber}`,
            sessionId,
            sessionExerciseId,
            exerciseId,
            sessionDate: date,
            position,
            setNumber,
            setType: 'working',
            weightKg: load,
            reps,
            durationSec: null,
            leftReps: null,
            rightReps: null,
          }),
        )
      }
      if (exerciseId === 'demo-ex-bench' && appearance === 2) {
        sets.push(
          workingSet({
            setId: 'demo-set-bench-16',
            sessionId,
            sessionExerciseId,
            exerciseId,
            sessionDate: date,
            position,
            setNumber: 4,
            setType: 'working',
            weightKg: 40,
            reps: 16,
            durationSec: null,
            leftReps: null,
            rightReps: null,
          }),
        )
      }
      if (exerciseId === 'demo-ex-bench' && appearance === 6) {
        sets.push(
          workingSet({
            setId: 'demo-set-bench-14',
            sessionId,
            sessionExerciseId,
            exerciseId,
            sessionDate: date,
            position,
            setNumber: 4,
            setType: 'working',
            weightKg: 42.5,
            reps: 14,
            durationSec: null,
            leftReps: null,
            rightReps: null,
          }),
        )
      }
    })
  })

  const body: BodyObservation[] = []
  let weightIndex = 0
  for (const date of dates) {
    if (weekday(date) !== 2 || date < '2026-01-13' || date > '2026-09-08') {
      continue
    }
    const weeks = Math.round((parseCalendarDateUtc(date).getTime() - parseCalendarDateUtc('2026-01-13').getTime()) / 86_400_000 / 7)
    if (weeks % 2 !== 0) {
      continue
    }
    const wobble = ((hashDate(date) % 5) - 2) * 0.15
    body.push({
      measurementId: `demo-weight-${date}`,
      measurementSessionId: `demo-measure-${date}`,
      key: 'weight',
      value: Math.round((86.2 - weightIndex * 0.28 + wobble) * 10) / 10,
      unit: 'kg',
      valueKind: 'measured',
      measuredAt: atPhoenix(date, 7, 30),
      timezone: 'America/Phoenix',
      calendarDate: date,
    })
    weightIndex += 1
  }
  const compositionDates = body.filter((_, index) => index % 4 === 0).slice(0, 4)
  compositionDates.forEach((sample, index) => {
    body.push({
      measurementId: `demo-fat-${sample.calendarDate}`,
      measurementSessionId: sample.measurementSessionId,
      key: 'body_fat_percentage',
      value: Math.round((24.6 - index * 0.7) * 10) / 10,
      unit: '%',
      valueKind: 'measured',
      measuredAt: sample.measuredAt,
      timezone: 'America/Phoenix',
      calendarDate: sample.calendarDate,
    })
  })

  const entries: NutritionEntry[] = []
  for (const date of dates) {
    if (weekday(date) === 0 || UNLOGGED_NUTRITION.has(date)) {
      continue
    }
    entries.push(...nutritionEntriesFor(date, trainingSet.has(date)))
  }

  const targets: NutritionTarget[] = [
    {
      id: 'demo-target-start',
      effectiveFrom: '2026-01-01',
      caloriesTarget: 2400,
      proteinTarget: 150,
      carbsTarget: 250,
      fatTarget: 75,
      fiberTarget: 30,
      createdAt: '2026-01-01T15:00:00.000Z',
      updatedAt: '2026-01-01T15:00:00.000Z',
    },
    {
      id: 'demo-target-reset',
      effectiveFrom: '2026-06-01',
      caloriesTarget: 2300,
      proteinTarget: 160,
      carbsTarget: 230,
      fatTarget: 70,
      fiberTarget: 32,
      createdAt: '2026-06-01T15:00:00.000Z',
      updatedAt: '2026-06-01T15:00:00.000Z',
    },
  ]

  const activity: ActivityDailyRow[] = []
  for (const date of dates) {
    if (MISSING_ACTIVITY.has(date)) {
      continue
    }
    const hash = hashDate(date)
    const provisional = date === DEMO_AS_OF
    activity.push({
      date,
      timezone: ACTIVITY_TIMEZONE,
      stepsCount: date === MISSING_STEPS ? null : provisional ? 3840 : 5400 + (hash % 4800),
      activeEnergyKcal: provisional ? 186 : 280 + (hash % 220),
      exerciseMinutes: date === EXPLICIT_ZERO_EXERCISE ? 0 : provisional || hash % 17 === 0 ? null : 18 + (hash % 40),
      walkingRunningDistanceM: null,
      restingHeartRateBpm: provisional || hash % 11 === 0 ? null : 54 + (hash % 12),
    })
  }

  const activityWorkouts: ProgressActivityWorkout[] = []
  let walkNumber = 0
  for (const date of dates) {
    if (weekday(date) !== 6 || MISSING_ACTIVITY.has(date) || hashDate(date) % 4 !== 0) {
      continue
    }
    walkNumber += 1
    const minutes = 28 + (hashDate(date) % 18)
    const startAt = atPhoenix(date, 7, 15)
    activityWorkouts.push({
      id: `demo-walk-${String(walkNumber).padStart(2, '0')}`,
      activityType: 'HKWorkoutActivityTypeWalking',
      startAt,
      endAt: new Date(Date.parse(startAt) + minutes * 60_000).toISOString(),
      durationMinutes: minutes,
      energyKcal: 140 + (hashDate(date) % 80),
    })
  }

  const sleep = dates.map((date) => sleepNight(date)).filter((night): night is SleepNightlySummary => night != null)

  const checkpoints: ProgressCheckpoint[] = [
    {
      id: 'demo-cp-program',
      checkpointDate: '2026-01-06',
      label: 'Started current program',
      notes: null,
      createdAt: '2026-01-06T16:00:00.000Z',
      updatedAt: '2026-01-06T16:00:00.000Z',
    },
    {
      id: 'demo-cp-nutrition',
      checkpointDate: '2026-06-01',
      label: 'Nutrition reset',
      notes: null,
      createdAt: '2026-06-01T16:00:00.000Z',
      updatedAt: '2026-06-01T16:00:00.000Z',
    },
  ]

  return {
    version: DEMO_DATA_VERSION,
    asOf: DEMO_AS_OF,
    exercises: EXERCISES,
    sets,
    workouts,
    body,
    foods: FOODS,
    entries,
    targets,
    activity,
    activityWorkouts,
    sleep,
    checkpoints,
  }
}

let cached: DemoDataset | null = null

export function demoDataset(): DemoDataset {
  if (!cached) {
    cached = buildDemoDataset()
  }
  return cached
}
