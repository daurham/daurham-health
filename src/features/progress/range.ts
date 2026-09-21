import { isProgressRange, type ProgressRange } from '@/domain/progress'

export const DEFAULT_PROGRESS_RANGE: ProgressRange = '30d'

export function parseProgressRangeParam(value: string | null): ProgressRange {
  if (value && isProgressRange(value)) {
    return value
  }
  return DEFAULT_PROGRESS_RANGE
}

export function progressSearch(range: ProgressRange): string {
  return `?range=${range}`
}
