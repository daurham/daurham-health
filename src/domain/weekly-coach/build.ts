import { activityRangeSummary, type ActivityMetricSummary } from '../activity/analytics.js'
import { goalNeedsWeeklyAttention } from '../goal-control.js'
import { ACTIVITY_SHORT_TERM_MIN_OBSERVED, ACTIVITY_TIMEZONE } from '../activity/config.js'
import { bodyWeightTrend } from '../progress/body-trend.js'
import { addCalendarDays } from '../progress/dates.js'
import { nutritionDailyObservations, nutritionPeriodSummary } from '../progress/nutrition.js'
import { percentChange } from '../progress/statistics.js'
import { kilogramsToPounds } from '../units.js'
import { sleepRangeSummary } from '../sleep/analytics.js'
import { SLEEP_SHORT_TERM_MIN_OBSERVED } from '../sleep/config.js'
import { aggregateOccurrenceStates, resolveOccurrence } from '../supplements/resolve.js'
import {
  CANONICAL_TRAINING_SESSION_TYPES,
  WEEKLY_COACH_ACTIVITY_MIN_OBSERVED,
  WEEKLY_COACH_NUTRITION_MIN_LOGGED,
  WEEKLY_COACH_PACKET_VERSION,
  WEEKLY_COACH_PR_CAP,
  WEEKLY_COACH_PROTEIN_MIN_LOGGED,
  WEEKLY_COACH_PROTEIN_TARGET_RATIO,
  WEEKLY_COACH_SLEEP_MIN_NIGHTS,
  WEEKLY_COACH_SUPPLEMENT_MIN_SCHEDULED_DAYS,
  WEEKLY_COACH_WATCH_CAP,
  WEEKLY_COACH_WENT_WELL_CAP,
} from './config.js'
import type {
  WeeklyCandidate,
  WeeklyCoachBrief,
  WeeklyCoachInput,
  WeeklyCoverage,
  WeeklyFactLine,
  WeeklyPeriod,
} from './types.js'

const NUTRITION_FOCUS = 'Log Nutrition more consistently this week so Health has enough coverage to compare intake.'

export function weeklyCoachPeriods(asOf: string): { period: WeeklyPeriod; previousPeriod: WeeklyPeriod } {
  return {
    period: { start: addCalendarDays(asOf, -7), end: addCalendarDays(asOf, -1) },
    previousPeriod: { start: addCalendarDays(asOf, -14), end: addCalendarDays(asOf, -8) },
  }
}

export function buildWeeklyCoachBrief(input: WeeklyCoachInput): WeeklyCoachBrief {
  const { period, previousPeriod } = weeklyCoachPeriods(input.asOf)
  const activity = activityFacts(input, period, previousPeriod)
  const sleep = sleepFacts(input, period, previousPeriod)
  const nutrition = nutritionFacts(input, period, previousPeriod)
  const training = trainingFacts(input, period)
  const supplements = supplementFacts(input, period)
  const body = bodyFacts(input, period)
  const coverage = coverageOf(activity, sleep, nutrition, training, supplements, body)
  const candidates = [
    ...goalCandidates(input),
    ...prCandidates(input, period),
    ...proteinCandidate(nutrition),
    ...labWinCandidates(input),
    ...insightCandidates(input),
    ...coverageCandidates(nutrition, sleep, body),
    ...sourceCandidate(sleep),
    ...focusCandidates(input, nutrition),
  ].sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
  const wentWell = candidates.filter((item) => item.section === 'went_well').slice(0, WEEKLY_COACH_WENT_WELL_CAP)
  const worthWatching = candidates.filter((item) => item.section === 'worth_watching').slice(0, WEEKLY_COACH_WATCH_CAP)
  const focus = candidates.find((item) => item.section === 'focus') ?? null
  const canGenerate = coverage.substantiveDomains.length >= 2
  return {
    packetVersion: WEEKLY_COACH_PACKET_VERSION,
    asOf: input.asOf,
    period,
    previousPeriod,
    state: canGenerate ? 'deterministic' : 'insufficient_evidence',
    canGenerate,
    coverage,
    facts: [...activity.facts, ...sleep.facts, ...nutrition.facts, ...training.facts, ...supplements.facts, ...body.facts],
    wentWell,
    worthWatching,
    focus,
    candidates,
  }
}

