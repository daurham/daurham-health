import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { MANUAL_BODY_METRICS } from '../src/domain/body-manual.ts'
import {
  LAB_PROTOCOL_KINDS,
  cleanRequiredText,
  experimentStatusTransitionError,
  experimentWindowError,
  parseBenchmarkLinks,
  parseContextControls,
  parseLabRequirement,
  parseLabRequirements,
  parseSupplementLinks,
  retestIntervalError,
  todayLabExperimentVisible,
  type LabExistence,
} from '../src/domain/lab.ts'

const SUPPLEMENT = '11111111-1111-4111-8111-111111111111'
const EXERCISE = '22222222-2222-4222-8222-222222222222'
const BENCHMARK = '33333333-3333-4333-8333-333333333333'
const MISSING = '44444444-4444-4444-8444-444444444444'

const existence: LabExistence = {
  supplementIds: new Set([SUPPLEMENT]),
  exerciseIds: new Set([EXERCISE]),
  benchmarkIds: new Set([BENCHMARK]),
}

describe('protocol version contract', () => {
  const migration = readFileSync('migrations/0021_personal_lab_protocols.sql', 'utf8')

  it('versions protocols immutably and keeps one current version', () => {
    expect(LAB_PROTOCOL_KINDS).toEqual(['experiment', 'benchmark'])
    expect(migration).toContain('UNIQUE (protocol_id, version)')
    expect(migration).toContain('WHERE is_current')
    expect(migration).toContain('btrim(instructions)')
    expect(migration).toContain('suggested_retest_days >= minimum_retest_days')
    expect(cleanRequiredText('   ', 'Instructions', 8000)).toEqual({ error: 'Instructions is required.' })
    expect(retestIntervalError(0, null)).toMatch(/at least 1/)
    expect(retestIntervalError(90, 30)).toMatch(/cannot be shorter/)
    expect(retestIntervalError(30, 90)).toBeNull()
  })
})

describe('requirement selectors', () => {
  it('accepts known evidence and rejects unknown selectors', () => {
    const body = parseLabRequirement(
      {
        role: 'primary_outcome',
        domain: 'body',
        requirementKind: 'body_metric',
        selector: { metricKey: 'waist_circumference' },
        label: 'Waist circumference',
      },
      1,
      existence,
    )
    expect(body).toMatchObject({ position: 1, selector: { metricKey: 'waist_circumference' } })
    expect(MANUAL_BODY_METRICS.some((item) => item.key === 'waist_circumference')).toBe(true)
    expect(
      parseLabRequirement(
        {
          role: 'primary_outcome',
          domain: 'body',
          requirementKind: 'body_metric',
          selector: { metricKey: 'not_a_metric' },
          label: 'Nope',
        },
        1,
        existence,
      ),
    ).toEqual({ error: 'Unknown body metric.' })
    expect(
      parseLabRequirement(
        {
          role: 'context',
          domain: 'context',
          requirementKind: 'context_tag',
          selector: { tagKey: 'travel' },
          label: 'Travel',
        },
        2,
        existence,
      ),
    ).toMatchObject({ selector: { tagKey: 'travel' } })
    expect(
      parseLabRequirement(
        {
          role: 'context',
          domain: 'context',
          requirementKind: 'context_tag',
          selector: { tagKey: 'vacation' },
          label: 'Vacation',
        },
        2,
        existence,
      ),
    ).toEqual({ error: 'Unknown context tag.' })
    expect(
      parseLabRequirement(
        {
          role: 'adherence',
          domain: 'supplements',
          requirementKind: 'supplement_adherence',
          selector: { supplementId: SUPPLEMENT },
          label: 'Creatine',
        },
        3,
        existence,
      ),
    ).toMatchObject({ selector: { supplementId: SUPPLEMENT } })
    expect(
      parseLabRequirement(
        {
          role: 'adherence',
          domain: 'supplements',
          requirementKind: 'supplement_adherence',
          selector: { supplementId: MISSING },
          label: 'Missing',
        },
        3,
        existence,
      ),
    ).toEqual({ error: 'That supplement was not found.' })
    expect(
      parseLabRequirement(
        {
          role: 'primary_outcome',
          domain: 'training',
          requirementKind: 'training_measure',
          selector: { exerciseDefinitionId: EXERCISE, measure: 'total_reps' },
          label: 'Push-up total reps',
        },
        4,
        existence,
      ),
    ).toMatchObject({ selector: { exerciseDefinitionId: EXERCISE, measure: 'total_reps' } })
    expect(
      parseLabRequirement(
        {
          role: 'primary_outcome',
          domain: 'training',
          requirementKind: 'training_measure',
          selector: { exerciseDefinitionId: MISSING, measure: 'total_reps' },
          label: 'Missing exercise',
        },
        4,
        existence,
      ),
    ).toEqual({ error: 'That exercise was not found.' })
    expect(
      parseLabRequirement(
        {
          role: 'secondary_outcome',
          domain: 'training',
          requirementKind: 'training_measure',
          selector: { exerciseDefinitionId: EXERCISE, measure: 'distance' },
          label: 'Distance',
        },
        5,
        existence,
      ),
    ).toEqual({ error: 'Unsupported training measure.' })
    expect(
      parseLabRequirement(
        { role: 'primary_outcome', domain: 'spirit', requirementKind: 'body_metric', selector: {}, label: 'Nope' },
        1,
        existence,
      ),
    ).toEqual({ error: 'Unknown requirement domain.' })
    expect(
      parseLabRequirement(
        { role: 'primary_outcome', domain: 'body', requirementKind: 'aura', selector: {}, label: 'Nope' },
        1,
        existence,
      ),
    ).toEqual({ error: 'Unknown requirement kind.' })
    const ordered = parseLabRequirements(
      [
        {
          role: 'secondary_outcome',
          domain: 'body',
          requirementKind: 'body_metric',
          selector: { metricKey: 'weight' },
          label: 'Weight',
        },
        {
          role: 'primary_outcome',
          domain: 'body',
          requirementKind: 'body_metric',
          selector: { metricKey: 'waist_circumference' },
          label: 'Waist',
        },
      ],
      existence,
    )
    expect(Array.isArray(ordered) && ordered.map((item) => item.position)).toEqual([1, 2])
    expect(Array.isArray(ordered) && ordered.map((item) => item.label)).toEqual(['Weight', 'Waist'])
  })
})

