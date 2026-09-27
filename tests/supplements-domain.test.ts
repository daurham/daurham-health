import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/progress/dates.ts'
import {
  EVERY_DAY_MASK,
  WEEKDAY_BITS,
  aggregateOccurrenceStates,
  assertFutureScheduleEditable,
  assertRecordableOccurrence,
  buildTodaySupplementSection,
  checkboxAdherenceAction,
  lifecycleStatusOnDate,
  maskIncludesDate,
  nextAdherencePersistence,
  normalizeActualDose,
  normalizeDoseUnit,
  parseCreateSupplement,
  parseDoseDraft,
  parsePositiveAmount,
  parseWeekdayMask,
  planScheduleStop,
  planScheduleVersion,
  resolveOccurrence,
  resolveScheduleRange,
  scheduleCoversDate,
  supplementSummaryText,
  weekdayBitForCalendarDate,
  SupplementInputError,
  type ScheduleWindow,
  type StatusEventWindow,
} from '../src/domain/supplements/index.ts'
import { healthCalendarDateFromInstant } from '../src/domain/time.ts'

const ACTIVE: StatusEventWindow[] = [{ effectiveDate: '2026-01-01', status: 'active' }]

function dose(partial: Partial<ScheduleWindow> = {}): ScheduleWindow {
  return {
    id: 'schedule-1',
    supplementId: 'supplement-1',
    slotLabel: null,
    doseAmount: 5,
    doseUnit: 'g',
    weekdayMask: EVERY_DAY_MASK,
    effectiveFrom: '2026-01-01',
    effectiveThrough: null,
    sortOrder: 0,
    ...partial,
  }
}

describe('weekday mask', () => {
  it('treats Monday as bit 0 and Sunday as bit 6', () => {
    expect(weekdayBitForCalendarDate('2026-09-21')).toBe(WEEKDAY_BITS.monday)
    expect(weekdayBitForCalendarDate('2026-09-22')).toBe(WEEKDAY_BITS.tuesday)
    expect(weekdayBitForCalendarDate('2026-09-26')).toBe(WEEKDAY_BITS.saturday)
    expect(weekdayBitForCalendarDate('2026-09-20')).toBe(WEEKDAY_BITS.sunday)
    expect(weekdayBitForCalendarDate('2026-09-27')).toBe(WEEKDAY_BITS.sunday)
    expect(EVERY_DAY_MASK).toBe(127)
  })

  it('selects weekdays without using the host timezone', () => {
    const mondayWednesdayFriday = WEEKDAY_BITS.monday | WEEKDAY_BITS.wednesday | WEEKDAY_BITS.friday
    expect(maskIncludesDate(mondayWednesdayFriday, '2026-09-21')).toBe(true)
    expect(maskIncludesDate(mondayWednesdayFriday, '2026-09-23')).toBe(true)
    expect(maskIncludesDate(mondayWednesdayFriday, '2026-09-25')).toBe(true)
    expect(maskIncludesDate(mondayWednesdayFriday, '2026-09-22')).toBe(false)
    expect(maskIncludesDate(mondayWednesdayFriday, '2026-09-27')).toBe(false)
  })

  it('uses the America/Phoenix calendar date across the UTC boundary', () => {
    const instant = new Date('2026-09-27T06:30:00.000Z')
    const phoenixDate = healthCalendarDateFromInstant(instant)
    expect(phoenixDate).toBe('2026-09-26')
    expect(weekdayBitForCalendarDate(phoenixDate)).toBe(WEEKDAY_BITS.saturday)
    expect(maskIncludesDate(WEEKDAY_BITS.sunday, phoenixDate)).toBe(false)
    expect(maskIncludesDate(WEEKDAY_BITS.saturday, phoenixDate)).toBe(true)
  })
})

