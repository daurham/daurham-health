import { describe, expect, it, vi } from 'vitest'
import { requiresHistoricalGoalBoundary } from '../src/domain/ask-health/historical-goal-scope.js'
import { buildAskHealthEvidencePacket, packetFingerprintMaterial } from '../src/domain/ask-health/packet.js'
import { buildHealthIntelligenceSnapshot } from '../src/domain/intelligence/shared.js'
import { focusHistoricalWeightEnergyWindow } from '../src/domain/ask-health/focused-weight-energy-window.js'
import type { AskGoalInput, AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const today='2026-10-16'
const goal:AskGoalInput={
  id:'private-id-from-current-goal',
  kind:'body_metric',lifecycle:'active',label:'Bodyweight',
  targetText:'AT MOST 180 lb (present-day target, NOT a past target)',
  targetState:'above_target',deadlineState:'projected_before_deadline',
  projectionState:'available',projectionReason:null,
}
const packetInput=(question:string,asOf=today):AskHealthPacketInput=>({
  question,asOf,healthToday:today,
  lens:'general',range:'30d',contextMode:'personalized',
  period:{start:'2026-09-17',end:asOf},generatedAt:today+'T21:00:00Z',
  overview:null,activity:null,sleep:null,goals:[goal],
  experiments:[],benchmarks:[],supplements:[],context:null,patterns:[],
})

describe('PIQ-4.2 non-reconstructed historical Goal Control status',()=>{
  it('requires historical guard for dated as-of, future as-of and uncertain calendar metadata',()=>{
    expect(requiresHistoricalGoalBoundary({
      asOf:'2026-10-15',today,question:'How are my goals?',
    })).toBe(true)
    expect(requiresHistoricalGoalBoundary({
      asOf:'2026-10-17',today,question:'How are my goals?',
    })).toBe(true)
    expect(requiresHistoricalGoalBoundary({
      asOf:today,today:null,question:'What is my goal?',
    })).toBe(true)
  })
  it('recognizes explicit historical target dates and ranges even when asOf is today',()=>{
    for(const question of [
      'What was my goal on 2026-10-01?',
      'Was my target met yesterday?',
      'Did I meet my weight goal last week?',
      'What was my objective last month?',
      'Did I have the right goal on 10/10/26?',
      'Did I meet my goal last Friday?',
    ]){
      expect(requiresHistoricalGoalBoundary({asOf:today,today,question})).toBe(true)
    }
    expect(requiresHistoricalGoalBoundary({
      asOf:today,today,question:'What is my weight goal today?',
    })).toBe(false)
    expect(requiresHistoricalGoalBoundary({
      asOf:today,today,question:'What are my current goals?',
    })).toBe(false)
    expect(requiresHistoricalGoalBoundary({
      asOf:today,today,question:'How are my macros?',
    })).toBe(false)
  })
  it('does not expose injected present-day target or lifecycle in historical evidence',()=>{
    const packet=buildAskHealthEvidencePacket(packetInput('Was my goal met on 2026-10-01?'))
    const row=packet.evidence.find(e=>e.id==='goals.historical_attestation_boundary')
    expect(row).toMatchObject({
      substantive:false,value:null,
      coverage:{historicalGoalStatus:'unverified'},
    })
    expect(row?.text).toContain('NOT verified')
    expect(JSON.stringify(packet)).not.toContain('private-id-from-current-goal')
    expect(JSON.stringify(packet)).not.toContain('AT MOST 180 lb')
    expect(packet.evidence.some(e=>e.id.startsWith('goals.private-id'))).toBe(false)
    expect(packet.limitations).toEqual(expect.arrayContaining([
      expect.objectContaining({code:'historical_goal_attestation_unverified'}),
    ]))
  })
  it('retains current-day goal target state only with a fully current scope',()=>{
    const packet=buildAskHealthEvidencePacket(packetInput('What is my current weight goal?'))
    expect(packet.evidence.find(e=>e.id==='goals.'+goal.id)?.value).toBe('above_target')
    expect(packet.evidence.some(e=>e.id==='goals.historical_attestation_boundary')).toBe(false)
  })
  it('keeps the historical goal boundary when an exact historical weight window filters other evidence',()=>{
    const snap=buildHealthIntelligenceSnapshot({
      asOf:today,today,timezone:'America/Phoenix',
      range:'30d',start:'2026-09-17',end:today,observations:[],
    })
    const focus=focusHistoricalWeightEnergyWindow({
      question:'Was my weight goal met last week?',snapshot:snap,today,
    })
    expect(focus).not.toBeNull()
    const packet=buildAskHealthEvidencePacket({
      ...packetInput('Was my weight goal met last week?'),
      focusedWeightEnergyWindow:focus,
    })
    expect(packet.evidence.some(e=>e.id==='goals.historical_attestation_boundary')).toBe(true)
    expect(packet.evidence.some(e=>e.id==='goals.'+goal.id)).toBe(false)
  })
  it('updates the packet fingerprint when historical integrity boundary applies',()=>{
    const current=buildAskHealthEvidencePacket(packetInput('What is my current goal?'))
    const past=buildAskHealthEvidencePacket(packetInput('What was my goal yesterday?'))
    expect(packetFingerprintMaterial(current)).not.toBe(packetFingerprintMaterial(past))
    expect(current.evidence.some(e=>e.id==='goals.'+goal.id)).toBe(true)
    expect(past.evidence.some(e=>e.id==='goals.'+goal.id)).toBe(false)
  })
})
