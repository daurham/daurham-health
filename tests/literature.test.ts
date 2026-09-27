import { readFileSync } from 'node:fs'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AppSurfaceProvider } from '../src/lib/app-prefix.ts'
import { DemoAskHealthPage } from '../src/features/demo/DemoAskHealthPage.tsx'
import {
  LITERATURE_LIMITATION,
  LITERATURE_NO_RESULTS,
  LITERATURE_PROVIDER_FAILURE,
  LITERATURE_SYNTHESIS_FALLBACK,
  buildLiteratureQueryPrefill,
  classifyStudyType,
  parseLiteratureQuery,
  pubmedLink,
  doiLink,
  retainLiteratureSources,
  synthesisEvidence,
  validateLiteratureSynthesis,
  type LiteratureRecord,
} from '../src/domain/literature/index.ts'
import { NutritionInterpretError } from '../src/domain/nutrition/interpret.ts'
import { createMemoryAiUsageLedger } from '../server/ai-usage/memory.ts'
import { createLiteratureGate } from '../server/literature/gate.ts'
import { europePmcSearchUrl, fetchEuropePmc } from '../server/literature/europe-pmc.ts'
import { searchLiterature, type LiteratureGemini } from '../server/literature/service.ts'

function record(pmid: string, overrides: Partial<LiteratureRecord> = {}): LiteratureRecord {
  return {
    sourceRef: `pubmed:${pmid}`,
    provider: 'europe_pmc',
    pmid,
    doi: null,
    title: `Title ${pmid}`,
    journal: null,
    publicationYear: null,
    authors: [],
    studyType: 'other',
    abstractText: `Abstract ${pmid}`,
    ...overrides,
  }
}

function synthesis(text: string, refs: string[]): string {
  return JSON.stringify({ blocks: [{ text, source_refs: refs }] })
}

function provider(text: string): LiteratureGemini {
  return vi.fn(async () => ({ text, model: 'gemini-test', inputTokens: 10, outputTokens: 4 }))
}

function gate() {
  const ledger = createMemoryAiUsageLedger()
  return {
    ledger,
    gate: createLiteratureGate({ ledger, budgetUsd: 3, minIntervalMs: 0, maxPerMinute: 8, maxRequestCostUsd: 0.05 }),
  }
}

