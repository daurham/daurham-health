import { describe,expect,it,vi } from 'vitest'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { focusDigestiveContext, digestiveQuestionTopics } from '../src/domain/ask-health/focused-digestive.js'
import { selectDigestiveBowelWindow, summarizeBowelWindow } from '../src/domain/ask-health/digestive-window.js'
import { digestivePacketGuard } from '../src/domain/ask-health/digestive-packet-guard.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import { detectImmediateSafety } from '../src/domain/ask-health/immediate-safety.js'
import { answerAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const load=vi.hoisted(()=>vi.fn())
vi.mock('../server/ask-health/load.js',()=>({loadAskHealthPacketInput:load}))

const today='2026-10-16',start='2026-10-01'
const records:IntelligenceObservation[]=[
  {key:'bowel.count',date:'2026-10-05',value:0,unit:'count',
    provenance:'owner',sourceIds:[]},
  {key:'bowel.count',date:'2026-10-12',value:1,unit:'count',
    provenance:'owner',sourceIds:['event-one']},
]
const snapshot=buildHealthIntelligenceSnapshot({
  range:'30d',asOf:today,start,end:today,today,timezone:'America/Phoenix',
  observations:records,nutritionVerifiedCompleteDates:new Set<string>(),
  nutritionVerificationStatus:'available',
})
function historical(day:string){
  const question='How many bowel movements and Bristol types on '+day+'?'
  const focus=focusDigestiveContext({question,snapshot,today})!
  const selection=selectDigestiveBowelWindow(focus,today)!
  if(selection.status!=='ready')throw Error('Expected selected single day')
  const row=day==='2026-10-12'?[{
    date:day,eventCount:1,typedCount:1,hardCount:1,matchedEventCount:1,
  }]:[]
  const bowelWindow=summarizeBowelWindow(snapshot,selection.scope,row,today)
  const input:AskHealthPacketInput={
    question,contextMode:'personalized',lens:'general',
    range:'30d',asOf:today,period:{start,end:today},
    generatedAt:today+'T20:00:00Z',overview:null,activity:null,sleep:null,
    goals:[],experiments:[],benchmarks:[],supplements:[],context:null,patterns:[],
    focusedDigestive:{...focus,bowelWindow},
  }
  return {window:bowelWindow,input,packet:buildAskHealthEvidencePacket(input)}
}
describe('PIQ-4.1 final digestive boundary regressions (synthetic)',()=>{
  it('an entirely missing single historical day is UNKNOWN, never recorded zero',()=>{
    const f=historical('2026-10-04')
    expect(f.window).toMatchObject({status:'available',observedDays:0,
      unobservedDays:1,movementEvents:0,explicitNoMovementDays:0})
    const fact=f.packet.evidence.find(e=>e.id==='digestive.window.bristol')
    expect(fact?.value).toBeNull()
    expect(fact?.unit).toBeNull()
    expect(fact?.substantive).toBe(false)
    expect(fact?.text).toContain('NO bowel status is saved')
    expect(f.packet.evidence.some(e=>e.id==='digestive.focus.bowel.2026-10-12')).toBe(false)
  })
  it('explicit no-movement historical status is distinguishable from missing',()=>{
    const f=historical('2026-10-05')
    expect(f.window).toMatchObject({status:'available',observedDays:1,
      explicitNoMovementDays:1,unobservedDays:0,movementEvents:0})
    const fact=f.packet.evidence.find(e=>e.id==='digestive.window.bristol')
    expect(fact?.value).toBe(0)
    expect(fact?.text).toContain('1 separately recorded no-movement day')
    expect(f.packet.evidence.find(e=>e.id==='digestive.focus.bowel.2026-10-05')?.value).toBe(0)
  })
  it('returns a source-specific typed event for a known historical day only',()=>{
    const f=historical('2026-10-12')
    expect(f.window).toMatchObject({status:'available',observedDays:1,
      movementEvents:1,typedEvents:1,hardTypedEvents:1})
    expect(f.packet.evidence.find(e=>e.id==='digestive.window.bristol')?.value).toBe(1)
    expect(f.packet.evidence.some(e=>e.id==='digestive.focus.bowel.2026-10-05')).toBe(false)
  })
  it('routes clearly current severe digestive red flags to deterministic emergency guidance',async()=>{
    load.mockClear()
    const provider=vi.fn()
    for(const question of [
      'I am vomiting blood',
      "I'm throwing up blood",
      'I have severe abdominal pain',
      'I am having severe stomach pain',
      'I am passing black tarry stools',
      'I have black tarry stools',
      'My stool is black and tarry',
    ]){
      expect(detectImmediateSafety(question)).toBe('emergency')
      const response=await answerAskHealth({
        question,lens:'general',range:'30d',asOf:today,conversation:[],
        provider,gate:createAskHealthGate({budgetUsd:0}),model:'synthetic-model',now:1000,
      })
      expect(response.meta.answerScope).toBe('urgent_safety')
      expect(response.meta.provider).toBe('health')
      expect(response.evidence).toEqual([])
      expect(response.answer.blocks[0]?.text).toContain('local emergency number')
    }
    expect(load).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
  })
  it('does not treat educational, negated, historic or hypothetical GI statements as a current emergency',()=>{
    for(const question of [
      'What causes vomiting blood?',
      'I am not vomiting blood',
      'I threw up blood last year',
      'I had severe abdominal pain in 2022',
      'I do not have severe abdominal pain',
      'What if someone passes black tarry stools?',
      'I was passing black tarry stools last week',
      'What if my stool is black and tarry?',
      'I do not have black tarry stools',
      'My stool was black and tarry last month',
    ]){
      expect(detectImmediateSafety(question)).toBeNull()
    }
  })
  it('General Only avoids the private loader for digestive history despite personal wording',async()=>{
    load.mockClear()
    const provider=vi.fn()
    const response=await answerAskHealth({
      question:'How many hard stools did I record yesterday?',
      lens:'general',range:'30d',asOf:today,conversation:[],
      contextMode:'general_only',provider,gate:createAskHealthGate({budgetUsd:0}),
      model:'synthetic-model',now:1000,
    })
    expect(load).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
    expect(response.meta.answerScope).toBe('general')
    expect(response.evidence).toEqual([])
  })
  it('recognizes rabbit-pellet wording as stool-type context, not a movement-count correlation',()=>{
    const question='Why am I passing rabbit pellets?'
    expect(digestiveQuestionTopics(question).bowel).toBe(true)
    expect(digestivePacketGuard({
      ...historical('2026-10-12').input,question,
    }).stoolTypeQuestion).toBe(true)
  })
})
