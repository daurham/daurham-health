import { describe, expect, it } from 'vitest'
import { parseWallClockInTimeZone } from '../src/domain/time.ts'
import {
  SLEEP_SESSION_GAP_MINUTES,
  arbitrateSleepNight,
  classifySleepIntervals,
  isSuspiciousPartialPreferred,
  logicalSleepSource,
  normalizeSleepAnalyticsCategory,
  sessionizeSleepEpisodes,
  sleepDateFromEnd,
  sleepNightCandidates,
  sleepRangeSummary,
  sleepShortTermChange,
  type SleepIntervalRow,
  type SleepNightCandidate,
} from '../src/domain/sleep/index.ts'

function phoenix(monthDayYear: string, clock: string): string {
  return parseWallClockInTimeZone(`${monthDayYear} ${clock}`, 'America/Phoenix').toISOString()
}

let nextId = 1

function interval(
  partial: Partial<SleepIntervalRow> & Pick<SleepIntervalRow, 'startAt' | 'endAt' | 'stage'>,
): SleepIntervalRow {
  nextId += 1
  return {
    id: `i${nextId}`,
    sourceCategory: partial.stage,
    sourceName: "Jacob’s\u00a0Apple Watch",
    sourceVersion: '12.0',
    deviceName: '<<HKDevice: 0x123, name:Apple Watch, softwareVersion:11.6.1>>',
    sourceId: 'apple_health',
    ...partial,
  }
}

function nights(rows: SleepIntervalRow[]) {
  return sleepNightCandidates(classifySleepIntervals(rows))
}

function nightOn(rows: SleepIntervalRow[], date: string, sourceId?: string): SleepNightCandidate {
  const match = nights(rows).find(
    (item) => item.sleepDate === date && (sourceId == null || item.sourceId === sourceId),
  )
  if (!match) {
    throw new Error(`missing candidate ${date} ${sourceId ?? ''}`)
  }
  return match
}

describe('sleep category and source identity', () => {
  it('normalizes import asleep to asleep_unspecified and ignores unknown categories', () => {
    expect(normalizeSleepAnalyticsCategory('asleep')).toBe('asleep_unspecified')
    expect(normalizeSleepAnalyticsCategory('HKCategoryValueSleepAnalysisAsleepCore', 'HKCategoryValueSleepAnalysisAsleepCore')).toBe(
      'core',
    )
    expect(normalizeSleepAnalyticsCategory('future_hypnagogic')).toBeNull()
    expect(nights([interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '06:00:00'), stage: 'mystery' })])).toEqual(
      [],
    )
  })

  it('groups Apple Watch variants by logical source, not HKDevice pointers', () => {
    const a = logicalSleepSource("Jacob’s\u00a0Apple Watch")
    const b = logicalSleepSource("Jacob's Apple Watch")
    const c = logicalSleepSource('Circular')
    expect(a).toEqual({ key: 'apple_watch', name: 'Apple Watch' })
    expect(b).toEqual({ key: 'apple_watch', name: 'Apple Watch' })
    expect(c).toEqual({ key: 'circular', name: 'Circular' })
    expect(SLEEP_SESSION_GAP_MINUTES).toBe(90)
  })
})

