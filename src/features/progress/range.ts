import { isProgressRange, isTimelineFocus, type ProgressRange, type TimelineFocus } from '@/domain/progress'

export const DEFAULT_PROGRESS_RANGE: ProgressRange = '30d'
export const DEFAULT_TIMELINE_FOCUS: TimelineFocus = 'all'

export function parseProgressRangeParam(value: string | null): ProgressRange {
  if (value && isProgressRange(value)) {
    return value
  }
  return DEFAULT_PROGRESS_RANGE
}

export function parseTimelineFocusParam(value: string | null): TimelineFocus {
  if (value && isTimelineFocus(value)) {
    return value
  }
  return DEFAULT_TIMELINE_FOCUS
}

export function progressSearch(range: ProgressRange, focus?: TimelineFocus): string {
  const params = new URLSearchParams()
  params.set('range', range)
  if (focus && focus !== 'all') {
    params.set('focus', focus)
  }
  return `?${params.toString()}`
}
