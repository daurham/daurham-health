import { cn } from '@/lib'

export function XpAmount({
  amount,
  sign = false,
  badge = true,
  className,
  label,
}: {
  amount: number
  sign?: boolean
  badge?: boolean
  className?: string
  label?: string
}) {
  const rounded = Math.round(amount)
  const signText = sign && rounded > 0 ? '+' : sign && rounded < 0 ? '−' : ''
  const value = Math.abs(rounded).toLocaleString('en-US')
  const text = `${signText}${value} XP`
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap font-semibold tabular-nums',
        badge ? 'xp-badge rounded-full px-2 py-1 text-xs' : 'text-reward',
        className,
      )}
      aria-label={label ?? `${rounded.toLocaleString('en-US')} experience points`}
    >
      <span aria-hidden="true">✦</span>
      <span>{text}</span>
    </span>
  )
}