describe('sleep episodes and night date', () => {
  it('assigns a cross-midnight episode to the Phoenix wake date', () => {
    const date = sleepDateFromEnd(phoenix('09/22/2026', '07:02:00'))
    expect(date).toBe('2026-09-22')
    const candidate = nightOn(
      [
        interval({
          startAt: phoenix('09/21/2026', '23:10:00'),
          endAt: phoenix('09/22/2026', '07:02:00'),
          stage: 'asleep',
        }),
      ],
      '2026-09-22',
    )
    expect(candidate.sleepDate).toBe('2026-09-22')
    expect(candidate.totalSleepMinutes).toBeCloseTo(7 * 60 + 52)
  })

  it('keeps contiguous stage intervals in one episode', () => {
    const rows = [
      interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '01:00:00'), stage: 'core' }),
      interval({ startAt: phoenix('09/22/2026', '01:00:00'), endAt: phoenix('09/22/2026', '02:00:00'), stage: 'deep' }),
      interval({ startAt: phoenix('09/22/2026', '02:00:00'), endAt: phoenix('09/22/2026', '03:00:00'), stage: 'rem' }),
    ]
    const episodes = sessionizeSleepEpisodes(classifySleepIntervals(rows))
    expect(episodes).toHaveLength(1)
    expect(episodes[0]?.sleepDate).toBe('2026-09-22')
  })

  it('keeps a 90-minute gap in the same episode and splits after 90', () => {
    const same = sessionizeSleepEpisodes(
      classifySleepIntervals([
        interval({ startAt: phoenix('09/21/2026', '22:00:00'), endAt: phoenix('09/21/2026', '23:00:00'), stage: 'core' }),
        interval({ startAt: phoenix('09/22/2026', '00:30:00'), endAt: phoenix('09/22/2026', '01:30:00'), stage: 'core' }),
      ]),
    )
    expect(same).toHaveLength(1)

    const split = sessionizeSleepEpisodes(
      classifySleepIntervals([
        interval({ startAt: phoenix('09/21/2026', '22:00:00'), endAt: phoenix('09/21/2026', '23:00:00'), stage: 'core' }),
        interval({ startAt: phoenix('09/22/2026', '00:31:00'), endAt: phoenix('09/22/2026', '01:31:00'), stage: 'core' }),
      ]),
    )
    expect(split).toHaveLength(2)
  })
})

describe('sleep night candidates', () => {
  it('does not double-count overlapping asleep or in-bed intervals', () => {
    const candidate = nightOn(
      [
        interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '01:00:00'), stage: 'core' }),
        interval({ startAt: phoenix('09/22/2026', '00:00:00'), endAt: phoenix('09/22/2026', '02:00:00'), stage: 'asleep' }),
        interval({ startAt: phoenix('09/21/2026', '22:30:00'), endAt: phoenix('09/22/2026', '01:00:00'), stage: 'in_bed' }),
        interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '02:30:00'), stage: 'in_bed' }),
      ],
      '2026-09-22',
    )
    expect(candidate.totalSleepMinutes).toBe(180)
    expect(candidate.unspecifiedSleepMinutes).toBe(120)
    expect(candidate.coreMinutes).toBe(120)
    expect(candidate.timeInBedMinutes).toBe(240)
  })

  it('treats in-bed-only evidence as not actual sleep and leaves missing stages NULL', () => {
    const candidate = nightOn(
      [interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '07:00:00'), stage: 'in_bed' })],
      '2026-09-22',
    )
    expect(candidate.hasActualSleep).toBe(false)
    expect(candidate.totalSleepMinutes).toBeNull()
    expect(candidate.timeInBedMinutes).toBe(480)
    expect(candidate.awakeMinutes).toBeNull()
    expect(candidate.coreMinutes).toBeNull()
    expect(candidate.deepMinutes).toBeNull()
    expect(candidate.remMinutes).toBeNull()
    expect(candidate.unspecifiedSleepMinutes).toBeNull()
    expect(candidate.stageCoveragePct).toBeNull()
  })

  it('keeps specific stages and unspecified sleep without inventing values', () => {
    const candidate = nightOn(
      [
        interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '02:00:00'), stage: 'core' }),
        interval({ startAt: phoenix('09/22/2026', '02:00:00'), endAt: phoenix('09/22/2026', '03:00:00'), stage: 'deep' }),
        interval({ startAt: phoenix('09/22/2026', '03:00:00'), endAt: phoenix('09/22/2026', '04:00:00'), stage: 'rem' }),
        interval({ startAt: phoenix('09/22/2026', '04:00:00'), endAt: phoenix('09/22/2026', '05:00:00'), stage: 'asleep' }),
        interval({ startAt: phoenix('09/22/2026', '02:30:00'), endAt: phoenix('09/22/2026', '02:45:00'), stage: 'awake' }),
      ],
      '2026-09-22',
    )
    expect(candidate.hasActualSleep).toBe(true)
    expect(candidate.coreMinutes).toBe(180)
    expect(candidate.deepMinutes).toBe(60)
    expect(candidate.remMinutes).toBe(60)
    expect(candidate.unspecifiedSleepMinutes).toBe(60)
    expect(candidate.awakeMinutes).toBe(15)
    expect(candidate.totalSleepMinutes).toBe(360)
    expect(candidate.stageCoveragePct).toBeCloseTo((300 / 360) * 100)
    expect(candidate.timeInBedMinutes).toBeNull()
  })

  it('selects the longest actual-sleep episode for the same source and date', () => {
    const candidate = nightOn(
      [
        interval({
          startAt: phoenix('09/22/2026', '14:00:00'),
          endAt: phoenix('09/22/2026', '15:30:00'),
          stage: 'asleep',
        }),
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '06:00:00'),
          stage: 'core',
        }),
      ],
      '2026-09-22',
    )
    expect(candidate.totalSleepMinutes).toBe(420)
    expect(candidate.additionalEpisodeCount).toBe(1)
    expect(candidate.evidence.discardedEpisodeSleepMinutes).toBe(90)
  })

  it('detects exclusive-stage conflicts and stage coverage', () => {
    const candidate = nightOn(
      [
        interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '03:00:00'), stage: 'core' }),
        interval({ startAt: phoenix('09/22/2026', '02:00:00'), endAt: phoenix('09/22/2026', '04:00:00'), stage: 'deep' }),
        interval({ startAt: phoenix('09/22/2026', '04:00:00'), endAt: phoenix('09/22/2026', '05:00:00'), stage: 'asleep' }),
      ],
      '2026-09-22',
    )
    expect(candidate.totalSleepMinutes).toBe(360)
    expect(candidate.coreMinutes).toBe(240)
    expect(candidate.deepMinutes).toBe(120)
    expect(candidate.stageConflictMinutes).toBe(60)
    expect(candidate.evidence.exclusiveStageConflict).toBe(true)
    expect(candidate.stageCoveragePct).toBeCloseTo((300 / 360) * 100)
  })
})

