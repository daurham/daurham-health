import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { SleepStageAnalytics, SleepStageNightPoint } from '@/domain/sleep'
import { usePrefersReducedMotion } from '@/lib'
import { formatSleepDuration } from './activity-sleep-copy'
import { formatCalendarDate } from './format'

const STAGE_COLORS = {
  rem: '#6366f1',
  core: '#0284c7',
  deep: '#1e3a8a',
  unspecified: '#a1a1aa',
} as const

function formatPct(value: number): string {
  return `${(Math.round(value * 10) / 10).toFixed(1)}%`
}

function formatPoints(value: number): string {
  const rounded = Math.round(value * 10) / 10
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded.toFixed(1)} percentage points`
}

function formatMinuteDelta(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded} min/night`
}

function direction(value: number): string {
  const rounded = Math.round(value * 10) / 10
  if (rounded > 0) {
    return 'higher'
  }
  if (rounded < 0) {
    return 'lower'
  }
  return 'unchanged'
}

function StageChart({ points, nightPath }: { points: SleepStageNightPoint[]; nightPath: (date: string) => string }) {
  const chartMotion = !usePrefersReducedMotion()
  const navigate = useNavigate()
  if (points.length === 0) {
    return null
  }
  const width = Math.max(36, points.length * 1.75)
  return (
    <div className="mt-4 overflow-x-auto">
      <div className="h-52" style={{ minWidth: `${width}rem` }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={points}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            onClick={(state) => {
              const labeled = typeof state.activeLabel === 'string' ? points.find((point) => point.sleepDate === state.activeLabel) : undefined
              const index = typeof state.activeTooltipIndex === 'number' ? state.activeTooltipIndex : null
              const point = labeled ?? (index == null ? undefined : points[index])
              if (point) {
                navigate(nightPath(point.sleepDate))
              }
            }}
          >
            <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" />
            <XAxis dataKey="sleepDate" tickFormatter={formatCalendarDate} minTickGap={24} tick={{ fill: 'var(--chart-muted)', fontSize: 11 }} />
            <YAxis width={36} domain={[0, 100]} ticks={[0, 50, 100]} allowDecimals={false} tick={{ fill: 'var(--chart-muted)', fontSize: 11 }} />
            <Tooltip
              content={({ payload }) => {
                const item = payload?.[0]?.payload as SleepStageNightPoint | undefined
                if (!item) {
                  return null
                }
                return (
                  <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 shadow-sm">
                    <p>
                      {formatCalendarDate(item.sleepDate)} · {item.sourceName}
                    </p>
                    <p className="mt-1">{formatSleepDuration(item.totalSleepMinutes)} sleep</p>
                    <p>REM {formatPct(item.remPct)}</p>
                    <p>Core {formatPct(item.corePct)}</p>
                    <p>Deep {formatPct(item.deepPct)}</p>
                    <p>Unspecified {formatPct(item.unspecifiedPct)}</p>
                    <p className="mt-1">View night</p>
                  </div>
                )
              }}
            />
            <Bar dataKey="remPct" stackId="stage" fill={STAGE_COLORS.rem} name="REM" isAnimationActive={chartMotion} />
            <Bar dataKey="corePct" stackId="stage" fill={STAGE_COLORS.core} name="Core" isAnimationActive={chartMotion} />
            <Bar dataKey="deepPct" stackId="stage" fill={STAGE_COLORS.deep} name="Deep" isAnimationActive={chartMotion} />
            <Bar dataKey="unspecifiedPct" stackId="stage" fill={STAGE_COLORS.unspecified} name="Unspecified" isAnimationActive={chartMotion} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

export function SleepStageSection({ analytics, nightPath }: { analytics: SleepStageAnalytics; nightPath: (date: string) => string }) {
  const { coverage, composition, recentComparison } = analytics
  useEffect(() => {
    if (window.location.hash === '#stage-analytics') {
      document.getElementById('stage-analytics')?.scrollIntoView({ block: 'start' })
    }
  }, [])
  const qualifiedLabel = `${coverage.stageEligibleNights} stage-qualified night${coverage.stageEligibleNights === 1 ? '' : 's'}`
  return (
    <section id="stage-analytics" className="min-w-0 rounded-lg border border-zinc-200 bg-white p-3 md:p-4">
      <h3 className="text-sm font-semibold tracking-tight">Stage composition</h3>
      <p className="mt-1 text-sm text-zinc-600">
        {coverage.stageEligibleNights} of {coverage.analysisEligibleNights} complete nights have stage detail.
        {coverage.stageEligibilityPct != null ? ` ${formatPct(coverage.stageEligibilityPct)} of complete nights.` : ''}
      </p>
      {coverage.stageEligibleNights === 0 ? (
        <div className="mt-3 text-sm text-zinc-700">
          <p>No stage-qualified nights in this range.</p>
          <p className="mt-1 text-zinc-600">Sleep duration can still be available even when stage detail is incomplete.</p>
        </div>
      ) : null}
      {coverage.stageEligibleNights > 0 && coverage.stageEligibleNights < 3 ? (
        <p className="mt-3 text-sm text-zinc-700">
          {qualifiedLabel}. More nights are needed for a period Stage Composition summary.
        </p>
      ) : null}
      {composition ? (
        <ul className="mt-3 space-y-1 text-sm text-zinc-800">
          <li>Core {formatSleepDuration(composition.coreMinutesAvg)} avg · {formatPct(composition.corePct)}</li>
          <li>REM {formatSleepDuration(composition.remMinutesAvg)} avg · {formatPct(composition.remPct)}</li>
          <li>Deep {formatSleepDuration(composition.deepMinutesAvg)} avg · {formatPct(composition.deepPct)}</li>
          <li>Unspecified {formatSleepDuration(composition.unspecifiedMinutesAvg)} avg · {formatPct(composition.unspecifiedPct)}</li>
        </ul>
      ) : null}
      <StageChart points={analytics.nightlySeries} nightPath={nightPath} />
      <ul className="mt-2 flex flex-wrap gap-3 text-xs text-zinc-600">
        <li>REM</li>
        <li>Core</li>
        <li>Deep</li>
        <li>Unspecified</li>
      </ul>
      {analytics.sourceBreakdown.length > 0 ? (
        <div className="mt-4 text-sm text-zinc-700">
          <p className="font-medium text-zinc-800">{analytics.sourceBreakdown.length > 1 ? 'Mixed sleep sources in this range' : 'Source'}</p>
          <ul className="mt-1 space-y-1">
            {analytics.sourceBreakdown.map((source) => (
              <li key={source.sourceFamily}>
                {source.sourceName} · {source.stageEligibleNights} night{source.stageEligibleNights === 1 ? '' : 's'}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {recentComparison.state === 'available' ? (
        <div className="mt-4 text-sm text-zinc-800">
          <p className="font-medium">Recent 7 days vs previous 7</p>
          <ul className="mt-1 space-y-1">
            <li>
              REM {formatPoints(recentComparison.remPercentagePoints ?? 0)} · {direction(recentComparison.remPercentagePoints ?? 0)} · {formatMinuteDelta(recentComparison.remMinutesDelta ?? 0)}
            </li>
            <li>
              Core {formatPoints(recentComparison.corePercentagePoints ?? 0)} · {direction(recentComparison.corePercentagePoints ?? 0)} · {formatMinuteDelta(recentComparison.coreMinutesDelta ?? 0)}
            </li>
            <li>
              Deep {formatPoints(recentComparison.deepPercentagePoints ?? 0)} · {direction(recentComparison.deepPercentagePoints ?? 0)} · {formatMinuteDelta(recentComparison.deepMinutesDelta ?? 0)}
            </li>
            <li>
              Unspecified {formatPoints(recentComparison.unspecifiedPercentagePoints ?? 0)} · {direction(recentComparison.unspecifiedPercentagePoints ?? 0)} · {formatMinuteDelta(recentComparison.unspecifiedMinutesDelta ?? 0)}
            </li>
          </ul>
          <p className="mt-1 text-zinc-600">
            {recentComparison.currentStageEligibleNights} vs {recentComparison.previousStageEligibleNights} stage-qualified nights
            {recentComparison.sourceName ? ` · ${recentComparison.sourceName}` : ''}
          </p>
        </div>
      ) : null}
      {recentComparison.state === 'source_changed' ? (
        <p className="mt-4 text-sm text-zinc-700">
          Recent stage comparison unavailable. The selected sleep source changed between these periods.
        </p>
      ) : null}
      {recentComparison.state === 'source_mixed' ? (
        <p className="mt-4 text-sm text-zinc-700">
          Recent stage comparison unavailable. These periods include more than one sleep source.
        </p>
      ) : null}
      {recentComparison.state === 'insufficient_data' && coverage.stageEligibleNights > 0 ? (
        <p className="mt-4 text-sm text-zinc-600">Recent stage comparison needs at least 4 stage-qualified nights in each 7-day period.</p>
      ) : null}
    </section>
  )
}
