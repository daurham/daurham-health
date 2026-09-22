import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  groupedTimelineDays,
  performanceBestsForSession,
  timelineEventsForFocus,
  timelineSeriesForFocus,
  type NutritionDayEntrySnapshot,
  type ProgressRange,
  type ProgressTimeline,
  type TimelineBodyMeasurementEvent,
  type TimelineCheckpointEvent,
  type TimelineEvent,
  type TimelineFocus,
  type TimelineNutritionDayEvent,
  type TimelinePerformanceBestEvent,
  type TimelineTrainingSessionEvent,
} from '@/domain/progress'
import { cn } from '@/lib'
import { formatGrams, formatKcal, formatQuantity, mealLabel } from '@/features/nutrition/format'
import { TIMELINE_FOCUS_OPTIONS } from './copy'
import type { EvidenceTopic } from './EvidencePanel'
import {
  ACHIEVEMENT_LABELS,
  bodyMetricLabel,
  formatBodyCanonical,
  formatCalendarDate,
  formatClockTime,
  formatPerformed,
  formatTimelineDayHeading,
} from './format'
import { parseTimelineFocusParam, progressSearch } from './range'
import { TimelineLaneLegend, TimelineLanes } from './TimelineLanes'

const BODY_CARD_KEYS = ['weight', 'bmi', 'body_fat_percentage'] as const

