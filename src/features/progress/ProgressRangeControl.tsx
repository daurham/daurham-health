import type { ProgressRange } from '@/domain/progress'
import { cn } from '@/lib'
import { RANGE_OPTIONS } from './copy'

export function ProgressRangeControl({
  range,
  onChange,
}: {
  range: ProgressRange
  onChange: (range: ProgressRange) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Progress range">
      {RANGE_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={cn(
            'min-h-10 shrink-0 rounded-md px-3 py-1.5 text-sm font-medium md:min-h-9',
            option.id === range ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
          )}
          aria-pressed={option.id === range}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
