import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { auditSleepVitalPayload, formatSleepVitalAudit, parseHealthAutoExportVitals } from '../src/domain/apple-health/hae-vitals.ts'
import { demoSleepNightDetail } from '../src/demo/repository.ts'
import { buildSleepNightDetail } from '../src/domain/sleep/night-detail.ts'
import type { SleepNightlySummary } from '../src/domain/sleep/summarize.ts'
import {
  deriveOvernightVitals,
  enabledSleepVitals,
  planSleepVitalReconciliation,
  sampleInEpisode,
  SLEEP_VITAL_REGISTRY,
  type SleepVitalDefinition,
  type SleepVitalObservation,
} from '../src/domain/sleep/vitals.ts'
import { buildSleepStageAnalytics } from '../src/domain/sleep/stage-analytics.ts'
import { SleepNightDetailView } from '../src/features/progress/SleepNightPage.tsx'
import { DELETE_HAE_SLEEP_VITALS_SQL, INSERT_SLEEP_VITAL_SQL } from '../server/apple-health/hae-vitals-sql.ts'

const EPISODE_START = '2026-09-23T06:30:00.000Z'
const EPISODE_END = '2026-09-23T14:00:00.000Z'

const verifiedRegistry: readonly SleepVitalDefinition[] = [
  {
    metricKey: 'heart_rate',
    label: 'Heart rate',
    canonicalUnit: 'bpm',
    enabled: true,
    inboundNames: ['heart_rate'],
    sourceUnits: [{ source: 'bpm' }, { source: 'count/min' }, { source: 'beats/min' }],
  },
  {
    metricKey: 'hrv_sdnn',
    label: 'HRV (SDNN)',
    canonicalUnit: 'ms',
    enabled: true,
    inboundNames: ['heart_rate_variability_sdnn'],
    sourceUnits: [{ source: 'ms' }],
  },
  {
    metricKey: 'respiratory_rate',
    label: 'Respiratory rate',
    canonicalUnit: 'breaths/min',
    enabled: true,
    inboundNames: ['respiratory_rate'],
    sourceUnits: [{ source: 'breaths/min' }, { source: 'count/min' }],
  },
  {
    metricKey: 'oxygen_saturation',
    label: 'Oxygen saturation',
    canonicalUnit: '%',
    enabled: true,
    inboundNames: ['blood_oxygen_saturation'],
    sourceUnits: [{ source: '%' }, { source: 'percent' }, { source: 'fraction', fractionToPercent: true }],
  },
  {
    metricKey: 'sleeping_wrist_temperature',
    label: 'Wrist temperature',
    canonicalUnit: '°C',
    enabled: true,
    inboundNames: ['apple_sleeping_wrist_temperature'],
    sourceUnits: [{ source: 'degC' }, { source: '°C' }, { source: 'C' }],
  },
]

function payload(metrics: unknown[]) {
  return { data: { metrics } }
}

function night(partial: Partial<SleepNightlySummary> = {}): SleepNightlySummary {
  return {
    sleepDate: '2026-09-23',
    timezone: 'America/Phoenix',
    logicalSourceKey: 'circular',
    sourceName: 'Circular',
    startAt: EPISODE_START,
    endAt: EPISODE_END,
    totalSleepMinutes: 420,
    timeInBedMinutes: 450,
    awakeMinutes: 12,
    coreMinutes: 200,
    deepMinutes: 70,
    remMinutes: 90,
    unspecifiedSleepMinutes: 20,
    stageCoveragePct: 95,
    stageConflictMinutes: 0,
    observationStatus: 'analysis_eligible',
    analysisEligible: true,
    stageAnalysisEligible: true,
    selectionReason: 'source_priority',
    calculationVersion: 'sleep-night-v1',
    evidence: {
      selectedLogicalSource: 'circular',
      selectedSourceName: 'Circular',
      selectedDurationMinutes: 420,
      selectedStatus: partial.observationStatus ?? 'analysis_eligible',
      alternatives: [],
      sourcePriority: ['apple_watch', 'circular'],
      completenessOverride: false,
      intervalCount: 4,
      stageCoveragePct: 95,
      additionalEpisodeCount: 0,
      calculationVersion: 'sleep-night-v1',
    },
    ...partial,
  }
}

