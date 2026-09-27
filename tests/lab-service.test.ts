import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '../server/http.ts'

const SOURCE = '11111111-1111-4111-8111-111111111111'
const SUPPLEMENT = '22222222-2222-4222-8222-222222222222'
const OTHER_SUPPLEMENT = '33333333-3333-4333-8333-333333333333'
const EXERCISE = '44444444-4444-4444-8444-444444444444'

type Row = Record<string, unknown>

const harness = vi.hoisted(() => {
  const state: {
    protocols: Row[]
    versions: Row[]
    requirements: Row[]
    controls: Row[]
    benchmarks: Row[]
    experiments: Row[]
    experimentBenchmarks: Row[]
    experimentSupplements: Row[]
    supplements: Row[]
    exercises: Row[]
    sessions: Row[]
  } = {
    protocols: [],
    versions: [],
    requirements: [],
    controls: [],
    benchmarks: [],
    experiments: [],
    experimentBenchmarks: [],
    experimentSupplements: [],
    supplements: [
      { id: '22222222-2222-4222-8222-222222222222', name: 'Creatine' },
      { id: '33333333-3333-4333-8333-333333333333', name: 'Vitamin D' },
    ],
    exercises: [{ id: '44444444-4444-4444-8444-444444444444' }],
    sessions: [],
  }

  function ids(params: unknown[]): string[] {
    const value = params[0]
    return Array.isArray(value) ? value.map(String) : []
  }

  function execute(text: string, params: unknown[]): unknown[] {
    if (text.includes("key = 'manual'")) {
      return [{ id: SOURCE }]
    }
    if (text.includes('FROM supplements WHERE id = ANY')) {
      return state.supplements.filter((item) => ids(params).includes(String(item.id))).map((item) => ({ id: item.id }))
    }
    if (text.includes('FROM exercise_definitions WHERE id = ANY')) {
      return state.exercises.filter((item) => ids(params).includes(String(item.id))).map((item) => ({ id: item.id }))
    }
    if (text.includes('FROM benchmark_definitions WHERE id = ANY')) {
      return state.benchmarks.filter((item) => ids(params).includes(String(item.id))).map((item) => ({ id: item.id }))
    }
    if (text.startsWith('INSERT INTO lab_protocols')) {
      state.protocols.push({
        id: params[0],
        protocol_kind: text.includes("'experiment'") ? 'experiment' : 'benchmark',
        title: params[1],
        description: text.includes('NULL') && text.includes("'experiment'") ? null : params[2],
        source_id: text.includes("'experiment'") ? params[2] : params[3],
        created_at: '2026-09-26T15:00:00.000Z',
        updated_at: '2026-09-26T15:00:00.000Z',
      })
      return []
    }
    if (text.startsWith('INSERT INTO lab_protocol_versions')) {
      state.versions.push({
        id: params[0],
        protocol_id: params[1],
        version: params[2],
        instructions: params[3],
        minimum_retest_days: params[4],
        suggested_retest_days: params[5],
        is_current: true,
        created_at: '2026-09-26T15:00:00.000Z',
      })
      return []
    }
    if (text.startsWith('INSERT INTO lab_protocol_requirements')) {
      state.requirements.push({
        id: params[0],
        protocol_version_id: params[1],
        position: params[2],
        role: params[3],
        domain: params[4],
        requirement_kind: params[5],
        selector: JSON.parse(String(params[6])),
        label: params[7],
        required: params[8],
      })
      return []
    }
    if (text.startsWith('INSERT INTO lab_protocol_context_controls')) {
      state.controls.push({
        protocol_version_id: params[0],
        tag_key: params[1],
        control_mode: 'observe',
      })
      return []
    }
    if (text.startsWith('INSERT INTO experiments')) {
      state.experiments.push({
        id: params[0],
        title: params[1],
        question: params[2],
        hypothesis: params[3],
        rationale: params[4],
        origin: 'owner_created',
        status: 'accepted',
        protocol_version_id: params[5],
        window_start: null,
        window_end: null,
        source_id: params[6],
        created_at: '2026-09-26T15:00:00.000Z',
        updated_at: '2026-09-26T15:00:00.000Z',
      })
      return []
    }
    if (text.startsWith('INSERT INTO benchmark_definitions')) {
      state.benchmarks.push({
        id: params[0],
        protocol_id: params[1],
        domain: params[2],
        description: params[3],
        is_active: true,
        source_id: params[4],
        created_at: '2026-09-26T15:00:00.000Z',
        updated_at: '2026-09-26T15:00:00.000Z',
      })
      return []
    }
    if (text.startsWith('DELETE FROM experiment_supplements')) {
      state.experimentSupplements = state.experimentSupplements.filter((item) => item.experiment_id !== params[0])
      return []
    }
    if (text.startsWith('DELETE FROM experiment_benchmarks')) {
      state.experimentBenchmarks = state.experimentBenchmarks.filter((item) => item.experiment_id !== params[0])
      return []
    }
    if (text.startsWith('INSERT INTO experiment_supplements')) {
      state.experimentSupplements.push({
        experiment_id: params[0],
        supplement_id: params[1],
        role: params[2],
      })
      return []
    }
    if (text.startsWith('INSERT INTO experiment_benchmarks')) {
      state.experimentBenchmarks.push({
        experiment_id: params[0],
        benchmark_definition_id: params[1],
        role: params[2],
      })
      return []
    }
    if (text.startsWith('SELECT id::text AS id FROM experiment_results')) {
      return []
    }
    if (text.includes('FROM experiments e') && text.includes('JOIN lab_protocol_versions')) {
      const experiment = state.experiments.find((item) => item.id === params[0])
      if (!experiment) {
        return []
      }
      const version = state.versions.find((item) => item.id === experiment.protocol_version_id)
      return [{ ...experiment, protocol_id: version?.protocol_id }]
    }
    if (text.includes('COALESCE(MAX(version)')) {
      const versions = state.versions.filter((item) => item.protocol_id === params[0])
      return [{ version: versions.reduce((max, item) => Math.max(max, Number(item.version)), 0) }]
    }
    if (text.includes('FROM lab_protocol_versions') && text.includes('WHERE protocol_id = $1')) {
      return state.versions
        .filter((item) => item.protocol_id === params[0])
        .sort((left, right) => Number(left.version) - Number(right.version))
    }
    if (text.includes('FROM lab_protocol_requirements')) {
      const wanted = ids(params)
      return state.requirements.filter((item) => wanted.includes(String(item.protocol_version_id)))
    }
    if (text.includes('FROM lab_protocol_context_controls')) {
      const wanted = ids(params)
      return state.controls.filter((item) => wanted.includes(String(item.protocol_version_id)))
    }
    if (text.includes('FROM experiment_supplements')) {
      return state.experimentSupplements
        .filter((item) => item.experiment_id === params[0])
        .map((item) => ({
          supplement_id: item.supplement_id,
          role: item.role,
          name: state.supplements.find((supplement) => supplement.id === item.supplement_id)?.name ?? null,
        }))
    }
    if (text.includes('FROM experiment_benchmarks eb')) {
      return state.experimentBenchmarks
        .filter((item) => item.experiment_id === params[0])
        .map((item) => {
          const benchmark = state.benchmarks.find((candidate) => candidate.id === item.benchmark_definition_id)
          const protocol = state.protocols.find((candidate) => candidate.id === benchmark?.protocol_id)
          return {
            benchmark_definition_id: item.benchmark_definition_id,
            role: item.role,
            title: protocol?.title ?? null,
            protocol_id: benchmark?.protocol_id ?? null,
          }
        })
    }
    if (text.includes('FROM workout_sessions') && text.includes('experiment_id = $1')) {
      return state.sessions.filter((item) => item.experiment_id === params[0])
    }
    if (text.includes('FROM workout_sessions') && text.includes('benchmark_protocol_version_id = ANY')) {
      const wanted = ids(params)
      return state.sessions.filter((item) => wanted.includes(String(item.benchmark_protocol_version_id)))
    }
    if (text.startsWith('UPDATE experiments SET origin')) {
      const experiment = state.experiments.find((item) => item.id === params[0])
      if (experiment) {
        experiment.origin = params[1]
        experiment.status = 'proposed'
      }
      return []
    }
    if (text.startsWith('UPDATE experiments') && text.includes('window_start')) {
      const experiment = state.experiments.find((item) => item.id === params[0])
      if (experiment) {
        experiment.status = params[1] ?? experiment.status
        if (text.includes("status = 'scheduled'")) {
          experiment.status = 'scheduled'
          experiment.window_start = params[1]
          experiment.window_end = params[2]
        } else {
          experiment.window_start = params[2]
          experiment.window_end = params[3]
        }
      }
      return []
    }
    if (text.startsWith('UPDATE experiments SET status = \'active\'')) {
      const experiment = state.experiments.find((item) => item.id === params[0])
      if (experiment) {
        experiment.status = 'active'
      }
      return []
    }
    if (text.startsWith('UPDATE experiments') && text.includes('SET title')) {
      const experiment = state.experiments.find((item) => item.id === params[0])
      if (experiment) {
        experiment.title = params[1]
        experiment.question = params[2]
        experiment.hypothesis = params[3]
        experiment.rationale = params[4]
      }
      return []
    }
    if (text.startsWith('UPDATE experiments SET protocol_version_id')) {
      const experiment = state.experiments.find((item) => item.id === params[0])
      if (experiment) {
        experiment.protocol_version_id = params[1]
      }
      return []
    }
    if (text.startsWith('UPDATE lab_protocol_versions SET is_current = false')) {
      for (const version of state.versions) {
        if (version.protocol_id === params[0] && version.is_current) {
          version.is_current = false
        }
      }
      return []
    }
    if (text.startsWith('UPDATE lab_protocols SET title')) {
      const protocol = state.protocols.find((item) => item.id === params[0])
      if (protocol) {
        protocol.title = params[1]
        if (params.length > 2) {
          protocol.description = params[2]
        }
      }
      return []
    }
    if (text.startsWith('UPDATE benchmark_definitions SET description')) {
      const benchmark = state.benchmarks.find((item) => item.id === params[0])
      if (benchmark) {
        benchmark.description = params[1]
      }
      return []
    }
    if (text.startsWith('UPDATE benchmark_definitions SET is_active = false')) {
      const benchmark = state.benchmarks.find((item) => item.id === params[0])
      if (benchmark) {
        benchmark.is_active = false
      }
      return []
    }
    if (text.includes('FROM experiments') && text.includes("status IN ('scheduled', 'active')")) {
      return state.experiments
        .filter((item) => item.status === 'scheduled' || item.status === 'active')
        .map((item) => ({
          id: item.id,
          title: item.title,
          status: item.status,
          window_start: item.window_start,
          window_end: item.window_end,
        }))
    }
    if (text.includes('SELECT status FROM experiments')) {
      const experiment = state.experiments.find((item) => item.id === params[0])
      return experiment ? [{ status: experiment.status }] : []
    }
    if (text.includes('JOIN lab_protocols p') && text.includes('protocol_kind')) {
      const version = state.versions.find((item) => item.id === params[0])
      if (!version) {
        return []
      }
      const protocol = state.protocols.find((item) => item.id === version.protocol_id)
      const benchmark = state.benchmarks.find((item) => item.protocol_id === protocol?.id)
      return [
        {
          protocol_kind: protocol?.protocol_kind,
          protocol_id: protocol?.id,
          is_active: benchmark?.is_active ?? null,
        },
      ]
    }
    if (text.includes("eb.role = 'primary'")) {
      const link = state.experimentBenchmarks.find((item) => item.experiment_id === params[0] && item.role === 'primary')
      if (!link) {
        return []
      }
      const benchmark = state.benchmarks.find((item) => item.id === link.benchmark_definition_id)
      return [{ protocol_id: benchmark?.protocol_id }]
    }
    if (text.includes('FROM benchmark_definitions b') && text.includes('WHERE b.id = $1')) {
      const benchmark = state.benchmarks.find((item) => item.id === params[0])
      if (!benchmark) {
        return []
      }
      const protocol = state.protocols.find((item) => item.id === benchmark.protocol_id)
      return [{ ...benchmark, title: protocol?.title }]
    }
    if (text.startsWith('SELECT id::text AS id, title, question, status')) {
      return state.experiments
    }
    if (text.startsWith('SELECT b.id::text AS id, p.title')) {
      return state.benchmarks.map((benchmark) => {
        const protocol = state.protocols.find((item) => item.id === benchmark.protocol_id)
        const current = state.versions.find((item) => item.protocol_id === benchmark.protocol_id && item.is_current)
        return {
          id: benchmark.id,
          title: protocol?.title,
          domain: benchmark.domain,
          is_active: benchmark.is_active,
          version: current?.version,
        }
      })
    }
    if (text.startsWith('DELETE FROM experiments')) {
      state.experiments = state.experiments.filter((item) => item.id !== params[0])
      return []
    }
    if (text.startsWith('DELETE FROM lab_protocol_versions')) {
      const removed = state.versions.filter((item) => item.protocol_id === params[0]).map((item) => item.id)
      state.versions = state.versions.filter((item) => item.protocol_id !== params[0])
      state.requirements = state.requirements.filter((item) => !removed.includes(String(item.protocol_version_id)))
      return []
    }
    if (text.startsWith('DELETE FROM lab_protocols')) {
      state.protocols = state.protocols.filter((item) => item.id !== params[0])
      return []
    }
    if (text.includes('FROM workout_sessions WHERE experiment_id')) {
      return state.sessions.filter((item) => item.experiment_id === params[0])
    }
    throw new Error(`unexpected sql: ${text}`)
  }

  return { state, execute }
})

