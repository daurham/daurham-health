import { describe, expect, it } from 'vitest'
import {
  bodyReminderCopy,
  resolveCadence,
  selectTodayBodyReminder,
  type CadenceConfig,
  type CadenceObservation,
} from '../src/domain/body-cadence.ts'
import { calendarDateFromInstant } from '../src/domain/progress/dates.ts'
import { healthCalendarDateFromInstant } from '../src/domain/time.ts'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'

const ASOF = '2026-09-26'

function config(metricKey: string, intervalDays: number, enabledFrom = '2026-09-01'): CadenceConfig {
  return { metricKey, intervalDays, enabledFrom }
}

function observed(metricKey: string, calendarDate: string, measuredAt = `${calendarDate}T16:00:00.000Z`): CadenceObservation {
  return { metricKey, calendarDate, measuredAt }
}

describe('body measurement cadence', () => {
  it('stays quiet without a cadence and distinguishes current, due, stale, and initial', () => {
    expect(selectTodayBodyReminder([], [], ASOF)).toBeNull()
    expect(resolveCadence(config('weight', 7), [observed('weight', '2026-09-20')], ASOF)).toMatchObject({
      status: 'current',
      daysSinceLast: 6,
      daysOverdue: 0,
    })
    expect(resolveCadence(config('weight', 14), [observed('weight', '2026-09-12')], ASOF)).toMatchObject({
      status: 'due',
      lastMeasuredDate: '2026-09-12',
      dueDate: '2026-09-26',
      daysSinceLast: 14,
    })
    expect(resolveCadence(config('weight', 14), [observed('weight', '2026-09-06')], ASOF).status).toBe('due')
    expect(resolveCadence(config('weight', 14), [observed('weight', '2026-08-29')], ASOF)).toMatchObject({
      status: 'stale',
      daysSinceLast: 28,
    })
    expect(resolveCadence(config('weight', 14), [observed('weight', '2026-08-01')], ASOF).status).toBe('stale')
    expect(resolveCadence(config('waist_circumference', 14, '2026-09-20'), [], ASOF)).toMatchObject({
      status: 'initial_due',
      lastMeasuredDate: null,
      dueDate: '2026-09-20',
      daysSinceLast: null,
    })
  })

  it('uses the matching metric only and ignores future observations', () => {
    const observations = [
      observed('weight', '2026-09-20'),
      observed('waist_circumference', '2026-09-01'),
      observed('left_upper_arm_circumference', '2026-09-01'),
      observed('hip_circumference', '2026-09-27'),
    ]
    expect(resolveCadence(config('weight', 14), observations, ASOF)).toMatchObject({
      status: 'current',
      lastMeasuredDate: '2026-09-20',
    })
    expect(resolveCadence(config('hip_circumference', 14), observations, ASOF)).toMatchObject({
      status: 'initial_due',
      lastMeasuredDate: null,
    })
    expect(resolveCadence(config('right_upper_arm_circumference', 30), observations, ASOF).status).toBe('initial_due')
    expect(resolveCadence(config('left_upper_arm_circumference', 30), observations, ASOF).lastMeasuredDate).toBe('2026-09-01')
  })

  it('derives the observation date in America/Phoenix rather than UTC', () => {
    const instant = new Date('2026-09-27T06:30:00.000Z')
    expect(healthCalendarDateFromInstant(instant)).toBe('2026-09-26')
    expect(calendarDateFromInstant(instant, 'America/Phoenix')).toBe('2026-09-26')
    expect(calendarDateFromInstant(instant, 'UTC')).toBe('2026-09-27')
    const phoenix = resolveCadence(
      config('weight', 3),
      [observed('weight', calendarDateFromInstant(instant, 'America/Phoenix'), instant.toISOString())],
      '2026-09-26',
    )
    expect(phoenix).toMatchObject({ status: 'current', daysSinceLast: 0, lastMeasuredDate: '2026-09-26' })
  })

  it('picks one reminder with stale, then baseline, then due, and stable catalog order', () => {
    const staleAndDue = selectTodayBodyReminder(
      [config('waist_circumference', 14), config('hip_circumference', 14)],
      [observed('waist_circumference', '2026-09-12'), observed('hip_circumference', '2026-08-01')],
      ASOF,
    )
    expect(staleAndDue).toMatchObject({ metricKey: 'hip_circumference', status: 'stale', dueCount: 2 })
    const baselineAndDue = selectTodayBodyReminder(
      [config('waist_circumference', 14), config('neck_circumference', 14, '2026-09-01')],
      [observed('waist_circumference', '2026-09-01')],
      ASOF,
    )
    expect(baselineAndDue).toMatchObject({ metricKey: 'neck_circumference', status: 'initial_due', dueCount: 2 })
    const tied = selectTodayBodyReminder(
      [config('hip_circumference', 14), config('waist_circumference', 14)],
      [observed('waist_circumference', '2026-08-01'), observed('hip_circumference', '2026-08-01')],
      ASOF,
    )
    expect(tied?.metricKey).toBe('waist_circumference')
    const many = selectTodayBodyReminder(
      [
        config('chest_circumference', 14),
        config('waist_circumference', 14),
        config('neck_circumference', 14),
      ],
      [
        observed('chest_circumference', '2026-09-10'),
        observed('waist_circumference', '2026-09-01'),
        observed('neck_circumference', '2026-09-12'),
      ],
      ASOF,
    )
    expect(many).toMatchObject({ metricKey: 'waist_circumference', dueCount: 3 })
    expect(bodyReminderCopy(many!).more).toBe('2 other measurements due')
    expect(bodyReminderCopy({ ...many!, status: 'initial_due', daysSinceLast: null, dueCount: 1 })).toMatchObject({
      title: 'Waist baseline measurement due',
      detail: 'No measurement recorded yet',
      more: null,
    })
    expect(
      selectTodayBodyReminder([config('waist_circumference', 14, '2026-10-01')], [], ASOF),
    ).toBeNull()
  })
})

