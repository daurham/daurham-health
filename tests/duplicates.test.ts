import { describe, expect, it } from 'vitest'
import { classifyFingerprint, classifyFingerprints } from '../src/domain/duplicates.ts'

describe('duplicate classification', () => {
  it('marks known fingerprints as duplicates', () => {
    const existing = new Set(['aaa', 'bbb'])
    expect(classifyFingerprint('aaa', existing)).toBe('duplicate')
    expect(classifyFingerprint('ccc', existing)).toBe('new')
    expect(classifyFingerprints(['aaa', 'ccc'], existing)).toEqual([
      { fingerprint: 'aaa', duplicate: true },
      { fingerprint: 'ccc', duplicate: false },
    ])
  })
})
