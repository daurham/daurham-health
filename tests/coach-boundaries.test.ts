import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GENERAL_DAILY_COACH_RULES } from '../src/domain/coach.ts'

describe('Coach H2A domain boundaries', () => {
  it('logs future run and hike quest distance into canonical Training without using Activity distance', () => {
    for (const key of ['manual:run:15m', 'manual:hike:20m']) {
      const rule = GENERAL_DAILY_COACH_RULES.find((item) => item.ruleKey === key)
      expect(rule?.training).toMatchObject({
        measurementKind: 'distance_duration',
        valueKind: 'duration_min',
        allowDistance: true,
      })
    }
    const service = readFileSync('server/coach/service.ts', 'utf8')
    expect(service).toContain('distanceUnit')
    expect(service).toContain('distance_m')
    expect(service).not.toContain('walking_running_distance_m')
  })

  it('does not turn meal prep or journaling into fake canonical Health records', () => {
    const service = readFileSync('server/coach/service.ts', 'utf8')
    expect(service).not.toContain('INSERT INTO nutrition_entries')
    expect(service).not.toContain('INSERT INTO daily_context')
    expect(service).toContain("'owner_self_report'")
    expect(service).toContain('description')
    expect(service).toContain('durationMin')
  })

  it('keeps Coach generation provider-free and demo-gated', () => {
    const service = readFileSync('server/coach/service.ts', 'utf8')
    const today = readFileSync('src/features/today/TodayPage.tsx', 'utf8')
    expect(service).not.toMatch(/gemini|home-ai|europe pmc|ai_usage/i)
    expect(today).toContain('if (readOnly) return')
    expect(today).toContain('if (!readOnly)')
  })

  it('defines database idempotency for one task per period and one lifecycle event key', () => {
    const migration = readFileSync('migrations/0035_coach_tasks.sql', 'utf8')
    expect(migration).toContain('coach_tasks_daily_period_unique')
    expect(migration).toContain('coach_tasks_weekly_period_unique')
    expect(migration).toContain('UNIQUE (task_id, idempotency_key)')
    expect(migration).toContain("event_kind IN ('offered', 'accepted', 'completed', 'passed', 'expired')")
  })
})
