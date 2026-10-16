import type {GoalRead} from '../../../server/ask-health/current-weight-goal.js'
import type {WeightEnergyCurrentSettings} from './weight-energy-current-settings.js'

/** Only compatible with current read-time settings attested by identical
 * target/goal/experiment/profile revision checks. Not a goal-progress test.
 */
export function verifiedCurrentWeightGoalMode(
 read:GoalRead|null,settings:WeightEnergyCurrentSettings,
):NonNullable<WeightEnergyCurrentSettings['weightGoalMode']>{
 if(settings.state==='not_checked')return 'not_checked'
 if(settings.state!=='consistent_read'||read?.status!=='available')return'unavailable'
 if(read.rows.length===0)return'none'
 if(read.rows.length!==1)return'ambiguous'
 const goal=read.rows[0]!
 if(!goal.id?.trim()||!goal.versionId?.trim())return'ambiguous'
 return goal.targetMode==='at_most'||goal.targetMode==='at_least'||goal.targetMode==='range'
   ? goal.targetMode : 'ambiguous'
}
