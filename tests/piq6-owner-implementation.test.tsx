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

  it('requires explicit owner confirmation, matching revision and a bounded reason for correction or retraction', async () => {
    const { writeOwnerExperimentImplementationRevision } =
      await import('../server/lab/implementation.js')
    const query = vi.fn()
    const correct = {
      expectedRevision: 0, confirmCorrection: true, reason: 'Correcting the date',
      effectiveDate: '2026-10-15', behaviorChange: 'Walk after dinner',
    }
    const retract = {
      expectedRevision: 0, confirmRetraction: true, reason: 'I never actually did this',
    }
    for (const body of [
      null, {}, { ...correct, expectedRevision: -1 },
      { ...correct, expectedRevision: 1.5 }, { ...correct, expectedRevision: '0' },
      { ...correct, expectedRevision: 2147483647 },
      { ...correct, confirmCorrection: false },
      { ...correct, reason: 'x' },
      { ...correct, reason: 'x'.repeat(501) },
      { ...correct, effectiveDate: '2026-10-18' },
      { ...correct, effectiveDate: '2026-02-30' },
      { ...correct, behaviorChange: '' },
    ]) {
      await expect(writeOwnerExperimentImplementationRevision(
        fake(query), EXPERIMENT, body, TODAY, 'corrected',
      )).rejects.toMatchObject({ statusCode: 400 })
    }
    for (const body of [
      { ...retract, confirmRetraction: false },
      { ...retract, effectiveDate: '2026-10-15' },
      { ...retract, behaviorChange: 'surprise replacement' },
      { ...retract, reason: '' },
    ]) {
      await expect(writeOwnerExperimentImplementationRevision(
        fake(query), EXPERIMENT, body, TODAY, 'retracted',
      )).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(query).not.toHaveBeenCalled()
  })

  it('atomically appends a corrected snapshot with a sequential compare-and-swap revision', async () => {
    const { writeOwnerExperimentImplementationRevision } =
      await import('../server/lab/implementation.js')
    const query = vi.fn().mockResolvedValue([{ revision: 2 }])
    await writeOwnerExperimentImplementationRevision(fake(query), EXPERIMENT, {
      expectedRevision: 1, confirmCorrection: true, reason: '  Date was wrong  ',
      effectiveDate: '2026-10-15', behaviorChange: '  Walk every evening  ',
    }, TODAY, 'corrected')
    expect(query).toHaveBeenCalledTimes(1)
    const [statement, args] = query.mock.calls[0] as [string, unknown[]]
    expect(args[0]).toBe(EXPERIMENT)
    expect(args[2]).toBe(1)
    expect(args.slice(3)).toEqual([
      'corrected', '2026-10-15', 'Walk every evening', 'Date was wrong', TODAY,
    ])
    for (const sql of [
      'INSERT INTO experiment_implementation_revisions',
      'COALESCE(latest.revision, 0) = $3::int',
      'latest.action IS DISTINCT FROM \'retracted\'',
      'ON CONFLICT (experiment_id, revision) DO NOTHING',
      "lab.status IN ('active', 'completed', 'inconclusive', 'abandoned', 'superseded')",
      '$5::date <= $8::date',
      '$5::date >= lab.window_start',
      '$5::date <= lab.window_end',
    ]) expect(statement).toContain(sql)
    expect(statement).not.toContain('UPDATE experiment_implementations')
    expect(statement).not.toContain('DELETE FROM experiment_implementations')
  })

  it('appends retraction without replacement data and rejects stale or already retracted revisions', async () => {
    const { writeOwnerExperimentImplementationRevision } =
      await import('../server/lab/implementation.js')
    const query = vi.fn().mockResolvedValueOnce([{ revision: 1 }]).mockResolvedValueOnce([])
    const input = { expectedRevision: 0, confirmRetraction: true, reason: 'Never followed the plan' }
    await writeOwnerExperimentImplementationRevision(fake(query), EXPERIMENT, input, TODAY, 'retracted')
    const [, args] = query.mock.calls[0] as [string, unknown[]]
    expect(args.slice(2)).toEqual([0, 'retracted', null, null, 'Never followed the plan', TODAY])
    await expect(writeOwnerExperimentImplementationRevision(
      fake(query), EXPERIMENT, input, TODAY, 'retracted',
    )).rejects.toMatchObject({ statusCode: 409 })
  })

  it('the canonical Lab projection and linked Coach drop retracted implementation details', () => {
    const base = {
      id: EXPERIMENT, origin: 'owner_created', status: 'completed',
      window_start: '2026-10-01', window_end: '2026-10-16',
      result_id: null, classification: null,
      implementation_date: '2026-10-15',
      implementation_change: 'Prior statement should not appear',
    }
    const record = projectCoachLinkedExperiment({
      ...base, implementation_retracted: true,
    }, TODAY)!
    expect(record.implementation).toBeNull()
    expect(record.implementationRetracted).toBe(true)
    const view: CoachRecommendationView = {
      id: CARD, fingerprint: 'coach:i9:synthetic', kind: 'training_progression',
      domain: 'training', title: 'Review', detail: 'Inspect records',
      actionText: 'Review', detailPath: '/training',
      confidence: 'limited', evidenceRefs: [], responseState: null, responseAt: null,
      experimentEligible: true, linkedExperimentId: EXPERIMENT, linkedExperiment: record,
    }
    const state: CoachIntelligenceState = {
      version: 'coach-intelligence-v1', asOf: TODAY, state: 'act',
      headline: 'Review', summary: 'Inspect records', noChangeRecommended: false,
      nextBestActions: [view], followUps: [], question: null, questionBudgetDays: 3,
    }
    const html = renderToStaticMarkup(<MemoryRouter><CoachIntelligencePanel
      state={state} pending={false} onResponse={() => undefined}
      onOutcome={() => undefined} /></MemoryRouter>)
    expect(html).toContain('Owner retracted the implementation report')
    expect(html).not.toContain('Prior statement should not appear')
    expect(html).not.toContain('Owner reported changing')
    expect(html).not.toContain('>I started this</button>')
  })

  it('the journal migration keeps original reports intact and the ledger suppresses retracted claims', () => {
    const migration = readFileSync('migrations/0058_experiment_implementation_revisions.sql', 'utf8')
    const ledger = readFileSync('server/intelligence/change-ledger.ts', 'utf8')
    const lab = readFileSync('src/features/lab/ExperimentPages.tsx', 'utf8')
    const server = readFileSync('server/lab/service.ts', 'utf8')
    const coach = readFileSync('server/intelligence/coach-intelligence.ts', 'utf8')
    expect(migration).toContain('UNIQUE (experiment_id, revision)')
    expect(migration).toContain("action IN ('corrected', 'retracted')")
    expect(migration).toContain('recorded_at TIMESTAMPTZ')
    expect(ledger).toContain("latest.action IS DISTINCT FROM 'retracted'")
    expect(ledger).toContain('COALESCE(latest.effective_date, implementation.effective_date)')
    expect(coach).toContain("WHEN latest_implementation.action = 'retracted' THEN NULL")
    expect(server).toContain("implementations[0]?.action === 'retracted'")
    expect(lab).toContain('Correct report')
    expect(lab).toContain('Retract report')
    expect(lab).toContain('Review and, if appropriate, invalidate the result separately')
  })

})
