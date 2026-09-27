import { Link } from 'react-router-dom'
import type { SleepSourceAttribution, SleepSourceTransition } from '@/domain/sleep'
import { formatCalendarDate } from './format'

function transitionHeading(transition: SleepSourceTransition): string {
  if (transition.identityUnavailable) {
    return 'Source identity changed'
  }
  if (transition.gapDays > 1) {
    return 'Next observed Sleep source changed'
  }
  return 'Source changed'
}

export function SleepSourceSection({
  attribution,
  nightPath,
}: {
  attribution: SleepSourceAttribution
  nightPath: (date: string) => string
}) {
  const runs = attribution.runs.slice(-6)
  return (
    <section id="source-attribution" className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
      <h3 className="text-sm font-semibold tracking-tight">Source continuity</h3>
      <p className="mt-1 text-sm text-zinc-700">{attribution.continuityLabel}</p>
      {attribution.latestSelectedSource ? (
        <p className="mt-2 text-sm text-zinc-800">
          Latest selected source {attribution.latestSelectedSource.sourceName}
        </p>
      ) : null}
      {attribution.sourceBreakdown.length > 0 ? (
        <ul className="mt-3 space-y-2 text-sm text-zinc-800">
          {attribution.sourceBreakdown.map((source) => (
            <li key={source.sourceFamily}>
              <p className="font-medium">{source.sourceName}</p>
              <p className="text-zinc-600">
                {source.canonicalNights} night{source.canonicalNights === 1 ? '' : 's'} · {source.analysisEligibleNights} complete ·{' '}
                {source.stageEligibleNights} stage-qualified
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {attribution.strip.length > 0 ? (
        <div className="mt-3 overflow-x-auto">
          <div className="flex w-max gap-1">
            {attribution.strip.map((night) => (
              <Link
                key={night.sleepDate}
                to={nightPath(night.sleepDate)}
                title={`${formatCalendarDate(night.sleepDate)} ${night.sourceName}`}
                aria-label={`${formatCalendarDate(night.sleepDate)} ${night.sourceName}`}
                className="inline-flex h-8 min-w-8 items-center justify-center rounded-full border border-zinc-300 px-1 text-[10px] text-zinc-700"
              >
                {night.sourceName.slice(0, 1)}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {runs.length > 1 ? (
        <ul className="mt-3 space-y-1 text-sm text-zinc-700">
          {runs.map((run) => (
            <li key={`${run.sourceFamily}:${run.firstSleepDate}`}>
              {run.sourceName} · {formatCalendarDate(run.firstSleepDate)}–{formatCalendarDate(run.lastSleepDate)} · {run.observedNights} observed night
              {run.observedNights === 1 ? '' : 's'}
            </li>
          ))}
        </ul>
      ) : null}
      {attribution.recentTransitions.length > 0 ? (
        <div className="mt-3 space-y-2 text-sm text-zinc-800">
          {attribution.recentTransitions.map((transition) => (
            <div key={`${transition.previousSleepDate}:${transition.nextSleepDate}`}>
              <p className="font-medium">{transitionHeading(transition)}</p>
              <p>
                {transition.fromSource} → {transition.toSource}
              </p>
              {transition.gapDays > 1 ? (
                <p className="text-zinc-600">
                  Previous observation: {formatCalendarDate(transition.previousSleepDate)}. Next observation:{' '}
                  {formatCalendarDate(transition.nextSleepDate)}.
                </p>
              ) : (
                <p className="text-zinc-600">
                  <Link to={nightPath(transition.previousSleepDate)} className="underline">
                    {formatCalendarDate(transition.previousSleepDate)}
                  </Link>
                  {' → '}
                  <Link to={nightPath(transition.nextSleepDate)} className="underline">
                    {formatCalendarDate(transition.nextSleepDate)}
                  </Link>
                </p>
              )}
            </div>
          ))}
          <p className="text-zinc-600">The selected Sleep source changed in this period, so direct comparisons may reflect measurement differences.</p>
        </div>
      ) : null}
      {attribution.overrideNights.length > 0 ? (
        <div className="mt-3 text-sm text-zinc-700">
          <p>
            {attribution.overrideNights.length} night{attribution.overrideNights.length === 1 ? '' : 's'} used a completeness override.
          </p>
          <p className="mt-1 flex flex-wrap gap-2">
            {attribution.overrideNights.slice(-5).map((date) => (
              <Link key={date} to={nightPath(date)} className="underline">
                {formatCalendarDate(date)}
              </Link>
            ))}
          </p>
        </div>
      ) : null}
    </section>
  )
}
