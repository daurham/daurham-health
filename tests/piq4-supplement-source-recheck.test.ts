import {describe,expect,it} from 'vitest'
import type {TodaySupplementInput} from '../src/domain/supplements/types.js'
import {
  currentSupplementInputsAgree,recheckCurrentSupplementInputs,
} from '../server/ask-health/current-supplement-recheck.js'
import {buildAskHealthEvidencePacket,matchedSavedSupplements,
  packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'

const today='2026-10-16',start='2026-10-01'
const saved:TodaySupplementInput={
  id:'supp-a',name:'Creatine monohydrate',sortOrder:1,
  schedules:[{id:'slot-a',supplementId:'supp-a',
    slotLabel:'Morning',doseAmount:5,doseUnit:'g',weekdayMask:127,
    effectiveFrom:start,effectiveThrough:null,sortOrder:1}],
  events:[{effectiveDate:start,status:'active'}],
  adherence:[{scheduleId:'slot-a',scheduledDate:'2026-10-15',
    status:'taken',actualDoseAmount:5,actualDoseUnit:'g'}],
}
const agree=(initial:TodaySupplementInput[],late:TodaySupplementInput[])=>
  currentSupplementInputsAgree({initial,late,start,end:today})
const packet=(status:'verified'|'changed_or_unavailable')=>{
  const input:AskHealthPacketInput={
    question:'What supplements am I taking?',lens:'general',
    range:'30d',asOf:today,healthToday:today,
    period:{start,end:today},generatedAt:today+'T21:00:00Z',
    contextMode:'personalized',overview:null,activity:null,sleep:null,
    goals:[],experiments:[],benchmarks:[],supplements:[saved],
    supplementSourceRecheck:status,context:null,patterns:[],
  }
  return buildAskHealthEvidencePacket(input)
}

describe('PIQ-4.2 canonical Supplements final-source agreement',()=>{
  it('matches current saved records and empty source without fabricating use',()=>{
    expect(agree([saved],[structuredClone(saved)])).toBe(true)
    expect(agree([],[])).toBe(true)
    expect(agree([],[saved])).toBe(false)
    expect(agree([saved],[])).toBe(false)
  })
  it('catches changed name, schedule, lifecycle, doses and adherence state',()=>{
    const edits:TodaySupplementInput[]=[
      {...saved,name:'Different formulation'},
      {...saved,sortOrder:3},
      {...saved,schedules:[{...saved.schedules[0]!,doseAmount:3}]},
      {...saved,schedules:[{...saved.schedules[0]!,weekdayMask:1}]},
      {...saved,schedules:[{...saved.schedules[0]!,effectiveThrough:'2026-10-14'}]},
      {...saved,schedules:[]},
      {...saved,events:[{effectiveDate:start,status:'paused'}]},
      {...saved,events:[...saved.events,{effectiveDate:today,status:'discontinued'}]},
      {...saved,adherence:[{...saved.adherence[0]!,status:'skipped'}]},
      {...saved,adherence:[{...saved.adherence[0]!,actualDoseAmount:4}]},
      {...saved,adherence:[]},
    ]
    for(const item of edits)expect(agree([saved],[item])).toBe(false)
  })
  it('detects bad or duplicate identities, invalid dates, unsupported state',()=>{
    expect(agree([saved,saved],[saved,saved])).toBe(false)
    expect(agree([saved],[{...saved,id:''}])).toBe(false)
    expect(agree([saved],[{...saved,schedules:[
      saved.schedules[0]!,saved.schedules[0]!]}])).toBe(false)
    expect(agree([saved],[{...saved,adherence:[
      saved.adherence[0]!,saved.adherence[0]!]}])).toBe(false)
    expect(agree([saved],[{...saved,events:[
      {effectiveDate:today,status:'paused'},
      {effectiveDate:start,status:'active'}]}])).toBe(false)
    expect(currentSupplementInputsAgree({
      initial:[saved],late:[saved],start:'2026-10-17',end:today,
    })).toBe(false)
  })
  it('performs one bounded service call and fails on changed/unavailable reads',async()=>{
    let called=0
    const read=async(a:string,b:string)=>{
      called++
      expect([a,b]).toEqual([start,today])
      return [structuredClone(saved)]
    }
    expect(await recheckCurrentSupplementInputs({
      initial:[saved],start,end:today,today,read,
    })).toBe('verified')
    expect(called).toBe(1)
    expect(await recheckCurrentSupplementInputs({
      initial:[saved],start,end:today,today,
      read:async()=>[{...saved,adherence:[]}],
    })).toBe('changed_or_unavailable')
    expect(await recheckCurrentSupplementInputs({
      initial:[saved],start,end:today,today,
      read:async()=>{throw Error('supplement database inaccessible')},
    })).toBe('changed_or_unavailable')
    expect(await recheckCurrentSupplementInputs({
      initial:[saved],start,end:'2026-10-17',today,read,
    })).toBe('changed_or_unavailable')
    expect(called).toBe(1)
  })
  it('uses saved-name matching without creatine / creatinine false positives',()=>{
    expect(matchedSavedSupplements({
      question:'How is my creatine working?',supplements:[saved],
    })).toEqual([saved])
    expect(matchedSavedSupplements({
      question:'What is creatinine?',supplements:[saved],
    })).toEqual([])
  })
  it('withholds all supplement claims on conflict, preserving unrelated evidence',()=>{
    const good=packet('verified'),bad=packet('changed_or_unavailable')
    expect(good.evidence.some(e=>e.id==='supplements.recorded.supp-a')).toBe(true)
    expect(bad.evidence.some(e=>e.id==='supplements.adherence')).toBe(false)
    expect(bad.evidence.some(e=>e.id==='supplements.recorded.supp-a')).toBe(false)
    expect(bad.evidence.find(e=>e.id==='supplements.source_consistency'))
      .toMatchObject({value:null,substantive:false,
        coverage:{supplementSourceRecheck:'changed_or_unavailable'}})
    expect(bad.evidence.some(e=>e.id==='ask.range')).toBe(true)
    expect(JSON.stringify(bad)).not.toContain('Creatine monohydrate')
    expect(packetFingerprintMaterial(good)).not.toEqual(packetFingerprintMaterial(bad))
  })
})
