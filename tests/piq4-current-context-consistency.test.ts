import {describe,expect,it,vi} from 'vitest'
import type {DailyContext} from '../src/domain/context.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import {currentDailyContextsAgree,recheckCurrentDailyContexts} from '../server/ask-health/current-context-consistency.js'

const today='2026-10-16',start='2026-10-01',date='2026-10-15'
const one:DailyContext={id:'context-one',contextDate:date,
  tags:['sick','travel'],note:'First private note',
  createdAt:'2026-10-15T13:00:00.000Z',updatedAt:'2026-10-15T13:01:00.000Z'}
const two:DailyContext={id:'context-two',contextDate:'2026-10-14',
  tags:['rest_day'],note:'Second private note',
  createdAt:'2026-10-14T13:00:00.000Z',updatedAt:'2026-10-14T13:01:00.000Z'}
const check=(a:DailyContext[],b:DailyContext[])=>
  recheckCurrentDailyContexts({first:a,start,end:today,today,read:vi.fn(async()=>b)})
const base=():AskHealthPacketInput=>({
  lens:'general',range:'30d',asOf:today,healthToday:today,
  question:'What is happening with my weight and context?',
  generatedAt:'2026-10-16T20:00:00Z',contextMode:'personalized',
  period:{start,end:today},overview:null,activity:null,sleep:null,
  goals:[],experiments:[],benchmarks:[],supplements:[],patterns:[],
  context:{tagCounts:{Sick:1,Travel:1},notedDays:1,
    notes:[{date,text:'First private note'}]},
})
describe('PIQ4 late Daily Context integrity and packet precedence',()=>{
  it('is order-independent but compares note, tags, identity and row revisions',async()=>{
    expect(currentDailyContextsAgree([one,two],[two,{...one,tags:['travel','sick']}],start,today)).toBe(true)
    expect(await check([one],[{...one}])).toBe('verified')
    expect(await check([],[])).toBe('verified')
    for(const mutated of [{...one,note:'Edited note'},
      {...one,tags:['sick'] as DailyContext['tags']},
      {...one,id:'replacement'},
      {...one,updatedAt:'2026-10-15T15:00:00.000Z'}]){
      expect(await check([one],[mutated])).toBe('changed_or_unavailable')
    }
  })
  it('fails closed on insert/delete, duplicate, out-of-range and unavailable sources',async()=>{
    expect(await check([],[one])).toBe('changed_or_unavailable')
    expect(await check([one],[])).toBe('changed_or_unavailable')
    expect(await check([one],[one,two])).toBe('changed_or_unavailable')
    expect(await check([one],[one,one])).toBe('changed_or_unavailable')
    expect(await check([one],[{...one,tags:['sick','sick']}]))
      .toBe('changed_or_unavailable')
    expect(await check([one],[{...one,contextDate:'2026-11-15'}]))
      .toBe('changed_or_unavailable')
    expect(await recheckCurrentDailyContexts({first:[one],start,end:today,today,
      read:vi.fn(async()=>{throw Error('source failed')})}))
      .toBe('changed_or_unavailable')
  })
  it('withholds generic context notes and tags if late read disagrees',()=>{
    const x=base();x.currentContextSourceRecheck='changed_or_unavailable'
    const p=buildAskHealthEvidencePacket(x)
    expect(p.evidence.find(y=>y.id==='context.source_consistency'))
      .toMatchObject({substantive:false,coverage:{contextClaims:'withheld'}})
    expect(p.evidence.some(y=>y.id==='context.tags'||y.id.startsWith('context.note.')))
      .toBe(false)
    expect(JSON.stringify(p.evidence)).not.toContain('First private note')
    const ok=base();ok.currentContextSourceRecheck='verified'
    const valid=buildAskHealthEvidencePacket(ok)
    expect(valid.evidence.some(y=>y.id==='context.tags')).toBe(true)
    expect(valid.evidence.some(y=>y.id==='context.note.'+date)).toBe(true)
    expect(packetFingerprintMaterial(p)).not.toBe(packetFingerprintMaterial(valid))
  })
  it('blocks generic intelligence after a current focused source failure',()=>{
    const x=base()
    const snapshot=buildHealthIntelligenceSnapshot({
      range:'30d',start,end:today,asOf:today,today,
      timezone:'America/Phoenix',observations:[],
    })
    const focus=focusWeightEnergyContext({
      question:'Why has my weight loss stalled?',snapshot,today,
    })!
    focus.nutritionSourceRecheck='changed_or_unavailable'
    focus.weightActivitySourceRecheck='verified'
    x.focusedWeightEnergy=focus
    x.intelligence={
      coverage:[{key:'activity.steps',label:'Steps',coveragePct:20,
        observedDays:4,eligibleDays:20,excludedObservations:0,
        confidence:'low',provenance:{device:4},detailPath:'/progress/activity'}],
      baselines:[],relationships:[],interventions:[],missing:[],
      knows:[{key:'unverified',label:'Unverified',detail:'Old assertion',
        detailPath:'/progress'}],
    } as unknown as NonNullable<AskHealthPacketInput['intelligence']>
    const p=buildAskHealthEvidencePacket(x)
    expect(p.evidence.some(y=>y.id.startsWith('intelligence.'))).toBe(false)
    expect(p.evidence.some(y=>y.id==='context.tags')).toBe(true)
    expect(p.evidence.find(y=>y.id==='weight_energy.source_consistency'))
      .toMatchObject({substantive:false})
    expect(p.contextSummary.knows).toEqual([])
    const ok=base();ok.focusedWeightEnergy={...focus,
      nutritionSourceRecheck:'verified'}
    ok.intelligence=x.intelligence
    const valid=buildAskHealthEvidencePacket(ok)
    expect(valid.evidence.some(y=>y.id==='intelligence.coverage.activity.steps')).toBe(true)
    expect(packetFingerprintMaterial(valid)).not.toBe(packetFingerprintMaterial(p))
  })
  it('does not add a current consistency warning for synthetic historical/General Only cases',()=>{
    const historical=base();historical.asOf='2026-10-15'
    expect(buildAskHealthEvidencePacket(historical).evidence
      .some(x=>x.id==='context.tags')).toBe(true)
    const general=base();general.contextMode='general_only'
    expect(buildAskHealthEvidencePacket(general).evidence
      .some(x=>x.id==='weight_energy.source_consistency')).toBe(false)
  })
})
