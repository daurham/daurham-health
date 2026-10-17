/** T42: source revisions can change while a personalized response is
 * awaiting Gemini. General education and deterministic emergency guidance
 * do not depend on owner data and must not be accidentally discarded.
 *
 * The caller increments a mutation epoch synchronously on canonical changes;
 * this is a conservative client-side display guard, not a server-wide
 * cross-instance revision attestation.
 */
export function askResponseDependsOnOwnerData(
  scope: 'general' | 'personal' | 'urgent_safety' | undefined,
): boolean {
  // Missing metadata from an older or malformed response is NOT permission
  // to display it as source-independent education.
  return scope !== 'general' && scope !== 'urgent_safety'
}

export function shouldWithholdChangedAskResponse(
  scope: 'general' | 'personal' | 'urgent_safety' | undefined,
  startedRevision: number,
  currentRevision: number,
): boolean {
  return askResponseDependsOnOwnerData(scope) && startedRevision !== currentRevision
}