describe('schedule coverage', () => {
  it('respects effective_from, effective_through, and a future schedule', () => {
    const schedule = dose({ effectiveFrom: '2026-04-01', effectiveThrough: '2026-04-30' })
    expect(scheduleCoversDate(schedule, '2026-03-31')).toBe(false)
    expect(scheduleCoversDate(schedule, '2026-04-01')).toBe(true)
    expect(scheduleCoversDate(schedule, '2026-04-30')).toBe(true)
    expect(scheduleCoversDate(schedule, '2026-05-01')).toBe(false)
    expect(scheduleCoversDate(dose({ effectiveFrom: '2026-09-27' }), '2026-09-26')).toBe(false)
  })

  it('keeps a historical dose when a later version starts', () => {
    const january = dose({ id: 'five', doseAmount: 5, effectiveFrom: '2026-01-01', effectiveThrough: '2026-03-31' })
    const april = dose({ id: 'three', doseAmount: 3, effectiveFrom: '2026-04-01' })
    expect(resolveOccurrence({ events: ACTIVE, schedule: january, date: '2026-01-15', adherence: null })).toBe('unknown')
    expect(january.doseAmount).toBe(5)
    expect(resolveOccurrence({ events: ACTIVE, schedule: april, date: '2026-01-15', adherence: null })).toBe('not_scheduled')
    expect(resolveOccurrence({ events: ACTIVE, schedule: april, date: '2026-04-02', adherence: null })).toBe('unknown')
    expect(april.doseAmount).toBe(3)
  })

  it('allows different doses on different weekdays and multiple slots on one day', () => {
    const creatineMorning = dose({ id: 'morning', slotLabel: 'Morning', doseAmount: 5, weekdayMask: EVERY_DAY_MASK })
    const creatineEvening = dose({ id: 'evening', slotLabel: 'Evening', doseAmount: 3, weekdayMask: EVERY_DAY_MASK, sortOrder: 1 })
    const vitaminD = dose({
      id: 'd',
      supplementId: 'vitamin-d',
      doseAmount: 2000,
      doseUnit: 'IU',
      weekdayMask: WEEKDAY_BITS.monday | WEEKDAY_BITS.wednesday | WEEKDAY_BITS.friday,
    })
    expect(scheduleCoversDate(vitaminD, '2026-09-21')).toBe(true)
    expect(scheduleCoversDate(vitaminD, '2026-09-22')).toBe(false)
    const section = buildTodaySupplementSection('2026-09-21', [
      {
        id: 'supplement-1',
        name: 'Creatine',
        sortOrder: 0,
        schedules: [creatineEvening, creatineMorning],
        events: ACTIVE,
        adherence: [],
      },
      {
        id: 'vitamin-d',
        name: 'Vitamin D',
        sortOrder: 1,
        schedules: [vitaminD],
        events: ACTIVE,
        adherence: [],
      },
    ])
    expect(section?.items.map((item) => [item.name, item.slotLabel, item.plannedDoseAmount])).toEqual([
      ['Creatine', 'Morning', 5],
      ['Creatine', 'Evening', 3],
      ['Vitamin D', null, 2000],
    ])
  })
})

