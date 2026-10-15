import type { AskHealthPacket } from './types.js'

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

export type AskHealthResponseDiagnostic = {
  path: AskHealthResponsePath
  packetEvidenceCount: number
  substantiveEvidenceCount: number
  packetDomainCount: number
  limitationCount: number
  missingContextCount: number
}

export function describeAskHealthResponsePath(
  packet: AskHealthPacket,
  result: { provider: string; cached: boolean },
): AskHealthResponseDiagnostic {
  const path: AskHealthResponsePath =
    result.provider === 'health'
      ? packet.clarification
        ? 'clarification_required'
        : 'packet_no_substantive_evidence'
      : result.cached
        ? 'cache_hit'
        : 'model_answer'
  return {
    path,
    packetEvidenceCount: packet.evidence.length,
    substantiveEvidenceCount: packet.evidence.filter((item) => item.substantive).length,
    packetDomainCount: new Set(packet.evidence.map((item) => item.domain)).size,
    limitationCount: packet.limitations.length,
    missingContextCount: packet.contextSummary.missing.length,
  }
}
