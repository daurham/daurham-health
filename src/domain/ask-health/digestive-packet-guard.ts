import type { RoutedHealthIntelligence } from '../intelligence/shared.js'
import { digestiveQuestionTopics } from './focused-digestive.js'
import type { AskHealthPacketInput } from './types.js'

/**
 * PIQ-4.1: packet-wide quality gate for digestive questions.
 *
 * Intentionally applied BEFORE the evidence selection/caching fingerprint,
 * not just to the model prose. Never use a bowel-frequency relationship as
 * proof of stool consistency. Never reuse source-unsafe fiber/water/intestinal
 * relationships after a failed optimistic source recheck.
 */
export type DigestivePacketGuard = {
  /** Cross-domain records changed or could not be reread. */
  crossSourceConflict: boolean
  /** Canonical bowel snapshot cannot be reconciled with event history. */
  bowelIdentityConflict: boolean
  /** Asked about Bristol consistency/hard or loose stool symptoms. */
  stoolTypeQuestion: boolean
}

export function digestivePacketGuard(input: AskHealthPacketInput): DigestivePacketGuard {
  const focus = input.focusedDigestive
  const topics = digestiveQuestionTopics(input.question)
  const stoolTypeQuestion = topics.bowel && /\b(?:bristol|consisten\w*|constipat\w*|diarrh\w*|hard[ -]?stools?|pellet[- ]?like|soft[ -]?stools?|loose[ -]?stools?|stool[ -]?types?|type[ -]?[1-7])\b/i.test(input.question)
  return {
    crossSourceConflict: Boolean(focus?.digestiveConsistencyIssue),
    bowelIdentityConflict: Boolean(focus?.bowelWindow?.status === 'unavailable' &&
      focus.bowelWindow.reason !== 'range_too_large'),
    stoolTypeQuestion,
  }
}

/** Removes evidence paths inconsistent with a current read or semantically
 * misapplied to stool types. No changes to the underlying snapshot.
 * Unrelated intelligence signals, relations and context stay available.
 */
export function guardedDigestiveIntelligence(
  intelligence: RoutedHealthIntelligence | null | undefined,
  guard: DigestivePacketGuard,
): RoutedHealthIntelligence | null {
  if (!intelligence) return null
  const blockedKeys = new Set<string>()
  if (guard.crossSourceConflict) {
    blockedKeys.add('nutrition.fiber_g')
    blockedKeys.add('hydration.ml')
    blockedKeys.add('bowel.count')
  } else if (guard.bowelIdentityConflict) {
    blockedKeys.add('bowel.count')
  }
  const blockedRelationship = (item: RoutedHealthIntelligence['relationships'][number]) =>
    (guard.stoolTypeQuestion && (item.xKey === 'bowel.count' || item.yKey === 'bowel.count')) ||
    blockedKeys.has(item.xKey) || blockedKeys.has(item.yKey)
  const removedRelationshipIds = new Set(intelligence.relationships.filter(blockedRelationship).map(item => item.id))
  const removedInterventionIds = new Set(intelligence.interventions
    .filter(item => blockedKeys.has(item.signalKey)).map(item => item.id))
  const blockedContext = (key: string) =>
    blockedKeys.has(key) || removedRelationshipIds.has(key) || removedInterventionIds.has(key)
  return {
    ...intelligence,
    selectedKeys: intelligence.selectedKeys.filter(key => !blockedKeys.has(key)),
    coverage: intelligence.coverage.filter(item => !blockedKeys.has(item.key)),
    baselines: intelligence.baselines.filter(item => !blockedKeys.has(item.key)),
    relationships: intelligence.relationships.filter(item => !blockedRelationship(item)),
    interventions: intelligence.interventions.filter(item => !blockedKeys.has(item.signalKey)),
    knows: intelligence.knows.filter(item => !blockedContext(item.key)),
    missing: intelligence.missing.filter(item => !blockedContext(item.key)),
  }
}
