import {describe,expect,it} from 'vitest'
import {buildHealthIntelligenceSnapshot,type IntelligenceObservation} from '../src/domain/intelligence/shared.js'
import {addCalendarDays} from '../src/domain/training-plan.js'
import {screenScaleWindowSignalCoverage,screenScaleShiftTiming} from '../src/domain/ask-health/scale-window-signal-coverage.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'

const today='2026-10-16'
const dates=Array.from({length:10},(_,i)=>addCalendarDays('2026-10-06',i))
const row=(key:IntelligenceObservation['key'],date:string,value:number,quality='usual'):IntelligenceObservation=>({
  key,date,value,quality,unit:key==='body.weight_kg'?'kg':key==='hydration.ml'?'ml':
    key==='activity.steps'?'steps':key==='nutrition.calories'?'kcal':
    key==='nutrition.carbs_g'?'g':'mg',
  provenance:'owner',sourceIds:['source-'+key+'-'+date],
})
const weights=dates.map(d=>row('body.weight_kg',d,82.5))
function snapshot(observations:IntelligenceObservation[],start='2026-10-01'){
  return buildHealthIntelligenceSnapshot({range:'30d',start,end:today,
    asOf:today,today,timezone:'America/Phoenix',observations})
}
const screen=(data:IntelligenceObservation[],start?:string)=>
  screenScaleWindowSignalCoverage({snapshot:snapshot(data,start),completeThrough:'2026-10-15',today})
describe('PIQ4 ten-day scale-window coverage contract',()=>{
  it('counts only source-identified usual weights in both completed windows',()=>{
    expect(screen(weights)).toMatchObject({weightSampling:'sampled_both_windows',
      recentUsualWeightDays:3,baselineUsualWeightDays:7,nonUsualWeightDays:0})
    expect(screen(weights.slice(-3)).weightSampling).toBe('sparse_or_mixed')
    expect(screen(weights.slice(0,8)).weightSampling).toBe('sparse_or_mixed')
    expect(screen(weights,'2026-10-10').weightSampling).toBe('sparse_or_mixed')
    expect(screen([]).weightSampling).toBe('no_qualified_weight')
  })
  it('does not convert malformed sources or non-usual records into comparable days',()=>{
    const mixed=weights.map((w,i)=>i===0?{...w,quality:'unknown'}:w)
    expect(screen(mixed)).toMatchObject({
      weightSampling:'sparse_or_mixed',nonUsualWeightDays:1,
      baselineUsualWeightDays:6})
    const duplicate=weights.map((w,i)=>i===0?{...w,sourceIds:['x','x']}:w)
    // The invalid point does not count, but six other valid baseline
    // dates still exceed the documented three-date sampling floor.
    expect(screen(duplicate)).toMatchObject({weightSampling:'sampled_both_windows',
      baselineUsualWeightDays:6,nonUsualWeightDays:0})
    const sparse=weights.map((w,i)=>i<5?{...w,sourceIds:['x','x']}:w)
    expect(screen(sparse)).toMatchObject({weightSampling:'sparse_or_mixed',
      baselineUsualWeightDays:2,nonUsualWeightDays:0})
  })
  it('counts recorded water/steps but never provisional today or unattributed events',()=>{
    const data=[...weights,row('hydration.ml',dates[2]!,220),
      row('activity.steps',dates[3]!,0),row('activity.steps',today,9999),
      {...row('hydration.ml',dates[4]!,500),sourceIds:[]}]
    expect(screen(data)).toMatchObject({recordedWaterDays:1,recordedStepDays:1})
  })
  it('withholds a personalized scale link when verified nutrient shifts lack weigh-ins',()=>{
    const calDates=Array.from({length:10},(_,i)=>dates[i]!)
    const food=calDates.flatMap((d,i)=>{
      const recent=i>=7
      const id='food:'+d
      return ['nutrition.calories','nutrition.sodium_mg','nutrition.carbs_g'].map(
        (key,j)=>({...row(key as IntelligenceObservation['key'],d,
          j===0?2100:j===1?(recent?2600:1700):(recent?240:140),'high_confidence'),
          sourceIds:[id]}))
    })
    const make=(includeWeights:boolean)=>{
      const snap=buildHealthIntelligenceSnapshot({
        range:'30d',start:'2026-09-17',end:today,asOf:today,today,
        timezone:'America/Phoenix',
        observations:[...food,...(includeWeights?weights:[])],
        nutritionVerifiedCompleteDates:new Set(calDates),
        nutritionVerificationStatus:'available',
      })
      const focus=focusWeightEnergyContext({
        snapshot:snap,question:'Why did my scale weight stall?',today})!
      const packet=buildAskHealthEvidencePacket({
        question:'Why did my scale weight stall?',contextMode:'personalized',
        lens:'general',range:'30d',asOf:today,healthToday:today,
        period:{start:'2026-09-17',end:today},generatedAt:today+'T20:00:00Z',
        overview:null,activity:null,sleep:null,goals:[],experiments:[],
        benchmarks:[],supplements:[],context:null,patterns:[],
        focusedWeightEnergy:focus,
      })
      return {focus,packet}
    }
    const measured=make(true),unmeasured=make(false)
    expect(measured.focus.qualifiedScaleContext.map(x=>x.kind)).toEqual(['sodium','carbohydrate'])
    expect(unmeasured.focus.qualifiedScaleContext.map(x=>x.kind)).toEqual(['sodium','carbohydrate'])
    const actual=unmeasured.packet.evidence.find(x=>x.id==='weight_energy.scale_context')!
    expect(actual).toMatchObject({substantive:false,
      coverage:{weightSampling:'no_qualified_weight',verifiedNutrientShiftCount:2}})
    expect(actual.text).toContain('food-log observation ONLY')
    expect(actual.text).not.toContain('Both comparison windows contain')
    expect(packetFingerprintMaterial(measured.packet))
      .not.toBe(packetFingerprintMaterial(unmeasured.packet))
  })
})

