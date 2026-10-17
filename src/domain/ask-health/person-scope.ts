/** Single conservative English-only non-owner subject guard, shared by
 * server admission, direct provider/packet callers, and profile selectors.
 * It is a privacy boundary, not full linguistic identity resolution.
 */
/** A first-person phrase in someone else's question is not an instruction to
 * include the account owner's clinical profile. This is intentionally
 * conservative: ambiguous mixed-family questions withhold the owner's
 * clinical profile rather than silently attaching their sensitive data.
 *
 * This scoped guard does NOT classify medical risk, establish identities,
 * or replace full cross-domain conversation/intent review.
 */
export function askHealthNonOwnerSubject(question: string): boolean {
  // Preserve a tightly phrased request to inspect the owner's own saved
  // records when a family member merely initiated the conversation.
  if (/^\s*my\s+(?:wife|husband|spouse|partner|mother|father|mom|dad|son|daughter|child|brother|sister|friend)\s+(?:asked|told|reminded)\s+me\s+(?:about|to\s+(?:review|show|summarize|explain))\s+my\s+(?:own\s+)?(?:workouts?|training|goals?|nutrition|food logs?|records?|health data|measurements?|progress|sleep|medications?)\b/i.test(question)) {
    return false
  }
  // Explicit family/member third-person referents in a question that could
  // otherwise be mistaken for a first-person clinical-profile request.
  if (/\b(?:my|our|your|the|his|her|their)\s+(?:(?:young|older|elderly|little|adult|newborn)\s+)?(?:wife|husband|spouse|partner|mother|father|mom|dad|son|daughter|child|baby|kid|brother|sister|friend|roommate|coworker|patient)(?:['’]s)?\b/i.test(question)) {
    return true
  }
  // Another person's explicitly possessive clinical history is never
  // equivalent to the owner's current Health Profile.
  if (/\b(?:her|his|their|someone else's)\s+(?:current\s+|saved\s+|recorded\s+)?(?:allerg(?:y|ies)|medications?|meds?|medicines?|prescriptions?|conditions?|diagnos(?:is|es)|medical history|health profile|weight|body measurements?|calor(?:ie|ies)|food logs?|nutrition|workouts?|training|sleep|steps?|activity|goals?|progress|health records?)\b/i.test(question)) {
    return true
  }
  // First-person inside an educational or reported quotation does not
  // identify the person whose canonical health data this question concerns.
  const unquoted = question
    .replace(/“[^”]*”/g, ' ')
    .replace(/"[^"]*"/g, ' ')
    .replace(/(?<!\w)'(?:[^']|'(?=\w))*'(?!\w)/g, ' ')
    .replace(/(?<!\w)‘(?:[^’]|’(?=\w))*’(?!\w)/g, ' ')
  const containsQuotation = unquoted !== question
  return containsQuotation &&
    /\b(?:phrase|sentence|quote|quotation|example|dialogue|translate|grammar|what does|what do|meaning|mean|someone|asked|said|wrote|told|imaginary|fictional)\b/i.test(unquoted)
}


export const NON_OWNER_ASK_HEALTH_TEXT =
  "This question appears to be about someone other than the account owner. " +
  "Health cannot verify another person's measurements or health history from this account. " +
  "No saved Health records were used. Ask a general question without personal records, " +
  "or use that person's own information with their permission."
