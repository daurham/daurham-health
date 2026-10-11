import type { CSSProperties } from 'react'
import type { TrainingPlanView } from '@/domain/training-plan'
import { creditedSessions } from '@/domain/training-blocks'

const HUES = ['var(--chart-ink)', 'var(--chart-secondary)', 'var(--chart-tertiary)'] as const

/** One theme-aware routine progress component for Today and Training. */
export function TrainingRotationPreview({ plan }: { plan: TrainingPlanView }) {
  const preview = plan.rotationPreview
  if (!preview) return null
  const rotation = preview.state
  return (
    <section aria-label="Routine rotation progress" className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3 sm:p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">Routine rotation</h3>
        <span className="rounded-full bg-accent-muted px-2 py-1 text-xs font-medium text-accent">Progress preview</span>
      </div>
      <div className="space-y-3">
        {rotation.routines.map((routine, index) => {
          const block = routine.activeBlock
          const count = creditedSessions(block)
          const done = block.status === 'completed'
          const ended = block.status === 'ended_early'
          const current = rotation.currentRoutineCode === routine.routineCode &&
            block.generation === rotation.cycle && block.status === 'active'
          const color = done ? 'var(--health-success)' : ended ? 'var(--health-warning)' : HUES[index % HUES.length]
          const style = { '--routine-tone': color } as CSSProperties
          const older = routine.blocks.filter((item) => item.generation !== block.generation && item.status === 'completed').length
          const label = done ? 'Completed' : ended ? 'Ended early' : current ? 'Current' :
            count ? block.generation > rotation.cycle ? 'Next cycle' : 'Working ahead' : 'Upcoming'
          const name = plan.baseline?.sequence.find((item) => item.routineCode === routine.routineCode)?.name ??
            routine.routineCode
          return (
            <div key={routine.routineCode} className="space-y-1.5" style={style}>
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold"
                    style={{ backgroundColor: 'color-mix(in srgb, var(--routine-tone) 15%, transparent)', color: 'var(--routine-tone)' }}>
                    {routine.routineCode.slice(0, 2).toUpperCase()}
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold text-zinc-900">{name}</span>
                  <span className="text-xs text-zinc-500">{label}</span>
                </div>
                <strong className="shrink-0 text-sm tabular-nums" style={{ color: 'var(--routine-tone)' }}>
                  {Math.min(count, block.target)}/{block.target}
                </strong>
              </div>
              <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${block.target}, minmax(0, 1fr))` }}
                role="progressbar" aria-valuemin={0} aria-valuemax={block.target}
                aria-valuenow={Math.min(count, block.target)} aria-label={name + ' ' + count + ' of ' + block.target + ', ' + label}>
                {Array.from({ length: block.target }, (_, n) => (
                  <span key={n} className="h-2.5 rounded-sm"
                    style={{ backgroundColor: n < count ? 'var(--routine-tone)' : 'var(--health-border)' }} />
                ))}
              </div>
              {older > 0 ? <p className="text-xs text-zinc-500">{older} earlier {older === 1 ? 'block' : 'blocks'} completed</p> : null}
            </div>
          )
        })}
      </div>
      <p className="text-xs leading-5 text-zinc-600">
        Preliminary since {preview.firstTrackedDate}. Earlier history and early-ended blocks need reconciliation
        before this becomes your official rotation progress.
      </p>
    </section>
  )
}
