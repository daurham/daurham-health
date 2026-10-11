import type { CSSProperties } from 'react'
import type { TrainingPlanView } from '@/domain/training-plan'
import { creditedSessions } from '@/domain/training-blocks'

// Palette-derived colors stay stable per routine, including completed blocks.
// Completion and early endings are conveyed separately, never by color alone.
const ROUTINE_COLORS = [
  'var(--chart-ink)',
  'var(--chart-secondary)',
  'var(--chart-tertiary)',
] as const

/** Reused on Training overview and Training Plan, at narrow phone widths too. */
export function TrainingRotationPreview({ plan }: { plan: TrainingPlanView }) {
  const progress = plan.rotation ?? plan.rotationPreview
  if (!progress) return null
  const { state } = progress

  return (
    <section aria-label="Routine rotation progress"
      className="min-w-0 space-y-3 overflow-hidden rounded-xl border border-zinc-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-zinc-900">Routine rotation</h3>
          <p className="mt-0.5 text-xs text-zinc-500">Cycle {state.cycle} · Each routine progresses independently</p>
        </div>
        <span className="shrink-0 rounded-full bg-accent-muted px-2 py-1 text-xs font-medium text-accent">
          {plan.rotation ? 'History confirmed' : 'Progress preview'}
        </span>
      </div>

      <div className="space-y-2">
        {state.routines.map((routine, index) => {
          const block = routine.activeBlock
          const count = creditedSessions(block)
          const current = state.currentRoutineCode === routine.routineCode &&
            block.generation === state.cycle && block.status === 'active'
          const older = routine.blocks.filter((previous) =>
            previous.generation < block.generation &&
            (previous.status === 'completed' || previous.status === 'ended_early'))
          const lastClosed = older[older.length - 1] ?? null
          const isAhead = !current && block.status === 'active' && count > 0
          const label = block.status === 'completed' ? 'Completed'
            : block.status === 'ended_early' ? 'Ended early'
              : current ? 'Current'
                : isAhead ? 'Working ahead'
                  : lastClosed ? 'Next block' : 'Upcoming'
          const tone = ROUTINE_COLORS[index % ROUTINE_COLORS.length]
          const style = {
            '--routine-tone': tone,
            borderColor: current
              ? 'color-mix(in srgb, var(--routine-tone) 55%, var(--health-border))'
              : 'var(--health-border)',
            background: current
              ? 'color-mix(in srgb, var(--routine-tone) 6%, var(--health-surface))'
              : 'var(--health-surface)',
          } as CSSProperties
          const name = plan.baseline?.sequence.find((item) =>
            item.routineCode === routine.routineCode)?.name ?? routine.routineCode

          return (
            <div key={routine.routineCode}
              className="min-w-0 space-y-2 rounded-lg border p-3"
              style={style}>
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg border text-xs font-bold"
                    style={{
                      backgroundColor: 'color-mix(in srgb, var(--routine-tone) 13%, var(--health-surface))',
                      borderColor: 'color-mix(in srgb, var(--routine-tone) 35%, var(--health-border))',
                      color: 'var(--health-text)',
                    }}>
                    {routine.routineCode.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-semibold leading-5 text-zinc-900">{name}</p>
                    <p className="text-xs text-zinc-600">
                      Block {block.generation} · <span className="font-medium">{label}</span>
                    </p>
                  </div>
                </div>
                <strong className="shrink-0 text-sm font-bold tabular-nums text-zinc-900">
                  {Math.min(count, block.target)}<span className="font-normal text-zinc-500">/{block.target}</span>
                </strong>
              </div>
              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${block.target}, minmax(0, 1fr))` }}
                role="progressbar" aria-valuemin={0} aria-valuemax={block.target}
                aria-valuenow={Math.min(count, block.target)}
                aria-label={`${name}, block ${block.generation}: ${count} of ${block.target}, ${label}`}>
                {Array.from({ length: block.target }, (_, step) => (
                  <span key={step} aria-hidden="true" className="h-2.5 min-w-0 rounded-sm"
                    style={{
                      backgroundColor: step < count ? 'var(--routine-tone)' : 'var(--health-border-strong)',
                    }} />
                ))}
              </div>
              {lastClosed ? (
                <p className="text-xs text-zinc-600">
                  Previous block: {creditedSessions(lastClosed)}/{lastClosed.target} · {
                    lastClosed.status === 'completed' ? 'Completed' : 'Ended early'
                  }
                </p>
              ) : null}
            </div>
          )
        })}
      </div>

      {state.conflicts.length > 0 ? (
        <p role="status" className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-zinc-800">
          {state.conflicts.length} historical rotation {
            state.conflicts.length === 1 ? 'decision needs' : 'decisions need'
          } review in Training Plan.
        </p>
      ) : null}
      <p className="text-xs leading-5 text-zinc-600">
        {plan.rotation
          ? `Based on confirmed history since ${plan.rotation.anchorDate}. Editing older workouts recalculates progress.`
          : `Preview since ${plan.rotationPreview?.firstTrackedDate ?? 'plan setup'}. Confirm earlier history in Training Plan to make this official.`}
      </p>
    </section>
  )
}
