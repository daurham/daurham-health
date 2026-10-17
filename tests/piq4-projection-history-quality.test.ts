import {describe,it,expect,vi} from 'vitest'
import type {Sql} from '../server/db.js'
import {fingerprintBodyProjectionRows} from '../server/goals/body-projection-source.js'
import {assessWeightProjectionHistory} from '../server/ask-health/projection-history-quality.js'
import {readCurrentWeightProjectionSource} from '../server/ask-health/current-weight-projection-source.js'
import {reviewCanonicalSelectedGoal} from '../src/domain/ask-health/canonical-goal-status-review.js'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'

const today='2026-10-16'
const id='11111111-1111-4111-8111-111111111111'
const version='22222222-2222-4222-8222-222222222222'
const row=(date:string,i:number)=>({
  measurement_id:'measurement-'+i,measurement_session_id:'session-'+i,
  metric_key:'weight',value:String(200-i),unit:'lb',value_kind:'manual',
  measured_at:date+'T16:00:00.000Z',timezone:'America/Phoenix',
  metric_updated_at:'2026-10-16T12:00:00.000Z',
  session_updated_at:'2026-10-16T12:00:00.000Z',
})
const distributed=['2026-09-23','2026-09-26','2026-10-02','2026-10-08','2026-10-15']
  .map(row)
const clustered=['2026-09-01','2026-09-02','2026-09-03','2026-09-04','2026-10-15']
  .map(row)
function review(rows:Record<string,unknown>[],status:'available'|'insufficient_data'='available'){
  const revision=fingerprintBodyProjectionRows('weight',rows)!
  return reviewCanonicalSelectedGoal({
    asOf:today,today,
    settings:{state:'consistent_read',calorieTargetState:'configured',
      relevantExperimentCount:0,weightGoalMode:'at_most'},
    priority:{state:'selected_active_weight_goal'},
    read:{status:'available',rows:[{id,versionId:version,targetMode:'at_most',
      targetMinKg:null,targetMaxKg:80}]},
    snapshots:[{id,versionId:version,kind:'body_metric',lifecycle:'active',
      label:'Weight',targetText:'Under 80 kg',targetState:'above_target',
      deadlineState:'projected_before_deadline',projectionState:status,
      projectionReason:null,bodyWeightProjectionRevision:revision}],
    observation:{state:'all_recorded_above_boundary',comparableWeightDays:3,sampledSpanDays:20},
    projectionSourceRead:{status:'available',revision,rowCount:rows.length,
      quality:assessWeightProjectionHistory(rows,today)},
  })
}
describe('PIQ-4.2 projection history date distribution gate',()=>{
  it('uses verified source data and counts unique local dates',()=>{
    expect(assessWeightProjectionHistory(distributed,today))
      .toBe('date_spread_sufficient')
    expect(assessWeightProjectionHistory([...distributed,row('2026-10-15',9)],today))
      .toBe('date_spread_sufficient')
    const sql={query:vi.fn(async()=>distributed)} as unknown as Sql
    return readCurrentWeightProjectionSource(sql,today).then(result=>{
      expect(result).toMatchObject({status:'available',rowCount:5,
        quality:'date_spread_sufficient'})
    })
  })
  it('rejects old, clustered, sparse, future-only and malformed histories',()=>{
    const stale=['2026-08-01','2026-08-06','2026-08-12','2026-08-16','2026-08-21'].map(row)
    const short=['2026-10-10','2026-10-11','2026-10-12','2026-10-13','2026-10-15'].map(row)
    for(const rows of [stale,short,clustered,[row('2026-10-20',1)],
      [{...distributed[0]!,timezone:'Invalid/Timezone'},...distributed.slice(1)],
      [{...distributed[0]!,unit:'unknown'},...distributed.slice(1)]])
      expect(assessWeightProjectionHistory(rows,today))
        .not.toBe('date_spread_sufficient')
    expect(assessWeightProjectionHistory(distributed,'broken')).toBe('unavailable')
  })
  it('withholds overconfident projections even with unchanged source revision',()=>{
    expect(review(distributed)).toMatchObject({
      state:'canonical_reported',targetReport:'above_target',
      projectionRevision:'complete_series_rechecked',intervention:'not_authorized',
    })
    const limited=review(clustered)
    expect(limited).toMatchObject({
      state:'projection_quality_limited',targetReport:'withheld',
      deadlineAttention:'withheld',projectionRevision:'complete_series_rechecked',
      intervention:'not_authorized',
    })
    // When Goal Control already marks the projection insufficient, the
    // limited history is not a new reason to erase its current target report.
    expect(review(clustered,'insufficient_data').state).toBe('canonical_reported')
  })
  it('exposes only non-substantive quality state, not dates or source IDs',()=>{
    const snapshot=buildHealthIntelligenceSnapshot({range:'30d',
      start:'2026-09-17',end:today,asOf:today,today,
      timezone:'America/Phoenix',observations:[]})
    const focus=focusWeightEnergyContext({question:'Why is my weight loss stalled?',
      snapshot,today})!
    const produce=(rows:Record<string,unknown>[])=>{
      focus.canonicalGoalStatus=review(rows)
      return buildAskHealthEvidencePacket({
        lens:'general',range:'30d',asOf:today,healthToday:today,
        period:{start:'2026-09-17',end:today},generatedAt:today+'T23:00:00Z',
        question:'Why is my weight loss stalled?',contextMode:'personalized',
        overview:null,activity:null,sleep:null,goals:[],experiments:[],
        benchmarks:[],supplements:[],context:null,patterns:[],
        focusedWeightEnergy:focus,
      })
    }
    const a=produce(distributed),b=produce(clustered)
    const evidence=b.evidence.find(e=>e.id==='weight_energy.canonical_goal_status')!
    expect(evidence.text).toContain('WITHHELD')
    expect(evidence.coverage).toMatchObject({
      canonicalGoalReview:'projection_quality_limited',intervention:'not_authorized'})
    for(const secret of ['measurement-0','2026-09-01','2026-10-15'])
      expect(JSON.stringify({text:evidence.text,coverage:evidence.coverage}))
        .not.toContain(secret)
    expect(packetFingerprintMaterial(a)).not.toBe(packetFingerprintMaterial(b))
  })
})
