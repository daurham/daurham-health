import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('PIQ-8 workout photo pending review wiring', () => {
  it('keeps Training pending reviews server-authoritative after save, focus and queue changes', () => {
    const page = readFileSync('src/features/training/TrainingPage.tsx', 'utf8')
    expect(page).toContain('createPendingReviewRefresh<PendingTranscriptionJob>')
    expect(page).toContain('subscribeHealthDataChanges(reviews.refresh, { revalidateOnFocus: true })')
    expect(page).toContain('subscribeHealthReviewQueueChanges(reviews.refresh)')
    expect(page).toContain('reviews.stop()')
    expect(page).toContain('Pending photo reviews could not be refreshed')
    expect(page).not.toContain('setJobs([])\n        }\n      } catch')
  })

  it('refreshes Today attention for queue changes without rerunning Coach', () => {
    const page = readFileSync('src/features/today/TodayPage.tsx', 'utf8')
    expect(page).toContain('subscribeHealthReviewQueueChanges(() => retryToday.current())')
    expect(page).toContain('unsubscribeReviews()')
    const changeApi = readFileSync('src/lib/health-api.ts', 'utf8')
    expect(changeApi).toContain('isReviewQueueMutation(url, method)) notifyHealthReviewQueueChanged()')
    expect(changeApi).toContain('isCoachRelevantMutation(url, method)) notifyHealthDataChanged()')
  })
})
