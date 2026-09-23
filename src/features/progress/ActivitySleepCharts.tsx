import { ComposedChart, CartesianGrid, Line, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts'
import type { ActivityChartPoint } from '@/domain/activity'
import type { SleepChartPoint } from '@/domain/sleep'
import { formatSleepDuration } from './activity-sleep-copy'
import { formatCalendarDate } from './format'

function tooltipBox(body: string) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 shadow-sm">
      {body}
    </div>
  )
}

export function ActivityMetricChart({
  points,
  valueLabel,
}: {
  points: ActivityChartPoint[]
  valueLabel: (value: number) => string
}) {
  const observed = points.some((point) => point.value != null)
  if (!observed) {
    return null
  }
  const data = points.map((point) => ({
    ...point,
    completed: point.provisional || typeof point.value !== 'number' || !Number.isFinite(point.value) ? null : point.value,
    todayValue: point.provisional && typeof point.value === 'number' && Number.isFinite(point.value) ? point.value : null,
  }))
  return (
    <div
      className="mt-4 h-52 w-full min-w-0 md:h-64"
      role="img"
      aria-label="Activity chart. Completed days are connected. Today is a separate point and is still in progress."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={formatCalendarDate}
            minTickGap={28}
            tick={{ fill: 'var(--chart-muted)', fontSize: 11 }}
          />
          <YAxis width={48} tick={{ fill: 'var(--chart-muted)', fontSize: 11 }} />
          <Tooltip
            content={({ payload }) => {
              const item = payload?.[0]?.payload as ActivityChartPoint | undefined
              if (!item || item.value == null) {
                return null
              }
              const label = valueLabel(item.value)
              return tooltipBox(item.provisional ? `Today · ${label} so far` : `${formatCalendarDate(item.date)} · ${label}`)
            }}
          />
          <Line type="linear" dataKey="completed" stroke="var(--chart-ink)" strokeWidth={2} dot={{ r: 2 }} connectNulls={false} />
          <Scatter dataKey="todayValue" fill="var(--chart-soft)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export function SleepDurationChart({ points }: { points: SleepChartPoint[] }) {
  const data = points.map((point) => ({
    ...point,
    eligibleMinutes:
      typeof point.eligibleMinutes === 'number' && Number.isFinite(point.eligibleMinutes) ? point.eligibleMinutes : null,
    partialMinutes:
      typeof point.partialMinutes === 'number' && Number.isFinite(point.partialMinutes) ? point.partialMinutes : null,
  }))
  const observed = data.some((point) => point.eligibleMinutes != null || point.partialMinutes != null)
  if (!observed) {
    return null
  }
  return (
    <div
      className="mt-4 h-52 w-full min-w-0 md:h-64"
      role="img"
      aria-label="Sleep chart. Complete nights are connected. Partial observations are separate points."
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
          <XAxis
            dataKey="date"
            tickFormatter={formatCalendarDate}
            minTickGap={28}
            tick={{ fill: 'var(--chart-muted)', fontSize: 11 }}
          />
          <YAxis width={40} tick={{ fill: 'var(--chart-muted)', fontSize: 11 }} />
          <Tooltip
            content={({ payload }) => {
              const item = payload?.[0]?.payload as SleepChartPoint | undefined
              if (!item) {
                return null
              }
              if (item.eligibleMinutes != null) {
                return tooltipBox(`${formatCalendarDate(item.date)} · ${formatSleepDuration(item.eligibleMinutes)}`)
              }
              if (item.partialMinutes != null) {
                return tooltipBox(
                  `${formatCalendarDate(item.date)} · ${formatSleepDuration(item.partialMinutes)} observed · partial`,
                )
              }
              return null
            }}
          />
          <Line
            type="linear"
            dataKey="eligibleMinutes"
            stroke="var(--chart-ink)"
            strokeWidth={2}
            dot={{ r: 2 }}
            connectNulls={false}
          />
          <Scatter dataKey="partialMinutes" fill="var(--chart-soft)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
