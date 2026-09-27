import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { evaluateOutcome, type EvidencePool, type TrainingSessionEvidence } from '../src/domain/lab-evaluators.ts'
import {
  benchmarkOutcomeRoleError,
  canonicalEvidenceJson,
  compareBenchmarkResults,
  composeBenchmarkPreview,
  evidenceFingerprint,
  experimentLinkError,
  latestValidBenchmarkResult,
  parseResultRequest,
  protocolChangeNote,
  protocolMismatchError,
  sameProtocolValueDelta,
  visibleBenchmarkResults,
  type ResultRequest,
} from '../src/domain/lab-results.ts'
import { buildProgressTimeline, timelineEventsForFocus, timelineSeriesForFocus } from '../src/domain/progress/index.ts'
import type { OutcomeRequirement } from '../src/domain/lab-evaluators.ts'

const REQ = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const REQ_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const EXERCISE = '66666666-6666-4666-8666-666666666666'
const SESSION = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SESSION_B = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd'
const VERSION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
const BENCHMARK = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
const MEASURE = '12121212-1212-4121-8121-121212121212'
const MEASURE_B = '13131313-1313-4131-8131-131313131313'

function request(overrides: Partial<ResultRequest> = {}): ResultRequest {
  return {
    protocolVersionId: VERSION,
    workoutSessionId: null,
    measurementId: null,
    date: null,
    evidenceSelections: {},
    ownerAttested: false,
    experimentId: null,
    supersedesResultId: null,
    ...overrides,
  }
}

function requirement(overrides: Partial<OutcomeRequirement> & Pick<OutcomeRequirement, 'requirementKind' | 'selector'>): OutcomeRequirement {
  return {
    id: REQ,
    role: 'primary_outcome',
    label: 'Outcome',
    ...overrides,
  }
}

function session(overrides: Partial<TrainingSessionEvidence> = {}): TrainingSessionEvidence {
  return {
    sessionId: SESSION,
    workoutDate: '2026-09-26',
    sessionType: 'experiment',
    sessionName: null,
    experimentId: 'abababab-abab-4aba-8aba-abababababab',
    benchmarkProtocolVersionId: VERSION,
    exerciseDefinitionId: EXERCISE,
    exerciseName: 'Push-up',
    measurementKind: 'reps',
    analyticsRepMode: 'standard',
    sets: [
      set('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1', 1, 'working', 22),
      set('d2d2d2d2-d2d2-42d2-82d2-d2d2d2d2d2d2', 2, 'working', 18),
      set('d3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3', 3, 'working', 15),
      set('d4d4d4d4-d4d4-44d4-84d4-d4d4d4d4d4d4', 4, 'working', 12),
      set('d5d5d5d5-d5d5-45d5-85d5-d5d5d5d5d5d5', 5, 'warmup', 8),
    ],
    ...overrides,
  }
}

function set(setId: string, setNumber: number, setType: string, reps: number | null, durationSec: number | null = null): TrainingSessionEvidence['sets'][number] {
  return {
    setId,
    setNumber,
    setType,
    reps,
    durationSec,
    leftReps: null,
    rightReps: null,
    leftDurationSec: null,
    rightDurationSec: null,
  }
}

function pool(overrides: Partial<EvidencePool> = {}): EvidencePool {
  return {
    training: 'unselected',
    body: 'unselected',
    nutrition: 'unselected',
    activity: 'unselected',
    sleep: 'unselected',
    ...overrides,
  }
}

