import {describe,expect,it} from 'vitest'
import { computeContextRevisionSignature } from '../src/domain/experiment-context-revision-signature.js'
const g='11111111-1111-4111-8111-111111111111'
const pin='22222222-2222-4222-8222-222222222222'
const current='33333333-3333-4333-8333-333333333333'
const other='44444444-4444-4444-8444-444444444444'
const row=(changes:Record<string,unknown>={})=>({
  profile_updated_at:'1792333311.123456',
  goal_id:g,
  linked_version_id:pin,
  link_created_at:'1790000000.000001',
  goal_updated_at:'1792000000.000002',
  goal_status:'active',
  goal_archived_at:null,
  current_version_id:current,
  ...changes,
})
const make=(changes:Record<string,unknown>={})=>
  computeContextRevisionSignature([row(changes)])
describe('PIQ-6.5 optional privacy-limited goal/profile revision baseline',()=>{
  it('seals only valid existing goal linkage, without preserving raw goal identifiers',async()=>{
    const found=await make()
    expect(found).toMatchObject({linkedGoalCount:1})
    expect(found?.seal).toMatch(/^[0-9a-f]{64}$/)
    expect(found?.seal).not.toContain(g)
    expect(await make()).toEqual(found)
  })
  it('detects changed goal identity, pinned version, current version, status and revision time',async()=>{
    const original=(await make())?.seal
    for(const changes of [
      {goal_id:other},{linked_version_id:other},
      {current_version_id:other},{goal_status:'paused'},
      {goal_status:'completed'},{goal_archived_at:'1792200000.000001'},
      {goal_updated_at:'1792000000.000003'},
      {profile_updated_at:'1792333311.123457'},
      {link_created_at:'1790000000.000002'},
    ]){
      const changed=await make(changes)
      expect(changed?.seal).toMatch(/^[0-9a-f]{64}$/)
      expect(changed?.seal).not.toBe(original)
    }
  })
  it('detects adding or removing the unique linked goal, including absent initial goal',async()=>{
    const noGoal={
      goal_id:null,linked_version_id:null,link_created_at:null,
      goal_updated_at:null,goal_status:null,goal_archived_at:null,
      current_version_id:null,
    }
    const absent=await make(noGoal)
    expect(absent).toMatchObject({linkedGoalCount:0})
    expect(absent?.seal).not.toBe((await make())?.seal)
    expect(await make({...noGoal,profile_updated_at:'1792333311.123457'}))
      .not.toEqual(absent)
    expect(await make({...noGoal,linked_version_id:pin})).toBeNull()
  })
  it('never produces a verified seal from missing, ambiguous or impossible sources',async()=>{
    expect(await computeContextRevisionSignature([])).toBeNull()
    expect(await computeContextRevisionSignature([row(),row()])).toBeNull()
    expect(await computeContextRevisionSignature(null)).toBeNull()
    for(const changes of [
      {profile_updated_at:null},{goal_id:'bad'},
      {current_version_id:null},{linked_version_id:null},
      {goal_status:'inconsistent'},{goal_updated_at:'not a timestamp'},
      {goal_archived_at:'bad'},{link_created_at:null},
    ])expect(await make(changes)).toBeNull()
  })
  it('never reads PHI or goal values while deriving the revision digest',async()=>{
    const altered=await computeContextRevisionSignature([{...row(),
      clinical_conditions:['fictional'],target_min:9999,free_text:'fictional'}])
    expect(altered).toEqual(await make())
  })
})
