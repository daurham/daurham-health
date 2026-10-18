import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  describeCurrentOutcomeComparison, currentOutcomeComparisonCopy, verifyCurrentOutcomeSourceSeal,
} from '../src/domain/experiment-current-outcomes.js'
import type { ExperimentComparisonSnapshot } from '../src/domain/experiment-comparison-snapshot.js'
import type { OutcomeFeedbackReadiness } from '../src/domain/experiment-outcome-feedback.js'
import type { DailyMetricPoint } from '../src/domain/experiment-results.js'
import { CurrentOutcomeComparisonSection } from '../src/features/lab/ExperimentResultPages.js'

const ready:OutcomeFeedbackReadiness={state:'ready',reason:'ready'}
const snapshot:ExperimentComparisonSnapshot={
  snapshotVersion:1,recordedHealthDate:'2026-10-17',
  implementation:{provenance:'original',effectiveDate:'2026-10-01',revision:null},
  review:{state:'descriptive_coverage',reason:'coverage_screen_met',
    baselineWindow:{start:'2026-09-24',end:'2026-09-30'},
    followUpWindow:{start:'2026-10-01',end:'2026-10-07'},
    metrics:[{requirementId:'protein-primary',outcomeKind:'nutrition_metric',metricKey:'protein',
      beforeDays:4,afterDays:4,beforeExpected:7,afterExpected:7}],
  },
}
const daysPre=['2026-09-24','2026-09-25','2026-09-27','2026-09-30']
const daysPost=['2026-10-01','2026-10-02','2026-10-05','2026-10-07']
const records=(days:string[],value:number,key='protein'):DailyMetricPoint[]=>
  days.map(date=>({date,metricKey:key,value}))
const nutrition=[...records(daysPre,80),...records(daysPost,110)]
const assess=(changes:Partial<Parameters<typeof describeCurrentOutcomeComparison>[0]>={})=>
  describeCurrentOutcomeComparison({snapshot,readiness:ready,nutrition,sleep:[],asOf:'2026-10-17',...changes})

