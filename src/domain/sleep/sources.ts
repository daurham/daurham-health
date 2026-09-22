import { SLEEP_SOURCE_PRIORITY, type KnownSleepSourceKey } from './config.js'

export type LogicalSleepSource = {
  key: string
  name: string
}

const KNOWN: Array<{ key: KnownSleepSourceKey; name: string; pattern: RegExp }> = [
  { key: 'apple_watch', name: 'Apple Watch', pattern: /apple\s*watch/i },
  { key: 'circular', name: 'Circular', pattern: /circular/i },
  { key: 'sleep_cycle', name: 'Sleep Cycle', pattern: /sleep\s*cycle/i },
  { key: 'iphone', name: 'iPhone', pattern: /iphone/i },
]

export function normalizeSourceName(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function logicalSleepSource(sourceName: string | null | undefined): LogicalSleepSource {
  const normalized = normalizeSourceName(sourceName)
  for (const item of KNOWN) {
    if (item.pattern.test(normalized)) {
      return { key: item.key, name: item.name }
    }
  }
  if (!normalized) {
    return { key: 'unknown', name: 'Unknown' }
  }
  return {
    key: `other:${normalized.toLowerCase()}`,
    name: normalized,
  }
}

export function sleepSourcePriorityRank(sourceKey: string): number {
  const index = (SLEEP_SOURCE_PRIORITY as readonly string[]).indexOf(sourceKey)
  return index >= 0 ? index : SLEEP_SOURCE_PRIORITY.length
}

export function compareSleepSourcePriority(leftKey: string, rightKey: string): number {
  const byRank = sleepSourcePriorityRank(leftKey) - sleepSourcePriorityRank(rightKey)
  if (byRank !== 0) {
    return byRank
  }
  return leftKey.localeCompare(rightKey)
}
