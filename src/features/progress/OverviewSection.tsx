import type { ReactNode } from 'react'
import type { ProgressFinding, ProgressOverview } from '@/domain/progress'
import { kilogramsToPounds } from '@/domain/units'
import { cn } from '@/lib'
import {
  RANGE_HEADINGS,
  achievementList,
  bodyTrendCopy,
  findingDate,
  findingHeadline,
  findingTitle,
  progressBriefLines,
  strengthOverviewCopy,
} from './copy'
import type { EvidenceTopic } from './EvidencePanel'
import {
  formatBodyCanonical,
  formatCalendarDate,
  formatKgAsLb,
  formatPerformed,
} from './format'

function Card({
  title,
  children,
  onOpen,
}: {
  title: string
  children: ReactNode
  onOpen?: () => void
}) {
  const className = 'rounded-lg border border-zinc-200 bg-white p-4 text-left'
  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={cn(className, 'w-full hover:border-zinc-400')}>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
        <div className="mt-2">{children}</div>
      </button>
    )
  }
  return (
    <div className={className}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <div className="mt-2">{children}</div>
    </div>
  )
}

function findingTopic(finding: ProgressFinding, overview: ProgressOverview): EvidenceTopic {
  const exercise = overview.exercises.find((item) => item.exerciseId === finding.exerciseId)
  const event = exercise?.recentPrs.find((item) => item.sourceSessionId === finding.evidence[0]?.sessionId)
  const facts: EvidenceTopic['facts'] = []
  if (exercise) {
    facts.push({ label: 'Exercise', value: exercise.name })
  }
  if (event) {
    facts.push({ label: 'Performed', value: formatPerformed(event.performed) })
  }
  for (const label of achievementList(finding)) {
    facts.push({ label: 'Achievement', value: label })
  }
  if (finding.changePercent != null) {
    facts.push({ label: 'Change', value: `${finding.changePercent.toFixed(1)}%` })
  }
  if (finding.currentValue != null) {
    facts.push({ label: 'Recent', value: formatKgAsLb(finding.currentValue) })
  }
  if (finding.previousValue != null) {
    facts.push({ label: 'Previous', value: formatKgAsLb(finding.previousValue) })
  }
  if (finding.slopePerWeek != null) {
    facts.push({
      label: 'Trend',
      value: `${kilogramsToPounds(finding.slopePerWeek).toLocaleString('en-US', { maximumFractionDigits: 2, signDisplay: 'exceptZero' })} lb/week`,
    })
  }
  if (finding.observationCount != null) {
    facts.push({ label: 'Measurements', value: String(finding.observationCount) })
  }
  if (finding.currentWorkouts != null) {
    facts.push({ label: 'This period', value: String(finding.currentWorkouts) })
  }
  if (finding.previousWorkouts != null) {
    facts.push({ label: 'Previous period', value: String(finding.previousWorkouts) })
  }
  return {
    title: findingTitle(finding.kind),
    subtitle: findingHeadline(finding, overview),
    facts,
    evidence: event?.evidence ?? finding.evidence,
    workoutSessionId: finding.evidence.find((item) => item.sessionId)?.sessionId,
  }
}