describe('benchmark result evaluators', () => {
  it('sums qualifying push-up reps and keeps the largest set separate', () => {
    const training = evaluateOutcome(
      requirement({ requirementKind: 'training_measure', selector: { exerciseDefinitionId: EXERCISE, measure: 'total_reps' }, label: 'Total reps' }),
      pool({ training: [session()] }),
    )
    const largest = evaluateOutcome(
      requirement({ id: REQ_B, requirementKind: 'training_measure', selector: { exerciseDefinitionId: EXERCISE, measure: 'largest_set_reps' }, label: 'Largest set' }),
      pool({ training: [session()] }),
    )
    expect(training).toMatchObject({ status: 'available', value: 67, unit: 'reps', valueKind: 'derived', resultDate: '2026-09-26' })
    expect(largest).toMatchObject({ status: 'available', value: 22, unit: 'reps', valueKind: 'derived' })
    if (training.status === 'available') {
      expect(training.evidence[0]?.evidenceSnapshot).toMatchObject({ sessionType: 'experiment', exerciseName: 'Push-up' })
      expect(training.evidence[0]?.evidenceRef).toMatchObject({ sessionId: SESSION })
    }
  })

  it('counts working sets and omits blank sets instead of treating them as zero', () => {
    const counted = evaluateOutcome(
      requirement({ requirementKind: 'training_measure', selector: { exerciseDefinitionId: EXERCISE, measure: 'working_sets' } }),
      pool({
        training: [
          session({
            sets: [set('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1', 1, 'working', 10), set('d2d2d2d2-d2d2-42d2-82d2-d2d2d2d2d2d2', 2, 'working', null)],
          }),
        ],
      }),
    )
    const missing = evaluateOutcome(
      requirement({ requirementKind: 'training_measure', selector: { exerciseDefinitionId: EXERCISE, measure: 'total_reps' } }),
      pool({ training: [session({ sets: [set('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1', 1, 'working', null)] })] }),
    )
    expect(counted).toMatchObject({ status: 'available', value: 1, unit: 'sets', valueKind: 'derived' })
    expect(missing).toMatchObject({ status: 'missing' })
    expect(missing).not.toMatchObject({ value: 0 })
  })

  it('sums duration in seconds and refuses a rep total for a timed exercise', () => {
    const duration = evaluateOutcome(
      requirement({ requirementKind: 'training_measure', selector: { exerciseDefinitionId: EXERCISE, measure: 'duration' } }),
      pool({
        training: [
          session({
            measurementKind: 'duration',
            sets: [set('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1', 1, 'working', null, 45), set('d2d2d2d2-d2d2-42d2-82d2-d2d2d2d2d2d2', 2, 'working', null, 30)],
          }),
        ],
      }),
    )
    const reps = evaluateOutcome(
      requirement({ requirementKind: 'training_measure', selector: { exerciseDefinitionId: EXERCISE, measure: 'total_reps' } }),
      pool({ training: [session({ measurementKind: 'duration' })] }),
    )
    expect(duration).toMatchObject({ status: 'available', value: 75, unit: 'seconds', valueKind: 'derived' })
    expect(reps).toMatchObject({ status: 'unsupported' })
  })

  it('does not choose between two workouts or two measurements', () => {
    const workouts = evaluateOutcome(
      requirement({ requirementKind: 'training_measure', selector: { exerciseDefinitionId: EXERCISE, measure: 'total_reps' } }),
      pool({ training: [session(), session({ sessionId: SESSION_B, workoutDate: '2026-09-26' })] }),
    )
    const chosen = evaluateOutcome(
      requirement({ requirementKind: 'training_measure', selector: { exerciseDefinitionId: EXERCISE, measure: 'total_reps' } }),
      pool({ training: [session(), session({ sessionId: SESSION_B })] }),
      SESSION_B,
    )
    const waist = evaluateOutcome(
      requirement({ requirementKind: 'body_metric', selector: { metricKey: 'waist_circumference' } }),
      pool({
        body: [
          { measurementId: MEASURE, measurementSessionId: SESSION, metricKey: 'waist_circumference', value: 96.3, unit: 'cm', valueKind: 'manual', calendarDate: '2026-09-26' },
          { measurementId: MEASURE_B, measurementSessionId: SESSION_B, metricKey: 'waist_circumference', value: 97, unit: 'cm', valueKind: 'manual', calendarDate: '2026-09-26' },
        ],
      }),
    )
    expect(workouts.status).toBe('ambiguous')
    expect(chosen).toMatchObject({ status: 'available', resultDate: '2026-09-26' })
    expect(waist.status).toBe('ambiguous')
  })

  it('reads body, nutrition, activity, and sleep without turning absence into zero', () => {
    expect(
      evaluateOutcome(requirement({ requirementKind: 'body_metric', selector: { metricKey: 'waist_circumference' } }), pool({ body: [] })),
    ).toMatchObject({ status: 'missing' })
    expect(
      evaluateOutcome(
        requirement({ requirementKind: 'body_metric', selector: { metricKey: 'waist_circumference' } }),
        pool({
          body: [{ measurementId: MEASURE, measurementSessionId: SESSION, metricKey: 'waist_circumference', value: 96.3, unit: 'cm', valueKind: 'manual', calendarDate: '2026-09-26' }],
        }),
      ),
    ).toMatchObject({ status: 'available', value: 96.3, unit: 'cm', valueKind: 'observed', resultDate: '2026-09-26' })
    expect(
      evaluateOutcome(requirement({ requirementKind: 'nutrition_metric', selector: { metricKey: 'calories' } }), pool({ nutrition: 'absent' })),
    ).toMatchObject({ status: 'missing' })
    expect(
      evaluateOutcome(
        requirement({ requirementKind: 'nutrition_metric', selector: { metricKey: 'protein' } }),
        pool({ nutrition: { logDate: '2026-09-26', entries: [{ entryId: MEASURE, calories: 400, protein: null, carbs: null, fat: null }] } }),
      ),
    ).toMatchObject({ status: 'missing' })
    expect(
      evaluateOutcome(
        requirement({ requirementKind: 'nutrition_metric', selector: { metricKey: 'protein' } }),
        pool({
          nutrition: {
            logDate: '2026-09-26',
            entries: [
              { entryId: MEASURE, calories: 400, protein: 30, carbs: null, fat: null },
              { entryId: MEASURE_B, calories: 200, protein: 12, carbs: null, fat: null },
            ],
          },
        }),
      ),
    ).toMatchObject({ status: 'available', value: 42, unit: 'g', valueKind: 'derived', resultDate: '2026-09-26' })
    expect(
      evaluateOutcome(
        requirement({ requirementKind: 'activity_metric', selector: { metricKey: 'resting_heart_rate_bpm' } }),
        pool({
          activity: {
            summaryId: MEASURE,
            summaryDate: '2026-09-26',
            timezone: 'America/Phoenix',
            stepsCount: 1000,
            activeEnergyKcal: null,
            exerciseMinutes: null,
            restingHeartRateBpm: null,
          },
        }),
      ),
    ).toMatchObject({ status: 'missing' })
    expect(
      evaluateOutcome(
        requirement({ requirementKind: 'activity_metric', selector: { metricKey: 'resting_heart_rate_bpm' } }),
        pool({
          activity: {
            summaryId: MEASURE,
            summaryDate: '2026-09-26',
            timezone: 'America/Phoenix',
            stepsCount: null,
            activeEnergyKcal: null,
            exerciseMinutes: null,
            restingHeartRateBpm: 61,
          },
        }),
      ),
    ).toMatchObject({ status: 'available', value: 61, unit: 'bpm', valueKind: 'observed' })
    expect(
      evaluateOutcome(
        requirement({ requirementKind: 'sleep_metric', selector: { metricKey: 'total_sleep_minutes' } }),
        pool({
          sleep: {
            sleepDate: '2026-09-26',
            timezone: 'America/Phoenix',
            logicalSourceKey: 'apple',
            sourceName: 'Apple Watch',
            totalSleepMinutes: null,
            observationStatus: 'partial_observation',
            analysisEligible: false,
          },
        }),
      ),
    ).toMatchObject({ status: 'missing' })
    expect(
      evaluateOutcome(
        requirement({ requirementKind: 'sleep_metric', selector: { metricKey: 'total_sleep_minutes' } }),
        pool({
          sleep: {
            sleepDate: '2026-09-26',
            timezone: 'America/Phoenix',
            logicalSourceKey: 'apple',
            sourceName: 'Apple Watch',
            totalSleepMinutes: 430,
            observationStatus: 'analysis_eligible',
            analysisEligible: true,
          },
        }),
      ),
    ).toMatchObject({ status: 'available', value: 430, unit: 'minutes', valueKind: 'observed', resultDate: '2026-09-26' })
  })

  it('rejects benchmark outcome roles that cannot produce a result', () => {
    expect(benchmarkOutcomeRoleError([{ role: 'primary_outcome', requirementKind: 'context_tag' }])).toMatch(/primary outcome/)
    expect(benchmarkOutcomeRoleError([{ role: 'primary_outcome', requirementKind: 'training_measure' }])).toBeNull()
    expect(
      benchmarkOutcomeRoleError([
        { role: 'primary_outcome', requirementKind: 'body_metric' },
        { role: 'secondary_outcome', requirementKind: 'supplement_adherence' },
      ]),
    ).toMatch(/training, body, nutrition, activity, or sleep/)
  })
})

