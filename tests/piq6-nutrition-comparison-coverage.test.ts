import { describe, expect, it } from 'vitest'
import { emptyCriteria, type DailyMetricPoint, type ExperimentRequirementSpec } from '../src/domain/experiment-results.js'
import { assessNutritionExperimentComparison, nutritionComparisonCopy, nutritionComparisonLoadStart } from '../src/domain/experiment-comparison.js'
import { EXPERIMENT_VERIFIED_NUTRITION_SQL } from '../server/lab/experiment-results.js'

function req(key = 'calories', kind = 'nutrition_metric', id = key): ExperimentRequirementSpec {
  return { id, role: 'primary_outcome', requirementKind: kind, selector: { metricKey: key },
    label: key, required: true, criteria: emptyCriteria() }
}
const before = ['2026-09-28','2026-09-29','2026-10-01','2026-10-04']
const after = ['2026-10-05','2026-10-06','2026-10-08','2026-10-11']
const points = (dates: string[], metricKey='calories'): DailyMetricPoint[] =>
  dates.map((date)=>({date, metricKey, value: 2100}))
function assess(overrides: Partial<Parameters<typeof assessNutritionExperimentComparison>[0]>={}) {
  return assessNutritionExperimentComparison({
    reportedImplementationDate: '2026-10-05', windowStart: '2026-10-01',
    effectiveEndDate: '2026-10-11', today: '2026-10-17',
    requirements: [req()], nutrition: [...points(before), ...points(after)], ...overrides,
  })
}

describe('PIQ-6.3 owner-date nutrition comparison coverage', () => {
  it('does not infer implementation from Lab active or scheduled date', () => {
    const result=assess({reportedImplementationDate:null})
    expect(result.state).toBe('not_assessable')
    expect(result.reason).toBe('no_reported_implementation')
    expect(nutritionComparisonCopy(result)).toContain('not proof of implementation')
  })
  it('screens exactly seven pre-change dates and at most seven completed post-change days', () => {
    const result=assess()
    expect(result.state).toBe('descriptive_coverage')
    expect(result.baselineWindow).toEqual({start:'2026-09-28',end:'2026-10-04'})
    expect(result.followUpWindow).toEqual({start:'2026-10-05',end:'2026-10-11'})
    expect(result.metrics).toEqual([{metricKey:'calories',beforeDays:4,afterDays:4,beforeExpected:7,afterExpected:7}])
    expect(nutritionComparisonCopy(result)).toContain('does not verify adherence')
  })
  it('missing and unreliable days never become explicit zero or complete', () => {
    const result=assess({ nutrition: [
      ...points(['2026-09-28','2026-10-01']),
      {date:'2026-10-02',metricKey:'calories',value:null},
      ...points(['2026-10-05','2026-10-06','2026-10-07','2026-10-11']),
    ]})
    expect(result.state).toBe('insufficient_coverage')
    expect(result.metrics[0]?.beforeDays).toBe(2)
    expect(nutritionComparisonCopy(result)).toContain('missing or incomplete days are not zero')
  })
  it('deduplicates same-date observations rather than inflating day count', () => {
    const result=assess({nutrition:[...points(before),...points(before),...points(after)]})
    expect(result.metrics[0]?.beforeDays).toBe(4)
  })
  it('does not count partial current day or outside-window records', () => {
    const result=assess({reportedImplementationDate:'2026-10-16',effectiveEndDate:'2026-10-17',today:'2026-10-17',
      nutrition:points(['2026-10-17','2026-10-16','2026-10-15','2026-10-14'])})
    expect(result.followUpWindow).toEqual({start:'2026-10-16',end:'2026-10-16'})
    expect(result.state).toBe('insufficient_coverage')
    expect(result.metrics[0]?.afterDays).toBe(1)
  })
  it('a planned change today cannot be reviewed as a completed post day', () => {
    const result=assess({reportedImplementationDate:'2026-10-17',effectiveEndDate:'2026-10-17',today:'2026-10-17'})
    expect(result.reason).toBe('follow_up_in_progress')
  })
  it('rejects invalid and future implementation dates without presenting assurance', () => {
    for(const date of ['2026-09-30','2026-10-18','2026-10-35']){
      const r=assess({reportedImplementationDate:date})
      expect(r.state).toBe('not_assessable')
      expect(r.reason).toBe('invalid_implementation_date')
    }
  })
  it('never cherry-picks just one favorable outcome from mixed primaries', () => {
    const r=assess({requirements:[req(),req('waist','body_metric','body')]})
    expect(r.state).toBe('not_assessable')
    expect(r.reason).toBe('unsupported_primary_outcome')
  })
  it('all required nutrition metrics need their own before/after coverage', () => {
    const r=assess({requirements:[req(),req('protein','nutrition_metric','p')],
      nutrition:[...points(before),...points(after),...points(['2026-10-05'],'protein')]})
    expect(r.state).toBe('insufficient_coverage')
    expect(r.metrics).toHaveLength(2)
  })
  it('does not truncate the original experiment window if implementation is late', () => {
    expect(nutritionComparisonLoadStart('2026-10-01', '2026-10-25')).toBe('2026-10-01')
    expect(nutritionComparisonLoadStart('2026-10-01', '2026-10-05')).toBe('2026-09-28')
    expect(nutritionComparisonLoadStart('2026-10-01', null)).toBe('2026-10-01')
  })
  it('uses the already-gated owner-confirmed complete-day nutrition query',()=>{
    expect(EXPERIMENT_VERIFIED_NUTRITION_SQL).toContain("owner_report = 'complete'")
    expect(EXPERIMENT_VERIFIED_NUTRITION_SQL).toContain('current_source.revision')
    expect(EXPERIMENT_VERIFIED_NUTRITION_SQL).toContain('c.health_date < $3::date')
    expect(EXPERIMENT_VERIFIED_NUTRITION_SQL).toContain('bool_and(e.protein IS NOT NULL AND e.protein >= 0)')
  })
})