export function OverviewSection({
  overview,
  onEvidence,
}: {
  overview: ProgressOverview
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const brief = progressBriefLines(overview)
  const strength = strengthOverviewCopy(overview)
  const workouts = overview.training.workouts.status === 'available' ? overview.training.workouts.value.count : null
  const consistency = overview.training.consistency
  const weight = overview.body.weight
  const findings = overview.findings

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-semibold tracking-tight">Your progress</h2>
        <p className="mt-1 text-sm text-zinc-600">{RANGE_HEADINGS[overview.period.range]}</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Card
            title="Body"
            onOpen={
              weight.latest
                ? () =>
                    onEvidence({
                      title: 'Body weight',
                      facts: [
                        { label: 'Latest', value: formatBodyCanonical(weight.latest!.unit, weight.latest!.value) },
                        { label: 'Date', value: formatCalendarDate(weight.latest!.calendarDate) },
                        { label: 'Measurements', value: String(weight.observations.length) },
                      ],
                      evidence: weight.observations.map((item) => ({
                        domain: 'body',
                        measurementId: item.measurementId,
                        measurementSessionId: item.measurementSessionId,
                        date: item.calendarDate,
                      })),
                    })
                : undefined
            }
          >
            <p className="text-xl font-semibold tracking-tight">
              {weight.latest ? formatBodyCanonical(weight.latest.unit, weight.latest.value) : 'No weight yet'}
            </p>
            <p className="mt-1 text-sm text-zinc-600">{bodyTrendCopy(overview)}</p>
          </Card>
          <Card title="Strength">
            {strength.improving + strength.stable + strength.decreasing === 0 ? (
              <>
                <p className="text-xl font-semibold tracking-tight">Building your trend</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {strength.building} exercise{strength.building === 1 ? '' : 's'} with history, none with 6 appearances yet.
                </p>
              </>
            ) : (
              <>
                <p className="text-xl font-semibold tracking-tight">
                  {strength.improving} improving
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  {strength.stable} stable · {strength.decreasing} decreasing
                </p>
              </>
            )}
          </Card>
          <Card title="Training">
            <p className="text-xl font-semibold tracking-tight">
              {workouts == null ? '—' : `${workouts} workout${workouts === 1 ? '' : 's'}`}
            </p>
            {consistency.status === 'available' ? (
              <p className="mt-1 text-sm text-zinc-600">
                {consistency.value.workoutsPerWeek.toLocaleString('en-US', { maximumFractionDigits: 1 })} / week
                {overview.training.comparison.workoutCount.status === 'available' &&
                overview.training.comparison.workoutCount.value.change !== 0
                  ? ` · ${overview.training.comparison.workoutCount.value.change > 0 ? '+' : ''}${overview.training.comparison.workoutCount.value.change} vs previous`
                  : ''}
              </p>
            ) : (
              <p className="mt-1 text-sm text-zinc-600">No workouts in this period.</p>
            )}
          </Card>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">Progress brief</h2>
        {brief.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">Not enough recorded change to summarize this period.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-zinc-800">
            {brief.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">What changed</h2>
        {findings.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">
            No new performance bests or trend changes in this period. First performances establish a baseline rather than a PR.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {findings.map((finding, index) => (
              <li key={`${finding.kind}-${finding.exerciseId ?? 'na'}-${index}`}>
                <button
                  type="button"
                  onClick={() => onEvidence(findingTopic(finding, overview))}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left hover:border-zinc-400"
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    {findingTitle(finding.kind)}
                  </p>
                  <p className="mt-1 font-medium">{findingHeadline(finding, overview)}</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {[achievementList(finding)[0], findingDate(finding)].filter(Boolean).join(' · ')}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <ConsistencyBlock overview={overview} />
    </div>
  )
}

function ConsistencyBlock({ overview }: { overview: ProgressOverview }) {
  const consistency = overview.training.consistency
  const dates = [...new Set(overview.training.sessions.map((item) => item.sessionDate))].sort()
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Training consistency</h2>
      {consistency.status !== 'available' ? (
        <p className="mt-2 text-sm text-zinc-600">No workouts to describe yet.</p>
      ) : (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-white p-4">
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Workouts</dt>
              <dd className="font-medium">{consistency.value.workoutCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Per week</dt>
              <dd className="font-medium">
                {consistency.value.workoutsPerWeek.toLocaleString('en-US', { maximumFractionDigits: 1 })}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Median gap</dt>
              <dd className="font-medium">
                {consistency.value.medianGapDays == null ? '—' : `${consistency.value.medianGapDays}d`}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Longest gap</dt>
              <dd className="font-medium">
                {consistency.value.longestGapDays == null ? '—' : `${consistency.value.longestGapDays}d`}
              </dd>
            </div>
          </dl>
          {dates.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Activity</p>
              <div className="mt-2 flex flex-wrap gap-1">
                {dates.map((date) => (
                  <span
                    key={date}
                    title={date}
                    className="rounded-sm bg-zinc-900 px-2 py-1 text-[11px] text-white"
                  >
                    {formatCalendarDate(date)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  )
}
