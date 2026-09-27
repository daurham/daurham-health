import { describe, expect, it } from 'vitest'
import { buildProgressTimeline } from '../src/domain/progress/timeline.ts'
import {
  classifyExperimentResult,
  emptyCriteria,
  evaluateExperiment,
  experimentEvidenceFingerprint,
  FINAL_OBSERVATION_DAY_MESSAGE,
  experimentNeedsReview,
  experimentStatusForClassification,
  fingerprintMaterial,
  parseResultAttestation,
  resolveFinalizationWindow,
  summarizeAdherence,
  type ExperimentEvidence,
  type ExperimentRequirementSpec,
} from '../src/domain/experiment-results.ts'

const REQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function requirement(overrides: Partial<ExperimentRequirementSpec> = {}): ExperimentRequirementSpec {
  return {
    id: REQ,
    role: 'primary_outcome',
    requirementKind: 'body_metric',
    selector: { metricKey: 'waist_circumference' },
    label: 'Waist circumference',
    required: true,
    criteria: emptyCriteria(),
    ...overrides,
  }
}

function evidence(overrides: Partial<ExperimentEvidence> = {}): ExperimentEvidence {
  return {
    benchmarks: [],
    training: [],
    body: [],
    nutrition: [],
    activity: [],
    sleep: [],
    adherence: [],
    context: [],
    contextControls: [],
    ...overrides,
  }
}

function evaluate(overrides: Partial<Parameters<typeof evaluateExperiment>[0]> = {}) {
  return evaluateExperiment({
    windowStart: '2026-09-01',
    plannedWindowEnd: '2026-09-03',
    effectiveEndDate: '2026-09-03',
    windowOpen: false,
    protocolFollowed: 'followed',
    stoppedForSafety: false,
    requirements: [requirement()],
    evidence: evidence({
      body: [
        { measurementId: 'm1', calendarDate: '2026-09-01', metricKey: 'waist_circumference', value: 96.3, unit: 'cm' },
        { measurementId: 'm2', calendarDate: '2026-09-03', metricKey: 'waist_circumference', value: 94.8, unit: 'cm' },
      ],
    }),
    ...overrides,
  })
}

