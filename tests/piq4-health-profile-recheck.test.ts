import {describe,expect,it} from 'vitest'
import {healthProfileSchema,type HealthProfile} from '../src/domain/health-profile.js'
import {
  currentHealthProfilesAgree,recheckCurrentHealthProfile,
} from '../server/ask-health/current-health-profile-recheck.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'
import {askStableProfileForDate} from '../src/domain/ask-health/stable-profile.js'
import {askClinicalProfileForDate} from '../src/domain/ask-health/clinical-profile.js'

const today='2026-10-16',start='2026-10-01'
const profile:HealthProfile=healthProfileSchema.parse({
  sexForPhysiology:'female',dateOfBirth:'1991-01-10',heightCm:169,
  persistentHealthContext:'Owner recorded context',
  trainingLimitations:'Ankle limitation',
  dietaryContext:'Vegetarian preference',
  bodyMeasurementProtocol:'Morning scale',
  clinicalConditions:[{name:'Condition A',status:'active'}],
  clinicalAllergies:[{substance:'Substance A',reaction:'Rash',severity:'mild'}],
  clinicalMedications:[{name:'Medicine A',dose:'1 tablet',frequency:'daily',status:'active'}],
  updatedAt:'2026-10-16T10:00:00.000Z',
})
const packet=(status:'verified'|'changed_or_unavailable')=>{
  const input:AskHealthPacketInput={
    lens:'general',range:'30d',asOf:today,healthToday:today,
    period:{start,end:today},generatedAt:today+'T19:00:00Z',
    question:'What does my saved health profile say about my age, medicines and allergies?',
    contextMode:'personalized',overview:null,activity:null,sleep:null,
    goals:[],experiments:[],benchmarks:[],supplements:[],context:null,patterns:[],
    stableProfile:askStableProfileForDate(profile,today,today),
    profile:askClinicalProfileForDate(profile,today,today),
    currentHealthProfileSourceRecheck:status,
  }
  return buildAskHealthEvidencePacket(input)
}
describe('PIQ-4.2 owner Health Profile current source agreement',()=>{
  it('matches unchanged fields and empty profile, including originally absent singleton',()=>{
    expect(currentHealthProfilesAgree(profile,structuredClone(profile))).toBe(true)
    const empty=healthProfileSchema.parse({
      sexForPhysiology:null,dateOfBirth:null,heightCm:null,
      persistentHealthContext:null,trainingLimitations:null,dietaryContext:null,
      bodyMeasurementProtocol:null,clinicalConditions:[],clinicalAllergies:[],
      clinicalMedications:[],updatedAt:null,
    })
    expect(currentHealthProfilesAgree(empty,empty)).toBe(true)
    expect(currentHealthProfilesAgree(empty,profile)).toBe(false)
  })
  it('catches metadata, revision, medication, allergy and condition edits',()=>{
    const changes:HealthProfile[]=[
      {...profile,updatedAt:'2026-10-16T10:01:00.000Z'},
      {...profile,heightCm:170},{...profile,dateOfBirth:'1990-01-10'},
      {...profile,sexForPhysiology:'male'},
      {...profile,persistentHealthContext:'new context'},
      {...profile,trainingLimitations:null},
      {...profile,dietaryContext:'new diet'},
      {...profile,bodyMeasurementProtocol:'Evening'},
      {...profile,clinicalConditions:[]},
      {...profile,clinicalConditions:[{name:'Condition A',status:'resolved'}]},
      {...profile,clinicalAllergies:[{substance:'Substance A',reaction:null,severity:'unknown'}]},
      {...profile,clinicalMedications:[{name:'Medicine A',dose:'2 tablets',frequency:'daily',status:'active'}]},
      {...profile,clinicalMedications:[{name:'Medicine A',dose:'1 tablet',frequency:'daily',status:'paused'}]},
    ]
    for(const changed of changes)expect(currentHealthProfilesAgree(profile,changed)).toBe(false)
    expect(currentHealthProfilesAgree(profile,{...profile,updatedAt:'not-an-instant'})).toBe(false)
  })
  it('performs one final read, fails closed on failed reads and historical requests',async()=>{
    let calls=0
    const get=async()=>{calls++;return structuredClone(profile)}
    expect(await recheckCurrentHealthProfile({first:profile,asOf:today,today,read:get})).toBe('verified')
    expect(calls).toBe(1)
    expect(await recheckCurrentHealthProfile({
      first:profile,asOf:today,today,
      read:async()=>({...profile,clinicalMedications:[]}),
    })).toBe('changed_or_unavailable')
    expect(await recheckCurrentHealthProfile({
      first:profile,asOf:today,today,
      read:async()=>{throw Error('read unavailable')},
    })).toBe('changed_or_unavailable')
    expect(await recheckCurrentHealthProfile({
      first:profile,asOf:'2026-10-15',today,read:get,
    })).toBe('changed_or_unavailable')
    expect(calls).toBe(1)
  })
  it('suppresses all direct profile and clinical values; unrelated evidence survives',()=>{
    const good=packet('verified'),bad=packet('changed_or_unavailable')
    expect(good.evidence.some(e=>e.id==='profile.age_years_as_of')).toBe(true)
    expect(good.evidence.some(e=>e.id.startsWith('clinical.'))).toBe(true)
    expect(bad.evidence.some(e=>e.id==='profile.source_consistency')).toBe(true)
    expect(bad.evidence.some(e=>e.id.startsWith('clinical.'))).toBe(false)
    expect(bad.evidence.some(e=>e.id.startsWith('profile.')&&
      e.id!=='profile.source_consistency')).toBe(false)
    expect(bad.evidence.find(e=>e.id==='profile.source_consistency'))
      .toMatchObject({value:null,substantive:false,
        coverage:{profileSourceRecheck:'changed_or_unavailable'}})
    expect(bad.evidence.some(e=>e.id==='ask.range')).toBe(true)
    expect(packetFingerprintMaterial(good)).not.toEqual(packetFingerprintMaterial(bad))
    expect(JSON.stringify(bad)).not.toContain('Owner recorded context')
    expect(JSON.stringify(bad)).not.toContain('Medicine A')
  })
})
