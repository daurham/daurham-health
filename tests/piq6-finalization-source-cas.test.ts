import {describe,expect,it} from 'vitest'
import {readFileSync} from 'node:fs'
import {
  buildFinalizationSourceDigestExpression,
  EXPERIMENT_FINALIZATION_SOURCE_DIGEST_SQL,
  EXPERIMENT_FINALIZATION_SOURCE_CAS_EXPRESSION,
  EXPERIMENT_VERIFIED_NUTRITION_SQL,
  EXPERIMENT_TRAINING_SOURCE_SQL,
  EXPERIMENT_BENCHMARK_SOURCE_SQL,
  EXPERIMENT_ACTIVITY_SOURCE_SQL,
  EXPERIMENT_BODY_SOURCE_SQL,
  EXPERIMENT_CONTEXT_SOURCE_SQL,
  EXPERIMENT_REQUIREMENT_SOURCE_SQL,
  EXPERIMENT_SUPPLEMENT_LINK_SOURCE_SQL,
  EXPERIMENT_CONTROL_SOURCE_SQL,
  EXPERIMENT_SUPPLEMENT_SOURCE_SQL,
  EXPERIMENT_SUPPLEMENT_SCHEDULE_SOURCE_SQL,
  EXPERIMENT_SUPPLEMENT_STATUS_SOURCE_SQL,
  EXPERIMENT_SUPPLEMENT_ADHERENCE_SOURCE_SQL,
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
    expect(read).toContain('$7::uuid')
    expect(read).toContain('$9::uuid[]')
    expect(read).toContain('$10::text[]')
    expect(read).toContain('$4')
    expect(EXPERIMENT_VERIFIED_NUTRITION_SQL).toContain('current_source.revision')
    expect(read).toContain('FROM workout_sessions s')
    expect(read).toContain('JOIN workout_session_exercises e')
    expect(read).toContain('LEFT JOIN workout_sets ws')
    expect(read).toContain('FROM benchmark_results r')
    expect(read).toContain('LEFT JOIN benchmark_result_values val')
    expect(read).toContain('jsonb_agg(to_jsonb(t)')
    expect(read).toContain('jsonb_agg(to_jsonb(b)')
    expect(EXPERIMENT_TRAINING_SOURCE_SQL).toContain('ws.weight_kg')
    expect(EXPERIMENT_BENCHMARK_SOURCE_SQL).toContain('val.value')
    expect(read).toContain('FROM activity_daily_summaries')
    expect(read).toContain('FROM daily_context c')
    expect(read).toContain('LEFT JOIN daily_context_tags t')
    expect(read).toContain('FROM body_metrics m')
    expect(read).toContain('JOIN body_measurement_sessions s')
    expect(read).toContain('jsonb_agg(to_jsonb(a)')
    expect(read).toContain('jsonb_agg(to_jsonb(c)')
    expect(read).toContain('jsonb_agg(to_jsonb(m)')
    expect(EXPERIMENT_ACTIVITY_SOURCE_SQL).toContain('active_energy_kcal')
    expect(EXPERIMENT_BODY_SOURCE_SQL).toContain('s.measured_at')
    expect(EXPERIMENT_BODY_SOURCE_SQL).toContain("s.measured_at >= (($2::date - INTERVAL '2 days') AT TIME ZONE 'UTC')")
    expect(EXPERIMENT_BODY_SOURCE_SQL).toContain("s.measured_at < (($3::date + INTERVAL '3 days') AT TIME ZONE 'UTC')")
    expect(read).toContain("s.measured_at >= (($1::date - INTERVAL '2 days') AT TIME ZONE 'UTC')")
    expect(read).toContain("s.measured_at < (($2::date + INTERVAL '3 days') AT TIME ZONE 'UTC')")
    expect(buildFinalizationSourceDigestExpression(20)).toContain("s.measured_at >= (($20::date - INTERVAL '2 days') AT TIME ZONE 'UTC')")
    expect(buildFinalizationSourceDigestExpression(20)).toContain("s.measured_at < (($21::date + INTERVAL '3 days') AT TIME ZONE 'UTC')")
    expect(EXPERIMENT_CONTEXT_SOURCE_SQL).toContain('t.tag_key')
    expect(EXPERIMENT_REQUIREMENT_SOURCE_SQL).toContain('criteria')
    expect(EXPERIMENT_SUPPLEMENT_LINK_SOURCE_SQL).toContain('experiment_supplements')
    expect(EXPERIMENT_CONTROL_SOURCE_SQL).toContain('lab_protocol_context_controls')
    // Metadata read in the independent JS evaluation is also checked within
    // the final INSERT's PostgreSQL statement snapshot.
    expect(read).toContain('FROM experiments e')
    expect(read).toContain('LEFT JOIN health_profile p ON p.singleton_id = 1')
    expect(read).toContain('LEFT JOIN experiment_goals eg ON eg.experiment_id = e.id')
    expect(read).toContain('LEFT JOIN goal_versions v ON v.goal_id = g.id AND v.is_current')
    expect(read).toContain('WHERE e.id = $7::uuid')
    expect(read).toContain('jsonb_agg(to_jsonb(owner_context)')
    expect(EXPERIMENT_SUPPLEMENT_SOURCE_SQL).toContain('FROM supplements')
    expect(EXPERIMENT_SUPPLEMENT_SCHEDULE_SOURCE_SQL).toContain('FROM supplement_schedules')
    expect(EXPERIMENT_SUPPLEMENT_SCHEDULE_SOURCE_SQL).toContain('effective_from <= $3::date')
    expect(EXPERIMENT_SUPPLEMENT_SCHEDULE_SOURCE_SQL).toContain('effective_through >= $2::date')
    expect(read).toContain('effective_from <= $2::date')
    expect(read).toContain('effective_through >= $8::date')
    expect(buildFinalizationSourceDigestExpression(20)).toContain('effective_from <= $21::date')
    expect(buildFinalizationSourceDigestExpression(20)).toContain('effective_through >= $27::date')
    expect(EXPERIMENT_SUPPLEMENT_STATUS_SOURCE_SQL).toContain('FROM supplement_status_events')
    expect(EXPERIMENT_SUPPLEMENT_STATUS_SOURCE_SQL).toContain('SELECT DISTINCT ON (supplement_id)')
    expect(EXPERIMENT_SUPPLEMENT_STATUS_SOURCE_SQL).toContain('effective_date BETWEEN $2::date AND $3::date')
    expect(EXPERIMENT_SUPPLEMENT_STATUS_SOURCE_SQL).toContain('effective_date < $2::date')
    expect(read).toContain('effective_date BETWEEN $8::date AND $2::date')
    expect(read).toContain('effective_date < $8::date')
    expect(buildFinalizationSourceDigestExpression(20)).toContain('effective_date BETWEEN $27::date AND $21::date')
    expect(buildFinalizationSourceDigestExpression(20)).toContain('effective_date < $27::date')
    expect(EXPERIMENT_SUPPLEMENT_ADHERENCE_SOURCE_SQL).toContain('FROM supplement_adherence')
    for(const item of ['supp','schedule','event','adherence','link','requirement','control']){
      expect(read).toContain('jsonb_agg(to_jsonb('+item+')')
    }
    expect(read).toContain('$11::uuid[]')
    expect(read).toContain('$12::uuid')
    expect(EXPERIMENT_FINALIZATION_SOURCE_DIGEST_SQL).toBe('SELECT '+read+' AS digest')
  })
  it('moves every source query parameter to the 20-31 INSERT parameter window',()=>{
    const read=buildFinalizationSourceDigestExpression(1)
    const write=buildFinalizationSourceDigestExpression(20)
    expect(EXPERIMENT_FINALIZATION_SOURCE_CAS_EXPRESSION).toEqual(write)
    for (const index of [1,2,3,4,5,6,7,8,9,10,11,12]) {
      const readParam=new RegExp('\\$'+index+'(?![0-9])')
      const writeParam=new RegExp('\\$'+(index+19)+'(?![0-9])')
      expect(read).toMatch(readParam)
      expect(write).toMatch(writeParam)
    }
    for(const index of [1,2,3,4,5,6,7,8,9,10,11,12,19,32]) {
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
    expect(commit).toContain('AND (${EXPERIMENT_FINALIZATION_SOURCE_CAS_EXPRESSION}) = $32::text')
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