describe('experiment result classification', () => {
  it('uses deterministic precedence', () => {
    const missing = { required: true, role: 'primary_outcome', requirementKind: 'body_metric', evaluationStatus: 'missing' as const, criterionStatus: 'not_configured' as const }
    const fail = { required: true, role: 'adherence', requirementKind: 'supplement_adherence', evaluationStatus: 'available' as const, criterionStatus: 'fail' as const }
    const available = { required: true, role: 'primary_outcome', requirementKind: 'body_metric', evaluationStatus: 'available' as const, criterionStatus: 'not_configured' as const }
    expect(classifyExperimentResult({ stoppedForSafety: true, protocolFollowed: 'followed', windowOpen: false, requirements: [missing] })).toBe('stopped_safety')
    expect(classifyExperimentResult({ stoppedForSafety: false, protocolFollowed: 'not_followed', windowOpen: false, requirements: [fail] })).toBe('invalid_protocol')
    expect(classifyExperimentResult({ stoppedForSafety: false, protocolFollowed: 'followed', windowOpen: true, requirements: [available] })).toBe('window_in_progress')
    expect(classifyExperimentResult({ stoppedForSafety: false, protocolFollowed: 'followed', windowOpen: false, requirements: [missing] })).toBe('incomplete')
    expect(classifyExperimentResult({ stoppedForSafety: false, protocolFollowed: 'uncertain', windowOpen: false, requirements: [available] })).toBe('inconclusive')
    expect(classifyExperimentResult({ stoppedForSafety: false, protocolFollowed: 'followed', windowOpen: false, requirements: [available, fail] })).toBe('completed_low_adherence')
    expect(classifyExperimentResult({ stoppedForSafety: false, protocolFollowed: 'followed', windowOpen: false, requirements: [available] })).toBe('completed_interpretable')
  })

  it('maps classifications onto experiment status', () => {
    expect(experimentStatusForClassification('completed_interpretable')).toBe('completed')
    expect(experimentStatusForClassification('completed_low_adherence')).toBe('completed')
    expect(experimentStatusForClassification('incomplete')).toBe('inconclusive')
    expect(experimentStatusForClassification('inconclusive')).toBe('inconclusive')
    expect(experimentStatusForClassification('invalid_protocol')).toBe('inconclusive')
    expect(experimentStatusForClassification('stopped_safety')).toBe('inconclusive')
  })

  it('does not treat required context as missing evidence', () => {
    const result = evaluate({
      requirements: [
        requirement(),
        requirement({
          id: 'context-1',
          role: 'context',
          requirementKind: 'context_tag',
          selector: { tagKey: 'travel' },
          label: 'Travel',
          required: true,
        }),
      ],
      evidence: evidence({
        body: [{ measurementId: 'm1', calendarDate: '2026-09-01', metricKey: 'waist_circumference', value: 96.3, unit: 'cm' }],
        context: [{ date: '2026-09-02', tags: ['travel'] }],
        contextControls: [{ tagKey: 'travel' }],
      }),
    })
    expect(result.classification).toBe('completed_interpretable')
    expect(result.contextControls[0]).toMatchObject({ tagKey: 'travel', recordedDayCount: 1 })
    const quiet = evaluate({
      requirements: [requirement({ role: 'context', requirementKind: 'context_tag', selector: { tagKey: 'travel' }, label: 'Travel' })],
      evidence: evidence(),
    })
    expect(quiet.classification).toBe('completed_interpretable')
    expect(quiet.limitations.join(' ')).not.toMatch(/did not occur|confounded/i)
  })
})

describe('experiment finalization window', () => {
  const base = { windowStart: '2026-09-01', windowEnd: '2026-09-10', protocolFollowed: 'followed' as const, stoppedForSafety: false, effectiveEndDate: null }
  it('waits until the day after the inclusive window closes', () => {
    expect(resolveFinalizationWindow({ ...base, today: '2026-09-09' })).toEqual({ state: 'window_in_progress', finalDay: false })
    expect(resolveFinalizationWindow({ ...base, today: '2026-09-10' })).toEqual({ state: 'window_in_progress', finalDay: true })
    expect(resolveFinalizationWindow({ ...base, today: '2026-09-11' })).toMatchObject({ effectiveEndDate: '2026-09-10', early: false })
    expect(resolveFinalizationWindow({ ...base, today: '2026-09-12' })).toMatchObject({ effectiveEndDate: '2026-09-10', early: false })
  })

  it('allows an attested early stop inside the planned window', () => {
    expect(resolveFinalizationWindow({ ...base, today: '2026-09-05', stoppedForSafety: true, effectiveEndDate: '2026-09-05' })).toMatchObject({
      effectiveEndDate: '2026-09-05',
      early: true,
    })
    expect(resolveFinalizationWindow({ ...base, today: '2026-09-05', protocolFollowed: 'not_followed', effectiveEndDate: '2026-09-04' })).toMatchObject({
      early: true,
    })
    expect(resolveFinalizationWindow({ ...base, today: '2026-09-05', stoppedForSafety: true, effectiveEndDate: '2026-08-31' })).toEqual({
      error: 'The end date must fall inside the planned window and not after today.',
    })
    expect(resolveFinalizationWindow({ ...base, today: '2026-09-05', stoppedForSafety: true, effectiveEndDate: '2026-09-10' })).toEqual({
      error: 'The end date must fall inside the planned window and not after today.',
    })
    expect(resolveFinalizationWindow({ ...base, today: '2026-09-12', stoppedForSafety: true, effectiveEndDate: '2026-09-13' })).toEqual({
      error: 'The end date must fall inside the planned window and not after today.',
    })
    expect(resolveFinalizationWindow({ ...base, today: '2026-09-05', stoppedForSafety: true, effectiveEndDate: null })).toEqual({
      error: 'An early stop needs the date the experiment ended.',
    })
    expect(resolveFinalizationWindow({ ...base, today: '2026-09-10', stoppedForSafety: true, effectiveEndDate: '2026-09-10' })).toMatchObject({
      effectiveEndDate: '2026-09-10',
      early: true,
    })
    expect(resolveFinalizationWindow({ ...base, today: '2026-09-10', protocolFollowed: 'not_followed', effectiveEndDate: '2026-09-10' })).toMatchObject({
      early: true,
    })
  })

  it('keeps the final observation day out of an ordinary result', () => {
    const open = evaluate({
      windowOpen: true,
      finalObservationDay: true,
      effectiveEndDate: null,
      requirements: [requirement({ requirementKind: 'activity_metric', selector: { metricKey: 'steps_count' }, label: 'Steps' })],
      evidence: evidence({
        activity: [{ date: '2026-09-03', metricKey: 'steps_count', value: 1200 }],
      }),
    })
    expect(open.state).toBe('window_in_progress')
    expect(open.canCommit).toBe(false)
    expect(open.classification).toBeNull()
    expect(open.message).toBe(FINAL_OBSERVATION_DAY_MESSAGE)
    const closed = evaluate({
      requirements: [requirement({ requirementKind: 'activity_metric', selector: { metricKey: 'steps_count' }, label: 'Steps' })],
      evidence: evidence({
        activity: [
          { date: '2026-09-03', metricKey: 'steps_count', value: 1200 },
          { date: '2026-09-04', metricKey: 'steps_count', value: 9999 },
        ],
      }),
    })
    expect(closed.canCommit).toBe(true)
    expect(closed.requirements[0]?.summary).toMatchObject({ observedDays: 1, average: 1200 })
  })
})

