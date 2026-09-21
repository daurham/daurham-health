import { describe, expect, it } from 'vitest'
import { sessionIdFromRequest } from '../api/training/sessions/[id].ts'
import type { ApiRequest } from '../server/http.ts'

const QUERY_ID = '11111111-1111-4111-8111-111111111111'
const PATH_ID = '22222222-2222-4222-8222-222222222222'

function request(input: { url?: string; query?: ApiRequest['query'] }): ApiRequest {
  return {
    url: input.url,
    query: input.query,
  } as ApiRequest
}

describe('training session id from Vercel query or pathname', () => {
  it('prefers a single query.id string over the pathname', () => {
    expect(
      sessionIdFromRequest(
        request({
          url: `/api/training/sessions/${PATH_ID}`,
          query: { id: QUERY_ID },
        }),
      ),
    ).toBe(QUERY_ID)
  })

  it('falls back to the pathname when query.id is missing', () => {
    expect(sessionIdFromRequest(request({ url: `/api/training/sessions/${PATH_ID}` }))).toBe(PATH_ID)
  })

  it('ignores array, blank, and non-string query.id values', () => {
    expect(
      sessionIdFromRequest(
        request({
          url: `/api/training/sessions/${PATH_ID}`,
          query: { id: [QUERY_ID, PATH_ID] },
        }),
      ),
    ).toBe(PATH_ID)
    expect(
      sessionIdFromRequest(
        request({
          url: `/api/training/sessions/${PATH_ID}`,
          query: { id: '   ' },
        }),
      ),
    ).toBe(PATH_ID)
    expect(sessionIdFromRequest(request({ url: '/api/training/sessions/' }))).toBeNull()
    expect(sessionIdFromRequest(request({}))).toBeNull()
  })
})
