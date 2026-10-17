import { describe, expect, it } from 'vitest'
import { EXPERIMENT_VERIFIED_NUTRITION_SQL } from '../server/lab/experiment-results.js'
import {
  emptyCriteria, evaluateExperiment, type ExperimentEvidence, type ExperimentRequirementSpec,
} from '../src/domain/experiment-results.js'

const primary: ExperimentRequirementSpec = {
  id: '11111111-1111-4111-8111-111111111111',
  role: 'primary_outcome',
  requirementKind: 'nutrition_metric',
  selector: { metricKey: 'calories' },
  label: 'Daily calories',
  required: true,
  criteria: { ...emptyCriteria(), minimumObservations: 2, minimumCoveragePercent: 60 },
}
const emptyEvidence: ExperimentEvidence = {
  benchmarks: [], training: [], body: [], nutrition: [], activity: [], sleep: [],
  adherence: [], context: [], contextControls: [],
}
function review(nutrition: ExperimentEvidence['nutrition']) {
  return evaluateExperiment({
    windowStart: '2026-10-01',
    plannedWindowEnd: '2026-10-03',
    effectiveEndDate: '2026-10-03',
    windowOpen: false,
    protocolFollowed: 'followed',
    stoppedForSafety: false,
    requirements: [primary],
    evidence: { ...emptyEvidence, nutrition },
  })
}

describe('PIQ-6.3 verified nutrition outcome maturity', () => {
  it('reuses canonical owner-completeness and revision rules instead of raw logged totals', () => {
    const query = EXPERIMENT_VERIFIED_NUTRITION_SQL
    expect(query).toContain('FROM nutrition_day_completeness c')
    expect(query).toContain("c.owner_report = 'complete'")
    expect(query).toContain('NOT c.zero_intake_fast')
    expect(query).toContain('c.entry_revision = current_source.revision')
    expect(query).toContain('c.health_date < $3::date')
    expect(query).toContain("review_status = 'excluded_from_analysis'")
    expect(query).toContain("e.evidence_quality")
    expect(query).toContain('JOIN verified_days d ON d.date = e.log_date::text')
    expect(query).toContain('WHERE e.log_date BETWEEN $1::date AND $2::date')
    expect(query).toContain('SUM(e.protein) AS protein')
  })

  it('an empty eligible set is missing, not an interpretable experiment outcome', () => {
    const result = review([])
    expect(result.requirements[0]?.evaluationStatus).toBe('missing')
    expect(result.classification).toBe('incomplete')
    expect(result.requirements[0]?.summary).toMatchObject({
      observedDays: 0, windowDays: 3, coveragePercent: 0,
    })
  })

  it('one verified date does not satisfy a two-day primary outcome threshold', () => {
    const result = review([{ date: '2026-10-01', metricKey: 'calories', value: 2000 }])
    expect(result.requirements[0]?.evaluationStatus).toBe('insufficient')
    expect(result.classification).toBe('incomplete')
    expect(result.requirements[0]?.summary).toMatchObject({
      observedDays: 1, windowDays: 3, coveragePercent: expect.any(Number),
    })
  })

  it('two distinct verified complete dates can satisfy the configured outcome gate', () => {
    const result = review([
      { date: '2026-10-01', metricKey: 'calories', value: 2100 },
      { date: '2026-10-03', metricKey: 'calories', value: 1900 },
    ])
    expect(result.requirements[0]?.evaluationStatus).toBe('available')
    expect(result.classification).toBe('completed_interpretable')
    expect(result.requirements[0]?.summary).toMatchObject({ observedDays: 2, average: 2000 })
  })

  it('a malformed or missing source value does not become outcome evidence', () => {
    const result = review([
      { date: '2026-10-01', metricKey: 'calories', value: Number.NaN },
      { date: '2026-10-02', metricKey: 'calories', value: null },
    ])
    expect(result.requirements[0]?.evaluationStatus).toBe('missing')
    expect(result.classification).toBe('incomplete')
  })
})
