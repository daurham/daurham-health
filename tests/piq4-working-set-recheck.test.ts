import {describe,expect,it} from 'vitest'
import type {Sql} from '../server/db.js'
import type {CanonicalSetRecord} from '../src/domain/progress/types.js'
import {buildHealthIntelligenceSnapshot,routeHealthIntelligence} from '../src/domain/intelligence/shared.js'
import {
  canonicalWorkingSetsAgree,recheckCurrentWorkingSets,RECHECK_WORKING_SETS_SQL,
} from '../server/ask-health/current-working-sets-recheck.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'

const today='2026-10-16',start='2026-10-01',day='2026-10-15'
const set:CanonicalSetRecord={
  setId:'set-a',sessionId:'session-a',sessionExerciseId:'exercise-instance-a',
  exerciseId:'exercise-definition-a',sessionDate:day,sessionCreatedAt:day+'T13:00:00.000Z',
  sessionExercisePosition:1,setNumber:1,setType:'working',loadState:'external',
  weightKg:30,reps:8,durationSec:null,leftReps:null,rightReps:null,
  leftDurationSec:null,rightDurationSec:null,
}
const check=(initial:CanonicalSetRecord[],late:CanonicalSetRecord[],exerciseId:string|null=null)=>
  canonicalWorkingSetsAgree({initial,late,start,end:today,exerciseId})
const sqlRow=(s:CanonicalSetRecord):Record<string,unknown>=>({
  set_id:s.setId,session_id:s.sessionId,session_exercise_id:s.sessionExerciseId,
  exercise_id:s.exerciseId,session_date:s.sessionDate,
  session_created_at:new Date(s.sessionCreatedAt),
  session_exercise_position:s.sessionExercisePosition,set_number:s.setNumber,
  set_type:s.setType,load_state:s.loadState,weight_kg:s.weightKg,reps:s.reps,
  duration_sec:s.durationSec,left_reps:s.leftReps,right_reps:s.rightReps,
  left_duration_sec:s.leftDurationSec,right_duration_sec:s.rightDurationSec,
})
const packet=(status:'verified'|'changed_or_unavailable')=>{
  const snapshot=buildHealthIntelligenceSnapshot({
    range:'30d',start,end:today,asOf:today,today,timezone:'America/Phoenix',
    observations:[{
      key:'training.sessions',date:day,value:1,unit:'sessions',
      provenance:'owner',sourceIds:['session-a'],
    }],
  })
  const intelligence=routeHealthIntelligence(snapshot,{
    question:'How is my bench strength?',lens:'training',
  })
  const input:AskHealthPacketInput={
    question:'How is my bench strength?',lens:'training',range:'30d',
    asOf:today,healthToday:today,period:{start,end:today},
    generatedAt:today+'T21:00:00Z',contextMode:'personalized',
    overview:null,activity:null,sleep:null,goals:[],experiments:[],
    benchmarks:[],supplements:[],context:null,patterns:[],
    intelligence,trainingSnapshotConsistency:'verified',
    workingSetSourceRecheck:status,
    focusedTraining:{
      exerciseId:set.exerciseId,exerciseName:'Bench Press',eligibleAppearances:1,
      appearances:[{setId:set.setId,date:day,weightKg:30,reps:8,estimated1RmKg:38}],
    },
  }
  return buildAskHealthEvidencePacket(input)
}
describe('PIQ-4.2 canonical working-set last-read integrity',()=>{
  it('agrees on complete equal sets independent of order, including empty selection',()=>{
    const second={...set,setId:'set-b',setNumber:2,reps:10}
    expect(check([set,second],[second,set])).toBe(true)
    expect(check([],[])).toBe(true)
    expect(check([set],[], 'unrelated-exercise')).toBe(true)
  })
  it('rejects unchanged ID but edited load, reps, side reps, type, grouping or order',()=>{
    const edits:CanonicalSetRecord[]=[
      {...set,weightKg:32},{...set,reps:9},
      {...set,leftReps:7,rightReps:8,reps:null},
      {...set,setType:'warmup'},{...set,loadState:'bodyweight'},
      {...set,sessionExerciseId:'new-instance'},
      {...set,sessionExercisePosition:2},{...set,setNumber:2},
      {...set,sessionDate:'2026-10-14'},
      {...set,sessionCreatedAt:day+'T14:00:00.000Z'},
    ]
    for(const edit of edits)expect(check([set],[edit])).toBe(false)
  })
  it('rejects deletion, insertion, replaced IDs and malformed duplicates',()=>{
    expect(check([set],[])).toBe(false)
    expect(check([],[set])).toBe(false)
    expect(check([set],[{...set,setId:'replacement'}])).toBe(false)
    expect(check([set,set],[set,set])).toBe(false)
    expect(check([set],[{...set,setId:''}])).toBe(false)
    expect(check([set],[{...set,setNumber:0}])).toBe(false)
  })
  it('fails closed for bad scope, later SQL errors and changes with no initial sets',async()=>{
    expect(canonicalWorkingSetsAgree({
      initial:[set],late:[set],start:'2026-11-01',end:today,exerciseId:null,
    })).toBe(false)
    let calls=0
    const goodSql={query:async(sql:string,params:unknown[])=>{
      calls++
      expect(sql).toBe(RECHECK_WORKING_SETS_SQL)
      expect(params).toEqual([start,today,set.exerciseId])
      return [sqlRow(set)]
    }} as unknown as Sql
    expect(await recheckCurrentWorkingSets({
      initial:[set],start,end:today,today,exerciseId:set.exerciseId,
      sqlOverride:goodSql,
    })).toBe('verified')
    expect(calls).toBe(1)
    const unavailable={query:async()=>{throw Error('database unavailable')}} as unknown as Sql
    expect(await recheckCurrentWorkingSets({
      initial:[set],start,end:today,today,exerciseId:null,
      sqlOverride:unavailable,
    })).toBe('changed_or_unavailable')
    const insertion={query:async()=>[sqlRow(set)]} as unknown as Sql
    expect(await recheckCurrentWorkingSets({
      initial:[],start,end:today,today,exerciseId:null,
      sqlOverride:insertion,
    })).toBe('changed_or_unavailable')
    expect(await recheckCurrentWorkingSets({
      initial:[set],start,end:'2026-10-17',today,exerciseId:null,
      sqlOverride:goodSql,
    })).toBe('changed_or_unavailable')
    expect(calls).toBe(1)
  })
  it('withholds focused strength and Training intelligence after content conflict',()=>{
    const good=packet('verified'),bad=packet('changed_or_unavailable')
    expect(good.evidence.some(x=>x.id==='training.focus.set.set-a')).toBe(true)
    expect(bad.evidence.some(x=>x.id==='training.focus.set.set-a')).toBe(false)
    expect(bad.evidence.some(x=>x.id==='intelligence.coverage.training.sessions'))
      .toBe(false)
    expect(bad.evidence.find(x=>x.id==='training.source_consistency'))
      .toMatchObject({value:null,substantive:false,
        coverage:{workingSetSourceAgreement:'changed_or_unavailable'}})
    expect(packetFingerprintMaterial(good)).not.toBe(packetFingerprintMaterial(bad))
  })
})
