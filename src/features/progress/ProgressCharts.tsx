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
  if (data.length === 0) {
    return (
      <ChartFrame title="Estimated Strength" caption="No high-confidence estimated-strength points yet.">
        <p className="text-sm text-zinc-600">Record working sets to establish a baseline.</p>
      </ChartFrame>
    )
  }
  const caption =
    data.length === 1
      ? 'Baseline estimated strength from the first valid performance. This is not a tested 1RM.'
      : 'Session estimated strength from Epley. This is not a tested 1RM.'
  return (
    <ChartFrame title="Estimated Strength" caption={caption}>
      <ResponsiveContainer width="100%" height="100%">
        {data.length === 1 ? (
          <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={formatCalendarDate} tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis
              dataKey="estimatedLb"
              unit=" lb"
              tick={{ fill: '#71717a', fontSize: 11 }}
              width={56}
            />
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
            <Scatter data={data} fill="#18181b" />
          </ScatterChart>
        ) : (
          <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={formatCalendarDate} tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis dataKey="estimatedLb" unit=" lb" tick={{ fill: '#71717a', fontSize: 11 }} width={56} />
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
        )}
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
            tick={{ fill: '#71717a', fontSize: 11 }}
          />
          <YAxis type="number" dataKey="y" name={yLabel} tick={{ fill: '#71717a', fontSize: 11 }} width={40} />
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

export function WeightHistoryChart({
  points,
}: {
  points: Array<{ date: string; valueLb: number }>
}) {
  if (points.length === 0) {
    return (
      <ChartFrame title="Recorded weight" caption="No weight measurements in this history yet.">
        <p className="text-sm text-zinc-600">Import or record a measurement to see it here.</p>
      </ChartFrame>
    )
  }
  return (
    <ChartFrame
      title="Recorded weight"
      caption={
        points.length === 1
          ? 'A single recorded measurement. A trend is shown only after enough history exists.'
          : 'Actual recorded measurements. No interpolated values are shown.'
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        {points.length === 1 ? (
          <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={formatCalendarDate} tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis dataKey="valueLb" unit=" lb" tick={{ fill: '#71717a', fontSize: 11 }} width={56} />
            <Tooltip
              content={({ payload }) => {
                const item = payload?.[0]?.payload as { date: string; valueLb: number } | undefined
                if (!item) {
                  return null
                }
                return tooltipBox(`${formatCalendarDate(item.date)} · ${item.valueLb} lb`)
              }}
            />
            <Scatter data={points} fill="#18181b" />
          </ScatterChart>
        ) : (
          <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="#e4e4e7" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickFormatter={formatCalendarDate} tick={{ fill: '#71717a', fontSize: 11 }} />
            <YAxis dataKey="valueLb" unit=" lb" tick={{ fill: '#71717a', fontSize: 11 }} width={56} />
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
        )}
      </ResponsiveContainer>
    </ChartFrame>
  )
}
