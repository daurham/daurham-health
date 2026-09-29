import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { GoalProjection } from '../src/domain/goal-projection.ts'
import {
  coverageLabel,
  evaluateGoalStatus,
  goalAttentionCandidates,
  goalDeadlineState,
  goalTargetState,
  selectGoalAttention,
  GOAL_STATUS_CALCULATION_VERSION,
  type GoalAttentionItem,
} from '../src/domain/goal-status.ts'
import type { GoalEvidence, GoalKind, GoalStatus, GoalTarget } from '../src/domain/goals.ts'
import type { BenchmarkRetestView } from '../src/domain/lab-retests.ts'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'

const AS_OF = '2026-09-27'

function target(partial: Partial<GoalTarget> = {}): GoalTarget {
  return {
    targetMode: 'at_most',
    targetMin: null,
    targetMax: 175,
    targetUnit: 'lb',
    targetDate: '2026-10-15',
    evaluationWindowDays: null,
    notes: null,
    ...partial,
  }
}

function evidence(current: number | null, partial: Partial<GoalEvidence> = {}): GoalEvidence {
  return {
    current,
    unit: 'lb',
    observedOn: current == null ? null : '2026-09-20',
    difference: null,
    relation: null,
    provisional: null,
    strengthSource: null,
    coverage: null,
    ...partial,
  }
}

function projection(partial: Partial<GoalProjection> = {}): GoalProjection {
  return {
    goalId: 'goal-1',
    goalVersionId: 'version-1',
    goalKind: 'body_metric',
    asOf: AS_OF,
    state: 'available',
    reason: null,
    currentValue: 190,
    targetBoundary: 175,
    targetDate: '2026-10-15',
    unit: 'lb',
    sampleCount: 6,
    spanDays: 40,
    firstObservationDate: '2026-08-01',
    lastObservationDate: '2026-09-20',
    trendPerDay: -0.4,
    trendPerWeek: -2.8,
    trendLowerPerDay: -0.5,
    trendUpperPerDay: -0.2,
    estimatedCrossingDate: '2026-10-05',
    estimatedWindowStart: '2026-10-01',
    estimatedWindowEnd: '2026-10-10',
    maxProjectionDate: '2026-12-26',
    calculationVersion: 'goal-projection-v1',
    ...partial,
  }
}

function input(partial: {
  goalId?: string
  goalVersionId?: string
  goalKind?: GoalKind
  lifecycle?: GoalStatus
  displayName?: string
  target?: GoalTarget
  evidence?: GoalEvidence
  projection?: GoalProjection | null
  asOf?: string
  bodyMetricKey?: string | null
  benchmarkDefinitionId?: string | null
  benchmarkProtocolVersionId?: string | null
  cadence?: { configs: Array<{ metricKey: string; intervalDays: number; enabledFrom: string }>; observations: Array<{ metricKey: string; calendarDate: string; measuredAt: string }> } | null
  retests?: BenchmarkRetestView[] | null
} = {}) {
  return {
    goalId: partial.goalId ?? 'goal-1',
    goalVersionId: partial.goalVersionId ?? 'version-1',
    goalKind: partial.goalKind ?? 'body_metric',
    lifecycle: partial.lifecycle ?? 'active',
    displayName: partial.displayName ?? 'Bodyweight',
    target: partial.target ?? target(),
    evidence: partial.evidence ?? evidence(190),
    projection: partial.projection === undefined ? projection() : partial.projection,
    asOf: partial.asOf ?? AS_OF,
    bodyMetricKey: partial.bodyMetricKey,
    benchmarkDefinitionId: partial.benchmarkDefinitionId,
    benchmarkProtocolVersionId: partial.benchmarkProtocolVersionId,
    cadence: partial.cadence,
    retests: partial.retests,
  }
}

