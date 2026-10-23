import { formatCompactCalendarDate } from '@/domain/calendar-format'
import type { TodayWeekPoint } from '@/domain/today/recent-health'

/** Compact zero-baseline display; unknown days occupy space without appearing as zero. */
export function TodayWeekBars({ points, label, unit, reference }: {
  points: readonly TodayWeekPoint[]
  label: string
  unit: string
  reference: number
}) {
  const scale = Math.max(reference, ...points.map((point) => point.value ?? 0))
  const accessible = points.map((point) =>
    formatCompactCalendarDate(point.date) + ': ' + (point.value == null ? 'no data' : Math.round(point.value) + ' ' + unit),
  ).join('; ')
  return (
    <div className="today-week-bars" role="img" aria-label={label + '. ' + accessible}>
      {points.map((point) => {
        const height = point.value == null ? 0 : Math.max(2, Math.min(100, (Math.max(0, point.value) / scale) * 100))
        return (
          <div key={point.date} className="today-week-bar-col" aria-hidden="true">
            <div className="today-week-bar-track">
              {point.value != null ? (
                <div className="today-week-bar-fill" style={{ height: String(height) + '%' }} />
              ) : <span className="today-week-bar-missing" />}
            </div>
            <span className="today-week-bar-day">{formatCompactCalendarDate(point.date)}</span>
          </div>
        )
      })}
    </div>
  )
}
