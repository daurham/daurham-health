import type { HealthIntelligenceSnapshot, IntelligenceObservation } from '../intelligence/shared.js'

/**
 * PIQ-4.2: evidence coverage for strength/muscle preservation context.
 *
 * Source-matched completed food days support a *description* of recorded
 * protein, not an adequacy diagnosis. Training-session events establish
 * participation only, not lifting load, performance or maintained muscle.
 * This pure screen never reads a DB, assigns protein targets or changes goals.
 */
export type ProteinTrainingContext = {
  verifiedProteinDays: number
  verifiedMeanProteinG: number | null
  verifiedCalorieDaysInWindow: number
  sourceIdentifiedTrainingDays: number
  trainingDaysWithoutSourceIdentity: number
  proteinCoverage: 'descriptive_window' | 'insufficient_or_unverified'
  strengthOutcome: 'not_verified'
}

function validIds(item: IntelligenceObservation | undefined): item is IntelligenceObservation {
  return item != null &&
    item.sourceIds.length > 0 &&
    item.sourceIds.every(id => typeof id === 'string' && id.length > 0) &&
    new Set(item.sourceIds).size === item.sourceIds.length
}

function matchingIds(first: IntelligenceObservation, second: IntelligenceObservation): boolean {
  if (!validIds(first) || !validIds(second)) return false
  const ids = new Set(first.sourceIds)
  return second.sourceIds.length === ids.size && second.sourceIds.every(id => ids.has(id))
}

const MIN_DESCRIPTIVE_DAYS = 4
const MIN_DESCRIPTIVE_SPAN_DAYS = 7

export function screenProteinTrainingContext(input: {
  snapshot: HealthIntelligenceSnapshot
  start: string
  end: string
  today: string
  verifiedCalorieDates: ReadonlySet<string>
}): ProteinTrainingContext {
  const { snapshot, start, end, today, verifiedCalorieDates } = input
  const proteinDays: Array<{ date: string; grams: number }> = []
  let sourceIdentifiedTrainingDays = 0
  let trainingDaysWithoutSourceIdentity = 0
  const eligible = snapshot.frame.filter(day =>
    day.date >= start && day.date <= end &&
    day.date >= snapshot.period.start && day.date <= snapshot.asOf &&
    day.date < today,
  )
  const verificationAvailable = snapshot.coverage.some(row =>
    row.key === 'nutrition.calories' && row.completenessCheck === 'available')
  for (const day of eligible) {
    const training = day.signals['training.sessions']
    if (training && Number.isFinite(training.value) && training.value > 0) {
      if (validIds(training) && training.provenance !== 'unknown') {
        sourceIdentifiedTrainingDays++
      } else {
        trainingDaysWithoutSourceIdentity++
      }
    }
    const calories = day.signals['nutrition.calories']
    const protein = day.signals['nutrition.protein_g']
    if (!verificationAvailable || !verifiedCalorieDates.has(day.date) ||
        !validIds(calories) || !validIds(protein) ||
        calories.dayCompleteness !== 'verified_complete' ||
        calories.quality !== 'high_confidence' ||
        protein.dayCompleteness !== 'verified_complete' ||
        protein.quality !== 'high_confidence' ||
        !Number.isFinite(calories.value) || calories.value <= 0 ||
        !Number.isFinite(protein.value) || protein.value < 0 ||
        !matchingIds(calories, protein)) continue
    proteinDays.push({ date: day.date, grams: protein.value })
  }
  const uniqueDays = [...new Map(proteinDays.map(item => [item.date, item])).values()]
    .sort((a, b) => a.date.localeCompare(b.date))
  const span = uniqueDays.length < 2 ? 0 : Math.round((
    Date.parse(uniqueDays[uniqueDays.length - 1]!.date + 'T00:00:00Z') -
    Date.parse(uniqueDays[0]!.date + 'T00:00:00Z')
  ) / 86_400_000)
  const descriptive = uniqueDays.length >= MIN_DESCRIPTIVE_DAYS && span >= MIN_DESCRIPTIVE_SPAN_DAYS
  return {
    verifiedProteinDays: uniqueDays.length,
    verifiedMeanProteinG: descriptive
      ? uniqueDays.reduce((sum, item) => sum + item.grams, 0) / uniqueDays.length
      : null,
    verifiedCalorieDaysInWindow: verificationAvailable
      ? eligible.filter(item => verifiedCalorieDates.has(item.date)).length : 0,
    sourceIdentifiedTrainingDays,
    trainingDaysWithoutSourceIdentity,
    proteinCoverage: descriptive ? 'descriptive_window' : 'insufficient_or_unverified',
    strengthOutcome: 'not_verified',
  }
}
