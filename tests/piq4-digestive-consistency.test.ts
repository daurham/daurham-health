import { describe,expect,it } from 'vitest'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { digestivePairingSourcesAgree } from '../src/domain/ask-health/digestive-consistency.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import { focusDigestiveContext } from '../src/domain/ask-health/focused-digestive.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'
const today='2026-10-16',start='2026-10-01',date='2026-10-10'
const observations:IntelligenceObservation[]=[
  {key:'nutrition.calories',date,value:650,unit:'kcal',sourceIds:['f1'],quality:'high_confidence',provenance:'owner'},
  {key:'nutrition.fiber_g',date,value:18,unit:'g',sourceIds:['f1'],quality:'high_confidence',provenance:'owner'},
  {key:'hydration.ml',date,value:740,unit:'ml',sourceIds:['w1'],provenance:'owner'},
  {key:'bowel.count',date,value:1,unit:'count',sourceIds:['b1'],provenance:'owner'},
]
const snapshot=buildHealthIntelligenceSnapshot({range:'30d',asOf:today,start,end:today,today,
  timezone:'America/Phoenix',observations,
  nutritionVerifiedCompleteDates:new Set([date]),nutritionVerificationStatus:'available'})
const scope={start,end:today,calendarDays:16}
const make=()=>({
  snapshot,scope,today,
  expectedContexts:[{contextDate:date,tags:['travel' as const]}],
  verifiedFiberRows:[{date,source_ids:['f1'],calories:'650',fiber:'18',missing_fiber:0}],
  waterRows:[{date,source_ids:['w1'],amount_ml:'740'}],
  contextTagRows:[{date,tag_key:'travel'}],
})
describe('PIQ-4.1 optimistic source reread (synthetic only)',()=>{
  it('accepts exact values, canonical UUID sources and recorded context tags',()=>{
    expect(digestivePairingSourcesAgree(make())).toBe(true)
  })
  it('rejects fiber editing even when calories and ID are unchanged',()=>{
    const a=make();a.verifiedFiberRows[0]!.fiber='21'
    expect(digestivePairingSourcesAgree(a)).toBe(false)
  })
  it('rejects removed, added and unverified fiber days',()=>{
    const a=make();a.verifiedFiberRows=[]
    expect(digestivePairingSourcesAgree(a)).toBe(false)
    const b=make();b.verifiedFiberRows.push({date:'2026-10-11',source_ids:['f2'],calories:'500',fiber:'10',missing_fiber:0})
    expect(digestivePairingSourcesAgree(b)).toBe(false)
    const c=make();c.verifiedFiberRows[0]!.missing_fiber=1
    expect(digestivePairingSourcesAgree(c)).toBe(false)
  })
  it('rejects new/removed water events or revised water values at same ID',()=>{
    const a=make();a.waterRows[0]!.amount_ml='820'
    expect(digestivePairingSourcesAgree(a)).toBe(false)
    const b=make();b.waterRows[0]!.source_ids=['w2']
    expect(digestivePairingSourcesAgree(b)).toBe(false)
    const c=make();c.waterRows=[]
    expect(digestivePairingSourcesAgree(c)).toBe(false)
  })
  it('rejects added, removed, duplicated or edited daily context tags',()=>{
    const a=make();a.contextTagRows=[]
    expect(digestivePairingSourcesAgree(a)).toBe(false)
    const b=make();b.contextTagRows.push({date,tag_key:'sick'})
    expect(digestivePairingSourcesAgree(b)).toBe(false)
    const c=make();c.contextTagRows[0]!.tag_key='new_supplement'
    expect(digestivePairingSourcesAgree(c)).toBe(false)
    const d=make();d.contextTagRows.push({date,tag_key:'travel'})
    expect(digestivePairingSourcesAgree(d)).toBe(false)
  })
  it('does not require a note-only daily context to be reread as a text field',()=>{
    const a=make();a.expectedContexts.push({contextDate:'2026-10-11',tags:[]})
    expect(digestivePairingSourcesAgree(a)).toBe(true)
  })
  it('fails closed on invalid scope, duplicate IDs or unexpected future data',()=>{
    const a=make();a.scope={start:'2026-01-01',end:today,calendarDays:289}
    expect(digestivePairingSourcesAgree(a)).toBe(false)
    const b=make();b.waterRows[0]!.source_ids=['w1','w1']
    expect(digestivePairingSourcesAgree(b)).toBe(false)
    const c=make();c.contextTagRows.push({date:today,tag_key:'travel'})
    expect(digestivePairingSourcesAgree(c)).toBe(false)
  })
  it('withholds sample and fiber/water context if earlier sources changed',()=>{
    const focus=focusDigestiveContext({question:'Are hard stools from fiber and water?',
      snapshot,today})!
    const input:AskHealthPacketInput={question:'Are hard stools from fiber and water?',
      lens:'general',range:'30d',asOf:today,generatedAt:today+'T20:00:00Z',
      contextMode:'personalized',period:{start,end:today},overview:null,activity:null,sleep:null,
      goals:[],experiments:[],benchmarks:[],supplements:[],context:null,patterns:[],
      focusedDigestive:{...focus,digestiveConsistencyIssue:'changed_or_unavailable'},
    }
    const evidence=buildAskHealthEvidencePacket(input).evidence
    expect(evidence.some(x=>x.id==='digestive.source_consistency.unavailable')).toBe(true)
    expect(evidence.some(x=>x.id==='digestive.pairing.coverage.fiber')).toBe(false)
    expect(evidence.some(x=>x.id==='digestive.focus.fiber.'+date)).toBe(false)
    expect(evidence.some(x=>x.id==='digestive.focus.hydration.'+date)).toBe(false)
  })
})
