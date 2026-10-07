import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { DAILY_PARTICIPATION_MAX_XP, DAILY_PARTICIPATION_XP, type RewardItem, type RewardItemInput, type RewardsState } from '@/domain/rewards'
import { progressionState } from '@/domain/progression'
import { themePack } from '@/theme'
import { XpAmount } from '@/components/XpAmount'
import {
  primaryButtonClass,
  quietButtonClass,
  secondaryButtonClass,
} from '@/lib'
import {
  archiveReward,
  createReward,
  fetchRewards,
  purchaseReward,
  refundPurchase,
  updateReward,
} from './api'

type RewardDraft = {
  name: string
  costXp: string
  note: string
}

const EMPTY_DRAFT: RewardDraft = { name: '', costXp: '', note: '' }

function formatInstant(value: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function inputFromDraft(draft: RewardDraft): RewardItemInput | null {
  const costXp = Number(draft.costXp)
  if (!draft.name.trim() || !Number.isInteger(costXp) || costXp <= 0) return null
  return {
    name: draft.name.trim(),
    costXp,
    note: draft.note.trim() || null,
  }
}

export function RewardsPage() {
  const [state, setState] = useState<RewardsState | null>(null)
  const [loading, setLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [draft, setDraft] = useState<RewardDraft>(EMPTY_DRAFT)
  const [editing, setEditing] = useState<string | null>(null)
  const [confirmPurchaseId, setConfirmPurchaseId] = useState<string | null>(null)
  const [confirmRefundId, setConfirmRefundId] = useState<string | null>(null)
  const [celebration, setCelebration] = useState<{ text: string; amount: number } | null>(null)
  const celebrationTimer = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchRewards()
      .then((next) => {
        if (!cancelled) setState(next)
      })
      .catch((caught: unknown) => {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load rewards')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => () => {
    if (celebrationTimer.current != null) window.clearTimeout(celebrationTimer.current)
  }, [])

  function celebrate(text: string, amount: number) {
    setCelebration({ text, amount })
    if (celebrationTimer.current != null) window.clearTimeout(celebrationTimer.current)
    celebrationTimer.current = window.setTimeout(() => setCelebration(null), 2800)
  }

  async function mutate(operation: () => Promise<RewardsState>) {
    setPending(true)
    setError(null)
    try {
      setState(await operation())
      return true
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update rewards')
      return false
    } finally {
      setPending(false)
    }
  }

  async function saveNew(event: FormEvent) {
    event.preventDefault()
    const input = inputFromDraft(draft)
    if (!input) {
      setError('Enter a reward name and a positive whole-number XP cost.')
      return
    }
    if (await mutate(() => createReward(input))) {
      setDraft(EMPTY_DRAFT)
      setAddOpen(false)
    }
  }

  function beginEdit(item: RewardItem) {
    setEditing(item.id)
    setDraft({ name: item.name, costXp: String(item.costXp), note: item.note ?? '' })
    setAddOpen(false)
    setError(null)
  }

  async function saveEdit(event: FormEvent, id: string) {
    event.preventDefault()
    const input = inputFromDraft(draft)
    if (!input) {
      setError('Enter a reward name and a positive whole-number XP cost.')
      return
    }
    if (await mutate(() => updateReward(id, input))) {
      setEditing(null)
      setDraft(EMPTY_DRAFT)
    }
  }

  async function buy(item: RewardItem) {
    const submissionId = globalThis.crypto.randomUUID()
    if (await mutate(() => purchaseReward(item.id, submissionId))) {
      setConfirmPurchaseId(null)
      celebrate('Reward redeemed', -item.costXp)
    }
  }

  async function refund(id: string) {
    const purchase = state?.purchases.find((item) => item.id === id) ?? null
    if (await mutate(() => refundPurchase(id))) {
      setConfirmRefundId(null)
      if (purchase) celebrate('XP returned', purchase.costXp)
    }
  }

  if (loading && !state) {
    return <p className="text-sm text-zinc-600">Loading rewards…</p>
  }

  if (!state) {
    return (
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
        <p className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error ?? 'Rewards are unavailable.'}
        </p>
      </section>
    )
  }

  const { spendableXp, lifetimeXp } = state.balances
  const progression = progressionState(lifetimeXp)
  const nextTheme = progression.nextThemeUnlock ? themePack(progression.nextThemeUnlock.id) : null

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Rewards</h1>
        <p className="mt-2 text-zinc-600">
          Coach challenges and bounded daily participation earn XP. Spend it on rewards you define without changing lifetime progress.
        </p>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          {error}
        </p>
      ) : null}

      {celebration ? (
        <div className="reward-celebration flex items-center justify-between gap-3 rounded-xl border border-reward/30 bg-reward-muted px-4 py-3" role="status" aria-live="polite">
          <span className="text-sm font-semibold text-zinc-900">{celebration.text}</span>
          <XpAmount amount={celebration.amount} sign />
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[0.9fr_1.1fr]" aria-label="XP wallet">
        <div className="health-hero-surface health-raised-surface rounded-xl border border-zinc-200 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Spendable</p>
          <div className="mt-1">
            <XpAmount amount={spendableXp} badge={false} className="text-3xl tracking-tight" label={spendableXp + ' spendable XP'} />
          </div>
          <p className="mt-1 text-sm text-zinc-500">Use this on rewards. Redemptions never reduce your level.</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Lifetime progression</p>
              <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Level {progression.level}</p>
            </div>
            <XpAmount amount={lifetimeXp} label={lifetimeXp + ' lifetime XP'} />
          </div>
          <div
            className="mt-4 h-2 overflow-hidden rounded-full bg-zinc-100"
            role="progressbar"
            aria-label={'Level ' + progression.level + ' progress'}
            aria-valuemin={progression.levelFloorXp}
            aria-valuemax={progression.nextLevelXp}
            aria-valuenow={lifetimeXp}
          >
            <div className="progression-meter h-full rounded-full bg-accent" style={{ width: progression.progressPct + '%' }} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
            <span>{progression.xpNeededForNextLevel.toLocaleString('en-US')} XP to Level {progression.level + 1}</span>
            {nextTheme ? <span>Next theme · {nextTheme.label}</span> : <span>All current themes unlocked</span>}
          </div>
          <Link to="/settings#theme-studio" className={quietButtonClass}>Open Theme Studio</Link>
        </div>
      </div>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5" aria-labelledby="xp-earning-heading">
        <h2 id="xp-earning-heading" className="text-lg font-semibold tracking-tight">How participation XP works</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Logging is rewarded for participation, not for producing a “good” health result. One Health day can earn at most {DAILY_PARTICIPATION_MAX_XP} participation XP.
        </p>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <p><span className="font-medium">Water</span> · {DAILY_PARTICIPATION_XP.hydration} XP for the first valid water log.</p>
          <p><span className="font-medium">Bowel</span> · {DAILY_PARTICIPATION_XP.bowel} XP for tracking the day once.</p>
          <p><span className="font-medium">Daily ratings</span> · {DAILY_PARTICIPATION_XP.wellness} XP for saving at least one rating.</p>
          <p><span className="font-medium">Supplements</span> · {DAILY_PARTICIPATION_XP.supplements} XP when every scheduled dose is recorded, including honest skips.</p>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Today and yesterday can earn participation XP. Older backlogs still save as Health history but do not mint XP. Multiple glasses, bowel events, or edits never stack extra XP. 100 XP = $1 in the personal reward budget.
        </p>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5" aria-labelledby="reward-shop-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="reward-shop-heading" className="text-lg font-semibold tracking-tight">Reward shop</h2>
            <p className="mt-1 text-sm text-zinc-500">Your catalog. Prices apply when you redeem.</p>
          </div>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={pending}
            onClick={() => {
              setEditing(null)
              setDraft(EMPTY_DRAFT)
              setAddOpen((value) => !value)
              setError(null)
            }}
          >
            {addOpen ? 'Cancel' : 'Add reward'}
          </button>
        </div>

        {addOpen ? (
          <RewardForm draft={draft} setDraft={setDraft} pending={pending} submitLabel="Add reward" onSubmit={saveNew} />
        ) : null}

        {state.items.length === 0 && !addOpen ? (
          <p className="mt-5 text-sm text-zinc-600">No rewards yet. Add something you would genuinely enjoy earning.</p>
        ) : (
          <ul className="mt-5 divide-y divide-zinc-100">
            {state.items.map((item) => {
              const affordable = spendableXp >= item.costXp
              const shortBy = Math.max(0, item.costXp - spendableXp)
              if (editing === item.id) {
                return (
                  <li key={item.id} className="py-4">
                    <RewardForm
                      draft={draft}
                      setDraft={setDraft}
                      pending={pending}
                      submitLabel="Save changes"
                      onSubmit={(event) => void saveEdit(event, item.id)}
                      onCancel={() => {
                        setEditing(null)
                        setDraft(EMPTY_DRAFT)
                      }}
                    />
                  </li>
                )
              }
              return (
                <li key={item.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <h3 className="font-semibold text-zinc-900">{item.name}</h3>
                        <XpAmount amount={item.costXp} />
                      </div>
                      {item.note ? <p className="mt-1 text-sm text-zinc-600">{item.note}</p> : null}
                      {!affordable ? <p className="mt-1 text-xs text-zinc-500">Need {shortBy.toLocaleString('en-US')} more XP</p> : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {confirmPurchaseId === item.id ? (
                        <>
                          <button type="button" className={primaryButtonClass} disabled={pending || !affordable} onClick={() => void buy(item)}>
                            {pending ? 'Redeeming…' : `Spend ${item.costXp.toLocaleString('en-US')} XP`}
                          </button>
                          <button type="button" className={quietButtonClass} disabled={pending} onClick={() => setConfirmPurchaseId(null)}>Cancel</button>
                        </>
                      ) : (
                        <button type="button" className={primaryButtonClass} disabled={pending || !affordable} onClick={() => setConfirmPurchaseId(item.id)}>
                          Redeem
                        </button>
                      )}
                      <button type="button" className={quietButtonClass} disabled={pending} onClick={() => beginEdit(item)}>Edit</button>
                      <button
                        type="button"
                        className={quietButtonClass}
                        disabled={pending}
                        onClick={() => {
                          if (globalThis.confirm(`Archive “${item.name}”? Existing purchase history will stay intact.`)) {
                            void mutate(() => archiveReward(item.id))
                          }
                        }}
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5" aria-labelledby="purchase-history-heading">
        <h2 id="purchase-history-heading" className="text-lg font-semibold tracking-tight">Recent redemptions</h2>
        {state.purchases.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">No rewards redeemed yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {state.purchases.map((purchase) => (
              <li key={purchase.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{purchase.rewardName}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {purchase.costXp.toLocaleString('en-US')} XP · {formatInstant(purchase.purchasedAt)}
                    {purchase.refunded ? ' · Refunded' : ''}
                  </p>
                </div>
                {!purchase.refunded ? (
                  confirmRefundId === purchase.id ? (
                    <div className="flex gap-2">
                      <button type="button" className={secondaryButtonClass} disabled={pending} onClick={() => void refund(purchase.id)}>
                        {pending ? 'Refunding…' : `Return ${purchase.costXp.toLocaleString('en-US')} XP`}
                      </button>
                      <button type="button" className={quietButtonClass} disabled={pending} onClick={() => setConfirmRefundId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <button type="button" className={quietButtonClass} disabled={pending} onClick={() => setConfirmRefundId(purchase.id)}>Refund</button>
                  )
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 sm:p-5" aria-labelledby="xp-activity-heading">
        <h2 id="xp-activity-heading" className="text-lg font-semibold tracking-tight">XP activity</h2>
        {state.activity.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-600">Complete a Coach task to earn your first XP.</p>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {state.activity.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{entry.label}</p>
                  <p className="mt-0.5 text-xs text-zinc-500">{formatInstant(entry.occurredAt)}</p>
                </div>
                <XpAmount amount={entry.signedAmountXp} sign badge={false} className="shrink-0 text-sm" />
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  )
}

function RewardForm({
  draft,
  setDraft,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  draft: RewardDraft
  setDraft: (draft: RewardDraft) => void
  pending: boolean
  submitLabel: string
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  onCancel?: () => void
}) {
  return (
    <form className="mt-4 grid gap-3 rounded-lg bg-zinc-50 p-3" onSubmit={onSubmit}>
      <label>
        <span className="text-sm font-medium text-zinc-800">Reward</span>
        <input
          autoFocus
          type="text"
          maxLength={120}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base"
          placeholder="Takeout night"
        />
      </label>
      <label>
        <span className="text-sm font-medium text-zinc-800">XP cost</span>
        <input
          type="number"
          min="1"
          step="1"
          value={draft.costXp}
          onChange={(event) => setDraft({ ...draft, costXp: event.target.value })}
          className="mt-1 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-base"
          placeholder="300"
        />
      </label>
      <label>
        <span className="text-sm font-medium text-zinc-800">Note (optional)</span>
        <textarea
          rows={2}
          maxLength={500}
          value={draft.note}
          onChange={(event) => setDraft({ ...draft, note: event.target.value })}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-base"
          placeholder="Any rules you want to remember"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={primaryButtonClass} disabled={pending}>{pending ? 'Saving…' : submitLabel}</button>
        {onCancel ? <button type="button" className={quietButtonClass} disabled={pending} onClick={onCancel}>Cancel</button> : null}
      </div>
    </form>
  )
}
