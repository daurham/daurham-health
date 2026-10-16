import {describe,expect,it,vi} from 'vitest'
import type {Sql} from '../server/db.js'
import {readCurrentPrimaryGoalIntent} from '../server/ask-health/current-primary-goal-intent.js'
import {screenPrimaryWeightGoalPriority} from '../src/domain/ask-health/primary-weight-goal-intent.js'
import {MAINTENANCE_DECISION_REVISION_SQL} from '../server/intelligence/maintenance-revision.js'
import {screenWeightEnergyCurrentSettings,type WeightEnergyCurrentSettings} from '../src/domain/ask-health/weight-energy-current-settings.js'
import type {GoalRead} from '../server/ask-health/current-weight-goal.js'
import type {CurrentPrimaryIntentRead} from '../server/ask-health/current-primary-goal-intent.js'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'

const asOf='2026-10-16'
const activeGoal='11111111-1111-4111-8111-111111111111'
const otherGoal='22222222-2222-4222-8222-222222222222'
const revisionA='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const revisionB='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const consistent:WeightEnergyCurrentSettings={
 state:'consistent_read',calorieTargetState:'configured',relevantExperimentCount:0,
 weightGoalMode:'at_most',
}
const goals:GoalRead={status:'available',rows:[{
 id:activeGoal,versionId:'private-version',targetMode:'at_most',
 targetMinKg:null,targetMaxKg:80,
}]}
function primary(id:string|null,version=4):CurrentPrimaryIntentRead{
 return {status:'available',intent:{
  version,primaryGoalId:id,effectiveFrom:asOf,
  recordedAt:'2026-10-16T11:30:00Z',source:'owner',
 }}
}
function check(p:CurrentPrimaryIntentRead|null,settings=consistent,goal:GoalRead|null=goals){
 return screenPrimaryWeightGoalPriority({asOf,settings,goal,primary:p})
}
function packet(status:ReturnType<typeof check>){
 const snapshot=buildHealthIntelligenceSnapshot({
  range:'30d',start:'2026-09-17',end:asOf,asOf,today:asOf,
  timezone:'America/Phoenix',observations:[],
 })
 const focus=focusWeightEnergyContext({
  question:'Why has my weight loss stalled?',snapshot,today:asOf,
 })
 expect(focus).not.toBeNull()
 focus!.currentSettings=consistent
 focus!.primaryGoalPriority=status
 const input:AskHealthPacketInput={
  lens:'general',range:'30d',asOf,healthToday:asOf,
  period:{start:'2026-09-17',end:asOf},generatedAt:asOf+'T19:00:00Z',
  question:'Why has my weight loss stalled?',contextMode:'personalized',
  overview:null,activity:null,sleep:null,goals:[],experiments:[],
  benchmarks:[],supplements:[],context:null,patterns:[],
  focusedWeightEnergy:focus,
 }
 return buildAskHealthEvidencePacket(input)
}

