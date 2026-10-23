import { describe, expect, it } from 'vitest'
import { fallbackDailyQuote, parseRemoteDailyQuote } from '../src/features/today/daily-quote'

describe('daily scenic encouragement', () => {
  it('keeps a deterministic, usable local quote for the same Health day', () => {
    const today = fallbackDailyQuote('2026-10-23')
    expect(today).toEqual(fallbackDailyQuote('2026-10-23'))
    expect(today.quote.length).toBeGreaterThan(20)
    expect(today.author).toBe('Daily reminder')
    expect(fallbackDailyQuote('2026-10-24')).not.toEqual(today)
  })

  it('accepts only concise attributed quotes from the optional free API', () => {
    expect(parseRemoteDailyQuote({ quote: 'The best way out is always through.', author: 'Robert Frost' })).toEqual({
      quote: 'The best way out is always through.', author: 'Robert Frost',
    })
    expect(parseRemoteDailyQuote({ quote: 'Too short', author: 'Unknown' })).toBeNull()
    expect(parseRemoteDailyQuote({ quote: 'A'.repeat(180), author: 'Unknown' })).toBeNull()
    expect(parseRemoteDailyQuote({ quote: 'A valid length inspirational phrase.', author: '' })).toBeNull()
    expect(parseRemoteDailyQuote(null)).toBeNull()
  })
})
