import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  buildFinalizationSourceDigestExpression,
  EXPERIMENT_FINALIZATION_SOURCE_DIGEST_SQL,
  EXPERIMENT_FINALIZATION_SOURCE_CAS_EXPRESSION,
  EXPERIMENT_VERIFIED_NUTRITION_SQL,
} from '../server/lab/experiment-results.js'

describe('PIQ-6.5 PostgreSQL statement-snapshot primary nutrition/sleep CAS',()=>{
  it('reuses the exact canonical verified-day nutrition query',()=>{
    const read=buildFinalizationSourceDigestExpression(1)
    expect(read).toContain('WITH verified_days AS')
    expect(read).toContain('FROM nutrition_entries e')
    expect(read).toContain('JOIN verified_days d ON d.date = e.log_date::text')
    expect(read).toContain('analysis_eligible')
    expect(read).toContain('logical_source_key')
    expect(read).toContain('jsonb_agg(to_jsonb(n) ORDER BY n.log_date)')
    expect(read).toContain('jsonb_agg(to_jsonb(s) ORDER BY s.sleep_date)')
    expect(read).toContain('md5(')
    expect(EXPERIMENT_VERIFIED_NUTRITION_SQL).toContain('current_source.revision')
    expect(EXPERIMENT_FINALIZATION_SOURCE_DIGEST_SQL).toBe('SELECT '+read+' AS digest')
  })
  it('moves every source query parameter to exactly the 20-25 INSERT parameter window',()=>{
    const read=buildFinalizationSourceDigestExpression(1)
    const write=buildFinalizationSourceDigestExpression(20)
    expect(EXPERIMENT_FINALIZATION_SOURCE_CAS_EXPRESSION).toEqual(write)
    for (const index of [1,2,3,4,5,6]) {
      const readParam=new RegExp('\\$'+index+'(?![0-9])')
      const writeParam=new RegExp('\\$'+(index+19)+'(?![0-9])')
      expect(read).toMatch(readParam)
      expect(write).toMatch(writeParam)
    }
    for(const index of [1,2,3,4,5,6,19,26]) {
      const bad=new RegExp('\\$'+index+'(?![0-9])')
      expect(write).not.toMatch(bad)
    }
    expect(()=>buildFinalizationSourceDigestExpression(0)).toThrow()
    expect(()=>buildFinalizationSourceDigestExpression(51)).toThrow()
    expect(()=>buildFinalizationSourceDigestExpression(1.5)).toThrow()
  })
  it('checks the exact signed digest in the same SQL INSERT statement as the result',()=>{
    const code=readFileSync('server/lab/experiment-results.ts','utf8')
    const commit=code.slice(code.indexOf('export async function commitExperimentResult'),
      code.indexOf('export const EXPERIMENT_CONTEXT_SIGNATURE_SQL'))
    expect(commit).toContain('const canonicalSourceDigest = await readFinalizationSourceDigest(sql,built.sourceGuardScope)')
    expect(commit).toContain('const rechecked = await buildEvaluation(experimentId,attestation,resolvedToday)')
    expect(commit).toContain('JSON.stringify(built.sourceGuardScope)!==JSON.stringify(rechecked.sourceGuardScope)')
    expect(commit).toContain('AND (${EXPERIMENT_FINALIZATION_SOURCE_CAS_EXPRESSION}) = $26::text')
    expect(commit).toContain('...finalizationSourceGuardParams(built.sourceGuardScope)')
    expect(commit).toContain('canonicalSourceDigest,')
    expect(commit).toContain('sql.query(EXPERIMENT_COMPARISON_SNAPSHOT_INSERT_SQL')
    expect(commit).toContain('await sql.transaction(statements)')
    expect(commit).not.toContain('ROLLBACK')
    expect(EXPERIMENT_FINALIZATION_SOURCE_CAS_EXPRESSION).not.toContain('INSERT INTO')
  })
  it('does not access owner notes, health profile text, new migrations, or paid AI',()=>{
    const digest=EXPERIMENT_FINALIZATION_SOURCE_CAS_EXPRESSION.toLowerCase()
    for(const text of ['owner_note','clinical_conditions','persistent_health_context',
      'gemini','openai','target_min','insert into','update ','delete from']) {
      expect(digest).not.toContain(text)
    }
    expect(digest).toContain("else 'unused-nutrition' end")
    expect(digest).toContain("else 'unused-sleep' end")
  })
})