function retest(partial: Partial<BenchmarkRetestView> = {}): BenchmarkRetestView {
  return {
    benchmarkDefinitionId: 'bench',
    benchmarkTitle: 'Push-up capacity',
    protocolVersionId: 'protocol-v1',
    protocolVersion: 1,
    status: 'due',
    latestResult: {
      id: 'result-1',
      resultDate: '2026-08-01',
      primaryValues: [{ requirementId: 'req', label: 'Reps', value: 40, unit: 'reps' }],
    },
    minimumRetestDays: 14,
    suggestedRetestDays: 28,
    minimumDate: '2026-08-15',
    suggestedDate: '2026-08-29',
    daysSinceResult: 57,
    daysUntilMinimum: -43,
    daysUntilSuggested: -29,
    ...partial,
  }
}

function sources(partial: Partial<TodaySources> = {}): TodaySources {
  return {
    now: new Date('2026-09-27T18:00:00.000Z'),
    activityDays: [],
    nutritionEntries: [],
    nutritionTargets: [],
    trainingToday: [],
    trainingSessions: [],
    sleepNights: [],
    latestCompleteSleep: null,
    bodyWeights: [],
    pendingJobs: [],
    ...partial,
  }
}

describe('goal target state', () => {
  it('keeps target comparison separate from a missing observation', () => {
    expect(goalTargetState(target({ targetMode: 'at_least', targetMin: 160, targetMax: null, targetUnit: 'g/day' }), 160)).toBe('satisfied')
    expect(goalTargetState(target({ targetMode: 'at_least', targetMin: 160, targetMax: null }), 159.9)).toBe('below_target')
    expect(goalTargetState(target({ targetMode: 'at_most', targetMax: 175 }), 175)).toBe('satisfied')
    expect(goalTargetState(target({ targetMode: 'at_most', targetMax: 175 }), 175.1)).toBe('above_target')
    expect(goalTargetState(target({ targetMode: 'range', targetMin: 170, targetMax: 180 }), 169)).toBe('outside_range_low')
    expect(goalTargetState(target({ targetMode: 'range', targetMin: 170, targetMax: 180 }), 175)).toBe('satisfied')
    expect(goalTargetState(target({ targetMode: 'range', targetMin: 170, targetMax: 180 }), 181)).toBe('outside_range_high')
    expect(goalTargetState(target(), null)).toBe('unknown')
    expect(goalTargetState(target({ targetMode: 'at_least', targetMin: 10, targetMax: null }), 0)).toBe('below_target')
  })
})

