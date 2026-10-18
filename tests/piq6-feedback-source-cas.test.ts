import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import type {Sql} from '../server/db.js'
import {
  buildFeedbackOutcomeSourceDigestExpression,
  EXPERIMENT_FEEDBACK_SOURCE_DIGEST_SQL,
  EXPERIMENT_FEEDBACK_SOURCE_CAS_EXPRESSION,
  EXPERIMENT_VERIFIED_NUTRITION_SQL,
  verifySavedExperimentFeedbackEvidence,
} from '../server/lab/experiment-results.js'
import {buildOwnerFeedbackVerifiedInsertSql} from '../server/lab/outcome-feedback.js'
import {computeExperimentSourceValueSeal} from '../src/domain/experiment-source-value-seal.js'
import type {ExperimentComparisonSnapshot} from '../src/domain/experiment-comparison-snapshot.js'
import type {ExperimentComparisonReview} from '../src/domain/experiment-comparison.js'

const before=['2026-09-24','2026-09-25','2026-09-27','2026-09-30']
const after=['2026-10-01','2026-10-02','2026-10-05','2026-10-07']
const days=[...before,...after]
const review:ExperimentComparisonReview={
  state:'descriptive_coverage',reason:'coverage_screen_met',
  baselineWindow:{start:'2026-09-24',end:'2026-09-30'},
  followUpWindow:{start:'2026-10-01',end:'2026-10-07'},
  metrics:[{requirementId:'primary',outcomeKind:'nutrition_metric',metricKey:'protein',
    beforeDays:4,afterDays:4,beforeExpected:7,afterExpected:7}],
}
const entry=(date:string)=>({log_date:date,calories:1800,protein:date<'2026-10-01'?80:110,
  carbs:180,fat:75})
const nutritionRows=days.map(entry)
const points=nutritionRows.map(row=>({date:row.log_date,metricKey:'protein',value:row.protein}))
async function snapshot():Promise<ExperimentComparisonSnapshot>{
  return {snapshotVersion:1,recordedHealthDate:'2026-10-08',
    implementation:{provenance:'original',effectiveDate:'2026-10-01',revision:null},
    review,sourceValueSeal:await computeExperimentSourceValueSeal({review,nutrition:points,sleep:[]})}
}
function sourceSql(rows=nutritionRows,digestReads=['a'.repeat(32),'a'.repeat(32)]){
  let read=0
  return {
    query:async(sql:string)=>{
      if(sql===EXPERIMENT_FEEDBACK_SOURCE_DIGEST_SQL)return [{digest:digestReads[read++]}]
      if(sql===EXPERIMENT_VERIFIED_NUTRITION_SQL)return rows
      throw Error('Unexpected SQL outside read-only feedback guard')
    },
  } as unknown as Sql
}
describe('PIQ-6.5 source-corrected owner feedback write gate',()=>{
  it('uses canonical verified nutrition source and same-statement positional digest',()=>{
    const read=buildFeedbackOutcomeSourceDigestExpression(1)
    const write=buildFeedbackOutcomeSourceDigestExpression(10)
    expect(read).toContain('WITH verified_days AS')
    expect(read).toContain('JOIN verified_days d ON d.date = e.log_date::text')
    expect(read).toContain('FROM sleep_nightly_summaries')
    expect(read).toContain('$6::text')
    expect(write).toContain('$15::text')
    expect(write).toContain('$10::date')
    expect(write).toContain('$11::date')
    expect(EXPERIMENT_FEEDBACK_SOURCE_CAS_EXPRESSION).toBe(write)
    expect(EXPERIMENT_FEEDBACK_SOURCE_DIGEST_SQL).toBe('SELECT '+read+' AS digest')
    for(const bad of [0,-1,1.5,51])expect(()=>buildFeedbackOutcomeSourceDigestExpression(bad)).toThrow()
    const guarded=buildOwnerFeedbackVerifiedInsertSql(write)
    expect(guarded).toContain('AND ('+write+' = $16::text)')
    expect(guarded).toContain('ON CONFLICT (experiment_result_id,version) DO NOTHING')
    const code=readFileSync('server/lab/outcome-feedback.ts','utf8')
    expect(code).toContain('verifySavedExperimentFeedbackEvidence(sql,state.verifiedSnapshot,today)')
    expect(code).toContain('buildOwnerFeedbackVerifiedInsertSql(sourceModule.EXPERIMENT_FEEDBACK_SOURCE_CAS_EXPRESSION)')
    expect(code).toContain("parsed.action==='record'?await import('./experiment-results.js'):null")
    expect(guarded).not.toContain('owner_note AS')
  })
  it('accepts only unchanged eligible prespecified values and stable SQL projection',async()=>{
    const saved=await snapshot()
    expect(saved.sourceValueSeal).toMatch(/^[0-9a-f]{64}$/)
    expect(await verifySavedExperimentFeedbackEvidence(sourceSql(),saved,'2026-10-18'))
      .toEqual({scope:['2026-09-24','2026-10-07','2026-10-18',true,false,''],
        digest:'a'.repeat(32)})
    const changed=nutritionRows.map((row,i)=>i===0?{...row,protein:96}:row)
    expect(await verifySavedExperimentFeedbackEvidence(sourceSql(changed),saved,'2026-10-18')).toBeNull()
    expect(await verifySavedExperimentFeedbackEvidence(sourceSql(nutritionRows.slice(1)),saved,'2026-10-18')).toBeNull()
    expect(await verifySavedExperimentFeedbackEvidence(sourceSql(nutritionRows,['a'.repeat(32),'b'.repeat(32)]),
      saved,'2026-10-18')).toBeNull()
    expect(await verifySavedExperimentFeedbackEvidence(sourceSql(),{...saved,sourceValueSeal:null},
      '2026-10-18')).toBeNull()
    expect(await verifySavedExperimentFeedbackEvidence(sourceSql(nutritionRows,['broken']),
      saved,'2026-10-18')).toBeNull()
  })
})
