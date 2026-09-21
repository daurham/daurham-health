import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { BODY_MEASUREMENT_SESSION_ENTITY } from '../src/domain/body-metrics.ts'
import { buildCandidateCommitStatements } from '../server/body/fit-profile-import.ts'
import {
  CLAIM_AND_INSERT_SESSION_SQL,
  UPDATE_IMPORT_JOB_COUNTS_SQL,
  buildMetricsInsertSql,
  resolveImportJobCounts,
} from '../server/body/commit-sql.ts'
import { parseFitProfileWorkbook } from '../server/integrations/fit-profile/parse.ts'
import { fitProfileWorkbookBytes, sanitizedFitProfileRow } from './helpers/fit-profile-workbook.ts'

function candidateAt(measureTime: string) {
  const bytes = fitProfileWorkbookBytes([sanitizedFitProfileRow({ 'Measure Time': measureTime })])
  const [candidate] = parseFitProfileWorkbook(bytes, 'America/Phoenix')
  if (!candidate) {
    throw new Error('Expected a parsed candidate')
  }
  return candidate
}

describe('duplicate-safe claim SQL', () => {
  it('can claim source_record_links before the session exists because entity_id is not a foreign key', () => {
    const foundation = readFileSync(path.join('migrations', '0001_health_foundation.sql'), 'utf8')
    expect(foundation).toMatch(/entity_id UUID NOT NULL/)
    expect(foundation).not.toMatch(/entity_id UUID NOT NULL\s+REFERENCES/)
    expect(CLAIM_AND_INSERT_SESSION_SQL.indexOf('INSERT INTO source_record_links')).toBeLessThan(
      CLAIM_AND_INSERT_SESSION_SQL.indexOf('INSERT INTO body_measurement_sessions'),
    )
  })

  it('claims the fingerprint before inserting a session, and uses the claimed entity_id', () => {
    expect(CLAIM_AND_INSERT_SESSION_SQL).toMatch(
      /INSERT INTO source_record_links[\s\S]*ON CONFLICT \(source_id, external_fingerprint\) DO NOTHING[\s\S]*RETURNING entity_id/,
    )
    expect(CLAIM_AND_INSERT_SESSION_SQL).toMatch(
      /INSERT INTO body_measurement_sessions[\s\S]*SELECT\s+claimed\.entity_id/,
    )
    expect(CLAIM_AND_INSERT_SESSION_SQL).toContain('FROM claimed')
    expect(CLAIM_AND_INSERT_SESSION_SQL).not.toMatch(
      /INSERT INTO body_measurement_sessions[\s\S]*VALUES/,
    )
  })

  it('inserts metrics only when the claimed link id matches the session UUID', () => {
    const sql = buildMetricsInsertSql(2)
    expect(sql).toContain('INSERT INTO body_metrics')
    expect(sql).toMatch(
      /WHERE EXISTS \(\s*SELECT 1\s*FROM source_record_links AS claimed\s*WHERE claimed\.id = \$13::uuid\s*AND claimed\.entity_id = v\.measurement_session_id/,
    )
    expect(sql).not.toContain('body_measurement_sessions')
  })

  it('binds the generated session UUID as source_record_links.entity_id and as the metrics session id', () => {
    const candidate = candidateAt('09/20/2026 09:13:07')
    const sessionId = '11111111-1111-4111-8111-111111111111'
    const linkId = '22222222-2222-4222-8222-222222222222'
    const statements = buildCandidateCommitStatements({
      sourceId: '33333333-3333-4333-8333-333333333333',
      jobId: '44444444-4444-4444-8444-444444444444',
      candidate,
      sessionId,
      linkId,
    })

    expect(statements.claim.params[0]).toBe(linkId)
    expect(statements.claim.params[3]).toBe(candidate.fingerprint)
    expect(statements.claim.params[4]).toBe(BODY_MEASUREMENT_SESSION_ENTITY)
    expect(statements.claim.params[5]).toBe(sessionId)
    expect(statements.metrics).not.toBeNull()
    expect(statements.metrics?.params.at(-1)).toBe(linkId)
    const metricSessionIds = statements.metrics?.params.filter((_, index) => index % 6 === 1)
    expect(metricSessionIds?.every((id) => id === sessionId)).toBe(true)
    expect(metricSessionIds).not.toContain(linkId)
  })

  it('emits an independent claim for every selected candidate, including known duplicates', () => {
    const first = candidateAt('09/20/2026 09:13:07')
    const second = candidateAt('09/21/2026 09:13:07')
    expect(first.fingerprint).not.toBe(second.fingerprint)

    const statements = [first, second].map((candidate, index) =>
      buildCandidateCommitStatements({
        sourceId: '33333333-3333-4333-8333-333333333333',
        jobId: '44444444-4444-4444-8444-444444444444',
        candidate,
        sessionId: `11111111-1111-4111-8111-11111111111${index}`,
        linkId: `22222222-2222-4222-8222-22222222222${index}`,
      }),
    )

    expect(statements).toHaveLength(2)
    expect(statements[0]?.claim.sql).toBe(statements[1]?.claim.sql)
    expect(statements[0]?.claim.params[3]).toBe(first.fingerprint)
    expect(statements[1]?.claim.params[3]).toBe(second.fingerprint)
    expect(statements[0]?.claim.params[5]).not.toBe(statements[1]?.claim.params[5])
    expect(statements.every((item) => item.claim.sql.includes('ON CONFLICT'))).toBe(true)
  })
})

describe('import_jobs counts', () => {
  it('counts inserted sessions, matched claims, and unselected skips separately', () => {
    expect(
      resolveImportJobCounts({
        recordCount: 4,
        selectedCount: 3,
        unselectedCount: 1,
        insertedCount: 2,
      }),
    ).toEqual({
      recordCount: 4,
      insertedCount: 2,
      matchedCount: 1,
      skippedCount: 1,
      errorCount: 0,
    })
  })

  it('updates import_jobs from the sessions actually inserted in the job', () => {
    expect(UPDATE_IMPORT_JOB_COUNTS_SQL).toMatch(
      /inserted_count = counted\.inserted/,
    )
    expect(UPDATE_IMPORT_JOB_COUNTS_SQL).toMatch(
      /matched_count = GREATEST\(\$2::int - counted\.inserted, 0\)/,
    )
    expect(UPDATE_IMPORT_JOB_COUNTS_SQL).toContain('skipped_count = $3::int')
    expect(UPDATE_IMPORT_JOB_COUNTS_SQL).toContain('error_count = $4::int')
    expect(UPDATE_IMPORT_JOB_COUNTS_SQL).toContain(
      'FROM body_measurement_sessions',
    )
  })
})
