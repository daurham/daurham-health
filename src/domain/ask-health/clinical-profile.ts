import type { HealthProfile } from '../health-profile.js'
import type { AskClinicalProfileInput } from './types.js'

export function askClinicalProfileForDate(
  profile: HealthProfile,
  asOf: string,
  today: string,
): AskClinicalProfileInput | null {
  if (asOf !== today) return null
  return {
    persistentHealthContext: profile.persistentHealthContext,
    trainingLimitations: profile.trainingLimitations,
    dietaryContext: profile.dietaryContext,
    conditions: profile.clinicalConditions,
    allergies: profile.clinicalAllergies,
    medications: profile.clinicalMedications,
  }
}
