import { describe, expect, it } from 'vitest'
import { reviewOutcomeFeedbackReadiness, parseOutcomeFeedbackSubmission, feedbackPromptCopy } from '../src/domain/experiment-outcome-feedback.js'
import type { ExperimentComparisonSnapshot } from '../src/domain/experiment-comparison-snapshot.js'
const snap: ExperimentComparisonSnapshot = {
  snapshotVersion:1, recordedHealthDate:'2026-10-17',
  implementation:{provenance:'original',effectiveDate:'2026-10-01',revision:null},
  review:{
    state:'descriptive_coverage',reason:'coverage_screen_met',
    baselineWindow:{start:'2026-09-24',end:'2026-09-30'},
    followUpWindow:{start:'2026-10-01',end:'2026-10-07'},
    metrics:[{requirementId:'primary',outcomeKind:'nutrition_metric',metricKey:'protein',
      beforeDays:5,afterDays:5,beforeExpected:7,afterExpected:7}],
  },
}
const base = {
  resultStatus:'valid',classification:'completed_interpretable',protocolAttestation:'followed',
  stoppedForSafety:false,snapshot:snap,
  currentImplementation:{...snap.implementation},
  today:'2026-10-08',
}
describe('PIQ-6.4 owner feedback maturity and consent',()=>{
  it('only offers optional feedback after seven completed follow-up days',()=>{
    expect(reviewOutcomeFeedbackReadiness(base)).toEqual({state:'ready',reason:'ready'})
    expect(reviewOutcomeFeedbackReadiness({...base,today:'2026-10-07'}).reason).toBe('follow_up_not_mature')
    expect(reviewOutcomeFeedbackReadiness({...base,snapshot:{
      ...snap,review:{...snap.review,followUpWindow:{start:'2026-10-01',end:'2026-10-05'}}}}).reason).toBe('follow_up_not_mature')
  })
  it('requires a verified source and sufficient saved primary coverage',()=>{
    expect(reviewOutcomeFeedbackReadiness({...base,snapshot:null}).reason).toBe('unverified_snapshot')
    expect(reviewOutcomeFeedbackReadiness({...base,snapshot:{...snap,review:{...snap.review,state:'insufficient_coverage',reason:'insufficient_observations'}}}).reason).toBe('insufficient_outcome_coverage')
    expect(reviewOutcomeFeedbackReadiness({...base,snapshot:{...snap,implementation:{provenance:'unreported',effectiveDate:null,revision:null}}}).reason).toBe('missing_implementation')
    expect(reviewOutcomeFeedbackReadiness({...base,currentImplementation:{provenance:'retracted' as const,effectiveDate:null,revision:1}}).reason).toBe('implementation_changed')
  })
  it('rejects later owner correction, invalidation, stopped or unconfirmed protocol',()=>{
    expect(reviewOutcomeFeedbackReadiness({...base,currentImplementation:{provenance:'corrected' as const,effectiveDate:'2026-10-02',revision:1}}).reason).toBe('implementation_changed')
    expect(reviewOutcomeFeedbackReadiness({...base,resultStatus:'invalidated'}).reason).toBe('not_current_result')
    expect(reviewOutcomeFeedbackReadiness({...base,stoppedForSafety:true}).reason).toBe('not_current_result')
    expect(reviewOutcomeFeedbackReadiness({...base,protocolAttestation:'uncertain'}).reason).toBe('protocol_not_followed')
    expect(reviewOutcomeFeedbackReadiness({...base,classification:'incomplete'}).reason).toBe('unsupported_classification')
  })
  it('frames an observation question without declaring improved effects',()=>{
    expect(feedbackPromptCopy()).toContain('not proof of benefit')
    expect(feedbackPromptCopy()).toContain('unlogged factors')
  })
  it('requires explicit owner confirmation and rejects extra data on withdrawal',()=>{
    expect('error' in parseOutcomeFeedbackSubmission({action:'record',expectedVersion:0,unloggedFactors:'unsure'})).toBe(true)
    expect('error' in parseOutcomeFeedbackSubmission({action:'withdraw',expectedVersion:1,confirmFeedback:true,ownerNote:'x'})).toBe(true)
    expect(parseOutcomeFeedbackSubmission({action:'record',expectedVersion:0,confirmFeedback:true,unloggedFactors:'none_reported'})).toEqual({
      action:'record',expectedVersion:0,unloggedFactors:'none_reported',ownerNote:null,
    })
  })
  it('saves bounded confounder context and fails closed on malformed input',()=>{
    expect(parseOutcomeFeedbackSubmission({action:'record',expectedVersion:1,confirmFeedback:true,unloggedFactors:'other_changes',ownerNote:'  Travel  '})).toEqual({
      action:'record',expectedVersion:1,unloggedFactors:'other_changes',ownerNote:'Travel',
    })
    expect('error' in parseOutcomeFeedbackSubmission({action:'record',expectedVersion:0,confirmFeedback:true,unloggedFactors:'unsure',ownerNote:'Extra'})).toBe(true)
    expect('error' in parseOutcomeFeedbackSubmission({action:'record',expectedVersion:0,confirmFeedback:true,unloggedFactors:'other_changes',ownerNote:'x'.repeat(501)})).toBe(true)
    expect('error' in parseOutcomeFeedbackSubmission({action:'record',expectedVersion:-1,confirmFeedback:true,unloggedFactors:'unsure'})).toBe(true)
  })
})
