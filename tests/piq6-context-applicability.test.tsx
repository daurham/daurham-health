import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { describe,expect,it } from 'vitest'
import {
  assessExperimentContextApplicability,experimentContextApplicabilityCopy,
} from '../src/domain/experiment-context-applicability.js'
import type { ExperimentComparisonSnapshot } from '../src/domain/experiment-comparison-snapshot.js'
import { ExperimentEvidenceReviewSection } from '../src/features/lab/ExperimentResultPages.js'
import { EXPERIMENT_CONTEXT_REVISION_SQL } from '../server/lab/experiment-results.js'

const snapshot:ExperimentComparisonSnapshot={
  snapshotVersion:1,recordedHealthDate:'2026-10-09',
  implementation:{provenance:'original',effectiveDate:'2026-10-01',revision:null},
  review:{state:'descriptive_coverage',reason:'coverage_screen_met',
    baselineWindow:{start:'2026-09-24',end:'2026-09-30'},
    followUpWindow:{start:'2026-10-01',end:'2026-10-07'},
    metrics:[{requirementId:'protein',outcomeKind:'nutrition_metric',metricKey:'protein',
      beforeDays:5,afterDays:5,beforeExpected:7,afterExpected:7}]},
}
const query=(metadata:unknown,overrides:Partial<Parameters<typeof assessExperimentContextApplicability>[0]>={})=>
  assessExperimentContextApplicability({snapshot,
    snapshotCapturedAt:'2026-10-09 15:00:00+00',asOf:'2026-10-18',metadata,...overrides})
const unchanged={profile_changed:false,linked_goal_changed:false,linked_goal_count:2}

describe('PIQ-6.5 post-result goal/profile metadata revisions',()=>{
  it('flags both profile and experiment-linked goal updates after capture without inventing efficacy',()=>{
    for(const metadata of [
      {...unchanged,profile_changed:true},
      {...unchanged,linked_goal_changed:true},
      {...unchanged,profile_changed:true,linked_goal_changed:true},
    ]){
      const x=query(metadata)
      expect(x.state).toBe('needs_recheck')
      expect(x.canRankRecommendations).toBe(false)
      expect(experimentContextApplicabilityCopy(x)).toContain('updated after')
    }
  })
  it('no newer revision is not proof that historical goals, physiology or life circumstances match',()=>{
    const r=query(unchanged)
    expect(r.state).toBe('not_established')
    expect(r).toMatchObject({linkedGoalCount:2,profileChangedAfterCapture:false,
      linkedGoalChangedAfterCapture:false,canRankRecommendations:false})
    expect(experimentContextApplicabilityCopy(r)).toContain('still not established')
  })
  it('never silently treats missing linked goals or missing profile data as established',()=>{
    expect(query({...unchanged,linked_goal_count:0}).state).toBe('not_established')
    expect(experimentContextApplicabilityCopy(query({...unchanged,linked_goal_count:0}))).toContain('no linked goals')
    const noProfile=query({...unchanged,profile_changed:null})
    expect(noProfile.state).toBe('not_established')
    expect(experimentContextApplicabilityCopy(noProfile)).toContain('unavailable')
    expect(query({...unchanged,profile_changed:null,linked_goal_changed:true}).state).toBe('needs_recheck')
  })
  it('fails closed on invalid/missing snapshot or revision metadata',()=>{
    for(const metadata of [null,[],{},'bad',
      {...unchanged,profile_changed:'false'},
      {...unchanged,linked_goal_changed:null},
      {...unchanged,linked_goal_count:-1},
      {...unchanged,linked_goal_count:1.25},
      {...unchanged,linked_goal_count:10001},
    ]){
      expect(query(metadata).state).toBe('unavailable')
    }
    expect(query(unchanged,{snapshot:null}).state).toBe('unavailable')
    expect(query(unchanged,{snapshotCapturedAt:'garbage'}).state).toBe('unavailable')
    expect(query(unchanged,{snapshotCapturedAt:null}).state).toBe('unavailable')
  })
  it('UI exposes a neutral present-day relevance warning, never the profile content',()=>{
    const r=query({...unchanged,profile_changed:true})
    const html=renderToStaticMarkup(React.createElement(ExperimentEvidenceReviewSection,{
      review:{state:'none_recalled',snapshotRecordedDate:'2026-10-09',
        observationsAsOf:'2026-10-18',feedbackVersion:1,primaryMetricCount:1,
        canRankRecommendations:false},contextApplicability:r,
    }))
    expect(html).toContain('Current relevance:')
    expect(html).toContain('health profile')
    expect(html).toContain('not used to rank recommendations')
    expect(html).not.toContain('disease')
  })
  it('the single bounded read only checks post-capture timestamps, not sensitive profile or goal values',()=>{
    const s=readFileSync('server/lab/experiment-results.ts','utf8')
    const querySql=s.slice(s.indexOf('export const EXPERIMENT_CONTEXT_REVISION_SQL'),
      s.indexOf('export async function getExperimentResult'))
    expect(querySql).toContain('FROM health_profile')
    expect(querySql).toContain('FROM experiment_goals eg')
    expect(querySql).toContain('JOIN goals g ON g.id = eg.goal_id')
    expect(querySql).toContain('updated_at > s.captured_at')
    expect(querySql).toContain('s.snapshot_fingerprint = $2::text')
    expect(querySql).not.toContain('clinical_conditions')
    expect(querySql).not.toContain('target_min')
    expect(EXPERIMENT_CONTEXT_REVISION_SQL).not.toContain('\\\\n')
    expect(EXPERIMENT_CONTEXT_REVISION_SQL).toContain('\nFROM experiment_results r')
    expect(querySql).not.toContain('SELECT *')
    const detail=s.slice(s.indexOf('export async function getExperimentResult'),
      s.indexOf('export async function invalidateExperimentResult'))
    expect(detail).toContain('contextApplicability = assessExperimentContextApplicability({')
    expect(detail).toContain('contextRevisionMetadata = null')
    expect(detail).not.toContain('INSERT INTO')
    expect(detail).not.toContain('UPDATE goals')
  })
})
