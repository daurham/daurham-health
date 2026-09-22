/**
 * Exact Apple Health sourceName strings from this export.
 * Jacob’s uses U+2019. Apple Watch uses U+00A0 before “Watch”.
 * Names are not normalized. An unseen source ranks after this list and may
 * still fill time the higher-priority sources did not observe.
 */
export const JACOBS_APPLE_WATCH = 'Jacob\u2019s Apple\u00a0Watch'
export const JACOBS_IPHONE = 'Jacob\u2019s iPhone'

export const ACTIVITY_CALCULATION_VERSION = 'reconcile-1'

export const SOURCE_PRIORITY = {
  steps: [JACOBS_APPLE_WATCH, JACOBS_IPHONE, 'iPhone', 'Circular'],
  walking_running_distance: [
    JACOBS_APPLE_WATCH,
    JACOBS_IPHONE,
    'iPhone',
    'Nike Run Club',
    'Circular',
  ],
  resting_heart_rate: [JACOBS_APPLE_WATCH, 'Circular', JACOBS_IPHONE, 'iPhone'],
} as const

export type PrioritizedMetric = keyof typeof SOURCE_PRIORITY

export function sourcePriorityRank(metric: PrioritizedMetric, sourceName: string): number {
  const list: readonly string[] = SOURCE_PRIORITY[metric]
  const index = list.indexOf(sourceName)
  if (index >= 0) {
    return index
  }
  return list.length
}
