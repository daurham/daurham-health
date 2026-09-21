import { addCalendarDays, calendarDaysBetween } from '@/domain/progress/dates'
import type { ProgressTimeline } from '@/domain/progress'
import { kilogramsToPounds } from '@/domain/units'
import { cn } from '@/lib'
import { formatCalendarDate, formatKgAsLb } from './format'

function paddedDomain(values: number[]): [number, number] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mid = (min + max) / 2
  const spread = max - min
  const pad = Math.max(spread * 0.2, Math.abs(mid) * 0.02, 2)
  return [min - pad, max + pad]
}

function xForDate(date: string, start: string, end: string, left: number, width: number): number {
  const span = Math.max(calendarDaysBetween(start, end), 1)
  const offset = Math.min(Math.max(calendarDaysBetween(start, date), 0), span)
  return left + (offset / span) * width
}

function jitter(index: number, count: number): number {
  if (count <= 1) {
    return 0
  }
  return (index - (count - 1) / 2) * 8
}

export function TimelineLanes({
  timeline,
  series,
  onSelect,
}: {
  timeline: ProgressTimeline
  series: ProgressTimeline['series']
  onSelect: (eventId: string) => void
}) {
  const lanes = [
    series.bodyWeight.length > 0 ? 'body' : null,
    series.workouts.length > 0 ? 'workouts' : null,
    series.performanceBests.length > 0 ? 'bests' : null,
  ].filter((lane): lane is 'body' | 'workouts' | 'bests' => lane != null)

  if (lanes.length === 0) {
    return null
  }

  const start = timeline.period.start
  const end = timeline.period.end
  const plotLeft = 92
  const plotWidth = 680
  const laneHeight = 52
  const axisHeight = 28
  const height = lanes.length * laneHeight + axisHeight
  const ticks = [start]
  if (start !== end) {
    const span = calendarDaysBetween(start, end)
    if (span >= 2) {
      ticks.push(addCalendarDays(start, Math.floor(span / 2)))
    }
    ticks.push(end)
  }

  const weightsLb = series.bodyWeight.map((item) => kilogramsToPounds(item.valueKg))
  const [yMin, yMax] = weightsLb.length > 0 ? paddedDomain(weightsLb) : [0, 1]
  const bodyLaneIndex = lanes.indexOf('body')

  const bodyGroups = new Map<string, typeof series.bodyWeight>()
  for (const item of series.bodyWeight) {
    const list = bodyGroups.get(item.date) ?? []
    list.push(item)
    bodyGroups.set(item.date, list)
  }
  const workoutGroups = new Map<string, typeof series.workouts>()
  for (const item of series.workouts) {
    const list = workoutGroups.get(item.date) ?? []
    list.push(item)
    workoutGroups.set(item.date, list)
  }
  const bestGroups = new Map<string, typeof series.performanceBests>()
  for (const item of series.performanceBests) {
    const list = bestGroups.get(item.date) ?? []
    list.push(item)
    bestGroups.set(item.date, list)
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white px-3 py-3 md:px-4">
      <svg
        viewBox={`0 0 800 ${height}`}
        className="h-auto w-full min-w-[20rem]"
        role="img"
        aria-label="Progress timeline lanes for body weight, workouts, and performance bests"
      >
        {lanes.map((lane, index) => {
          const y = index * laneHeight + laneHeight / 2
          const label = lane === 'body' ? 'Body weight' : lane === 'workouts' ? 'Workouts' : 'Bests'
          return (
            <g key={lane}>
              <text x="0" y={y + 4} className="fill-zinc-500" fontSize="11">
                {label}
              </text>
              <line
                x1={plotLeft}
                x2={plotLeft + plotWidth}
                y1={y}
                y2={y}
                className="stroke-zinc-200"
                strokeWidth="1"
              />
            </g>
          )
        })}
        {ticks.map((tick) => {
          const x = xForDate(tick, start, end, plotLeft, plotWidth)
          return (
            <g key={tick}>
              <line
                x1={x}
                x2={x}
                y1={0}
                y2={lanes.length * laneHeight}
                className="stroke-zinc-100"
                strokeWidth="1"
              />
              <text
                x={x}
                y={height - 8}
                textAnchor="middle"
                className="fill-zinc-500"
                fontSize="10"
              >
                {formatCalendarDate(tick)}
              </text>
            </g>
          )
        })}
        {bodyLaneIndex >= 0 ? (
          <g data-testid="timeline-lane-body">
            {series.bodyWeight.length >= 2 ? (
              <polyline
                data-testid="timeline-weight-line"
                fill="none"
                className="stroke-zinc-800"
                strokeWidth="1.5"
                points={series.bodyWeight
                  .map((item, index) => {
                    const siblings = bodyGroups.get(item.date) ?? [item]
                    const siblingIndex = siblings.findIndex((entry) => entry.measurementId === item.measurementId)
                    const x =
                      xForDate(item.date, start, end, plotLeft, plotWidth) + jitter(siblingIndex, siblings.length)
                    const value = weightsLb[index]!
                    const yTop = bodyLaneIndex * laneHeight + 10
                    const plotH = laneHeight - 20
                    const y = yTop + (1 - (value - yMin) / (yMax - yMin)) * plotH
                    return `${x},${y}`
                  })
                  .join(' ')}
              />
            ) : null}
            {series.bodyWeight.map((item, index) => {
              const siblings = bodyGroups.get(item.date) ?? [item]
              const siblingIndex = siblings.findIndex((entry) => entry.measurementId === item.measurementId)
              const x = xForDate(item.date, start, end, plotLeft, plotWidth) + jitter(siblingIndex, siblings.length)
              const value = weightsLb[index]!
              const yTop = bodyLaneIndex * laneHeight + 10
              const plotH = laneHeight - 20
              const y =
                series.bodyWeight.length === 1
                  ? bodyLaneIndex * laneHeight + laneHeight / 2
                  : yTop + (1 - (value - yMin) / (yMax - yMin)) * plotH
              return (
                <g key={item.measurementId}>
                  <circle cx={x} cy={y} r="3.5" className="fill-zinc-900" />
                  <foreignObject x={x - 10} y={y - 10} width="20" height="20">
                    <button
                      type="button"
                      className="h-5 w-5 cursor-pointer rounded-full bg-transparent"
                      aria-label={`Body weight ${formatKgAsLb(item.valueKg)} on ${formatCalendarDate(item.date)}`}
                      onClick={() => onSelect(`body_measurement:${item.measurementSessionId}`)}
                    />
                  </foreignObject>
                </g>
              )
            })}
          </g>
        ) : null}
        {lanes.includes('workouts')
          ? [...workoutGroups.entries()].flatMap(([date, items]) =>
              items.map((item, index) => {
                const laneIndex = lanes.indexOf('workouts')
                const x = xForDate(date, start, end, plotLeft, plotWidth) + jitter(index, items.length)
                const y = laneIndex * laneHeight + laneHeight / 2
                const name = item.templateName?.trim() || 'Workout'
                return (
                  <g key={item.sessionId} data-testid={`timeline-workout-${item.sessionId}`}>
                    <polygon
                      points={`${x},${y - 5} ${x + 5},${y} ${x},${y + 5} ${x - 5},${y}`}
                      className="fill-zinc-800"
                    />
                    <foreignObject x={x - 10} y={y - 10} width="20" height="20">
                      <button
                        type="button"
                        className="h-5 w-5 cursor-pointer rounded-full bg-transparent"
                        aria-label={`${name} on ${formatCalendarDate(date)}`}
                        onClick={() => onSelect(`training_session:${item.sessionId}`)}
                      />
                    </foreignObject>
                  </g>
                )
              }),
            )
          : null}
        {lanes.includes('bests')
          ? [...bestGroups.entries()].flatMap(([date, items]) =>
              items.map((item, index) => {
                const laneIndex = lanes.indexOf('bests')
                const x = xForDate(date, start, end, plotLeft, plotWidth) + jitter(index, items.length)
                const y = laneIndex * laneHeight + laneHeight / 2
                return (
                  <g key={item.eventId}>
                    <polygon
                      points={`${x},${y - 6} ${x + 3.5},${y} ${x},${y + 6} ${x - 3.5},${y}`}
                      className="fill-zinc-700"
                    />
                    <foreignObject x={x - 10} y={y - 10} width="20" height="20">
                      <button
                        type="button"
                        className="h-5 w-5 cursor-pointer rounded-full bg-transparent"
                        aria-label={`${item.exerciseName} performance best on ${formatCalendarDate(date)}`}
                        onClick={() => onSelect(item.eventId)}
                      />
                    </foreignObject>
                  </g>
                )
              }),
            )
          : null}
      </svg>
    </div>
  )
}

export function TimelineLaneLegend({
  series,
}: {
  series: ProgressTimeline['series']
}) {
  const items = [
    series.bodyWeight.length > 0 ? { shape: '●', label: 'Body weight' } : null,
    series.workouts.length > 0 ? { shape: '◆', label: 'Workouts' } : null,
    series.performanceBests.length > 0 ? { shape: '★', label: 'Performance bests' } : null,
  ].filter((item): item is { shape: string; label: string } => item != null)
  if (items.length === 0) {
    return null
  }
  return (
    <ul className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-500">
      {items.map((item) => (
        <li key={item.label} className={cn('flex items-center gap-1.5')}>
          <span aria-hidden="true">{item.shape}</span>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  )
}