function sources(partial: Partial<TodaySources> = {}): TodaySources {
  return {
    now: new Date('2026-09-26T18:00:00.000Z'),
    activityDays: [],
    nutritionEntries: [],
    nutritionTargets: [],
    trainingToday: [],
    trainingSessions: [],
    sleepNights: [],
    latestCompleteSleep: null,
    bodyWeights: [],
    pendingJobs: [],
    ...partial,
  }
}

describe('today body reminder', () => {
  it('keeps the weight card and adds at most one reminder inside the same payload', () => {
    const plain = buildTodayView(
      sources({
        bodyWeights: [
          {
            measurementId: 'm1',
            measurementSessionId: 's1',
            key: 'weight',
            value: 85,
            unit: 'kg',
            valueKind: 'measured',
            measuredAt: '2026-09-24T16:00:00.000Z',
            timezone: 'America/Phoenix',
            calendarDate: '2026-09-24',
          },
        ],
      }),
    )
    expect(plain.body.latest?.calendarDate).toBe('2026-09-24')
    expect(plain.body.measurementDue).toBeNull()
    expect(plain.supplements).toBeNull()
    const current = buildTodayView(
      sources({
        bodyCadence: {
          configs: [config('weight', 7)],
          observations: [observed('weight', '2026-09-24')],
        },
      }),
    )
    expect(current.body.measurementDue).toBeNull()
    const due = buildTodayView(
      sources({
        bodyCadence: {
          configs: [config('waist_circumference', 14), config('neck_circumference', 14), config('chest_circumference', 14)],
          observations: [
            observed('waist_circumference', '2026-09-08'),
            observed('neck_circumference', '2026-09-10'),
            observed('chest_circumference', '2026-09-12'),
          ],
        },
      }),
    )
    expect(due.body.measurementDue).toMatchObject({
      metricKey: 'waist_circumference',
      status: 'due',
      dueCount: 3,
      daysSinceLast: 18,
    })
    expect(due.body.latest).toBeNull()
  })
})