describe('benchmark result preview', () => {
  const requirements = [
    requirement({ requirementKind: 'training_measure', selector: { exerciseDefinitionId: EXERCISE, measure: 'total_reps' }, label: 'Total reps' }),
    requirement({ id: REQ_B, role: 'secondary_outcome', requirementKind: 'training_measure', selector: { exerciseDefinitionId: EXERCISE, measure: 'largest_set_reps' }, label: 'Largest set' }),
  ]

  it('confirms a linked experiment workout and derives the workout date', async () => {
    const preview = composeBenchmarkPreview({
      benchmarkDefinitionId: BENCHMARK,
      protocolVersionId: VERSION,
      protocolVersion: 1,
      requirements,
      pool: pool({ training: [session()] }),
      request: request({ workoutSessionId: SESSION }),
      context: { recorded: true, tags: ['travel'], note: null, controls: [{ tagKey: 'travel', recorded: true }] },
      existingResultId: null,
    })
    expect(preview.state).toBe('eligible')
    expect(preview.resultDate).toBe('2026-09-26')
    expect(preview.confirmation).toBe('linked_protocol')
    expect(preview.attestationRequired).toBe(false)
    expect(preview.canCommit).toBe(true)
    expect(preview.experimentId).toBe('abababab-abab-4aba-8aba-abababababab')
    expect(preview.outcomes.map((outcome) => outcome.value)).toEqual([67, 22])
  })

  it('requires owner attestation for ad-hoc training and body evidence', () => {
    const adHoc = composeBenchmarkPreview({
      benchmarkDefinitionId: BENCHMARK,
      protocolVersionId: VERSION,
      protocolVersion: 1,
      requirements: [requirements[0]!],
      pool: pool({ training: [session({ sessionType: 'ad_hoc', benchmarkProtocolVersionId: null, experimentId: null })] }),
      request: request(),
      context: null,
      existingResultId: null,
    })
    expect(adHoc.confirmation).toBe('owner_attested')
    expect(adHoc.canCommit).toBe(false)
    const attested = composeBenchmarkPreview({
      benchmarkDefinitionId: BENCHMARK,
      protocolVersionId: VERSION,
      protocolVersion: 1,
      requirements: [requirements[0]!],
      pool: pool({ training: [session({ sessionType: 'ad_hoc', benchmarkProtocolVersionId: null, experimentId: null })] }),
      request: request({ ownerAttested: true }),
      context: null,
      existingResultId: null,
    })
    expect(attested.canCommit).toBe(true)
    const body = composeBenchmarkPreview({
      benchmarkDefinitionId: BENCHMARK,
      protocolVersionId: VERSION,
      protocolVersion: 1,
      requirements: [requirement({ requirementKind: 'body_metric', selector: { metricKey: 'weight' }, label: 'Weight' })],
      pool: pool({
        body: [{ measurementId: MEASURE, measurementSessionId: SESSION, metricKey: 'weight', value: 80, unit: 'kg', valueKind: 'manual', calendarDate: '2026-09-26' }],
      }),
      request: request(),
      context: null,
      existingResultId: null,
    })
    expect(body.confirmation).toBe('owner_attested')
    expect(body.canCommit).toBe(false)
  })

  it('keeps a missing secondary outcome off the result and rejects mixed dates', () => {
    const missingSecondary = composeBenchmarkPreview({
      benchmarkDefinitionId: BENCHMARK,
      protocolVersionId: VERSION,
      protocolVersion: 1,
      requirements: [
        requirement({ requirementKind: 'body_metric', selector: { metricKey: 'weight' }, label: 'Weight' }),
        requirement({ id: REQ_B, role: 'secondary_outcome', requirementKind: 'activity_metric', selector: { metricKey: 'steps_count' }, label: 'Steps' }),
      ],
      pool: pool({
        body: [{ measurementId: MEASURE, measurementSessionId: SESSION, metricKey: 'weight', value: 80, unit: 'kg', valueKind: 'manual', calendarDate: '2026-09-26' }],
        activity: 'absent',
      }),
      request: request({ ownerAttested: true }),
      context: { recorded: false, tags: [], note: null, controls: [] },
      existingResultId: null,
    })
    expect(missingSecondary.state).toBe('eligible')
    expect(missingSecondary.fingerprintMaterial?.outcomes).toHaveLength(1)
    const conflict = composeBenchmarkPreview({
      benchmarkDefinitionId: BENCHMARK,
      protocolVersionId: VERSION,
      protocolVersion: 1,
      requirements: [
        requirement({ requirementKind: 'training_measure', selector: { exerciseDefinitionId: EXERCISE, measure: 'total_reps' }, label: 'Total reps' }),
        requirement({ id: REQ_B, role: 'secondary_outcome', requirementKind: 'body_metric', selector: { metricKey: 'weight' }, label: 'Weight' }),
      ],
      pool: pool({
        training: [session()],
        body: [{ measurementId: MEASURE, measurementSessionId: SESSION, metricKey: 'weight', value: 80, unit: 'kg', valueKind: 'manual', calendarDate: '2026-09-27' }],
      }),
      request: request({ ownerAttested: true }),
      context: null,
      existingResultId: null,
    })
    expect(conflict.state).toBe('conflicting_dates')
    expect(conflict.canCommit).toBe(false)
  })

  it('rejects a client result date or client-calculated value', () => {
    expect(parseResultRequest({ protocolVersionId: VERSION, resultDate: '2026-09-01' })).toMatchObject({
      error: expect.stringMatching(/canonical evidence/),
    })
    expect(parseResultRequest({ protocolVersionId: VERSION, totalReps: 81 })).toMatchObject({
      error: expect.stringMatching(/canonical evidence/),
    })
    const preview = composeBenchmarkPreview({
      benchmarkDefinitionId: BENCHMARK,
      protocolVersionId: VERSION,
      protocolVersion: 1,
      requirements: [requirements[0]!],
      pool: pool({ training: [session()] }),
      request: request({ date: '2026-01-01' }),
      context: null,
      existingResultId: null,
    })
    expect(preview.state).toBe('conflicting_dates')
    expect(preview.resultDate).toBeNull()
  })

  it('fingerprints the same evidence once and allows a different identity on the same date', async () => {
    const first = composeBenchmarkPreview({
      benchmarkDefinitionId: BENCHMARK,
      protocolVersionId: VERSION,
      protocolVersion: 1,
      requirements: [requirements[0]!],
      pool: pool({ training: [session()] }),
      request: request(),
      context: null,
      existingResultId: null,
    })
    const again = composeBenchmarkPreview({
      benchmarkDefinitionId: BENCHMARK,
      protocolVersionId: VERSION,
      protocolVersion: 1,
      requirements: [requirements[0]!],
      pool: pool({ training: [session({ exerciseName: 'Push-Up' })] }),
      request: request(),
      context: null,
      existingResultId: first.fingerprintMaterial ? '99999999-9999-4999-8999-999999999999' : null,
    })
    expect(first.fingerprintMaterial).not.toBeNull()
    expect(again.state).toBe('duplicate')
    expect(again.canCommit).toBe(false)
    const otherSession = composeBenchmarkPreview({
      benchmarkDefinitionId: BENCHMARK,
      protocolVersionId: VERSION,
      protocolVersion: 1,
      requirements: [requirements[0]!],
      pool: pool({ training: [session({ sessionId: SESSION_B })] }),
      request: request(),
      context: null,
      existingResultId: null,
    })
    const renamed = composeBenchmarkPreview({
      benchmarkDefinitionId: BENCHMARK,
      protocolVersionId: VERSION,
      protocolVersion: 1,
      requirements: [requirements[0]!],
      pool: pool({ training: [session({ exerciseName: 'Push-Up' })] }),
      request: request(),
      context: null,
      existingResultId: null,
    })
    expect(canonicalEvidenceJson(first.fingerprintMaterial!)).toBe(canonicalEvidenceJson(JSON.parse(canonicalEvidenceJson(first.fingerprintMaterial!))))
    expect(await evidenceFingerprint(first.fingerprintMaterial!)).toBe(await evidenceFingerprint(renamed.fingerprintMaterial!))
    expect(await evidenceFingerprint(first.fingerprintMaterial!)).not.toBe(await evidenceFingerprint(otherSession.fingerprintMaterial!))
    expect(await evidenceFingerprint(first.fingerprintMaterial!)).not.toBe(
      await evidenceFingerprint({
        ...first.fingerprintMaterial!,
        outcomes: first.fingerprintMaterial!.outcomes.map((outcome) => ({ ...outcome, value: '68' })),
      }),
    )
  })

  it('rejects a linked workout from another protocol and an unrelated experiment', () => {
    const mismatch = composeBenchmarkPreview({
      benchmarkDefinitionId: BENCHMARK,
      protocolVersionId: VERSION,
      protocolVersion: 1,
      requirements: [requirements[0]!],
      pool: pool({ training: [session({ benchmarkProtocolVersionId: REQ })] }),
      request: request(),
      context: null,
      existingResultId: null,
    })
    expect(protocolMismatchError(mismatch.protocolMismatch)).toMatch(/different benchmark protocol/)
    expect(experimentLinkError('abababab-abab-4aba-8aba-abababababab', REQ)).toMatch(/not part of that experiment/)
    expect(experimentLinkError(null, REQ)).toMatch(/not part of that experiment/)
    expect(experimentLinkError(null, null)).toBeNull()
  })
})