describe('experiment adherence', () => {
  it('keeps unknown, skipped, and paused distinct', () => {
    const summary = summarizeAdherence([
      { date: '2026-09-01', state: 'taken' },
      { date: '2026-09-02', state: 'skipped' },
      { date: '2026-09-03', state: 'unknown' },
      { date: '2026-09-04', state: 'paused' },
      { date: '2026-09-05', state: 'not_scheduled' },
    ])
    expect(summary).toMatchObject({ scheduledDays: 3, takenDays: 1, skippedDays: 1, unknownDays: 1, resolvedDays: 2 })
    expect(summary.adherencePercent).toBe(50)
    expect(summary.coveragePercent).toBeCloseTo(66.666667, 5)
  })

  it('fails an explicit adherence threshold only after coverage is complete', () => {
    const days = [
      { date: '2026-09-01', state: 'taken' as const },
      { date: '2026-09-02', state: 'skipped' as const },
      { date: '2026-09-03', state: 'unknown' as const },
    ]
    const lowCoverage = evaluate({
      requirements: [
        requirement({
          role: 'adherence',
          requirementKind: 'supplement_adherence',
          selector: { supplementId: 'sup' },
          label: 'Creatine',
          criteria: { ...emptyCriteria(), minimumAdherencePercent: 80 },
        }),
      ],
      evidence: evidence({ adherence: [{ supplementId: 'sup', name: 'Creatine', days }] }),
    })
    expect(lowCoverage.requirements[0]?.evaluationStatus).toBe('insufficient')
    expect(lowCoverage.classification).toBe('incomplete')
    const resolved = [
      { date: '2026-09-01', state: 'taken' as const },
      { date: '2026-09-02', state: 'taken' as const },
      { date: '2026-09-03', state: 'skipped' as const },
    ]
    const lowAdherence = evaluate({
      requirements: [
        requirement({
          role: 'adherence',
          requirementKind: 'supplement_adherence',
          selector: { supplementId: 'sup' },
          label: 'Creatine',
          criteria: { ...emptyCriteria(), minimumAdherencePercent: 80 },
        }),
      ],
      evidence: evidence({ adherence: [{ supplementId: 'sup', name: 'Creatine', days: resolved }] }),
    })
    expect(lowAdherence.requirements[0]?.criterionStatus).toBe('fail')
    expect(lowAdherence.classification).toBe('completed_low_adherence')
  })
})