describe('PIQ-6.5 current descriptive values, never frozen effect or efficacy',()=>{
  it('computes only prespecified outcome from current verified complete-day records',()=>{
    const result=assess({nutrition:[...nutrition,{date:'2026-10-04',metricKey:'carbs',value:900}]})
    expect(result.state).toBe('available')
    expect(result.metrics).toEqual([{requirementId:'protein-primary',metricKey:'protein',outcomeKind:'nutrition_metric',
      unit:'g/day',beforeDays:4,afterDays:4,beforeMean:80,afterMean:110,change:30}])
    expect(currentOutcomeComparisonCopy(result)).toContain('not frozen')
    expect(currentOutcomeComparisonCopy(result)).toContain('does not prove')
  })
  it('withholds current numeric values when the source seal changes or is absent',()=>{
    const visible=assess()
    const a='a'.repeat(64),b='b'.repeat(64)
    expect(verifyCurrentOutcomeSourceSeal(visible,a,a)).toEqual(visible)
    expect(verifyCurrentOutcomeSourceSeal(visible,a,b))
      .toMatchObject({state:'unavailable',reason:'source_values_changed',metrics:[]})
    expect(verifyCurrentOutcomeSourceSeal(visible,undefined,b))
      .toMatchObject({state:'unavailable',reason:'source_values_unverified',metrics:[]})
    expect(verifyCurrentOutcomeSourceSeal(visible,a,null).reason).toBe('source_values_unverified')
    const withheld=verifyCurrentOutcomeSourceSeal(visible,a,b)
    const html=renderToStaticMarkup(React.createElement(CurrentOutcomeComparisonSection,{comparison:withheld}))
    expect(html).not.toContain('Recorded difference:')
    expect(html).toContain('withheld')
    const coverageError={...visible,state:'unavailable' as const,reason:'changed_coverage' as const,metrics:[]}
    expect(verifyCurrentOutcomeSourceSeal(coverageError,a,a).reason).toBe('changed_coverage')
  })
  it('never invents missing days as zero or lets changed source coverage masquerade as original',()=>{
    expect(assess({nutrition:nutrition.slice(0,-1)}).reason).toBe('changed_coverage')
    expect(assess({nutrition:[...nutrition,...records(['2026-09-26'],90)]}).reason).toBe('changed_coverage')
    expect(assess({nutrition:[...nutrition,{...nutrition[0]!,value:null}]}).reason).toBe('ambiguous_recording')
    expect(assess({nutrition:[...nutrition,{date:'2026-09-28',metricKey:'protein',value:-3}]}).reason).toBe('ambiguous_recording')
    expect(assess({nutrition:[...nutrition,{date:'2026-09-28',metricKey:'protein',value:1e8}]}).reason).toBe('ambiguous_recording')
  })
  it('stops on source/protocol/snapshot gate and unsupported post hoc metrics',()=>{
    expect(assess({readiness:{state:'not_ready',reason:'implementation_changed'}}).reason).toBe('not_ready')
    expect(assess({snapshot:null}).state).toBe('unavailable')
    expect(assess({asOf:'2026-10-07'}).state).toBe('unavailable')
    const newOutcome={...snapshot,review:{...snapshot.review,
      metrics:[{...snapshot.review.metrics[0]!,metricKey:'unknown_metric'}]}}
    expect(assess({snapshot:newOutcome}).reason).toBe('unsupported_outcome')
  })
  it('requires exactly same source across eligible sleep nights',()=>{
    const sleepSnapshot:ExperimentComparisonSnapshot={...snapshot,review:{...snapshot.review,
      metrics:[{requirementId:'sleep-primary',outcomeKind:'sleep_metric',metricKey:'total_sleep_minutes',
        beforeDays:4,afterDays:4,beforeExpected:7,afterExpected:7}]}}
    const nights=[...records(daysPre,430,'total_sleep_minutes'),...records(daysPost,470,'total_sleep_minutes')]
      .map(p=>({...p,eligible:true,sourceKey:'watch-a'}))
    const expected=assess({snapshot:sleepSnapshot,nutrition:[],sleep:nights})
    expect(expected).toMatchObject({state:'available',metrics:[{unit:'min/night',change:40}]})
    expect(assess({snapshot:sleepSnapshot,nutrition:[],sleep:nights.map((p,i)=>({...p,
      sourceKey:i>3?'watch-b':'watch-a'}))}).reason).toBe('inconsistent_sleep_source')
    expect(assess({snapshot:sleepSnapshot,nutrition:[],sleep:nights.map(p=>({...p,
      sourceKey:undefined}))}).reason).toBe('inconsistent_sleep_source')
    expect(assess({snapshot:sleepSnapshot,nutrition:[],sleep:nights.map((p,i)=>({...p,
      eligible:i===0?false:true}))}).reason).toBe('ambiguous_recording')
  })
  it('does not silently cherry-pick one supported metric when another fails',()=>{
    const mixed={...snapshot,review:{...snapshot.review,
      metrics:[...snapshot.review.metrics,{...snapshot.review.metrics[0]!,requirementId:'calorie-primary',
        metricKey:'calories' as const}]}}
    expect(assess({snapshot:mixed}).state).toBe('unavailable')
    const duplicate={...snapshot,review:{...snapshot.review,
      metrics:[...snapshot.review.metrics,snapshot.review.metrics[0]!]}}
    expect(assess({snapshot:duplicate}).reason).toBe('unsupported_outcome')
  })
  it('renders noncausal, disclosed fresh evidence and neutral fallback',()=>{
    const available=renderToStaticMarkup(React.createElement(CurrentOutcomeComparisonSection,{comparison:assess()}))
    expect(available).toContain('Current-record before/after')
    expect(available).toContain('110')
    expect(available).toContain('not frozen')
    const no=renderToStaticMarkup(React.createElement(CurrentOutcomeComparisonSection,{
      comparison:assess({nutrition:[]})}))
    expect(no).toContain('coverage differs')
    expect(no).not.toContain('Recorded difference:')
  })
  it('server recomputes on owner-only Lab result GET without persisting or modifying results',()=>{
    const source=readFileSync('server/lab/experiment-results.ts','utf8')
    const detail=source.slice(source.indexOf('export async function getExperimentResult('),
      source.indexOf('export async function invalidateExperimentResult('))
    expect(detail).toContain("ownerFeedback.readiness.state !== 'ready'")
    expect(detail).toContain('loadNutrition(sql,before.start,after.end,today)')
    expect(detail).toContain('loadSleep(sql,before.start,after.end,timezone)')
    expect(detail).toContain('describeCurrentOutcomeComparison({')
    expect(detail).not.toContain('INSERT INTO')
    expect(detail).not.toContain('UPDATE experiment_')
  })
})
