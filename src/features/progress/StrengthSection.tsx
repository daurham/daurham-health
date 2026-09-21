import { Link } from 'react-router-dom'
import type { ProgressOverview, ProgressRange } from '@/domain/progress'
import { compactTrendCopy } from './copy'
import type { EvidenceTopic } from './EvidencePanel'
import {
  EstimatedStrengthChart,
  PerformanceFrontierChart,
} from './ProgressCharts'
import {
  ACHIEVEMENT_LABELS,
  formatCalendarDate,
  formatKgAsLb,
  formatLatestPerformance,
  formatPerformed,
  performanceTypeLabel,
} from './format'
import { progressSearch } from './range'

export function StrengthSection({
  overview,
  range,
  onEvidence,
}: {
  overview: ProgressOverview
  range: ProgressRange
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const exercises = overview.exercises.filter(
    (exercise) =>
      exercise.latestPerformance != null || exercise.performedPoints.length > 0 || exercise.recentPrs.length > 0,
  )
  const unusedCount = overview.exercises.length - exercises.length

  return (
    <div className="space-y-4 md:space-y-5">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Strength</h2>
        <p className="mt-1 hidden text-sm text-zinc-600 md:block">
          Latest performed work, demonstrated bests, and estimated-strength trends when history is sufficient.
        </p>
      </div>

      {exercises.length === 0 ? (
        <p className="text-sm text-zinc-600">No recorded strength work yet.</p>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {exercises.map((exercise) => (
              <li key={exercise.exerciseId}>
                <ExerciseCard exercise={exercise} range={range} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[42rem] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3 font-semibold">Exercise</th>
                  <th className="py-2 pr-3 font-semibold">Latest</th>
                  <th className="py-2 pr-3 font-semibold">Trend</th>
                  <th className="py-2 pr-3 font-semibold">Last performed</th>
                  <th className="py-2 font-semibold">Status / Best</th>
                </tr>
              </thead>
              <tbody>
                {exercises.map((exercise) => (
                  <tr key={exercise.exerciseId} className="group relative border-b border-zinc-100 hover:bg-zinc-50">
                    <td className="py-2.5 pr-3">
                      <Link
                        to={`/progress/strength/${exercise.exerciseId}${progressSearch(range)}`}
                        className="font-medium text-zinc-900 after:absolute after:inset-0 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
                      >
                        {exercise.name}
                      </Link>
                      <p className="relative z-10 text-xs text-zinc-500">{performanceTypeLabel(exercise.performanceType)}</p>
                    </td>
                    <td className="py-2.5 pr-3">{formatLatestPerformance(exercise.latestPerformance)}</td>
                    <td className="py-2.5 pr-3 text-zinc-700">{compactTrendCopy(exercise)}</td>
                    <td className="py-2.5 pr-3 text-zinc-600">
                      {exercise.latestPerformance ? formatCalendarDate(exercise.latestPerformance.date) : '—'}
                    </td>
                    <td className="relative z-10 py-2.5">
                      <StatusCell exercise={exercise} onEvidence={onEvidence} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {unusedCount > 0 ? (
        <p className="text-xs text-zinc-500">
          {unusedCount} library exercise{unusedCount === 1 ? '' : 's'} have no recorded sets in this history.
        </p>
      ) : null}
    </div>
  )
}

function StatusCell({
  exercise,
  onEvidence,
}: {
  exercise: ProgressOverview['exercises'][number]
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const recent = exercise.recentPrs.length
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-zinc-700">
        {recent > 0 ? `${recent} recent best${recent === 1 ? '' : 's'}` : '—'}
      </span>
      {exercise.recentPrs[0] ? (
        <button
          type="button"
          className="text-xs font-medium text-zinc-700 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onEvidence({
              title: 'Performance best',
              subtitle: exercise.name,
              facts: [
                { label: 'Performed', value: formatPerformed(exercise.recentPrs[0]!.performed) },
                ...exercise.recentPrs[0]!.achievements.map((item) => ({
                  label: 'Achievement',
                  value: ACHIEVEMENT_LABELS[item],
                })),
              ],
              evidence: exercise.recentPrs[0]!.evidence,
              workoutSessionId: exercise.recentPrs[0]!.sourceSessionId,
            })
          }}
        >
          Evidence
        </button>
      ) : null}
    </div>
  )
}

function ExerciseCard({
  exercise,
  range,
}: {
  exercise: ProgressOverview['exercises'][number]
  range: ProgressRange
}) {
  return (
    <Link
      to={`/progress/strength/${exercise.exerciseId}${progressSearch(range)}`}
      className="flex min-h-14 items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-3 py-2.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
    >
      <div className="min-w-0">
        <p className="truncate font-medium">{exercise.name}</p>
        <p className="mt-0.5 text-sm text-zinc-700">{formatLatestPerformance(exercise.latestPerformance)}</p>
      </div>
      <div className="shrink-0 text-right text-xs text-zinc-500">
        <p>{compactTrendCopy(exercise)}</p>
        {exercise.recentPrs.length > 0 ? <p className="mt-0.5 font-medium text-zinc-700">Best</p> : null}
      </div>
    </Link>
  )
}

export function StrengthLab({
  overview,
  range,
  exerciseId,
  onEvidence,
}: {
  overview: ProgressOverview
  range: ProgressRange
  exerciseId: string
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const exercise = overview.exercises.find((item) => item.exerciseId === exerciseId)
  if (!exercise) {
    return (
      <div>
        <p className="text-sm text-zinc-600">That exercise is not in the current Progress snapshot.</p>
        <Link to={`/progress/strength${progressSearch(range)}`} className="mt-3 inline-block text-sm font-medium underline">
          Back to Strength
        </Link>
      </div>
    )
  }
  const timed = exercise.performanceType === 'timed'
  const frontierIds = new Set(exercise.frontier.map((item) => item.setId))
  const historyPoints = exercise.performedPoints.filter((item) => !frontierIds.has(item.setId))
  const mode = timed ? 'duration' : 'reps'
  const showEstimatedChart = !timed && exercise.estimatedStrengthHistory.length >= 2
  const showFrontier = exercise.performedPoints.length > 0
  const hasCharts = showEstimatedChart || showFrontier

  return (
    <div className="space-y-5 md:space-y-6">
      <div>
        <Link to={`/progress/strength${progressSearch(range)}`} className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Strength
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{exercise.name}</h2>
        <p className="mt-1 text-sm text-zinc-600">{performanceTypeLabel(exercise.performanceType)}</p>
      </div>

      <div className={hasCharts ? 'grid gap-4 lg:grid-cols-[minmax(16rem,22rem)_minmax(0,1fr)] lg:items-start' : undefined}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Latest performance</h3>
            <p className="mt-2 text-xl font-semibold tracking-tight">{formatLatestPerformance(exercise.latestPerformance)}</p>
            <p className="mt-1 text-sm text-zinc-600">
              {exercise.latestPerformance ? formatCalendarDate(exercise.latestPerformance.date) : 'No working sets yet'}
            </p>
          </div>
          <div className="rounded-lg border border-zinc-200 bg-white p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {timed ? 'Demonstrated frontier' : 'Estimated strength'}
            </h3>
            {timed ? (
              <>
                <p className="mt-2 text-xl font-semibold tracking-tight">
                  {exercise.frontier.length} frontier point{exercise.frontier.length === 1 ? '' : 's'}
                </p>
                <p className="mt-1 text-sm text-zinc-600">Estimated 1RM is not used for timed carries.</p>
              </>
            ) : exercise.estimatedStrength.status === 'available' ? (
              <>
                <p className="mt-2 text-xl font-semibold tracking-tight">
                  {formatKgAsLb(exercise.estimatedStrength.value.value)}
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  From {formatKgAsLb(exercise.estimatedStrength.value.sourceSet.loadKg)} × {exercise.estimatedStrength.value.sourceSet.reps}
                </p>
              </>
            ) : (
              <>
                <p className="mt-2 text-xl font-semibold tracking-tight">Building baseline</p>
                <p className="mt-1 text-sm text-zinc-600">{compactTrendCopy(exercise)}</p>
              </>
            )}
          </div>
        </div>
        {hasCharts ? (
          <div className="space-y-4">
            {showEstimatedChart ? (
              <EstimatedStrengthChart
                points={exercise.estimatedStrengthHistory.map((point) => ({
                  date: point.date,
                  estimated1RmKg: point.estimated1RmKg,
                  loadKg: point.loadKg,
                  reps: point.reps,
                }))}
              />
            ) : null}
            {showFrontier ? (
              <PerformanceFrontierChart
                mode={mode}
                history={historyPoints}
                frontier={exercise.frontier}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      <section>
        <h3 className="text-sm font-semibold tracking-tight">Performance bests</h3>
        {exercise.recentPrs.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">
            {exercise.latestPerformance
              ? 'Current records are a baseline from the first appearance. Later improvements will appear here.'
              : 'No performance-best events yet.'}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100 overflow-hidden rounded-lg border border-zinc-200 bg-white">
            {exercise.recentPrs.map((event) => (
              <li key={`${event.sourceSessionId}-${event.sourceSetId}`}>
                <button
                  type="button"
                  className="grid w-full grid-cols-1 gap-1 px-4 py-2.5 text-left hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-zinc-900 md:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)] md:items-center md:gap-3"
                  onClick={() =>
                    onEvidence({
                      title: 'Performance best',
                      subtitle: exercise.name,
                      facts: [
                        { label: 'Performed', value: formatPerformed(event.performed) },
                        { label: 'Date', value: formatCalendarDate(event.date) },
                        ...event.achievements.map((item) => ({
                          label: 'Achievement',
                          value: ACHIEVEMENT_LABELS[item],
                        })),
                      ],
                      evidence: event.evidence,
                      workoutSessionId: event.sourceSessionId,
                    })
                  }
                >
                  <p className="text-sm text-zinc-500">{formatCalendarDate(event.date)}</p>
                  <p className="font-medium">{formatPerformed(event.performed)}</p>
                  <p className="text-sm text-zinc-600">
                    {event.achievements.map((item) => ACHIEVEMENT_LABELS[item]).join(' · ')}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {!timed && exercise.volume.status === 'available' ? (
        <p className="text-sm text-zinc-600">
          Period volume {formatKgAsLb(exercise.volume.value.kg)} (load × performed reps).
        </p>
      ) : null}

      {!timed && exercise.relativeStrength.status === 'available' ? (
        <p className="text-sm text-zinc-600">
          Relative strength {exercise.relativeStrength.value.ratio.toLocaleString('en-US', { maximumFractionDigits: 2 })}× body
          weight.
        </p>
      ) : null}
    </div>
  )
}
