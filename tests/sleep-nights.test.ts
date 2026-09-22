import { describe, expect, it } from 'vitest'
import { parseWallClockInTimeZone } from '../src/domain/time.ts'
import { UPSERT_SLEEP_NIGHTLY_SUMMARY_SQL } from '../server/sleep/queries.ts'
import {
  MIN_ANALYSIS_SLEEP_MINUTES,
  MIN_STAGE_COVERAGE_PCT,
  SLEEP_NIGHT_CALCULATION_VERSION,
  SLEEP_SESSION_GAP_MINUTES,
  arbitrateSleepNight,
  arbitrateSleepNights,
  classifySleepIntervals,
  classifySleepObservation,
  logicalSleepSource,
  meetsCompletenessOverride,
  normalizeSleepAnalyticsCategory,
  sessionizeSleepEpisodes,
  sleepDateFromEnd,
  sleepNightCandidates,
  sleepNightSemanticPayload,
  sleepNightlySummariesFromDecisions,
  sleepRangeSummary,
  sleepShortTermChange,
  type SleepIntervalRow,
  type SleepNightCandidate,
  type SleepNightlySummary,
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

function summaries(rows: SleepIntervalRow[]): SleepNightlySummary[] {
  return sleepNightlySummariesFromDecisions(arbitrateSleepNights(nights(rows)))
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
    expect(decision.selected?.sourceId).toBe('circular')
    expect(decision.selected?.totalSleepMinutes).toBe(480)
    expect(decision.selected?.coreMinutes).toBeNull()
    expect(decision.alternatives).toHaveLength(1)
    expect(decision.alternatives[0]?.sourceId).toBe('apple_watch')
    expect(decision.alternatives[0]?.totalSleepMinutes).toBe(120)
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
    expect(decision.selectionReason).toBe('source_priority')
    expect(decision.observationStatus).toBe('analysis_eligible')
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
    expect(decision.selectionReason).toBe('source_priority')
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
    expect(decision.selectionReason).toBe('source_priority')
    expect(decision.observationStatus).toBe('analysis_eligible')
  })
})

describe('sleep range analytics', () => {
  it('averages only nights where the metric is observed and leaves missing NULL', () => {
    const finalized = summaries([
      interval({ startAt: phoenix('09/20/2026', '23:00:00'), endAt: phoenix('09/21/2026', '07:00:00'), stage: 'core' }),
      interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '07:00:00'), stage: 'in_bed' }),
    ])
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
    const change = sleepShortTermChange(summaries(rows))
    expect(change.totalSleep.status).toBe('insufficient_data')
  })

  it('does not count partial nights toward coverage, average sleep, or 7d comparison', () => {
    const rows = [
      interval({
        startAt: phoenix('09/20/2026', '23:00:00'),
        endAt: phoenix('09/21/2026', '07:00:00'),
        stage: 'asleep',
      }),
      interval({
        startAt: phoenix('09/21/2026', '23:00:00'),
        endAt: phoenix('09/22/2026', '01:00:00'),
        stage: 'asleep',
      }),
    ]
    const finalized = summaries(rows)
    expect(finalized.map((item) => item.observationStatus)).toEqual(['analysis_eligible', 'partial_observation'])
    const summary = sleepRangeSummary(finalized, '2026-09-21', '2026-09-22')
    expect(summary.observedSleepNights).toBe(1)
    if (summary.averageTotalSleepMinutes.status === 'available') {
      expect(summary.averageTotalSleepMinutes.value).toBe(480)
    }

    const windowRows: SleepIntervalRow[] = []
    for (let day = 1; day <= 8; day += 1) {
      windowRows.push(
        interval({
          startAt: phoenix(`09/${String(day).padStart(2, '0')}/2026`, '23:00:00'),
          endAt: phoenix(`09/${String(day + 1).padStart(2, '0')}/2026`, day <= 4 ? '01:00:00' : '07:00:00'),
          stage: 'asleep',
        }),
      )
    }
    const change = sleepShortTermChange(summaries(windowRows))
    expect(change.totalSleep.status).toBe('insufficient_data')
    expect(change.previousDates).toHaveLength(0)
  })
})