describe('lifecycle and adherence resolution', () => {
  const schedule = dose()

  it('starts active on the first status event and stays unknown without an adherence row', () => {
    expect(lifecycleStatusOnDate([], '2026-09-26')).toBeNull()
    expect(lifecycleStatusOnDate(ACTIVE, '2025-12-31')).toBeNull()
    expect(resolveOccurrence({ events: [], schedule, date: '2026-09-26', adherence: null })).toBe('not_scheduled')
    expect(resolveOccurrence({ events: ACTIVE, schedule, date: '2026-09-26', adherence: null })).toBe('unknown')
  })

  it('does not turn a paused, discontinued, or unscheduled day into skipped', () => {
    const events: StatusEventWindow[] = [
      { effectiveDate: '2026-01-01', status: 'active' },
      { effectiveDate: '2026-05-01', status: 'paused' },
      { effectiveDate: '2026-05-11', status: 'active' },
      { effectiveDate: '2026-06-01', status: 'discontinued' },
      { effectiveDate: '2026-08-12', status: 'active' },
    ]
    expect(resolveOccurrence({ events, schedule, date: '2026-05-05', adherence: null })).toBe('paused')
    expect(resolveOccurrence({ events, schedule, date: '2026-05-05', adherence: { status: 'taken' } })).toBe('paused')
    expect(resolveOccurrence({ events, schedule, date: '2026-06-15', adherence: null })).toBe('not_scheduled')
    expect(resolveOccurrence({ events, schedule, date: '2026-08-12', adherence: null })).toBe('unknown')
    expect(resolveOccurrence({ events, schedule, date: '2026-05-12', adherence: null })).toBe('unknown')
    const mondayOnly = dose({ weekdayMask: WEEKDAY_BITS.monday })
    expect(resolveOccurrence({ events: ACTIVE, schedule: mondayOnly, date: '2026-09-22', adherence: null })).toBe('not_scheduled')
  })

  it('records taken, skipped, and clear without inventing a skip', () => {
    expect(resolveOccurrence({ events: ACTIVE, schedule, date: '2026-09-25', adherence: { status: 'taken' } })).toBe('taken')
    expect(resolveOccurrence({ events: ACTIVE, schedule, date: '2026-09-25', adherence: { status: 'skipped' } })).toBe('skipped')
    expect(resolveOccurrence({ events: ACTIVE, schedule, date: '2026-09-25', adherence: null })).toBe('unknown')
    expect(checkboxAdherenceAction('unknown')).toBe('taken')
    expect(checkboxAdherenceAction('taken')).toBe('clear')
    expect(checkboxAdherenceAction('skipped')).toBe('taken')
    expect(nextAdherencePersistence('taken')).toBe('upsert')
    expect(nextAdherencePersistence('skipped')).toBe('upsert')
    expect(nextAdherencePersistence('clear')).toBe('delete')
  })

  it('keeps unknown evidence separate from skips in adherence counts', () => {
    const states = [
      ...Array.from({ length: 92 }, () => 'taken' as const),
      ...Array.from({ length: 5 }, () => 'skipped' as const),
      ...Array.from({ length: 8 }, () => 'unknown' as const),
      'paused' as const,
      'not_scheduled' as const,
    ]
    const summary = aggregateOccurrenceStates(states)
    expect(summary).toMatchObject({
      scheduledCount: 105,
      takenCount: 92,
      skippedCount: 5,
      unknownCount: 8,
      recordedCount: 97,
    })
    expect(summary.unknownCount).toBe(summary.scheduledCount - summary.takenCount - summary.skippedCount)
    expect(summary.adherenceRatio).toBeCloseTo(92 / 105)
    expect(summary.captureCoverageRatio).toBeCloseTo(97 / 105)
    const range = resolveScheduleRange({
      schedules: [schedule],
      events: [{ effectiveDate: '2026-09-20', status: 'active' }, { effectiveDate: '2026-09-22', status: 'paused' }],
      adherence: [],
      start: '2026-09-20',
      end: '2026-09-22',
    })
    expect(range).toEqual(['unknown', 'unknown', 'paused'])
    expect(aggregateOccurrenceStates(range).skippedCount).toBe(0)
    expect(aggregateOccurrenceStates(range).unknownCount).toBe(2)
  })
})

