import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { afterEach, describe, expect, it, vi } from 'vitest'
import apiHandler from '../api/index.js'
import { matchHealthApiRoute } from '../server/dispatch.js'
import { matchLabRoute } from '../server/handlers/lab.js'
import { piqPreviewOwnerApiLocked } from '../server/piq-preview-access.js'
import { wrapNodeResponse, type ApiRequest } from '../server/http.js'

const resultId='11111111-1111-4111-8111-111111111111'
const experimentId='22222222-2222-4222-8222-222222222222'

// Synthetic route probes. No valid owner token, Neon URL, Auth secret, network
// request or health record; blocked dispatch must execute before a handler.
const privatePaths = [
  ['GET', `/api/lab/experiment-results/${resultId}`],
  ['GET', `/api/lab/experiment-results/${resultId}/outcome-feedback-history`],
  ['POST',`/api/lab/experiment-results/${resultId}/outcome-feedback`],
  ['POST',`/api/lab/experiment-results/${resultId}/invalidate`],
  ['POST',`/api/lab/experiments/${experimentId}/result/preview`],
  ['POST',`/api/lab/experiments/${experimentId}/result`],
  ['GET', '/api/backup/export'],
  ['GET', '/api/intelligence/snapshot'],
  ['GET', '/api/ai/usage'],
  ['POST','/api/ask-health'],
  ['GET', '/api/session'],
  ['POST','/api/ingest/apple-health'],
  ['POST','/api/auth/sign-in/email'],
] as const

async function request(method:string,url:string) {
  const rest=url.replace(/^\/api\//,'')
  const req={
    method,url:'/api?path='+rest,query:{path:rest},headers:{},
    async *[Symbol.asyncIterator]() {},
  } as ApiRequest
  const res=wrapNodeResponse(new ServerResponse(new IncomingMessage(new Socket())))
  let status=200
  let body:unknown=null
  res.status=(value:number)=>{status=value;return res}
  res.json=(value:unknown)=>{body=value}
  await apiHandler(req,res)
  return {status,body,cacheControl:res.getHeader('Cache-Control')}
}

afterEach(()=>vi.unstubAllEnvs())

describe('PIQ-7 preview hard lock covers historical Lab and other private APIs',()=>{
  it('rejects every recognized private endpoint BEFORE hitting owner/Auth/DB handlers',async()=>{
    vi.stubEnv('VERCEL_ENV','preview')
    vi.stubEnv('VERCEL_GIT_COMMIT_REF','piq/00-baseline-20261014')
    expect(piqPreviewOwnerApiLocked(process.env)).toBe(true)
    for(const [method,url] of privatePaths){
      expect(matchHealthApiRoute(url),url).not.toBeNull()
      if(url.startsWith('/api/lab/'))expect(matchLabRoute(url),url).not.toBeNull()
      const answer=await request(method,url)
      expect(answer,url).toEqual({
        status:503,
        body:{error:'PIQ preview owner APIs are disabled pending isolation approval.',
          code:'PIQ_PREVIEW_OWNER_API_LOCKED'},
        cacheControl:'no-store',
      })
    }
    // Unknown routes remain not-found: do not blanket-respond to all /api/.
    expect((await request('GET','/api/no-such-route')).status).toBe(404)
  })
  it('fails closed even with misleading production or Git-ref metadata when PIQ markers exist',async()=>{
    vi.stubEnv('VERCEL_ENV','production')
    vi.stubEnv('VERCEL_GIT_COMMIT_REF','main')
    vi.stubEnv('HEALTH_PIQ_EXPECTED_NEON_PROJECT_ID','synthetic-qa-project-only')
    expect(piqPreviewOwnerApiLocked(process.env)).toBe(true)
    for(const url of [`/api/lab/experiment-results/${resultId}/outcome-feedback`,
      '/api/backup/export','/api/auth/sign-in/email']) {
      const response=await request('POST',url)
      expect(response.status,url).toBe(503)
      expect(response.body).toMatchObject({code:'PIQ_PREVIEW_OWNER_API_LOCKED'})
    }
  })
  it('does not mistake an unmarked main config for a PIQ preview',()=>{
    expect(piqPreviewOwnerApiLocked({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main'})).toBe(false)
    expect(piqPreviewOwnerApiLocked({VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:''})).toBe(true)
    expect(piqPreviewOwnerApiLocked({VERCEL_ENV:'production',VERCEL_GIT_COMMIT_REF:'main',
      HEALTH_PIQ_EXPECTED_PREVIEW_SHA:'synthetic-sha-only'})).toBe(true)
  })
})
