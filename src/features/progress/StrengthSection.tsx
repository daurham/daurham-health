import { Link } from 'react-router-dom'
import type { ProgressOverview, ProgressRange } from '@/domain/progress'
import { appearanceProgressCopy, trendStatusCopy } from './copy'
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
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">Strength</h2>
        <p className="mt-1 text-sm text-zinc-600">
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
                <ExerciseCard exercise={exercise} range={range} onEvidence={onEvidence} />
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-xs uppercase tracking-wide text-zinc-500">
                  <th className="py-2 pr-3 font-semibold">Exercise</th>
                  <th className="py-2 pr-3 font-semibold">Latest</th>
                  <th className="py-2 pr-3 font-semibold">Trend</th>
                  <th className="py-2 pr-3 font-semibold">Last performed</th>
                  <th className="py-2 font-semibold">Notes</th>
                </tr>
              </thead>
              <tbody>
                {exercises.map((exercise) => (
                  <tr key={exercise.exerciseId} className="border-b border-zinc-100">
                    <td className="py-3 pr-3">
                      <Link
                        to={`/progress/strength/${exercise.exerciseId}${progressSearch(range)}`}
                        className="font-medium text-zinc-900 hover:underline"
                      >
                        {exercise.name}
                      </Link>
                      <p className="text-xs text-zinc-500">{performanceTypeLabel(exercise.performanceType)}</p>
                    </td>
                    <td className="py-3 pr-3">{formatLatestPerformance(exercise.latestPerformance)}</td>
                    <td className="py-3 pr-3">{trendCell(exercise)}</td>
                    <td className="py-3 pr-3">
                      {exercise.latestPerformance ? formatCalendarDate(exercise.latestPerformance.date) : '—'}
                    </td>
                    <td className="py-3">
                      <ExerciseNotes exercise={exercise} onEvidence={onEvidence} />
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

function trendCell(exercise: ProgressOverview['exercises'][number]): string {
  if (exercise.trend.status === 'insufficient_data') {
    return appearanceProgressCopy(exercise.appearanceCount, exercise.trend.required)
  }
  return trendStatusCopy(exercise.trend)
}

function ExerciseNotes({
  exercise,
  onEvidence,
}: {
  exercise: ProgressOverview['exercises'][number]
  onEvidence: (topic: EvidenceTopic) => void
}) {
  const bits: string[] = []
  if (exercise.recentPrs.length > 0) {
    bits.push(`${exercise.recentPrs.length} recent best${exercise.recentPrs.length === 1 ? '' : 's'}`)
  }
  if (exercise.frontier.length > 0) {
    bits.push('Frontier available')
  }
  if (exercise.performanceType === 'timed') {
    bits.push('No estimated 1RM')
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      {bits.length > 0 ? <span className="text-zinc-600">{bits.join(' · ')}</span> : <span className="text-zinc-400">—</span>}
      {exercise.recentPrs[0] ? (
        <button
          type="button"
          className="text-xs font-medium text-zinc-700 underline"
          onClick={() =>
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
          }
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
  onEvidence,
}: {
  exercise: ProgressOverview['exercises'][number]
  range: ProgressRange
  onEvidence: (topic: EvidenceTopic) => void
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link
            to={`/progress/strength/${exercise.exerciseId}${progressSearch(range)}`}
            className="font-medium hover:underline"
          >
            {exercise.name}
          </Link>
          <p className="mt-1 text-xs uppercase tracking-wide text-zinc-500">
            {performanceTypeLabel(exercise.performanceType)}
          </p>
        </div>
        {exercise.recentPrs.length > 0 ? (
          <span className="rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-medium text-zinc-700">Recent best</span>
        ) : null}
      </div>
      <p className="mt-3 text-lg font-semibold tracking-tight">{formatLatestPerformance(exercise.latestPerformance)}</p>
      <p className="mt-1 text-sm text-zinc-600">{trendCell(exercise)}</p>
      <p className="mt-1 text-sm text-zinc-500">
        {exercise.latestPerformance ? formatCalendarDate(exercise.latestPerformance.date) : 'Not performed yet'}
      </p>
      <div className="mt-3">
        <ExerciseNotes exercise={exercise} onEvidence={onEvidence} />
      </div>
    </div>
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

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/progress/strength${progressSearch(range)}`} className="text-sm text-zinc-600 hover:text-zinc-900">
          ← Strength
        </Link>
        <h2 className="mt-2 text-xl font-semibold tracking-tight">{exercise.name}</h2>
        <p className="mt-1 text-sm text-zinc-600">{performanceTypeLabel(exercise.performanceType)}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
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
              <p className="mt-1 text-sm text-zinc-600">{trendStatusCopy(exercise.trend)}</p>
            </>
          )}
        </div>
      </div>

      {!timed && exercise.estimatedStrengthHistory.length > 0 ? (
        <EstimatedStrengthChart
          points={exercise.estimatedStrengthHistory.map((point) => ({
            date: point.date,
            estimated1RmKg: point.estimated1RmKg,
            loadKg: point.loadKg,
            reps: point.reps,
          }))}
        />
      ) : null}

      {exercise.performedPoints.length > 0 ? (
        <PerformanceFrontierChart
          mode={mode}
          history={historyPoints}
          frontier={exercise.frontier}
        />
      ) : null}

      <section>
        <h3 className="text-sm font-semibold tracking-tight">Performance bests</h3>
        {exercise.recentPrs.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-600">
            {exercise.latestPerformance
              ? 'Current records are a baseline from the first appearance. Later improvements will appear here.'
              : 'No performance-best events yet.'}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {exercise.recentPrs.map((event) => (
              <li key={`${event.sourceSessionId}-${event.sourceSetId}`}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left hover:border-zinc-400"
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
                  <p className="font-medium">{formatPerformed(event.performed)}</p>
                  <p className="mt-1 text-sm text-zinc-600">
                    {event.achievements.map((item) => ACHIEVEMENT_LABELS[item]).join(' · ')}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">{formatCalendarDate(event.date)}</p>
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
