import type { ReactNode } from 'react'
import type { NutritionPeriodSummary, ProgressFinding, ProgressOverview } from '@/domain/progress'
import { kilogramsToPounds } from '@/domain/units'
import { cn } from '@/lib'
import { formatGrams, formatKcal } from '@/features/nutrition/format'
import {
  RANGE_HEADINGS,
  achievementList,
  bodyTrendCopy,
  findingDate,
  findingEventName,
  findingHeadline,
  findingResult,
  findingTitle,
  progressBriefLines,
  strengthOverviewCopy,
  workoutActivityByDate,
} from './copy'
import type { EvidenceTopic } from './EvidencePanel'
import {
  formatBodyCanonical,
  formatCalendarDate,
  formatCoverageDays,
  formatCoveragePct,
  formatKgAsLb,
  formatPerformed,
  formatTargetDifference,
} from './format'
import { LoggedCaloriesChart } from './ProgressCharts'

function Card({
  title,
  children,
  onOpen,
}: {
  title: string
  children: ReactNode
  onOpen?: () => void
}) {
  const className = 'rounded-lg border border-zinc-200 bg-white p-3 text-left md:p-4'
  if (onOpen) {
    return (
      <button type="button" onClick={onOpen} className={cn(className, 'w-full hover:border-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900')}>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
        <div className="mt-1.5 md:mt-2">{children}</div>
      </button>
    )
  }
  return (
    <div className={className}>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h3>
      <div className="mt-1.5 md:mt-2">{children}</div>
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
  if (finding.loggedDays != null && finding.calendarDays != null) {
    facts.push({ label: 'Logged days', value: formatCoverageDays(finding.loggedDays, finding.calendarDays) })
  }
  if (finding.coveragePct != null) {
    facts.push({ label: 'Coverage', value: formatCoveragePct(finding.coveragePct) })
  }
  if (finding.kind === 'nutrition_period_average' && finding.average != null) {
    facts.push({ label: 'Average on logged days', value: formatKcal(finding.average) })
  }
  if (finding.observedDays != null && finding.kind === 'nutrition_period_average') {
    facts.push({ label: 'Observed days', value: String(finding.observedDays) })
  }
  const nutritionDate = finding.domain === 'nutrition' ? finding.evidence.find((item) => item.date)?.date : null
  return {
    title: findingTitle(finding.kind),
    subtitle: findingHeadline(finding, overview),
    facts,
    evidence: event?.evidence ?? finding.evidence,
    workoutSessionId: finding.evidence.find((item) => item.sessionId)?.sessionId,
    actions: nutritionDate ? [{ label: 'Open Nutrition day', to: `/nutrition?date=${nutritionDate}` }] : undefined,
  }
}

export function OverviewSection({
  overview,
  onEvidence,
}: {
  overview: ProgressOverview
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const strength = strengthOverviewCopy(overview)
  const workouts = overview.training.workouts.status === 'available' ? overview.training.workouts.value.count : null
  const consistency = overview.training.consistency
  const weight = overview.body.weight
  const findings = overview.findings
  const brief = progressBriefLines(overview)

  return (
    <div className="space-y-5 md:space-y-6">
      <section>
        <h2 className="text-lg font-semibold tracking-tight md:sr-only">Your progress</h2>
        <p className="mt-1 text-sm text-zinc-600 md:hidden">{RANGE_HEADINGS[overview.period.range]}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 sm:gap-3">
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
            <p className="text-lg font-semibold tracking-tight md:text-xl">
              {weight.latest ? formatBodyCanonical(weight.latest.unit, weight.latest.value) : 'No weight yet'}
            </p>
            <p className="mt-1 text-sm text-zinc-600 md:hidden">
              {weight.trend.status === 'available'
                ? bodyTrendCopy(overview)
                : weight.latest
                  ? formatCalendarDate(weight.latest.calendarDate)
                  : 'No measurements yet'}
            </p>
            <p className="mt-1 hidden text-sm text-zinc-600 md:block">
              {weight.trend.status === 'available'
                ? bodyTrendCopy(overview)
                : weight.latest
                  ? 'Building history'
                  : 'No measurements yet'}
            </p>
          </Card>
          <Card title="Strength">
            {strength.improving + strength.stable + strength.decreasing === 0 ? (
              <>
                <p className="text-lg font-semibold tracking-tight md:text-xl">Building history</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {strength.building} exercise{strength.building === 1 ? '' : 's'} recorded
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold tracking-tight md:text-xl">{strength.improving} improving</p>
                <p className="mt-1 text-sm text-zinc-600">
                  {strength.stable} stable · {strength.decreasing} decreasing
                </p>
              </>
            )}
          </Card>
          <Card title="Training">
            <p className="text-lg font-semibold tracking-tight md:text-xl">
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
        {brief.length > 0 ? (
          <p className="mt-3 hidden text-sm text-zinc-600 md:block">
            <span className="font-medium text-zinc-800">{RANGE_HEADINGS[overview.period.range]}</span>
            <span className="text-zinc-400"> · </span>
            {brief.join('  •  ')}
          </p>
        ) : (
          <p className="mt-3 hidden text-sm text-zinc-500 md:block">{RANGE_HEADINGS[overview.period.range]}</p>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight">What changed</h2>
        {findings.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">
            No new performance bests or trend changes in this period. First performances establish a baseline rather than a PR.
          </p>
        ) : (
          <FindingFeed findings={findings} overview={overview} onEvidence={onEvidence} />
        )}
      </section>

      <NutritionOverview overview={overview} onEvidence={onEvidence} />

      <ConsistencyBlock overview={overview} />
    </div>
  )
}

function FindingFeed({
  findings,
  overview,
  onEvidence,
}: {
  findings: ProgressFinding[]
  overview: ProgressOverview
  onEvidence: (topic: EvidenceTopic) => void
}) {
  return (
    <>
      <ul className="mt-3 space-y-2 md:hidden">
        {findings.map((finding, index) => (
          <li key={`${finding.kind}-${finding.exerciseId ?? 'na'}-${index}`}>
            <button
              type="button"
              onClick={() => onEvidence(findingTopic(finding, overview))}
              className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left hover:border-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
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
      <div className="mt-3 hidden overflow-hidden rounded-lg border border-zinc-200 bg-white md:block">
        <div
          className="grid grid-cols-[5.5rem_8.75rem_minmax(8rem,1.3fr)_minmax(7rem,1fr)_minmax(7rem,0.9fr)_1rem] gap-3 border-b border-zinc-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500"
          aria-hidden="true"
        >
          <span>Date</span>
          <span>Type</span>
          <span>Event</span>
          <span>Result</span>
          <span>Detail</span>
          <span />
        </div>
        <ul>
          {findings.map((finding, index) => (
            <li key={`${finding.kind}-${finding.exerciseId ?? 'na'}-${index}`} className="border-b border-zinc-100 last:border-b-0">
              <button
                type="button"
                onClick={() => onEvidence(findingTopic(finding, overview))}
                className="grid w-full grid-cols-[5.5rem_8.75rem_minmax(8rem,1.3fr)_minmax(7rem,1fr)_minmax(7rem,0.9fr)_1rem] items-center gap-3 px-3 py-2.5 text-left hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900"
              >
                <span className="text-sm text-zinc-600">{findingDate(finding) ?? '—'}</span>
                <span className="text-xs text-zinc-500">{findingTitle(finding.kind)}</span>
                <span className="truncate font-medium">{findingEventName(finding, overview)}</span>
                <span className="text-sm text-zinc-800">{findingResult(finding, overview) ?? '—'}</span>
                <span className="truncate text-sm text-zinc-600">{achievementList(finding)[0] ?? '—'}</span>
                <span className="text-right text-zinc-400" aria-hidden="true">
                  →
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function nutritionFacts(nutrition: NutritionPeriodSummary): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [
    { label: 'Logged days', value: formatCoverageDays(nutrition.loggedDays, nutrition.calendarDays) },
    { label: 'Coverage', value: formatCoveragePct(nutrition.coveragePct) },
  ]
  if (nutrition.calories.averageOnLoggedDays != null) {
    facts.push({
      label: 'Calories avg on logged days',
      value: formatKcal(nutrition.calories.averageOnLoggedDays),
    })
  }
  if (nutrition.protein.averageOnObservedDays != null) {
    facts.push({
      label: 'Protein avg on observed days',
      value: formatGrams(nutrition.protein.averageOnObservedDays) ?? '—',
    })
    facts.push({ label: 'Protein observed days', value: String(nutrition.protein.observedDays) })
  } else if (nutrition.loggedDays > 0) {
    facts.push({ label: 'Protein', value: 'Unavailable' })
  }
  if (nutrition.calories.targetContext) {
    facts.push({
      label: 'Calories vs target',
      value: `${formatTargetDifference(nutrition.calories.targetContext.averageDifference, 'kcal')} avg · ${nutrition.calories.targetContext.daysWithTarget} days`,
    })
  }
  if (nutrition.protein.targetContext) {
    facts.push({
      label: 'Protein vs target',
      value: `${formatTargetDifference(nutrition.protein.targetContext.averageDifference, 'g')} avg · ${nutrition.protein.targetContext.daysWithTarget} days`,
    })
  }
  return facts
}

function NutritionOverview({
  overview,
  onEvidence,
}: {
  overview: ProgressOverview
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const nutrition = overview.nutrition
  const latestDate = nutrition.evidence.dates[nutrition.evidence.dates.length - 1]
  const caloriePoints = nutrition.observations.flatMap((item) =>
    item.calories.status === 'available' && item.calories.value != null
      ? [{ date: item.date, calories: item.calories.value, targetCalories: item.target?.calories ?? null }]
      : [],
  )
  const proteinLine =
    nutrition.protein.averageOnObservedDays != null
      ? `${formatGrams(nutrition.protein.averageOnObservedDays)} avg · ${nutrition.protein.observedDays} observed day${nutrition.protein.observedDays === 1 ? '' : 's'}`
      : nutrition.loggedDays > 0
        ? 'Protein unavailable'
        : null
  const calorieLine =
    nutrition.calories.averageOnLoggedDays != null
      ? `${formatKcal(nutrition.calories.averageOnLoggedDays)} avg on logged days`
      : null
  const targetLines: string[] = []
  if (nutrition.calories.targetContext) {
    targetLines.push(`Calories avg ${formatTargetDifference(nutrition.calories.targetContext.averageDifference, 'kcal')}`)
  }
  if (nutrition.protein.targetContext) {
    targetLines.push(`Protein avg ${formatTargetDifference(nutrition.protein.targetContext.averageDifference, 'g')}`)
  }

  return (
    <section>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">Nutrition</h2>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {RANGE_HEADINGS[overview.period.range]}
        </p>
      </div>
      {nutrition.loggedDays === 0 ? (
        <p className="mt-2 text-sm text-zinc-600">No nutrition days logged in this period.</p>
      ) : (
        <>
          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-zinc-200 bg-white p-3 text-left hover:border-zinc-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 md:p-4"
            onClick={() =>
              onEvidence({
                title: 'Nutrition',
                subtitle: RANGE_HEADINGS[overview.period.range],
                facts: nutritionFacts(nutrition),
                evidence: nutrition.evidence.dates.map((date) => ({ domain: 'nutrition', date })),
                actions: latestDate ? [{ label: 'Open Nutrition day', to: `/nutrition?date=${latestDate}` }] : undefined,
              })
            }
          >
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-4">
              <div>
                <dt className="text-xs uppercase tracking-wide text-zinc-500">Logged</dt>
                <dd className="mt-0.5 font-medium">{formatCoverageDays(nutrition.loggedDays, nutrition.calendarDays)}</dd>
                <p className="mt-0.5 text-xs text-zinc-500">{formatCoveragePct(nutrition.coveragePct)}</p>
              </div>
              {calorieLine ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Calories</dt>
                  <dd className="mt-0.5 font-medium">{calorieLine}</dd>
                </div>
              ) : null}
              {proteinLine ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Protein</dt>
                  <dd className="mt-0.5 font-medium">{proteinLine}</dd>
                </div>
              ) : null}
              {targetLines.length > 0 ? (
                <div>
                  <dt className="text-xs uppercase tracking-wide text-zinc-500">Targets</dt>
                  <dd className="mt-0.5 font-medium">{targetLines.join(' · ')}</dd>
                </div>
              ) : null}
            </dl>
          </button>
          <LoggedCaloriesChart points={caloriePoints} />
        </>
      )}
    </section>
  )
}

function ConsistencyBlock({ overview }: { overview: ProgressOverview }) {
  const consistency = overview.training.consistency
  const activity = workoutActivityByDate(overview.training.sessions)
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">Training consistency</h2>
      {consistency.status !== 'available' ? (
        <p className="mt-2 text-sm text-zinc-600">No workouts to describe yet.</p>
      ) : (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-white px-4 py-3">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4 md:gap-8">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Workouts</dt>
              <dd className="mt-0.5 font-medium">{consistency.value.workoutCount}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Per week</dt>
              <dd className="mt-0.5 font-medium">
                {consistency.value.workoutsPerWeek.toLocaleString('en-US', { maximumFractionDigits: 1 })}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Median gap</dt>
              <dd className="mt-0.5 font-medium">
                {consistency.value.medianGapDays == null ? '—' : `${consistency.value.medianGapDays}d`}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Longest gap</dt>
              <dd className="mt-0.5 font-medium">
                {consistency.value.longestGapDays == null ? '—' : `${consistency.value.longestGapDays}d`}
              </dd>
            </div>
          </dl>
          {activity.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-zinc-100 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Activity</p>
              <div className="flex flex-wrap gap-1">
                {activity.map((item) => (
                  <span
                    key={item.date}
                    title={`${item.count} workout${item.count === 1 ? '' : 's'} on ${item.date}`}
                    className="text-sm text-zinc-800"
                  >
                    {formatCalendarDate(item.date)}
                    {item.count > 1 ? ` ×${item.count}` : ''}
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