describe('experiment outcome evidence', () => {
  it('summarizes body change without a cause', () => {
    const result = evaluate()
    expect(result.classification).toBe('completed_interpretable')
    expect(result.requirements[0]?.summary).toMatchObject({ observationCount: 2, absoluteChange: -1.5 })
    expect(JSON.stringify(result)).not.toMatch(/caused|improved|worsened/i)
  })

  it('averages observed nutrition and sleep days and ignores ineligible nights', () => {
    const result = evaluate({
      requirements: [
        requirement({ requirementKind: 'nutrition_metric', selector: { metricKey: 'calories' }, label: 'Calories' }),
        requirement({ id: 'sleep', requirementKind: 'sleep_metric', selector: { metricKey: 'total_sleep_minutes' }, label: 'Sleep' }),
      ],
      evidence: evidence({
        nutrition: [
          { date: '2026-09-01', metricKey: 'calories', value: 2000 },
          { date: '2026-09-02', metricKey: 'calories', value: null },
        ],
        sleep: [
          { date: '2026-09-01', metricKey: 'total_sleep_minutes', value: 400, eligible: true },
          { date: '2026-09-02', metricKey: 'total_sleep_minutes', value: 0, eligible: false },
        ],
      }),
    })
    const nutrition = result.requirements.find((item) => item.requirementKind === 'nutrition_metric')
    const sleep = result.requirements.find((item) => item.requirementKind === 'sleep_metric')
    expect(nutrition?.summary).toMatchObject({ observedDays: 1, windowDays: 3, average: 2000 })
    expect(sleep?.summary).toMatchObject({ observedDays: 1, average: 400 })
    expect(sleep?.summary.average).not.toBe(0)
  })

  it('uses only training sessions linked to the experiment', () => {
    const result = evaluate({
      requirements: [
        requirement({
          requirementKind: 'training_measure',
          selector: { exerciseDefinitionId: 'ex', measure: 'total_reps' },
          label: 'Push-ups',
        }),
      ],
      evidence: evidence({
        training: [
          {
            id: 'session-other',
            workoutDate: '2026-09-02',
            experimentId: null,
            exercises: [],
          },
        ],
      }),
    })
    expect(result.requirements[0]?.evaluationStatus).toBe('missing')
  })

  it('compares a prior same-protocol benchmark and refuses mixed versions', () => {
    const prior = {
      id: 'prior',
      benchmarkDefinitionId: 'bench',
      benchmarkTitle: 'Push-up capacity',
      protocolVersionId: 'proto',
      protocolVersion: 1,
      resultDate: '2026-08-01',
      createdAt: '2026-08-01T00:00:00.000Z',
      experimentId: null,
      status: 'valid',
      primaryValues: [{ requirementId: 'out', label: 'Reps', value: 67, unit: 'reps' }],
    }
    const current = { ...prior, id: 'current', resultDate: '2026-09-02', createdAt: '2026-09-02T00:00:00.000Z', experimentId: 'exp', primaryValues: [{ requirementId: 'out', label: 'Reps', value: 81, unit: 'reps' }] }
    const otherVersion = { ...current, id: 'other', protocolVersionId: 'proto-2' }
    const matched = evaluate({
      requirements: [
        requirement({
          requirementKind: 'benchmark_definition',
          selector: { benchmarkDefinitionId: 'bench', benchmarkProtocolVersionId: 'proto' },
          label: 'Push-up capacity',
        }),
      ],
      evidence: evidence({ benchmarks: [prior, current] }),
    })
    expect(matched.requirements[0]?.summary.deltas).toEqual([
      expect.objectContaining({ previousValue: 67, nextValue: 81, absolute: 14 }),
    ])
    const mixed = evaluate({
      requirements: [
        requirement({
          requirementKind: 'benchmark_definition',
          selector: { benchmarkDefinitionId: 'bench' },
          label: 'Push-up capacity',
        }),
      ],
      evidence: evidence({ benchmarks: [current, otherVersion] }),
    })
    expect(mixed.requirements[0]?.evaluationStatus).toBe('unsupported')
    expect(mixed.classification).toBe('inconclusive')
  })
})

