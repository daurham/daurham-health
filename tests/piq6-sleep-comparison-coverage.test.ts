import { describe, it, expect } from 'vitest'
import { assessExperimentComparison, experimentComparisonCopy, experimentComparisonLoadStart } from '../src/domain/experiment-comparison.js'
import { emptyCriteria, type ExperimentRequirementSpec, type DailyMetricPoint } from '../src/domain/experiment-results.js'

const req = (kind:string, metricKey:string): ExperimentRequirementSpec => ({
  id: kind+':'+metricKey, role:'primary_outcome', requirementKind:kind, selector:{metricKey},
  label:metricKey, required:true, criteria:emptyCriteria(),
})
const pre = ['2026-09-28','2026-09-29','2026-10-01','2026-10-04']
const post = ['2026-10-05','2026-10-06','2026-10-08','2026-10-11']
const nights=(dates: string[], sourceKey='watch-a', eligible=true):DailyMetricPoint[]=>
  dates.map(date=>({date,metricKey:'total_sleep_minutes',value:455,eligible,sourceKey}))
const food=(dates: string[]):DailyMetricPoint[]=>
  dates.map(date=>({date,metricKey:'protein',value:110}))
const assess=(overrides:Partial<Parameters<typeof assessExperimentComparison>[0]>={})=>
  assessExperimentComparison({
    reportedImplementationDate:'2026-10-05',windowStart:'2026-10-01',
    effectiveEndDate:'2026-10-11',today:'2026-10-17',
    requirements:[req('sleep_metric','total_sleep_minutes')],
    sleep:[...nights(pre),...nights(post)],nutrition:[],
    ...overrides,
  })

describe('PIQ-6.3 same-source sleep baseline quality',()=>{
  it('accepts seven-day coverage from one eligible sleep source, as descriptive only',()=>{
    const r=assess()
    expect(r.state).toBe('descriptive_coverage')
    expect(r.metrics).toEqual([{
      requirementId:'sleep_metric:total_sleep_minutes',
      outcomeKind:'sleep_metric',metricKey:'total_sleep_minutes',
      beforeDays:4,afterDays:4,beforeExpected:7,afterExpected:7,
    }])
    expect(experimentComparisonCopy(r)).toContain('does not verify adherence')
  })
  it('rejects in-bed-only, partial nights and missing nights',()=>{
    const r=assess({sleep:[...nights(pre),...nights(post.slice(0,3),'watch-a',false)]})
    expect(r.state).toBe('insufficient_coverage')
    expect(r.metrics[0]?.afterDays).toBe(0)
  })
  it('a source switch is insufficient even with full nights',()=>{
    const r=assess({sleep:[...nights(pre,'watch-a'),...nights(post,'watch-b')]})
    expect(r.state).toBe('insufficient_coverage')
    expect(r.reason).toBe('inconsistent_sleep_sources')
    expect(experimentComparisonCopy(r)).toContain('recording sources changed')
  })
  it('missing source identity is not equivalent to consistent provenance',()=>{
    const sleep=[...nights(pre),...nights(post)].map(({sourceKey:_unused,...p})=>p)
    const r=assess({sleep})
    expect(r.reason).toBe('inconsistent_sleep_sources')
  })
  it('sleep and nutrition must both meet the coverage screen',()=>{
    const base=[...nights(pre),...nights(post)]
    const reqs=[req('sleep_metric','total_sleep_minutes'),req('nutrition_metric','protein')]
    expect(assess({requirements:reqs,sleep:base,nutrition:food([...pre,...post])}).state)
      .toBe('descriptive_coverage')
    const r=assess({requirements:reqs,sleep:base,nutrition:food(post)})
    expect(r.state).toBe('insufficient_coverage')
    expect(r.metrics).toHaveLength(2)
  })
  it('activity/body/training/benchmark outcomes are not silently treated as supported',()=>{
    for(const kind of ['activity_metric','body_metric','training_measure','benchmark_definition']){
      const r=assess({requirements:[req(kind,kind==='activity_metric'?'steps_count':'weight')]})
      expect(r.reason).toBe('unsupported_primary_outcome')
    }
  })
  it('does not retrieve or count the active calendar day as a complete sleep night',()=>{
    const r=assess({reportedImplementationDate:'2026-10-17',effectiveEndDate:'2026-10-17',today:'2026-10-17',sleep:nights(['2026-10-17'])})
    expect(r.reason).toBe('follow_up_in_progress')
  })
  it('baseline loading never shrinks the canonical experiment window',()=>{
    expect(experimentComparisonLoadStart('2026-10-01','2026-10-25')).toBe('2026-10-01')
    expect(experimentComparisonLoadStart('2026-10-01','2026-10-05')).toBe('2026-09-28')
  })
})
