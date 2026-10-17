import { describe, expect, it } from 'vitest'
import { askResponseDependsOnOwnerData, shouldWithholdChangedAskResponse } from '../src/domain/ask-health/stale-response.js'

describe('PIQ T42 Ask Health stale-data answer guard', () => {
  it('rejects a personalized reply started before another tab saves a workout', () => {
    const duringRequest = 8
    const afterMutationEvent = 9
    expect(shouldWithholdChangedAskResponse('personal', duringRequest, afterMutationEvent)).toBe(true)
    expect(shouldWithholdChangedAskResponse('personal', duringRequest, duringRequest)).toBe(false)
    expect(shouldWithholdChangedAskResponse('personal', 8, 10)).toBe(true)
  })
  it('keeps general education and immediate safety advice independent of owner mutations', () => {
    for (const scope of ['general', 'urgent_safety'] as const) {
      expect(shouldWithholdChangedAskResponse(scope, 8, 9)).toBe(false)
      expect(askResponseDependsOnOwnerData(scope)).toBe(false)
    }
    expect(shouldWithholdChangedAskResponse(undefined, 8, 9)).toBe(true)
    expect(askResponseDependsOnOwnerData(undefined)).toBe(true)
    expect(shouldWithholdChangedAskResponse(undefined, 8, 8)).toBe(false)
  })
})