describe('literature query and europe pmc adapter', () => {
  it('prefills a visible query without calling a model or inventing terms', () => {
    expect(buildLiteratureQueryPrefill('Why did my sleep drop to 6 hours on 2026-09-01?')).toBe('Why did sleep drop to on')
    expect(buildLiteratureQueryPrefill('   sleep   duration  ')).toBe('sleep duration')
    const source = readFileSync('src/domain/literature/query.ts', 'utf8')
    expect(source).not.toMatch(/gemini|evidence packet/i)
  })

  it('rejects an empty, oversized, control-character, or URL-bearing query before a provider call', async () => {
    expect(parseLiteratureQuery({ query: '   ' }).ok).toBe(false)
    expect(parseLiteratureQuery({ query: 'a'.repeat(301) }).ok).toBe(false)
    expect(parseLiteratureQuery({ query: 'sleep\u0001duration' }).ok).toBe(false)
    expect(parseLiteratureQuery({ query: 'sleep', url: 'https://evil.example/search' }).ok).toBe(false)
    expect(parseLiteratureQuery({ query: '  sleep   duration ' })).toEqual({ ok: true, query: 'sleep duration' })
    const search = vi.fn()
    const usage = gate()
    await expect(searchLiterature({ query: '', search, gate: usage.gate, model: 'gemini-test', now: 1 })).rejects.toMatchObject({ statusCode: 400 })
    expect(search).not.toHaveBeenCalled()
    expect(usage.ledger.rows()).toHaveLength(0)
  })

  it('builds a fixed Europe PMC URL from the visible query and MED abstract filters', () => {
    const url = new URL(europePmcSearchUrl('sleep duration resistance training recovery'))
    expect(`${url.origin}${url.pathname}`).toBe('https://www.ebi.ac.uk/europepmc/webservices/rest/search')
    expect(url.searchParams.get('query')).toBe('(sleep duration resistance training recovery) AND SRC:MED AND HAS_ABSTRACT:Y')
    expect(url.searchParams.get('format')).toBe('json')
    expect(url.searchParams.get('resultType')).toBe('core')
    expect(url.searchParams.get('pageSize')).toBe('8')
    expect(url.searchParams.get('url')).toBeNull()
  })

  it('keeps PMID, title, and abstract, leaves missing metadata missing, and dedupes in provider order', () => {
    const retained = retainLiteratureSources({
      resultList: {
        result: [
          { source: 'MED', pmid: '111', title: 'First', abstractText: 'Alpha', doi: '10.1000/abc', journalTitle: 'Journal', pubYear: '2020', authorList: { author: { fullName: 'Ada One' } }, pubTypeList: { pubType: ['Meta-Analysis', 'Review'] } },
          { source: 'MED', pmid: '111', title: 'Duplicate pmid', abstractText: 'Dup' },
          { source: 'MED', pmid: '222', title: 'Same doi', abstractText: 'Beta', doi: '10.1000/abc' },
          { source: 'MED', pmid: '333', title: '   ', abstractText: 'No title' },
          { source: 'MED', pmid: '444', title: 'No abstract' },
          { source: 'PPR', pmid: '555', title: 'Preprint', abstractText: 'Skip' },
          { source: 'MED', title: 'No pmid', abstractText: 'Skip' },
          { source: 'MED', pmid: '666', title: 'Bare', abstractText: 'Gamma' },
          { source: 'MED', pmid: '777', title: 'Trial', abstractText: 'Delta', pubType: 'Randomized Controlled Trial' },
          { source: 'MED', pmid: '888', title: 'Six', abstractText: 'Epsilon' },
          { source: 'MED', pmid: '999', title: 'Seven', abstractText: 'Zeta' },
          { source: 'MED', pmid: '101', title: 'Eight', abstractText: 'Eta' },
        ],
      },
    })
    expect(retained.map((item) => item.pmid)).toEqual(['111', '666', '777', '888', '999'])
    expect(retained[0]).toMatchObject({
      sourceRef: 'pubmed:111',
      doi: '10.1000/abc',
      journal: 'Journal',
      publicationYear: 2020,
      authors: ['Ada One'],
      studyType: 'meta_analysis',
    })
    expect(retained[1]).toMatchObject({ doi: null, journal: null, publicationYear: null, authors: [], studyType: 'other' })
    expect(retained[2]?.studyType).toBe('randomized_trial')
    expect(Object.keys(retained[0] ?? {})).not.toContain('qualityScore')
    expect(classifyStudyType(['Systematic Review', 'Journal Article'])).toBe('systematic_review')
    expect(classifyStudyType(['Clinical Trial'])).toBe('clinical_trial')
    expect(classifyStudyType(['Observational Study'])).toBe('observational')
    expect(classifyStudyType(['Review'])).toBe('review')
  })

  it('ignores malformed provider JSON and does not follow another host', async () => {
    const invalid = vi.fn(async () => ({ ok: true, json: async () => { throw new Error('bad json') } }))
    await expect(fetchEuropePmc('sleep', invalid as unknown as typeof fetch)).rejects.toMatchObject({ code: 'unavailable' })
    const called = String(invalid.mock.calls[0]?.[0])
    expect(called.startsWith('https://www.ebi.ac.uk/europepmc/webservices/rest/search?')).toBe(true)
  })
})

