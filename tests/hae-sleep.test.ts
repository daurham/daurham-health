import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  commitSleepIngest,
  diffSleepNights,
  mapHaeSleepValue,
  parseHaeInstant,
  parseHealthAutoExportSleep,
  planHaeSleepReconciliation,
  sleepSemanticKey,
  type HaeSleepSegment,
} from '../src/domain/apple-health/hae-sleep.ts'
import { parseHealthAutoExport } from '../src/domain/apple-health/hae.ts'
import {
  arbitrateSleepNights,
  classifySleepIntervals,
  sleepNightCandidates,
  sleepNightlySummariesFromDecisions,
  type SleepIntervalRow,
} from '../src/domain/sleep/index.ts'
import { parseWallClockInTimeZone } from '../src/domain/time.ts'

function payload(metrics: unknown[]) {
  return { data: { metrics } }
}

function segment(partial: Partial<HaeSleepSegment> & Pick<HaeSleepSegment, 'semanticKey'>): HaeSleepSegment {
  return {
    startAt: '2026-09-22T06:00:00.000Z',
    endAt: '2026-09-22T07:00:00.000Z',
    stage: 'asleep',
    sourceCategory: 'Asleep',
    sourceName: "Jacob's Apple Watch",
    logicalSourceKey: 'apple_watch',
    logicalSourceName: 'Apple Watch',
    ...partial,
  }
}

function row(start: string, end: string, stage: string, sourceName: string | null, id = 'interval'): SleepIntervalRow {
  return {
    id,
    startAt: parseWallClockInTimeZone(start, 'America/Phoenix').toISOString(),
    endAt: parseWallClockInTimeZone(end, 'America/Phoenix').toISOString(),
    stage,
    sourceCategory: stage,
    sourceName,
    sourceId: 'apple_health',
  }
}

describe('Health Auto Export sleep parsing', () => {
  it('parses unaggregated sleep_analysis and keeps activity metrics separate', () => {
    const body = payload([
      { name: 'step_count', units: 'count', data: [{ date: '2026-09-21 00:00:00 -0700', qty: 1000 }] },
      {
        name: 'sleep_analysis',
        units: 'hr',
        data: [
          {
            startDate: '2026-09-21 23:10:00 -0700',
            endDate: '2026-09-22 07:02:00 -0700',
            value: 'Asleep',
            qty: 7.87,
            source: 'Jacob’s Apple Watch',
          },
        ],
      },
    ])
    const activity = parseHealthAutoExport(body)
    const sleep = parseHealthAutoExportSleep(body)
    expect(activity.days[0]?.stepsCount).toBe(1000)
    expect(activity.ignoredMetrics).toEqual([])
    expect(sleep.segments).toHaveLength(1)
    expect(sleep.segments[0]).toMatchObject({
      stage: 'asleep',
      logicalSourceKey: 'apple_watch',
      logicalSourceName: 'Apple Watch',
      startAt: '2026-09-22T06:10:00.000Z',
      endAt: '2026-09-22T14:02:00.000Z',
    })
    expect(sleep.sourceMetadataPresent).toBe(true)
    expect(sleep.sleepRequiresUnaggregated).toBe(false)
  })

  it('rejects an aggregated daily total without persisting a segment', () => {
    const sleep = parseHealthAutoExportSleep(
      payload([
        {
          name: 'sleep_analysis',
          units: 'hr',
          data: [{ date: '2026-09-21 00:00:00 -0700', qty: 7.5, source: "Jacob's Apple Watch" }],
        },
      ]),
    )
    expect(sleep.sleepRequiresUnaggregated).toBe(true)
    expect(sleep.segments).toEqual([])
    expect(sleep.sourceMetadataPresent).toBe(true)
    expect(sleep.intervalsIgnored).toBe(1)
  })

  it('maps known stages and does not treat unspecified or unknown values as sleep', () => {
    expect(mapHaeSleepValue('Awake')).toBe('awake')
    expect(mapHaeSleepValue('Asleep')).toBe('asleep')
    expect(mapHaeSleepValue('In Bed')).toBe('in_bed')
    expect(mapHaeSleepValue('Core')).toBe('core')
    expect(mapHaeSleepValue('Deep')).toBe('deep')
    expect(mapHaeSleepValue('REM')).toBe('rem')
    expect(mapHaeSleepValue('HKCategoryValueSleepAnalysisAsleepUnspecified')).toBe('asleep')
    expect(mapHaeSleepValue('Unspecified')).toBeNull()
    expect(mapHaeSleepValue('asleep_unspecified')).toBeNull()
    expect(mapHaeSleepValue('future_stage')).toBeNull()
    const sleep = parseHealthAutoExportSleep(
      payload([
        {
          name: 'sleep_analysis',
          data: [
            { startDate: '2026-09-21 23:00:00 -0700', endDate: '2026-09-22 00:00:00 -0700', value: 'Unspecified' },
            { startDate: '2026-09-22 00:00:00 -0700', endDate: '2026-09-22 01:00:00 -0700', value: 'Awake' },
          ],
        },
      ]),
    )
    expect(sleep.unsupportedStages).toEqual(['Unspecified'])
    expect(sleep.segments.map((item) => item.stage)).toEqual(['awake'])
  })

  it('keeps offset-aware instants and does not guess a missing source', () => {
    expect(parseHaeInstant('2026-09-21 23:10:00 -0700')).toBe('2026-09-22T06:10:00.000Z')
    const sleep = parseHealthAutoExportSleep(
      payload([
        {
          name: 'sleep_analysis',
          data: [{ startDate: '2026-09-21 23:00:00 -0700', endDate: '2026-09-22 03:00:00 -0700', value: 'Core' }],
        },
      ]),
    )
    expect(sleep.sourceMetadataPresent).toBe(false)
    expect(sleep.segments[0]?.logicalSourceKey).toBe('unknown')
    expect(sleep.segments[0]?.logicalSourceName).toBe('Unknown')
    expect(sleep.sourcesSeen).toEqual(['Unknown'])
  })
})

