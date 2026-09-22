import { useState } from 'react'
import { BodySection } from '@/features/progress/BodySection'
import { EvidencePanel, type EvidenceTopic } from '@/features/progress/EvidencePanel'
import { demoOverview } from '@/demo/repository'

export function DemoBodyPage() {
  const overview = demoOverview('all')
  const [evidence, setEvidence] = useState<EvidenceTopic | null>(null)
  return (
    <section className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Body</h1>
        <p className="mt-1 text-sm text-zinc-600">Weight is measured about every two weeks, with a few composition readings.</p>
      </div>
      <BodySection overview={overview} onEvidence={setEvidence} />
      {evidence ? <EvidencePanel topic={evidence} onClose={() => setEvidence(null)} /> : null}
    </section>
  )
}