function coverageOf(
  activity: DomainBits,
  sleep: DomainBits,
  nutrition: DomainBits,
  training: DomainBits,
  supplements: DomainBits,
  body: DomainBits,
): WeeklyCoverage {
  const flags = {
    activity: activity.substantive,
    sleep: sleep.substantive,
    nutrition: nutrition.substantive,
    training: training.substantive,
    supplements: supplements.substantive,
    body: body.substantive,
  }
  return {
    ...flags,
    substantiveDomains: Object.entries(flags).flatMap(([name, ok]) => (ok ? [name] : [])),
  }
}

type DomainBits = { substantive: boolean; facts: WeeklyFactLine[] }

function activityFacts(input: WeeklyCoachInput, period: WeeklyPeriod, previous: WeeklyPeriod): DomainBits {
  const current = activityRangeSummary(dated(input.activityDays, period.end), period.start, period.end, input.timezone ?? ACTIVITY_TIMEZONE, input.asOf)
  const prior = activityRangeSummary(dated(input.activityDays, period.end), previous.start, previous.end, input.timezone ?? ACTIVITY_TIMEZONE, input.asOf)
  const metrics = [
    { key: 'steps', label: 'step', unit: '/day', current: current.steps, prior: prior.steps },
    { key: 'active-energy', label: 'active energy', unit: ' kcal/day', current: current.activeEnergy, prior: prior.activeEnergy },
    { key: 'exercise', label: 'exercise-minute', unit: ' min/day', current: current.exercise, prior: prior.exercise },
  ] as const
  const facts: WeeklyFactLine[] = []
  let substantive = false
  for (const metric of metrics) {
    const observed = metric.current.observedDays
    if (observed >= WEEKLY_COACH_ACTIVITY_MIN_OBSERVED) {
      substantive = true
    }
    const value = availableNumber(metric.current)
    if (value == null) {
      continue
    }
    const comparison = comparisonText(metric.current, metric.prior, metric.label, metric.unit)
    facts.push({
      id: `fact:activity:${metric.key}`,
      domain: 'activity',
      text: `Completed-day ${metric.label} average was ${formatQuantity(value, 0)}${metric.unit} across ${observed} observed days.${comparison}`,
      detailPath: '/progress/activity',
    })
  }
  return { substantive, facts }
}

function sleepFacts(input: WeeklyCoachInput, period: WeeklyPeriod, previous: WeeklyPeriod): DomainBits & {
  sourceSwitched: boolean
  previousSource: string | null
  currentSource: string | null
} {
  const nights = input.sleepNights.filter((night) => night.sleepDate <= period.end)
  const current = sleepRangeSummary(nights, period.start, period.end)
  const prior = sleepRangeSummary(nights, previous.start, previous.end)
  const eligible = current.observedSleepNights
  const facts: WeeklyFactLine[] = []
  const average = current.averageTotalSleepMinutes.status === 'available' ? current.averageTotalSleepMinutes.value : null
  const source = sharedSource(nights, period)
  const priorSource = sharedSource(nights, previous)
  const comparable = source != null && source.key === priorSource?.key && eligible >= SLEEP_SHORT_TERM_MIN_OBSERVED && prior.observedSleepNights >= SLEEP_SHORT_TERM_MIN_OBSERVED
  let comparison = ''
  if (comparable && average != null && prior.averageTotalSleepMinutes.status === 'available') {
    const delta = average - prior.averageTotalSleepMinutes.value
    const direction = delta === 0 ? 'the same as' : delta > 0 ? 'higher than' : 'lower than'
    comparison = ` Compared with the prior 7 nights from the same source, average sleep was ${Math.abs(Math.round(delta))}m ${direction} that period.`
  }
  if (eligible > 0 || current.calendarNights > 0) {
    facts.push({
      id: 'fact:sleep:duration',
      domain: 'sleep',
      text: `${eligible} analysis-eligible nights.${average == null ? '' : ` Average sleep was ${formatDuration(average)}.`} ${source ? source.name : 'Source was not a single known source.'}${comparison}`.replace(/\s+/g, ' ').trim(),
      detailPath: '/progress/sleep',
    })
  }
  if (input.sleepBaseline && input.sleepBaseline.sleepDate >= period.start && input.sleepBaseline.sleepDate <= period.end) {
    facts.push({
      id: 'fact:sleep:baseline',
      domain: 'sleep',
      text: `The latest qualifying night (${input.sleepBaseline.sleepDate}) was ${formatDuration(input.sleepBaseline.currentMinutes)} against a personal median of ${formatDuration(input.sleepBaseline.medianMinutes)} from ${input.sleepBaseline.priorNights} prior same-source nights.`,
      detailPath: '/progress/sleep',
    })
  }
  return {
    substantive: eligible >= WEEKLY_COACH_SLEEP_MIN_NIGHTS,
    facts,
    sourceSwitched: source != null && priorSource != null && source.key !== priorSource.key,
    previousSource: priorSource?.name ?? null,
    currentSource: source?.name ?? null,
  }
}

