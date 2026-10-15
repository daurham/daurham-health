import type { AskHealthPacket } from '../../../src/domain/ask-health/types.js'

/**
 * PIQ-0 ONLY: fixture-based evidence-path evaluation.
 *
 * The fixture must independently demonstrate its source/routing assumptions
 * using the real snapshot, router and clinical-profile builders. This helper
 * does not inspect or store owner records and is not production analytics.
 */
export type RelevanceStage =
  | 'no_source_record'
  | 'not_modelled'
  | 'historically_ineligible'
  | 'excluded_by_router'
  | 'missing_from_builder'
  | 'removed_by_packet_cap'
  | 'selected'

export type RelevanceRequirement = {
  label: string
  evidenceId: string
  sourceRecorded: boolean
  modelled: boolean
  historicallyEligible: boolean
  routed: boolean
  mandatory: boolean
}
export type RelevanceResult = {
  label: string
  stage: RelevanceStage
  mandatory: boolean
}
export type RelevanceAssessment = {
  results: readonly RelevanceResult[]
  mandatorySelected: number
  mandatoryTotal: number
  mandatoryFailures: number
}

export function assessEvidenceRelevance(
  requirements: readonly RelevanceRequirement[],
  packetWithoutCap: AskHealthPacket,
  packetWithCap: AskHealthPacket,
): RelevanceAssessment {
  const unbounded = new Set(packetWithoutCap.evidence.map((item) => item.id))
  const bounded = new Set(packetWithCap.evidence.map((item) => item.id))
  const results = requirements.map((item): RelevanceResult => {
    let stage: RelevanceStage
    if (!item.sourceRecorded) stage = 'no_source_record'
    else if (!item.modelled) stage = 'not_modelled'
    else if (!item.historicallyEligible) stage = 'historically_ineligible'
    else if (!item.routed) stage = 'excluded_by_router'
    else if (!unbounded.has(item.evidenceId)) stage = 'missing_from_builder'
    else if (!bounded.has(item.evidenceId)) stage = 'removed_by_packet_cap'
    else stage = 'selected'
    return { label: item.label, stage, mandatory: item.mandatory }
  })
  const mandatory = results.filter((item) => item.mandatory)
  return {
    results,
    mandatorySelected: mandatory.filter((item) => item.stage === 'selected').length,
    mandatoryTotal: mandatory.length,
    mandatoryFailures: mandatory.filter((item) => item.stage !== 'selected').length,
  }
}