describe('Health Auto Export sleep reconciliation', () => {
  it('matches a repeated segment and an XML observation with the same semantic identity', () => {
    const incoming = [
      segment({
        semanticKey: sleepSemanticKey({
          logicalSourceKey: 'apple_watch',
          stage: 'asleep',
          startAt: '2026-09-22T06:00:00.000Z',
          endAt: '2026-09-22T14:00:00.000Z',
        }),
        startAt: '2026-09-22T06:00:00.000Z',
        endAt: '2026-09-22T14:00:00.000Z',
      }),
    ]
    const xmlKey = sleepSemanticKey({
      logicalSourceKey: 'apple_watch',
      stage: 'asleep',
      startAt: '2026-09-22T06:00:00.000Z',
      endAt: '2026-09-22T14:00:00.000Z',
    })
    expect(incoming[0]?.semanticKey).toBe(xmlKey)
    const plan = planHaeSleepReconciliation(incoming, [
      { id: 'xml-1', semanticKey: xmlKey, haeOwned: false, xmlOwned: true, inWindow: true },
    ])
    expect(plan.insertKeys).toEqual([])
    expect(plan.matchedIds).toEqual(['xml-1'])
    expect(plan.removeIds).toEqual([])
    const again = planHaeSleepReconciliation(incoming, [
      { id: 'xml-1', semanticKey: xmlKey, haeOwned: true, xmlOwned: true, inWindow: true },
    ])
    expect(again.insertKeys).toEqual([])
    expect(again.removeIds).toEqual([])
  })

  it('keeps the same interval from two logical sources and can remove an exclusive HAE segment', () => {
    const watch = segment({ semanticKey: 'sleep|apple_watch|asleep|2026-09-22T06:00:00.000Z|2026-09-22T14:00:00.000Z' })
    const ring = segment({
      semanticKey: 'sleep|circular|asleep|2026-09-22T06:00:00.000Z|2026-09-22T14:00:00.000Z',
      sourceName: 'Circular',
      logicalSourceKey: 'circular',
      logicalSourceName: 'Circular',
    })
    const plan = planHaeSleepReconciliation([watch, ring], [
      { id: 'old-hae', semanticKey: 'sleep|apple_watch|core|2026-09-22T05:00:00.000Z|2026-09-22T06:00:00.000Z', haeOwned: true, xmlOwned: false, inWindow: true },
      { id: 'xml-other', semanticKey: 'sleep|iphone|in_bed|2026-09-22T06:00:00.000Z|2026-09-22T14:00:00.000Z', haeOwned: false, xmlOwned: true, inWindow: true },
    ])
    expect(plan.insertKeys).toEqual([ring.semanticKey, watch.semanticKey].sort())
    expect(plan.removeIds).toEqual(['old-hae'])
  })

  it('lets a partial night become eligible and can change the selected source', () => {
    const partial = [row('09/21/2026 23:00:00', '09/22/2026 01:30:00', 'asleep', "Jacob's Apple Watch", 'partial')]
    const first = sleepNightlySummariesFromDecisions(arbitrateSleepNights(sleepNightCandidates(classifySleepIntervals(partial))))
    expect(first[0]).toMatchObject({ observationStatus: 'partial_observation', analysisEligible: false, logicalSourceKey: 'apple_watch' })
    const healed = [
      ...partial,
      row('09/21/2026 23:00:00', '09/22/2026 06:10:00', 'asleep', "Jacob's Apple Watch", 'rest'),
    ]
    const second = sleepNightlySummariesFromDecisions(arbitrateSleepNights(sleepNightCandidates(classifySleepIntervals(healed))))
    expect(second[0]?.analysisEligible).toBe(true)
    expect(second[0]?.totalSleepMinutes).toBeGreaterThanOrEqual(240)
    const withRing = [
      row('09/22/2026 23:00:00', '09/23/2026 01:00:00', 'asleep', "Jacob's Apple Watch", 'watch'),
      row('09/22/2026 22:00:00', '09/23/2026 06:00:00', 'asleep', 'Circular', 'ring'),
    ]
    const chosen = sleepNightlySummariesFromDecisions(arbitrateSleepNights(sleepNightCandidates(classifySleepIntervals(withRing))))
    expect(chosen[0]?.logicalSourceKey).toBe('circular')
    expect(chosen[0]?.selectionReason).toBe('source_priority')
  })

  it('leaves unchanged nightly payloads stable', () => {
    const night = { sleepDate: '2026-09-22', payload: '{"total":480}' }
    const diff = diffSleepNights([night], [night])
    expect(diff).toMatchObject({ nightsInserted: 0, nightsUpdated: 0, nightsUnchanged: 1, changedDates: [], removedDates: [] })
    const changed = diffSleepNights([night], [{ sleepDate: '2026-09-22', payload: '{"total":430}' }])
    expect(changed.nightsUpdated).toBe(1)
    expect(changed.changedDates).toEqual(['2026-09-22'])
  })

  it('does not report success when nightly materialization fails', async () => {
    await expect(
      commitSleepIngest({
        persist: async () => ({ intervalsInserted: 1 }),
        materialize: async () => {
          throw new Error('nightly write failed')
        },
      }),
    ).rejects.toThrow(/nightly/i)
  })
})

