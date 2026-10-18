import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { matchLabRoute } from '../server/handlers/lab.js'
import { OWNER_OUTCOME_FEEDBACK_HISTORY_PAGE_SQL } from '../server/lab/outcome-feedback.js'
import {
  parseFeedbackHistoryCursor, reviewFeedbackHistoryPage, MAX_FEEDBACK_HISTORY,
  feedbackHistoryCopy,
} from '../src/domain/experiment-evidence-memory.js'

const fingerprint = 'a'.repeat(64)
function event(version:number,override:Record<string,unknown>={}) {
  return {
    version, action:version===1?'recorded':'revised',
    unloggedFactors:'unsure', ownerNote:null,
    comparisonFingerprint:fingerprint, recordedAt:'2026-10-17 15:00:00+00',
    ...override,
  }
}
function page(beforeVersion:number,latestVersion:number,count:number) {
  return {
    rows:Array.from({length:count},(_,i)=>event(beforeVersion-1-i)),
    beforeVersion,latestVersion,expectedFingerprint:fingerprint,snapshotVerified:true,
  }
}
describe('PIQ-6.5 owner-audited older feedback versions',()=>{
  it('only accepts exact 25-version cursor boundaries anchored to live latest',()=>{
    expect(parseFeedbackHistoryCursor('52','76')).toEqual({beforeVersion:52,latestVersion:76})
    expect(parseFeedbackHistoryCursor('27','76')).toEqual({beforeVersion:27,latestVersion:76})
    expect(parseFeedbackHistoryCursor('2','76')).toEqual({beforeVersion:2,latestVersion:76})
    for(const [a,b] of [
      ['53','76'],['51','76'],['76','76'],['0','76'],['1','26'],
      ['-2','76'],['2.0','76'],['2e0','76'],['02','76'],['2','26.5'],
      ['9999999999','76'],['2','2147483648'],[null,'76'],['52',null],
    ]) expect(parseFeedbackHistoryCursor(a,b)).toHaveProperty('error')
  })
  it('recognizes verified 26th-row sentinel and continues through version one',()=>{
    const first=reviewFeedbackHistoryPage(page(52,76,26))
    expect(first).toMatchObject({status:'partial',latestVersion:76,nextBeforeVersion:27,events:[{version:51}]})
    expect(first?.events).toHaveLength(MAX_FEEDBACK_HISTORY)
    const second=reviewFeedbackHistoryPage(page(27,76,26))
    expect(second).toMatchObject({status:'partial',nextBeforeVersion:2,events:[{version:26}]})
    const last=reviewFeedbackHistoryPage(page(2,76,1))
    expect(last).toMatchObject({status:'complete',nextBeforeVersion:null,events:[{version:1,action:'recorded'}]})
  })
  it('rejects missing tail, holes, mismatched snapshot, invalid action and oversized reads',()=>{
    expect(reviewFeedbackHistoryPage(page(52,76,25))).toBeNull()
    expect(reviewFeedbackHistoryPage(page(52,76,0))).toBeNull()
    expect(reviewFeedbackHistoryPage(page(52,76,27))).toBeNull()
    expect(reviewFeedbackHistoryPage({...page(52,76,26),rows:'not-an-array'})).toBeNull()
    expect(reviewFeedbackHistoryPage({...page(52,76,26),snapshotVerified:false})).toBeNull()
    expect(reviewFeedbackHistoryPage({...page(52,76,26),expectedFingerprint:'b'.repeat(64)})).toBeNull()
    expect(reviewFeedbackHistoryPage({...page(52,76,26),rows:[event(50),event(49)]})).toBeNull()
    expect(reviewFeedbackHistoryPage({...page(52,76,26),rows:[event(51),event(49)]})).toBeNull()
    expect(reviewFeedbackHistoryPage({...page(52,76,26),rows:[event(51,{action:'withdrawn'})]})).toBeNull()
    expect(reviewFeedbackHistoryPage({...page(52,76,26),rows:[event(51,{recordedAt:'invalid'})]})).toBeNull()
    expect(reviewFeedbackHistoryPage({...page(52,76,26),rows:[event(51,{comparisonFingerprint:'b'.repeat(64)})]})).toBeNull()
  })
  it('allows historical withdrawals but never reactivates them as current answers',()=>{
    const reviewed=reviewFeedbackHistoryPage({
      ...page(3,27,2),
      rows:[event(2,{action:'withdrawn',unloggedFactors:null,ownerNote:null}),event(1)],
    })
    expect(reviewed).toMatchObject({status:'complete',events:[{version:2,action:'withdrawn'},{version:1}]})
    expect(feedbackHistoryCopy({status:'partial',events:[],review:'withdrawn'})).toContain('not as current evidence')
  })
  it('keeps all paging owner-authenticated, version-bound, nonmutating, and visibly fallible',()=>{
    const id='11111111-1111-4111-8111-111111111111'
    expect(matchLabRoute('/api/lab/experiment-results/'+id+'/outcome-feedback-history'))
      .toEqual({kind:'experiment-result',id,action:'outcome-feedback-history'})
    expect(OWNER_OUTCOME_FEEDBACK_HISTORY_PAGE_SQL).toContain('WHERE experiment_result_id = $1::uuid AND version < $2::int')
    expect(OWNER_OUTCOME_FEEDBACK_HISTORY_PAGE_SQL).toContain('ORDER BY version DESC LIMIT 26')
    expect(OWNER_OUTCOME_FEEDBACK_HISTORY_PAGE_SQL).not.toContain('INSERT INTO')
    const service=readFileSync('server/lab/outcome-feedback.ts','utf8')
    expect(service).toContain("state.history.status!=='partial'")
    expect(service).toContain('state.latest.version!==cursor.latestVersion')
    expect(service).toContain('reviewFeedbackHistoryPage({')
    const handler=readFileSync('server/handlers/lab.ts','utf8')
    expect(handler).toContain("route.action === 'outcome-feedback-history' && req.method === 'GET'")
    expect(handler).toContain('const ownerLab = withOwnerAuth(labHandler)')
    const component=readFileSync('src/features/lab/ExperimentResultPages.tsx','utf8')
    expect(component).toContain('historyGeneration.current !== generation')
    expect(component).toContain('setOlderFeedback((prev) => [...prev, ...page.events])')
    expect(component).toContain('Load 25 older versions')
    expect(component).toContain('role="alert"')
  })
})
