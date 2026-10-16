import {beforeEach,describe,expect,it,vi} from 'vitest'
import {listGoalAskSnapshots} from '../server/goals/service.js'

const state=vi.hoisted(()=>({query:vi.fn(async()=>[]),sqlCalls:0}))
vi.mock('../server/db.js',()=>({
  getSql:async()=>{state.sqlCalls++;return{query:state.query}},
}))
vi.mock('../server/health-time.js',()=>({
  currentHealthDate:async()=> '2026-10-16',
  healthCalendarTimeZone:async()=> 'America/Phoenix',
}))

describe('PIQ-4.2 canonical Ask Health goal snapshot boundary',()=>{
  beforeEach(()=>{
    state.query.mockClear()
    state.sqlCalls=0
  })
  it('does not perform any goal/versions/measurement DB read for past-as-of',async()=>{
    expect(await listGoalAskSnapshots('2026-10-01','2026-10-16')).toEqual([])
    expect(state.sqlCalls).toBe(0)
    expect(state.query).not.toHaveBeenCalled()
  })
  it('also fails closed for a future-as-of date',async()=>{
    expect(await listGoalAskSnapshots('2026-10-17','2026-10-16')).toEqual([])
    expect(state.sqlCalls).toBe(0)
  })
  it('retains the current-only canonical read and accepts the implicit today fallback',async()=>{
    expect(await listGoalAskSnapshots('2026-10-16','2026-10-16')).toEqual([])
    expect(state.sqlCalls).toBe(1)
    expect(state.query).toHaveBeenCalledTimes(1)
    expect(await listGoalAskSnapshots('2026-10-16')).toEqual([])
    expect(state.sqlCalls).toBe(2)
  })
})