describe('sleep source arbitration', () => {
  it('never merges providers into one synthetic night', () => {
    const rows = [
      interval({
        startAt: phoenix('09/21/2026', '23:00:00'),
        endAt: phoenix('09/22/2026', '01:00:00'),
        stage: 'core',
        sourceName: "Jacob’s Apple Watch",
      }),
      interval({
        startAt: phoenix('09/21/2026', '22:00:00'),
        endAt: phoenix('09/22/2026', '06:00:00'),
        stage: 'rem',
        sourceName: 'Circular',
      }),
    ]
    const candidates = nights(rows)
    expect(candidates).toHaveLength(2)
    const decision = arbitrateSleepNight(candidates)
    expect(decision.selected?.sourceId).toBe('apple_watch')
    expect(decision.selected?.totalSleepMinutes).toBe(120)
    expect(decision.selected?.remMinutes).toBeNull()
    expect(decision.alternatives).toHaveLength(1)
    expect(decision.alternatives[0]?.sourceId).toBe('circular')
  })

  it('selects the preferred source when it has actual sleep', () => {
    const decision = arbitrateSleepNight(
      nights([
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '06:00:00'),
          stage: 'core',
          sourceName: 'Circular',
        }),
        interval({
          startAt: phoenix('09/21/2026', '23:30:00'),
          endAt: phoenix('09/22/2026', '05:30:00'),
          stage: 'core',
          sourceName: 'iPhone',
        }),
        interval({
          startAt: phoenix('09/21/2026', '23:10:00'),
          endAt: phoenix('09/22/2026', '06:10:00'),
          stage: 'core',
          sourceName: "Jacob's Apple Watch",
        }),
      ]),
    )
    expect(decision.selected?.sourceName).toBe('Apple Watch')
    expect(decision.reason).toBe('actual_sleep_priority')
    expect(decision.topPriorityAbsent).toBe(false)
  })

  it('falls back when the preferred source is absent', () => {
    const decision = arbitrateSleepNight(
      nights([
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '06:00:00'),
          stage: 'asleep',
          sourceName: 'Sleep Cycle',
        }),
        interval({
          startAt: phoenix('09/21/2026', '22:00:00'),
          endAt: phoenix('09/22/2026', '07:00:00'),
          stage: 'asleep',
          sourceName: 'Circular',
        }),
      ]),
    )
    expect(decision.selected?.sourceName).toBe('Circular')
    expect(decision.topPriorityAbsent).toBe(true)
  })

  it('ranks an actual-sleep candidate above an in-bed-only preferred source', () => {
    const decision = arbitrateSleepNight(
      nights([
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '07:00:00'),
          stage: 'in_bed',
          sourceName: "Jacob's Apple Watch",
        }),
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '06:00:00'),
          stage: 'asleep',
          sourceName: 'Circular',
        }),
      ]),
    )
    expect(decision.selected?.sourceName).toBe('Circular')
    expect(decision.selected?.hasActualSleep).toBe(true)
    expect(decision.reason).toBe('actual_sleep_priority')
  })

  it('flags a suspicious partial preferred source without changing the selection', () => {
    const candidates = nights([
      interval({
        startAt: phoenix('09/21/2026', '23:00:00'),
        endAt: phoenix('09/22/2026', '00:40:00'),
        stage: 'core',
        sourceName: "Jacob's Apple Watch",
      }),
      interval({
        startAt: phoenix('09/21/2026', '22:45:00'),
        endAt: phoenix('09/22/2026', '06:00:00'),
        stage: 'asleep',
        sourceName: 'Circular',
      }),
    ])
    const decision = arbitrateSleepNight(candidates)
    expect(decision.selected?.sourceName).toBe('Apple Watch')
    expect(decision.selected?.totalSleepMinutes).toBe(100)
    expect(decision.suspiciousPartialPreferred).toBe(true)
    expect(decision.longestAlternativeMinutes).toBe(435)
    expect(decision.chosenRatio).toBeCloseTo(100 / 435)
    expect(isSuspiciousPartialPreferred(decision.selected!, decision.alternatives)).toBe(true)
  })
})