vi.mock('../server/db.ts', () => ({
  getSql: async () => ({
    query: async (text: string, params: unknown[] = []) => harness.execute(text, params),
  }),
}))

import {
  abandonExperiment,
  acceptExperiment,
  addBenchmarkProtocolVersion,
  addExperimentProtocolVersion,
  archiveBenchmark,
  assertTrainingLabParents,
  createBenchmark,
  createOwnerExperiment,
  createProposedExperiment,
  listTodayLabExperiments,
  scheduleExperiment,
  startExperiment,
  supersedeExperiment,
} from '../server/lab/service.ts'

const requirement = {
  role: 'primary_outcome',
  domain: 'training',
  requirementKind: 'training_measure',
  selector: { exerciseDefinitionId: EXERCISE, measure: 'total_reps' },
  label: 'Push-up total reps',
}

function experimentBody(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Push-up capacity retest',
    question: 'Does the current block change push-up capacity?',
    instructions: 'Retest once during the window.',
    requirements: [requirement],
    contextTags: ['travel'],
    ...overrides,
  }
}

describe('personal lab service', () => {
  beforeEach(() => {
    harness.state.protocols = []
    harness.state.versions = []
    harness.state.requirements = []
    harness.state.controls = []
    harness.state.benchmarks = []
    harness.state.experiments = []
    harness.state.experimentBenchmarks = []
    harness.state.experimentSupplements = []
    harness.state.sessions = []
  })

  it('creates an owner experiment as accepted and versions the protocol before it starts', async () => {
    await expect(createOwnerExperiment({ title: 'Missing question' })).rejects.toMatchObject({ statusCode: 400 })
    const created = await createOwnerExperiment(experimentBody())
    expect(created.origin).toBe('owner_created')
    expect(created.status).toBe('accepted')
    expect(created.windowStart).toBeNull()
    expect(created.currentVersion?.version).toBe(1)
    const revised = await addExperimentProtocolVersion(created.id, {
      instructions: 'Retest with a stricter pause.',
      requirements: [requirement],
      contextTags: ['travel'],
    })
    expect(revised.currentVersion?.version).toBe(2)
    expect(revised.protocolVersionId).toBe(revised.currentVersion?.id)
    const original = revised.versions.find((version) => version.version === 1)
    expect(original?.instructions).toBe('Retest once during the window.')
    expect(original?.isCurrent).toBe(false)
    await expect(scheduleExperiment(created.id, {})).rejects.toBeInstanceOf(HttpError)
    const scheduled = await scheduleExperiment(created.id, { windowStart: '2026-09-28', windowEnd: '2026-10-05' })
    expect(scheduled.status).toBe('scheduled')
    const active = await startExperiment(created.id)
    expect(active.status).toBe('active')
    await expect(
      addExperimentProtocolVersion(created.id, {
        instructions: 'Too late.',
        requirements: [requirement],
      }),
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(harness.state.versions.find((version) => version.id === original?.id)?.instructions).toBe(
      'Retest once during the window.',
    )
  })

  it('rejects illegal, completed, and terminal transitions', async () => {
    const created = await createOwnerExperiment(experimentBody())
    await expect(startExperiment(created.id)).rejects.toMatchObject({ statusCode: 409 })
    const proposed = await createProposedExperiment(experimentBody({ title: 'Proposed idea' }), 'ai_assisted')
    expect(proposed.status).toBe('proposed')
    expect(proposed.origin).toBe('ai_assisted')
    const accepted = await acceptExperiment(proposed.id)
    expect(accepted.status).toBe('accepted')
    const scheduled = await scheduleExperiment(created.id, { windowStart: '2026-09-28', windowEnd: '2026-10-05' })
    const abandoned = await abandonExperiment(scheduled.id)
    expect(abandoned.status).toBe('abandoned')
    await expect(startExperiment(scheduled.id)).rejects.toMatchObject({ statusCode: 409 })
    const another = await createOwnerExperiment(experimentBody({ title: 'Second' }))
    const superseded = await supersedeExperiment(another.id)
    expect(superseded.status).toBe('superseded')
    await expect(scheduleExperiment(another.id, { windowStart: '2026-09-28', windowEnd: '2026-10-05' })).rejects.toMatchObject({
      statusCode: 409,
    })
  })

  it('keeps benchmark history and supplement links', async () => {
    const benchmark = await createBenchmark({
      title: 'Push-up 10-minute capacity',
      domain: 'training',
      description: 'Capacity check',
      instructions: 'As many good-form push-ups as possible in 10 minutes.',
      requirements: [requirement, { ...requirement, role: 'secondary_outcome', selector: { exerciseDefinitionId: EXERCISE, measure: 'largest_set_reps' }, label: 'Largest set' }],
      suggestedRetestDays: 90,
    })
    expect(benchmark.currentVersion?.version).toBe(1)
    const next = await addBenchmarkProtocolVersion(benchmark.id, {
      instructions: 'Stricter pause at the bottom.',
      requirements: [requirement],
      suggestedRetestDays: 90,
    })
    expect(next.currentVersion?.version).toBe(2)
    expect(next.versions.find((version) => version.version === 1)?.instructions).toContain('good-form')
    const archived = await archiveBenchmark(benchmark.id)
    expect(archived.isActive).toBe(false)
    expect(archived.versions).toHaveLength(2)
    const experiment = await createOwnerExperiment(
      experimentBody({
        supplements: [
          { supplementId: SUPPLEMENT, role: 'intervention' },
          { supplementId: OTHER_SUPPLEMENT, role: 'intervention' },
        ],
        benchmarks: [{ benchmarkDefinitionId: benchmark.id, role: 'primary' }],
      }),
    )
    expect(experiment.supplements.map((item) => item.role)).toEqual(['intervention', 'intervention'])
    expect(experiment.benchmarks[0]?.role).toBe('primary')
    harness.state.supplements = harness.state.supplements.filter((item) => item.id !== SUPPLEMENT)
    expect(harness.state.experimentSupplements.some((item) => item.supplement_id === SUPPLEMENT)).toBe(true)
    await expect(createOwnerExperiment(experimentBody({ supplements: [{ supplementId: '55555555-5555-4555-8555-555555555555', role: 'tracked' }] }))).rejects.toMatchObject({
      statusCode: 400,
    })
  })

  it('shows only scheduled and active experiments and checks training parents', async () => {
    const accepted = await createOwnerExperiment(experimentBody({ title: 'Accepted only' }))
    const future = await createOwnerExperiment(experimentBody({ title: 'Future' }))
    await scheduleExperiment(future.id, { windowStart: '2026-10-01', windowEnd: '2026-10-08' })
    const current = await createOwnerExperiment(experimentBody({ title: 'Current' }))
    await scheduleExperiment(current.id, { windowStart: '2026-09-20', windowEnd: '2026-09-30' })
    await startExperiment(current.id)
    const dropped = await createOwnerExperiment(experimentBody({ title: 'Dropped' }))
    await abandonExperiment(dropped.id)
    const replaced = await createOwnerExperiment(experimentBody({ title: 'Replaced' }))
    await supersedeExperiment(replaced.id)
    const today = await listTodayLabExperiments()
    expect(today.map((item) => item.title).sort()).toEqual(['Current', 'Future'])
    expect(today.some((item) => item.id === accepted.id)).toBe(false)
    await expect(
      assertTrainingLabParents({ sessionType: 'experiment', experimentId: accepted.id, benchmarkProtocolVersionId: null }),
    ).rejects.toMatchObject({ statusCode: 409 })
    await expect(
      assertTrainingLabParents({
        sessionType: 'experiment',
        experimentId: current.id,
        benchmarkProtocolVersionId: current.protocolVersionId,
      }),
    ).rejects.toMatchObject({ statusCode: 400 })
    await assertTrainingLabParents({ sessionType: 'ad_hoc', experimentId: null, benchmarkProtocolVersionId: null })
    const benchmark = await createBenchmark({
      title: 'Push-up 10-minute capacity',
      domain: 'training',
      instructions: 'Ten minutes.',
      requirements: [requirement],
    })
    await assertTrainingLabParents({
      sessionType: 'experiment',
      experimentId: null,
      benchmarkProtocolVersionId: benchmark.currentVersion?.id ?? null,
    })
    await assertTrainingLabParents({
      sessionType: 'experiment',
      experimentId: current.id,
      benchmarkProtocolVersionId: benchmark.currentVersion?.id ?? null,
    })
  })
})
