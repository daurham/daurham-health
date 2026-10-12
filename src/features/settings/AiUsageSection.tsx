import { useCallback, useEffect, useState } from 'react'
import { healthFetch, readApiError, quietButtonClass } from '@/lib'

type UsageGroup = {
  requestType: string
  status: string
  requests: number
  budgetConsumedUsd: number
  tokenEstimateUsd: number
  inputTokens: number
  outputTokens: number
  missingTokenCounts: number
}

type UsageReport = {
  month: string
  budgetUsd: number
  budgetConsumedUsd: number
  remainingUsd: number
  tokenEstimateUsd: number
  uncertainUsd: number
  completedWithoutTokenCountsUsd: number
  recordedAboveTokenEstimateUsd: number
  calls: number
  groups: UsageGroup[]
}

const LABELS: Record<string, string> = {
  nutrition_description: 'Food descriptions',
  nutrition_meal_photo: 'Meal photos',
  nutrition_label: 'Nutrition labels',
  nutrition_recipe_assist: 'Recipe assistance',
  ask_health: 'Health AI',
  weekly_coach: 'Weekly Coach',
  experiment_suggestion: 'Experiment suggestions',
  literature_synthesis: 'Literature synthesis',
}

function label(key: string): string {
  return LABELS[key] ?? key.replace(/_/g, ' ')
}

function dollar(amount: number, precise = false): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: precise ? 4 : 2,
    maximumFractionDigits: precise ? 4 : 2,
  })
}

export function AiUsageSection() {
  const [report, setReport] = useState<UsageReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true)
    setError(null)
    try {
      const response = await healthFetch('/api/ai/usage', { signal })
      if (!response.ok) throw new Error(await readApiError(response))
      const next = await response.json() as UsageReport
      if (!signal?.aborted) setReport(next)
    } catch (caught) {
      if (!signal?.aborted) setError(caught instanceof Error ? caught.message : 'Unable to load AI usage')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  const fraction = report && report.budgetUsd > 0
    ? Math.min(100, (report.budgetConsumedUsd / report.budgetUsd) * 100)
    : 0
  const anomaly = (report?.recordedAboveTokenEstimateUsd ?? 0) > 0.05
  return (
    <section id="ai-usage" className="min-w-0 scroll-mt-6 space-y-4 rounded-xl border border-zinc-200 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">AI Usage</h2>
          <p className="mt-1 text-sm text-zinc-600">Monthly app allowance and requests, counted in UTC. Reading this panel never uses AI.</p>
        </div>
        <button type="button" className={quietButtonClass} disabled={loading} onClick={() => void load()}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
      {!report ? (
        <p className="text-sm text-zinc-500">{loading ? 'Loading usage…' : 'Usage is unavailable.'}</p>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-2xl font-semibold tabular-nums">{dollar(report.budgetConsumedUsd)} <span className="text-sm font-normal text-zinc-500">/ {dollar(report.budgetUsd)}</span></p>
              <p className="text-xs font-medium text-zinc-600">{report.month} · {report.calls} attempts</p>
            </div>
            <div role="progressbar" aria-label="AI monthly budget" aria-valuemin={0} aria-valuemax={report.budgetUsd} aria-valuenow={Math.min(report.budgetConsumedUsd, report.budgetUsd)}
              className="h-2.5 overflow-hidden rounded-full bg-zinc-100">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${fraction}%` }} />
            </div>
            <p className="text-xs text-zinc-500">{dollar(report.remainingUsd)} remaining under your app's configured cap</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-zinc-50 px-3 py-3">
              <p className="text-xs text-zinc-500">Recorded allowance</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{dollar(report.budgetConsumedUsd)}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 px-3 py-3">
              <p className="text-xs text-zinc-500">Token-priced estimate</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{dollar(report.tokenEstimateUsd, true)}</p>
            </div>
            <div className="rounded-lg bg-zinc-50 px-3 py-3">
              <p className="text-xs text-zinc-500">Uncertain / reserved</p>
              <p className="mt-1 text-lg font-semibold tabular-nums">{dollar(report.uncertainUsd)}</p>
            </div>
          </div>
          {anomaly ? (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm leading-5 text-amber-950">
              Possible accounting discrepancy: {dollar(report.recordedAboveTokenEstimateUsd)} in recorded completed usage exceeds what the available tokens imply under the app's fixed pricing formula. Review the ledger before raising the cap.
            </p>
          ) : null}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Requests by feature</h3>
            {report.groups.length === 0 ? <p className="text-sm text-zinc-500">No AI attempts this month.</p> : (
              <ul className="divide-y divide-zinc-100">
                {report.groups.map((group) => (
                  <li key={group.requestType + ':' + group.status} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <div>
                      <p className="font-medium text-zinc-900">{label(group.requestType)}</p>
                      <p className="text-xs text-zinc-500">{group.status} · {group.requests} calls · {(group.inputTokens + group.outputTokens).toLocaleString('en-US')} reported tokens</p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium tabular-nums">{dollar(group.budgetConsumedUsd)}</p>
                      {group.status === 'completed' ? <p className="text-xs text-zinc-500">Token estimate {dollar(group.tokenEstimateUsd, true)}</p> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <p className="text-xs leading-5 text-zinc-500">
            Estimates use the app's hardcoded token prices, not Google's invoice. Thinking tokens and missing usage metadata may make estimates low.
            Completed calls lacking token counts account for {dollar(report.completedWithoutTokenCountsUsd)} of the recorded allowance.
            This display is read-only and never changes spending limits or ledger entries.
          </p>
        </>
      )}
    </section>
  )
}
