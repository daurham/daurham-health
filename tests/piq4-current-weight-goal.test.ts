import {describe,expect,it,vi} from 'vitest'
import {readCurrentWeightGoalMode,CURRENT_WEIGHT_GOAL_MODE_SQL} from '../server/ask-health/current-weight-goal.js'
import {verifiedCurrentWeightGoalMode} from '../src/domain/ask-health/verified-weight-goal.js'
import type {Sql} from '../server/db.js'
import type {WeightEnergyCurrentSettings} from '../src/domain/ask-health/weight-energy-current-settings.js'
const good:WeightEnergyCurrentSettings={state:'consistent_read',calorieTargetState:'configured',relevantExperimentCount:0}
const goal={status:'available' as const,rows:[{id:'secret-goal',versionId:'secret-version',targetMode:'at_most'}]}
const sql=(rows:unknown)=>({query:vi.fn(async()=>rows)} as unknown as Sql)
describe('PIQ-4.2 source-versioned current weight-goal mode',()=>{
 it('reads only bounded active current-version goal modes',async()=>{
   const db=sql([{id:'a',version_id:'v2',target_mode:'range'}])
   expect(await readCurrentWeightGoalMode(db)).toMatchObject({status:'available',
     rows:[{id:'a',versionId:'v2',targetMode:'range'}]})
   expect(db.query).toHaveBeenCalledWith(CURRENT_WEIGHT_GOAL_MODE_SQL,[])
   expect(CURRENT_WEIGHT_GOAL_MODE_SQL).toMatch(/v\.is_current/)
   expect(CURRENT_WEIGHT_GOAL_MODE_SQL).toMatch(/LIMIT 2/)
   expect(CURRENT_WEIGHT_GOAL_MODE_SQL).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\s/i)
 })
 it('keeps no active goal distinct from a failed read or invalid current version',async()=>{
   expect(verifiedCurrentWeightGoalMode({status:'available',rows:[]},good)).toBe('none')
   expect(await readCurrentWeightGoalMode(sql(undefined))).toEqual({status:'unavailable',rows:[]})
   expect(await readCurrentWeightGoalMode(sql([{id:'a',version_id:null,target_mode:'at_most'}])))
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