function sample(partial: Partial<SleepVitalObservation> & Pick<SleepVitalObservation, 'metricKey' | 'value' | 'unit' | 'sourceFamily' | 'sourceFamilyKey'>): SleepVitalObservation {
  const observedAt = partial.observedAt ?? '2026-09-23T07:30:00.000Z'
  return {
    id: partial.id ?? `${partial.metricKey}-${partial.sourceFamilyKey}-${partial.value}-${observedAt}`,
    metricKey: partial.metricKey,
    value: partial.value,
    unit: partial.unit,
    observedAt,
    startAt: partial.startAt ?? observedAt,
    endAt: partial.endAt ?? observedAt,
    sourceFamily: partial.sourceFamily,
    sourceFamilyKey: partial.sourceFamilyKey,
    fingerprint: partial.fingerprint ?? `${partial.metricKey}|${partial.sourceFamilyKey}|${observedAt}|${partial.value}`,
  }
}

function html(detail: ReturnType<typeof buildSleepNightDetail>): string {
  return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(SleepNightDetailView, { detail })))
}

describe('sleep vital capability audit', () => {
  it('keeps the production allowlist empty', () => {
    expect(enabledSleepVitals()).toEqual([])
    expect(SLEEP_VITAL_REGISTRY.every((item) => item.enabled === false && item.inboundNames.length === 0)).toBe(true)
    const migration = readFileSync('migrations/0029_sleep_vital_samples.sql', 'utf8')
    expect(migration).toContain('sleep_vital_samples')
    expect(migration).not.toMatch(/^\s*user_id\b/m)
    expect(migration).not.toMatch(/BETWEEN|healthy/i)
    expect(migration).not.toContain('sleep_date')
  })

  it('does not store the daily heart_rate fixture or an unknown metric', () => {
    const body = payload([
      { name: 'heart_rate', units: 'bpm', data: [{ date: '2026-09-20 00:00:00 -0700', qty: 70.125 }] },
      { name: 'blood_glucose', units: 'mg/dL', data: [{ date: '2026-09-20 00:00:00 -0700', qty: 90 }] },
      { name: 'heart_rate_variability', units: 'ms', data: [{ date: '2026-09-20 00:00:00 -0700', qty: 42 }] },
    ])
    expect(parseHealthAutoExportVitals(body).samples).toEqual([])
    const audited = auditSleepVitalPayload(body)
    const text = formatSleepVitalAudit(audited)
    expect(text).not.toContain('70.125')
    expect(JSON.stringify(audited)).not.toContain('70.125')
    expect(audited.find((row) => row.inboundName === 'heart_rate')).toMatchObject({
      declaredUnit: 'bpm',
      hasDate: true,
      hasStart: false,
      enabled: false,
      metricKey: null,
    })
    expect(text).toContain('Enabled: no')
  })

  it('does not print a raw device string in the audit', () => {
    const body = payload([
      {
        name: 'heart_rate',
        units: 'bpm',
        data: [{ date: '2026-09-20 03:00:00 -0700', qty: 55, source: 'HKDevice: 0xabc123 firmware' }],
      },
    ])
    const text = formatSleepVitalAudit(auditSleepVitalPayload(body))
    expect(text).not.toContain('0xabc123')
    expect(text).toContain('Unknown source')
    expect(text).not.toContain('Apple Watch')
  })
})