describe('supplement validation and schedule versioning', () => {
  it('rejects a blank name, non-positive dose, blank unit, bad mask, and inverted interval', () => {
    expect(() => parseCreateSupplement({ name: '   ' }, '2026-09-26')).toThrow(SupplementInputError)
    expect(() => parsePositiveAmount(0, 'Dose')).toThrow(/greater than zero/)
    expect(() => parsePositiveAmount(-1, 'Dose')).toThrow(/greater than zero/)
    expect(() => parseDoseDraft({ doseAmount: 5, doseUnit: '   ', weekdayMask: 127, effectiveFrom: '2026-09-26' }, '2026-09-26')).toThrow(/Dose unit/)
    expect(() => parseWeekdayMask(0)).toThrow(/weekday/)
    expect(() => parseWeekdayMask(128)).toThrow(/weekday/)
    expect(() => parseWeekdayMask(1.5)).toThrow(/weekday/)
    expect(() => parseDoseDraft({
      doseAmount: 5,
      doseUnit: 'g',
      weekdayMask: 127,
      effectiveFrom: '2026-09-26',
      effectiveThrough: '2026-09-25',
    }, '2026-09-26')).toThrow(/End date/)
  })

  it('normalizes obvious units and pairs actual dose amount with unit', () => {
    expect(normalizeDoseUnit(' Grams ')).toBe('g')
    expect(normalizeDoseUnit('IU')).toBe('IU')
    expect(normalizeDoseUnit('ml')).toBe('mL')
    expect(normalizeDoseUnit('tablets')).toBe('tablet')
    expect(normalizeDoseUnit('Spray')).toBe('Spray')
    expect(normalizeActualDose(null, null)).toEqual({ amount: null, unit: null })
    expect(normalizeActualDose(2, 'capsules')).toEqual({ amount: 2, unit: 'capsule' })
    expect(() => normalizeActualDose(2, null)).toThrow(/both an amount and a unit/)
    expect(() => normalizeActualDose(null, 'g')).toThrow(/both an amount and a unit/)
    expect(() => normalizeActualDose(0, 'g')).toThrow(/greater than zero/)
  })

  it('rejects future adherence and a dose that is not scheduled that day', () => {
    const schedule = dose({ weekdayMask: WEEKDAY_BITS.monday })
    expect(() => assertRecordableOccurrence({
      schedule,
      events: ACTIVE,
      scheduledDate: '2026-09-27',
      today: '2026-09-26',
      supplementId: schedule.supplementId,
    })).toThrow(/Future adherence/)
    expect(() => assertRecordableOccurrence({
      schedule,
      events: ACTIVE,
      scheduledDate: '2026-09-22',
      today: '2026-09-26',
      supplementId: schedule.supplementId,
    })).toThrow(/not scheduled/)
    expect(() => assertRecordableOccurrence({
      schedule: dose(),
      events: [{ effectiveDate: '2026-01-01', status: 'active' }, { effectiveDate: '2026-09-01', status: 'paused' }],
      scheduledDate: '2026-09-26',
      today: '2026-09-26',
      supplementId: 'supplement-1',
    })).toThrow(/paused/)
    expect(() => assertRecordableOccurrence({
      schedule: dose(),
      events: ACTIVE,
      scheduledDate: '2026-09-26',
      today: '2026-09-26',
      supplementId: 'other',
    })).toThrow(/does not belong/)
  })

  it('closes the prior schedule when a dose changes and rejects a rewrite of recorded adherence', () => {
    const open = { effectiveFrom: '2026-01-01', effectiveThrough: null }
    expect(planScheduleVersion({
      schedule: open,
      effectiveFrom: '2026-04-01',
      adherenceDates: ['2026-03-31'],
    })).toEqual({ closeThrough: '2026-03-31' })
    expect(addCalendarDays('2026-04-01', -1)).toBe('2026-03-31')
    expect(() => planScheduleVersion({
      schedule: open,
      effectiveFrom: '2026-04-01',
      adherenceDates: ['2026-04-02'],
    })).toThrow(/recorded adherence/)
    expect(() => planScheduleVersion({
      schedule: { effectiveFrom: '2026-01-01', effectiveThrough: '2026-03-31' },
      effectiveFrom: '2026-04-01',
      adherenceDates: [],
    })).toThrow(/already closed/)
    expect(planScheduleStop({
      schedule: open,
      stopOn: '2026-05-01',
      adherenceDates: ['2026-04-30'],
    })).toEqual({ action: 'close', effectiveThrough: '2026-04-30' })
    expect(() => assertFutureScheduleEditable({
      schedule: { effectiveFrom: '2026-09-26' },
      asOf: '2026-09-26',
      adherenceDates: [],
    })).toThrow(/already taken effect/)
    expect(() => assertFutureScheduleEditable({
      schedule: { effectiveFrom: '2026-09-27' },
      asOf: '2026-09-26',
      adherenceDates: [],
    })).not.toThrow()
  })
})

describe('today supplement copy', () => {
  it('counts only unknown doses as remaining', () => {
    expect(supplementSummaryText({ kind: 'remaining', unknownCount: 1 })).toBe('1 remaining')
    expect(supplementSummaryText({ kind: 'complete' })).toBe('Supplements complete')
    expect(supplementSummaryText({ kind: 'recorded', skippedCount: 1 })).toBe('Supplements recorded · 1 skipped')
    expect(supplementSummaryText({ kind: 'unscheduled' })).toBe('Nothing scheduled today')
  })
})
