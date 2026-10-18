import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ResultBody } from '../src/features/lab/ExperimentResultPages.js'
import type { ExperimentResultView } from '../src/features/lab/api.js'

// The saved result contract is older than the preview-only limitations shape.
// A detail view must remain renderable when historical optional metadata is absent.
describe('PIQ-6.4 saved Lab result display contract', () => {
  const saved: ExperimentResultView = {
    id:'11111111-1111-4111-8111-111111111111',
    classification:'inconclusive',
    classificationCopy:{title:'Inconclusive result',detail:'Not enough to draw a conclusion.'},
    title:'Synthetic fixture',question:'Did recorded outcomes change?',hypothesis:null,
    protocolVersion:1, windowStart:'2026-10-01',plannedWindowEnd:'2026-10-07',
    effectiveEndDate:'2026-10-07',protocolAttestation:'followed',stoppedForSafety:false,
    requirements:[{requirementId:'22222222-2222-4222-8222-222222222222',
      label:'Protein logged per full day',evaluationStatus:'observed',
      criterionStatus:'not_applicable',summary:{days:5}}],
    limitations:[], footer:'A descriptive observation is not proof of causation.',
  }
  it('returns persisted requirement labels and stable ordering, not empty cards', () => {
    const source=readFileSync('server/lab/experiment-results.ts','utf8')
    expect(source).toContain('JOIN lab_protocol_requirements p ON p.id = rr.requirement_id')
    expect(source).toContain('ORDER BY p.position, rr.id')
    expect(source).toContain('label: item.label')
    expect(source).toContain('limitations: []')
  })
  it('renders saved outcomes when preview-only limitations are omitted by an old API', () => {
    const legacy = { ...saved, limitations: undefined } as unknown as ExperimentResultView
    const html=renderToStaticMarkup(React.createElement(ResultBody,{result:legacy}))
    expect(html).toContain('Protein logged per full day')
    expect(html).toContain('Did recorded outcomes change?')
    expect(html).toContain('not proof of causation')
  })
  it('renders a safe generic label for still-older saved result payloads', () => {
    const legacy={...saved,requirements:[{...saved.requirements[0]!,label:''}]}
    const html=renderToStaticMarkup(React.createElement(ResultBody,{result:legacy}))
    expect(html).toContain('Recorded outcome')
  })
  it('preserves the explicit limitations of current preview results', () => {
    const html=renderToStaticMarkup(React.createElement(ResultBody,{
      result:{...saved,limitations:['Source identity is incomplete.']},
    }))
    expect(html).toContain('Source identity is incomplete.')
  })
})