function nutritionFacts(input: WeeklyCoachInput, period: WeeklyPeriod, previous: WeeklyPeriod): DomainBits & {
  loggedDays: number
  proteinMet: number | null
  proteinKnown: number | null
  comparable: boolean
} {
  const entries = input.nutritionEntries.filter((entry) => entry.logDate <= period.end)
  const current = nutritionPeriodSummary({ entries, targets: input.nutritionTargets, start: period.start, end: period.end })
  const prior = nutritionPeriodSummary({ entries, targets: input.nutritionTargets, start: previous.start, end: previous.end })
  const logged = current.loggedDays
  const protein = proteinTarget(entries, input.nutritionTargets, period)
  const facts: WeeklyFactLine[] = [
    {
      id: 'fact:nutrition:coverage',
      domain: 'nutrition',
      text: `Nutrition was logged on ${logged} of ${current.calendarDays} days.`,
      detailPath: '/nutrition',
    },
  ]
  const calorie = current.calories.averageOnLoggedDays
  const proteinAverage = current.protein.averageOnObservedDays
  if (calorie != null) {
    const priorCalorie = prior.calories.averageOnLoggedDays
    const comparison =
      logged >= WEEKLY_COACH_NUTRITION_MIN_LOGGED && prior.loggedDays >= WEEKLY_COACH_NUTRITION_MIN_LOGGED && priorCalorie != null && priorCalorie > 0
        ? ` Compared with the prior logged-day average, calories were ${directionWord(percentChange(calorie, priorCalorie))} (${formatQuantity(calorie, 0)} vs ${formatQuantity(priorCalorie, 0)} kcal/day on logged days).`
        : ''
    facts.push({
      id: 'fact:nutrition:calories',
      domain: 'nutrition',
      text: `Calorie average on logged days was ${formatQuantity(calorie, 0)} kcal/day.${comparison}`,
      detailPath: '/nutrition',
    })
  }
  if (proteinAverage != null) {
    facts.push({
      id: 'fact:nutrition:protein',
      domain: 'nutrition',
      text: `Protein average on logged days was ${formatQuantity(proteinAverage, 0)} g/day.`,
      detailPath: '/nutrition',
    })
  }
  for (const [key, stat, unit] of [
    ['carbs', current.carbs, 'g/day'],
    ['fat', current.fat, 'g/day'],
  ] as const) {
    if (stat.averageOnObservedDays != null) {
      facts.push({
        id: `fact:nutrition:${key}`,
        domain: 'nutrition',
        text: `${key === 'carbs' ? 'Carbohydrate' : 'Fat'} average on logged days was ${formatQuantity(stat.averageOnObservedDays, 0)} ${unit}.`,
        detailPath: '/nutrition',
      })
    }
  }
  if (protein.known > 0) {
    facts.push({
      id: 'fact:nutrition:protein-target',
      domain: 'nutrition',
      text: `Protein target was reached on ${protein.met} of ${protein.known} logged days with known protein.`,
      detailPath: '/nutrition',
    })
  }
  return {
    substantive: logged >= WEEKLY_COACH_NUTRITION_MIN_LOGGED,
    facts,
    loggedDays: logged,
    proteinMet: protein.known > 0 ? protein.met : null,
    proteinKnown: protein.known > 0 ? protein.known : null,
    comparable: logged >= WEEKLY_COACH_NUTRITION_MIN_LOGGED && prior.loggedDays >= WEEKLY_COACH_NUTRITION_MIN_LOGGED,
  }
}

