import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { EVERY_DAY_MASK, WEEKDAY_BITS } from '../src/domain/supplements/index.ts'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'
import type { TodaySupplementInput } from '../src/domain/supplements/index.ts'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'
import { demoToday } from '../src/demo/repository.ts'
import { Layout } from '../src/components/Layout.tsx'
import { AuthContext, type AuthContextValue } from '../src/auth/context.ts'

const TODAY = '2026-09-26'

function sources(supplements?: TodaySupplementInput[]): TodaySources {
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
    supplements,
  }
}

function supplement(partial: Partial<TodaySupplementInput> = {}): TodaySupplementInput {
  return {
    id: 'supplement-1',
    name: 'Creatine',
    sortOrder: 0,
    schedules: [
      {
        id: 'schedule-1',
        supplementId: 'supplement-1',
        slotLabel: null,
        doseAmount: 5,
        doseUnit: 'g',
        weekdayMask: EVERY_DAY_MASK,
        effectiveFrom: '2026-01-01',
        effectiveThrough: null,
        sortOrder: 0,
      },
    ],
    events: [{ effectiveDate: '2026-01-01', status: 'active' }],
    adherence: [],
    ...partial,
  }
}

function html(input?: TodaySupplementInput[]): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <TodayBoard view={buildTodayView(sources(input))} />
    </MemoryRouter>,
  )
}

describe('today supplements', () => {
  it('omits the card when no supplements exist', () => {
    const view = buildTodayView(sources())
    expect(view.supplements).toBeNull()
    expect(html()).not.toContain('Supplements')
    expect(renderToStaticMarkup(<MemoryRouter><TodayBoard view={demoToday()} /></MemoryRouter>)).not.toContain('>Supplements<')
  })

  it('shows one unknown dose as remaining, not skipped', () => {
    const view = buildTodayView(sources([supplement()]))
    expect(view.supplements).toMatchObject({
      scheduledCount: 1,
      takenCount: 0,
      skippedCount: 0,
      unknownCount: 1,
      summary: { kind: 'remaining', unknownCount: 1 },
    })
    const markup = html([supplement()])
    expect(markup).toContain('Creatine')
    expect(markup).toContain('5 g')
    expect(markup).toContain('1 remaining')
    expect(markup).toContain('Skip')
    expect(markup).toContain('href="/supplements"')
    expect(markup).not.toContain('Skipped')
  })

  it('shows taken, skipped, and multiple scheduled occurrences', () => {
    const taken = html([
      supplement({
        adherence: [{ scheduleId: 'schedule-1', scheduledDate: TODAY, status: 'taken', actualDoseAmount: null, actualDoseUnit: null }],
      }),
    ])
    expect(taken).toContain('Supplements complete')
    expect(taken).toContain('Clear Creatine')

    const skipped = html([
      supplement({
        adherence: [{ scheduleId: 'schedule-1', scheduledDate: TODAY, status: 'skipped', actualDoseAmount: null, actualDoseUnit: null }],
      }),
    ])
    expect(skipped).toContain('Supplements recorded · 1 skipped')
    expect(skipped).toContain('Skipped')
    expect(skipped).toContain('data-state="skipped"')

    const multiple = buildTodayView(sources([
      supplement(),
      supplement({
        id: 'supplement-2',
        name: 'Vitamin D',
        sortOrder: 1,
        schedules: [
          {
            id: 'schedule-2',
            supplementId: 'supplement-2',
            slotLabel: null,
            doseAmount: 2000,
            doseUnit: 'IU',
            weekdayMask: WEEKDAY_BITS.saturday,
            effectiveFrom: '2026-01-01',
            effectiveThrough: null,
            sortOrder: 0,
          },
        ],
      }),
    ]))
    expect(multiple.supplements?.items).toHaveLength(2)
    expect(multiple.supplements?.unknownCount).toBe(2)
    expect(multiple.supplements?.scheduledCount).toBe(2)
  })

  it('omits paused and discontinued supplements and counts only unknown as remaining', () => {
    const paused = buildTodayView(sources([
      supplement({ events: [{ effectiveDate: '2026-01-01', status: 'active' }, { effectiveDate: '2026-09-01', status: 'paused' }] }),
    ]))
    expect(paused.supplements?.items).toEqual([])
    expect(paused.supplements?.unknownCount).toBe(0)
    expect(html([
      supplement({ events: [{ effectiveDate: '2026-01-01', status: 'active' }, { effectiveDate: '2026-09-01', status: 'paused' }] }),
    ])).toContain('Nothing scheduled today')

    const discontinued = buildTodayView(sources([
      supplement({ events: [{ effectiveDate: '2026-01-01', status: 'discontinued' }] }),
    ]))
    expect(discontinued.supplements?.items).toEqual([])

    const mixed = buildTodayView(sources([
      supplement({
        adherence: [{ scheduleId: 'schedule-1', scheduledDate: TODAY, status: 'taken', actualDoseAmount: null, actualDoseUnit: null }],
      }),
      supplement({
        id: 'supplement-2',
        name: 'Vitamin D',
        sortOrder: 1,
        schedules: [
          {
            id: 'schedule-2',
            supplementId: 'supplement-2',
            slotLabel: null,
            doseAmount: 2000,
            doseUnit: 'IU',
            weekdayMask: EVERY_DAY_MASK,
            effectiveFrom: '2026-01-01',
            effectiveThrough: null,
            sortOrder: 0,
          },
        ],
        adherence: [],
      }),
    ]))
    expect(mixed.supplements?.scheduledCount).toBe(2)
    expect(mixed.supplements?.takenCount).toBe(1)
    expect(mixed.supplements?.unknownCount).toBe(1)
    expect(mixed.supplements?.summary).toEqual({ kind: 'remaining', unknownCount: 1 })
  })

  it('does not add a sixth primary navigation item', () => {
    const layout = readFileSync('src/components/Layout.tsx', 'utf8')
    expect(layout).toContain("{ id: 'today'")
    expect(layout).toContain("{ id: 'progress'")
    expect(layout.match(/id: '/g)?.length).toBe(10)
    const owner: AuthContextValue = {
      status: 'owner',
      email: 'owner@example.com',
      refresh: async () => undefined,
      signOut: async () => undefined,
    }
    const markup = renderToStaticMarkup(
      <MemoryRouter>
        <AuthContext.Provider value={owner}>
          <Layout />
        </AuthContext.Provider>
      </MemoryRouter>,
    )
    expect(markup).toContain('grid-cols-5')
    expect(markup).not.toContain('href="/supplements"')
    expect(readFileSync('src/features/settings/SettingsPage.tsx', 'utf8')).toContain('to="/supplements"')
    expect(readFileSync('src/routes/index.tsx', 'utf8')).toContain("path: 'supplements'")
    expect(readFileSync('src/demo/repository.ts', 'utf8')).not.toContain('supplements')
  })
})
