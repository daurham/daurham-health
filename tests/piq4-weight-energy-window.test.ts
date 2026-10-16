import {describe,expect,it} from 'vitest'
import {buildHealthIntelligenceSnapshot,type IntelligenceObservation} from '../src/domain/intelligence/shared.js'
import {focusHistoricalWeightEnergyWindow} from '../src/domain/ask-health/focused-weight-energy-window.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {focusHistoricalWeightEnergyDay} from '../src/domain/ask-health/focused-weight-energy-history.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'

const today='2026-10-16',start='2026-10-01',prev='2026-10-05'
const record=(key:'body.weight_kg'|'nutrition.calories',date:string,value:number,
  quality:'usual'|'different_conditions'|'high_confidence',
  ids=[key+':'+date]):IntelligenceObservation=>({
    key,date,value,quality,sourceIds:ids,provenance:'owner',
    unit:key==='body.weight_kg'?'kg':'kcal',
  })
const base:IntelligenceObservation[]=[
  record('body.weight_kg','2026-10-05',83,'usual'),
  record('body.weight_kg','2026-10-08',82.7,'usual'),
  record('body.weight_kg','2026-10-11',82.5,'usual'),
  record('body.weight_kg','2026-10-13',89,'usual'),
  record('nutrition.calories','2026-10-05',1800,'high_confidence'),
  record('nutrition.calories','2026-10-06',1900,'high_confidence'),
  record('nutrition.calories','2026-10-07',2000,'high_confidence'),
  record('nutrition.calories','2026-10-08',4000,'high_confidence'),
  record('nutrition.calories','2026-10-13',4500,'high_confidence'),
]
function make(records:readonly IntelligenceObservation[]=base,opts:{
  asOf?:string,scopeStart?:string,verified?:readonly string[],verification?:'available'|'unavailable',
}={}){
  return buildHealthIntelligenceSnapshot({range:'30d',
    start:opts.scopeStart??start,end:opts.asOf??today,
    asOf:opts.asOf??today,today,timezone:'America/Phoenix',
    observations:records,nutritionVerifiedCompleteDates:new Set(opts.verified??[
      '2026-10-05','2026-10-06','2026-10-07','2026-10-13',
    ]),nutritionVerificationStatus:opts.verification??'available',
  })
}
function inspect(question:string,records:readonly IntelligenceObservation[]=base,opts:{
  asOf?:string,scopeStart?:string,verified?:readonly string[],
  verification?:'available'|'unavailable',mode?:'personalized'|'general_only'|'deep'
}={}){
  const snap=make(records,opts),mode=opts.mode??'personalized'
  const window=mode==='general_only'?null:
    focusHistoricalWeightEnergyWindow({question,snapshot:snap,today})
  const day=mode==='general_only'?null:
    focusHistoricalWeightEnergyDay({question,snapshot:snap,today})
  const focus=mode==='general_only'?null:focusWeightEnergyContext({
    question,snapshot:snap,today,includeBroadContext:mode==='deep',
  })
  const input:AskHealthPacketInput={question,contextMode:mode,lens:'general',
    range:'30d',asOf:opts.asOf??today,period:{start:opts.scopeStart??start,end:opts.asOf??today},
    generatedAt:today+'T18:00:00Z',overview:null,activity:null,sleep:null,
    goals:[],experiments:[],benchmarks:[],supplements:[],context:null,patterns:[],
    focusedWeightEnergy:focus,focusedWeightEnergyDay:day,focusedWeightEnergyWindow:window}
  return {window,packet:buildAskHealthEvidencePacket(input)}
}
describe('PIQ-4.2 exact requested historical interval boundary (synthetic)',()=>{
  it('shows only the seven requested dates, conditional verified calories and properly sampled weight',()=>{
    const r=inspect('How did my weight and calories change last week?')
    expect(r.window).toMatchObject({start:prev,end:'2026-10-11',calendarDays:7,
      scope:'in_range',verifiedCalorieDays:3,verifiedCalorieMeanKcal:1900,
      verifiedEarlyHalfDays:3,verifiedLateHalfDays:0,intakeCoverage:'sparse_or_clustered',
      recordedWeightDays:3,comparableWeightDays:3,observedWeightChangeKg:-0.5})
    const ids=r.packet.evidence.map(x=>x.id)
    expect(ids).toContain('weight_energy.historical_window.calories')
    expect(ids).toContain('weight_energy.historical_window.weight_change')
    expect(ids).not.toContain('weight_energy.observed_balance')
    expect(ids).not.toContain('body.weight.latest')
    expect(r.packet.contextSummary).toEqual({knows:[],missing:[]})
    expect(JSON.stringify(r.packet)).not.toContain('4500')
    expect(JSON.stringify(r.packet)).not.toContain('89 kg')
    expect(r.packet.evidence.find(x=>x.id==='weight_energy.historical_window.calories')?.text)
      .toContain('NOT a calendar-day average')
    expect(r.packet.evidence.find(x=>x.id==='weight_energy.historical_window.coverage')?.text)
      .toContain('sparse or concentrated in one half')
  })
  it('cannot silently borrow recent observations when the named period is outside the selected range',()=>{
    const r=inspect('How much weight did I lose last week?',base,{scopeStart:'2026-10-10'})
    expect(r.window?.scope).toBe('out_of_range')
    expect(r.packet.evidence.map(x=>x.id)).toEqual([
      'ask.range','weight_energy.historical_window.coverage',
    ])
    expect(r.packet.evidence.find(x=>x.id==='weight_energy.historical_window.coverage')?.text)
      .toContain('No partial interval or recent substitute')
  })
  it('withholds calorie mean if verification is unavailable or IDs are unusable',()=>{
    for(const opts of [{verification:'unavailable' as const},
      {verified:[] as string[]}]){
      const r=inspect('How many calories last week?',base,opts)
      expect(r.window?.verifiedCalorieMeanKcal).toBeNull()
      expect(r.packet.evidence.some(x=>x.id==='weight_energy.historical_window.calories')).toBe(false)
    }
    const bad=base.map(x=>x.key==='nutrition.calories'
      ? {...x,sourceIds:['duplicate','duplicate']} : x)
    expect(inspect('How many calories last week?',bad).window?.verifiedCalorieDays).toBe(0)
  })
  it('missing/different weigh-in conditions must never be reported as stable or change',()=>{
    const data=base.map(x=>x.key==='body.weight_kg'&&x.date==='2026-10-11'
      ? {...x,quality:'different_conditions'} : x)
    const r=inspect('Why was my scale steady last week?',data)
    expect(r.window?.observedWeightChangeKg).toBeNull()
    expect(r.packet.evidence.find(x=>x.id==='weight_energy.historical_window.weight_unavailable'))
      .toBeDefined()
    expect(r.packet.evidence.some(x=>x.id==='weight_energy.historical_window.weight_change')).toBe(false)
  })
  it('excludes provisional today from this-week verification and does not treat missing dates as zero',()=>{
    const rows=[...base,
      record('nutrition.calories',today,7000,'high_confidence'),
      record('body.weight_kg',today,70,'usual')]
    const r=inspect('How much did I eat this week?',rows,{
      verified:['2026-10-13',today]})
    expect(r.window).toMatchObject({start:'2026-10-12',end:today,
      provisionalTodayExcluded:true,calendarDays:5,completedDays:4,
      verifiedCalorieDays:1,verifiedCalorieMeanKcal:4500,
      verifiedEarlyHalfDays:1,verifiedLateHalfDays:0,intakeCoverage:'single_verified_day'})
    expect(r.packet.evidence.find(x=>x.id==='weight_energy.historical_window.coverage')?.text)
      .toContain('Today was excluded')
    expect(JSON.stringify(r.packet)).not.toContain('7000')
  })
  it('keeps the selected as-of date distinct from today and forbids silent clipping',()=>{
    const r=inspect('What were my calories last week?',base,{asOf:'2026-10-09'})
    // "Last week" from historical asOf Oct 9 resolves Sep 28-Oct 4,
    // which lies outside selected Oct 1 history.
    expect(r.window?.scope).toBe('out_of_range')
    expect(r.window?.verifiedCalorieMeanKcal).toBeNull()
  })
  it('does not narrow ambiguous multiple time periods or expose unrelated owner packets',()=>{
    for(const q of ['Compare my weight last week vs last month',
      'What did I weigh between 2026-10-05 and 2026-10-11?',
      'How many calories on October 7?']){
      const r=inspect(q)
      expect(r.window?.scope).toBe('invalid_or_ambiguous')
      expect(r.packet.evidence.filter(x=>x.id.startsWith('weight_energy.historical_window.')))
        .toHaveLength(1)
      expect(r.packet.contextSummary).toEqual({knows:[],missing:[]})
    }
  })
  it('preserves General Only without owner data, and single-date history remains separate',()=>{
    expect(inspect('How many calories last week?',base,{mode:'general_only'}).window).toBeNull()
    const day=inspect('How many calories on 2026-10-05?')
    expect(day.window).toBeNull()
    expect(day.packet.evidence.some(x=>x.id==='weight_energy.historical_day.calories')).toBe(true)
    expect(inspect('How is my training going?').window).toBeNull()
  })
  it('changing a source-qualified verified day changes the scoped packet fingerprint',()=>{
    const q='How many calories last week?'
    const a=inspect(q),b=inspect(q,base.map(x=>x.key==='nutrition.calories'&&x.date==='2026-10-06'
      ? {...x,value:2100} : x))
    expect(packetFingerprintMaterial(a.packet)).not.toBe(packetFingerprintMaterial(b.packet))
  })

  it('recognizes verified dates distributed across both fixed halves of a seven-day window',()=>{
    const added=[
      record('nutrition.calories','2026-10-09',2200,'high_confidence'),
      record('nutrition.calories','2026-10-10',2400,'high_confidence'),
    ]
    const verified=['2026-10-05','2026-10-06','2026-10-07','2026-10-09','2026-10-10']
    const r=inspect('How many calories last week?',[...base,...added],{verified})
    expect(r.window).toMatchObject({
      verifiedCalorieDays:5,verifiedEarlyHalfDays:3,verifiedLateHalfDays:2,
      intakeCoverage:'distributed_observations',
    })
    expect(r.packet.evidence.find(x=>x.id==='weight_energy.historical_window.coverage')?.coverage)
      .toMatchObject({intakeCoverage:'distributed_observations'})
    expect(r.packet.evidence.find(x=>x.id==='weight_energy.historical_window.calories')?.text)
      .toContain('completeness of every meal is not independently proven')
  })
  it('explicitly describes a one-day average as nonrepresentative even with perfect source IDs',()=>{
    const r=inspect('How many calories last week?',base,{verified:['2026-10-05']})
    expect(r.window).toMatchObject({verifiedCalorieDays:1,
      verifiedCalorieMeanKcal:1800,intakeCoverage:'single_verified_day'})
    expect(r.packet.evidence.find(x=>x.id==='weight_energy.historical_window.coverage')?.text)
      .toContain('Only ONE date')
    expect(r.packet.evidence.find(x=>x.id==='weight_energy.historical_window.calories')?.text)
      .toContain('NOT a representative estimate')
  })
  it('re-fingerprints a corrected distribution even when the numeric mean stays equal',()=>{
    const q='How many calories last week?'
    const records=[...base,record('nutrition.calories','2026-10-09',2000,'high_confidence')]
    const a=inspect(q,records,{verified:['2026-10-05','2026-10-06','2026-10-07']})
    const b=inspect(q,records,{verified:['2026-10-05','2026-10-06','2026-10-09']})
    expect(a.window?.verifiedCalorieMeanKcal).toBe(b.window?.verifiedCalorieMeanKcal)
    expect(a.window?.verifiedEarlyHalfDays).not.toBe(b.window?.verifiedEarlyHalfDays)
    expect(packetFingerprintMaterial(a.packet)).not.toBe(packetFingerprintMaterial(b.packet))
  })
})
