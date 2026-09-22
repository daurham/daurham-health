import { randomUUID } from 'node:crypto'
import {
  ACTIVITY_SAMPLE_ENTITY,
  ACTIVITY_WORKOUT_ENTITY,
  APPLE_HEALTH_PARSER_VERSION,
  SLEEP_INTERVAL_ENTITY,
} from '../../src/domain/apple-health/config.js'
import { boundedSourcePayload, entityTypeFor } from '../../src/domain/apple-health/ingest.js'
import type { NormalizedAppleHealthRecord } from '../../src/domain/apple-health/parse.js'
import { fingerprintForRecord } from '../../src/domain/apple-health/types.js'
import {
  CLAIM_AND_INSERT_ACTIVITY_SAMPLE_SQL,
  CLAIM_AND_INSERT_ACTIVITY_WORKOUT_SQL,
  CLAIM_AND_INSERT_SLEEP_INTERVAL_SQL,
} from './queries.js'

export type AppleHealthClaimStatement = {
  sql: string
  params: unknown[]
  fingerprint: string
  entityType: string
}

function metadataFor(record: NormalizedAppleHealthRecord): Record<string, unknown> {
  return {
    parserVersion: APPLE_HEALTH_PARSER_VERSION,
    appleType: record.appleType,
    startAt: record.startAt,
    endAt: record.endAt,
  }
}

export function buildAppleHealthClaimStatement(input: {
  sourceId: string
  jobId: string
  record: NormalizedAppleHealthRecord
  entityId?: string
  linkId?: string
}): AppleHealthClaimStatement {
  const fingerprint = input.record.fingerprint || fingerprintForRecord(input.record)
  const entityId = input.entityId ?? randomUUID()
  const linkId = input.linkId ?? randomUUID()
  const entityType = entityTypeFor(input.record)
  const payload = JSON.stringify(boundedSourcePayload(input.record))
  const meta = JSON.stringify(metadataFor(input.record))
  if (input.record.kind === 'sleep') {
    return {
      sql: CLAIM_AND_INSERT_SLEEP_INTERVAL_SQL,
      fingerprint,
      entityType: SLEEP_INTERVAL_ENTITY,
      params: [
        linkId,
        input.sourceId,
        input.jobId,
        fingerprint,
        entityType,
        entityId,
        payload,
        input.record.startAt,
        input.record.endAt,
        input.record.stage,
        input.record.sourceCategory,
        input.record.sourceName,
        input.record.sourceVersion,
        input.record.deviceName,
        meta,
      ],
    }
  }
  if (input.record.kind === 'workout') {
    return {
      sql: CLAIM_AND_INSERT_ACTIVITY_WORKOUT_SQL,
      fingerprint,
      entityType: ACTIVITY_WORKOUT_ENTITY,
      params: [
        linkId,
        input.sourceId,
        input.jobId,
        fingerprint,
        entityType,
        entityId,
        payload,
        input.record.activityType,
        input.record.startAt,
        input.record.endAt,
        input.record.durationMin,
        input.record.energyKcal,
        input.record.distanceM,
        input.record.sourceName,
        input.record.sourceVersion,
        input.record.deviceName,
        meta,
      ],
    }
  }
  return {
    sql: CLAIM_AND_INSERT_ACTIVITY_SAMPLE_SQL,
    fingerprint,
    entityType: ACTIVITY_SAMPLE_ENTITY,
    params: [
      linkId,
      input.sourceId,
      input.jobId,
      fingerprint,
      entityType,
      entityId,
      payload,
      input.record.metric,
      input.record.startAt,
      input.record.endAt,
      input.record.value,
      input.record.canonicalUnit,
      input.record.sourceUnit,
      input.record.sourceName,
      input.record.sourceVersion,
      input.record.deviceName,
      meta,
    ],
  }
}
