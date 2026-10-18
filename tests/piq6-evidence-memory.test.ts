import { describe, expect, it } from 'vitest'
import { feedbackHistoryCopy, reviewFeedbackHistory, MAX_FEEDBACK_HISTORY } from '../src/domain/experiment-evidence-memory.js'
import type { OutcomeFeedbackReadiness } from '../src/domain/experiment-outcome-feedback.js'

const digest = 'a'.repeat(64)
const ready: OutcomeFeedbackReadiness = {state:'ready',reason:'ready'}
function event(version:number, action:'recorded'|'revised'|'withdrawn' = version===1?'recorded':'revised') {
  return {
    version,action,
    unloggedFactors:action==='withdrawn'?null:'other_changes',
    ownerNote:action==='withdrawn'?null:'Synthetic travel context',
    comparisonFingerprint:digest,
    recordedAt:'2026-10-17 22:15:00+00',
  }
}
const view=(rows:unknown, readiness=ready, verified=true)=>
  reviewFeedbackHistory({rows,expectedFingerprint:digest,snapshotVerified:verified,readiness})

describe('PIQ-6.5 auditable owner context, not efficacy memory',()=>{
  it('keeps no feedback distinct from negative or successful evidence',()=>{
    expect(view([])).toEqual({status:'empty',events:[],review:'not_recorded'})
    expect(view([event(1)])).toMatchObject({status:'complete',review:'owner_context_recorded'})
    expect(feedbackHistoryCopy(view([event(1)]))).toContain('does not establish')
  })
  it('keeps revision audit and acknowledges later changed circumstances',()=>{
    expect(view([event(2),event(1)])).toMatchObject({status:'complete',events:[{version:2},{version:1}]})
    expect(view([event(2),event(1)],{state:'not_ready',reason:'implementation_changed'}).review)
      .toBe('needs_recheck')
    expect(feedbackHistoryCopy(view([event(2),event(1)],{state:'not_ready',reason:'not_current_result'}))).toContain('Do not reuse')
  })
  it('withdrawal overrides earlier owner answers without erasing the audit',()=>{
    const result=view([event(3,'withdrawn'),event(2),event(1)])
    expect(result).toMatchObject({status:'complete',review:'withdrawn'})
    expect(result.events).toHaveLength(3)
    expect(result.events[0]?.ownerNote).toBeNull()
    expect(feedbackHistoryCopy(result)).toContain('not as current evidence')
  })
  it('fails closed on source mismatch, corrupt/gapped/reordered or malformed history',()=>{
    const bad=[
      [event(2)],
      [event(3),event(1)],
      [event(1),event(2)],
      [{...event(1),comparisonFingerprint:'b'.repeat(64)}],
      [{...event(1),unloggedFactors:'zero'}],
      [{...event(1),ownerNote:'   '}],
      [{...event(1),recordedAt:'no-date'}],
      [{...event(1),version:0}],
      [{...event(1),action:'withdrawn',unloggedFactors:null,ownerNote:null}],
      [{...event(1),ownerNote:'x'.repeat(501)}],
    ]
    for (const rows of bad) expect(view(rows).review).toBe('unavailable')
    expect(view([event(1)],ready,false).review).toBe('unavailable')
    expect(view('invalid').status).toBe('unavailable')
  })
  it('labels bounded history partial, never invents older missing records',()=>{
    const rows=Array.from({length:MAX_FEEDBACK_HISTORY+1},(_,i)=>{
      const version=MAX_FEEDBACK_HISTORY+1-i
      return event(version,version===1?'recorded':'revised')
    })
    const out=view(rows)
    expect(out.status).toBe('partial')
    expect(out.events).toHaveLength(MAX_FEEDBACK_HISTORY)
    expect(out.events.at(-1)?.version).toBe(2)
    expect(view(rows.slice(0,-1)).status).toBe('unavailable')
    expect(view([...rows,...rows]).status).toBe('unavailable')
    expect(view([...rows.slice(0,-1),{...rows.at(-1),comparisonFingerprint:'b'.repeat(64)}]).status).toBe('unavailable')
  })
})
