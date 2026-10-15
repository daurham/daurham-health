import { describe, expect, it, vi } from 'vitest'
import type { Sql } from '../server/db.js'
import {
  MAINTENANCE_DECISION_REVISION_SQL,
  isMaintenanceDecisionRevisionCurrent,
  readMaintenanceDecisionSnapshot,
} from '../server/intelligence/maintenance-revision.js'
import { compareMaintenanceDecisionRevisions } from '../src/domain/maintenance-revision.js'
import { keepCurrentCalorieDecisionDrafts, keepVisibleCoachDependencies } from '../src/domain/coach-intelligence.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildMaintenanceState, type MaintenanceAdjustmentContext } from '../src/domain/maintenance.js'
import { addCalendarDays } from '../src/domain/progress/dates.js'

const AS_OF = '2026-10-15'
const REV_A = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const REV_B = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const dates = Array.from({ length: 28 }, (_, i) => addCalendarDays('2026-09-17', i))
const checkedPerformance = {
  status: 'available' as const, asOf: AS_OF, decliningExercises: [], competingGoals: [],
}
const settings: MaintenanceAdjustmentContext = {
  status: 'available', currentCalorieTarget: 2500, activeExperimentCount: 0,
  revisionStatus: 'consistent', decisionRevision: REV_A, performance: checkedPerformance,
}
function evaluate(context: MaintenanceAdjustmentContext) {
  const observations: IntelligenceObservation[] = dates.flatMap((date) => ([
    { key: 'nutrition.calories', date, value: 2300, unit: 'kcal', quality: 'high_confidence', provenance: 'owner', sourceIds: ['food:' + date] },
    { key: 'body.weight_kg', date, value: 85, unit: 'kg', quality: 'usual', provenance: 'owner', sourceIds: ['scale:' + date] },
    { key: 'wellness.energy', date, value: 4, unit: '1–5', quality: 'usual', provenance: 'owner', sourceIds: ['checkin:' + date] },
  ]))
  const intelligence = buildHealthIntelligenceSnapshot({
    range: '30d', asOf: AS_OF, today: AS_OF, start: '2026-09-16', end: AS_OF,
    timezone: 'America/Phoenix', observations, nutritionVerifiedCompleteDates: new Set(dates),
  })
  return buildMaintenanceState({
    asOf: AS_OF, today: AS_OF, intelligence, contexts: [], eligibleNutritionDates: new Set(dates),
    weightGoal: {
      goalId: 'weight', goalVersionId: 'weight-v1', label: 'Weight',
      targetState: 'unmet', direction: 'lose',
    },
    adjustmentContext: context,
  })
}
function mockSql(rows: unknown[]) {
  const query = vi.fn().mockResolvedValueOnce(rows)
  return { query, sql: { query } as unknown as Sql }
}