describe('benchmark result history', () => {
  const previous = {
    id: '1',
    benchmarkDefinitionId: BENCHMARK,
    protocolVersionId: VERSION,
    protocolVersion: 1,
    resultDate: '2026-09-26',
    status: 'valid' as const,
    createdAt: '2026-09-26T00:00:00.000Z',
    values: [
      { requirementId: REQ, label: 'Total reps', role: 'primary_outcome', value: 67, unit: 'reps' },
      { requirementId: REQ_B, label: 'Largest set', role: 'primary_outcome', value: 22, unit: 'reps' },
    ],
  }
  const next = {
    ...previous,
    id: '2',
    resultDate: '2026-12-20',
    createdAt: '2026-12-20T00:00:00.000Z',
    values: [
      { requirementId: REQ, label: 'Total reps', role: 'primary_outcome', value: 81, unit: 'reps' },
      { requirementId: REQ_B, label: 'Largest set', role: 'primary_outcome', value: 24, unit: 'reps' },
    ],
  }

  it('compares the same protocol version numerically and keeps metrics separate', () => {
    expect(sameProtocolValueDelta(67, 81)).toEqual({ absolute: 14, percent: 20.895522 })
    expect(sameProtocolValueDelta(0, 5).percent).toBeNull()
    const deltas = compareBenchmarkResults(previous, next)
    expect(deltas).toHaveLength(2)
    expect(deltas?.map((delta) => delta.requirementId)).toEqual([REQ, REQ_B])
    expect(compareBenchmarkResults(previous, { ...next, protocolVersionId: REQ })).toBeNull()
    expect(protocolChangeNote([{ version: 1, validResultCount: 3 }, { version: 2, validResultCount: 1 }])).toBe(
      'Protocol changed from v1 to v2. Results are retained but not directly compared.',
    )
  })

  it('uses only valid results as the latest anchor', () => {
    const invalidated = { ...next, id: '3', status: 'invalidated' as const, resultDate: '2027-03-01', createdAt: '2027-03-01T00:00:00.000Z' }
    expect(latestValidBenchmarkResult([previous, invalidated, next], BENCHMARK, VERSION)?.id).toBe('2')
    expect(visibleBenchmarkResults([previous, invalidated], false).map((result) => result.id)).toEqual(['1'])
  })
})

