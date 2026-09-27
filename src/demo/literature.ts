import type { LiteratureSearchResponse } from '@/domain/literature'
import { LITERATURE_LIMITATION, doiLink, pubmedLink } from '@/domain/literature'

export const DEMO_LITERATURE_LABEL = 'Example research drawer — not retrieved live'

const watsonPmid = '29135639'
const watsonDoi = '10.1249/jsr.0000000000000418'
const mahPmid = '21731144'
const mahDoi = '10.5665/sleep.1132'

/** Citation metadata verified against Europe PMC on 2026-09-27. Abstracts are omitted. */
export const DEMO_LITERATURE: LiteratureSearchResponse = {
  calculationVersion: 'literature-retrieval-v1',
  provider: 'europe_pmc',
  query: 'sleep athletic performance',
  sources: [
    {
      sourceRef: `pubmed:${watsonPmid}`,
      provider: 'europe_pmc',
      pmid: watsonPmid,
      doi: watsonDoi,
      title: 'Sleep and Athletic Performance.',
      journal: 'Current sports medicine reports',
      publicationYear: 2017,
      authors: ['Watson AM'],
      studyType: 'review',
      marker: 'R1',
      pubmedUrl: pubmedLink(watsonPmid) ?? '',
      doiUrl: doiLink(watsonDoi),
    },
    {
      sourceRef: `pubmed:${mahPmid}`,
      provider: 'europe_pmc',
      pmid: mahPmid,
      doi: mahDoi,
      title: 'The effects of sleep extension on the athletic performance of collegiate basketball players.',
      journal: 'Sleep',
      publicationYear: 2011,
      authors: ['Mah CD', 'Mah KE', 'Kezirian EJ', 'Dement WC'],
      studyType: 'other',
      marker: 'R2',
      pubmedUrl: pubmedLink(mahPmid) ?? '',
      doiUrl: doiLink(mahDoi),
    },
  ],
  synthesis: {
    blocks: [
      {
        text: 'In the retrieved literature, these sources discuss sleep and athletic performance.',
        sourceRefs: [`pubmed:${watsonPmid}`, `pubmed:${mahPmid}`],
      },
      {
        text: 'These studies do not establish what is happening in an individual case.',
        sourceRefs: [`pubmed:${watsonPmid}`],
      },
    ],
  },
  notice: null,
  limitation: LITERATURE_LIMITATION,
}
