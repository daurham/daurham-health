import type { FitProfilePreviewCandidate } from '@/domain/body'

export function selectionFromPreview(
  candidates: ReadonlyArray<Pick<FitProfilePreviewCandidate, 'fingerprint' | 'selectedByDefault'>>,
): Record<string, boolean> {
  const selected: Record<string, boolean> = {}
  for (const candidate of candidates) {
    selected[candidate.fingerprint] = candidate.selectedByDefault
  }
  return selected
}

export function selectedFingerprints(selected: Record<string, boolean>): string[] {
  return Object.entries(selected)
    .filter(([, value]) => value)
    .map(([fingerprint]) => fingerprint)
}