describe('PIQ-1.2 decision revision and cross-read settings integrity', () => {
  it('reads target identity/version and all active goal versions from one MVCC SQL statement', () => {
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('current_target')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('calories_target')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('updated_at')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('goal_versions')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('v.is_current')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('g.status = \'active\'')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('e.protocol_version_id')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('e.status = \'scheduled\'')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('ORDER BY g.id')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('ORDER BY e.id')
    expect(MAINTENANCE_DECISION_REVISION_SQL).not.toMatch(/\b(INSERT INTO|UPDATE |DELETE FROM)\b/i)
  })

  it('accepts a valid synthetic revision fingerprint with target and experiment count', async () => {
    const { sql, query } = mockSql([{
      calorie_target: '2500', experiment_count: '0', decision_revision: REV_A,
    }])
    const snapshot = await readMaintenanceDecisionSnapshot(AS_OF, sql)
    expect(snapshot).toEqual({
      status: 'available', currentCalorieTarget: 2500, activeExperimentCount: 0, revision: REV_A,
    })
    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(MAINTENANCE_DECISION_REVISION_SQL, [AS_OF])
  })

  it('detects target edits, goal-version replacements or experiment changes between reads', async () => {
    for (const changedSetting of ['calorie-target-edit', 'weight-goal-version-change', 'new-active-experiment']) {
      const { sql } = mockSql([{ calorie_target: '2500', experiment_count: 0, decision_revision: REV_B }])
      expect(await isMaintenanceDecisionRevisionCurrent(AS_OF, REV_A, sql), changedSetting).toBe(false)
      expect(compareMaintenanceDecisionRevisions(REV_A, REV_B)).toBe('changed')
    }
  })

  it('allows identical revisions, but a missing revision or failed read never means unchanged', async () => {
    const unchanged = mockSql([{ calorie_target: 2500, experiment_count: 0, decision_revision: REV_A }])
    expect(await isMaintenanceDecisionRevisionCurrent(AS_OF, REV_A, unchanged.sql)).toBe(true)
    expect(compareMaintenanceDecisionRevisions(REV_A, REV_A)).toBe('consistent')
    expect(compareMaintenanceDecisionRevisions(REV_A, null)).toBe('unavailable')
    const failure = { query: vi.fn().mockRejectedValueOnce(new Error('db temporarily unavailable')) } as unknown as Sql
    expect(await isMaintenanceDecisionRevisionCurrent(AS_OF, REV_A, failure)).toBe(false)
    expect(await isMaintenanceDecisionRevisionCurrent(AS_OF, null, failure)).toBe(false)
  })

  it('a malformed, negative or absent target/experiment revision fails closed', async () => {
    for (const row of [
      { calorie_target: 2400, experiment_count: 0, decision_revision: null },
      { calorie_target: 2400, experiment_count: -1, decision_revision: REV_A },
      { calorie_target: 2400, experiment_count: 0, decision_revision: 'invalid' },
      { calorie_target: -1200, experiment_count: 0, decision_revision: REV_A },
    ]) {
      const { sql } = mockSql([row])
      expect((await readMaintenanceDecisionSnapshot(AS_OF, sql)).status).toBe('unavailable')
    }
  })

  it('maintains a plausible plateau while withholding numeric cut after cross-read settings change', () => {
    const baseline = evaluate(settings)
    expect(baseline.estimate.state).toBe('available')
    expect(baseline.plateau.state).toBe('plateau_likely')
    expect(baseline.calorieAdjustmentSafety.status).toBe('review_possible')
    expect(baseline.decisionRevision).toBe(REV_A)
    const raced = evaluate({ ...settings, revisionStatus: 'changed' })
    expect(raced.estimate.state).toBe('available')
    expect(raced.plateau.state).toBe('plateau_likely')
    expect(raced.calorieAdjustmentSafety.status).toBe('blocked')
    expect(raced.calorieAdjustmentSafety.reasons.join(' ')).toContain('unchanged')
    expect(raced.decisionRevision).toBeNull()
    expect(raced.interventions.some((x) => x.kind === 'review_intake_adjustment')).toBe(false)
    expect(raced.interventions.some((x) => x.kind === 'review_activity_adjustment')).toBe(false)
  })

  it('missing initial revision and failed final query cannot authorize a new calorie recommendation', () => {
    for (const context of [
      { ...settings, decisionRevision: null },
      { ...settings, revisionStatus: 'unavailable' as const },
    ]) {
      const raced = evaluate(context)
      expect(raced.calorieAdjustmentSafety.status).toBe('blocked')
      expect(raced.decisionRevision).toBeNull()
      expect(raced.interventions.find((x) => x.id === 'maintenance:review-safety')?.suggestedDeltaKcal).toBeNull()
    }
  })

  it('before persistence, stale revision strips calorie and its activity alternative but leaves unrelated Coach work', () => {
    const drafts = [
      { kind: 'review_intake_adjustment', id: 'cut' },
      { kind: 'review_activity_adjustment', id: 'alternative' },
      { kind: 'training_progression', id: 'bench' },
    ]
    expect(keepCurrentCalorieDecisionDrafts(drafts, false)).toEqual([{ kind: 'training_progression', id: 'bench' }])
    expect(keepCurrentCalorieDecisionDrafts(drafts, true)).toEqual(drafts)
    const clean = keepCurrentCalorieDecisionDrafts(drafts, false)
    expect(keepVisibleCoachDependencies(clean)).toEqual(clean)
  })
})