describe('literature synthesis', () => {
  it('bounds abstracts, omits them from the browser response, and synthesizes only retrieved refs', async () => {
    const sources = [1, 2, 3, 4, 5].map((number) =>
      record(String(number), { title: 'T'.repeat(2000), abstractText: 'A'.repeat(8000), studyType: 'review' }),
    )
    const evidence = synthesisEvidence('sleep', sources)
    expect(JSON.stringify(evidence).length).toBeLessThanOrEqual(18_000)
    expect(evidence.sources.every((source) => source.abstractText.length <= 3000)).toBe(true)
    expect(evidence.sources.every((source) => source.sourceRef.startsWith('pubmed:'))).toBe(true)
    const last = evidence.sources[evidence.sources.length - 1]
    expect(last?.abstractText.length).toBeLessThan(evidence.sources[0]?.abstractText.length ?? 0)
    const { ledger, gate: usage } = gate()
    const model = provider(synthesis('In the retrieved literature, these sources discuss sleep.', ['pubmed:1']))
    const response = await searchLiterature({
      query: 'sleep',
      search: async () => sources,
      provider: model,
      gate: usage,
      model: 'gemini-test',
      now: 1_700_000_000_000,
    })
    expect(response.sources).toHaveLength(5)
    expect(JSON.stringify(response)).not.toContain('abstractText')
    expect(response.synthesis?.blocks[0]?.sourceRefs).toEqual(['pubmed:1'])
    expect(response.limitation).toBe(LITERATURE_LIMITATION)
    expect(response.notice).toBeNull()
    const user = JSON.parse(String(model.mock.calls[0]?.[0].user)) as { query: string; sources: Array<Record<string, unknown>> }
    expect(Object.keys(user).sort()).toEqual(['query', 'sources'])
    expect(user.sources[0]?.abstractText).toEqual(expect.any(String))
    expect(JSON.stringify(user)).not.toMatch(/goal|transcript|measurement|conversation/i)
    expect(ledger.rows()).toHaveLength(1)
    expect(ledger.rows()[0]?.status).toBe('completed')
    const cached = provider(synthesis('A second call should not run.', ['pubmed:1']))
    const again = await searchLiterature({
      query: 'sleep',
      search: async () => sources,
      provider: cached,
      gate: usage,
      model: 'gemini-test',
      now: 1_700_000_000_000,
    })
    expect(cached).not.toHaveBeenCalled()
    expect(again.synthesis?.blocks[0]?.text).toContain('retrieved literature')
    expect(ledger.rows()).toHaveLength(1)
  })

  it('rejects unknown refs, missing refs, invented fields, and numeric prose', () => {
    const refs = new Set(['pubmed:1'])
    expect(validateLiteratureSynthesis(synthesis('In the retrieved literature, these sources discuss sleep.', ['pubmed:1']), refs).ok).toBe(true)
    expect(validateLiteratureSynthesis(synthesis('In the retrieved literature, these sources discuss sleep.', ['pubmed:9']), refs).ok).toBe(false)
    expect(validateLiteratureSynthesis(JSON.stringify({ blocks: [{ text: 'These sources discuss sleep.', source_refs: [] }] }), refs).ok).toBe(false)
    expect(validateLiteratureSynthesis(JSON.stringify({ blocks: [{ text: 'These sources discuss sleep.', source_refs: ['pubmed:1'], url: 'https://example.test' }] }), refs).ok).toBe(false)
    expect(validateLiteratureSynthesis(JSON.stringify({ blocks: [{ text: 'These sources discuss sleep.', source_refs: ['pubmed:1'] }], citations: [{ title: 'Invented' }] }), refs).ok).toBe(false)
    expect(validateLiteratureSynthesis(synthesis('These sources discuss a 12 percent change.', ['pubmed:1']), refs).ok).toBe(false)
    expect(validateLiteratureSynthesis(synthesis('Research proves why your metric changed.', ['pubmed:1']), refs).ok).toBe(false)
  })

  it('skips Gemini when nothing valid returns and keeps source cards when synthesis fails', async () => {
    const emptyGate = gate()
    const emptyProvider = provider('{}')
    const empty = await searchLiterature({
      query: 'zzzz-no-such-topic',
      search: async () => [],
      provider: emptyProvider,
      gate: emptyGate.gate,
      model: 'gemini-test',
      now: 1_700_000_000_000,
    })
    expect(empty.notice).toBe(LITERATURE_NO_RESULTS)
    expect(emptyProvider).not.toHaveBeenCalled()
    expect(emptyGate.ledger.rows()).toHaveLength(0)

    const failed = await searchLiterature({
      query: 'sleep',
      search: async () => { throw new Error('timeout') },
      provider: emptyProvider,
      gate: gate().gate,
      model: 'gemini-test',
      now: 1_700_000_000_000,
    })
    expect(failed.notice).toBe(LITERATURE_PROVIDER_FAILURE)
    expect(failed.sources).toEqual([])

    const budgetLedger = createMemoryAiUsageLedger()
    await budgetLedger.reserve({
      requestType: 'ask_health',
      provider: 'gemini',
      model: 'gemini-test',
      requestHash: 'ask',
      reservedCostUsd: 3,
      now: 1_700_000_000_000,
      budgetUsd: 3,
      minIntervalMs: 0,
      maxPerMinute: 8,
    })
    const budgetProvider = provider(synthesis('In the retrieved literature, these sources discuss sleep.', ['pubmed:1']))
    const budget = await searchLiterature({
      query: 'sleep',
      search: async () => [record('1')],
      provider: budgetProvider,
      gate: createLiteratureGate({ ledger: budgetLedger, budgetUsd: 3, minIntervalMs: 0, maxPerMinute: 8, maxRequestCostUsd: 0.05 }),
      model: 'gemini-test',
      now: 1_700_000_001_000,
    })
    expect(budget.sources).toHaveLength(1)
    expect(budget.synthesis).toBeNull()
    expect(budget.notice).toBe(LITERATURE_SYNTHESIS_FALLBACK)
    expect(budgetProvider).not.toHaveBeenCalled()

    const timeoutLedger = createMemoryAiUsageLedger()
    const timeoutProvider = vi.fn(async () => {
      throw new NutritionInterpretError('GEMINI_TIMEOUT', 'timed out')
    })
    const timedOut = await searchLiterature({
      query: 'sleep',
      search: async () => [record('1')],
      provider: timeoutProvider,
      gate: createLiteratureGate({ ledger: timeoutLedger, budgetUsd: 3, minIntervalMs: 0, maxPerMinute: 8, maxRequestCostUsd: 0.05 }),
      model: 'gemini-test',
      now: 1_700_000_000_000,
    })
    expect(timedOut.sources).toHaveLength(1)
    expect(timedOut.notice).toBe(LITERATURE_SYNTHESIS_FALLBACK)
    expect(timeoutLedger.rows()[0]?.status).toBe('uncertain')

    const missingLedger = createMemoryAiUsageLedger()
    await searchLiterature({
      query: 'sleep',
      search: async () => [record('1')],
      provider: vi.fn(async () => {
        throw new NutritionInterpretError('GEMINI_NOT_CONFIGURED', 'missing')
      }),
      gate: createLiteratureGate({ ledger: missingLedger, budgetUsd: 3, minIntervalMs: 0, maxPerMinute: 8, maxRequestCostUsd: 0.05 }),
      model: 'gemini-test',
      now: 1_700_000_000_000,
    })
    expect(missingLedger.rows()[0]?.status).toBe('released')

    const invalidLedger = createMemoryAiUsageLedger()
    const invalid = await searchLiterature({
      query: 'sleep',
      search: async () => [record('1')],
      provider: provider(synthesis('These sources discuss 8 hours.', ['pubmed:1'])),
      gate: createLiteratureGate({ ledger: invalidLedger, budgetUsd: 3, minIntervalMs: 0, maxPerMinute: 8, maxRequestCostUsd: 0.05 }),
      model: 'gemini-test',
      now: 1_700_000_000_000,
    })
    expect(invalid.sources[0]?.pubmedUrl).toBe(pubmedLink('1'))
    expect(invalid.synthesis).toBeNull()
    expect(invalidLedger.rows()[0]?.status).toBe('completed')
  })

  it('shares the monthly budget and rate gate with other AI request types', () => {
    const ledgerSource = readFileSync('server/ai-usage/ledger.ts', 'utf8')
    const attempts = ledgerSource.slice(ledgerSource.indexOf('WITH attempts'), ledgerSource.indexOf('charged AS'))
    expect(attempts).not.toContain('request_type')
    expect(readFileSync('server/literature/gate.ts', 'utf8')).toContain("requestType: LITERATURE_REQUEST_TYPE")
    expect(readFileSync('src/domain/literature/config.ts', 'utf8')).toContain("literature_synthesis")
  })
})