describe('experiment lifecycle rules', () => {
  it('schedules a window and reserves completed status', () => {
    expect(experimentWindowError(null, null)).toEqual({ error: 'A scheduled experiment needs a start date and an end date.' })
    expect(experimentWindowError('2026-10-05', '2026-09-28')).toEqual({
      error: 'The window end must be on or after the window start.',
    })
    expect(experimentWindowError('2026-09-28', '2026-10-05')).toEqual({
      windowStart: '2026-09-28',
      windowEnd: '2026-10-05',
    })
    expect(experimentStatusTransitionError('accepted', 'scheduled')).toBeNull()
    expect(experimentStatusTransitionError('scheduled', 'active')).toBeNull()
    expect(experimentStatusTransitionError('active', 'completed')).toMatch(/result workflow/)
    expect(experimentStatusTransitionError('active', 'inconclusive')).toMatch(/result workflow/)
    expect(experimentStatusTransitionError('active', 'superseded')).toMatch(/cannot move/)
    expect(experimentStatusTransitionError('abandoned', 'active')).toMatch(/cannot move/)
    expect(experimentStatusTransitionError('superseded', 'accepted')).toMatch(/cannot move/)
    expect(todayLabExperimentVisible('accepted')).toBe(false)
    expect(todayLabExperimentVisible('scheduled')).toBe(true)
    expect(todayLabExperimentVisible('active')).toBe(true)
    expect(todayLabExperimentVisible('abandoned')).toBe(false)
    expect(todayLabExperimentVisible('superseded')).toBe(false)
  })
})

describe('lab links and context controls', () => {
  it('stores multiple interventions and one primary benchmark without changing context records', () => {
    const controls = parseContextControls(['travel', 'sick', { tagKey: 'travel', controlMode: 'observe' }])
    expect(controls).toEqual([
      { tagKey: 'sick', controlMode: 'observe' },
      { tagKey: 'travel', controlMode: 'observe' },
    ])
    expect(parseContextControls([{ tagKey: 'travel', controlMode: 'exclude' }])).toEqual({
      error: 'Context controls can only observe a tag. They do not exclude days.',
    })
    const other = '55555555-5555-4555-8555-555555555555'
    const links = parseSupplementLinks(
      [
        { supplementId: SUPPLEMENT, role: 'intervention' },
        { supplementId: other, role: 'intervention' },
      ],
      new Set([SUPPLEMENT, other]),
    )
    expect(links).toEqual([
      { supplementId: SUPPLEMENT, role: 'intervention' },
      { supplementId: other, role: 'intervention' },
    ])
    expect(parseSupplementLinks([{ supplementId: MISSING, role: 'tracked' }], existence.supplementIds)).toEqual({
      error: 'That supplement was not found.',
    })
    expect(
      parseBenchmarkLinks(
        [
          { benchmarkDefinitionId: BENCHMARK, role: 'primary' },
          { benchmarkDefinitionId: BENCHMARK, role: 'secondary' },
        ],
        existence.benchmarkIds,
      ),
    ).toEqual({ error: 'A benchmark can only be linked once.' })
    const migration = readFileSync('migrations/0021_personal_lab_protocols.sql', 'utf8')
    const supplementTable = migration.slice(migration.indexOf('CREATE TABLE experiment_supplements'))
    const workoutParents = migration.slice(migration.indexOf('ALTER TABLE workout_sessions'))
    expect(workoutParents).toContain('experiment_id UUID REFERENCES experiments (id)')
    expect(workoutParents).not.toContain('ON DELETE')
    expect(supplementTable).toContain('REFERENCES supplements (id)')
    expect(supplementTable.split('REFERENCES supplements (id)')[1]?.slice(0, 40)).not.toContain('ON DELETE')
  })
})
