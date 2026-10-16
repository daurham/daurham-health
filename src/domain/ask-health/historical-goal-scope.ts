import { digestDateSelection } from './focused-digestive.js'

/** Never equate a present-day goal version/lifecycle with its historical
 * version/lifecycle. Lifecycle events are not fully effective-dated today.
 * The current-day state remains readable when NO historical target status
 * or earlier period was asked for.
 */
export function requiresHistoricalGoalBoundary(input: {
  asOf: string
  today: string | null | undefined
  question: string
}): boolean {
  if (!input.today) return true
  if (input.asOf !== input.today) return true
  if (!/\b(?:goals?|targets?|objectives?)\b/i.test(input.question)) return false
  const date = digestDateSelection(input.question, input.today, input.asOf)
  // A historical/ambiguous date cannot be resolved from current goal versions.
  return date.issue != null ||
    (date.date != null && date.date !== input.today) ||
    (date.window != null && date.window.start < input.today) ||
    /\b(?:last|previous)\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(input.question)
}
