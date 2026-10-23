/** One small, stable quote per local Health day. External data never blocks Today. */
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

export function fallbackDailyQuote(date: string): DailyQuote {
  const key = Number(date.replace(/[^0-9]/g, ''))
  const index = Number.isFinite(key) ? key % FALLBACK_QUOTES.length : 0
  return { quote: FALLBACK_QUOTES[index], author: 'Daily reminder' }
}

/** Reject unexpectedly long or malformed third-party content before display/caching. */
export function parseRemoteDailyQuote(data: unknown): DailyQuote | null {
  if (!data || typeof data !== 'object') return null
  const item = data as Record<string, unknown>
  if (typeof item.quote !== 'string' || typeof item.author !== 'string') return null
  const quote = item.quote.trim()
  const author = item.author.trim()
  if (quote.length < 22 || quote.length > 155 || author.length < 2 || author.length > 65) return null
  return { quote, author }
}

const CACHE_PREFIX = 'daurham-health:daily-quote:'

/** Free public-domain quote endpoint with browser CORS; one request per day/device.
 * When offline or rate-limited, a curated local quote is used instead.
 */
export async function loadDailyQuote(date: string, signal?: AbortSignal): Promise<DailyQuote> {
  const fallback = fallbackDailyQuote(date)
  let storage: Storage | null = null
  try { if (typeof localStorage !== 'undefined') storage = localStorage } catch { /* unavailable */ }
  const key = CACHE_PREFIX + date
  try {
    const saved = storage?.getItem(key)
    if (saved) return parseRemoteDailyQuote(JSON.parse(saved)) ?? fallback
  } catch { /* invalid cache or private mode */ }
  let result = fallback
  try {
    const response = await fetch('https://dumbapis.com/daily/quote', { signal })
    if (response.ok) result = parseRemoteDailyQuote(await response.json()) ?? fallback
  } catch { /* offline, aborted or temporarily unavailable */ }
  if (!signal?.aborted) {
    try { storage?.setItem(key, JSON.stringify(result)) } catch { /* optional cache */ }
  }
  return result
}