function trainingFacts(input: WeeklyCoachInput, period: WeeklyPeriod): DomainBits {
  const sessions = input.trainingSessions.filter(
    (session) =>
      session.performedOn >= period.start &&
      session.performedOn <= period.end &&
      CANONICAL_TRAINING_SESSION_TYPES.includes(session.sessionType as (typeof CANONICAL_TRAINING_SESSION_TYPES)[number]),
  )
  const counts = new Map<string, number>()
  for (const session of sessions) {
    counts.set(session.sessionType, (counts.get(session.sessionType) ?? 0) + 1)
  }
  const mix = [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([type, count]) => `${count} ${type.replace('_', ' ')}`)
  return {
    substantive: sessions.length >= 1,
    facts: [
      {
        id: 'fact:training:sessions',
        domain: 'training',
        text: `${sessions.length} canonical Training ${sessions.length === 1 ? 'session' : 'sessions'}${mix.length ? ` (${mix.join(', ')})` : ''}.`,
        detailPath: '/training',
      },
    ],
  }
}

function supplementFacts(input: WeeklyCoachInput, period: WeeklyPeriod): DomainBits {
  const dates = datesIn(period)
  const scheduledDates = new Set<string>()
  const facts: WeeklyFactLine[] = []
  for (const supplement of input.supplements) {
    const states = supplement.schedules.flatMap((schedule) =>
      dates.map((date) => {
        const state = resolveOccurrence({
          events: supplement.events,
          schedule,
          date,
          adherence: supplement.adherence.find((item) => item.scheduleId === schedule.id && item.scheduledDate === date) ?? null,
        })
        if (state === 'taken' || state === 'skipped' || state === 'unknown') {
          scheduledDates.add(date)
        }
        return state
      }),
    )
    const totals = aggregateOccurrenceStates(states)
    if (totals.scheduledCount === 0) {
      continue
    }
    facts.push({
      id: `fact:supplement:${supplement.id}`,
      domain: 'supplements',
      text: `${supplement.name}: ${totals.takenCount} taken, ${totals.unknownCount} unknown, ${totals.skippedCount} skipped.`,
      detailPath: '/supplements',
    })
  }
  return { substantive: scheduledDates.size >= WEEKLY_COACH_SUPPLEMENT_MIN_SCHEDULED_DAYS, facts }
}

function bodyFacts(input: WeeklyCoachInput, period: WeeklyPeriod): DomainBits & { trendEligible: boolean } {
  const observations = input.bodyObservations.filter((item) => item.calendarDate <= period.end)
  const week = observations.filter((item) => item.calendarDate >= period.start && item.key === 'weight')
  const trend = bodyWeightTrend(observations.filter((item) => item.key === 'weight'))
  const facts: WeeklyFactLine[] = []
  if (week.length > 0) {
    const latest = [...week].sort((left, right) => (left.calendarDate < right.calendarDate ? 1 : -1))[0]!
    facts.push({
      id: 'fact:body:week',
      domain: 'body',
      text: `${week.length} weight ${week.length === 1 ? 'observation' : 'observations'} this week. Latest ${formatWeight(latest.value, latest.unit)} on ${latest.calendarDate}.`,
      detailPath: '/progress/body',
    })
  }
  let trendEligible = false
  if (trend.status === 'available') {
    trendEligible = true
    const unit = observations.find((item) => item.key === 'weight')?.unit
    const lb = unit === 'kg' ? kilogramsToPounds(trend.value.slopePerWeek) : unit === 'lb' ? trend.value.slopePerWeek : null
    if (lb != null) {
      facts.push({
        id: 'fact:body:trend',
        domain: 'body',
        text: `Existing weight trend is ${formatSlope(lb)} lb/week across ${trend.value.measurementCount} observations.`,
        detailPath: '/progress/body',
      })
    }
  }
  return { substantive: week.length > 0 || (trendEligible && input.activeBodyGoal), facts, trendEligible }
}

