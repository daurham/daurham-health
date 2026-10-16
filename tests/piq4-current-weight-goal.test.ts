import {describe,expect,it,vi} from 'vitest'
import {readCurrentWeightGoalMode,CURRENT_WEIGHT_GOAL_MODE_SQL} from '../server/ask-health/current-weight-goal.js'
import {verifiedCurrentWeightGoalMode} from '../src/domain/ask-health/verified-weight-goal.js'
import type {Sql} from '../server/db.js'
import type {WeightEnergyCurrentSettings} from '../src/domain/ask-health/weight-energy-current-settings.js'
const good:WeightEnergyCurrentSettings={state:'consistent_read',calorieTargetState:'configured',relevantExperimentCount:0}
const goal={status:'available' as const,rows:[{id:'secret-goal',versionId:'secret-version',targetMode:'at_most',targetMinKg:null,targetMaxKg:80}]}
const sql=(rows:unknown)=>({query:vi.fn(async()=>rows)} as unknown as Sql)
describe('PIQ-4.2 source-versioned current weight-goal mode',()=>{
 it('reads only bounded active current-version goal modes',async()=>{
   const db=sql([{id:'a',version_id:'v2',target_mode:'range',
     target_min:'75',target_max:'80',target_unit:'kg'}])
   expect(await readCurrentWeightGoalMode('2026-10-16',db)).toMatchObject({status:'available',
     rows:[{id:'a',versionId:'v2',targetMode:'range',targetMinKg:75,targetMaxKg:80}]})
   expect(db.query).toHaveBeenCalledWith(CURRENT_WEIGHT_GOAL_MODE_SQL,['2026-10-16'])
   expect(CURRENT_WEIGHT_GOAL_MODE_SQL).toMatch(/v\.is_current/)
   expect(CURRENT_WEIGHT_GOAL_MODE_SQL).toMatch(/g\.started_on\s*<=\s*\$1::date/)
   expect(CURRENT_WEIGHT_GOAL_MODE_SQL).toMatch(/LIMIT 2/)
   expect(CURRENT_WEIGHT_GOAL_MODE_SQL).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\s/i)
 })
 it('keeps no active goal distinct from a failed read or invalid current version',async()=>{
   expect(verifiedCurrentWeightGoalMode({status:'available',rows:[]},good)).toBe('none')
   expect(await readCurrentWeightGoalMode('2026-10-16',sql(undefined))).toEqual({status:'unavailable',rows:[]})
   expect(await readCurrentWeightGoalMode('2026-10-16',sql([{id:'a',version_id:null,target_mode:'at_most',target_max:'80',target_unit:'kg'}])))
     .toEqual({status:'unavailable',rows:[]})
   expect(verifiedCurrentWeightGoalMode({status:'unavailable',rows:[]},good)).toBe('unavailable')
 })
 it('never treats changed or unavailable decision revisions as a verified goal mode',()=>{
   expect(verifiedCurrentWeightGoalMode(goal,good)).toBe('at_most')
   expect(verifiedCurrentWeightGoalMode({...goal,rows:[...goal.rows,...goal.rows]},good)).toBe('ambiguous')
   for(const state of ['not_checked','unavailable','changed_during_read'] as const){
     expect(verifiedCurrentWeightGoalMode(goal,{
       state,calorieTargetState:'unknown',relevantExperimentCount:null,
     })).not.toBe('at_most')
   }
 })
})

describe('PIQ-4.2 trusted numeric goal-boundary query',()=>{
  it('normalizes pounds privately and refuses invalid target shapes',async()=>{
    const result=await readCurrentWeightGoalMode('2026-10-16',
      sql([{id:'goal',version_id:'version',target_mode:'at_most',
        target_min:null,target_max:'176.3698097',target_unit:'lb'}]))
    expect(result.status).toBe('available')
    if(result.status==='available'){
      expect(result.rows[0]?.targetMaxKg).toBeCloseTo(80,2)
      expect(result.rows[0]?.targetMinKg).toBeNull()
    }
    for(const bad of [
      {target_mode:'range',target_min:'81',target_max:'79',target_unit:'kg'},
      {target_mode:'at_most',target_min:'20',target_max:'80',target_unit:'kg'},
      {target_mode:'at_most',target_min:null,target_max:'oops',target_unit:'kg'},
      {target_mode:'at_most',target_min:null,target_max:'80',target_unit:'stone'},
      {target_mode:'at_least',target_min:null,target_max:null,target_unit:'kg'},
    ]){
      const out=await readCurrentWeightGoalMode('2026-10-16',
        sql([{id:'goal',version_id:'version',...bad}]))
      expect(out.status).toBe('unavailable')
    }
    expect(CURRENT_WEIGHT_GOAL_MODE_SQL).toContain('target_unit')
    expect(CURRENT_WEIGHT_GOAL_MODE_SQL).toContain('target_max')
    expect(CURRENT_WEIGHT_GOAL_MODE_SQL).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\s/i)
  })
})
