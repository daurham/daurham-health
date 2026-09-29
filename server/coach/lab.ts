import { randomUUID } from 'node:crypto'
import {
  coachLabSnoozedUntil,
  coachLabSnoozeSchema,
  deriveCoachLabItems,
  selectVisibleCoachLabItems,
  type CoachLabItem,
  type CoachLabSnooze,
} from '../../src/domain/coach-lab.js'
import { benchmarkIdsWithActionableExperiment } from '../../src/domain/lab-retests.js'
import { type Sql } from '../db.js'
import { HttpError } from '../http.js'
import { listBenchmarkRetests, listRetestExperimentLinks } from '../lab/retests.js'
import { listExperimentSuggestions, loadSuggestionInput } from '../lab/suggestions.js'

/** Lab owns eligibility; Coach owns only bounded presentation and snoozes. */
export async function deriveCurrentCoachLabItems(date: string): Promise<CoachLabItem[]> {
  const [retests, suggestions, links] = await Promise.all([
    listBenchmarkRetests(date),
    listExperimentSuggestions(() => loadSuggestionInput(date)),
    listRetestExperimentLinks(),
  ])
  return deriveCoachLabItems({
    retests: retests.retests,
    suggestions: suggestions.suggestions,
    coveredBenchmarkIds: benchmarkIdsWithActionableExperiment(links),
  })
}

async function loadSnoozes(sql: Sql): Promise<CoachLabSnooze[]> {
  const rows = (await sql.query(
    `SELECT item_kind, source_key, source_fingerprint, snoozed_until::text AS snoozed_until
       FROM coach_lab_snoozes`,
  )) as Array<{ item_kind: CoachLabItem['kind']; source_key: string; source_fingerprint: string; snoozed_until: string }>
  return rows.map((row) => ({
    kind: row.item_kind,
    sourceKey: row.source_key,
    sourceFingerprint: row.source_fingerprint,
    snoozedUntil: row.snoozed_until,
  }))
}

export async function loadCoachLabState(sql: Sql, date: string) {
  const [items, snoozes] = await Promise.all([deriveCurrentCoachLabItems(date), loadSnoozes(sql)])
  return selectVisibleCoachLabItems(items, snoozes, date)
}

/** Revalidate all eligible items before limiting/hiding them; retries can target a hidden item. */
export async function snoozeCoachLabPresentation(sql: Sql, body: unknown, date: string, now: Date): Promise<string> {
  const parsed = coachLabSnoozeSchema.safeParse(body)
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid Lab item')
  const input = parsed.data
  const items = await deriveCurrentCoachLabItems(date)
  if (!items.some((item) => item.kind === input.kind && item.sourceKey === input.sourceKey &&
    item.sourceFingerprint === input.sourceFingerprint)) {
    throw new HttpError(409, 'This Lab opportunity has changed. Refresh Coach and try again.')
  }
  // Identity includes fingerprint, so racing against a canonical Lab change can
  // only store harmless presentation state for the old fingerprint, never hide
  // the new opportunity. Concurrent identical retries keep the original date.
  const rows = (await sql.query(
    `INSERT INTO coach_lab_snoozes (
       id, item_kind, source_key, source_fingerprint, snoozed_until, created_at, updated_at
     ) VALUES ($1::uuid, $2, $3, $4, $5::date, $6::timestamptz, $6::timestamptz)
     ON CONFLICT (item_kind, source_key, source_fingerprint) DO UPDATE
       SET snoozed_until = CASE WHEN coach_lab_snoozes.snoozed_until > $7::date
                                THEN coach_lab_snoozes.snoozed_until ELSE EXCLUDED.snoozed_until END,
           updated_at = CASE WHEN coach_lab_snoozes.snoozed_until > $7::date
                             THEN coach_lab_snoozes.updated_at ELSE EXCLUDED.updated_at END
     RETURNING snoozed_until::text AS snoozed_until`,
    [randomUUID(), input.kind, input.sourceKey, input.sourceFingerprint,
      coachLabSnoozedUntil(date), now.toISOString(), date],
  )) as Array<{ snoozed_until: string }>
  if (!rows[0]) throw new HttpError(409, 'Lab snooze could not be saved. Refresh Coach and try again.')
  return rows[0].snoozed_until
}
