import {describe,expect,it,vi} from 'vitest'
import type {Sql} from '../server/db.js'
import {fingerprintBodyProjectionRows} from '../server/goals/body-projection-source.js'
import {assessWeightProjectionHistory} from '../server/ask-health/projection-history-quality.js'
import {readCurrentWeightProjectionSource} from '../server/ask-health/current-weight-projection-source.js'
import {reviewCanonicalSelectedGoal} from '../src/domain/ask-health/canonical-goal-status-review.js'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'

const today='2026-10-16'
const dates=['2026-09-23','2026-09-26','2026-10-02','2026-10-08','2026-10-15']
const rows=dates.map((date,i)=>({
  measurement_id:'metric-'+i,measurement_session_id:'session-'+i,
  metric_key:'weight',value:String(90-i),unit:'kg',value_kind:'manual',
  measured_at:date+'T15:00:00.000Z',timezone:'America/Phoenix',
  comparability:'usual',
  metric_updated_at:'2026-10-16T00:00:00.000Z',
  session_updated_at:'2026-10-16T00:00:00.000Z',
}))
const id='11111111-1111-4111-8111-111111111111'
const version='22222222-2222-4222-8222-222222222222'
function screen(rowsInput:Record<string,unknown>[],projectionState:'available'|'insufficient_data'='available'){
  const revision=fingerprintBodyProjectionRows('weight',rowsInput)!
  return reviewCanonicalSelectedGoal({
    asOf:today,today,settings:{state:'consistent_read',
      calorieTargetState:'configured',relevantExperimentCount:0,weightGoalMode:'at_most'},
    priority:{state:'selected_active_weight_goal'},
    read:{status:'available',rows:[{id,versionId:version,
      targetMode:'at_most',targetMinKg:null,targetMaxKg:80}]},
    snapshots:[{id,versionId:version,kind:'body_metric',lifecycle:'active',
      label:'Weight',targetText:'At most 80 kg',targetState:'above_target',
      deadlineState:'projected_after_deadline',projectionState,
      projectionReason:null,bodyWeightProjectionRevision:revision}],
    observation:{state:'all_recorded_above_boundary',
      comparableWeightDays:3,sampledSpanDays:14},
    projectionSourceRead:{status:'available',revision,rowCount:rowsInput.length,
      quality:assessWeightProjectionHistory(rowsInput,today)},
  })
}
function packet(rowsInput:Record<string,unknown>[]){
  const snapshot=buildHealthIntelligenceSnapshot({
    range:'30d',start:'2026-09-17',end:today,asOf:today,today,
    timezone:'America/Phoenix',observations:[],
  })
  const focused=focusWeightEnergyContext({
    question:'Is my weight projection reliable?',snapshot,today,
  })!
  focused.canonicalGoalStatus=screen(rowsInput)
  return buildAskHealthEvidencePacket({
    lens:'general',range:'30d',asOf:today,healthToday:today,
    period:{start:'2026-09-17',end:today},generatedAt:today+'T22:00:00Z',
    question:'Is my weight projection reliable?',contextMode:'personalized',
    overview:null,activity:null,sleep:null,goals:[],experiments:[],
    benchmarks:[],supplements:[],context:null,patterns:[],
    focusedWeightEnergy:focused,
  })
}
describe('PIQ-4.2 same-series body measurement conditions',()=>{
  it('recognizes only explicitly usual conditions across every eligible point',()=>{
    expect(assessWeightProjectionHistory(rows,today))
      .toBe('date_spread_sufficient')
    for(const state of ['unknown','different_conditions',null,undefined]){
      const candidate=rows.map((r,i)=>i===2?{...r,comparability:state}:r)
      expect(assessWeightProjectionHistory(candidate,today))
        .toBe('measurement_conditions_unverified')
      const screened=screen(candidate)
      expect(screened).toMatchObject({
        state:'projection_conditions_unverified',
        targetReport:'withheld',deadlineAttention:'withheld',
        projectionRevision:'complete_series_rechecked',
        intervention:'not_authorized',
      })
    }
  })
  it('includes condition changes in private revision even for identical weight',async()=>{
    const modified=rows.map((r,i)=>i===0?{...r,comparability:'different_conditions'}:r)
    const oldHash=fingerprintBodyProjectionRows('weight',rows)
    const revisedHash=fingerprintBodyProjectionRows('weight',modified)
    expect(revisedHash).not.toBe(oldHash)
    const sql={query:vi.fn(async()=>modified)} as unknown as Sql
    const check=await readCurrentWeightProjectionSource(sql,today)
    expect(check).toMatchObject({status:'available',
      quality:'measurement_conditions_unverified'})
    expect(check.status==='available'&&check.revision).toBe(revisedHash)
  })
  it('ignores non-projection historical condition flags while fingerprinting all rows',()=>{
    const old={...rows[0]!,measurement_id:'old',
      measured_at:'2026-03-01T15:00:00.000Z',
      comparability:'different_conditions'}
    expect(assessWeightProjectionHistory([...rows,old],today))
      .toBe('date_spread_sufficient')
    expect(fingerprintBodyProjectionRows('weight',[...rows,old]))
      .not.toBe(fingerprintBodyProjectionRows('weight',rows))
  })
  it('does not suppress a genuine current target report without an available forecast',()=>{
    const unverified=rows.map((r,i)=>i===1?{...r,comparability:'unknown'}:r)
    expect(screen(unverified,'insufficient_data')).toMatchObject({
      state:'canonical_reported',intervention:'not_authorized'})
  })
  it('withholds raw measurement details and fingerprints in AI evidence',()=>{
    const altered=rows.map((r,i)=>i===2?{...r,comparability:'different_conditions'}:r)
    const a=packet(rows),b=packet(altered)
    const evidence=b.evidence.find(e=>e.id==='weight_energy.canonical_goal_status')!
    expect(evidence).toMatchObject({substantive:false,
      coverage:{canonicalGoalReview:'projection_conditions_unverified',
        reportedTargetState:'withheld',intervention:'not_authorized'}})
    expect(evidence.text).toContain('WITHHELD')
    for(const secret of [id,version,'metric-2','session-2',
      fingerprintBodyProjectionRows('weight',altered)!,'2026-10-02'])
      expect(JSON.stringify({text:evidence.text,coverage:evidence.coverage}))
        .not.toContain(secret)
    expect(packetFingerprintMaterial(a)).not.toBe(packetFingerprintMaterial(b))
  })
})