describe('goal deadline state', () => {
  it('calls a projection on track only when the whole window is on or before the deadline', () => {
    const status = evaluateGoalStatus(input({
      projection: projection({ estimatedWindowStart: '2026-10-01', estimatedWindowEnd: '2026-10-10', estimatedCrossingDate: '2026-10-20' }),
      target: target({ targetDate: '2026-10-15' }),
    }))
    expect(status.deadlineState).toBe('projected_before_deadline')
    expect(status.displayStatus).toBe('on_track')
    expect(status.deadlineLabel).toBe('On track')
    expect(status.calculationVersion).toBe(GOAL_STATUS_CALCULATION_VERSION)
    expect(status.lifecycle).toBe('active')
  })

  it('calls a projection off track only when the whole window is after the deadline', () => {
    const status = evaluateGoalStatus(input({
      projection: projection({ estimatedWindowStart: '2026-10-20', estimatedWindowEnd: '2026-11-01' }),
      target: target({ targetDate: '2026-10-15' }),
    }))
    expect(status.deadlineState).toBe('projected_after_deadline')
    expect(status.displayStatus).toBe('off_track')
    expect(status.deadlineLabel).toBe('Off track')
  })

  it('leaves an overlapping window uncertain', () => {
    const status = evaluateGoalStatus(input({
      projection: projection({
        estimatedWindowStart: '2026-10-10',
        estimatedWindowEnd: '2026-10-20',
        estimatedCrossingDate: '2026-10-12',
      }),
      target: target({ targetDate: '2026-10-15' }),
    }))
    expect(status.deadlineState).toBe('projected_overlaps_deadline')
    expect(status.displayStatus).toBe('timing_uncertain')
    expect(status.deadlineLabel).toBe('Projection overlaps target date')
    expect(status.displayStatus).not.toBe('on_track')
    expect(status.displayStatus).not.toBe('off_track')
  })

  it('does not let the central estimate decide an overlapping window', () => {
    const status = evaluateGoalStatus(input({
      projection: projection({
        estimatedWindowStart: '2026-10-20',
        estimatedWindowEnd: '2026-11-20',
        estimatedCrossingDate: '2026-11-03',
      }),
      target: target({ targetDate: '2026-11-05' }),
    }))
    expect(status.deadlineState).toBe('projected_overlaps_deadline')
    expect(status.displayStatus).not.toBe('on_track')
  })

  it.each(['insufficient_data', 'unstable_trend', 'trend_not_toward_target', 'beyond_projection_horizon'] as const)(
    'keeps %s as a missing projection rather than off track',
    (state) => {
      const status = evaluateGoalStatus(input({
        projection: projection({ state, estimatedWindowStart: null, estimatedWindowEnd: null, estimatedCrossingDate: null }),
      }))
      expect(status.deadlineState).toBe('future_no_projection')
      expect(status.displayStatus).not.toBe('off_track')
      expect(status.deadlineLabel).not.toBe('Off track')
    },
  )

  it('has no deadline when the owner did not choose one', () => {
    const status = evaluateGoalStatus(input({ target: target({ targetDate: null }), projection: projection({ targetDate: null }) }))
    expect(status.deadlineState).toBe('none')
    expect(goalDeadlineState(null, AS_OF, 'below_target', projection())).toBe('none')
    expect(status.deadlineLabel).toBeNull()
    expect(status.displayStatus).not.toBe('off_track')
  })
})

