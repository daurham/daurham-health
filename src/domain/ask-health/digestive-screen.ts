import type { FocusedDigestiveEvidence } from './focused-digestive.js'

/**
 * PIQ-4.1 FIRST SLICE: a descriptive screen of *retrieved sample events*.
 * It cannot establish a multi-day personal correlation (no complete paired
 * series), total fluid intake, clinical diagnosis or causes of hard stools.
 * Any historical date/window must first pass the upstream scope validator.
 */
export type DigestiveSampleScreen = {
  sampledBowelDays: number
  typedEvents: number
  hardTypedEvents: number
  untypedEventRecords: number
  explicitZeroDays: number
  daysAlsoShowingLoggedWater: number
  daysAlsoShowingVerifiedFiber: number
  provisionalBowelDays: number
  typedEvidenceDates: string[]
}

/** Returns null unless real, explicitly saved Bristol types were retrieved. */
export function deriveDigestiveSampleScreen(
  focus: FocusedDigestiveEvidence | null,
): DigestiveSampleScreen | null {
  if (!focus || focus.dateSelectionIssue ||
      (focus.requestedDate && !focus.requestedDate.inSelectedRange) ||
      (focus.requestedWindow && !focus.requestedWindow.inSelectedRange)) return null

  let typedEvents = 0
  let hardTypedEvents = 0
  let untypedEventRecords = 0
  let explicitZeroDays = 0
  let daysAlsoShowingLoggedWater = 0
  let daysAlsoShowingVerifiedFiber = 0
  let provisionalBowelDays = 0
  const typedEvidenceDates: string[] = []
  const waterDays = new Set(focus.hydration.observations.map((o) => o.date))
  const verifiedFiberDays = new Set(focus.fiber.observations.map((o) => o.date))

  // Focus already limits these examples to at most three eligible calendar
  // dates, and exact source event IDs were joined to owner-entered Bristol.
  for (const day of focus.bowel.observations) {
    if (day.value === 0 && day.sourceIds.length === 0) explicitZeroDays++
    if (day.provisional) provisionalBowelDays++
    if (waterDays.has(day.date)) daysAlsoShowingLoggedWater++
    if (verifiedFiberDays.has(day.date)) daysAlsoShowingVerifiedFiber++
    // Defensive bound: a malformed duplicate/extra type cannot exceed the
    // number of selected event references. Missing type is NEVER Bristol 0.
    const bristol = (day.bristolTypes ?? [])
      .filter((type) => Number.isInteger(type) && type >= 1 && type <= 7)
      .slice(0, day.sourceIds.length)
    typedEvents += bristol.length
    hardTypedEvents += bristol.filter((type) => type === 1 || type === 2).length
    untypedEventRecords += Math.max(0, day.sourceIds.length - bristol.length)
    if (bristol.length > 0) typedEvidenceDates.push(day.date)
  }
  if (typedEvents === 0) return null

  return {
    sampledBowelDays: focus.bowel.observations.length,
    typedEvents, hardTypedEvents, untypedEventRecords, explicitZeroDays,
    daysAlsoShowingLoggedWater, daysAlsoShowingVerifiedFiber,
    provisionalBowelDays, typedEvidenceDates: [...new Set(typedEvidenceDates)].sort(),
  }
}