describe('literature product boundaries', () => {
  it('keeps Ask Health, insights, coach, today, and lab free of literature retrieval', () => {
    const page = readFileSync('src/features/ask-health/AskHealthPage.tsx', 'utf8')
    const drawer = readFileSync('src/features/ask-health/ExternalResearch.tsx', 'utf8')
    expect(page).not.toContain('searchLiterature')
    expect(drawer.match(/searchLiterature\(/g)).toEqual(['searchLiterature('])
    expect(drawer).toContain('onClick={() => void search()}')
    expect(drawer).not.toContain('useEffect')
    expect(page + drawer).not.toContain('localStorage')
    expect(readFileSync('src/features/ask-health/AnswerView.tsx', 'utf8')).toContain('Your Health evidence')
    expect(readFileSync('src/features/ask-health/AnswerView.tsx', 'utf8')).toContain('[${number}]')
    expect(readFileSync('src/features/ask-health/ResearchSources.tsx', 'utf8')).toContain('[${marker}]')
    for (const file of [
      'server/handlers/ask-health.ts',
      'server/ask-health/service.ts',
      'server/weekly-coach/service.ts',
      'server/handlers/today.ts',
      'server/handlers/progress-insights.ts',
      'server/handlers/progress-weekly.ts',
      'server/lab/suggestions.ts',
    ]) {
      expect(readFileSync(file, 'utf8')).not.toContain('literature')
    }
    const literatureServer = ['server/literature/service.ts', 'server/literature/europe-pmc.ts', 'server/handlers/ask-health-literature.ts']
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n')
    expect(literatureServer).not.toMatch(/INSERT INTO/)
    expect(readFileSync('server/backup/inventory.ts', 'utf8')).not.toContain('literature')
    expect(doiLink('10.1000/abc')).toBe('https://doi.org/10.1000/abc')
    expect(doiLink('https://evil.example/10.1000/abc')).toBeNull()
  })

  it('renders a compiled demo drawer with verified citations and no provider call', () => {
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AppSurfaceProvider, { prefix: '/demo', readOnly: true, children: React.createElement(DemoAskHealthPage) }),
      ),
    )
    expect(html).toContain('Your Health evidence')
    expect(html).toContain('External research')
    expect(html).toContain('Example research drawer — not retrieved live')
    expect(html).toContain('https://pubmed.ncbi.nlm.nih.gov/29135639/')
    expect(html).toContain('https://doi.org/10.1249/jsr.0000000000000418')
    expect(html).toContain('[R1]')
    expect(html).not.toContain('Sleep is an essential component')
    const demoSource = readFileSync('src/demo/literature.ts', 'utf8') + readFileSync('src/features/demo/DemoAskHealthPage.tsx', 'utf8')
    expect(demoSource).not.toMatch(/healthFetch|gemini|getSql|ebi\.ac\.uk/i)
    expect(demoSource).not.toContain('localStorage')
  })
})