describe('sleep vital parser contract', () => {
  it('accepts an interval sample and rejects a day summary, a bad unit, and an ambiguous HRV name', () => {
    const interval = {
      name: 'heart_rate',
      units: 'bpm',
      data: [
        {
          qty: 58,
          units: 'count/min',
          source: "Daurham's Apple Watch",
          startDate: '2026-09-22 23:40:00 -0700',
          endDate: '2026-09-22 23:41:00 -0700',
        },
      ],
    }
    const parsed = parseHealthAutoExportVitals(payload([interval]), verifiedRegistry)
    expect(parsed.samples).toHaveLength(1)
    expect(parsed.samples[0]).toMatchObject({
      metricKey: 'heart_rate',
      value: 58,
      unit: 'bpm',
      sourceFamily: 'Apple Watch',
      sourceFamilyKey: 'apple_watch',
      observedAt: '2026-09-23T06:40:00.000Z',
      startAt: '2026-09-23T06:40:00.000Z',
      endAt: '2026-09-23T06:41:00.000Z',
    })
    expect(parsed.samples[0]?.fingerprint).not.toContain('Daurham')
    expect(parseHealthAutoExportVitals(payload([interval]), verifiedRegistry).samples[0]?.fingerprint).toBe(parsed.samples[0]?.fingerprint)
    const summary = parseHealthAutoExportVitals(
      payload([{ name: 'heart_rate', units: 'bpm', data: [{ date: '2026-09-20 00:00:00 -0700', qty: 70, source: 'Apple Watch' }] }]),
      verifiedRegistry,
    )
    expect(summary.samples).toEqual([])
    expect(summary.aggregatedIgnored).toBe(1)
    expect(() =>
      parseHealthAutoExportVitals(
        payload([
          {
            name: 'heart_rate',
            units: 'miles',
            data: [{ qty: 58, startDate: '2026-09-22 23:40:00 -0700', endDate: '2026-09-22 23:41:00 -0700' }],
          },
        ]),
        verifiedRegistry,
      ),
    ).toThrow(/unit/)
    const ambiguousHrv = parseHealthAutoExportVitals(
      payload([
        {
          name: 'heart_rate_variability',
          units: 'ms',
          data: [{ qty: 44, startDate: '2026-09-22 23:40:00 -0700', endDate: '2026-09-22 23:41:00 -0700', source: 'Apple Watch' }],
        },
      ]),
      verifiedRegistry,
    )
    expect(ambiguousHrv.samples).toEqual([])
  })

  it('normalizes verified units and refuses to guess', () => {
    const point = (name: string, units: string, qty: number, source = 'Apple Watch') => ({
      name,
      units,
      data: [{ qty, units, source, startDate: '2026-09-22 23:40:00 -0700', endDate: '2026-09-22 23:41:00 -0700' }],
    })
    expect(parseHealthAutoExportVitals(payload([point('respiratory_rate', 'breaths/min', 14.8)]), verifiedRegistry).samples[0]?.unit).toBe('breaths/min')
    expect(parseHealthAutoExportVitals(payload([point('heart_rate_variability_sdnn', 'ms', 44)]), verifiedRegistry).samples[0]).toMatchObject({
      metricKey: 'hrv_sdnn',
      unit: 'ms',
      value: 44,
    })
    const fraction = parseHealthAutoExportVitals(payload([point('blood_oxygen_saturation', 'fraction', 0.5)]), verifiedRegistry)
    expect(fraction.samples[0]?.value).toBe(50)
    expect(fraction.samples[0]?.unit).toBe('%')
    const percentLooking = parseHealthAutoExportVitals(payload([point('blood_oxygen_saturation', '%', 0.97)]), verifiedRegistry)
    expect(percentLooking.samples[0]?.value).toBe(0.97)
    expect(() => parseHealthAutoExportVitals(payload([point('blood_oxygen_saturation', 'fraction', 97)]), verifiedRegistry)).toThrow(/unit/)
    expect(() => parseHealthAutoExportVitals(payload([point('apple_sleeping_wrist_temperature', 'degF', 97)]), verifiedRegistry)).toThrow(/unit/)
    const wrist = parseHealthAutoExportVitals(payload([point('apple_sleeping_wrist_temperature', 'degC', 35.7)]), verifiedRegistry)
    expect(wrist.samples[0]).toMatchObject({ metricKey: 'sleeping_wrist_temperature', unit: '°C', value: 35.7 })
    expect(parseHealthAutoExportVitals(payload([point('body_temperature', 'degC', 36.5)]), verifiedRegistry).samples).toEqual([])
    const missingSource = parseHealthAutoExportVitals(payload([point('heart_rate', 'bpm', 60, '')]), verifiedRegistry)
    expect(missingSource.samples[0]?.sourceFamily).toBe('Unknown source')
    const zero = parseHealthAutoExportVitals(payload([point('heart_rate', 'bpm', 0)]), verifiedRegistry)
    expect(zero.samples[0]?.value).toBe(0)
  })

  it('keeps logical source apart from the Health Auto Export transport', () => {
    const parsed = parseHealthAutoExportVitals(
      payload([
        {
          name: 'heart_rate_variability_sdnn',
          units: 'ms',
          data: [{ qty: 39, units: 'ms', source: 'Circular', startDate: '2026-09-22 23:40:00 -0700', endDate: '2026-09-22 23:41:00 -0700' }],
        },
      ]),
      verifiedRegistry,
    )
    expect(parsed.samples[0]?.sourceFamily).toBe('Circular')
    expect(parsed.samples[0]?.fingerprint).not.toContain('health_auto_export')
    expect(JSON.stringify(parsed.samples[0])).not.toContain('HKDevice')
  })
})