describe('PIQ4 date-order gate for qualified food shifts and later scale records',()=>{
  const snapshotFor=(observations:IntelligenceObservation[])=>snapshot(observations)
  const timing=(observations:IntelligenceObservation[],
    shiftDays:readonly string[],coverageOverride?:'sampled_both_windows'|'sparse_or_mixed')=>{
    const snapshot=snapshotFor(observations)
    const coverage=screenScaleWindowSignalCoverage({
      snapshot,completeThrough:'2026-10-15',today,
    })
    return screenScaleShiftTiming({
      snapshot,completeThrough:'2026-10-15',today,
      coverage:coverageOverride?{...coverage,weightSampling:coverageOverride}:coverage,
      shifts:[{kind:'sodium',dates:shiftDays}],
    })
  }
  it('does not treat a same-day scale reading as occurring after a full-day food log',()=>{
    expect(timing(weights,['2026-10-14','2026-10-15'])).toEqual({
      sodium:'no_later_scale_record',carbohydrate:'not_checked',
    })
    expect(timing(weights,['2026-10-13','2026-10-14'])).toEqual({
      sodium:'later_scale_recorded',carbohydrate:'not_checked',
    })
  })
  it('requires both weigh-in sampling and qualified source dates before any ordering',()=>{
    expect(timing(weights.slice(-3),['2026-10-13','2026-10-14']).sodium)
      .toBe('weight_window_insufficient')
    expect(timing(weights,['2026-10-13','2026-10-14','2026-10-14']).sodium)
      .toBe('source_dates_unverified')
    expect(timing(weights,['2026-10-12','2026-10-13']).sodium)
      .toBe('source_dates_unverified')
    expect(timing(weights,['2026-10-15','2026-10-16']).sodium)
      .toBe('source_dates_unverified')
    expect(timing(weights,['2026-10-13','2026-10-14'],'sparse_or_mixed').sodium)
      .toBe('weight_window_insufficient')
    const snap=snapshotFor(weights)
    const coverage=screenScaleWindowSignalCoverage({snapshot:snap,
      completeThrough:'2026-10-15',today})
    expect(screenScaleShiftTiming({snapshot:snap,coverage,today,
      completeThrough:'2026-10-15',shifts:[
        {kind:'sodium',dates:['2026-10-13','2026-10-14']},
        {kind:'sodium',dates:['2026-10-14','2026-10-15']},
      ]}).sodium).toBe('source_dates_unverified')
  })
  it('requires an independently source-identified usual-condition later weigh-in',()=>{
    const unsuitable=weights.map(w=>w.date==='2026-10-15'
      ?{...w,quality:'different_conditions'}:w)
    expect(timing(unsuitable,['2026-10-13','2026-10-14']).sodium)
      .toBe('weight_window_insufficient')
    const removed=weights.filter(w=>w.date!=='2026-10-15')
    // Still 2 recent usual weight dates: the day after the last food log
    // is missing. There is no basis for a post-log scale claim.
    expect(timing(removed,['2026-10-13','2026-10-14']).sodium)
      .toBe('no_later_scale_record')
  })
})
