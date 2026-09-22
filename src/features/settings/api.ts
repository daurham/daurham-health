import { z } from 'zod'
import { APPLE_HEALTH_COMMIT_BATCH } from '@/domain/apple-health/config'
import type { NormalizedAppleHealthRecord } from '@/domain/apple-health/parse'
import type { AppleHealthPreview } from '@/domain/apple-health/preview'
import { healthFetch, readApiError } from '@/lib'

const statusSchema = z.object({
  sourceKey: z.literal('apple_health'),
  job: z
    .object({
      id: z.string(),
      importedAt: z.string(),
      sourceFilename: z.string().nullable(),
      formatVersion: z.string().nullable(),
      status: z.string(),
      recordCount: z.number(),
      insertedCount: z.number(),
      matchedCount: z.number(),
      skippedCount: z.number(),
      errorCount: z.number(),
      activityCount: z.number(),
      sleepCount: z.number(),
      workoutCount: z.number(),
      metadata: z.record(z.string(), z.unknown()),
    })
    .nullable(),
  autoExport: z
    .object({
      importedAt: z.string(),
      status: z.string(),
      latestDay: z.string().nullable(),
    })
    .nullable(),
  activitySampleCount: z.number(),
})

const previewLookupSchema = z.object({
  existingFingerprints: z.array(z.string()),
  duplicateCount: z.number(),
})

const commitSchema = z.object({
  jobId: z.string(),
  insertedCount: z.number(),
  matchedCount: z.number(),
  status: z.string(),
})

export type AppleHealthStatus = z.infer<typeof statusSchema>
export type AppleHealthCommitBatchResult = z.infer<typeof commitSchema>

export async function fetchAppleHealthStatus(): Promise<AppleHealthStatus> {
  const response = await healthFetch('/api/apple-health/import/status')
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return statusSchema.parse(await response.json())
}

export async function lookupAppleHealthDuplicates(fingerprints: string[]): Promise<string[]> {
  const existing: string[] = []
  for (let offset = 0; offset < fingerprints.length; offset += 2000) {
    const chunk = fingerprints.slice(offset, offset + 2000)
    const response = await healthFetch('/api/apple-health/import/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fingerprints: chunk }),
    })
    if (!response.ok) {
      throw new Error(await readApiError(response))
    }
    existing.push(...previewLookupSchema.parse(await response.json()).existingFingerprints)
  }
  return existing
}

export async function commitAppleHealthRecords(
  preview: AppleHealthPreview,
  records: NormalizedAppleHealthRecord[],
  onProgress?: (done: number, total: number) => void,
) {
  const summary = {
    exportDate: preview.exportDate,
    dateRange: preview.dateRange,
    sources: preview.sources,
    devices: preview.devices,
    unknownSleepCategories: preview.unknownSleepCategories,
    overlappingActivityGroups: preview.overlappingActivityGroups,
    counts: preview.counts,
  }
  let jobId: string | undefined
  let insertedCount = 0
  let matchedCount = 0
  for (let offset = 0; offset < records.length; offset += APPLE_HEALTH_COMMIT_BATCH) {
    const batch = records.slice(offset, offset + APPLE_HEALTH_COMMIT_BATCH)
    const complete = offset + batch.length >= records.length
    const response = await healthFetch('/api/apple-health/import/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        complete,
        summary,
        records: batch,
      }),
    })
    if (!response.ok) {
      throw new Error(await readApiError(response))
    }
    const result = commitSchema.parse(await response.json())
    jobId = result.jobId
    insertedCount += result.insertedCount
    matchedCount += result.matchedCount
    onProgress?.(Math.min(offset + batch.length, records.length), records.length)
  }
  return { jobId, insertedCount, matchedCount }
}
