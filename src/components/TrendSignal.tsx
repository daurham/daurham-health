import {
  trendMeaningLabel,
  type TrendDirection,
  type TrendMeaning,
} from '@/domain/trend-intent'
import { cn } from '@/lib'

const MEANING_CLASS: Record<TrendMeaning, string> = {
  toward: 'trend-toward',
  away: 'trend-away',
  neutral: 'trend-neutral',
  within: 'trend-within',
}

function arrow(direction: TrendDirection): string {
  if (direction === 'higher') return '↑'
  if (direction === 'lower') return '↓'
  return '→'
}

export function TrendSignal({
  direction,
  meaning,
  compact = false,
  className,
}: {
  direction: TrendDirection
  meaning: TrendMeaning
  compact?: boolean
  className?: string
}) {
  const label = trendMeaningLabel(meaning)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium',
        compact ? 'text-xs' : 'text-sm',
        MEANING_CLASS[meaning],
        className,
      )}
      aria-label={`${direction} trend. ${label}.`}
    >
      <span aria-hidden="true">{arrow(direction)}</span>
      <span>{label}</span>
    </span>
  )
}