describe('benchmark result timeline', () => {
  it('shows a valid result as an annotation and leaves numeric lanes unchanged', () => {
    const timeline = buildProgressTimeline({
      asOf: '2026-09-26',
      range: '30d',
      exercises: [],
      workouts: [],
      sets: [],
      bodyObservations: [],
      nutritionEntries: [],
      nutritionTargets: [],
      benchmarkResults: [
        { id: 'result-1', resultDate: '2026-09-26', title: 'Push-up 10-minute capacity', protocolVersion: 1, status: 'valid', primary: [{ label: 'Total reps', value: 67, unit: 'reps' }] },
        { id: 'result-2', resultDate: '2026-09-20', title: 'Push-up 10-minute capacity', protocolVersion: 1, status: 'invalidated', primary: [{ label: 'Total reps', value: 10, unit: 'reps' }] },
      ],
    })
    const event = timeline.events.find((item) => item.kind === 'benchmark_result')
    expect(event).toMatchObject({
      domain: 'annotation',
      timePrecision: 'date',
      date: '2026-09-26',
      title: 'Push-up 10-minute capacity',
      data: { protocolVersion: 1, primary: [{ value: 67, unit: 'reps' }] },
    })
    expect(timeline.events.some((item) => item.id === 'benchmark_result:result-2')).toBe(false)
    expect(timelineEventsForFocus(timeline, 'all').some((item) => item.kind === 'benchmark_result')).toBe(true)
    expect(timelineEventsForFocus(timeline, 'training').some((item) => item.kind === 'benchmark_result')).toBe(false)
    expect(timelineSeriesForFocus(timeline, 'all')).toEqual(timeline.series)
    expect(JSON.stringify(timeline.series)).not.toContain('result-1')
  })
})

describe('benchmark result boundaries', () => {
  it('does not feed results into domain analytics, complete experiments, or add Today reminders', () => {
    const results = readFileSync('server/lab/results.ts', 'utf8')
    const today = readFileSync('server/today/service.ts', 'utf8')
    const overview = readFileSync('src/domain/progress/overview.ts', 'utf8')
    expect(results).not.toContain('UPDATE experiments')
    expect(results).not.toMatch(/session_type\s*=/)
    expect(results).not.toMatch(/SET status = 'valid'/)
    expect(results).toContain("status = 'invalidated'")
    expect(today).not.toContain('benchmark_results')
    expect(today).not.toContain('Retest overdue')
    expect(overview).not.toContain('benchmark_result')
  })
})
