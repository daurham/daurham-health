import { resolveScheduleRange } from '../supplements/resolve.js'
import type { OccurrenceState } from '../supplements/types.js'
import { ASK_HEALTH_PACKET_VERSION, ASK_PACKET_MAX_CHARS, type AskLens } from './config.js'
import type {
  AskContextInput,
  AskEvidence,
  AskGoalInput,
  AskHealthAnswer,
  AskHealthPacket,
  AskHealthPacketInput,
  AskLimitation,
  AskPatternInput,
} from './types.js'

type PushItem = Omit<AskEvidence, 'period'> & { period?: AskEvidence['period']; priority: number }
type Draft = AskEvidence & { priority: number }

const BODY_TERMS: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /\bbody[\s-]?fat\b|\bbodyfat\b|\bfat\s*%|\bbf\s*%/i, key: 'body_fat_percentage' },
  { pattern: /\bwaist\b/i, key: 'waist' },
  { pattern: /\bweight\b|\bweigh\b/i, key: 'weight' },
]

export function buildAskHealthEvidencePacket(input: AskHealthPacketInput): AskHealthPacket {
  const period = { start: input.period.start, end: input.period.end }
  const drafts: Draft[] = []
  const limitations: AskLimitation[] = []
  const push = (item: Omit<AskEvidence, 'period'> & { period?: AskEvidence['period']; priority: number }) => {
    drafts.push({
      ...item,
      period: item.period === undefined ? period : item.period,
    })
  }

  push({
    id: 'ask.range',
    domain: 'ask',
    label: 'Selected range',
    value: input.range,
    unit: null,
    text: `This evidence packet covers ${input.range} from ${period.start} through ${period.end}. It does not include a wider range.`,
    coverage: null,
    detailPath: '/progress',
    userEntered: false,
    substantive: false,
    priority: 0,
  })

  const lens = input.lens
  const wants = lensWants(lens)
  if (wants.body) {
    addBody(input, push, limitations, wants.bodyDetail)
  }
  if (wants.nutrition) {
    addNutrition(input, push, limitations)
  }
  if (wants.activity) {
    addActivity(input, push)
  }
  if (wants.sleep) {
    addSleep(input, push, limitations)
  }
  if (wants.training) {
    addTraining(input, push, wants.exerciseDetail)
  }
  if (wants.supplements) {
    addSupplements(input, push)
  }
  if (wants.goals) {
    addGoals(input, push)
  }
  if (wants.lab) {
    addLab(input, push)
  }
  if (wants.context) {
    addContext(input.context, push)
  }
  if (wants.patterns) {
    addPatterns(input.patterns, push)
  }
  if (input.intelligence) {
    addSharedIntelligence(input.intelligence, push, limitations)
  }

  const evidence = trimEvidence(drafts, input.maxChars ?? ASK_PACKET_MAX_CHARS)
  const clarification = exerciseClarification(input)
  return {
    packetVersion: ASK_HEALTH_PACKET_VERSION,
    lens: input.lens,
    range: input.range,
    rangeStart: period.start,
    rangeEnd: period.end,
    asOf: input.asOf,
    generatedAt: input.generatedAt,
    evidence,
    limitations: limitations.filter((item) => evidence.some((fact) => fact.id === item.evidenceId)),
    contextSummary: {
      knows: input.intelligence?.knows ?? [],
      missing: input.intelligence?.missing ?? [],
    },
    clarification,
  }
}

export function packetHasSubstantiveEvidence(packet: AskHealthPacket): boolean {
  return packet.evidence.some((item) => item.substantive)
}

export function insufficientAskHealthAnswer(packet: AskHealthPacket): AskHealthAnswer {
  const coverage = packet.evidence.filter((item) => item.id.startsWith('coverage.') || item.id === 'ask.range')
  const refs = coverage.slice(0, 2).map((item) => item.id)
  return {
    blocks: [
      {
        text: 'Not enough Health evidence is available for this question yet.',
        evidenceRefs: refs.length > 0 ? refs : ['ask.range'],
      },
    ],
    limitations: packet.limitations.map((item) => ({ text: item.text, evidenceRefs: [item.evidenceId] })),
    followUps: [],
  }
}

export function packetFingerprintMaterial(packet: AskHealthPacket): string {
  return JSON.stringify({
    packetVersion: packet.packetVersion,
    lens: packet.lens,
    range: packet.range,
    rangeStart: packet.rangeStart,
    rangeEnd: packet.rangeEnd,
    asOf: packet.asOf,
    evidence: packet.evidence.map((item) => ({
      id: item.id,
      value: item.value,
      unit: item.unit,
      text: item.text,
      coverage: item.coverage,
      confidence: item.confidence ?? null,
      provenance: item.provenance ?? null,
      evidenceDates: item.evidenceDates ?? null,
    })),
    limitations: packet.limitations,
    contextSummary: packet.contextSummary,
  })
}

