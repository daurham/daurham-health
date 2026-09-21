import type { ReactNode } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { kilogramsToPounds } from '@/domain/units'
import { formatCalendarDate, formatDurationSec, formatReps } from './format'

function asLb(kg: number): number {
  return Math.round(kilogramsToPounds(kg) * 10) / 10
}

type StrengthPoint = {
  date: string
  estimatedLb: number
  loadLb: number
  reps: number
}

type FrontierDatum = {
  loadLb: number
  y: number
  date: string
  kind: 'history' | 'frontier'
}

function ChartFrame({
  title,
  caption,
  children,
}: {
  title: string
  caption: string
  children: ReactNode
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="mt-1 text-sm text-zinc-600">{caption}</p>
      <div className="mt-4 h-56 w-full">{children}</div>
    </div>
  )
}

function tooltipBox(body: string) {
  return (
    <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-800 shadow-sm">
      {body}
    </div>
  )
}

export function EstimatedStrengthChart({
  points,
}: {
  points: Array<{
    date: string
    estimated1RmKg: number
    loadKg: number
    reps: number
  }>
}) {
  const data: StrengthPoint[] = points.map((point) => ({
    date: point.date,
    estimatedLb: asLb(point.estimated1RmKg),
    loadLb: asLb(point.loadKg),
    reps: point.reps,
  }))
  if (data.length < 2) {
    return null
  }
  const domain = paddedDomain(data.map((item) => item.estimatedLb))
  const caption = 'Session estimated strength from Epley. This is not a tested 1RM.'
  return (
    <ChartFrame title="Estimated Strength" caption={caption}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={formatCalendarDate} tick={{ fill: '#71717a', fontSize: 11 }} />
          <YAxis dataKey="estimatedLb" unit=" lb" domain={domain} tick={{ fill: '#71717a', fontSize: 11 }} width={56} />
          <Tooltip
            content={({ payload }) => {
              const item = payload?.[0]?.payload as StrengthPoint | undefined
              if (!item) {
                return null
              }
              return tooltipBox(
                `${formatCalendarDate(item.date)} · ${item.estimatedLb} lb estimated from ${item.loadLb} lb × ${item.reps}`,
              )
            }}
          />
          <Line type="linear" dataKey="estimatedLb" stroke="#18181b" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

function toFrontierData(
  points: Array<{ loadKg: number; reps: number | null; durationSec: number | null; date: string }>,
  kind: 'history' | 'frontier',
  mode: 'reps' | 'duration',
): FrontierDatum[] {
  return points.map((point) => ({
    loadLb: asLb(point.loadKg),
    y: mode === 'reps' ? (point.reps ?? 0) : (point.durationSec ?? 0),
    date: point.date,
    kind,
  }))
}

export function PerformanceFrontierChart({
  history,
  frontier,
  mode,
}: {
  history: Array<{ loadKg: number; reps: number | null; durationSec: number | null; date: string }>
  frontier: Array<{ loadKg: number; reps: number | null; durationSec: number | null; date: string }>
  mode: 'reps' | 'duration'
}) {
  const historyData = toFrontierData(history, 'history', mode)
  const frontierData = toFrontierData(frontier, 'frontier', mode)
  const yLabel = mode === 'reps' ? 'Reps' : 'Duration (s)'
  const all = [...historyData, ...frontierData]
  const xDomain = all.length > 0 ? paddedDomain(all.map((item) => item.loadLb)) : undefined
  const yDomain = all.length > 0 ? paddedDomain(all.map((item) => item.y)) : undefined
  return (
    <ChartFrame
      title="Performance frontier"
      caption={
        mode === 'reps'
          ? 'Your performance frontier shows the combinations of weight and reps that define your best demonstrated performances.'
          : 'Your performance frontier shows the combinations of load and duration that define your best demonstrated carries.'
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="loadLb"
            name="Load"
            unit=" lb"
            domain={xDomain}
            tick={{ fill: '#71717a', fontSize: 11 }}
          />
          <YAxis type="number" dataKey="y" name={yLabel} domain={yDomain} tick={{ fill: '#71717a', fontSize: 11 }} width={40} />
          <Tooltip
            content={({ payload }) => {
              const item = payload?.[0]?.payload as FrontierDatum | undefined
              if (!item) {
                return null
              }
              const performed =
                mode === 'reps'
                  ? `${item.loadLb} lb × ${formatReps(item.y)}`
                  : `${item.loadLb} lb × ${formatDurationSec(item.y)}`
              return tooltipBox(`${formatCalendarDate(item.date)} · ${performed}`)
            }}
          />
          <Scatter data={historyData} fill="#a1a1aa" name="Performed" />
          <Scatter data={frontierData} fill="#18181b" name="Frontier" />
        </ScatterChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}

function paddedDomain(values: number[]): [number, number] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mid = (min + max) / 2
  const spread = max - min
  const pad = Math.max(spread * 0.2, Math.abs(mid) * 0.02, 2)
  return [min - pad, max + pad]
}

export function WeightHistoryChart({
  points,
  trendAvailable = false,
}: {
  points: Array<{ date: string; valueLb: number }>
  trendAvailable?: boolean
}) {
  if (points.length < 2) {
    return null
  }
  const domain = paddedDomain(points.map((point) => point.valueLb))
  return (
    <ChartFrame
      title="Recorded weight"
      caption={
        trendAvailable
          ? 'Actual recorded measurements. No interpolated values are shown.'
          : 'Recorded history only. A derived trend is not claimed until the required measurements and span are met.'
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
          <XAxis dataKey="date" tickFormatter={formatCalendarDate} tick={{ fill: '#71717a', fontSize: 11 }} />
          <YAxis
            dataKey="valueLb"
            unit=" lb"
            domain={domain}
            tick={{ fill: '#71717a', fontSize: 11 }}
            width={56}
          />
          <Tooltip
            content={({ payload }) => {
              const item = payload?.[0]?.payload as { date: string; valueLb: number } | undefined
              if (!item) {
                return null
              }
              return tooltipBox(`${formatCalendarDate(item.date)} · ${item.valueLb} lb`)
            }}
          />
          <Line type="linear" dataKey="valueLb" stroke="#18181b" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