function goalCandidates(input: WeeklyCoachInput): WeeklyCandidate[] {
  const active = input.goals.filter((goal) => goal.lifecycle === 'active')
  return active.flatMap((goal) => {
    const items: WeeklyCandidate[] = []
    if (goal.targetState === 'satisfied' || (goal.targetState !== 'unknown' && goal.deadlineState === 'projected_before_deadline')) {
      const satisfied = goal.targetState === 'satisfied'
      items.push({
        id: `win:goal:${goal.id}`,
        section: 'went_well',
        kind: satisfied ? 'goal_satisfied' : 'goal_on_track',
        fact: satisfied ? `${goal.label} is currently at its target.` : `${goal.label} is on track.`,
        evidenceRefs: [`goal:${goal.id}`],
        detailPath: `/goals/${goal.id}`,
        actionText: null,
        rank: satisfied ? 10 : 20,
      })
    }
    if (goal.deadlineState === 'projected_after_deadline' || goal.deadlineState === 'passed_unmet' || goal.deadlineState === 'future_no_projection') {
      items.push({
        id: `watch:goal:${goal.id}`,
        section: 'worth_watching',
        kind: `goal_${goal.deadlineState}`,
        fact: goalWatchFact(goal.label, goal.deadlineState),
        evidenceRefs: [`goal:${goal.id}`],
        detailPath: `/goals/${goal.id}`,
        actionText: null,
        rank: goal.deadlineState === 'future_no_projection' ? 40 : 15,
      })
    }
    return items
  })
}

function prCandidates(input: WeeklyCoachInput, period: WeeklyPeriod): WeeklyCandidate[] {
  return input.performanceBests
    .filter((item) => item.date >= period.start && item.date <= period.end)
    .sort((left, right) => (left.date < right.date ? 1 : left.date > right.date ? -1 : left.exerciseId.localeCompare(right.exerciseId)))
    .slice(0, WEEKLY_COACH_PR_CAP)
    .map((item) => ({
      id: `win:training-pr:${item.exerciseId}:${item.date}`,
      section: 'went_well' as const,
      kind: 'training_pr',
      fact: `${item.name} performance best on ${item.date}: ${item.summary}.`,
      evidenceRefs: [`pr:${item.exerciseId}:${item.date}`],
      detailPath: `/progress/strength/${item.exerciseId}`,
      actionText: null,
      rank: 30,
    }))
}

function proteinCandidate(nutrition: ReturnType<typeof nutritionFacts>): WeeklyCandidate[] {
  if (
    nutrition.loggedDays < WEEKLY_COACH_PROTEIN_MIN_LOGGED ||
    nutrition.proteinMet == null ||
    nutrition.proteinKnown == null ||
    nutrition.proteinKnown === 0 ||
    nutrition.proteinMet / nutrition.proteinKnown < WEEKLY_COACH_PROTEIN_TARGET_RATIO
  ) {
    return []
  }
  return [
    {
      id: 'win:nutrition-protein',
      section: 'went_well',
      kind: 'nutrition_protein_target',
      fact: `Protein target reached on ${nutrition.proteinMet} of ${nutrition.proteinKnown} logged days.`,
      evidenceRefs: ['nutrition:protein-target'],
      detailPath: '/nutrition',
      actionText: null,
      rank: 35,
    },
  ]
}

function labWinCandidates(input: WeeklyCoachInput): WeeklyCandidate[] {
  return [
    ...input.benchmarkResults.map((result) => ({
      id: `win:benchmark:${result.id}`,
      section: 'went_well' as const,
      kind: 'benchmark_result',
      fact: `${result.title} result was recorded on ${result.date}.`,
      evidenceRefs: [`benchmark:${result.id}`],
      detailPath: `/lab/benchmarks/${result.id}`,
      actionText: null,
      rank: 36,
    })),
    ...input.experiments
      .filter((item) => item.completedInWeek)
      .map((item) => ({
        id: `win:experiment:${item.id}`,
        section: 'went_well' as const,
        kind: 'experiment_milestone',
        fact: `${item.title} has a completed result in this week.`,
        evidenceRefs: [`experiment:${item.id}`],
        detailPath: `/lab/experiments/${item.id}`,
        actionText: null,
        rank: 37,
      })),
  ]
}