describe('experiment result review state', () => {
  it('asks for review only after the window ends without a valid result', () => {
    expect(experimentNeedsReview({ status: 'active', windowEnd: '2026-09-10', today: '2026-09-09', hasValidResult: false })).toBe(false)
    expect(experimentNeedsReview({ status: 'active', windowEnd: '2026-09-10', today: '2026-09-10', hasValidResult: false })).toBe(false)
    expect(experimentNeedsReview({ status: 'active', windowEnd: '2026-09-10', today: '2026-09-11', hasValidResult: false })).toBe(true)
    expect(experimentNeedsReview({ status: 'completed', windowEnd: '2026-09-10', today: '2026-09-12', hasValidResult: true })).toBe(false)
    expect(experimentNeedsReview({ status: 'active', windowEnd: '2026-09-10', today: '2026-09-12', hasValidResult: false })).toBe(true)
  })

  it('rejects a client-supplied classification', () => {
    expect(parseResultAttestation({ protocolFollowed: 'followed', classification: 'completed_interpretable' })).toEqual({
      error: 'Experiment result values come from canonical evidence.',
    })
    expect(parseResultAttestation({ protocolFollowed: 'followed', stoppedForSafety: false })).toMatchObject({
      protocolFollowed: 'followed',
      safetyReason: null,
      ownerNote: null,
    })
  })

  it('fingerprints the same evidence the same way', async () => {
    const result = evaluate()
    const material = fingerprintMaterial({
      experimentId: 'exp',
      protocolVersionId: 'proto',
      windowStart: result.windowStart,
      plannedWindowEnd: result.plannedWindowEnd,
      effectiveEndDate: result.effectiveEndDate ?? result.plannedWindowEnd,
      requirements: [requirement()],
      evaluation: result,
      protocolFollowed: 'followed',
      stoppedForSafety: false,
      safetyReason: null,
    })
    const first = await experimentEvidenceFingerprint(material)
    const second = await experimentEvidenceFingerprint(material)
    expect(first).toBe(second)
    expect(first).toMatch(/^[a-f0-9]{64}$/)
  })
})

describe('experiment result timeline', () => {
  it('remembers a valid result on its effective end date and skips an invalidated one', () => {
    const timeline = buildProgressTimeline({
      asOf: '2026-09-26',
      range: 'all',
      exercises: [],
      workouts: [],
      sets: [],
      bodyObservations: [],
      checkpoints: [],
      nutritionEntries: [],
      nutritionTargets: [],
      experimentResults: [
        {
          id: 'result-1',
          title: 'Push-up capacity test',
          classification: 'completed_interpretable',
          effectiveEndDate: '2026-09-10',
          status: 'valid',
        },
        {
          id: 'result-2',
          title: 'Old',
          classification: 'incomplete',
          effectiveEndDate: '2026-09-10',
          status: 'invalidated',
        },
      ],
    })
    const event = timeline.events.find((item) => item.kind === 'experiment_result')
    expect(event).toMatchObject({
      date: '2026-09-10',
      timePrecision: 'date',
      data: { classificationTitle: 'Completed · Interpretable' },
    })
    expect(timeline.events.some((item) => item.id === 'experiment_result:result-2')).toBe(false)
    expect(timeline.series.bodyWeight).toEqual([])
  })
})
