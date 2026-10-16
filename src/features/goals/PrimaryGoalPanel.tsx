import { useEffect, useState } from 'react'
import { fetchPrimaryGoalIntent, savePrimaryGoalIntent, type GoalView } from './api'
import type { PrimaryGoalIntent } from '@/domain/primary-goal-intent'
import { primaryButtonClass } from '@/lib'

export function PrimaryGoalPanel({ goals }: { goals: readonly GoalView[] }) {
  const [saved, setSaved] = useState<PrimaryGoalIntent | null>(null)
  const [choice, setChoice] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const active = goals.filter((goal) => goal.status === 'active' && !goal.selectorContext.archived)
  const options = saved?.primaryGoalId && !active.some((goal) => goal.id === saved.primaryGoalId)
    ? [{ id: saved.primaryGoalId, displayName: 'Unavailable historical goal', status: 'active' }, ...active] : active

  async function refresh() {
    setPending(true)
    setError(null)
    try {
      const next = await fetchPrimaryGoalIntent()
      setSaved(next)
      setChoice(next.primaryGoalId ?? '')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load primary goal')
    } finally {
      setPending(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function submit() {
    if (!saved || pending) return
    setPending(true)
    setError(null)
    setNotice(null)
    try {
      const next = await savePrimaryGoalIntent({
        primaryGoalId: choice || null,
        expectedVersion: saved.version,
      })
      setSaved(next)
      setChoice(next.primaryGoalId ?? '')
      setNotice('Primary goal preference saved. No targets or Coach actions were changed.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save primary goal')
    } finally {
      setPending(false)
    }
  }

  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4" aria-label="Primary goal preference">
      <h2 className="font-semibold">Primary goal</h2>
      <p className="mt-1 text-sm text-zinc-600">Choose which saved active goal matters most right now. Other goals remain active. This records your priority, but does not yet change Coach advice or targets.</p>
      <label className="mt-3 block text-sm font-medium" htmlFor="primary-goal-choice">Owner-selected priority</label>
      <select id="primary-goal-choice" className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm"
        disabled={!saved || pending} value={choice} onChange={(e) => { setChoice(e.target.value); setNotice(null) }}>
        <option value="">No primary goal selected</option>
        {options.map((goal) => <option key={goal.id} value={goal.id}>{goal.displayName}</option>)}
      </select>
      {saved?.source === 'owner' ? <p className="mt-2 text-xs text-zinc-500">Owner selection effective {saved.effectiveFrom}. Version {saved.version}.</p> : null}
      <button className={primaryButtonClass + ' mt-3'} type="button" disabled={!saved || pending || choice === (saved.primaryGoalId ?? '')}
        onClick={() => void submit()}>{pending ? 'Updating…' : 'Save priority'}</button>
      {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error} <button type="button" className="underline" onClick={() => void refresh()}>Refresh</button></p> : null}
      {notice ? <p role="status" className="mt-2 text-sm text-zinc-600">{notice}</p> : null}
    </section>
  )
}
