import { describe, expect, it } from 'vitest'
import {
  MAX_OWNER_NOTE_DRAFT, makeOwnerNoteReviewState,
  readOwnerNoteReviewState, mergeReviewedOwnerNote,
} from '../src/domain/ask-health/owner-note-review.js'

describe('PIQ-2.4 owner-authored profile note staging', () => {
  it('requires bounded, explicit owner text', () => {
    expect(makeOwnerNoteReviewState('')).toBeNull()
    expect(makeOwnerNoteReviewState('  ')).toBeNull()
    expect(makeOwnerNoteReviewState('x'.repeat(MAX_OWNER_NOTE_DRAFT + 1))).toBeNull()
    expect(makeOwnerNoteReviewState(' I avoid dairy. ')).toEqual({
      ownerNoteReview: { source: 'owner_authored', text: 'I avoid dairy.' },
    })
  })
  it('rejects forged route state and assistant-only claims', () => {
    expect(readOwnerNoteReviewState(null)).toBeNull()
    expect(readOwnerNoteReviewState('claim')).toBeNull()
    expect(readOwnerNoteReviewState({ ownerNoteReview: { source: 'assistant', text: 'diagnosis' } })).toBeNull()
    expect(readOwnerNoteReviewState({ ownerNoteReview: { source: 'owner_authored', text: '' } })).toBeNull()
    expect(readOwnerNoteReviewState({ ownerNoteReview: { source: 'owner_authored', text: 'x'.repeat(501) } })).toBeNull()
    expect(readOwnerNoteReviewState(makeOwnerNoteReviewState('My food preference.'))).toBe('My food preference.')
  })
  it('preserves existing notes and never silently truncates', () => {
    expect(mergeReviewedOwnerNote('Old note.', ' New note. ')).toEqual({ ok: true, text: 'Old note.\nNew note.' })
    expect(mergeReviewedOwnerNote(null, 'New note.')).toEqual({ ok: true, text: 'New note.' })
    expect(mergeReviewedOwnerNote('x'.repeat(1999), 'ok')).toEqual({
      ok: false, error: 'Profile context is full. Shorten existing notes before adding this one.',
    })
    expect(mergeReviewedOwnerNote('x'.repeat(1800), 'y'.repeat(500)).ok).toBe(false)
  })
  it('rejects duplicate lines, including case differences', () => {
    expect(mergeReviewedOwnerNote('Old note.\nMY DIET NOTE.', ' my diet note. ').ok).toBe(false)
    expect(mergeReviewedOwnerNote('', '   ').ok).toBe(false)
  })
})
