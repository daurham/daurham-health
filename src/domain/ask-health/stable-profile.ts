import { ageYearsOnDate, type HealthProfile } from '../health-profile.js'
import type { AskStableProfileInput } from './types.js'

/** Birth date can give an age for a past selected date, but a single current
 * profile row is not evidence that today's height was historically true.
 * Do not backdate today's medication/condition/sex-reference context here.
 */
export function askStableProfileForDate(
  profile: HealthProfile,
  asOf: string,
  today: string,
): AskStableProfileInput | null {
  if (asOf > today) return null
  const dateOfBirth = profile.dateOfBirth && profile.dateOfBirth <= asOf
    ? profile.dateOfBirth
    : null
  const ageYears = dateOfBirth == null ? null : ageYearsOnDate(dateOfBirth, asOf)
  const heightCm = asOf === today ? profile.heightCm : null
  if (dateOfBirth == null && heightCm == null) return null
  return { dateOfBirth, ageYears, heightCm, historical: asOf !== today }
}