describe('sleep completeness and frozen arbitration', () => {
  it('treats under 240 minutes as partial and exactly 240 as analysis eligible', () => {
    expect(MIN_ANALYSIS_SLEEP_MINUTES).toBe(240)
    expect(classifySleepObservation({ totalSleepMinutes: 239, timeInBedMinutes: null })).toBe('partial_observation')
    expect(classifySleepObservation({ totalSleepMinutes: 240, timeInBedMinutes: null })).toBe('analysis_eligible')
    const partial = summaries([
      interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '02:59:00'), stage: 'asleep' }),
    ])[0]
    const eligible = summaries([
      interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '03:00:00'), stage: 'asleep' }),
    ])[0]
    expect(partial?.observationStatus).toBe('partial_observation')
    expect(partial?.analysisEligible).toBe(false)
    expect(partial?.selectionReason).toBe('partial_only')
    expect(eligible?.observationStatus).toBe('analysis_eligible')
    expect(eligible?.analysisEligible).toBe(true)
    expect(eligible?.totalSleepMinutes).toBe(240)
  })

  it('does not let a partial preferred source beat an eligible alternative', () => {
    const decision = arbitrateSleepNight(
      nights([
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
      ]),
    )
    expect(decision.selected?.sourceName).toBe('Circular')
    expect(decision.selected?.totalSleepMinutes).toBe(435)
    expect(decision.selectionReason).toBe('source_priority')
    expect(decision.analysisEligible).toBe(true)
  })

  it('applies completeness override only when both thresholds are met', () => {
    const override = arbitrateSleepNight(
      nights([
        interval({
          startAt: phoenix('04/01/2021', '23:00:00'),
          endAt: phoenix('04/02/2021', '04:02:00'),
          stage: 'asleep',
          sourceName: "Jacob's Apple Watch",
        }),
        interval({
          startAt: phoenix('04/01/2021', '22:00:00'),
          endAt: phoenix('04/02/2021', '07:16:00'),
          stage: 'asleep',
          sourceName: 'Sleep Cycle',
        }),
      ]),
    )
    expect(override.selected?.sourceName).toBe('Sleep Cycle')
    expect(override.selectionReason).toBe('completeness_override')
    expect(override.completenessOverride).toBe(true)
    expect(meetsCompletenessOverride(302, 556)).toBe(true)

    const ratioOnly = arbitrateSleepNight(
      nights([
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '05:00:00'),
          stage: 'asleep',
          sourceName: "Jacob's Apple Watch",
        }),
        interval({
          startAt: phoenix('09/21/2026', '22:00:00'),
          endAt: phoenix('09/22/2026', '06:30:00'),
          stage: 'asleep',
          sourceName: 'Circular',
        }),
      ]),
    )
    expect(ratioOnly.selected?.sourceName).toBe('Apple Watch')
    expect(ratioOnly.selectionReason).toBe('source_priority')
    expect(meetsCompletenessOverride(360, 510)).toBe(false)

    const diffOnly = arbitrateSleepNight(
      nights([
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '04:20:00'),
          stage: 'asleep',
          sourceName: "Jacob's Apple Watch",
        }),
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '05:40:00'),
          stage: 'asleep',
          sourceName: 'Circular',
        }),
      ]),
    )
    expect(diffOnly.selected?.sourceName).toBe('Apple Watch')
    expect(diffOnly.selectionReason).toBe('source_priority')
    expect(meetsCompletenessOverride(320, 400)).toBe(false)
  })

  it('selects the longest partial when no eligible source exists, using source priority on ties', () => {
    const longest = arbitrateSleepNight(
      nights([
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '01:00:00'),
          stage: 'asleep',
          sourceName: "Jacob's Apple Watch",
        }),
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '02:00:00'),
          stage: 'asleep',
          sourceName: 'Circular',
        }),
      ]),
    )
    expect(longest.selected?.sourceName).toBe('Circular')
    expect(longest.selectionReason).toBe('partial_only')
    expect(longest.analysisEligible).toBe(false)
    expect(longest.observationStatus).toBe('partial_observation')

    const tied = arbitrateSleepNight(
      nights([
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '01:00:00'),
          stage: 'asleep',
          sourceName: 'Circular',
        }),
        interval({
          startAt: phoenix('09/21/2026', '23:30:00'),
          endAt: phoenix('09/22/2026', '01:30:00'),
          stage: 'asleep',
          sourceName: "Jacob's Apple Watch",
        }),
      ]),
    )
    expect(tied.selected?.sourceName).toBe('Apple Watch')
    expect(tied.selectionReason).toBe('partial_only')
  })

  it('falls back to preferred In-Bed-only when there is no actual sleep', () => {
    const decision = arbitrateSleepNight(
      nights([
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '07:00:00'),
          stage: 'in_bed',
          sourceName: 'iPhone',
        }),
        interval({
          startAt: phoenix('09/21/2026', '23:00:00'),
          endAt: phoenix('09/22/2026', '06:00:00'),
          stage: 'in_bed',
          sourceName: "Jacob's Apple Watch",
        }),
      ]),
    )
    expect(decision.selected?.sourceName).toBe('Apple Watch')
    expect(decision.selectionReason).toBe('in_bed_only')
    expect(decision.observationStatus).toBe('in_bed_only')
    expect(decision.selected?.totalSleepMinutes).toBeNull()
    expect(decision.analysisEligible).toBe(false)
  })

  it('excludes stage coverage below 90% and exclusive-stage conflicts from stage analytics', () => {
    expect(MIN_STAGE_COVERAGE_PCT).toBe(90)
    const lowCoverage = summaries([
      interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '03:00:00'), stage: 'core' }),
      interval({ startAt: phoenix('09/22/2026', '03:00:00'), endAt: phoenix('09/22/2026', '07:00:00'), stage: 'asleep' }),
    ])[0]
    expect(lowCoverage?.analysisEligible).toBe(true)
    expect(lowCoverage?.stageCoveragePct).toBe(50)
    expect(lowCoverage?.stageAnalysisEligible).toBe(false)

    const highCoverage = summaries([
      interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '06:12:00'), stage: 'core' }),
      interval({ startAt: phoenix('09/22/2026', '06:12:00'), endAt: phoenix('09/22/2026', '07:00:00'), stage: 'asleep' }),
    ])[0]
    expect(highCoverage?.stageCoveragePct).toBe(90)
    expect(highCoverage?.stageAnalysisEligible).toBe(true)

    const conflict = summaries([
      interval({ startAt: phoenix('09/21/2026', '23:00:00'), endAt: phoenix('09/22/2026', '06:00:00'), stage: 'core' }),
      interval({ startAt: phoenix('09/22/2026', '05:00:00'), endAt: phoenix('09/22/2026', '07:00:00'), stage: 'deep' }),
    ])[0]
    expect(conflict?.analysisEligible).toBe(true)
    expect(conflict?.stageConflictMinutes).toBeGreaterThan(0)
    expect(conflict?.stageAnalysisEligible).toBe(false)

    const range = sleepRangeSummary(
      [lowCoverage, highCoverage, conflict].filter((item): item is SleepNightlySummary => item != null),
      '2026-09-22',
      '2026-09-22',
    )
    expect(range.averageCoreMinutes.status).toBe('available')
    if (range.averageCoreMinutes.status === 'available') {
      expect(range.averageCoreMinutes.observations).toBe(1)
      expect(range.averageCoreMinutes.value).toBe(highCoverage?.coreMinutes)
    }
  })

  it('persists logical source independently of data_sources.id', () => {
    const night = summaries([
      interval({
        startAt: phoenix('09/21/2026', '23:00:00'),
        endAt: phoenix('09/22/2026', '07:00:00'),
        stage: 'asleep',
        sourceId: 'apple_health',
        sourceName: "Jacob’s Apple Watch",
        deviceName: '<<HKDevice: 0x999, softwareVersion:12.1>>',
      }),
    ])[0]
    expect(night?.logicalSourceKey).toBe('apple_watch')
    expect(night?.sourceName).toBe('Apple Watch')
    expect(night?.evidence.selectedLogicalSource).toBe('apple_watch')
    expect(night?.calculationVersion).toBe(SLEEP_NIGHT_CALCULATION_VERSION)
  })

  it('materializes the same nightly payload on a second run', () => {
    const rows = [
      interval({
        startAt: phoenix('09/21/2026', '23:00:00'),
        endAt: phoenix('09/22/2026', '07:00:00'),
        stage: 'asleep',
        sourceName: "Jacob's Apple Watch",
      }),
      interval({
        startAt: phoenix('09/21/2026', '22:00:00'),
        endAt: phoenix('09/22/2026', '06:00:00'),
        stage: 'asleep',
        sourceName: 'Circular',
      }),
    ]
    const first = summaries(rows)
    const second = summaries(rows)
    expect(first.map(sleepNightSemanticPayload)).toEqual(second.map(sleepNightSemanticPayload))
    expect(UPSERT_SLEEP_NIGHTLY_SUMMARY_SQL).toContain('ON CONFLICT (sleep_date, timezone)')
    expect(first).toHaveLength(1)
  })
})

