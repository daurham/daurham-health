import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SPEARMAN_MIN_PAIRS, GROUP_MIN_DAYS } from '../src/domain/intelligence/config.ts'
import { estimatedStrengthForSet } from '../src/domain/progress/exercise-performance.ts'
import { performanceBestsForExercise } from '../src/domain/progress/prs.ts'
import { DEMO_AS_OF, DEMO_DATA_VERSION, DEMO_ROUTES } from '../src/demo/constants.ts'
import { buildDemoDataset } from '../src/demo/dataset.ts'
import {
  demoActivity,
  demoCompare,
  demoNutritionEntries,
  demoOverview,
  demoPatterns,
  demoSinceCheckpoint,
  demoSleep,
  demoTimeline,
  demoToday,
  demoWorkout,
} from '../src/demo/repository.ts'

function filesUnder(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      found.push(...filesUnder(path))
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      found.push(path)
    }
  }
  return found
}

describe('public demo dataset', () => {
  it('rebuilds the same fixture from the fixed clock and version', () => {
    const left = buildDemoDataset()
    const right = buildDemoDataset()
    expect(left.version).toBe(DEMO_DATA_VERSION)
    expect(left.asOf).toBe(DEMO_AS_OF)
    expect(left.asOf).toBe('2026-09-15')
    expect(JSON.stringify(left)).toBe(JSON.stringify(right))
    expect(left.workouts.length).toBeGreaterThan(40)
    expect(left.body.filter((item) => item.key === 'weight').length).toBeGreaterThanOrEqual(5)
    expect(left.body.filter((item) => item.key === 'weight').length).toBeLessThan(40)
  })

  it('keeps unlogged nutrition empty and logs other days with real targets', () => {
    expect(demoNutritionEntries('2026-01-11')).toEqual([])
    expect(demoNutritionEntries('2026-08-12')).toEqual([])
    const logged = demoNutritionEntries(DEMO_AS_OF) ?? []
    expect(logged.length).toBeGreaterThan(0)
    expect(logged.some((entry) => entry.calories > 0)).toBe(true)
    const data = buildDemoDataset()
    expect(data.entries.some((entry) => entry.fiber == null)).toBe(true)
    expect(data.entries.some((entry) => entry.fiber === 0)).toBe(true)
    expect(demoNutritionEntries('2025-01-01')).toBeNull()
  })

  it('uses training rules for baseline, e1RM bands, unilateral work, and carries', () => {
    const data = buildDemoDataset()
    const squat = data.exercises.find((item) => item.id === 'demo-ex-squat')!
    const bench = data.exercises.find((item) => item.id === 'demo-ex-bench')!
    const lunge = data.exercises.find((item) => item.id === 'demo-ex-lunge')!
    const carry = data.exercises.find((item) => item.id === 'demo-ex-carry')!
    const squatSets = data.sets.filter((set) => set.exerciseId === squat.id && set.setType === 'working')
    const firstDate = [...squatSets].sort((left, right) => left.sessionDate.localeCompare(right.sessionDate))[0]!.sessionDate
    const bests = performanceBestsForExercise(squatSets, squat)
    expect(bests.length).toBeGreaterThan(0)
    expect(bests.some((event) => event.date === firstDate)).toBe(false)

    const highReps = data.sets.find((set) => set.setId === 'demo-set-bench-16')!
    const contextual = data.sets.find((set) => set.setId === 'demo-set-bench-14')!
    const standard = data.sets.find((set) => set.exerciseId === bench.id && set.setType === 'working' && set.reps === 8)!
    expect(estimatedStrengthForSet(highReps, bench)).toBeNull()
    expect(estimatedStrengthForSet(contextual, bench)?.confidence).toBe('low')
    expect(estimatedStrengthForSet(standard, bench)?.confidence).toBe('high')

    const lungeSet = data.sets.find((set) => set.exerciseId === lunge.id && set.setType === 'working')!
    const lungeStrength = estimatedStrengthForSet(lungeSet, lunge)
    expect(lungeStrength?.sourceSet.reps).toBe(Math.min(lungeSet.leftReps ?? 0, lungeSet.rightReps ?? 0))
    expect((lungeSet.leftReps ?? 0) + (lungeSet.rightReps ?? 0)).toBeGreaterThan(lungeStrength?.sourceSet.reps ?? 0)

    const carrySet = data.sets.find((set) => set.exerciseId === carry.id && set.setType === 'working')!
    expect(estimatedStrengthForSet(carrySet, carry)).toBeNull()
    const carryOverview = demoOverview('all').exercises.find((item) => item.exerciseId === carry.id)
    expect(carryOverview?.estimatedStrengthHistory).toEqual([])
  })

  it('marks the demo day provisional and keeps activity missingness distinct from zero', () => {
    const data = buildDemoDataset()
    const today = data.activity.find((row) => row.date === DEMO_AS_OF)
    expect(today?.stepsCount).toBe(3840)
    expect(today?.exerciseMinutes).toBeNull()
    expect(data.activity.find((row) => row.date === '2026-04-02')?.exerciseMinutes).toBe(0)
    expect(data.activity.find((row) => row.date === '2026-03-03')?.stepsCount).toBeNull()
    expect(data.activity.some((row) => row.date === '2026-02-17')).toBe(false)
    expect(data.activity.every((row) => row.walkingRunningDistanceM == null)).toBe(true)
    const view = demoActivity('30d')
    expect(view.provisionalDay?.date).toBe(DEMO_AS_OF)
    expect(view.steps.series.find((point) => point.date === DEMO_AS_OF)?.provisional).toBe(true)
    expect(view.completedCalendarDays).toBeLessThan(view.calendarDays)
    expect(view.walkingRunningDistance.summary.status).toBe('unsupported')
  })

  it('keeps sleep complete, partial, stage, and missing nights distinct', () => {
    const nights = buildDemoDataset().sleep
    const partial = nights.find((night) => night.sleepDate === '2026-03-11')
    expect(partial?.totalSleepMinutes).toBeLessThan(240)
    expect(partial?.analysisEligible).toBe(false)
    expect(partial?.observationStatus).toBe('partial_observation')
    const quiet = nights.find((night) => night.sleepDate === '2026-07-08')
    expect(quiet?.analysisEligible).toBe(false)
    const lowStage = nights.find((night) => night.sleepDate === '2026-04-16')
    expect(lowStage?.analysisEligible).toBe(true)
    expect(lowStage?.stageAnalysisEligible).toBe(false)
    expect((lowStage?.stageCoveragePct ?? 0) < 90).toBe(true)
    const complete = nights.find((night) => night.sleepDate === DEMO_AS_OF)
    expect(complete?.analysisEligible).toBe(true)
    expect((complete?.totalSleepMinutes ?? 0) >= 240).toBe(true)
    expect(complete?.stageAnalysisEligible).toBe(true)
    expect(nights.some((night) => night.sleepDate === '2026-02-19')).toBe(false)
    const sleep = demoSleep('90d')
    expect(sleep.series.some((point) => point.partialMinutes != null)).toBe(true)
    expect(sleep.series.some((point) => point.eligibleMinutes != null)).toBe(true)
  })

  it('runs progress, compare, checkpoints, and timeline through the real builders', () => {
    const overview = demoOverview('90d')
    expect(overview.body.weight.trend.status).toBe('available')
    expect(overview.training.workouts.status).toBe('available')
    expect(overview.findings.length).toBeGreaterThan(0)
    const compared = demoCompare('2026-06-01', '2026-06-30', '2026-08-01', '2026-08-31')
    expect(compared.mode).toBe('range')
    expect(compared.nutrition.a.loggedDays).toBeGreaterThan(0)
    expect(compared.nutrition.b.loggedDays).toBeGreaterThan(0)
    expect(compared.health.sleep.b.analysisEligibleNights).toBeGreaterThan(0)
    expect(compared.health.activity.b.steps.status).toBe('available')
    const since = demoSinceCheckpoint('demo-cp-nutrition')
    expect(since?.mode).toBe('since_checkpoint')
    expect(since?.checkpoint?.label).toBe('Nutrition reset')
    expect(demoSinceCheckpoint('missing')).toBeNull()
    expect(demoWorkout('missing-session')).toBeNull()
    const kinds = new Set(demoTimeline('1y').events.map((event) => event.kind))
    for (const kind of [
      'training_session',
      'performance_best',
      'body_measurement',
      'nutrition_day',
      'activity_day',
      'sleep_night',
      'activity_workout',
      'checkpoint',
    ]) {
      expect(kinds.has(kind as never)).toBe(true)
    }
  })

  it('lets the real cross-domain engine surface findings without lowering gates', () => {
    expect(SPEARMAN_MIN_PAIRS).toBe(20)
    expect(GROUP_MIN_DAYS).toBe(5)
    const state = demoPatterns()
    const training = state.findings.find((finding) => finding.id === 'nutrition_training:logged_day_groups')
    expect(training?.surfaced).toBe(true)
    expect(training?.gateSampleSize).toBeGreaterThanOrEqual(GROUP_MIN_DAYS)
    for (const finding of state.findings) {
      expect(finding.surfaced).toBe(true)
      expect(finding.gateSampleSize).toBeGreaterThanOrEqual(finding.requiredSampleSize)
    }
    const today = demoToday()
    expect(today.date).toBe(DEMO_AS_OF)
    expect(today.activity.inProgress).toBe(true)
    expect(today.nutrition.logged).toBe(true)
    expect(today.training.logged).toBe(true)
    expect(today.sleep.kind).toBe('complete')
    expect(today.patterns.length).toBeGreaterThan(0)
    expect(today.patterns.length).toBeLessThanOrEqual(3)
  })

  it('keeps demo navigation and source files on the public side of the boundary', () => {
    const routes = readFileSync(join(process.cwd(), 'src/routes/index.tsx'), 'utf8')
    expect(routes).toContain("path: 'demo'")
    for (const route of ['nutrition', 'training', 'body', 'progress', 'activity', 'sleep', 'strength', 'timeline', 'compare']) {
      expect(routes).toContain(`path: '${route}'`)
    }
    expect(DEMO_ROUTES.every((route) => route.startsWith('/demo'))).toBe(true)
    const layout = readFileSync(join(process.cwd(), 'src/components/Layout.tsx'), 'utf8')
    expect(layout).toContain("to: '/demo/nutrition'")
    expect(layout).toContain("to: '/demo/progress'")
    expect(layout).toContain('Explore demo')
    const demoSource = filesUnder(join(process.cwd(), 'src/demo'))
      .concat(filesUnder(join(process.cwd(), 'src/features/demo')))
      .map((path) => readFileSync(path, 'utf8'))
      .join('\n')
    expect(demoSource).not.toMatch(/getSql|from 'neon'|DATABASE_URL|healthFetch|\/api\/today|gemini|home-ai|homeAi|BarcodeScanner/i)
    expect(demoSource).not.toMatch(/to=["'`]\/(?!demo)/)
    expect(demoSource).not.toMatch(/Apple Watch|Test User|lorem ipsum|86\.636/i)
  })
})