describe('overnight vital derivation', () => {
  it('uses episode bounds, keeps midnight inside the night, and excludes the exact end', () => {
    expect(sampleInEpisode('2026-09-23T07:30:00.000Z', EPISODE_START, EPISODE_END)).toBe(true)
    expect(sampleInEpisode('2026-09-23T06:29:00.000Z', EPISODE_START, EPISODE_END)).toBe(false)
    expect(sampleInEpisode(EPISODE_END, EPISODE_START, EPISODE_END)).toBe(false)
    const inside = sample({
      metricKey: 'heart_rate',
      value: 58,
      unit: 'bpm',
      sourceFamily: 'Apple Watch',
      sourceFamilyKey: 'apple_watch',
      observedAt: '2026-09-23T07:30:00.000Z',
    })
    const readings = deriveOvernightVitals({
      observationStatus: 'analysis_eligible',
      episodeStart: EPISODE_START,
      episodeEnd: EPISODE_END,
      samples: [inside],
      registry: verifiedRegistry,
    })
    expect(readings).toHaveLength(1)
    const tightened = deriveOvernightVitals({
      observationStatus: 'analysis_eligible',
      episodeStart: EPISODE_START,
      episodeEnd: '2026-09-23T07:00:00.000Z',
      samples: [inside],
      registry: verifiedRegistry,
    })
    expect(tightened).toEqual([])
    expect(inside.value).toBe(58)
  })

  it('returns the median and does not merge sources', () => {
    const values = [55, 57, 58, 61, 100]
    const samples = values.map((value, index) =>
      sample({
        metricKey: 'heart_rate',
        value,
        unit: 'bpm',
        sourceFamily: 'Apple Watch',
        sourceFamilyKey: 'apple_watch',
        observedAt: `2026-09-23T07:${String(10 + index).padStart(2, '0')}:00.000Z`,
      }),
    )
    const [heart] = deriveOvernightVitals({
      observationStatus: 'analysis_eligible',
      episodeStart: EPISODE_START,
      episodeEnd: EPISODE_END,
      samples,
      registry: verifiedRegistry,
    })
    expect(heart?.value).toBe(58)
    expect(heart?.value).not.toBe(values.reduce((sum, value) => sum + value, 0) / values.length)
    expect(heart?.sampleCount).toBe(5)
    expect(heart?.statistic).toBe('median')
    const hrv = [40, 44, 48].map((value) =>
      sample({ metricKey: 'hrv_sdnn', value, unit: 'ms', sourceFamily: 'Apple Watch', sourceFamilyKey: 'apple_watch' }),
    )
    const circular = [35, 39, 41].map((value, index) =>
      sample({
        metricKey: 'hrv_sdnn',
        value,
        unit: 'ms',
        sourceFamily: 'Circular',
        sourceFamilyKey: 'circular',
        observedAt: `2026-09-23T08:0${index}:00.000Z`,
      }),
    )
    const grouped = deriveOvernightVitals({
      observationStatus: 'analysis_eligible',
      episodeStart: EPISODE_START,
      episodeEnd: EPISODE_END,
      samples: [...hrv, ...circular],
      registry: verifiedRegistry,
    })
    expect(grouped.map((item) => [item.sourceFamily, item.value, item.sampleCount])).toEqual([
      ['Apple Watch', 44, 3],
      ['Circular', 39, 3],
    ])
  })

  it('keeps one real reading, an explicit zero, and a missing metric as missing', () => {
    const one = deriveOvernightVitals({
      observationStatus: 'analysis_eligible',
      episodeStart: EPISODE_START,
      episodeEnd: EPISODE_END,
      samples: [sample({ metricKey: 'hrv_sdnn', value: 44, unit: 'ms', sourceFamily: 'Apple Watch', sourceFamilyKey: 'apple_watch' })],
      registry: verifiedRegistry,
    })
    expect(one).toEqual([expect.objectContaining({ value: 44, sampleCount: 1, label: 'HRV (SDNN)' })])
    const zero = deriveOvernightVitals({
      observationStatus: 'analysis_eligible',
      episodeStart: EPISODE_START,
      episodeEnd: EPISODE_END,
      samples: [sample({ metricKey: 'heart_rate', value: 0, unit: 'bpm', sourceFamily: 'Apple Watch', sourceFamilyKey: 'apple_watch' })],
      registry: verifiedRegistry,
    })
    expect(zero[0]?.value).toBe(0)
    const heartOnly = deriveOvernightVitals({
      observationStatus: 'analysis_eligible',
      episodeStart: EPISODE_START,
      episodeEnd: EPISODE_END,
      samples: [sample({ metricKey: 'heart_rate', value: 58, unit: 'bpm', sourceFamily: 'Apple Watch', sourceFamilyKey: 'apple_watch' })],
      registry: verifiedRegistry,
    })
    expect(heartOnly.map((item) => item.metricKey)).toEqual(['heart_rate'])
    expect(JSON.stringify(heartOnly)).not.toMatch(/hrv|0 ms|baseline|deviation|readiness|normal range/i)
  })

  it('shows partial-night context and hides in-bed-only samples from the overnight section', () => {
    const reading = sample({ metricKey: 'heart_rate', value: 61, unit: 'bpm', sourceFamily: 'Apple Watch', sourceFamilyKey: 'apple_watch' })
    const partial = buildSleepNightDetail(
      night({ observationStatus: 'partial_observation', analysisEligible: false, stageAnalysisEligible: false, selectionReason: 'partial_only' }),
      { previousSleepDate: null, nextSleepDate: null },
      'Health Auto Export',
      [reading],
      verifiedRegistry,
    )
    expect(partial.overnightVitals).toHaveLength(1)
    expect(partial.overnightVitalNote).toBe('Observed during a partial Sleep observation.')
    expect(partial.totalSleepMinutes).toBe(420)
    expect(partial.sourceName).toBe('Circular')
    const inBed = buildSleepNightDetail(
      night({ observationStatus: 'in_bed_only', analysisEligible: false, stageAnalysisEligible: false, selectionReason: 'in_bed_only', totalSleepMinutes: null }),
      { previousSleepDate: null, nextSleepDate: null },
      null,
      [reading],
      verifiedRegistry,
    )
    expect(inBed.overnightVitals).toEqual([])
    expect(inBed.overnightVitalNote).toBeNull()
    expect(reading.value).toBe(61)
  })

  it('does not turn activity resting heart rate or disabled metrics into overnight heart rate', () => {
    const detail = buildSleepNightDetail(night())
    expect(detail.overnightVitals).toEqual([])
    expect(detail.calculationVersion).toBe('sleep-night-v1')
    expect(detail.vitalCalculationVersion).toBeNull()
    const storedButDisabled = buildSleepNightDetail(night(), { previousSleepDate: null, nextSleepDate: null }, null, [
      sample({ metricKey: 'heart_rate', value: 58, unit: 'bpm', sourceFamily: 'Apple Watch', sourceFamilyKey: 'apple_watch' }),
    ])
    expect(storedButDisabled.overnightVitals).toEqual([])
    const nightDetail = readFileSync('src/domain/sleep/night-detail.ts', 'utf8')
    const vitals = readFileSync('src/domain/sleep/vitals.ts', 'utf8')
    const query = readFileSync('server/sleep/queries.ts', 'utf8')
    expect(nightDetail + vitals + query).not.toContain('resting_heart_rate')
    expect(query).not.toContain('activity_daily_summaries')
    expect(vitals).not.toContain('RMSSD')
    expect(vitals).not.toContain('temperature_deviation')
  })

  it('leaves stage analytics, intelligence, and goals free of vital metrics', () => {
    expect(readFileSync('src/domain/sleep/stage-analytics.ts', 'utf8')).not.toContain('overnightVitals')
    expect(readFileSync('src/domain/intelligence/analyze.ts', 'utf8')).not.toMatch(/hrv_sdnn|overnightVitals/)
    expect(readFileSync('src/domain/goals.ts', 'utf8')).not.toContain('hrv_sdnn')
    expect(readFileSync('server/apple-health/hae-vitals-service.ts', 'utf8')).not.toContain('syncSleepNightlySummaries')
    const analytics = buildSleepStageAnalytics([], { range: '30d', asOf: '2026-09-23' })
    expect(JSON.stringify(analytics)).not.toMatch(/heart_rate|hrv_sdnn|oxygen_saturation/)
  })
})

