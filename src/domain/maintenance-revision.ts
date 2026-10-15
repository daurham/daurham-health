/**
 * An optimistic read barrier for calorie-review decisions, NOT an atomic
 * transaction. The fingerprint covers the configured calorie target,
 * active goal versions/lifecycle and experiments in one DB statement.
 * When any read fails or two observations disagree, withhold numeric advice.
 */
export type DecisionRevisionStatus = 'consistent' | 'changed' | 'unavailable'

export function compareMaintenanceDecisionRevisions(
  captured: string | null | undefined,
  checked: string | null | undefined,
): DecisionRevisionStatus {
  if (!captured || !checked) return 'unavailable'
  return captured === checked ? 'consistent' : 'changed'
}