describe('sleep range analytics', () => {
  it('averages only nights where the metric is observed and leaves missing NULL', () => {
    const finalized: SleepNightCandidate[] = [
      nightOn(
        [interval({ startAt: phoenix('09/20/2026', '23:00:00'), endAt: phoenix('09/21/2026', '07:00:00'), stage: 'core' })],
        '2026-09-21',
      ),
      nightOn(
        [interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '07:00:00'), stage: 'in_bed' })],
        '2026-09-22',
      ),
    ]
    const summary = sleepRangeSummary(finalized, '2026-09-21', '2026-09-22')
    expect(summary.calendarNights).toBe(2)
    expect(summary.observedSleepNights).toBe(1)
    expect(summary.averageTotalSleepMinutes.status).toBe('available')
    if (summary.averageTotalSleepMinutes.status === 'available') {
      expect(summary.averageTotalSleepMinutes.value).toBe(480)
    }
    expect(summary.averageTimeInBedMinutes.status).toBe('available')
    if (summary.averageTimeInBedMinutes.status === 'available') {
      expect(summary.averageTimeInBedMinutes.value).toBe(480)
    }
  })

  it('requires four observed nights in each 7-night window', () => {
    const rows: SleepIntervalRow[] = []
    for (let day = 1; day <= 6; day += 1) {
      const next = day + 1
      rows.push(
        interval({
          startAt: phoenix(`09/${String(day).padStart(2, '0')}/2026`, '23:00:00'),
          endAt: phoenix(`09/${String(next).padStart(2, '0')}/2026`, '07:00:00'),
          stage: 'asleep',
        }),
      )
    }
    const change = sleepShortTermChange(nights(rows))
    expect(change.totalSleep.status).toBe('insufficient_data')
  })
})