function lensWants(lens: AskLens) {
  const general = lens === 'general'
  return {
    body: general || lens === 'nutrition' || lens === 'training',
    bodyDetail: general || lens === 'nutrition',
    nutrition: general || lens === 'nutrition' || lens === 'training',
    activity: general || lens === 'recovery' || lens === 'training',
    sleep: general || lens === 'recovery' || lens === 'training',
    training: general || lens === 'training' || lens === 'recovery',
    exerciseDetail: lens === 'training' || general,
    supplements: general || lens === 'nutrition',
    goals: general || lens === 'training' || lens === 'nutrition' || lens === 'recovery',
    lab: lens === 'experiments' || lens === 'training' || general,
    context: general || lens === 'recovery' || lens === 'experiments',
    patterns: general || lens === 'recovery',
  }
}

function addBody(
  input: AskHealthPacketInput,
  push: (item: PushItem) => void,
  limitations: AskLimitation[],
  detail: boolean,
) {
  const body = input.overview?.body
  if (!body) {
    return
  }
  const matched = matchedBodyKeys(input.question)
  const keys = new Set(matched)
  if (detail && keys.size === 0) {
    keys.add('weight')
  }
  const trend = body.weight.trend
  if (keys.has('weight')) {
    const observations = body.weight.observations.filter((item) => item.key === 'weight' && item.calendarDate <= input.asOf)
    const latest = body.weight.latest && body.weight.latest.calendarDate <= input.asOf ? body.weight.latest : null
    if (latest) {
      push({
        id: 'body.weight.latest',
        domain: 'body',
        label: 'Latest weight',
        value: latest.value,
        unit: latest.unit,
        text: `Latest weight on ${latest.calendarDate}.`,
        coverage: { observations: observations.length },
        detailPath: '/progress/body',
        userEntered: false,
        substantive: true,
        priority: 2,
      })
    }
    if (trend.status === 'available') {
      push({
        id: 'body.weight.trend',
        domain: 'body',
        label: 'Weight trend',
        value: trend.value.slopePerWeek,
        unit: `${latest?.unit ?? 'kg'}/week`,
        text: 'Theil–Sen weight slope already calculated by Health.',
        coverage: { observations: trend.value.measurementCount, spanDays: trend.value.spanDays },
        detailPath: '/progress/body',
        userEntered: false,
        substantive: true,
        priority: 2,
      })
    } else {
      push({
        id: 'body.weight.trend',
        domain: 'body',
        label: 'Weight trend',
        value: null,
        unit: null,
        text: 'Weight trend is insufficient_data.',
        coverage: { observations: trend.observations ?? 0 },
        detailPath: '/progress/body',
        userEntered: false,
        substantive: observations.length > 0,
        priority: 2,
      })
      limitations.push({
        code: 'body_insufficient_trend_samples',
        text: `Weight trend needs more comparable measurements. Health counted ${trend.observations}.`,
        evidenceId: 'body.weight.trend',
      })
    }
  }
  if (!detail) {
    return
  }
  for (const metric of body.metrics) {
    if (metric.key === 'weight' || (!keys.has(metric.key) && !matchedMetric(metric.key, keys))) {
      continue
    }
    if (!metric.latest || metric.latest.calendarDate > input.asOf) {
      continue
    }
    const label = bodyMetricLabel(metric.key)
    push({
      id: `body.${metric.key}.latest`,
      domain: 'body',
      label,
      value: metric.latest.value,
      unit: metric.latest.unit,
      text: `Latest ${label.toLowerCase()} on ${metric.latest.calendarDate}.`,
      coverage: null,
      detailPath: '/progress/body',
      userEntered: false,
      substantive: true,
      priority: 1,
    })
    const comparison = metric.comparison
    if (comparison.status === 'available') {
      const start = comparison.value.periodStartNearest
      const end = comparison.value.periodEndNearest
      const periodChange = start && end && start.calendarDate !== end.calendarDate ? end.value - start.value : comparison.value.change
      push({
        id: `body.${metric.key}.change`,
        domain: 'body',
        label: `${label} change`,
        value: periodChange,
        unit: comparison.value.unit,
        text:
          start && end && start.calendarDate !== end.calendarDate
            ? `Change from the measurement nearest the selected range start on ${start.calendarDate} to the measurement nearest the range end on ${end.calendarDate}. Positive means the later measurement is higher.`
            : `Change from the previous comparable measurement on ${comparison.value.previous?.calendarDate ?? 'unknown'} to the latest measurement on ${comparison.value.current?.calendarDate ?? metric.latest.calendarDate}. Positive means the latest measurement is higher.`,
        coverage: {
          observations: comparison.observations,
          startDate: start?.calendarDate ?? comparison.value.previous?.calendarDate ?? null,
          startValue: start?.value ?? comparison.value.previous?.value ?? null,
          endDate: end?.calendarDate ?? comparison.value.current?.calendarDate ?? null,
          endValue: end?.value ?? comparison.value.current?.value ?? null,
          valueKind: metric.latest.valueKind,
        },
        detailPath: '/progress/body',
        userEntered: false,
        substantive: true,
        priority: 1,
      })
    } else if (comparison.status === 'insufficient_data') {
      push({
        id: `body.${metric.key}.change`,
        domain: 'body',
        label: `${label} change`,
        value: null,
        unit: metric.latest.unit,
        text: `Health does not have enough comparable ${label.toLowerCase()} measurements to confirm a change.`,
        coverage: {
          observations: comparison.observations,
          required: comparison.required ?? 2,
        },
        detailPath: '/progress/body',
        userEntered: false,
        substantive: comparison.observations > 0,
        priority: 1,
      })
      limitations.push({
        code: `body_${metric.key}_insufficient_comparison`,
        text: `${label} needs at least ${comparison.required ?? 2} comparable measurements to confirm whether it changed.`,
        evidenceId: `body.${metric.key}.change`,
      })
    }
  }
}