function insightCandidates(input: WeeklyCoachInput): WeeklyCandidate[] {
  return input.insights.map((insight, index) => ({
    id: `watch:insight:${insight.id}`,
    section: 'worth_watching' as const,
    kind: insight.kind,
    fact: insight.summary,
    evidenceRefs: insight.evidence.map((item) => `${insight.id}:${item.label}`),
    detailPath: insight.detailPath,
    actionText: null,
    rank: 50 + index,
  }))
}

function coverageCandidates(
  nutrition: ReturnType<typeof nutritionFacts>,
  sleep: ReturnType<typeof sleepFacts>,
  body: ReturnType<typeof bodyFacts>,
): WeeklyCandidate[] {
  const items: WeeklyCandidate[] = []
  if (nutrition.loggedDays < WEEKLY_COACH_NUTRITION_MIN_LOGGED) {
    items.push({
      id: 'watch:coverage:nutrition',
      section: 'worth_watching',
      kind: 'coverage_nutrition',
      fact: `Nutrition was logged on ${nutrition.loggedDays} of 7 days, so week-over-week intake comparison is limited.`,
      evidenceRefs: ['nutrition:coverage'],
      detailPath: '/nutrition',
      actionText: null,
      rank: 70,
    })
  }
  const sleepFact = sleep.facts.find((item) => item.id === 'fact:sleep:duration')
  const nights = Number(sleepFact?.text.match(/^(\d+)/)?.[1] ?? 0)
  if (sleepFact && nights < WEEKLY_COACH_SLEEP_MIN_NIGHTS) {
    items.push({
      id: 'watch:coverage:sleep',
      section: 'worth_watching',
      kind: 'coverage_sleep',
      fact: `Sleep has ${nights} analysis-eligible nights in these 7 days, so a weekly sleep comparison is limited.`,
      evidenceRefs: ['sleep:coverage'],
      detailPath: '/progress/sleep',
      actionText: null,
      rank: 71,
    })
  }
  if (!body.trendEligible && body.facts.length > 0) {
    items.push({
      id: 'watch:coverage:body',
      section: 'worth_watching',
      kind: 'coverage_body',
      fact: 'Body trend does not yet have enough observations for the accepted trend.',
      evidenceRefs: ['body:trend'],
      detailPath: '/progress/body',
      actionText: null,
      rank: 72,
    })
  }
  return items
}

function sourceCandidate(sleep: ReturnType<typeof sleepFacts>): WeeklyCandidate[] {
  if (!sleep.sourceSwitched) {
    return []
  }
  return [
    {
      id: 'watch:sleep-source',
      section: 'worth_watching',
      kind: 'sleep_source_change',
      fact:
        sleep.previousSource && sleep.currentSource
          ? `Sleep source changed from ${sleep.previousSource} to ${sleep.currentSource}, so same-source comparison is limited.`
          : 'Sleep source changed between these two weeks, so same-source comparison is limited.',
      evidenceRefs: ['sleep:source'],
      detailPath: '/progress/sleep',
      actionText: null,
      rank: 73,
    },
  ]
}