describe('sleep vital reconciliation', () => {
  it('matches a repeated fingerprint and only removes covered HAE rows inside the window', () => {
    const plan = planSleepVitalReconciliation({
      incomingFingerprints: ['keep'],
      coveredMetricKeys: ['heart_rate'],
      existing: [
        { id: 'same', fingerprint: 'keep', metricKey: 'heart_rate', haeOwned: true, inWindow: true },
        { id: 'omitted', fingerprint: 'gone', metricKey: 'heart_rate', haeOwned: true, inWindow: true },
        { id: 'older', fingerprint: 'old', metricKey: 'heart_rate', haeOwned: true, inWindow: false },
        { id: 'hrv', fingerprint: 'hrv', metricKey: 'hrv_sdnn', haeOwned: true, inWindow: true },
        { id: 'xml', fingerprint: 'xml', metricKey: 'heart_rate', haeOwned: false, inWindow: true },
      ],
    })
    expect(plan.insertFingerprints).toEqual([])
    expect(plan.matchedIds).toEqual(['same'])
    expect(plan.removeIds).toEqual(['omitted'])
    expect(INSERT_SLEEP_VITAL_SQL).toContain('ON CONFLICT (fingerprint) DO NOTHING')
    expect(DELETE_HAE_SLEEP_VITALS_SQL).toContain('transport_source_id')
    expect(DELETE_HAE_SLEEP_VITALS_SQL).toContain('metric_key')
  })
})

