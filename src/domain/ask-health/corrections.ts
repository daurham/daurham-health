import type { AskEvidence } from './types.js'
import { ASK_LENSES, ASK_QUESTION_MAX, type AskLens } from './config.js'
import type { ProgressRange } from '../progress/types.js'

const RANGES = ['30d', '90d', '6m', '1y', 'all'] as const

export type AskCorrectionReturn = {
  kind: 'ask_health_correction'
  question: string
  lens: AskLens
  range: ProgressRange
}

/** React Router state only: do not write the question into a URL or storage. */
export function makeAskCorrectionState(
  question: string, lens: AskLens, range: ProgressRange,
): { askCorrection: AskCorrectionReturn } | null {
  const clean = question.trim()
  if (!clean || clean.length > ASK_QUESTION_MAX) return null
  if (!ASK_LENSES.includes(lens) || !RANGES.includes(range)) return null
  return { askCorrection: { kind: 'ask_health_correction', question: clean, lens, range } }
}

export function readAskCorrectionState(state: unknown): AskCorrectionReturn | null {
  if (!state || typeof state !== 'object' || !('askCorrection' in state)) return null
  const value = state.askCorrection
  if (!value || typeof value !== 'object' || !('kind' in value) || value.kind !== 'ask_health_correction') return null
  if (!('question' in value) || typeof value.question !== 'string') return null
  if (!('lens' in value) || !ASK_LENSES.includes(value.lens as AskLens)) return null
  if (!('range' in value) || !RANGES.includes(value.range as ProgressRange)) return null
  return makeAskCorrectionState(value.question, value.lens as AskLens, value.range as ProgressRange)?.askCorrection ?? null
}

export type CanonicalCorrection = {
  destination: '/settings#health-profile' | '/nutrition'
  title: string
  instructions: string
}

/** Exact allowlist; a server-supplied detailPath is not permission to edit.
 * Derived, imported and calculated source evidence may have no in-app editor.
 */
export function canonicalCorrectionForEvidence(item: AskEvidence): CanonicalCorrection | null {
  if (item.detailPath === '/settings#health-profile' &&
      ((item.domain === 'profile' && item.id.startsWith('profile.')) ||
       (item.domain === 'clinical_context' && item.id.startsWith('clinical.')))) {
    return {
      destination: '/settings#health-profile',
      title: 'Review the saved Health Profile',
      instructions: 'Check and correct this original owner-entered field, then save the profile. Chat text cannot update medical records or establish a diagnosis.',
    }
  }
  if (item.detailPath === '/nutrition' && item.domain === 'nutrition' &&
      item.id.startsWith('nutrition.')) {
    return {
      destination: '/nutrition',
      title: 'Review the underlying food logs',
      instructions: 'This may summarize multiple days. Check the relevant dates, edit the original entries and review day completeness. A chat statement cannot fix the food log.',
    }
  }
  return null
}

/** An interpretation correction is a question, never a promoted owner fact. */
export function correctionFollowUpDraft(label: string): string {
  return 'Please reassess how you interpreted the evidence labeled "' +
    label.slice(0, 100).replace(/[\r\n]/g, ' ') +
    '". Separate saved observations from assumptions or causal claims, and explain what remains uncertain.'
}