function focusCandidates(input: WeeklyCoachInput, nutrition: ReturnType<typeof nutritionFacts>): WeeklyCandidate[] {
  const items: WeeklyCandidate[] = []
  for (const goal of input.goals) {
    if (goal.lifecycle !== 'active' || goal.targetState === 'satisfied') {
      continue
    }
    if (goal.deadlineState === 'passed_unmet' || goal.deadlineState === 'due_today') {
      items.push({
        id: `focus:goal:${goal.id}`,
        section: 'focus',
        kind: 'goal_review',
        fact: goal.deadlineState === 'due_today' ? `${goal.label} target date is today.` : `${goal.label} target date has passed.`,
        evidenceRefs: [`goal:${goal.id}`],
        detailPath: `/goals/${goal.id}`,
        actionText: `Review your ${goal.label} goal because its target date ${goal.deadlineState === 'due_today' ? 'is today' : 'has passed'}.`,
        rank: 1,
      })
    } else if (goalNeedsWeeklyAttention(goal.deadlineState)) {
      items.push({
        id: `focus:goal-off-track:${goal.id}`,
        section: 'focus',
        kind: 'goal_off_track',
        fact: `${goal.label} is projected after its target date.`,
        evidenceRefs: [`goal:${goal.id}`],
        detailPath: `/goals/${goal.id}`,
        actionText: `Review the ${goal.label} goal and its current plan before changing targets.`,
        rank: 6,
      })
    }
  }
  for (const cadence of input.cadenceDue) {
    if (cadence.status !== 'due' && cadence.status !== 'stale' && cadence.status !== 'initial_due') {
      continue
    }
    items.push({
      id: `focus:body-cadence:${cadence.key}`,
      section: 'focus',
      kind: 'body_cadence',
      fact: `${cadence.label} measurement is due.`,
      evidenceRefs: [`cadence:${cadence.key}`],
      detailPath: '/body',
      actionText: `Record your scheduled ${cadence.label} measurement.`,
      rank: 2,
    })
  }
  for (const retest of input.retests) {
    if (retest.status !== 'due') {
      continue
    }
    items.push({
      id: `focus:benchmark:${retest.id}`,
      section: 'focus',
      kind: 'benchmark_retest',
      fact: `${retest.title} retest is due.`,
      evidenceRefs: [`retest:${retest.id}`],
      detailPath: `/lab/benchmarks/${retest.id}`,
      actionText: `Complete the ${retest.title} retest that is already due.`,
      rank: 3,
    })
  }
  for (const experiment of input.experiments) {
    if (!experiment.reviewReady) {
      continue
    }
    items.push({
      id: `focus:experiment:${experiment.id}`,
      section: 'focus',
      kind: 'experiment_review',
      fact: `${experiment.title} result is ready to review.`,
      evidenceRefs: [`experiment:${experiment.id}`],
      detailPath: `/lab/experiments/${experiment.id}`,
      actionText: `Review the experiment result that is ready.`,
      rank: 4,
    })
  }
  for (const capture of input.reviewCaptures) {
    items.push({
      id: `focus:review:${capture.id}`,
      section: 'focus',
      kind: 'review_capture',
      fact: `${capture.label} is waiting for review.`,
      evidenceRefs: [`review:${capture.id}`],
      detailPath: capture.detailPath,
      actionText: `Resolve the existing ${capture.label} review.`,
      rank: 5,
    })
  }

  const plan = input.trainingPlan
  if (plan?.configured && plan.weeklyFrequencyTarget != null && plan.completedProgrammedSessions < plan.weeklyFrequencyTarget) {
    const remaining = plan.weeklyFrequencyTarget - plan.completedProgrammedSessions
    const trainingToday = plan.todayIntent === 'training_preferred' || plan.todayIntent === 'training_moved_here'
    if (trainingToday) {
      items.push({
        id: 'focus:training-plan:today',
        section: 'focus',
        kind: 'training_plan_today',
        fact: `${remaining} programmed session${remaining === 1 ? '' : 's'} remain this week, and today is a planned Training day.`,
        evidenceRefs: ['training-plan:week'],
        detailPath: '/training',
        actionText: plan.todayRoutineName ? `Complete the planned ${plan.todayRoutineName} session when ready.` : 'Complete the planned Training session when ready.',
        rank: 7,
      })
    } else if (plan.futureTrainingDates.length < remaining) {
      items.push({
        id: 'focus:training-plan:review',
        section: 'focus',
        kind: 'training_plan_review',
        fact: `${remaining} programmed session${remaining === 1 ? '' : 's'} remain, with only ${plan.futureTrainingDates.length} planned Training day${plan.futureTrainingDates.length === 1 ? '' : 's'} left this week.`,
        evidenceRefs: ['training-plan:week'],
        detailPath: '/training/plan',
        actionText: 'Review this week’s Training Plan. Health will not turn an intentional rest day into a missed-workout penalty.',
        rank: 9,
      })
    }
  }

  if (nutrition.loggedDays < WEEKLY_COACH_NUTRITION_MIN_LOGGED) {
    items.push({
      id: 'focus:nutrition-coverage',
      section: 'focus',
      kind: 'nutrition_coverage',
      fact: `Nutrition was logged on ${nutrition.loggedDays} of 7 days.`,
      evidenceRefs: ['nutrition:coverage'],
      detailPath: '/nutrition',
      actionText: NUTRITION_FOCUS,
      rank: 8,
    })
  }
  return items
}

