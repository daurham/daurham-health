import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { reviewExperimentEvidence, experimentEvidenceReviewCopy } from '../src/domain/experiment-evidence-review.js'
import type { ExperimentComparisonSnapshot } from '../src/domain/experiment-comparison-snapshot.js'
import type { FeedbackHistory } from '../src/domain/experiment-evidence-memory.js'
import type { CurrentOutcomeComparison } from '../src/domain/experiment-current-outcomes.js'
import type { OutcomeFeedbackReadiness } from '../src/domain/experiment-outcome-feedback.js'
import { ExperimentEvidenceReviewSection } from '../src/features/lab/ExperimentResultPages.js'

const hash='a'.repeat(64)
const snapshot:ExperimentComparisonSnapshot={
  snapshotVersion:1,recordedHealthDate:'2026-10-08',
  implementation:{provenance:'original',effectiveDate:'2026-10-01',revision:null},
  review:{state:'descriptive_coverage',reason:'coverage_screen_met',
    baselineWindow:{start:'2026-09-24',end:'2026-09-30'},
    followUpWindow:{start:'2026-10-01',end:'2026-10-07'},
    metrics:[{requirementId:'protein',metricKey:'protein',outcomeKind:'nutrition_metric',
      beforeDays:5,afterDays:5,beforeExpected:7,afterExpected:7}]},
}
const current:CurrentOutcomeComparison={
  state:'available',reason:'current_records',asOf:'2026-10-17',
  baselineWindow:{start:'2026-09-24',end:'2026-09-30'},
  followUpWindow:{start:'2026-10-01',end:'2026-10-07'},
  metrics:[{requirementId:'protein',metricKey:'protein',outcomeKind:'nutrition_metric',
    unit:'g/day',beforeDays:5,afterDays:5,beforeMean:90,afterMean:110,change:20}],
}
const ready:OutcomeFeedbackReadiness={state:'ready',reason:'ready'}
const event=(answer:'none_reported'|'other_changes'|'unsure'|'withdrawn')=>({
  version: answer==='withdrawn'?2:1,
  action: answer==='withdrawn'?'withdrawn' as const:'recorded' as const,
  unloggedFactors:answer==='withdrawn'?null:answer,ownerNote:answer==='other_changes'?'Travel':null,
  comparisonFingerprint:hash,recordedAt:'2026-10-16 12:00:00+00',
})
const history=(answer:'none_reported'|'other_changes'|'unsure'|'withdrawn' | null):FeedbackHistory=>
  answer===null?{status:'empty',events:[],review:'not_recorded'}:
  {status:'complete',events:[event(answer)],review:answer==='withdrawn'?'withdrawn':'owner_context_recorded'}
const review=(overrides:Partial<Parameters<typeof reviewExperimentEvidence>[0]>={})=>
  reviewExperimentEvidence({snapshot,snapshotStatus:'verified',current,history:history(null),readiness:ready,...overrides})