describe('PIQ-4.2 current primary intent vs weight-goal reconciliation',()=>{
 it('reads Goal Control as-of effective priority, never inferring an absent row',async()=>{
  const q=vi.fn(async()=>[{
   version:4,primary_goal_id:activeGoal,effective_from:asOf,recorded_at:'now',
  }])
  const read=await readCurrentPrimaryGoalIntent(asOf,{query:q} as unknown as Sql)
  expect(read).toMatchObject({
   status:'available',intent:{primaryGoalId:activeGoal,source:'owner',version:4},
  })
  const [statement,params]=q.mock.calls[0] as unknown as [string,unknown[]]
  expect(statement).toContain('effective_from <= $1::date')
  expect(statement).toContain('ORDER BY effective_from DESC, version DESC')
  expect(params).toEqual([asOf])
  expect(await readCurrentPrimaryGoalIntent(asOf,{
   query:vi.fn(async()=>[]),
  } as unknown as Sql)).toMatchObject({
   status:'available',intent:{source:'unset',primaryGoalId:null,version:0},
  })
 })
 it('refuses failed, malformed or future-dated primary-goal source reads',async()=>{
  for(const rows of [
   [{version:0,primary_goal_id:activeGoal,effective_from:asOf,recorded_at:'now'}],
   [{version:3,primary_goal_id:activeGoal,effective_from:'2026-10-17',recorded_at:'now'}],
   [{version:3,primary_goal_id:'',effective_from:asOf,recorded_at:'now'}],
  ]){
   const r=await readCurrentPrimaryGoalIntent(asOf,{
    query:vi.fn(async()=>rows),
   } as unknown as Sql)
   expect(r.status).toBe('unavailable')
  }
  expect((await readCurrentPrimaryGoalIntent(asOf,{
   query:vi.fn(async()=>{throw new Error('migration absent')}),
  } as unknown as Sql)).status).toBe('unavailable')
  expect((await readCurrentPrimaryGoalIntent('not-a-date',{
   query:vi.fn(async()=>[]),
  } as unknown as Sql)).status).toBe('unavailable')
 })
 it('only attests the owner\'s exact active weight-goal identity',()=>{
  expect(check(primary(activeGoal)).state).toBe('selected_active_weight_goal')
  expect(check(primary(otherGoal)).state).toBe('selected_goal_not_active_weight')
  expect(check(primary(null)).state).toBe('explicitly_cleared')
  expect(check({status:'available',intent:{
   version:0,primaryGoalId:null,effectiveFrom:null,recordedAt:null,source:'unset',
  }}).state).toBe('not_set')
  expect(check(primary(activeGoal),consistent,{
   status:'available',rows:[],
  }).state).toBe('selected_goal_not_active_weight')
 })
 it('a changed goal revision, missing source or ambiguous weight-goal list is UNKNOWN',()=>{
  expect(check(primary(activeGoal),{
   ...consistent,state:'changed_during_read',
  }).state).toBe('unavailable')
  expect(check(primary(activeGoal),{
   ...consistent,state:'unavailable',
  }).state).toBe('unavailable')
  expect(check(primary(activeGoal),{
   ...consistent,state:'not_checked',
  }).state).toBe('not_checked')
  expect(check(null).state).toBe('unavailable')
  expect(check({status:'unavailable',intent:null}).state).toBe('unavailable')
  expect(check(primary(activeGoal),consistent,{
   status:'available',rows:[goals.rows[0]!,goals.rows[0]!],
  }).state).toBe('unavailable')
  expect(check(primary(activeGoal),consistent,{
   status:'unavailable',rows:[],
  }).state).toBe('unavailable')
 })
 it('explicit priority participates in single-statement revision fingerprints',()=>{
  expect(MAINTENANCE_DECISION_REVISION_SQL).toMatch(/primary_goal_intent_events/)
  expect(MAINTENANCE_DECISION_REVISION_SQL).toMatch(/effective_from <= \$1::date/)
  expect(MAINTENANCE_DECISION_REVISION_SQL).toMatch(/'primary_intent', \(SELECT to_jsonb\(i\)/)
  const captured={
   status:'available' as const,currentCalorieTarget:1900,
   activeExperimentCount:0,revision:revisionA,
  }
  const changed=screenWeightEnergyCurrentSettings(captured,{
   ...captured,revision:revisionB,
  })
  expect(changed).toMatchObject({
   state:'changed_during_read',calorieTargetState:'unknown',relevantExperimentCount:null,
  })
  expect(check(primary(activeGoal),changed).state).toBe('unavailable')
 })
 it('publishes only a non-substantive priority status; never goal IDs or calorie permission',()=>{
  const selected=packet(check(primary(activeGoal)))
  const cleared=packet(check(primary(null)))
  const item=selected.evidence.find(x=>x.id==='weight_energy.primary_goal_priority')
  expect(item).toMatchObject({
   substantive:false,value:null,coverage:{priorityState:'selected_active_weight_goal'},
  })
  expect(item?.text).toContain('explicitly selected')
  expect(item?.text).toContain('does NOT verify')
  expect(JSON.stringify(selected)).not.toContain(activeGoal)
  expect(JSON.stringify(selected)).not.toContain(otherGoal)
  expect(packetFingerprintMaterial(selected)).not.toBe(packetFingerprintMaterial(cleared))
  expect(selected.evidence.find(x=>x.id==='weight_energy.decision_boundary')?.text)
   .toContain('CANNOT classify an owner-specific weight-loss plateau')
 })
 it('historical or unrelated questions have no current-weight focused packet',()=>{
  const snap=buildHealthIntelligenceSnapshot({
   range:'30d',start:'2026-09-17',end:asOf,asOf,today:asOf,
   timezone:'America/Phoenix',observations:[],
  })
  expect(focusWeightEnergyContext({
   question:'Why was my weight stalled last week?',snapshot:snap,today:asOf,
  })).toBeNull()
  expect(focusWeightEnergyContext({
   question:'Should I buy a bike?',snapshot:snap,today:asOf,
  })).toBeNull()
 })
})
