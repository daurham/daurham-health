/** Stable, practical encouragement for one configured Health day. */
export type DailyQuote = { quote: string; author: string }

const FALLBACK_QUOTES = [
  'Build the life you want through the choices you make today.',
  'Consistency turns ordinary days into extraordinary progress.',
  'You do not need a perfect day to make meaningful progress.',
  'The work you do quietly still counts.',
  'Start with what you can do. Let momentum grow from there.',
  'Growth is often invisible before it becomes undeniable.',
  'Keep the promises you make to your future self.',
  'Give your effort a direction, not just an intensity.',
  'Strong habits are built on days that feel ordinary.',
  'Every return to the path is a form of progress.',
  'A small action today is worth more than a perfect plan tomorrow.',
  'Be patient with the process and persistent with the practice.',
  'Take pride in doing the work, not only in seeing the results.',
  'Courage often looks like showing up one more time.',
  'What matters is how you respond to the day in front of you.',
  'Build your strength one honest effort at a time.',
  'Make room for progress without demanding perfection.',
  'The next right action is enough to begin.',
  'Let your priorities guide your energy today.',
  'You can move steadily without moving urgently.',
  'Discipline is a way of caring for your future self.',
] as const

function dateIndex(date: string, count: number): number {
  const key = Number(date.replace(/[^0-9]/g, ''))
  return Number.isFinite(key) ? key % count : 0
}

export function fallbackDailyQuote(date: string): DailyQuote {
  return { quote: FALLBACK_QUOTES[dateIndex(date, FALLBACK_QUOTES.length)], author: 'Daily reminder' }
}

/** Reject malformed, long, or error-message content from the remote service. */
export function parseRemoteDailyQuote(data: unknown): DailyQuote | null {
  if (!data || typeof data !== 'object') return null
  const item = data as Record<string, unknown>
  if (typeof item.quote !== 'string' || typeof item.author !== 'string') return null
  const quote = item.quote.trim().replace(/\s+/g, ' ')
  const author = item.author.trim()
  if (quote.length < 22 || quote.length > 155 || author.length < 2 || author.length > 65) return null
  return { quote, author }
}

/** Weed out poetic/archaic aphorisms; prefer modern, actionable motivation. */
const PRACTICAL_TOPICS = /\b(today|tomorrow|daily|every day|each day|start|started|starting|begin|begins|beginning|keep going|keep trying|try|trying|effort|work|working|practice|habits?|consistency|discipline|progress|improve|improving|learn|learning|goals?|steps?|action|focus|strength|courage|challenges?|perfection|health|commitment|persist|show up)\b/i
const ARCHAIC_OR_POETIC = /\b(thou|thee|thy|thine|hath|doth|shalt|unto|whilst|wherefore|wings?|rainbows?|clouds?|caterpillar|soul|destiny|fate|heaven|universe|cosmos|miracles?|magic|magical|bliss)\b/i

export function selectMotivationalDailyQuote(data: unknown, date: string): DailyQuote | null {
  if (!Array.isArray(data)) return null
  const eligible = new Map<string, DailyQuote>()
  for (const item of data) {
    const quote = parseRemoteDailyQuote(item)
    if (!quote || quote.quote.length > 140) continue
    if (!PRACTICAL_TOPICS.test(quote.quote) || ARCHAIC_OR_POETIC.test(quote.quote)) continue
    if (/^(unknown|anonymous|proverb)$/i.test(quote.author)) continue
    eligible.set(quote.quote.toLowerCase(), quote)
  }
  // Sorting makes selection independent of API ordering and the time of the request.
  const quotes = [...eligible.values()].sort((a, b) => a.quote.localeCompare(b.quote, 'en'))
  return quotes.length === 0 ? null : quotes[dateIndex(date, quotes.length)]
}

// v2 invalidates old cached quotes from Dumb APIs for the current date.
const CACHE_PREFIX = 'daurham-health:daily-quote:v2:'
const QUOTES_URL = 'https://motivational-spark-api.vercel.app/api/quotes'

function quoteStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}

export function readCachedDailyQuote(date: string): DailyQuote | null {
  try {
    const saved = quoteStorage()?.getItem(CACHE_PREFIX + date)
    return saved ? parseRemoteDailyQuote(JSON.parse(saved)) : null
  } catch { return null }
}

/** Once per day/device. API failure falls back to a stable local reminder. */
export async function loadDailyQuote(date: string, signal?: AbortSignal): Promise<DailyQuote> {
  const cached = readCachedDailyQuote(date)
  if (cached) return cached
  const fallback = fallbackDailyQuote(date)
  if (signal?.aborted) return fallback
  const controller = new AbortController()
  const abort = () => controller.abort()
  signal?.addEventListener('abort', abort, { once: true })
  const timeout = setTimeout(abort, 4500)
  let result = fallback
  try {
    const response = await fetch(QUOTES_URL, { signal: controller.signal })
    if (response.ok) result = selectMotivationalDailyQuote(await response.json(), date) ?? fallback
  } catch { /* Offline, rate limited, aborted or temporarily unavailable. */ }
  finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', abort)
  }
  if (!signal?.aborted) {
    try { quoteStorage()?.setItem(CACHE_PREFIX + date, JSON.stringify(result)) } catch { /* optional cache */ }
  }
  return result
}
