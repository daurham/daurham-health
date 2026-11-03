import { afterEach, describe, expect, it, vi } from 'vitest'
import { fallbackDailyQuote, loadDailyQuote, parseRemoteDailyQuote, selectMotivationalDailyQuote } from '../src/features/today/daily-quote'
import { nextHealthMidnight } from '../src/features/today/useHealthCalendarDay'

const remoteQuotes = [
  { quote: 'What you do today can improve all your tomorrows.', author: 'Ralph Marston' },
  { quote: 'Start where you are. Use what you have. Do what you can.', author: 'Arthur Ashe' },
  { quote: 'Your mental and physical health come first. Everything else is secondary.', author: 'Zat Rana' },
  { quote: 'Thou shalt summon the magical rainbow clouds of destiny.', author: 'Old Poet' },
  { quote: 'I dwell in possibility.', author: 'Emily Dickinson' },
]

afterEach(() => vi.unstubAllGlobals())

describe('daily scenic encouragement', () => {
  it('keeps a deterministic, usable local reminder for the same Health day', () => {
    const today = fallbackDailyQuote('2026-10-23')
    expect(today).toEqual(fallbackDailyQuote('2026-10-23'))
    expect(today.quote.length).toBeGreaterThan(20)
    expect(today.author).toBe('Daily reminder')
    expect(fallbackDailyQuote('2026-10-24')).not.toEqual(today)
  })

  it('accepts only concise attributed quotes', () => {
    expect(parseRemoteDailyQuote({ quote: 'The best way out is always through.', author: 'Robert Frost' })).toEqual({
      quote: 'The best way out is always through.', author: 'Robert Frost',
    })
    expect(parseRemoteDailyQuote({ quote: 'Too short', author: 'Unknown' })).toBeNull()
    expect(parseRemoteDailyQuote({ quote: 'A'.repeat(180), author: 'Unknown' })).toBeNull()
    expect(parseRemoteDailyQuote({ quote: 'A valid length inspirational phrase.', author: '' })).toBeNull()
    expect(parseRemoteDailyQuote(null)).toBeNull()
  })

  it('only selects practical quotes, independently of the API response ordering', () => {
    const selected = selectMotivationalDailyQuote(remoteQuotes, '2026-11-02')
    expect(selected).not.toBeNull()
    expect(remoteQuotes.slice(0, 3)).toContainEqual(selected)
    expect(selectMotivationalDailyQuote([...remoteQuotes].reverse(), '2026-11-02')).toEqual(selected)
    expect(selectMotivationalDailyQuote(remoteQuotes, '2026-11-03')).not.toEqual(selected)
  })

  it('fetches once per day and keeps the quote unchanged on refresh', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
    })
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => remoteQuotes }))
    vi.stubGlobal('fetch', fetchMock)
    const today = await loadDailyQuote('2026-11-02')
    expect(await loadDailyQuote('2026-11-02')).toEqual(today)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://motivational-spark-api.vercel.app/api/quotes')
    expect(await loadDailyQuote('2026-11-03')).not.toEqual(today)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('falls back once and caches the reminder if the API is unavailable', async () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
    })
    const fetchMock = vi.fn(async () => { throw new Error('offline') })
    vi.stubGlobal('fetch', fetchMock)
    const first = await loadDailyQuote('2026-11-02')
    expect(first).toEqual(fallbackDailyQuote('2026-11-02'))
    expect(await loadDailyQuote('2026-11-02')).toEqual(first)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('advances at midnight in the configured timezone, including DST', () => {
    expect(nextHealthMidnight(new Date('2026-11-03T06:59:30Z'), 'America/Phoenix').toISOString())
      .toBe('2026-11-03T07:00:00.000Z')
    expect(nextHealthMidnight(new Date('2026-11-03T07:00:30Z'), 'America/Phoenix').toISOString())
      .toBe('2026-11-04T07:00:00.000Z')
    expect(nextHealthMidnight(new Date('2026-03-08T05:30:00Z'), 'America/New_York').toISOString())
      .toBe('2026-03-09T04:00:00.000Z')
  })
})