export function TimelineSection({
  timeline,
  range,
  onEvidence,
}: {
  timeline: ProgressTimeline
  range: ProgressRange
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const [params, setParams] = useSearchParams()
  const focus = parseTimelineFocusParam(params.get('focus'))
  const series = timelineSeriesForFocus(timeline, focus)
  const events = timelineEventsForFocus(timeline, focus)
  const days = groupedTimelineDays(events)
  const empty = events.length === 0

  function setFocus(next: TimelineFocus) {
    const copy = new URLSearchParams(params)
    if (next === 'all') {
      copy.delete('focus')
    } else {
      copy.set('focus', next)
    }
    setParams(copy, { replace: true })
  }

  function selectEvent(eventId: string) {
    const node = document.getElementById(eventId)
    node?.scrollIntoView({ block: 'nearest' })
    if (node instanceof HTMLElement) {
      node.focus()
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Timeline</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Recorded training, body measurements, nutrition days, and performance bests in chronological order.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto" role="group" aria-label="Timeline domain">
        {TIMELINE_FOCUS_OPTIONS.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => setFocus(option.id)}
            className={cn(
              'min-h-10 shrink-0 rounded-md px-3 py-1.5 text-sm font-medium md:min-h-9',
              option.id === focus ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
            )}
            aria-pressed={option.id === focus}
          >
            {option.label}
          </button>
        ))}
      </div>

      {empty ? (
        <p className="text-sm text-zinc-600">No recorded timeline events in this range yet.</p>
      ) : (
        <>
          <TimelineLanes timeline={timeline} series={series} onSelect={selectEvent} />
          <TimelineLaneLegend series={series} />
          <ol className="space-y-6">
            {days.map((day) => (
              <li key={day.date}>
                <h3 className="text-xs font-semibold tracking-wide text-zinc-500">
                  {formatTimelineDayHeading(day.date)}
                </h3>
                <div className="mt-2 space-y-2">
                  {day.events.map((event) => (
                    <TimelineEventCard
                      key={event.id}
                      event={event}
                      timeline={timeline}
                      range={range}
                      focus={focus}
                      onEvidence={onEvidence}
                    />
                  ))}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

function TimelineEventCard({
  event,
  timeline,
  range,
  focus,
  onEvidence,
}: {
  event: TimelineEvent
  timeline: ProgressTimeline
  range: ProgressRange
  focus: TimelineFocus
  onEvidence: (topic: EvidenceTopic) => void
}) {
  if (event.kind === 'training_session') {
    return (
      <TrainingEventCard
        event={event}
        timeline={timeline}
        range={range}
        nested={focus !== 'bests'}
        onEvidence={onEvidence}
      />
    )
  }
  if (event.kind === 'body_measurement') {
    return <BodyEventCard event={event} onEvidence={onEvidence} />
  }
  if (event.kind === 'checkpoint') {
    return <CheckpointEventCard event={event} />
  }
  if (event.kind === 'nutrition_day') {
    return <NutritionEventCard event={event} onEvidence={onEvidence} />
  }
  return <PerformanceBestCard event={event} range={range} onEvidence={onEvidence} standalone />
}

function TrainingEventCard({
  event,
  timeline,
  range,
  nested,
  onEvidence,
}: {
  event: TimelineTrainingSessionEvent
  timeline: ProgressTimeline
  range: ProgressRange
  nested: boolean
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const bests = nested ? performanceBestsForSession(timeline, event.data.sessionId) : []
  const summaryParts = [
    event.data.exerciseCount > 0
      ? `${event.data.exerciseCount} exercise${event.data.exerciseCount === 1 ? '' : 's'}`
      : null,
    event.data.workingSetCount > 0
      ? `${event.data.workingSetCount} working set${event.data.workingSetCount === 1 ? '' : 's'}`
      : null,
  ].filter((item): item is string => item != null)

  return (
    <article
      id={event.id}
      tabIndex={-1}
      className="rounded-lg border border-zinc-200 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-zinc-400 md:px-4"
    >
      <div className="md:grid md:grid-cols-[7.5rem_minmax(0,1fr)_auto] md:items-start md:gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Training</p>
        <div>
          <p className="font-medium tracking-tight">{event.title}</p>
          <p className="mt-0.5 text-sm text-zinc-600">
            {formatCalendarDate(event.date)}
            {event.data.effort != null ? ` · Effort ${event.data.effort}` : ''}
          </p>
          {summaryParts.length > 0 ? <p className="mt-1 text-sm text-zinc-600">{summaryParts.join(' · ')}</p> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 md:mt-0 md:justify-end">
          <Link
            to={`/training/${event.data.sessionId}`}
            className="inline-flex min-h-10 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white md:min-h-9"
          >
            Open workout
          </Link>
        </div>
      </div>
      {bests.length > 0 ? (
        <ul className="mt-3 space-y-2 border-l border-zinc-200 pl-3 md:ml-[7.5rem]">
          {bests.map((best) => (
            <li key={best.id}>
              <PerformanceBestCard event={best} range={range} onEvidence={onEvidence} nested />
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

function PerformanceBestCard({
  event,
  range,
  onEvidence,
  nested = false,
  standalone = false,
}: {
  event: TimelinePerformanceBestEvent
  range: ProgressRange
  onEvidence: (topic: EvidenceTopic) => void
  nested?: boolean
  standalone?: boolean
}) {
  const achievements = event.data.achievements.map((item) => ACHIEVEMENT_LABELS[item] ?? item)
  return (
    <article
      id={event.id}
      tabIndex={-1}
      className={cn(
        'outline-none focus:ring-2 focus:ring-zinc-400',
        standalone ? 'rounded-lg border border-zinc-200 bg-white px-3 py-3 md:px-4' : '',
      )}
    >
      <div className={cn(standalone ? 'md:grid md:grid-cols-[7.5rem_minmax(0,1fr)_auto] md:items-start md:gap-4' : '')}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
          {nested ? 'Performance best' : 'Performance best'}
        </p>
        <div className={nested ? 'mt-0.5' : standalone ? '' : 'mt-0.5'}>
          <p className="font-medium tracking-tight">
            {event.data.exerciseName}
            <span className="font-normal text-zinc-600"> · {formatPerformed(event.data.performed)}</span>
          </p>
          {event.data.sessionTitle && standalone ? (
            <p className="mt-0.5 text-sm text-zinc-600">{event.data.sessionTitle}</p>
          ) : null}
          {achievements.length > 0 ? (
            <p className="mt-1 text-sm text-zinc-600">
              {nested ? '' : 'New: '}
              {achievements.join(' · ')}
            </p>
          ) : null}
        </div>
        <div className={cn('mt-3 flex flex-wrap gap-2', standalone ? 'md:mt-0 md:justify-end' : '')}>
          <button
            type="button"
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 md:min-h-9"
            onClick={() =>
              onEvidence({
                title: event.data.exerciseName,
                subtitle: formatPerformed(event.data.performed),
                facts: achievements.map((label) => ({ label: 'Achievement', value: label })),
                evidence: event.evidence,
                workoutSessionId: event.data.sessionId ?? undefined,
              })
            }
          >
            View evidence
          </button>
          {event.data.sessionId && standalone ? (
            <Link
              to={`/training/${event.data.sessionId}`}
              className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 md:min-h-9"
            >
              Open workout
            </Link>
          ) : null}
          <Link
            to={`/progress/strength/${event.data.exerciseId}${progressSearch(range)}`}
            className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 md:min-h-9"
          >
            Strength Lab
          </Link>
        </div>
      </div>
    </article>
  )
}

function BodyEventCard({
  event,
  onEvidence,
}: {
  event: TimelineBodyMeasurementEvent
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const byKey = new Map(event.data.metrics.map((item) => [item.key, item]))
  const clock = formatClockTime(event.occurredAt, event.data.timezone)
  return (
    <article
      id={event.id}
      tabIndex={-1}
      className="rounded-lg border border-zinc-200 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-zinc-400 md:px-4"
    >
      <div className="md:grid md:grid-cols-[7.5rem_minmax(0,1fr)_auto] md:items-start md:gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Body</p>
        <div>
          <p className="text-sm text-zinc-600">
            {formatCalendarDate(event.date)} · {clock}
          </p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
            {BODY_CARD_KEYS.map((key) => {
              const metric = byKey.get(key)
              return (
                <div key={key}>
                  <dt className="text-xs text-zinc-500">{bodyMetricLabel(key)}</dt>
                  <dd className="font-medium">
                    {metric ? formatBodyCanonical(metric.unit, metric.value) : '—'}
                  </dd>
                </div>
              )
            })}
          </dl>
          {event.data.partial ? <p className="mt-2 text-xs text-zinc-500">Partial measurement</p> : null}
        </div>
        <div className="mt-3 md:mt-0 md:justify-self-end">
          <button
            type="button"
            className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 md:min-h-9"
            onClick={() =>
              onEvidence({
                title: 'Body measurement',
                subtitle: `${formatCalendarDate(event.date)} · ${clock}`,
                facts: event.data.metrics.map((metric) => ({
                  label: bodyMetricLabel(metric.key),
                  value: formatBodyCanonical(metric.unit, metric.value),
                })),
                evidence: event.evidence,
              })
            }
          >
            View evidence
          </button>
        </div>
      </div>
    </article>
  )
}

function CheckpointEventCard({ event }: { event: TimelineCheckpointEvent }) {
  return (
    <article
      id={event.id}
      tabIndex={-1}
      className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-3 py-3 outline-none focus:ring-2 focus:ring-zinc-400 md:px-4"
    >
      <div className="md:grid md:grid-cols-[7.5rem_minmax(0,1fr)] md:items-start md:gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Checkpoint</p>
        <div>
          <p className="font-medium tracking-tight">{event.title}</p>
          <p className="mt-0.5 text-sm text-zinc-600">{formatCalendarDate(event.date)}</p>
          {event.data.notes ? <p className="mt-1 text-sm text-zinc-600">{event.data.notes}</p> : null}
        </div>
      </div>
    </article>
  )
}

function nutritionMacroLine(event: TimelineNutritionDayEvent): string {
  const parts: string[] = []
  if (event.data.calories.status === 'available' && event.data.calories.value != null) {
    parts.push(formatKcal(event.data.calories.value))
  }
  if (event.data.protein.status === 'available' && event.data.protein.value != null) {
    parts.push(`${formatGrams(event.data.protein.value)} protein`)
  } else {
    parts.push('Protein unavailable')
  }
  parts.push(`${event.data.entryCount} ${event.data.entryCount === 1 ? 'entry' : 'entries'}`)
  return parts.join(' · ')
}

function clusterNutritionSnapshots(entries: readonly NutritionDayEntrySnapshot[]): Array<
  | { kind: 'entry'; key: string; entry: NutritionDayEntrySnapshot }
  | { kind: 'meal'; key: string; entries: NutritionDayEntrySnapshot[]; calories: number }
> {
  const rows: Array<
    | { kind: 'entry'; key: string; entry: NutritionDayEntrySnapshot }
    | { kind: 'meal'; key: string; entries: NutritionDayEntrySnapshot[]; calories: number }
  > = []
  const seen = new Set<string>()
  for (const entry of entries) {
    if (!entry.mealGroupId) {
      rows.push({ kind: 'entry', key: entry.id, entry })
      continue
    }
    if (seen.has(entry.mealGroupId)) {
      continue
    }
    seen.add(entry.mealGroupId)
    const group = entries.filter((item) => item.mealGroupId === entry.mealGroupId)
    rows.push({
      kind: 'meal',
      key: entry.mealGroupId,
      entries: group,
      calories: group.reduce((sum, item) => sum + item.calories, 0),
    })
  }
  return rows
}

function groupedNutritionSnapshots(entries: readonly NutritionDayEntrySnapshot[]): Array<{
  label: string
  items: ReturnType<typeof clusterNutritionSnapshots>
}> {
  if (entries.every((entry) => entry.meal == null)) {
    return [{ label: 'Logged', items: clusterNutritionSnapshots(entries) }]
  }
  const order = ['breakfast', 'lunch', 'dinner', 'snack', 'other'] as const
  return order
    .map((meal) => ({
      label: mealLabel(meal),
      items: clusterNutritionSnapshots(entries.filter((entry) => (entry.meal ?? 'other') === meal)),
    }))
    .filter((group) => group.items.length > 0)
}

function NutritionEventCard({
  event,
  onEvidence,
}: {
  event: TimelineNutritionDayEvent
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const dense = event.data.entryCount > 6
  const [open, setOpen] = useState(!dense)
  const groups = groupedNutritionSnapshots(event.data.entries)
  return (
    <article
      id={event.id}
      tabIndex={-1}
      className="rounded-lg border border-zinc-200 bg-white px-3 py-3 outline-none focus:ring-2 focus:ring-zinc-400 md:grid md:grid-cols-[7.5rem_minmax(0,1fr)_auto] md:items-start md:gap-4 md:px-4"
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Nutrition</p>
      <div>
        <p className="font-medium tracking-tight">{nutritionMacroLine(event)}</p>
        {open ? (
          <div className="mt-3 space-y-3">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{group.label}</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {group.items.map((item) =>
                    item.kind === 'entry' ? (
                      <li key={item.key} className="flex justify-between gap-3">
                        <span>{item.entry.foodName}</span>
                        <span className="shrink-0 text-zinc-600">{formatKcal(item.entry.calories)}</span>
                      </li>
                    ) : (
                      <li key={item.key}>
                        <div className="flex justify-between gap-3">
                          <span>Photo meal</span>
                          <span className="shrink-0 text-zinc-600">{formatKcal(item.calories)}</span>
                        </div>
                        <ul className="mt-1 space-y-0.5 pl-3 text-zinc-600">
                          {item.entries.map((entry) => (
                            <li key={entry.id}>
                              {entry.foodName}
                              <span className="text-zinc-400">
                                {' '}
                                · {formatQuantity(entry.servingQuantity, entry.servingUnit)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 md:mt-0 md:justify-end">
        {dense ? (
          <button
            type="button"
            className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 md:min-h-9"
            onClick={() => setOpen((current) => !current)}
          >
            {open ? 'Hide entries' : 'Show entries'}
          </button>
        ) : null}
        <button
          type="button"
          className="inline-flex min-h-10 items-center rounded-md border border-zinc-300 px-3 text-sm font-medium text-zinc-800 hover:bg-zinc-50 md:min-h-9"
          onClick={() =>
            onEvidence({
              title: 'Nutrition',
              subtitle: nutritionMacroLine(event),
              facts: [
                { label: 'Entries', value: String(event.data.entryCount) },
                ...(event.data.mealGroupCount > 0
                  ? [{ label: 'Meal groups', value: String(event.data.mealGroupCount) }]
                  : []),
              ],
              evidence: event.evidence,
              actions: [{ label: 'Open Nutrition day', to: `/nutrition?date=${event.date}` }],
            })
          }
        >
          View evidence
        </button>
        <Link
          to={`/nutrition?date=${event.date}`}
          className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-100 md:min-h-9"
        >
          Open day
        </Link>
      </div>
    </article>
  )
}