describe('Health Auto Export sleep endpoint boundaries', () => {
  it('keeps the write token write-only and reuses the shared materializer', () => {
    const handler = readFileSync('server/handlers/apple-health-sync.ts', 'utf8')
    const service = readFileSync('server/apple-health/hae-sleep-service.ts', 'utf8')
    const activity = readFileSync('server/apple-health/hae-service.ts', 'utf8')
    const sleepSql = readFileSync('server/apple-health/hae-sleep-sql.ts', 'utf8')
    expect(handler).toContain('appleHealthSyncAuthorized')
    expect(handler).toContain('ingestHealthAutoExportSleep')
    expect(handler.indexOf('ingestHealthAutoExportSleep')).toBeLessThan(handler.indexOf('sendJson(res, 200'))
    expect(service).toContain('syncSleepNightlySummaries')
    expect(service).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(service).not.toContain('VITE_')
    expect(activity).toContain('health_auto_export_daily')
    expect(sleepSql).toContain("metadata->>'strategy' = $2")
    expect(readFileSync('server/apple-health/hae-sql.ts', 'utf8')).not.toContain('walking_running_distance_m = EXCLUDED')
    expect(readFileSync('.env.example', 'utf8')).toContain('APPLE_HEALTH_SYNC_TOKEN=')
    expect(readFileSync('.env.example', 'utf8')).not.toContain('VITE_APPLE_HEALTH_SYNC_TOKEN')
  })
})
