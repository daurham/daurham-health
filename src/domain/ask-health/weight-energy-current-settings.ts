import { compareMaintenanceDecisionRevisions } from '../maintenance-revision.js'

/**
 * PIQ-4.2: read-only current-settings consistency screen for Ask Health.
 * A digest tracks the effective calorie target, all active goal revisions,
 * the relevant active/soon scheduled experiments and profile context.
 * Neither a matching digest nor a configured target verifies weight-goal
 * direction, calorie adequacy, exercise preservation or intervention safety.
 *
 * The revision is deliberately never returned in the user/AI evidence.
 */
export type CurrentSettingsRead = {
  status: 'available' | 'unavailable'
  currentCalorieTarget: number | null
  activeExperimentCount: number
  revision: string | null
}

export type WeightEnergyCurrentSettings = {
  state: 'not_checked' | 'consistent_read' | 'changed_during_read' | 'unavailable'
  calorieTargetState: 'configured' | 'not_configured' | 'unknown'
  relevantExperimentCount: number | null
}

export const UNCHECKED_WEIGHT_ENERGY_SETTINGS: WeightEnergyCurrentSettings = {
  state: 'not_checked', calorieTargetState: 'unknown', relevantExperimentCount: null,
}

export function screenWeightEnergyCurrentSettings(
  captured: CurrentSettingsRead,
  checked: CurrentSettingsRead,
): WeightEnergyCurrentSettings {
  const missing: WeightEnergyCurrentSettings = {
    state: 'unavailable', calorieTargetState: 'unknown', relevantExperimentCount: null,
  }
  if (captured.status !== 'available' || checked.status !== 'available') return missing
  const revisionState = compareMaintenanceDecisionRevisions(captured.revision, checked.revision)
  if (revisionState === 'unavailable') return missing

  const valid = (value: CurrentSettingsRead) =>
    Number.isSafeInteger(value.activeExperimentCount) && value.activeExperimentCount >= 0 &&
    (value.currentCalorieTarget == null ||
      (Number.isFinite(value.currentCalorieTarget) && value.currentCalorieTarget > 0))
  if (!valid(captured) || !valid(checked)) return missing

  if (revisionState === 'changed' ||
      captured.currentCalorieTarget !== checked.currentCalorieTarget ||
      captured.activeExperimentCount !== checked.activeExperimentCount) {
    // In particular, a changed revision with the SAME target amount or
    // experiment count can reflect a different active goal version.
    return {state:'changed_during_read',calorieTargetState:'unknown',relevantExperimentCount:null}
  }
  return {
    state:'consistent_read',
    calorieTargetState:checked.currentCalorieTarget == null ? 'not_configured' : 'configured',
    relevantExperimentCount:checked.activeExperimentCount,
  }
}
