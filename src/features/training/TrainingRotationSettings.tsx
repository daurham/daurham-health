import { useState } from 'react'
import type { TrainingPlanView } from '@/domain/training-plan'
import { compactRoutineSequence } from '@/domain/training-plan'
import { creditedSessions } from '@/domain/training-blocks'
import { primaryButtonClass, quietButtonClass } from '@/lib'
import { useDemoReadOnly } from '@/lib/app-prefix'
import { HealthDateField } from '@/components/HealthDateField'
import { confirmRotationAnchor, endRotationBlock, reopenRotationBlock } from './api'

export function TrainingRotationSettings({
  plan, onChanged, busy,
}: {
  plan: TrainingPlanView
  onChanged: (next: TrainingPlanView) => void
  busy: boolean
}) {
  const readOnly = useDemoReadOnly()
  const specs = compactRoutineSequence(plan.baseline?.sequence.map((s) => s.routineCode) ?? [])
  const [anchorDate, setAnchorDate] = useState(plan.baseline?.effectiveFrom ?? plan.asOf)
  const [routine, setRoutine] = useState(plan.rotation?.state.currentRoutineCode ??
    plan.rotationPreview?.state.currentRoutineCode ?? specs[0]?.routineCode ?? '')
  const [completed, setCompleted] = useState(0)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const maxCount = Math.max(0, (specs.find((spec) => spec.routineCode === routine)?.count ?? 1) - 1)

  async function submit(action: () => Promise<TrainingPlanView>) {
    if (saving || busy || readOnly) return
    setSaving(true)
    setError(null)
    setMessage(null)
    try {
      const next = await action()
      onChanged(next)
      setMessage('Rotation updated from canonical workout history.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update rotation.')
    } finally {
      setSaving(false)
    }
  }

  const state = plan.rotation?.state
  const current = state?.routines.find((item) => item.routineCode === state.currentRoutineCode)
  const canEnd = current?.activeBlock.status === 'active' &&
    creditedSessions(current.activeBlock) < current.activeBlock.target
  const ended = state?.routines.flatMap((item) =>
    item.blocks.filter((block) => block.status === 'ended_early')
      .map((block) => ({ routine: item.routineCode, generation: block.generation,
        count: creditedSessions(block), target: block.target }))) ?? []

  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4">
      <div>
        <h2 className="font-semibold">Rotation history</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Confirm where your rotation started so pre-plan workouts count accurately.
          Your original workout logs remain unchanged.
        </p>
      </div>
      <details className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
        <summary className="cursor-pointer text-sm font-medium text-accent">
          {plan.rotation ? 'Review or adjust starting history' : 'Confirm starting history'}
        </summary>
        <div className="mt-3 space-y-3">
          <p className="text-xs text-zinc-600">
            Starting credits means how many sessions you had finished BEFORE the selected date.
            Qualifying recorded routine days on and after that date are added automatically.
          </p>
          <HealthDateField date={anchorDate} max={plan.baseline?.effectiveFrom ?? plan.asOf}
            onDateChange={setAnchorDate} />
          <label className="block text-sm font-medium text-zinc-700">
            Routine at that starting point
            <select value={routine} onChange={(e) => { setRoutine(e.target.value); setCompleted(0) }}
              className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base">
              {specs.map((spec) => <option key={spec.routineCode} value={spec.routineCode}>{spec.routineCode}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-zinc-700">
            Sessions completed before selected date (0–{maxCount})
            <input type="number" min={0} max={maxCount} value={completed}
              onChange={(e) => setCompleted(Math.max(0, Math.min(maxCount, Number(e.target.value) || 0)))}
              className="mt-1 block min-h-11 w-24 rounded-lg border border-zinc-300 bg-white px-3 text-base" />
          </label>
          <button type="button" className={primaryButtonClass} disabled={busy || saving || readOnly}
            onClick={() => void submit(() => confirmRotationAnchor({
              anchorDate, currentRoutineCode: routine, completedAtAnchor: completed,
            }))}>
            {saving ? 'Saving…' : plan.rotation ? 'Update starting history' : 'Confirm rotation history'}
          </button>
        </div>
      </details>
      {canEnd && current ? (
        <div className="space-y-2 rounded-lg border border-warning/25 p-3">
          <p className="text-sm font-medium text-zinc-800">
            Finish {current.routineCode} early at {creditedSessions(current.activeBlock)}/{current.activeBlock.target}
          </p>
          <p className="text-xs text-zinc-600">This closes the block without creating missing workouts.</p>
          <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (optional)" className="min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 text-base" />
          <button type="button" className={quietButtonClass} disabled={saving || busy || readOnly}
            onClick={() => {
              if (window.confirm('End this routine block early without adding workouts?')) {
                void submit(() => endRotationBlock(reason.trim() || null))
              }
            }}>Finish block early</button>
        </div>
      ) : null}
      {ended.map((block) => (
        <div key={block.routine + '-' + block.generation} className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>{block.routine}: ended early at {block.count}/{block.target}</span>
          <button type="button" className={quietButtonClass} disabled={saving || busy}
            onClick={() => void submit(() => reopenRotationBlock(block.routine, block.generation))}>
            Reopen block
          </button>
        </div>
      ))}
      {message ? <p className="text-sm text-success" role="status">{message}</p> : null}
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
    </section>
  )
}