describe('goal attention', () => {
  it('leaves a satisfied future goal active and quiet', () => {
    const status = evaluateGoalStatus(input({
      evidence: evidence(170),
      projection: projection({ state: 'target_currently_satisfied', estimatedWindowStart: null, estimatedWindowEnd: null }),
    }))
    expect(status.lifecycle).toBe('active')
    expect(status.targetState).toBe('satisfied')
    expect(status.targetLabel).toBe('Target currently met')
    expect(status.displayStatus).not.toBe('completed')
    expect(goalAttentionCandidates(input({
      evidence: evidence(170),
      projection: projection({ state: 'target_currently_satisfied', estimatedWindowStart: null, estimatedWindowEnd: null }),
    }))).toEqual([])
  })

  it('reports a passed unmet date without claiming a historical miss', () => {
    const items = goalAttentionCandidates(input({
      target: target({ targetDate: '2026-09-26', targetMax: 180 }),
      evidence: evidence(181.4),
    }))
    expect(evaluateGoalStatus(input({
      target: target({ targetDate: '2026-09-26', targetMax: 180 }),
      evidence: evidence(181.4),
    })).deadlineState).toBe('passed_unmet')
    expect(items[0]?.title).toBe('Bodyweight goal target date passed')
    expect(items[0]?.detail).toContain('Current:')
    expect(items[0]?.detail).not.toMatch(/fail|missed/i)
  })

  it('does not remind a passed date that is currently satisfied', () => {
    const status = evaluateGoalStatus(input({
      target: target({ targetDate: '2026-09-26' }),
      evidence: evidence(175),
    }))
    expect(status.deadlineState).toBe('passed_satisfied')
    expect(goalAttentionCandidates(input({
      target: target({ targetDate: '2026-09-26' }),
      evidence: evidence(175),
    }))).toEqual([])
  })

  it('states that an unmet goal is due today', () => {
    const items = goalAttentionCandidates(input({
      target: target({ targetDate: AS_OF }),
      evidence: evidence(190),
    }))
    expect(evaluateGoalStatus(input({ target: target({ targetDate: AS_OF }) })).deadlineState).toBe('due_today')
    expect(items[0]?.title).toBe('Bodyweight goal target date is today')
    expect(items[0]?.detail).not.toMatch(/fail|impossible/i)
  })

  it('uses a seven-day soon threshold', () => {
    const soon = goalAttentionCandidates(input({
      target: target({ targetDate: '2026-10-04' }),
      projection: projection({ state: 'insufficient_data', estimatedWindowStart: null, estimatedWindowEnd: null }),
      evidence: evidence(null),
    }))
    const later = goalAttentionCandidates(input({
      target: target({ targetDate: '2026-10-05' }),
      projection: projection({ state: 'insufficient_data', estimatedWindowStart: null, estimatedWindowEnd: null }),
      evidence: evidence(null),
    }))
    expect(soon.map((item) => item.kind)).toEqual(['deadline_soon'])
    expect(later).toEqual([])
  })

  it('does not remind a soon deadline when the whole window is before it', () => {
    const status = evaluateGoalStatus(input({
      target: target({ targetDate: '2026-10-02' }),
      projection: projection({ estimatedWindowStart: '2026-09-28', estimatedWindowEnd: '2026-10-02' }),
    }))
    expect(status.displayStatus).toBe('on_track')
    expect(goalAttentionCandidates(input({
      target: target({ targetDate: '2026-10-02' }),
      projection: projection({ estimatedWindowStart: '2026-09-28', estimatedWindowEnd: '2026-10-02' }),
    }))).toEqual([])
  })

  it('reminds when a soon deadline is after the whole projection window', () => {
    const items = goalAttentionCandidates(input({
      target: target({ targetDate: '2026-10-02' }),
      projection: projection({ estimatedWindowStart: '2026-10-20', estimatedWindowEnd: '2026-11-01' }),
    }))
    expect(items[0]?.kind).toBe('deadline_soon')
    expect(items[0]?.title).toContain('in 5 days')
    expect(items[0]?.detail).not.toMatch(/fail|speed up|cut /i)
  })

  it('uses current-window language for protein and only nags inside seven days', () => {
    const far = input({
      goalKind: 'nutrition_protein',
      displayName: 'Protein',
      target: target({ targetMode: 'at_least', targetMin: 160, targetMax: null, targetUnit: 'g/day', targetDate: '2026-10-27', evaluationWindowDays: 7 }),
      evidence: evidence(151, { unit: 'g/day', coverage: { observedDays: 5, windowDays: 7, takenDays: 0, skippedDays: 0, unknownDays: 2, partialNights: 0 } }),
      projection: projection({ goalKind: 'nutrition_protein', state: 'not_applicable', estimatedWindowStart: null, estimatedWindowEnd: null }),
    })
    const near = input({
      ...far,
      target: target({ targetMode: 'at_least', targetMin: 160, targetMax: null, targetUnit: 'g/day', targetDate: '2026-10-01', evaluationWindowDays: 7 }),
    })
    expect(evaluateGoalStatus(far).targetLabel).toBe('Current window below target')
    expect(evaluateGoalStatus(far).displayStatus).not.toBe('off_track')
    expect(goalAttentionCandidates(far)).toEqual([])
    const items = goalAttentionCandidates(near)
    expect(items[0]?.kind).toBe('deadline_soon')
    expect(items[0]?.detail).toContain('151')
    expect(items[0]?.detail).not.toMatch(/eat|calorie|diet/i)
  })

  it('reuses a due body cadence and stays quiet without one', () => {
    const due = goalAttentionCandidates(input({
      displayName: 'Waist',
      bodyMetricKey: 'waist_circumference',
      target: target({ targetDate: '2026-12-31', targetUnit: 'in', targetMax: 34 }),
      evidence: evidence(35, { unit: 'in' }),
      projection: projection({ estimatedWindowEnd: '2026-11-01' }),
      cadence: {
        configs: [{ metricKey: 'waist_circumference', intervalDays: 14, enabledFrom: '2026-01-01' }],
        observations: [{ metricKey: 'waist_circumference', calendarDate: '2026-09-13', measuredAt: '2026-09-13T15:00:00.000Z' }],
      },
    }))
    const quiet = goalAttentionCandidates(input({
      bodyMetricKey: 'waist_circumference',
      target: target({ targetDate: '2026-12-31' }),
      projection: projection({ estimatedWindowEnd: '2026-11-01' }),
      cadence: { configs: [], observations: [] },
    }))
    expect(due.map((item) => item.key)).toEqual(['body_metric_due:waist_circumference'])
    expect(due[0]?.title).toBe('Waist measurement due')
    expect(due[0]?.detail).toBe('Supports your Waist goal.')
    expect(quiet).toEqual([])
  })

  it('prefers the cadence action over a generic soon deadline', () => {
    const items = goalAttentionCandidates(input({
      bodyMetricKey: 'waist_circumference',
      evidence: evidence(null),
      target: target({ targetDate: '2026-10-01' }),
      projection: projection({ state: 'insufficient_data', estimatedWindowStart: null, estimatedWindowEnd: null }),
      cadence: {
        configs: [{ metricKey: 'waist_circumference', intervalDays: 14, enabledFrom: '2026-01-01' }],
        observations: [],
      },
    }))
    expect(items.map((item) => item.kind)).toEqual(['measurement_due'])
  })

  it('annotates a due pinned retest and ignores an available or newer protocol', () => {
    const due = goalAttentionCandidates(input({
      goalKind: 'benchmark_result',
      displayName: '80-rep',
      benchmarkDefinitionId: 'bench',
      benchmarkProtocolVersionId: 'protocol-v1',
      target: target({ targetMode: 'at_least', targetMin: 80, targetMax: null, targetUnit: 'reps', targetDate: '2026-12-31' }),
      evidence: evidence(40, { unit: 'reps' }),
      projection: projection({ goalKind: 'benchmark_result', state: 'not_applicable', estimatedWindowStart: null, estimatedWindowEnd: null }),
      retests: [retest()],
    }))
    const available = goalAttentionCandidates(input({
      goalKind: 'benchmark_result',
      benchmarkDefinitionId: 'bench',
      benchmarkProtocolVersionId: 'protocol-v1',
      target: target({ targetMode: 'at_least', targetMin: 80, targetMax: null, targetUnit: 'reps', targetDate: '2026-12-31' }),
      evidence: evidence(40, { unit: 'reps' }),
      projection: projection({ state: 'not_applicable', estimatedWindowStart: null, estimatedWindowEnd: null }),
      retests: [retest({ status: 'available' }), retest({ protocolVersionId: 'protocol-v2', protocolVersion: 2, status: 'due' })],
    }))
    expect(due[0]?.key).toBe('benchmark_retest_due:bench/protocol-v1')
    expect(due[0]?.detail).toBe('Supports your 80-rep goal.')
    expect(available).toEqual([])
  })

  it('does not add a supplement, training, activity, or sleep coaching action', () => {
    const shared = {
      target: target({ targetMode: 'at_least', targetMin: 1, targetMax: null, targetDate: '2026-10-01' }),
      evidence: evidence(0),
      projection: projection({ state: 'not_applicable', estimatedWindowStart: null, estimatedWindowEnd: null }),
    }
    const kinds: GoalKind[] = ['supplement_adherence', 'training_frequency', 'activity_steps', 'sleep_duration', 'strength_e1rm']
    const items = kinds.flatMap((goalKind) => goalAttentionCandidates(input({ ...shared, goalKind, displayName: goalKind })))
    expect(items.every((item) => item.kind === 'deadline_soon' || item.kind === 'deadline_today' || item.kind === 'deadline_passed')).toBe(true)
    expect(JSON.stringify(items)).not.toMatch(/walk more|eat more|sleep more|go to bed|train today|train harder|increase dose|you failed/i)
    expect(goalAttentionCandidates(input({
      goalKind: 'strength_e1rm',
      target: target({ targetDate: '2026-12-31' }),
      projection: projection({ goalKind: 'strength_e1rm', estimatedWindowEnd: '2026-11-01' }),
    }))).toEqual([])
    expect(evaluateGoalStatus(input({
      goalKind: 'supplement_adherence',
      evidence: evidence(null),
      projection: projection({ state: 'not_applicable', estimatedWindowStart: null, estimatedWindowEnd: null }),
      target: target({ targetDate: null }),
    })).targetState).toBe('unknown')
  })

  it('suppresses goal attention when paused or completed and restores it when active', () => {
    const paused = evaluateGoalStatus(input({ lifecycle: 'paused' }))
    const completed = evaluateGoalStatus(input({ lifecycle: 'completed' }))
    expect(paused.displayStatus).toBe('paused')
    expect(paused.deadlineLabel).toBeNull()
    expect(completed.displayStatus).toBe('completed')
    expect(goalAttentionCandidates(input({ lifecycle: 'paused', target: target({ targetDate: '2026-09-26' }) }))).toEqual([])
    expect(goalAttentionCandidates(input({ lifecycle: 'completed', target: target({ targetDate: AS_OF }) }))).toEqual([])
    expect(evaluateGoalStatus(input()).displayStatus).toBe('on_track')
  })

  it('caps and ranks goal attention deterministically', () => {
    const passed = (id: string, date: string): GoalAttentionItem => ({
      key: `goal_deadline:${id}`,
      goalId: id,
      kind: 'deadline_passed',
      rank: 1,
      targetDate: date,
      dueDate: date,
      title: id,
      detail: 'Current target not met',
      href: `/goals/${id}`,
      action: 'View goal',
    })
    const selected = selectGoalAttention([
      passed('b', '2026-09-20'),
      passed('a', '2026-09-20'),
      passed('c', '2026-09-10'),
      passed('d', '2026-09-25'),
    ])
    expect(selected.map((item) => item.goalId)).toEqual(['c', 'a'])
    const ranked = selectGoalAttention([
      { ...passed('soon', '2026-10-01'), kind: 'deadline_soon', rank: 4, key: 'goal_deadline:soon' },
      { ...passed('due', '2026-09-27'), kind: 'measurement_due', rank: 3, key: 'body_metric_due:weight' },
      { ...passed('today', '2026-09-27'), kind: 'deadline_today', rank: 2, key: 'goal_deadline:today' },
      passed('passed', '2026-09-01'),
    ], 4)
    expect(ranked.map((item) => item.kind)).toEqual(['deadline_passed', 'deadline_today', 'measurement_due', 'deadline_soon'])
  })

  it('keeps review work ahead of a goal deadline and absorbs a matching body reminder', () => {
    const attention: GoalAttentionItem = {
      key: 'body_metric_due:waist_circumference',
      goalId: 'goal-1',
      kind: 'measurement_due',
      rank: 3,
      targetDate: '2026-12-31',
      dueDate: '2026-09-27',
      title: 'Waist measurement due',
      detail: 'Supports your Waist goal.',
      href: '/body?action=measure&metric=waist_circumference',
      action: 'Measure',
    }
    const deadline: GoalAttentionItem = {
      key: 'goal_deadline:goal-2',
      goalId: 'goal-2',
      kind: 'deadline_passed',
      rank: 1,
      targetDate: '2026-09-20',
      dueDate: '2026-09-20',
      title: 'Bodyweight goal target date passed',
      detail: 'Current: 181.4 lb Target: ≤ 180 lb',
      href: '/goals/goal-2',
      action: 'View goal',
    }
    const view = buildTodayView(sources({
      pendingJobs: [{ id: 'job-1', kind: 'workout_transcription', status: 'completed' }],
      bodyCadence: {
        configs: [{ metricKey: 'waist_circumference', intervalDays: 14, enabledFrom: '2026-01-01' }],
        observations: [{ metricKey: 'waist_circumference', calendarDate: '2026-09-13', measuredAt: '2026-09-13T15:00:00.000Z' }],
      },
      goalAttention: [deadline, attention],
    }))
    expect(view.pendingItems.map((item) => item.title)).toEqual(['Workout sheet needs verification'])
    expect(view.body.goalSupport).toBe('Supports your Waist goal.')
    expect(view.goalAttention.map((item) => item.key)).toEqual(['goal_deadline:goal-2'])
    expect(view.body.measurementDue?.metricKey).toBe('waist_circumference')
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(TodayBoard, { view })))
    expect(html.indexOf('Workout sheet needs verification')).toBeGreaterThan(-1)
    expect(html.indexOf('Workout sheet needs verification')).toBeLessThan(html.indexOf('Bodyweight goal target date passed'))
    expect(html.match(/Waist measurement due/g)?.length).toBe(1)
  })

  it('leaves an independent body reminder when the goal is not annotating it', () => {
    const view = buildTodayView(sources({
      bodyCadence: {
        configs: [{ metricKey: 'waist_circumference', intervalDays: 14, enabledFrom: '2026-01-01' }],
        observations: [{ metricKey: 'waist_circumference', calendarDate: '2026-09-13', measuredAt: '2026-09-13T15:00:00.000Z' }],
      },
    }))
    expect(view.body.measurementDue?.metricKey).toBe('waist_circumference')
    expect(view.body.goalSupport).toBeNull()
    expect(view.goalAttention).toEqual([])
  })

  it('describes aggregate coverage without hiding the denominator', () => {
    expect(coverageLabel('training_frequency', evidence(2, { coverage: { observedDays: 2, windowDays: 7, takenDays: 0, skippedDays: 0, unknownDays: 0, partialNights: 0 } }), 3)).toBe(
      '2 / 3 sessions this 7-day window',
    )
    expect(coverageLabel('nutrition_protein', evidence(154, { coverage: { observedDays: 5, windowDays: 7, takenDays: 0, skippedDays: 0, unknownDays: 2, partialNights: 0 } }))).toBe(
      '5 logged days',
    )
    expect(coverageLabel('supplement_adherence', evidence(85.7, { coverage: { observedDays: 14, windowDays: 30, takenDays: 12, skippedDays: 2, unknownDays: 4, partialNights: 0 } }))).toBe(
      '12 taken / 14 resolved days',
    )
  })

  it('recomputes from the evidence it is given', () => {
    const before = evaluateGoalStatus(input({ evidence: evidence(190) }))
    const after = evaluateGoalStatus(input({ evidence: evidence(170), projection: projection({ state: 'target_currently_satisfied', estimatedWindowStart: null, estimatedWindowEnd: null }) }))
    const revised = evaluateGoalStatus(input({
      goalVersionId: 'version-2',
      target: target({ targetDate: '2026-10-01' }),
      projection: projection({ estimatedWindowStart: '2026-10-20', estimatedWindowEnd: '2026-11-01', targetDate: '2026-10-01' }),
    }))
    expect(before.targetState).toBe('above_target')
    expect(after.targetState).toBe('satisfied')
    expect(revised.goalVersionId).toBe('version-2')
    expect(revised.deadlineState).toBe('projected_after_deadline')
  })

  it('stays derived, without coaching copy or a status table', () => {
    const status = readFileSync('src/domain/goal-status.ts', 'utf8')
    const service = readFileSync('server/goals/service.ts', 'utf8')
    const inventory = readFileSync('server/backup/inventory.ts', 'utf8')
    const today = readFileSync('server/today/service.ts', 'utf8')
    expect(status).toContain('goal-status-v1')
    expect(status).not.toContain('gemini')
    expect(status).not.toContain('INSERT')
    expect(status).not.toMatch(/walk_more|eat_more_protein|sleep_more/)
    expect(service.slice(service.indexOf('async function deriveGoalStatus'))).not.toContain('INSERT')
    expect(today).toContain('goalAttentionForToday')
    expect(inventory).not.toContain('goal_status')
    expect(inventory).toContain("name: 'goals'")
    expect(inventory).toContain('0037_coach_lab_snoozes.sql')
  })
})
