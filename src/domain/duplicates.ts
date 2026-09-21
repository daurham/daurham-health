export function classifyFingerprint(
  fingerprint: string,
  existing: ReadonlySet<string>,
): 'new' | 'duplicate' {
  return existing.has(fingerprint) ? 'duplicate' : 'new'
}

export function classifyFingerprints(
  fingerprints: readonly string[],
  existing: ReadonlySet<string>,
): Array<{ fingerprint: string; duplicate: boolean }> {
  return fingerprints.map((fingerprint) => ({
    fingerprint,
    duplicate: classifyFingerprint(fingerprint, existing) === 'duplicate',
  }))
}
