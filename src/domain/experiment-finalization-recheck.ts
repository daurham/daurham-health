import type { ExperimentComparisonReview } from './experiment-comparison.js'
import type { ExperimentResultClassification } from './experiment-results.js'
import type { ImplementationProvenance } from './experiment-comparison-snapshot.js'

/** PIQ-6.5: compare independent canonical re-reads just before the write.
 * This is a bounded TOCTOU guard, not repeatable-read / serializable isolation.
 * No treatment efficacy or medical significance is inferred.
 */
export type ResultFinalizationEvidenceSignature = {
  resultFingerprint: string | null
  classification: ExperimentResultClassification | null
  effectiveEndDate: string | null
  comparisonReview: ExperimentComparisonReview
  sourceValueSeal: string | null
  experiment: {
    id: string
    status: string
    protocolVersionId: string
    windowStart: string | null
    windowEnd: string | null
    implementationProvenance: ImplementationProvenance
    implementationDate: string | null
    implementationRevision: number | null
  }
  contextRevisionSeal: string | null
}

export function resultFinalizationEvidenceUnchanged(
  first: ResultFinalizationEvidenceSignature,
  second: ResultFinalizationEvidenceSignature,
): boolean {
  // Compare complete bounded, canonical shapes, not UI rounding/coverage only.
  // Fingerprints are independently derived from the source evidence.
  // Null context/source seals remain unknown, never a validated finding.
  return first.resultFingerprint !== null &&
    first.resultFingerprint === second.resultFingerprint &&
    first.classification === second.classification &&
    first.effectiveEndDate === second.effectiveEndDate &&
    first.sourceValueSeal === second.sourceValueSeal &&
    first.contextRevisionSeal === second.contextRevisionSeal &&
    JSON.stringify(first.comparisonReview) === JSON.stringify(second.comparisonReview) &&
    JSON.stringify(first.experiment) === JSON.stringify(second.experiment)
}