function matchedBodyKeys(question: string): string[] {
  return BODY_TERMS.filter((item) => item.pattern.test(question)).map((item) => item.key)
}

function matchedMetric(key: string, keys: ReadonlySet<string>): boolean {
  if (keys.has(key)) {
    return true
  }
  return key.includes('waist') && keys.has('waist')
}

function bodyMetricLabel(key: string): string {
  if (key === 'body_fat_percentage') {
    return 'Body fat percentage'
  }
  return key
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function addNutrition(input: AskHealthPacketInput, push: (item: PushItem) => void, limitations: AskLimitation[]) {
  const nutrition = input.overview?.nutrition
  if (!nutrition) {
    return
  }
  push({
    id: 'nutrition.coverage',
    domain: 'nutrition',
    label: 'Nutrition coverage',
    value: nutrition.coveragePct,
    unit: 'percent',
    text: `Nutrition was logged on ${nutrition.loggedDays} of ${nutrition.calendarDays} days. Averages are logged days only.`,
    coverage: {
      loggedDays: nutrition.loggedDays,
      calendarDays: nutrition.calendarDays,
      coveragePct: nutrition.coveragePct,
    },
    detailPath: '/nutrition',
    userEntered: false,
    substantive: nutrition.loggedDays > 0,
    priority: 2,
  })
  if (nutrition.status === 'insufficient_data') {
    limitations.push({
      code: 'nutrition_low_coverage',
      text: 'No nutrition days were logged in this range.',
      evidenceId: 'nutrition.coverage',
    })
  }
  addNutrient(push, 'nutrition.calories', 'Average calories on logged days', nutrition.calories.averageOnLoggedDays, 'kcal', nutrition.calories.observedDays)
  const calorieTarget = nutrition.calories.targetContext
  if (calorieTarget) {
    const difference = calorieTarget.averageDifference
    const roundedDifference = Math.round(Math.abs(difference))
    const relation = difference < 0 ? `${roundedDifference} kcal/day below` : difference > 0 ? `${roundedDifference} kcal/day above` : 'at'
    push({
      id: 'nutrition.calories_vs_target',
      domain: 'nutrition',
      label: 'Calories vs configured target',
      value: difference,
      unit: 'kcal/day',
      text: `Across ${calorieTarget.daysWithTarget} logged days with a configured calorie target, logged intake averaged ${relation} that target. This compares intake with the configured target; it does not measure total energy expenditure or prove a physiological energy deficit.`,
      coverage: {
        daysWithTarget: calorieTarget.daysWithTarget,
        averageDifference: difference,
      },
      detailPath: '/nutrition',
      userEntered: false,
      substantive: true,
      priority: 1,
    })
  }
  addNutrient(push, 'nutrition.protein', 'Average protein on logged days', nutrition.protein.averageOnObservedDays, 'g', nutrition.protein.observedDays)
  addNutrient(push, 'nutrition.carbs', 'Average carbs on logged days', nutrition.carbs.averageOnObservedDays, 'g', nutrition.carbs.observedDays)
  addNutrient(push, 'nutrition.fat', 'Average fat on logged days', nutrition.fat.averageOnObservedDays, 'g', nutrition.fat.observedDays)
}

function addNutrient(
  push: (item: PushItem) => void,
  id: string,
  label: string,
  value: number | null,
  unit: string,
  observedDays: number,
) {
  if (value == null) {
    return
  }
  push({
    id,
    domain: 'nutrition',
    label,
    value,
    unit,
    text: 'Average on logged days. Unlogged days are not treated as zero.',
    coverage: { observedDays },
    detailPath: '/nutrition',
    userEntered: false,
    substantive: true,
    priority: 2,
  })
}

function addActivity(input: AskHealthPacketInput, push: (item: PushItem) => void) {
  const activity = input.activity
  if (!activity) {
    return
  }
  const steps = activity.steps.summary
  push({
    id: 'activity.steps',
    domain: 'activity',
    label: 'Completed-day step average',
    value: steps.status === 'available' ? steps.value : null,
    unit: 'steps',
    text: 'Completed-day average. The current provisional day is separate.',
    coverage: {
      observedDays: steps.observedDays,
      completedCalendarDays: steps.completedCalendarDays,
      calendarDays: steps.calendarDays,
    },
    detailPath: '/progress/activity',
    userEntered: false,
    substantive: steps.observedDays > 0,
    priority: 2,
  })
  const energy = activity.activeEnergy.summary
  if (energy.status === 'available') {
    push({
      id: 'activity.active_energy',
      domain: 'activity',
      label: 'Completed-day active energy average',
      value: energy.value,
      unit: 'kcal',
      text: 'Completed-day average.',
      coverage: { observedDays: energy.observedDays },
      detailPath: '/progress/activity',
      userEntered: false,
      substantive: true,
      priority: 3,
    })
  }
  const exercise = activity.exercise.summary
  if (exercise.status === 'available') {
    push({
      id: 'activity.exercise_minutes',
      domain: 'activity',
      label: 'Completed-day exercise minute average',
      value: exercise.value,
      unit: 'min',
      text: 'Completed-day average.',
      coverage: { observedDays: exercise.observedDays },
      detailPath: '/progress/activity',
      userEntered: false,
      substantive: true,
      priority: 3,
    })
  }
  const resting = activity.restingHeartRate.summary
  if (resting.status === 'available') {
    push({
      id: 'activity.resting_heart_rate',
      domain: 'activity',
      label: 'Resting heart rate median',
      value: resting.value,
      unit: 'bpm',
      text: 'Completed-day resting heart rate. This is not an overnight heart-rate sample.',
      coverage: { observedDays: resting.observedDays },
      detailPath: '/progress/activity',
      userEntered: false,
      substantive: true,
      priority: 3,
    })
  }
  if (activity.provisionalDay && activity.provisionalDay.date <= input.asOf) {
    push({
      id: 'activity.today',
      domain: 'activity',
      label: 'Today so far',
      value: activity.provisionalDay.stepsCount,
      unit: 'steps',
      text: 'Provisional activity for the current day. It is not part of the completed-day average.',
      coverage: { soFar: 1, date: activity.provisionalDay.date },
      detailPath: '/progress/activity',
      userEntered: false,
      substantive: true,
      priority: 3,
    })
  }
}

function addSleep(input: AskHealthPacketInput, push: (item: PushItem) => void, limitations: AskLimitation[]) {
  const sleep = input.sleep
  if (!sleep) {
    return
  }
  const average = sleep.averageTotalSleepMinutes
  push({
    id: 'sleep.duration',
    domain: 'sleep',
    label: 'Average sleep duration',
    value: average.status === 'available' ? average.value : null,
    unit: 'minutes',
    text: 'Average of analysis-eligible nights. Partial nights are excluded.',
    coverage: {
      analysisEligibleNights: sleep.analysisEligibleNights,
      calendarNights: sleep.calendarNights,
    },
    detailPath: '/progress/sleep',
    userEntered: false,
    substantive: sleep.analysisEligibleNights > 0,
    priority: 2,
  })
  if (average.status === 'insufficient_data') {
    limitations.push({
      code: 'sleep_sparse',
      text: 'Not enough complete Sleep nights are available for an average.',
      evidenceId: 'sleep.duration',
    })
  }
  const baseline = sleep.personalBaseline
  if (baseline && baseline.metricKey === 'sleep_duration') {
    push({
      id: 'sleep.baseline',
      domain: 'sleep',
      label: 'Personal sleep baseline',
      value: baseline.deviation,
      unit: 'minutes',
      text: `Baseline state ${baseline.state}. Median ${baseline.baselineMedian ?? 'unavailable'} minutes from ${baseline.baselineObservationCount} prior same-source nights.`,
      coverage: {
        state: baseline.state,
        observations: baseline.baselineObservationCount,
        current: baseline.currentValue,
        median: baseline.baselineMedian,
      },
      detailPath: baseline.targetSleepDate ? `/progress/sleep/${baseline.targetSleepDate}` : '/progress/sleep',
      userEntered: false,
      substantive: baseline.state === 'available' || baseline.baselineObservationCount > 0,
      priority: 2,
    })
  }
  const comparison = sleep.stageAnalytics.recentComparison
  const comparable = comparison.state === 'available'
  push({
    id: 'sleep.stages',
    domain: 'sleep',
    label: 'Sleep stage comparison',
    value: comparison.state,
    unit: null,
    text: comparable
      ? 'Recent stage comparison is available from stage-qualified nights.'
      : `Recent stage comparison is ${comparison.state}. Health is not treating the windows as directly comparable.`,
    coverage: {
      state: comparison.state,
      stageEligibleNights: sleep.stageEligibleNights,
      ...(comparable
        ? {
            remPercentagePoints: comparison.remPercentagePoints,
            corePercentagePoints: comparison.corePercentagePoints,
            deepPercentagePoints: comparison.deepPercentagePoints,
          }
        : {}),
    },
    detailPath: '/progress/sleep',
    userEntered: false,
    substantive: sleep.stageEligibleNights > 0,
    priority: 3,
  })
  const source = sleep.sourceAttribution
  push({
    id: 'sleep.source',
    domain: 'sleep',
    label: 'Sleep source continuity',
    value: source.comparability,
    unit: null,
    text: source.continuityLabel,
    coverage: {
      comparability: source.comparability,
      canonicalNights: source.canonicalNights,
      transitions: source.recentTransitions.length,
    },
    detailPath: '/progress/sleep',
    userEntered: false,
    substantive: source.canonicalNights > 0,
    priority: 2,
  })
}

function addTraining(input: AskHealthPacketInput, push: (item: PushItem) => void, detail: boolean) {
  const training = input.overview?.training
  const exercises = input.overview?.exercises ?? []
  if (training) {
    const count = training.workouts.status === 'available' ? training.workouts.value.count : training.sessions.length
    push({
      id: 'training.sessions',
      domain: 'training',
      label: 'Training sessions',
      value: count,
      unit: 'sessions',
      text: 'Canonical Training sessions in this range. Apple Activity workouts are not included.',
      coverage: { sessions: count },
      detailPath: '/progress/strength',
      userEntered: false,
      substantive: count > 0,
      priority: 2,
    })
    if (training.consistency.status === 'available') {
      push({
        id: 'training.frequency',
        domain: 'training',
        label: 'Training frequency',
        value: training.consistency.value.workoutsPerWeek,
        unit: 'sessions/week',
        text: 'Canonical Training frequency calculated across the selected range.',
        coverage: {
          workouts: training.consistency.value.workoutCount,
          uniqueDates: training.consistency.value.uniqueDates,
          medianGapDays: training.consistency.value.medianGapDays,
        },
        detailPath: '/progress/strength',
        userEntered: false,
        substantive: training.consistency.value.workoutCount > 0,
        priority: 2,
      })
    }
  }
  if (!detail) {
    return
  }
  const matches = matchingExercises(input.question, exercises)
  const selected = matches.length > 0 ? matches : exercises.slice().sort((left, right) => right.appearanceCount - left.appearanceCount).slice(0, 4)
  const show = matches.length > 0 || input.lens === 'training'
  if (!show) {
    return
  }
  for (const exercise of selected.slice(0, 4)) {
    const trend = exercise.trend
    push({
      id: `training.exercise.${slug(exercise.name)}`,
      domain: 'training',
      label: exercise.name,
      value: trend.status === 'available' ? trend.value.changePercent : null,
      unit: trend.status === 'available' ? 'percent' : null,
      text:
        trend.status === 'available'
          ? `${exercise.name} estimated-strength trend is ${trend.value.direction}. Change ${trend.value.changePercent} percent. Recent median ${trend.value.recentMedian}. Previous median ${trend.value.previousMedian}.`
          : `${exercise.name} estimated-strength trend is ${trend.status}. Appearances ${exercise.appearanceCount}.`,
      coverage: {
        appearances: exercise.appearanceCount,
        trend: trend.status,
        latestDate: exercise.latestPerformance?.date ?? null,
      },
      detailPath: `/progress/strength/${exercise.exerciseId}`,
      userEntered: false,
      substantive: exercise.appearanceCount > 0,
      priority: 2,
    })
  }
}

function addSupplements(input: AskHealthPacketInput, push: (item: PushItem) => void) {
  if (input.supplements.length === 0) {
    return
  }
  const totals = { taken: 0, skipped: 0, unknown: 0, paused: 0, notScheduled: 0 }
  for (const supplement of input.supplements) {
    const states = resolveScheduleRange({
      schedules: supplement.schedules,
      events: supplement.events,
      adherence: supplement.adherence,
      start: input.period.start,
      end: input.period.end,
    })
    tally(states, totals)
  }
  const scheduled = totals.taken + totals.skipped + totals.unknown
  if (scheduled === 0 && totals.paused === 0) {
    return
  }
  push({
    id: 'supplements.adherence',
    domain: 'supplements',
    label: 'Supplement adherence',
    value: scheduled === 0 ? null : totals.taken / scheduled,
    unit: 'taken_over_taken_plus_skipped_plus_unknown',
    text: 'Unknown stays unknown. It is not counted as skipped. Paused occurrences are separate.',
    coverage: {
      scheduled,
      taken: totals.taken,
      skipped: totals.skipped,
      unknown: totals.unknown,
      paused: totals.paused,
    },
    detailPath: '/supplements',
    userEntered: false,
    substantive: scheduled > 0,
    priority: 2,
  })
}

function tally(states: readonly OccurrenceState[], totals: { taken: number; skipped: number; unknown: number; paused: number; notScheduled: number }) {
  for (const state of states) {
    if (state === 'taken') totals.taken += 1
    else if (state === 'skipped') totals.skipped += 1
    else if (state === 'unknown') totals.unknown += 1
    else if (state === 'paused') totals.paused += 1
    else totals.notScheduled += 1
  }
}

function addGoals(input: AskHealthPacketInput, push: (item: PushItem) => void) {
  const active = input.goals.filter((goal) => goal.lifecycle === 'active')
  const numbers = input.question.match(/\d+(?:\.\d+)?/g) ?? []
  const matched = numbers.length
    ? active.filter((goal) => numbers.some((number) => goal.targetText.includes(number) || goal.label.includes(number)))
    : active
  const goals = (matched.length > 0 ? matched : active).filter((goal) => goalKindForLens(goal, input.lens)).slice(0, 8)
  for (const goal of goals) {
    push({
      id: `goals.${goal.id}`,
      domain: 'goals',
      label: goal.label,
      value: goal.targetState,
      unit: null,
      text: `${goal.targetText} Target state ${goal.targetState}. Deadline state ${goal.deadlineState}. Projection ${goal.projectionState ?? 'not_included'}${goal.projectionReason ? `: ${goal.projectionReason}` : ''}.`,
      coverage: {
        kind: goal.kind,
        targetState: goal.targetState,
        deadlineState: goal.deadlineState,
        projectionState: goal.projectionState,
      },
      detailPath: `/goals/${goal.id}`,
      userEntered: false,
      substantive: true,
      priority: 1,
    })
  }
}

function goalKindForLens(goal: AskGoalInput, lens: AskLens): boolean {
  if (lens === 'general' || lens === 'experiments') {
    return true
  }
  if (lens === 'training') {
    return goal.kind === 'strength_e1rm' || goal.kind === 'training_frequency' || goal.kind === 'benchmark_result'
  }
  if (lens === 'nutrition') {
    return goal.kind === 'nutrition_protein' || goal.kind === 'body_metric'
  }
  if (lens === 'recovery') {
    return goal.kind === 'sleep_duration' || goal.kind === 'activity_steps'
  }
  return true
}

function addLab(input: AskHealthPacketInput, push: (item: PushItem) => void) {
  for (const experiment of input.experiments.slice(0, 6)) {
    push({
      id: `experiments.${experiment.id}`,
      domain: 'experiments',
      label: experiment.title,
      value: experiment.classification,
      unit: null,
      text: `Status ${experiment.status}. Classification ${experiment.classification ?? 'none'}. Question: ${clip(experiment.question)}`,
      coverage: {
        status: experiment.status,
        classification: experiment.classification,
        protocolVersion: experiment.protocolVersion,
        requirementPass: experiment.requirementPass,
        requirementFail: experiment.requirementFail,
        requirementMissing: experiment.requirementMissing,
      },
      detailPath: `/lab/experiments/${experiment.id}`,
      userEntered: true,
      substantive: true,
      priority: input.lens === 'experiments' ? 1 : 4,
    })
  }
  for (const benchmark of input.benchmarks.slice(0, 6)) {
    push({
      id: `benchmarks.${benchmark.id}`,
      domain: 'benchmarks',
      label: benchmark.title,
      value: benchmark.value,
      unit: benchmark.unit,
      text: `Valid ${benchmark.label} on ${benchmark.resultDate}. Protocol version ${benchmark.protocolVersion}. Invalidated results are excluded.`,
      coverage: { protocolVersion: benchmark.protocolVersion, resultDate: benchmark.resultDate },
      detailPath: '/lab',
      userEntered: false,
      substantive: true,
      priority: input.lens === 'experiments' ? 1 : 4,
    })
  }
}

function addContext(context: AskContextInput | null, push: (item: PushItem) => void) {
  if (!context) {
    return
  }
  const tags = Object.entries(context.tagCounts).filter((entry) => entry[1] > 0)
  if (tags.length === 0 && context.notedDays === 0) {
    return
  }
  push({
    id: 'context.tags',
    domain: 'context',
    label: 'Daily context',
    value: tags.length,
    unit: 'tags',
    text: tags.map(([key, count]) => `${key} ${count}`).join(', ') || 'Context notes were recorded.',
    coverage: { ...context.tagCounts, notedDays: context.notedDays },
    detailPath: '/context',
    userEntered: false,
    substantive: true,
    priority: 4,
  })
  for (const note of context.notes.slice(0, 3)) {
    push({
      id: `context.note.${note.date}`,
      domain: 'context',
      label: `Context note ${note.date}`,
      value: null,
      unit: null,
      text: clip(note.text),
      coverage: null,
      detailPath: '/context',
      userEntered: true,
      substantive: true,
      priority: 5,
    })
  }
}

function addPatterns(patterns: readonly AskPatternInput[], push: (item: PushItem) => void) {
  for (const pattern of patterns.slice(0, 5)) {
    push({
      id: `patterns.${pattern.id}`,
      domain: 'patterns',
      label: 'Deterministic pattern',
      value: pattern.id,
      unit: null,
      text: pattern.text,
      coverage: null,
      detailPath: '/progress',
      userEntered: false,
      substantive: true,
      priority: 3,
    })
  }
}


function addSharedIntelligence(
  intelligence: NonNullable<AskHealthPacketInput['intelligence']>,
  push: (item: PushItem) => void,
  limitations: AskLimitation[],
) {
  for (const item of intelligence.coverage) {
    push({
      id: `intelligence.coverage.${item.key}`,
      domain: 'intelligence',
      label: `${item.label} coverage`,
      value: item.coveragePct,
      unit: 'percent',
      text: `${item.observedDays} observed day${item.observedDays === 1 ? '' : 's'} of ${item.eligibleDays} eligible days. ${item.excludedObservations > 0 ? `${item.excludedObservations} reviewed observation${item.excludedObservations === 1 ? '' : 's'} excluded from intelligence. ` : ''}Confidence: ${item.confidence}.`,
      coverage: {
        observedDays: item.observedDays,
        eligibleDays: item.eligibleDays,
        coveragePct: item.coveragePct,
        excludedObservations: item.excludedObservations,
      },
      detailPath: item.detailPath,
      userEntered: false,
      substantive: item.observedDays > 0,
      confidence: item.confidence,
      provenance: Object.entries(item.provenance).map(([kind, count]) => `${kind}:${count}`).join(', '),
      priority: 2,
    })
  }

  for (const baseline of intelligence.baselines) {
    if (baseline.state !== 'available' || baseline.mean == null) continue
    push({
      id: `intelligence.baseline.${baseline.key}`,
      domain: 'intelligence',
      label: `${baseline.label} personal baseline`,
      value: baseline.mean,
      unit: baseline.unit,
      text: `Recent personal baseline from ${baseline.observations} observations (${baseline.start} through ${baseline.end}). Mean ${roundEvidence(baseline.mean)} ${baseline.unit}; median ${baseline.median == null ? 'unknown' : roundEvidence(baseline.median)} ${baseline.unit}.`,
      coverage: { observations: baseline.observations, startDate: baseline.start, endDate: baseline.end },
      detailPath: intelligence.coverage.find((item) => item.key === baseline.key)?.detailPath ?? null,
      userEntered: false,
      substantive: true,
      confidence: baseline.confidence,
      priority: 2,
    })
  }

  for (const relationship of intelligence.relationships) {
    const id = `intelligence.relationship.${relationship.id}`
    if (relationship.state === 'available' && relationship.rho != null) {
      push({
        id,
        domain: 'intelligence',
        label: 'Personal relationship',
        value: relationship.rho,
        unit: 'Spearman rho',
        text: relationship.summary,
        coverage: {
          pairedObservations: relationship.sampleSize,
          requiredObservations: relationship.requiredSampleSize,
          lagDays: relationship.lagDays,
        },
        detailPath: relationship.detailPaths[0] ?? '/progress',
        userEntered: false,
        substantive: true,
        confidence: relationship.confidence,
        evidenceDates: [...new Set(relationship.evidenceDates.flatMap((pair) => [pair.xDate, pair.yDate]))],
        priority: 1,
      })
    } else if (relationship.state === 'insufficient_data') {
      push({
        id,
        domain: 'intelligence',
        label: 'Relationship evidence',
        value: relationship.sampleSize,
        unit: 'paired observations',
        text: relationship.summary,
        coverage: {
          pairedObservations: relationship.sampleSize,
          requiredObservations: relationship.requiredSampleSize,
          lagDays: relationship.lagDays,
        },
        detailPath: relationship.detailPaths[0] ?? '/progress',
        userEntered: false,
        substantive: false,
        confidence: relationship.confidence,
        priority: 1,
      })
      limitations.push({
        code: `relationship_${relationship.id}_insufficient`,
        text: relationship.summary,
        evidenceId: id,
      })
    }
  }

  for (const comparison of intelligence.interventions.slice(0, 5)) {
    push({
      id: `intelligence.change.${comparison.id}`,
      domain: 'intelligence',
      label: `Before/after · ${comparison.signalLabel}`,
      value: comparison.delta,
      unit: comparison.unit,
      text: comparison.summary,
      coverage: {
        beforeObservations: comparison.beforeN,
        afterObservations: comparison.afterN,
        changeDate: comparison.changeDate,
      },
      detailPath: '/progress/timeline',
      userEntered: false,
      substantive: true,
      confidence: comparison.confidence,
      evidenceDates: [...comparison.evidenceDates.before, ...comparison.evidenceDates.after],
      priority: 2,
    })
  }

  for (const missing of intelligence.missing) {
    const id = `intelligence.missing.${missing.key}`
    push({
      id,
      domain: 'intelligence',
      label: `${missing.label} context missing`,
      value: null,
      unit: null,
      text: missing.detail,
      coverage: null,
      detailPath: missing.detailPath,
      userEntered: false,
      substantive: false,
      confidence: 'unknown',
      priority: 1,
    })
    limitations.push({
      code: `missing_${missing.key}`,
      text: `${missing.label}: ${missing.detail}`,
      evidenceId: id,
    })
  }
}

function roundEvidence(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

function matchingExercises(
  question: string,
  exercises: NonNullable<AskHealthPacketInput['overview']>['exercises'],
) {
  const normalized = question.toLowerCase()
  const words = normalized.split(/[^a-z0-9]+/).filter((word) => word.length >= 4)
  return exercises.filter((exercise) => {
    const name = exercise.name.toLowerCase()
    if (normalized.includes(name)) {
      return true
    }
    const nameWords = name.split(/[^a-z0-9]+/).filter((word) => word.length >= 4)
    return words.some((word) => nameWords.some((nameWord) => nameWord.startsWith(word) || word.startsWith(nameWord)))
  })
}

function exerciseClarification(input: AskHealthPacketInput): string | null {
  const exercises = input.overview?.exercises ?? []
  const matches = matchingExercises(input.question, exercises)
  if (matches.length < 2) {
    return null
  }
  return `More than one exercise matches this question: ${matches.map((item) => item.name).join(', ')}. Health is showing each match rather than choosing one.`
}

function trimEvidence(drafts: readonly Draft[], maxChars: number): AskEvidence[] {
  const ordered = drafts.slice().sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
  const kept = ordered.slice()
  while (JSON.stringify(kept.map(strip)).length > maxChars && kept.some((item) => item.priority > 0)) {
    let index = -1
    for (let cursor = kept.length - 1; cursor >= 0; cursor -= 1) {
      if (kept[cursor]!.priority > 0) {
        index = cursor
        break
      }
    }
    if (index < 0) {
      break
    }
    kept.splice(index, 1)
  }
  return kept.map(strip)
}

function strip(item: Draft): AskEvidence {
  return {
    id: item.id,
    domain: item.domain,
    label: item.label,
    value: item.value,
    unit: item.unit,
    text: item.text,
    period: item.period,
    coverage: item.coverage,
    detailPath: item.detailPath,
    userEntered: item.userEntered,
    substantive: item.substantive,
    confidence: item.confidence,
    provenance: item.provenance,
    evidenceDates: item.evidenceDates,
  }
}

function slug(name: string): string {
  const value = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return value.slice(0, 40) || 'exercise'
}

function clip(value: string): string {
  const trimmed = value.trim()
  return trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed
}
