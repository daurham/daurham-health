import { addCalendarDays } from '@/domain/training-plan'

type HealthDateFieldProps = {
  date: string
  max?: string
  min?: string
  label?: string
  onDateChange: (next: string) => void
  showNavigation?: boolean
  disabled?: boolean
}

/** One responsive native-date control shared by Health forms. */
export function HealthDateField({
  date, max, min, label = 'Health date', onDateChange, showNavigation = false, disabled = false,
}: HealthDateFieldProps) {
  const previous = addCalendarDays(date, -1)
  const next = addCalendarDays(date, 1)
  return (
    <div className="flex w-full min-w-0 items-end gap-2">
      {showNavigation ? (
        <button
          type="button"
          aria-label="Previous day"
          disabled={disabled || (min != null && previous < min)}
          onClick={() => onDateChange(previous)}
          className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-lg text-accent hover:bg-accent-muted disabled:opacity-40"
        >‹</button>
      ) : null}
      <label className="block min-w-0 flex-1 text-sm font-medium text-zinc-700">
        {label}
        <span className="mt-1 flex min-h-11 w-full min-w-0 max-w-full items-center overflow-hidden rounded-lg border border-zinc-300 bg-white px-3 focus-within:ring-2 focus-within:ring-accent">
          <input
            type="date"
            value={date}
            min={min}
            max={max}
            disabled={disabled}
            onChange={(event) => {
              if (event.target.value) onDateChange(event.target.value)
            }}
            className="daily-checkin-date-input block min-h-10 min-w-0 w-full max-w-full box-border appearance-none border-0 bg-transparent p-0 text-left text-base text-zinc-900"
          />
        </span>
      </label>
      {showNavigation ? (
        <button
          type="button"
          aria-label="Next day"
          disabled={disabled || (max != null && next > max)}
          onClick={() => onDateChange(next)}
          className="flex min-h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-zinc-300 bg-white text-lg text-accent hover:bg-accent-muted disabled:opacity-40"
        >›</button>
      ) : null}
    </div>
  )
}
