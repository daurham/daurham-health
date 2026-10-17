import {healthProfileSchema,type HealthProfile} from '../../src/domain/health-profile.js'
import {getHealthProfile} from '../profile/service.js'

export type HealthProfileSourceRecheck='verified'|'changed_or_unavailable'

/** Compare all owner-visible profile fields AND the saved revision timestamp.
 * This does not access models or transmit any clinical details to telemetry.
 */
export function currentHealthProfilesAgree(first:HealthProfile,late:HealthProfile):boolean{
  const canonical=(input:HealthProfile):string|null=>{
    const result=healthProfileSchema.safeParse(input)
    if(!result.success)return null
    const p=result.data
    if(p.updatedAt!==null &&
      (typeof p.updatedAt!=='string'||!Number.isFinite(Date.parse(p.updatedAt))))return null
    return JSON.stringify({
      sexForPhysiology:p.sexForPhysiology,
      dateOfBirth:p.dateOfBirth,
      heightCm:p.heightCm,
      persistentHealthContext:p.persistentHealthContext,
      trainingLimitations:p.trainingLimitations,
      dietaryContext:p.dietaryContext,
      bodyMeasurementProtocol:p.bodyMeasurementProtocol,
      clinicalConditions:p.clinicalConditions,
      clinicalAllergies:p.clinicalAllergies,
      clinicalMedications:p.clinicalMedications,
      updatedAt:p.updatedAt,
    })
  }
  const a=canonical(first),b=canonical(late)
  return a!==null&&b!==null&&a===b
}

/** One late read of the existing singleton Profile service. The previous
 * empty record is still checked so a newly saved profile cannot slip through.
 * Not an atomic DB snapshot or an historical clinical-profile attestation.
 */
export async function recheckCurrentHealthProfile(input:{
  first:HealthProfile
  asOf:string
  today:string
  read?:()=>Promise<HealthProfile>
}):Promise<HealthProfileSourceRecheck>{
  const date=/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/
  if(!date.test(input.today)||!date.test(input.asOf)||input.asOf!==input.today)
    return 'changed_or_unavailable'
  try{
    const late=await (input.read??getHealthProfile)()
    return currentHealthProfilesAgree(input.first,late)?'verified':'changed_or_unavailable'
  }catch{return 'changed_or_unavailable'}
}