function goalWatchFact(label: string, deadline: string): string {
  if (deadline === 'projected_after_deadline') {
    return `${label} is off track.`
  }
  if (deadline === 'passed_unmet') {
    return `${label} target date has passed and the target is not met.`
  }
  return `${label} has no projection before its deadline.`
}

function proteinTarget(entries: WeeklyCoachInput['nutritionEntries'], targets: WeeklyCoachInput['nutritionTargets'], period: WeeklyPeriod) {
  const days = nutritionDailyObservations({ entries, targets, start: period.start, end: period.end })
  let met = 0
  let known = 0
  for (const day of days) {
    if (day.protein.status !== 'available' || day.protein.value == null || day.target == null) {
      continue
    }
    known += 1
    if (day.protein.value >= day.target.protein) {
      met += 1
    }
  }
  return { met, known }
}

function comparisonText(current: ActivityMetricSummary, prior: ActivityMetricSummary, label: string, unit: string): string {
  const currentValue = availableNumber(current)
  const priorValue = availableNumber(prior)
  if (
    currentValue == null ||
    priorValue == null ||
    current.observedDays < ACTIVITY_SHORT_TERM_MIN_OBSERVED ||
    prior.observedDays < ACTIVITY_SHORT_TERM_MIN_OBSERVED ||
    priorValue <= 0
  ) {
    return ''
  }
  const change = percentChange(currentValue, priorValue)
  if (change == null) {
    return ''
  }
  return ` Compared with the prior 7 days, the completed-day ${label} average was ${Math.round(Math.abs(change))}% ${change >= 0 ? 'higher' : 'lower'} (${formatQuantity(currentValue, 0)}${unit} vs ${formatQuantity(priorValue, 0)}${unit}).`
}

function availableNumber(metric: ActivityMetricSummary): number | null {
  return metric.status === 'available' ? metric.value : null
}

function sharedSource(nights: WeeklyCoachInput['sleepNights'], period: WeeklyPeriod): { key: string; name: string } | null {
  const eligible = nights.filter(
    (night) => night.analysisEligible && night.sleepDate >= period.start && night.sleepDate <= period.end && night.logicalSourceKey,
  )
  const keys = new Set(eligible.map((night) => night.logicalSourceKey))
  if (keys.size !== 1) {
    return null
  }
  const key = [...keys][0]
  if (!key || key === 'unknown') {
    return null
  }
  const named = eligible.find((night) => night.logicalSourceKey === key && night.sourceName)
  return { key, name: named?.sourceName || key }
}

function dated<T extends { date: string }>(rows: readonly T[], end: string): T[] {
  return rows.filter((row) => row.date <= end)
}

function datesIn(period: WeeklyPeriod): string[] {
  const dates: string[] = []
  for (let date = period.start; date <= period.end; date = addCalendarDays(date, 1)) {
    dates.push(date)
  }
  return dates
}

function directionWord(change: number | null): string {
  if (change == null || change === 0) {
    return 'unchanged from'
  }
  return change > 0 ? 'higher than' : 'lower than'
}

function formatQuantity(value: number, digits: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

function formatDuration(minutes: number): string {
  const rounded = Math.round(minutes)
  const hours = Math.floor(rounded / 60)
  const remainder = rounded % 60
  return hours > 0 ? `${hours}h ${remainder}m` : `${remainder}m`
}

function formatSlope(value: number): string {
  return (Math.round(value * 100) / 100).toFixed(2).replace(/\.?0+$/, '')
}

function formatWeight(value: number, unit: string): string {
  if (unit === 'kg') {
    return `${formatQuantity(kilogramsToPounds(value), 1)} lb`
  }
  return `${formatQuantity(value, 1)} ${unit}`
}
