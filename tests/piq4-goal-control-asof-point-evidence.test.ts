import { describe, expect, it, vi } from 'vitest'
import type { Sql } from '../server/db.js'
import {
  BODY_GOAL_AS_OF_SQL, STRENGTH_GOAL_AS_OF_SQL, BENCHMARK_GOAL_AS_OF_SQL,
  loadBodyGoalPointAsOf, loadStrengthGoalSetsAsOf, loadBenchmarkGoalPointAsOf,
} from '../server/goals/as-of-point-evidence.js'
import { goalEvidence } from '../src/domain/goals.js'
import { goalTargetState } from '../src/domain/goal-status.js'

const AS_OF = '2026-10-16'
const sql = (rows:unknown) => ({
  query: vi.fn(async () => rows),
}) as unknown as Sql & { query: ReturnType<typeof vi.fn> }

describe('PIQ-4.2 Goal Control point observations are bounded by Health as-of', () => {
  it('uses body session timezone BEFORE SQL LIMIT and accepts a late UTC event on the Health-local day', async () => {
    const db = sql([{
      value:'79.5',unit:'kg',measured_at:'2026-10-17T06:30:00Z',
      timezone:'America/Phoenix',
    }])
    expect(await loadBodyGoalPointAsOf(db,'weight','America/Phoenix',AS_OF))
      .toEqual({value:79.5,unit:'kg',observedOn:AS_OF})
    expect(db.query).toHaveBeenCalledWith(
      BODY_GOAL_AS_OF_SQL,['weight','America/Phoenix',AS_OF])
    expect(BODY_GOAL_AS_OF_SQL).toMatch(/AT TIME ZONE/)
    expect(BODY_GOAL_AS_OF_SQL).toMatch(/sessions\.timezone/)
    expect(BODY_GOAL_AS_OF_SQL).toMatch(/::date\s*<=\s*\$3::date/)
    expect(BODY_GOAL_AS_OF_SQL.indexOf('<= $3::date'))
      .toBeLessThan(BODY_GOAL_AS_OF_SQL.indexOf('LIMIT 1'))
  })

  it('does not turn a next-day body result into an earlier met/unmet goal', async () => {
    const tomorrow = sql([{
      value:'78',unit:'kg',measured_at:'2026-10-17T07:01:00Z',
      timezone:'America/Phoenix',
    }])
    const result=await loadBodyGoalPointAsOf(tomorrow,'weight','America/Phoenix',AS_OF)
    expect(result).toBeNull()
    expect(goalTargetState({
      targetMode:'at_most',targetMin:null,targetMax:80,targetUnit:'kg',
      targetDate:null,evaluationWindowDays:null,notes:null,
    },result?.value??null)).toBe('unknown')
    expect(await loadBodyGoalPointAsOf(sql([]),'weight','America/Phoenix',AS_OF)).toBeNull()
    expect(await loadBodyGoalPointAsOf(sql([{
      value:'77',unit:'kg',measured_at:'not-a-date',timezone:null,
    }]),'weight','America/Phoenix',AS_OF)).toBeNull()
  })

  it('falls back to requested Health-local timezone when session zone is missing',async()=>{
    expect(await loadBodyGoalPointAsOf(sql([{
      value:'175',unit:'lb',measured_at:'2026-10-17T06:58:00Z',timezone:null,
    }]),'weight','America/Phoenix',AS_OF))
      .toEqual({value:175,unit:'lb',observedOn:AS_OF})
    expect(await loadBodyGoalPointAsOf(sql([{
      value:'175',unit:'lb',measured_at:'2026-10-17T06:58:00Z',timezone:'UTC',
    }]),'weight','America/Phoenix',AS_OF)).toBeNull()
  })

  it('bounds exact-exercise e1RM sets before aggregation and independently rejects future rows',async()=>{
    const db=sql([
      {session_date:'2026-10-12',set_id:'earlier',weight_kg:'40',reps:8},
      {session_date:'2026-10-18',set_id:'future',weight_kg:'200',reps:10},
      {session_date:'garbage',set_id:'invalid',weight_kg:'100',reps:12},
    ])
    expect(await loadStrengthGoalSetsAsOf(db,'exercise-id',AS_OF))
      .toEqual([{session_date:'2026-10-12',set_id:'earlier',weight_kg:'40',reps:8}])
    expect(db.query).toHaveBeenCalledWith(
      STRENGTH_GOAL_AS_OF_SQL,['exercise-id',AS_OF])
    expect(STRENGTH_GOAL_AS_OF_SQL).toContain('sessions.workout_date <= $2::date')
    expect(STRENGTH_GOAL_AS_OF_SQL).toContain("sessions.session_type IN ('programmed', 'ad_hoc', 'experiment')")
    expect(await loadStrengthGoalSetsAsOf(sql([{session_date:'2026-10-18'}]),'id',AS_OF))
      .toEqual([])
  })

  it('bounds valid benchmark results to as-of before sorting and LIMIT 1',async()=>{
    const db=sql([{value:'32',unit:'reps',result_date:'2026-10-12'}])
    expect(await loadBenchmarkGoalPointAsOf(db,'benchmark','protocol','requirement',AS_OF))
      .toEqual({value:32,unit:'reps',observedOn:'2026-10-12'})
    expect(db.query).toHaveBeenCalledWith(BENCHMARK_GOAL_AS_OF_SQL,
      ['benchmark','protocol','requirement',AS_OF])
    expect(BENCHMARK_GOAL_AS_OF_SQL).toContain("results.status = 'valid'")
    expect(BENCHMARK_GOAL_AS_OF_SQL).toContain('results.result_date <= $4::date')
    expect(BENCHMARK_GOAL_AS_OF_SQL.indexOf('<= $4::date'))
      .toBeLessThan(BENCHMARK_GOAL_AS_OF_SQL.indexOf('LIMIT 1'))
    expect(await loadBenchmarkGoalPointAsOf(sql([{
      value:'40',unit:'reps',result_date:'2026-10-17',
    }]),'benchmark','protocol','requirement',AS_OF)).toBeNull()
    expect(await loadBenchmarkGoalPointAsOf(sql([]),'benchmark','protocol','requirement',AS_OF))
      .toBeNull()
  })

  it('cannot make a body, strength or benchmark goal met using no eligible point',()=>{
    const target={
      targetMode:'at_least' as const,targetMin:35,targetMax:null,targetUnit:'reps',
      targetDate:null,evaluationWindowDays:null,notes:null,
    }
    const result=goalEvidence({
      goalKind:'benchmark_result',target,asOf:AS_OF,
      body:null,strength:null,benchmark:null,training:null,
      sessionDates:[],activityRows:[],proteinDays:[],sleepNights:[],adherence:null,
    })
    expect(result.current).toBeNull()
    expect(result.observedOn).toBeNull()
    expect(goalTargetState(target,result.current)).toBe('unknown')
  })
})
