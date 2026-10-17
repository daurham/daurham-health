import {describe,expect,it} from 'vitest'
import type {Sql} from '../server/db.js'
import type {ProgressExerciseDefinition} from '../src/domain/progress/types.js'
import {
  canonicalExerciseDefinitionsAgree,recheckCurrentExerciseDefinitions,
  RECHECK_EXERCISE_DEFINITIONS_SQL,
} from '../server/ask-health/current-exercise-definitions-recheck.js'
import {mapProgressExerciseDefinitionRow} from '../server/progress/queries.js'
import {buildHealthIntelligenceSnapshot,routeHealthIntelligence} from '../src/domain/intelligence/shared.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'

const today='2026-10-16',start='2026-10-01',date='2026-10-15'
const definition:ProgressExerciseDefinition={
  id:'exercise-a',name:'Barbell Bench Press',externalId:'bench-press',
  performanceType:'loaded_reps',analyticsLoadType:'external',
  analyticsRepMode:'standard',measurementKind:'reps',unilateral:false,
}
const other:ProgressExerciseDefinition={
  ...definition,id:'exercise-b',name:'Dumbbell Bench Press',externalId:null,
  analyticsRepMode:'per_side',unilateral:true,
}
const dbRow=(e:ProgressExerciseDefinition):Record<string,unknown>=>({
  id:e.id,name:e.name,external_id:e.externalId,
  performance_type:e.performanceType,
  analytics_load_type:e.analyticsLoadType,
  analytics_rep_mode:e.analyticsRepMode,
  measurement_kind:e.measurementKind,unilateral:e.unilateral,
})
const packet=(status:'verified'|'changed_or_unavailable')=>{
  const intelligence=routeHealthIntelligence(
    buildHealthIntelligenceSnapshot({
      range:'30d',start,end:today,asOf:today,today,timezone:'America/Phoenix',
      observations:[{
        key:'training.sessions',date,value:1,unit:'sessions',
        provenance:'owner',sourceIds:['session-a'],
      }],
    }),
    {question:'Compare bench press strength',lens:'training'},
  )
  const input:AskHealthPacketInput={
    question:'Compare bench press strength',lens:'training',range:'30d',
    asOf:today,healthToday:today,generatedAt:today+'T21:00:00Z',
    period:{start,end:today},contextMode:'personalized',
    overview:{exercises:[
      {name:'Barbell Bench Press',exerciseId:'exercise-a',
        appearanceCount:1,trend:{status:'insufficient_data'}},
      {name:'Dumbbell Bench Press',exerciseId:'exercise-b',
        appearanceCount:1,trend:{status:'insufficient_data'}},
    ]} as unknown as AskHealthPacketInput['overview'],
    activity:null,sleep:null,
    goals:[],experiments:[],benchmarks:[],supplements:[],context:null,
    patterns:[],intelligence,trainingSnapshotConsistency:'verified',
    workingSetSourceRecheck:'verified',exerciseDefinitionSourceRecheck:status,
    focusedTraining:{exerciseId:definition.id,exerciseName:definition.name,
      eligibleAppearances:1,appearances:[{
        setId:'set-1',date,weightKg:40,reps:8,estimated1RmKg:50.7,
      }]},
  }
  return buildAskHealthEvidencePacket(input)
}

describe('PIQ-4.2 canonical exercise metadata source consistency',()=>{
  it('matches all canonical effective fields regardless of SQL ordering',()=>{
    expect(canonicalExerciseDefinitionsAgree([definition,other],[other,definition])).toBe(true)
    expect(canonicalExerciseDefinitionsAgree([],[])).toBe(true)
    expect(mapProgressExerciseDefinitionRow(dbRow(definition))).toEqual(definition)
  })
  it('detects label and analytics changes even with identical sets and session IDs',()=>{
    const edits:ProgressExerciseDefinition[]=[
      {...definition,name:'Bench Press'},
      {...definition,externalId:'different'},
      {...definition,performanceType:'timed'},
      {...definition,analyticsLoadType:'combined'},
      {...definition,analyticsRepMode:'per_side'},
      {...definition,measurementKind:'duration'},
      {...definition,unilateral:true},
      {...definition,id:'new-id'},
    ]
    for(const edit of edits)expect(canonicalExerciseDefinitionsAgree(
      [definition],[edit])).toBe(false)
  })
  it('fails closed on added/missing definitions, duplicates and malformed data',()=>{
    expect(canonicalExerciseDefinitionsAgree([definition],[])).toBe(false)
    expect(canonicalExerciseDefinitionsAgree([],[definition])).toBe(false)
    expect(canonicalExerciseDefinitionsAgree([definition],[definition,definition])).toBe(false)
    expect(canonicalExerciseDefinitionsAgree([definition],[{...definition,name:''}])).toBe(false)
    expect(canonicalExerciseDefinitionsAgree([definition],[{...definition,id:''}])).toBe(false)
  })
  it('uses exactly one read-only local query and handles errors safely',async()=>{
    let calls=0
    const ok={query:async(sql:string)=>{
      calls++
      expect(sql).toBe(RECHECK_EXERCISE_DEFINITIONS_SQL)
      return [dbRow(other),dbRow(definition)]
    }} as unknown as Sql
    expect(await recheckCurrentExerciseDefinitions({
      initial:[definition,other],start,end:today,today,sqlOverride:ok,
    })).toBe('verified')
    expect(calls).toBe(1)
    const edited={query:async()=>[dbRow({...definition,name:'Edited'})]} as unknown as Sql
    expect(await recheckCurrentExerciseDefinitions({
      initial:[definition],start,end:today,today,sqlOverride:edited,
    })).toBe('changed_or_unavailable')
    const broken={query:async()=>{throw Error('DB unavailable')}} as unknown as Sql
    expect(await recheckCurrentExerciseDefinitions({
      initial:[definition],start,end:today,today,sqlOverride:broken,
    })).toBe('changed_or_unavailable')
    expect(await recheckCurrentExerciseDefinitions({
      initial:[definition],start,end:'2026-10-17',today,sqlOverride:ok,
    })).toBe('changed_or_unavailable')
    expect(calls).toBe(1)
  })
  it('withholds strength, shared Training evidence and stale match clarification',()=>{
    const good=packet('verified'),bad=packet('changed_or_unavailable')
    expect(good.evidence.some(e=>e.id==='training.focus.set.set-1')).toBe(true)
    expect(bad.evidence.some(e=>e.id==='training.focus.set.set-1')).toBe(false)
    expect(bad.evidence.some(e=>e.id==='intelligence.coverage.training.sessions'))
      .toBe(false)
    expect(bad.evidence.find(e=>e.id==='training.source_consistency'))
      .toMatchObject({value:null,substantive:false,
        coverage:{exerciseDefinitionAgreement:'changed_or_unavailable'}})
    expect(bad.clarification).toBeNull()
    expect(packetFingerprintMaterial(good)).not.toBe(packetFingerprintMaterial(bad))
  })
})
