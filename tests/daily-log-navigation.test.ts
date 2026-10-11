import { describe, expect, it } from 'vitest'
import { shouldBlockDailyLogNavigation as guard } from '../src/domain/daily-log-navigation.ts'

const current = { pathname: '/check-in', search: '?date=2026-10-11' }

describe('Daily Log navigation with unsaved edits', () => {
  it('does not block navigation when there is no draft', () => {
    expect(guard(false, current, { pathname: '/training', search: '' })).toBe(false)
  })

  it('blocks bottom navigation, Today and browser back/forward to another route', () => {
    expect(guard(true, current, { pathname: '/', search: '' })).toBe(true)
    expect(guard(true, current, { pathname: '/training', search: '' })).toBe(true)
  })

  it('blocks changing Health date via the query string', () => {
    expect(guard(true, current, { pathname: '/check-in', search: '?date=2026-10-10' })).toBe(true)
  })

  it('allows a same-page context hash anchor, and never blocks no-op locations', () => {
    expect(guard(true, current, { ...current })).toBe(false)
    expect(guard(true, current, { ...current, hash: '#daily-context' })).toBe(false)
  })
})
