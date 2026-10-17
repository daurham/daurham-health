import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Sql } from '../server/db.js'
import { writeOwnerExperimentImplementation } from '../server/lab/implementation.js'
import { projectCoachLinkedExperiment } from '../src/domain/coach-lab-lifecycle.js'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.js'
import type { CoachIntelligenceState, CoachRecommendationView } from '../src/domain/coach-intelligence.js'

const EXPERIMENT = '123e4567-e89b-42d3-a456-426614174001'
const CARD = '123e4567-e89b-42d3-a456-426614174000'
const TODAY = '2026-10-17'
const input = {
  confirmImplemented: true, effectiveDate: '2026-10-15',
  behaviorChange: 'Switched from 10 to 15 minutes of walking after dinner.',
}

function fake(query = vi.fn()) { return { query } as unknown as Sql }

describe('PIQ-6 explicit owner-reported effective implementation, independent of Lab start', () => {
  it('refuses ambiguous or absent owner confirmation before a database write', async () => {
    const query = vi.fn()
    for (const body of [
      undefined, null, {}, { ...input, confirmImplemented: false },
      { ...input, confirmImplemented: 'true' },
      { ...input, behaviorChange: '' }, { ...input, behaviorChange: ' '.repeat(5) },
      { ...input, behaviorChange: 'a'.repeat(501) },
      { ...input, effectiveDate: '2026-02-30' },
      { ...input, effectiveDate: '2026-10-18' }, { ...input, effectiveDate: 'tomorrow' },
    ]) {
      await expect(writeOwnerExperimentImplementation(fake(query), EXPERIMENT, body, TODAY))
        .rejects.toMatchObject({ statusCode: 400 })
    }
    await expect(writeOwnerExperimentImplementation(fake(query), 'bad-id', input, TODAY))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(query).not.toHaveBeenCalled()
  })

  it('uses one conditional INSERT: active state, window, calendar date, and first-write uniqueness checked atomically', async () => {
    const query = vi.fn().mockResolvedValue([{ experiment_id: EXPERIMENT }])
    await writeOwnerExperimentImplementation(fake(query), EXPERIMENT, {
      ...input, behaviorChange: '  Walk after dinner.  ',
    }, TODAY)
    expect(query).toHaveBeenCalledTimes(1)
    const [statement, args] = query.mock.calls[0] as [string, unknown[]]
    expect(args).toEqual([EXPERIMENT, '2026-10-15', 'Walk after dinner.', TODAY])
    for (const clause of [
      'INSERT INTO experiment_implementations',
      "lab.status = 'active'",
      'lab.window_start <= $2::date',
      'lab.window_end >= $2::date',
      '$2::date <= $4::date',
      'ON CONFLICT (experiment_id) DO NOTHING',
      'RETURNING experiment_id::text',
    ]) expect(statement).toContain(clause)
    expect(statement).not.toContain('UPDATE experiments')
    expect(statement).not.toContain('UPDATE nutrition_targets')
    expect(statement).not.toContain('UPDATE goals')
  })

  it('returns conflict when stale schedule, concurrent submission, or active state no longer qualifies', async () => {
    const query = vi.fn().mockResolvedValue([])
    await expect(writeOwnerExperimentImplementation(fake(query), EXPERIMENT, input, TODAY))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('does not infer implementation from active, scheduled, or elapsed experiment windows', () => {
    for (const status of ['accepted', 'scheduled', 'active', 'completed'] as const) {
      const row = projectCoachLinkedExperiment({
        id: EXPERIMENT, origin: 'owner_created', status,
        window_start: '2026-10-01', window_end: '2026-10-16',
        result_id: null, classification: null,
      }, TODAY)
      expect(row?.implementation).toBeNull()
    }
    const older = projectCoachLinkedExperiment({
      id: EXPERIMENT, origin: 'owner_created', status: 'active',
      window_start: '2026-10-01', window_end: '2026-10-16',
      implementation_date: input.effectiveDate,
      implementation_change: input.behaviorChange,
      result_id: null, classification: null,
    }, TODAY)
    expect(older?.implementation).toEqual({
      effectiveDate: input.effectiveDate, behaviorChange: input.behaviorChange,
    })
    expect(older?.resultId).toBeNull()
    expect(older?.reviewReady).toBe(true)
  })

  it('drops unverified or out-of-window implementation metadata', () => {
    const base = {
      id: EXPERIMENT, origin: 'owner_created', status: 'active',
      window_start: '2026-10-01', window_end: '2026-10-16',
      implementation_change: 'Walk after dinner',
      result_id: null, classification: null,
    }
    for (const date of ['2026-09-30', '2026-10-18', '2026-02-30', null]) {
      expect(projectCoachLinkedExperiment({
        ...base, implementation_date: date,
      }, TODAY)?.implementation).toBeNull()
    }
    expect(projectCoachLinkedExperiment({
      ...base, implementation_date: '2026-10-15', implementation_change: '',
    }, TODAY)?.implementation).toBeNull()
    expect(projectCoachLinkedExperiment({
      ...base, status: 'scheduled', implementation_date: '2026-10-15',
    }, TODAY)?.implementation).toBeNull()
    expect(projectCoachLinkedExperiment({
      ...base, implementation_date: '2026-10-15', implementation_change: 'x'.repeat(501),
    }, TODAY)?.implementation).toBeNull()
  })

  it('presents owner report in linked Coach but does not label it objectively verified', () => {
    const link = projectCoachLinkedExperiment({
      id: EXPERIMENT, origin: 'owner_created', status: 'active',
      window_start: '2026-10-01', window_end: '2026-10-16',
      implementation_date: input.effectiveDate, implementation_change: input.behaviorChange,
      result_id: null, classification: null,
    }, TODAY)!
    const card: CoachRecommendationView = {
      id: CARD, fingerprint: 'coach:i9:synthetic', kind: 'training_progression',
      domain: 'training', title: 'Review', detail: 'Check records',
      actionText: 'Review', detailPath: '/training', confidence: 'limited',
      evidenceRefs: [], responseState: null, responseAt: null,
      experimentEligible: true, linkedExperimentId: EXPERIMENT, linkedExperiment: link,
    }
    const state: CoachIntelligenceState = {
      version: 'coach-intelligence-v1', asOf: TODAY, state: 'act',
      headline: 'Review', summary: 'Check records', noChangeRecommended: false,
      nextBestActions: [card], followUps: [], question: null, questionBudgetDays: 3,
    }
    const html = renderToStaticMarkup(<MemoryRouter>
      <CoachIntelligencePanel state={state} pending={false}
        onResponse={() => undefined} onOutcome={() => undefined} />
    </MemoryRouter>)
    expect(html).toContain(input.behaviorChange)
    expect(html).toContain(input.effectiveDate)
    expect(html).toContain('This is self-reported; adherence and benefit are unverified.')
    expect(html).not.toContain('>I started this</button>')
    expect(html).not.toContain('Explore experiment')
    expect(html).not.toContain('Review recorded Lab result')
  })

  it('records a distinct explicit change-ledger provenance, not a detected shift or goal mutation', () => {
    const migration = readFileSync('migrations/0057_experiment_implementations.sql', 'utf8')
    const ledger = readFileSync('server/intelligence/change-ledger.ts', 'utf8')
    const lab = readFileSync('src/features/lab/ExperimentPages.tsx', 'utf8')
    expect(migration).toContain('experiment_id UUID PRIMARY KEY')
    expect(migration).toContain('owner_confirmed_at TIMESTAMPTZ')
    expect(ledger).toContain("kind: 'experiment_implementation'")
    expect(ledger).toContain("sourceKind: 'experiment_implementation'")
    expect(ledger).toContain("evidenceKind: 'owner_reported'")
    expect(ledger).not.toContain('experiment_implementations AS change_candidates')
    expect(lab).toContain('Record my implementation')
    expect(lab).toContain('Starting Lab did not confirm any behavior change')
  })
})
