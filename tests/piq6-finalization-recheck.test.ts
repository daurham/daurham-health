import { describe,expect,it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  resultFinalizationEvidenceUnchanged,
  type ResultFinalizationEvidenceSignature,
} from '../src/domain/experiment-finalization-recheck.js'
import { experimentEvidenceFingerprint } from '../src/domain/experiment-results.js'

const base: ResultFinalizationEvidenceSignature = {
  resultFingerprint:'a'.repeat(64),
  classification:'completed_interpretable',
  effectiveEndDate:'2026-10-07',
  sourceValueSeal:'b'.repeat(64),
  contextRevisionSeal:'c'.repeat(64),
  comparisonReview:{
    state:'descriptive_coverage',reason:'coverage_screen_met',
    baselineWindow:{start:'2026-09-24',end:'2026-09-30'},
    followUpWindow:{start:'2026-10-01',end:'2026-10-07'},
    metrics:[{requirementId:'r1',outcomeKind:'nutrition_metric',metricKey:'protein',
      beforeDays:4,afterDays:4,beforeExpected:7,afterExpected:7}],
  },
  experiment:{
    id:'11111111-1111-4111-8111-111111111111',status:'active',
    protocolVersionId:'22222222-2222-4222-8222-222222222222',
    windowStart:'2026-09-24',windowEnd:'2026-10-07',
    implementationProvenance:'original',implementationDate:'2026-10-01',
    implementationRevision:null,
  },
}
const changes=(change:Partial<ResultFinalizationEvidenceSignature>) =>
  resultFinalizationEvidenceUnchanged(base,{...base,...change})

describe('PIQ-6.5 immutable result finalization recheck',()=>{
  it('keeps stable evidence unchanged without interpreting efficacy',()=>{
    expect(resultFinalizationEvidenceUnchanged(base,structuredClone(base))).toBe(true)
    expect(changes({resultFingerprint:null})).toBe(false)
    expect(resultFinalizationEvidenceUnchanged({...base,resultFingerprint:null},base)).toBe(false)
    expect(changes({sourceValueSeal:null})).toBe(false)
    expect(changes({contextRevisionSeal:null})).toBe(false)
  })
  it('detects evidence revisions that preserve day counts and rounded averages',async()=>{
    const old=await experimentEvidenceFingerprint({date:'2026-10-01',protein:102.5000})
    const fresh=await experimentEvidenceFingerprint({date:'2026-10-01',protein:102.5001})
    expect(changes({resultFingerprint:fresh})).toBe(false)
    expect(changes({resultFingerprint:old})).toBe(false)
    expect(changes({sourceValueSeal:'d'.repeat(64)})).toBe(false)
    expect(changes({contextRevisionSeal:'d'.repeat(64)})).toBe(false)
  })
  it('detects classification, evaluation period or coverage changes',()=>{
    expect(changes({classification:'inconclusive'})).toBe(false)
    expect(changes({effectiveEndDate:'2026-10-06'})).toBe(false)
    expect(changes({comparisonReview:{...base.comparisonReview,metrics:[]}})).toBe(false)
    expect(changes({comparisonReview:{...base.comparisonReview,metrics:[
      {...base.comparisonReview.metrics[0]!,beforeDays:5},
    ]}})).toBe(false)
  })
  it('detects experiment status, frozen protocol, window and implementation changes',()=>{
    for(const experiment of [
      {...base.experiment,status:'completed'},
      {...base.experiment,protocolVersionId:'33333333-3333-4333-8333-333333333333'},
      {...base.experiment,windowStart:'2026-09-25'},
      {...base.experiment,windowEnd:'2026-10-06'},
      {...base.experiment,implementationProvenance:'corrected' as const},
      {...base.experiment,implementationDate:'2026-10-02'},
      {...base.experiment,implementationRevision:1},
    ])expect(changes({experiment})).toBe(false)
  })
  it('write-time INSERT selects only the same active protocol and windows',()=>{
    const source=readFileSync('server/lab/experiment-results.ts','utf8')
    const commit=source.slice(source.indexOf('export async function commitExperimentResult('),
      source.indexOf('export const EXPERIMENT_CONTEXT_SIGNATURE_SQL'))
    expect(commit).toContain('const rechecked = await buildEvaluation(experimentId,attestation,resolvedToday)')
    expect(commit).toContain('resultFinalizationEvidenceUnchanged(')
    expect(commit).toContain('finalizationEvidenceSignature(built,capturedContext?.seal ?? null)')
    expect(commit).toContain('finalizationEvidenceSignature(rechecked,recheckedContext?.seal ?? null)')
    expect(commit).toContain('throw new HttpError(409')
    expect(commit).toContain('AND e.status = \'active\'')
    expect(commit).toContain('AND e.protocol_version_id = $3::uuid')
    expect(commit).toContain('e.window_start IS NOT DISTINCT FROM $15::date')
    expect(commit).toContain('e.window_end IS NOT DISTINCT FROM $16::date')
    expect(commit).toContain('LEFT JOIN experiment_implementations implementation')

    expect(commit).toContain('built.experiment.window_start')
    expect(commit).toContain('built.experiment.window_end')
    expect(commit).toContain('ORDER BY revision DESC LIMIT 1')
    expect(commit).toContain('AND change.revision IS NOT DISTINCT FROM $19::integer')
    expect(commit).toContain('AND (CASE WHEN change.action = \'retracted\' THEN NULL')
    expect(commit).toContain('built.experiment.implementation_provenance')
    expect(commit).toContain('built.experiment.reported_implementation_date ?? null')
    expect(commit).toContain('built.experiment.implementation_revision')
    expect(commit).toContain('await sql.transaction(statements)')
    // A zero-row guarded INSERT must cause subsequent foreign-key child
    // inserts (including mandatory 0059 snapshot) to abort the transaction.
    expect(commit).toContain('sql.query(EXPERIMENT_COMPARISON_SNAPSHOT_INSERT_SQL')
    const ddl=readFileSync('migrations/0059_experiment_comparison_snapshots.sql','utf8')
    expect(ddl).toContain('REFERENCES experiment_results (id)')
    expect(ddl).toContain('experiment_result_id UUID PRIMARY KEY')
  })
  it('does not claim serializable source isolation or add external dependencies',()=>{
    const source=readFileSync('server/lab/experiment-results.ts','utf8')
    expect(source).not.toContain('SERIALIZABLE')
    const recheck=readFileSync('src/domain/experiment-finalization-recheck.ts','utf8')
    expect(recheck).toContain('not repeatable-read / serializable isolation')
    expect(recheck).not.toContain('Gemini')
    expect(recheck).not.toContain('fetch(')
  })
})
