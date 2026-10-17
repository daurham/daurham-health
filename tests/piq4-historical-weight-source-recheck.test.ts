import {describe,expect,it,vi} from 'vitest'
import type {Sql} from '../server/db.js'
import {buildHealthIntelligenceSnapshot,type IntelligenceObservation} from '../src/domain/intelligence/shared.js'
import {focusHistoricalWeightEnergyDay} from '../src/domain/ask-health/focused-weight-energy-history.js'
import {focusHistoricalWeightEnergyWindow} from '../src/domain/ask-health/focused-weight-energy-window.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'
import {recheckHistoricalWeightEnergySources} from '../server/ask-health/historical-weight-energy-source-recheck.js'
import {CURRENT_WEIGHT_NUTRIENT_RECHECK_SQL} from '../server/ask-health/current-weight-nutrition-recheck.js'
import {LATE_WEIGHT_INTELLIGENCE_SQL} from '../server/ask-health/current-weight-activity-recheck.js'

const today='2026-10-16',start='2026-10-01',date='2026-10-03'
const records:IntelligenceObservation[]=[
  {key:'nutrition.calories',date,value:2100,unit:'kcal',quality:'high_confidence',
    provenance:'owner',sourceIds:['food-a']},
  {key:'body.weight_kg',date,value:83,unit:'kg',quality:'usual',
    provenance:'owner',sourceIds:['weight-a']},
]
const snapshot=(observations:readonly IntelligenceObservation[]=records)=>
  buildHealthIntelligenceSnapshot({range:'30d',start,end:today,asOf:today,
    timezone:'America/Phoenix',today,observations,
    nutritionVerifiedCompleteDates:new Set([date]),
    nutritionVerificationStatus:'available'})
const candidate={date,calories:'2100',source_ids:['food-a'],
  protein:null,carbs:null,sodium:null}
const weight={metric_id:'weight-a',session_id:'session-a',
  value:'83',unit:'kg',measured_at:'2026-10-03T13:00:00Z',
  timezone:'America/Phoenix',comparability:'usual',source_kind:'manual'}
const db=(food:unknown=[candidate],weights:unknown=[weight])=>
  ({query:vi.fn(async(query:string)=>query===CURRENT_WEIGHT_NUTRIENT_RECHECK_SQL
    ?food:query===LATE_WEIGHT_INTELLIGENCE_SQL?weights:[])}) as unknown as Sql&{
      query:ReturnType<typeof vi.fn>}
const check=(food:unknown=[candidate],weights:unknown=[weight],
  scope={start:date,end:date})=>
  recheckHistoricalWeightEnergySources({...scope,today,snapshot:snapshot(),
    sqlOverride:db(food,weights)})
const packet=(status:'not_checked'|'verified'|'changed_or_unavailable',
  period:'day'|'window')=>{
  const question=period==='day'
    ?'What was my scale weight and calories on 2026-10-03?'
    :'What was my weight change from 2026-10-03 through 2026-10-09?'
  const snap=snapshot()
  const focusDay=period==='day'
    ?focusHistoricalWeightEnergyDay({question,snapshot:snap,today}):null
  const focusWindow=period==='window'
    ?focusHistoricalWeightEnergyWindow({question,snapshot:snap,today}):null
  const input:AskHealthPacketInput={
    question,lens:'general',range:'30d',asOf:today,healthToday:today,
    period:{start,end:today},generatedAt:today+'T22:00:00Z',
    contextMode:'personalized',overview:null,activity:null,sleep:null,
    goals:[],experiments:[],benchmarks:[],supplements:[],
    context:null,patterns:[],focusedWeightEnergyDay:focusDay,
    focusedWeightEnergyWindow:focusWindow,
    historicalWeightEnergySourceRecheck:status,
  }
  return buildAskHealthEvidencePacket(input)
}

describe('PIQ4 selected historical source recheck and source conflict',()=>{
  it('verifies selected past-day source identities and values with only two bounded reads',async()=>{
    const sql=db()
    expect(await recheckHistoricalWeightEnergySources({
      snapshot:snapshot(),today,start:date,end:date,sqlOverride:sql}))
      .toBe('verified')
    expect(sql.query).toHaveBeenCalledTimes(2)
    expect(sql.query).toHaveBeenCalledWith(CURRENT_WEIGHT_NUTRIENT_RECHECK_SQL,
      [date,date,today])
    expect(sql.query).toHaveBeenCalledWith(LATE_WEIGHT_INTELLIGENCE_SQL,
      [date,'America/Phoenix','2026-10-01'])
  })
  it('fails closed on corrected caloric intake, source identity, conditions and weight',async()=>{
    for(const food of [{...candidate,calories:'2300'},
      {...candidate,source_ids:['food-b']},
      {...candidate,protein:'75'}])
      expect(await check([food])).toBe('changed_or_unavailable')
    for(const updated of [{...weight,value:'84'},
      {...weight,metric_id:'other-weight'},
      {...weight,comparability:'different_conditions'}])
      expect(await check([candidate],[updated])).toBe('changed_or_unavailable')
  })
  it('fails on deletes, added confirmed days and missing source data',async()=>{
    expect(await check([])).toBe('changed_or_unavailable')
    expect(await check([candidate],[])).toBe('changed_or_unavailable')
    expect(await check([candidate,{...candidate,date:'2026-10-04'}], [weight],
      {start:date,end:'2026-10-04'})).toBe('changed_or_unavailable')
    expect(await recheckHistoricalWeightEnergySources({
      snapshot:snapshot(),today,start:date,end:date,
      sqlOverride:{query:vi.fn(async()=>{throw Error('offline')})} as unknown as Sql}))
      .toBe('changed_or_unavailable')
  })
  it('rejects future, out-of-snapshot, provisional, oversized or invalid scopes',async()=>{
    for(const scope of [{start:today,end:today},
      {start:'2026-09-30',end:date},{start:date,end:'2026-11-01'},
      {start:'2026-09-01',end:'2026-10-05'},
      {start:'bad',end:date}])
      expect(await recheckHistoricalWeightEnergySources({
        snapshot:snapshot(),today,...scope,sqlOverride:db()}))
        .toBe('changed_or_unavailable')
  })
  it('withholds raw historical day and window measures on changed source',()=>{
    for(const scope of ['day','window'] as const){
      const changed=packet('changed_or_unavailable',scope)
      const stable=packet('verified',scope)
      const prefix='weight_energy.historical_'+scope+'.'
      expect(changed.evidence.some(x=>x.id===prefix+'source_consistency')).toBe(true)
      expect(changed.evidence.filter(x=>x.id.startsWith(prefix))
        .every(x=>x.id===prefix+'source_consistency')).toBe(true)
      expect(changed.evidence.some(x=>x.substantive)).toBe(false)
      expect(JSON.stringify(changed)).not.toContain('2100 kcal')
      expect(JSON.stringify(changed)).not.toContain('83 kg')
      expect(packetFingerprintMaterial(changed)).not.toBe(packetFingerprintMaterial(stable))
      expect(stable.evidence.some(x=>x.id.startsWith(prefix)&&x.substantive)).toBe(true)
    }
  })
})