describe('overnight vitals presentation', () => {
  it('renders supported readings without a score, and the demo stays empty', () => {
    const detail = buildSleepNightDetail(
      night({ observationStatus: 'partial_observation', analysisEligible: false, stageAnalysisEligible: false, selectionReason: 'partial_only' }),
      { previousSleepDate: null, nextSleepDate: null },
      'Health Auto Export',
      [
        sample({ metricKey: 'heart_rate', value: 58, unit: 'bpm', sourceFamily: 'Apple Watch', sourceFamilyKey: 'apple_watch' }),
        sample({
          metricKey: 'heart_rate',
          value: 62,
          unit: 'bpm',
          sourceFamily: 'Apple Watch',
          sourceFamilyKey: 'apple_watch',
          observedAt: '2026-09-23T08:00:00.000Z',
        }),
        sample({ metricKey: 'hrv_sdnn', value: 46, unit: 'ms', sourceFamily: 'Apple Watch', sourceFamilyKey: 'apple_watch' }),
        sample({
          metricKey: 'sleeping_wrist_temperature',
          value: 35.7,
          unit: '°C',
          sourceFamily: 'Apple Watch',
          sourceFamilyKey: 'apple_watch',
        }),
      ],
      verifiedRegistry,
    )
    const page = html(detail)
    expect(page).toContain('Overnight vitals')
    expect(page).toContain('Observed during a partial Sleep observation.')
    expect(page).toContain('Heart rate')
    expect(page).toContain('60 bpm median')
    expect(page).toContain('2 readings · Apple Watch')
    expect(page).toContain('HRV (SDNN)')
    expect(page).toContain('46 ms')
    expect(page).toContain('1 reading · Apple Watch')
    expect(page).toContain('Wrist temperature')
    expect(page).toContain('35.7 °C')
    expect(page).toContain('Personal baseline comparison unavailable for a partial Sleep observation.')
    expect(page).not.toMatch(/above recent median|below recent median|Body temperature|temperature deviation|RMSSD|readiness|sleep score|better|worse|fever|elevated/i)
    expect(page).toContain('Circular')
    expect(page).toContain('Partial sleep observation')
    expect(page).toContain('observed sleep')
    const demo = demoSleepNightDetail('2026-09-15')
    expect(demo?.overnightVitals).toEqual([])
    expect(html(demo!)).not.toContain('Overnight vitals')
    expect(readFileSync('src/demo/repository.ts', 'utf8')).not.toContain('healthFetch')
    expect(readFileSync('server/handlers/progress-sleep-detail.ts', 'utf8')).toContain('withOwnerAuth')
    expect(readFileSync('server/handlers/progress-sleep-detail.ts', 'utf8')).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(readFileSync('server/handlers/apple-health-sync.ts', 'utf8')).toContain('appleHealthSyncAuthorized')
    expect(readFileSync('src/features/today/TodayPage.tsx', 'utf8')).not.toContain('Overnight vitals')
  })
})
