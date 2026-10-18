import { describe,expect,it } from 'vitest'
import { readFileSync } from 'node:fs'
import { computeExperimentSourceValueSeal } from '../src/domain/experiment-source-value-seal.js'
import type { DailyMetricPoint } from '../src/domain/experiment-results.js'
import type { ExperimentComparisonReview } from '../src/domain/experiment-comparison.js'
const pre=['2026-09-24','2026-09-25','2026-09-27','2026-09-30']
const post=['2026-10-01','2026-10-02','2026-10-05','2026-10-07']
const make=(dates:string[],value:number,metricKey='protein'):DailyMetricPoint[]=>
  dates.map(date=>({date,metricKey,value}))
const nutrition=[...make(pre,85),...make(post,115)]
const review:ExperimentComparisonReview={
  state:'descriptive_coverage',reason:'coverage_screen_met',
  baselineWindow:{start:'2026-09-24',end:'2026-09-30'},
  followUpWindow:{start:'2026-10-01',end:'2026-10-07'},
  metrics:[{requirementId:'r1',outcomeKind:'nutrition_metric',metricKey:'protein',
    beforeDays:4,afterDays:4,beforeExpected:7,afterExpected:7}],
}
const get=(changed:Partial<Parameters<typeof computeExperimentSourceValueSeal>[0]>={})=>
  computeExperimentSourceValueSeal({review,nutrition,sleep:[],...changed})
describe('PIQ-6.5 stable source-value seal (never an outcome efficacy estimate)',()=>{
  it('produces stable 64-hex digest with row-order independence and unrelated metric exclusion',async()=>{
    const one=await get()
    expect(one).toMatch(/^[a-f0-9]{64}$/)
    expect(await get({nutrition:[...nutrition].reverse()})).toBe(one)
    expect(await get({nutrition:[...nutrition,...make(pre,900,'calories')]})).toBe(one)
  })
  it('detects exact same-day value correction even when day counts and rounded averages stay the same',async()=>{
    const old=await get()
    const updated=nutrition.map((p,i)=>i===0?{...p,value:85.01}:p)
    expect(await get({nutrition:updated})).not.toBe(old)
    expect(await get({nutrition:nutrition.map((p,i)=>i===0?{...p,value:85.00001}:p)})).not.toBe(old)
  })
  it('detects deletion, extra verified day, duplicate, malformed, or out-of-range values',async()=>{
    expect(await get({nutrition:nutrition.slice(0,-1)})).toBeNull()
    expect(await get({nutrition:[...nutrition,...make(['2026-09-26'],100)]})).toBeNull()
    expect(await get({nutrition:[...nutrition,nutrition[0]!]})).toBeNull()
    expect(await get({nutrition:[...nutrition,{...nutrition[0]!,value:null}]})).toBeNull()
    expect(await get({nutrition:nutrition.map((p,i)=>i===0?{...p,value:1001}:p)})).toBeNull()
    expect(await get({nutrition:nutrition.map((p,i)=>i===0?{...p,eligible:false}:p)})).toBeNull()
  })
  it('protects prespecified outcomes and 7-day windows; missing or unsupported seals cannot be invented',async()=>{
    expect(await get({review:{...review,state:'not_assessable',reason:'follow_up_in_progress'}})).toBeNull()
    expect(await get({review:{...review,metrics:[{...review.metrics[0]!,metricKey:'heart_rate'}]}})).toBeNull()
    expect(await get({review:{...review,metrics:[...review.metrics,review.metrics[0]!]}})).toBeNull()
    expect(await get({review:{...review,followUpWindow:{start:'2026-10-02',end:'2026-10-08'}}})).toBeNull()
  })
  it('binds sleep source identity; identical minutes from a different watch do not reuse the digest',async()=>{
    const sleepReview:ExperimentComparisonReview={...review,metrics:[{
      requirementId:'s1',outcomeKind:'sleep_metric',metricKey:'total_sleep_minutes',
      beforeDays:4,afterDays:4,beforeExpected:7,afterExpected:7,
    }]}
    const nights=[...make(pre,420,'total_sleep_minutes'),...make(post,460,'total_sleep_minutes')]
      .map(x=>({...x,sourceKey:'watch-A',eligible:true}))
    const a=await get({review:sleepReview,nutrition:[],sleep:nights})
    expect(a).toMatch(/^[a-f0-9]{64}$/)
    expect(await get({review:sleepReview,nutrition:[],
      sleep:nights.map(p=>({...p,sourceKey:'watch-B'}))})).not.toBe(a)
    expect(await get({review:sleepReview,nutrition:[],
      sleep:nights.map((p,i)=>({...p,sourceKey:i>3?'watch-B':'watch-A'}))})).toBeNull()
    expect(await get({review:sleepReview,nutrition:[],sleep:nights.map(p=>({...p,sourceKey:undefined}))})).toBeNull()
  })
  it('server seals original evidence into immutable snapshot and verifies fresh values before returning UI numbers',()=>{
    const code=readFileSync('server/lab/experiment-results.ts','utf8')
    const commit=code.slice(code.indexOf('export async function commitExperimentResult'),
      code.indexOf('export const EXPERIMENT_CONTEXT_REVISION_SQL'))
    expect(commit).toContain('sourceValueSeal: built.sourceValueSeal')
    expect(commit).toContain('snapshotFingerprint = await experimentEvidenceFingerprint(snapshot)')
    expect(commit).toContain('EXPERIMENT_COMPARISON_SNAPSHOT_INSERT_SQL')
    const read=code.slice(code.indexOf('export async function getExperimentResult'),
      code.indexOf('export async function invalidateExperimentResult'))
    expect(read).toContain('verifyCurrentOutcomeSourceSeal(')
    expect(read).toContain('comparisonSnapshot.sourceValueSeal,currentSeal')
    const evaluator=code.slice(code.indexOf('async function buildEvaluation('),
      code.indexOf('function publicPreview('))
    expect(evaluator).toContain('computeExperimentSourceValueSeal({')
    expect(evaluator).toContain('nutrition:evidence.nutrition,sleep:evidence.sleep')
  })
})
