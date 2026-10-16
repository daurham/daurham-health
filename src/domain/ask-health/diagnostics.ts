import type { HealthIntelligenceSnapshot, RoutedHealthIntelligence } from '../intelligence/shared.js'
import type {
  AskHealthEvidenceSelectionAudit,
  AskHealthPacket,
  AskHealthSourceCoverageAudit,
} from './types.js'

/**
 * Contrasts observed signals anywhere in the loaded shared snapshot with
 * observed signals selected by the existing question router.
 * "Unselected" does NOT imply those signals are relevant to the question.
 * "No observed signals" does NOT imply the owner's entire database is empty.
 */
export function auditAskHealthSharedCoverage(
  snapshot: HealthIntelligenceSnapshot,
  routed: RoutedHealthIntelligence,
): AskHealthSourceCoverageAudit {
  const observed = new Set(snapshot.coverage
    .filter((item) => item.observedDays > (item.provenance.derived ?? 0))
    .map((item) => item.key))
  const selected = routed.selectedKeys.filter((key) => observed.has(key)).length
  return {
    observedSignalCount: observed.size,
    selectedObservedSignalCount: selected,
    unselectedObservedSignalCount: observed.size - selected,
  }
}

/**
 * Privacy-safe Ask Health routing evidence.
 *
 * This diagnostic describes *what path the current pipeline took*, NOT whether
 * a user's health history is truly absent or whether the answer is medically sound.
 * Never include question text, metric values, owner profile or provider payloads.
 */
export type AskHealthResponsePath =
  | 'clarification_required'
  | 'packet_no_substantive_evidence'
  | 'model_answer'
  | 'cache_hit'
  | 'general_model_answer'
  | 'general_cache_hit'

export type AskHealthResponseDiagnostic = {
  path: AskHealthResponsePath
  packetEvidenceCount: number
  substantiveEvidenceCount: number
  packetDomainCount: number
  limitationCount: number
  missingContextCount: number
  evidenceSelectionAudit: AskHealthEvidenceSelectionAudit | null
  sourceCoverageAudit: AskHealthSourceCoverageAudit | null
}

export function describeAskHealthResponsePath(
  packet: AskHealthPacket,
  result: { provider: string; cached: boolean; general?: boolean },
): AskHealthResponseDiagnostic {
  const path: AskHealthResponsePath =
    result.provider === 'health'
      ? packet.clarification
        ? 'clarification_required'
        : 'packet_no_substantive_evidence'
      : result.general
        ? result.cached ? 'general_cache_hit' : 'general_model_answer'
        : result.cached ? 'cache_hit' : 'model_answer'
  return {
    path,
    packetEvidenceCount: packet.evidence.length,
    substantiveEvidenceCount: packet.evidence.filter((item) => item.substantive).length,
    packetDomainCount: new Set(packet.evidence.map((item) => item.domain)).size,
    limitationCount: packet.limitations.length,
    missingContextCount: packet.contextSummary.missing.length,
    evidenceSelectionAudit: packet.evidenceSelectionAudit ?? null,
    sourceCoverageAudit: packet.sourceCoverageAudit ?? null,
  }
}
