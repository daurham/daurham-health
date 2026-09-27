import { LITERATURE_AUTHOR_LIMIT, LITERATURE_PROVIDER, LITERATURE_SOURCE_LIMIT } from './config.js'
import type { LiteratureRecord, LiteratureSourceCard, LiteratureStudyType } from './types.js'

const STUDY_RULES: ReadonlyArray<readonly [LiteratureStudyType, RegExp]> = [
  ['meta_analysis', /meta-?\s*analysis/i],
  ['systematic_review', /systematic review/i],
  ['randomized_trial', /randomi[sz]ed controlled trial/i],
  ['clinical_trial', /clinical trial/i],
  ['observational', /observational/i],
  ['review', /\breview\b/i],
]

const DOI_PATTERN = /^10\.\d{4,9}\/\S+$/

export const STUDY_TYPE_LABELS: Record<LiteratureStudyType, string> = {
  meta_analysis: 'Meta-analysis',
  systematic_review: 'Systematic review',
  randomized_trial: 'Randomized trial',
  clinical_trial: 'Clinical trial',
  observational: 'Observational',
  review: 'Review',
  other: 'Other',
}

export function classifyStudyType(publicationTypes: readonly string[]): LiteratureStudyType {
  for (const [studyType, pattern] of STUDY_RULES) {
    if (publicationTypes.some((value) => pattern.test(value))) {
      return studyType
    }
  }
  return 'other'
}

export function pubmedLink(pmid: string): string | null {
  if (!/^\d{1,9}$/.test(pmid)) {
    return null
  }
  return `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`
}

export function doiLink(doi: string | null): string | null {
  if (!doi || !DOI_PATTERN.test(doi) || doi.includes('://') || doi.includes('\\')) {
    return null
  }
  return `https://doi.org/${encodeURI(doi)}`
}

export function authorLine(authors: readonly string[]): string {
  if (authors.length === 0) {
    return ''
  }
  if (authors.length <= 3) {
    return authors.join(', ')
  }
  return `${authors.slice(0, 3).join(', ')}, et al.`
}

export function retainLiteratureSources(payload: unknown): LiteratureRecord[] {
  const rows = readResults(payload)
  const kept: LiteratureRecord[] = []
  const pmids = new Set<string>()
  const dois = new Set<string>()
  for (const row of rows) {
    const record = readRecord(row)
    if (!record || pmids.has(record.pmid)) {
      continue
    }
    if (record.doi && dois.has(record.doi.toLowerCase())) {
      continue
    }
    pmids.add(record.pmid)
    if (record.doi) {
      dois.add(record.doi.toLowerCase())
    }
    kept.push(record)
    if (kept.length === LITERATURE_SOURCE_LIMIT) {
      break
    }
  }
  return kept
}

export function toSourceCard(record: LiteratureRecord, index: number): LiteratureSourceCard {
  const pubmedUrl = pubmedLink(record.pmid)
  if (!pubmedUrl) {
    throw new Error('Literature source is missing a PubMed id')
  }
  return {
    sourceRef: record.sourceRef,
    provider: record.provider,
    pmid: record.pmid,
    doi: record.doi,
    title: record.title,
    journal: record.journal,
    publicationYear: record.publicationYear,
    authors: record.authors,
    studyType: record.studyType,
    marker: `R${index + 1}`,
    pubmedUrl,
    doiUrl: doiLink(record.doi),
  }
}

function readResults(payload: unknown): unknown[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return []
  }
  const resultList = (payload as Record<string, unknown>).resultList
  if (!resultList || typeof resultList !== 'object' || Array.isArray(resultList)) {
    return []
  }
  const result = (resultList as Record<string, unknown>).result
  if (Array.isArray(result)) {
    return result
  }
  return result ? [result] : []
}

function readRecord(row: unknown): LiteratureRecord | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) {
    return null
  }
  const record = row as Record<string, unknown>
  const source = typeof record.source === 'string' ? record.source : null
  if (source && source !== 'MED') {
    return null
  }
  const pmid = readPmid(record.pmid)
  const title = cleanText(record.title, 500)
  const abstractText = cleanText(record.abstractText, 20_000)
  if (!pmid || !title || !abstractText) {
    return null
  }
  const doi = readDoi(record.doi)
  return {
    sourceRef: `pubmed:${pmid}`,
    provider: LITERATURE_PROVIDER,
    pmid,
    doi,
    title,
    journal: readJournal(record),
    publicationYear: readYear(record),
    authors: readAuthors(record),
    studyType: classifyStudyType(readPublicationTypes(record)),
    abstractText,
  }
}

function readPmid(value: unknown): string | null {
  const text = typeof value === 'number' && Number.isInteger(value) ? String(value) : typeof value === 'string' ? value.trim() : ''
  return /^\d{1,9}$/.test(text) ? text : null
}

function readDoi(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const doi = value.trim()
  return DOI_PATTERN.test(doi) && !doi.includes('://') && !doi.includes('\\') ? doi : null
}

function readJournal(record: Record<string, unknown>): string | null {
  const direct = cleanText(record.journalTitle, 300)
  if (direct) {
    return direct
  }
  const info = record.journalInfo
  if (!info || typeof info !== 'object' || Array.isArray(info)) {
    return null
  }
  const journal = (info as Record<string, unknown>).journal
  if (!journal || typeof journal !== 'object' || Array.isArray(journal)) {
    return null
  }
  return cleanText((journal as Record<string, unknown>).title, 300)
}

function readYear(record: Record<string, unknown>): number | null {
  const raw = record.pubYear ?? yearFromJournal(record)
  const text = typeof raw === 'number' ? String(raw) : typeof raw === 'string' ? raw.trim() : ''
  if (!/^\d{4}$/.test(text)) {
    return null
  }
  const year = Number(text)
  return year >= 1800 && year <= 2100 ? year : null
}

function yearFromJournal(record: Record<string, unknown>): unknown {
  const info = record.journalInfo
  if (!info || typeof info !== 'object' || Array.isArray(info)) {
    return null
  }
  return (info as Record<string, unknown>).yearOfPublication
}

function readAuthors(record: Record<string, unknown>): string[] {
  const list = record.authorList
  const author = list && typeof list === 'object' && !Array.isArray(list) ? (list as Record<string, unknown>).author : null
  const items = Array.isArray(author) ? author : author ? [author] : []
  const names = items
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return ''
      }
      return cleanText((item as Record<string, unknown>).fullName, 120) ?? ''
    })
    .filter((name) => name.length > 0)
  if (names.length > 0) {
    return names.slice(0, LITERATURE_AUTHOR_LIMIT)
  }
  if (typeof record.authorString !== 'string') {
    return []
  }
  return record.authorString
    .split(',')
    .map((part) => cleanText(part.replace(/\.$/, ''), 120) ?? '')
    .filter((name) => name.length > 0)
    .slice(0, LITERATURE_AUTHOR_LIMIT)
}

function readPublicationTypes(record: Record<string, unknown>): string[] {
  const list = record.pubTypeList
  const pubType = list && typeof list === 'object' && !Array.isArray(list) ? (list as Record<string, unknown>).pubType : record.pubType
  if (Array.isArray(pubType)) {
    return pubType.filter((item): item is string => typeof item === 'string')
  }
  if (typeof pubType === 'string') {
    return pubType.split(';').map((item) => item.trim()).filter((item) => item.length > 0)
  }
  return []
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const text = value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  if (text.length === 0) {
    return null
  }
  return text.slice(0, max)
}
