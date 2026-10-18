import React from 'react'
import {readFileSync} from 'node:fs'
import {describe,expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {
  feedbackReadinessForCurrentOutcomes,feedbackReadinessCopy,
  type OutcomeFeedbackReadiness,
} from '../src/domain/experiment-outcome-feedback.js'
import type {CurrentOutcomeComparison} from '../src/domain/experiment-current-outcomes.js'
import {FeedbackReadinessNotice} from '../src/features/lab/ExperimentResultPages.js'

const ready:OutcomeFeedbackReadiness={state:'ready',reason:'ready'}
const current:CurrentOutcomeComparison={
  state:'available',reason:'current_records',asOf:'2026-10-18',
  baselineWindow:{start:'2026-09-24',end:'2026-09-30'},
  followUpWindow:{start:'2026-10-01',end:'2026-10-07'},
  metrics:[{requirementId:'outcome',metricKey:'protein',outcomeKind:'nutrition_metric',
    unit:'g/day',beforeDays:5,afterDays:5,beforeMean:90,afterMean:100,change:10}],
}
const blocked=(reason:CurrentOutcomeComparison['reason']):CurrentOutcomeComparison=>({
  state:'unavailable',reason,asOf:'2026-10-18',baselineWindow:null,
  followUpWindow:null,metrics:[],
})

describe('PIQ-6.5 read-side owner feedback availability matches sealed outcomes',()=>{
  it('keeps the form available only for a verified unchanged source projection',()=>{
    expect(feedbackReadinessForCurrentOutcomes(ready,current)).toBe(ready)
    for(const reason of ['source_values_changed','changed_coverage'] as const) {
      expect(feedbackReadinessForCurrentOutcomes(ready,blocked(reason)))
        .toEqual({state:'not_ready',reason:'source_evidence_changed'})
    }
    for(const reason of ['source_values_unverified','source_unavailable',
      'ambiguous_recording','inconsistent_sleep_source','not_ready'] as const) {
      expect(feedbackReadinessForCurrentOutcomes(ready,blocked(reason)))
        .toEqual({state:'not_ready',reason:'source_evidence_unverified'})
    }
    expect(feedbackReadinessForCurrentOutcomes(ready,null).state).toBe('not_ready')
  })
  it('never overrides a higher-priority result/implementation/safety readiness failure',()=>{
    for(const reason of ['not_current_result','implementation_changed','protocol_not_followed',
      'unverified_snapshot','follow_up_not_mature'] as const) {
      const existing:OutcomeFeedbackReadiness={state:'not_ready',reason}
      expect(feedbackReadinessForCurrentOutcomes(existing,current)).toBe(existing)
      expect(feedbackReadinessForCurrentOutcomes(existing,blocked('source_values_changed'))).toBe(existing)
    }
  })
  it('renders an accessible reason and never an enabled feedback form when a seal changed',()=>{
    for(const reason of ['source_evidence_changed','source_evidence_unverified'] as const){
      const state:OutcomeFeedbackReadiness={state:'not_ready',reason}
      const html=renderToStaticMarkup(React.createElement(FeedbackReadinessNotice,{readiness:state}))
      expect(html).toContain('role="alert"')
      expect(html).toContain('New or revised feedback is unavailable')
      expect(html).toContain('still withdraw')
      expect(html).not.toContain('Save feedback')
      expect(feedbackReadinessCopy(state)).not.toContain('worked')
    }
    expect(renderToStaticMarkup(React.createElement(FeedbackReadinessNotice,{readiness:ready}))).toBe('')
  })
  it('binds actual GET result readiness and preserves the POST independent source CAS',()=>{
    const result=readFileSync('server/lab/experiment-results.ts','utf8')
    const detail=result.slice(result.indexOf('export async function getExperimentResult('),
      result.indexOf('export async function invalidateExperimentResult('))
    expect(detail).toContain('feedbackReadinessForCurrentOutcomes(')
    expect(detail).toContain('ownerFeedback.readiness,currentOutcomeComparison')
    expect(detail).toContain('outcomeFeedbackReadiness: feedbackReadiness')
    const source=readFileSync('server/lab/outcome-feedback.ts','utf8')
    expect(source).toContain('verifySavedExperimentFeedbackEvidence(sql,state.verifiedSnapshot,today)')
    expect(source).toContain('buildOwnerFeedbackVerifiedInsertSql(sourceModule.EXPERIMENT_FEEDBACK_SOURCE_CAS_EXPRESSION)')
    const ui=readFileSync('src/features/lab/ExperimentResultPages.tsx','utf8')
    expect(ui).toContain("result.outcomeFeedbackReadiness?.reason === 'source_evidence_changed'")
    expect(ui).toContain("result.outcomeFeedbackReadiness?.reason === 'source_evidence_unverified'")
    expect(ui).toContain('<FeedbackReadinessNotice readiness={result.outcomeFeedbackReadiness} />')
    expect(ui).toContain("onClick={() => void submitFeedback('withdraw')}")
  })
})
