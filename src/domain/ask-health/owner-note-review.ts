/** Owner-authorized notes are drafted independently of any model answer.
 * A route-state draft is not a saved or clinically verified fact.
 */
export const MAX_OWNER_NOTE_DRAFT = 500
export const MAX_PROFILE_CONTEXT = 2000

export function makeOwnerNoteReviewState(text: string) {
  const cleaned = text.trim()
  if (!cleaned || cleaned.length > MAX_OWNER_NOTE_DRAFT) return null
  return { ownerNoteReview: { source: 'owner_authored', text: cleaned } }
}

export function readOwnerNoteReviewState(state: unknown): string | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null
  const note = (state as Record<string, unknown>).ownerNoteReview
  if (!note || typeof note !== 'object' || Array.isArray(note)) return null
  const record = note as Record<string, unknown>
  if (record.source !== 'owner_authored' || typeof record.text !== 'string') return null
  return makeOwnerNoteReviewState(record.text)?.ownerNoteReview.text ?? null
}

export function mergeReviewedOwnerNote(existing: string | null, note: string):
  | { ok: true; text: string }
  | { ok: false; error: string } {
  const draft = makeOwnerNoteReviewState(note)
  if (!draft) return { ok: false, error: 'Enter a note of 1–500 characters.' }
  const cleaned = draft.ownerNoteReview.text
  const current = existing?.trim() ?? ''
  if (current.split('\n').some(line => line.trim().toLowerCase() === cleaned.toLowerCase())) {
    return { ok: false, error: 'This note is already in the profile draft.' }
  }
  const combined = current ? current + '\n' + cleaned : cleaned
  if (combined.length > MAX_PROFILE_CONTEXT) {
    return { ok: false, error: 'Profile context is full. Shorten existing notes before adding this one.' }
  }
  return { ok: true, text: combined }
}
