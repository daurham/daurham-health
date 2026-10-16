import type { HealthIntelligenceSnapshot } from '../intelligence/shared.js'
import { digestDateSelection } from './focused-digestive.js'

/**
 * PIQ-4.2: read ONLY the expressly requested single past date. This is
 * observation retrieval, NOT an energy deficit, plateau or TDEE estimate.
 */
export type HistoricalWeightEnergyDay = {
  date: string
  scope: 'in_range' | 'out_of_range' | 'provisional_today'
  weightKg: number | null
  weightConditions: 'usual' | 'different_conditions' | 'unknown_or_missing'
  verifiedCaloriesKcal: number | null
}
const SUBJECT = /\b(?:weight|weigh\w*|scale|calor\w*|deficit|maintenance|metaboli\w*|plateau\w*|fat[ -]?loss|losing fat)\b/i

export function focusHistoricalWeightEnergyDay(input: {
  question: string
  snapshot: HealthIntelligenceSnapshot
  today: string
}): HistoricalWeightEnergyDay | null {
  if (!SUBJECT.test(input.question)) return null
  const selected = digestDateSelection(input.question,input.today,input.snapshot.asOf)
  if (selected.issue || !selected.date || selected.window) return null
  const date=selected.date,{snapshot,today}=input
  const scope=date < snapshot.period.start || date > snapshot.period.end ||
      date > snapshot.asOf || date > today ? 'out_of_range'
      : date === today ? 'provisional_today' : 'in_range'
  if (scope !== 'in_range') return {
    date,scope,weightKg:null,weightConditions:'unknown_or_missing',
    verifiedCaloriesKcal:null,
  }
  const day=snapshot.frame.find(item=>item.date===date)
  const weight=day?.signals['body.weight_kg']
  const validWeight=weight != null && Number.isFinite(weight.value) &&
    weight.value>0 && weight.sourceIds.length>0 &&
    new Set(weight.sourceIds).size===weight.sourceIds.length
  const calories=day?.signals['nutrition.calories']
  const verifiedSource=snapshot.coverage.find(item=>
    item.key==='nutrition.calories')?.completenessCheck==='available'
  const validCalories=verifiedSource && calories != null &&
    calories.dayCompleteness==='verified_complete' &&
    calories.quality==='high_confidence' && Number.isFinite(calories.value) &&
    calories.value>0 && calories.sourceIds.length>0 &&
    new Set(calories.sourceIds).size===calories.sourceIds.length
  return {
    date,scope,weightKg:validWeight?weight!.value:null,
    weightConditions:!validWeight?'unknown_or_missing'
      : weight!.quality==='usual'?'usual'
      : weight!.quality==='different_conditions'?'different_conditions'
      :'unknown_or_missing',
    verifiedCaloriesKcal:validCalories?calories!.value:null,
  }
}
