import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  createExperimentComparisonSnapshot, parseExperimentComparisonSnapshot,
} from '../src/domain/experiment-comparison-snapshot.js'
import { assessExperimentComparison } from '../src/domain/experiment-comparison.js'
import { emptyCriteria, experimentEvidenceFingerprint, type ExperimentRequirementSpec } from '../src/domain/experiment-results.js'
import {
  EXPERIMENT_COMPARISON_SNAPSHOT_INSERT_SQL, EXPERIMENT_COMPARISON_SNAPSHOT_READ_SQL,
} from '../server/lab/experiment-results.js'

const requirement: ExperimentRequirementSpec = {
  id:'outcome-1', role:'primary_outcome', requirementKind:'nutrition_metric',
  selector:{metricKey:'protein'}, label:'Protein', required:true, criteria:emptyCriteria(),
}
const data=['2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09']
function makeSnapshot(implementationProvenance: 'original' | 'corrected' | 'retracted' | 'unreported'='original') {
  const date = implementationProvenance === 'retracted' || implementationProvenance === 'unreported' ? null : '2026-10-05'
  return createExperimentComparisonSnapshot({
    recordedHealthDate:'2026-10-17',
    implementationProvenance, implementationEffectiveDate:date,
    implementationRevision:implementationProvenance === 'corrected' || implementationProvenance === 'retracted' ? 2 : null,
    review:assessExperimentComparison({
      reportedImplementationDate:date,windowStart:'2026-10-01',
      effectiveEndDate:'2026-10-11',today:'2026-10-17',
      requirements:[requirement],nutrition:data.map((date)=>({date,metricKey:'protein',value:155})),
    }),
  })
}

describe('PIQ-6.3 committed experiment comparison snapshots',()=>{
  it('round-trips strict schema v1 without conflating coverage and effect',()=>{
    const snapshot=makeSnapshot()
    expect(parseExperimentComparisonSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot)
    expect(snapshot.review.state).toBe('insufficient_coverage')
    expect(snapshot.review.reason).toBe('insufficient_observations')
  })
  it('round-trips optional verified values seal while preserving unsealed legacy v1',async()=>{
    const legacy = makeSnapshot()
    expect(Object.prototype.hasOwnProperty.call(legacy,'sourceValueSeal')).toBe(false)
    const sealed={...legacy,sourceValueSeal:'a'.repeat(64)}
    expect(parseExperimentComparisonSnapshot(sealed)).toEqual(sealed)
    expect(parseExperimentComparisonSnapshot({...legacy,sourceValueSeal:null})).toEqual({...legacy,sourceValueSeal:null})
    for (const invalid of ['', 'g'.repeat(64), 'a'.repeat(63), 12, true]) {
      expect(parseExperimentComparisonSnapshot({...legacy,sourceValueSeal:invalid})).toBeNull()
    }
    expect(await experimentEvidenceFingerprint(sealed)).not.toBe(await experimentEvidenceFingerprint(legacy))
  })
  it('supports optional privacy-limited revision baseline with strict input validation',()=>{
    const old=makeSnapshot()
    expect(Object.prototype.hasOwnProperty.call(old,'contextRevisionSeal')).toBe(false)
    const sealed={...old,contextRevisionSeal:'f'.repeat(64)}
    expect(parseExperimentComparisonSnapshot(sealed)).toEqual(sealed)
    const nullable={...old,contextRevisionSeal:null}
    expect(parseExperimentComparisonSnapshot(nullable)).toEqual(nullable)
    for(const invalid of ['g'.repeat(64),'f'.repeat(63),12,'',false]) {
      expect(parseExperimentComparisonSnapshot({...old,contextRevisionSeal:invalid})).toBeNull()
    }
  })
  it('preserves corrected provenance and numeric revision in historical snapshot',()=>{
    const snapshot=makeSnapshot('corrected')
    expect(parseExperimentComparisonSnapshot(snapshot)?.implementation).toEqual({
      provenance:'corrected',effectiveDate:'2026-10-05',revision:2,
    })
  })
  it('preserves retractions without pretending a change occurred',()=>{
    const snapshot=makeSnapshot('retracted')
    expect(parseExperimentComparisonSnapshot(snapshot)?.implementation.provenance).toBe('retracted')
    expect(snapshot.review.reason).toBe('no_reported_implementation')
    expect(snapshot.review.metrics).toEqual([])
  })
  it('rejects impossible correction revision and contradictory source dates',()=>{
    const original=makeSnapshot()
    expect(parseExperimentComparisonSnapshot({...original,implementation:{...original.implementation,revision:1}})).toBeNull()
    expect(parseExperimentComparisonSnapshot({...original,implementation:{...original.implementation,provenance:'corrected',revision:0}})).toBeNull()
    expect(parseExperimentComparisonSnapshot({...original,implementation:{...original.implementation,provenance:'retracted'}})).toBeNull()
  })
  it('fails closed on future versions, invalid dates, unknown reasons and negative counts',()=>{
    const snapshot=makeSnapshot()
    expect(parseExperimentComparisonSnapshot({...snapshot,snapshotVersion:2})).toBeNull()
    expect(parseExperimentComparisonSnapshot({...snapshot,recordedHealthDate:'2026-10-77'})).toBeNull()
    expect(parseExperimentComparisonSnapshot({...snapshot,review:{...snapshot.review,reason:'improved'}})).toBeNull()
    expect(parseExperimentComparisonSnapshot({...snapshot,review:{...snapshot.review,metrics:[{...snapshot.review.metrics[0],beforeDays:-1}]}})).toBeNull()
  })
  it('has a stable tamper-evident hash separate from the existing Lab classification fingerprint',async()=>{
    const original=makeSnapshot()
    const altered={...original,recordedHealthDate:'2026-10-18'}
    const storedHash=await experimentEvidenceFingerprint(original)
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/)
    expect(await experimentEvidenceFingerprint(JSON.parse(JSON.stringify(original)))).toBe(storedHash)
    expect(await experimentEvidenceFingerprint(altered)).not.toBe(storedHash)
  })
  it('writes snapshot inside the existing Lab result transaction and reads by exact result ID',()=>{
    expect(EXPERIMENT_COMPARISON_SNAPSHOT_INSERT_SQL).toContain('experiment_result_comparison_snapshots')
    expect(EXPERIMENT_COMPARISON_SNAPSHOT_INSERT_SQL).toContain('VALUES ($1::uuid, 1, $2::jsonb, $3)')
    expect(EXPERIMENT_COMPARISON_SNAPSHOT_READ_SQL).toContain('WHERE experiment_result_id = $1::uuid')
    const source=readFileSync('server/lab/experiment-results.ts','utf8')
    expect(source).toContain('...evidenceInserts(sql, resultId, built.evaluation, requirementIds),')
    expect(source).toContain('sql.query(EXPERIMENT_COMPARISON_SNAPSHOT_INSERT_SQL,')
    expect(source).toContain('const comparisonSnapshot = fingerprintOk ? parsedSnapshot : null')
    expect(source).toContain("comparisonSnapshotStatus = !stored ? 'not_recorded'")
  })
  it('enforces insert-only immutability through dedicated additive 0059 schema',()=>{
    const migration=readFileSync('migrations/0059_experiment_comparison_snapshots.sql','utf8')
    expect(migration).toContain('experiment_result_id UUID PRIMARY KEY REFERENCES experiment_results')
    expect(migration).toContain("CHECK (jsonb_typeof(snapshot) = 'object')")
    expect(migration).toContain('BEFORE UPDATE OR DELETE')
    expect(migration).toContain('RAISE EXCEPTION')
  })
})
