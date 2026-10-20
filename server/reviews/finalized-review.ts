import { HttpError } from '../http.js'

/** A completed/approved photo cannot be reopened as an unsaved draft.
 * Label photos are intentionally excluded: Pantry save may precede Log Food.
 */
export const FINALIZED_REVIEW_CODE = 'CAPTURE_ALREADY_SAVED'

export function assertReviewNotFinalized(status: string | null | undefined, kind: 'workout' | 'meal'): void {
  if (status !== 'committed') return
  throw new HttpError(
    409,
    kind === 'workout'
      ? 'This workout photo was already saved. Return to Training.'
      : 'This meal photo was already saved. Return to Nutrition.',
    undefined,
    FINALIZED_REVIEW_CODE,
  )
}
