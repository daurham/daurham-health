import { describe, expect, it } from 'vitest'
import { transcriptionJobIdFromRequest } from '../api/training/transcription/jobs/[id].ts'
import type { ApiRequest } from '../server/http.ts'

const QUERY_ID = '11111111-1111-4111-8111-111111111111'
const PATH_ID = '22222222-2222-4222-8222-222222222222'

function request(input: { url?: string; query?: ApiRequest['query'] }): ApiRequest {
  return {
    url: input.url,
    query: input.query,
  } as ApiRequest
}

describe('transcription job id from Vercel query or pathname', () => {
  it('prefers a single query.id string over the pathname', () => {
    expect(
      transcriptionJobIdFromRequest(
        request({
          url: `/api/training/transcription/jobs/${PATH_ID}`,
          query: { id: QUERY_ID },
        }),
      ),
    ).toBe(QUERY_ID)
  })

  it('falls back to the pathname when query.id is missing', () => {
    expect(
      transcriptionJobIdFromRequest(request({ url: `/api/training/transcription/jobs/${PATH_ID}` })),
    ).toBe(PATH_ID)
  })
})
