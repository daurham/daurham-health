import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  buildExperimentSuggestions,
  compileAcceptedExperiment,
} from '../src/domain/experiment-suggestions/index.ts'
import type { SuggestionInput } from '../src/domain/experiment-suggestions/types.ts'
import { LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.ts'

const GOAL = '11111111-1111-4111-8111-111111111111'
const VERSION = '22222222-2222-4222-8222-222222222222'

function input(overrides: Partial<SuggestionInput> = {}): SuggestionInput {
  return {
    protocols: [],
    covers: [],
    goals: [],
    maintenanceCalibration: {
      eligible: true,
      asOf: '2026-10-08',
      why: 'A controlled observation period could reduce uncertainty before changing the weight-goal plan.',
      durationDays: 14,
      requiredNutritionDays: 10,
      requiredWeightMeasurements: 5,
      linkedGoalId: GOAL,
      linkedGoalVersionId: VERSION,
      estimatePeriodStart: '2026-09-24',
      estimatePeriodEnd: '2026-10-07',
      observedMaintenanceKcal: 2250,
      plateauState: 'possible_plateau',
      evidenceRefs: [
        'maintenance:estimate',
        'maintenance:nutrition-quality',
        'maintenance:body-quality',
        'maintenance:plateau-state',
      ],
    },
    ...overrides,
  }
}

describe('I7 maintenance calibration Lab suggestion', () => {
  it('creates a deterministic observation protocol without prescribing a calorie target', () => {
    const candidate = buildExperimentSuggestions(input()).find((item) => item.kind === 'maintenance_calibration')
    expect(candidate).toBeTruthy()
    expect(candidate?.presentation).toBe('observation')
    expect(candidate?.title).toBe('Weight-response calibration')
    expect(candidate?.protocol.goalId).toBe(GOAL)
    expect(candidate?.protocol.goalVersionId).toBe(VERSION)
    expect(candidate?.protocol.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          domain: 'body',
          requirementKind: 'body_metric',
          selector: { metricKey: 'weight' },
          criteria: expect.objectContaining({ minimumObservations: 5 }),
        }),
        expect.objectContaining({
          domain: 'nutrition',
          requirementKind: 'nutrition_metric',
          selector: { metricKey: 'calories' },
          criteria: expect.objectContaining({ minimumObservations: 10, minimumCoveragePercent: 70 }),
        }),
      ]),
    )
    expect(candidate?.protocol.contextControls.map((item) => item.tagKey)).toEqual(
      expect.arrayContaining(['travel', 'late_meal', 'unusual_stress', 'poor_sleep_opportunity']),
    )
    expect(candidate?.limitations).toContain('does not prescribe a calorie target')
    expect(candidate?.protocol.instructions).toContain('Do not deliberately manipulate hydration or sodium')
  })

  it('keeps the accepted experiment owner-reviewed and links the active weight goal', () => {
    const candidate = buildExperimentSuggestions(input())[0]!
    const plan = compileAcceptedExperiment(candidate, { usedAiDraft: false })
    expect(plan.originKind).toBe('deterministic_candidate')
    expect(plan.originTrigger).toBe('maintenance_calibration')
    expect(plan.legacyOrigin).toBe('goal_plateau')
    expect(plan.goalId).toBe(GOAL)
    expect(plan.goalVersionId).toBe(VERSION)
    expect(plan.requirements.some((item) => item.selector.metricKey === 'calories')).toBe(true)
  })

  it('suppresses the calibration when an open experiment already covers the same goal', () => {
    const suggestions = buildExperimentSuggestions(input({
      covers: [{ status: 'active', benchmarkDefinitionId: null, goalId: GOAL }],
    }))
    expect(suggestions.some((item) => item.kind === 'maintenance_calibration')).toBe(false)
  })

  it('updates the provenance constraint and schema head without adding a new canonical table', () => {
    expect(LATEST_SCHEMA_MIGRATION).toBe('0050_training_plan_repeat_blocks.sql')
    const migration = readFileSync('migrations/0047_maintenance_calibration_experiment_origin.sql', 'utf8')
    expect(migration).toContain("'maintenance_calibration'")
    expect(migration).not.toMatch(/CREATE TABLE/i)
  })
})