describe('PIQ-6.5 bounded evidence-review status, never a learned causal fact',()=>{
  it('distinguishes measured observation from absent owner feedback',()=>{
    const r=review()
    expect(r).toMatchObject({state:'observation_only',snapshotRecordedDate:'2026-10-08',
      observationsAsOf:'2026-10-17',primaryMetricCount:1,feedbackVersion:null,
      canRankRecommendations:false})
    expect(experimentEvidenceReviewCopy(r)).toContain('no owner follow-up')
  })
  it('describes reports as subjective, without marking no recalled factors as certainty',()=>{
    for (const [answer,state] of [
      ['none_reported','none_recalled'],['other_changes','context_reported'],['unsure','context_unsure'],
    ] as const) {
      const r=review({history:history(answer)})
      expect(r.state).toBe(state)
      expect(r.feedbackVersion).toBe(1)
      expect(r.canRankRecommendations).toBe(false)
    }
    expect(experimentEvidenceReviewCopy(review({history:history('none_reported')})))
      .toContain('does not establish')
  })
  it('withdrawal overrides all earlier reports and never becomes current learning',()=>{
    const r=review({history:history('withdrawn')})
    expect(r).toMatchObject({state:'withdrawn',feedbackVersion:2,
      primaryMetricCount:0,canRankRecommendations:false})
    expect(experimentEvidenceReviewCopy(r)).toContain('withdrew')
  })
  it('fails closed on invalid snapshot, unaudited history, current change or corrected result',()=>{
    expect(review({snapshot:null}).state).toBe('unavailable')
    expect(review({snapshotStatus:'not_recorded'}).state).toBe('unavailable')
    expect(review({snapshotStatus:'unavailable_integrity_check'}).state).toBe('unavailable')
    expect(review({history:{status:'unavailable',review:'unavailable',events:[]}}).state).toBe('unavailable')
    expect(review({history:{status:'complete',review:'needs_recheck',events:[event('unsure')]}}).state).toBe('needs_recheck')
    expect(review({readiness:{state:'not_ready',reason:'implementation_changed'}}).state).toBe('needs_recheck')
    expect(review({current:null}).state).toBe('not_assessable')
    expect(review({current:{...current,state:'unavailable',reason:'changed_coverage',metrics:[]}}).state).toBe('coverage_changed')
  })
  it('surfaces post-finalization value edits and changed verified coverage without replaying the saved result',()=>{
    for(const [reason,state,copy] of [
      ['source_values_changed','source_changed','have changed since'],
      ['changed_coverage','coverage_changed','no longer matches'],
      ['source_values_unverified','source_unverified','no verifiable original'],
    ] as const) {
      const currentState:CurrentOutcomeComparison={
        state:'unavailable',reason,asOf:'2026-10-17',
        baselineWindow:null,followUpWindow:null,metrics:[],
      }
      const before=JSON.stringify(snapshot)
      const result=review({current:currentState,history:history('none_reported')})
      expect(result).toMatchObject({state,primaryMetricCount:0,feedbackVersion:1,
        observationsAsOf:null,canRankRecommendations:false})
      expect(experimentEvidenceReviewCopy(result)).toContain(copy)
      const html=renderToStaticMarkup(React.createElement(ExperimentEvidenceReviewSection,{review:result}))
      expect(html).toContain('role="alert"')
      expect(html).not.toContain('Recorded difference:')
      expect(html).not.toContain('Travel')
      expect(JSON.stringify(snapshot)).toBe(before)
    }
    // Withdrawal, invalid snapshots and changed implementations retain
    // higher-priority fail-closed behavior than any source drift message.
    const changed:CurrentOutcomeComparison={...current,state:'unavailable',
      reason:'source_values_changed',metrics:[]}
    expect(review({current:changed,history:history('withdrawn')}).state).toBe('withdrawn')
    expect(review({current:changed,readiness:{state:'not_ready',reason:'implementation_changed'}}).state)
      .toBe('needs_recheck')
    expect(review({current:changed,snapshotStatus:'unavailable_integrity_check'}).state)
      .toBe('unavailable')
    expect(review({current:{...changed,reason:'source_unavailable'}}).state).toBe('not_assessable')
  })
  it('does not reclassify a 25-entry truncated feedback history as complete',()=>{
    const r=review({history:{status:'partial',review:'owner_context_recorded',events:[event('other_changes')]}})
    expect(r.state).toBe('partial_audit')
    expect(r.canRankRecommendations).toBe(false)
    expect(experimentEvidenceReviewCopy(r)).toContain('full version history')
  })
  it('does not expose raw owner notes in the summary or silently rank evidence',()=>{
    const r=review({history:history('other_changes')})
    const html=renderToStaticMarkup(React.createElement(ExperimentEvidenceReviewSection,{review:r}))
    expect(html).toContain('Evidence review status')
    expect(html).toContain('Owner feedback version 1')
    expect(html).toContain('not used to rank')
    expect(html).not.toContain('Travel')
    expect(html).not.toContain('worked')
  })
  it('uses owner-auth result projection, not new writes, model calls or additional tables',()=>{
    const service=readFileSync('server/lab/experiment-results.ts','utf8')
    const detail=service.slice(service.indexOf('export async function getExperimentResult('),
      service.indexOf('export async function invalidateExperimentResult('))
    expect(detail).toContain('evidenceReview: reviewExperimentEvidence({')
    expect(detail).toContain('history: ownerFeedback.history, readiness: ownerFeedback.readiness')
    expect(detail).not.toContain('INSERT INTO')
    expect(detail).not.toContain('UPDATE experiment_')
  })
})
