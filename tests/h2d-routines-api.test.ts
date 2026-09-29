import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { handleTrainingTemplates } from '../server/handlers/training-templates.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const mocks = vi.hoisted(() => ({
  listTemplates: vi.fn(),
  createOwnerRoutine: vi.fn(),
  reviseOwnerRoutine: vi.fn(),
  archiveOwnerRoutine: vi.fn(),
}))
vi.mock('../server/training/service.ts', () => mocks)

const config: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example', cookieSecret: 'x'.repeat(32), sameSite: 'lax',
  sessionDataTtl: 300, ownerUserId: 'owner-1', ownerEmail: 'owner@example.com',
}
const ID='11111111-1111-4111-8111-111111111111'
function request(method:string,url:string,body?:unknown):ApiRequest {
  return {method,url,headers:{},body,async *[Symbol.asyncIterator](){}} as ApiRequest
}
function response(){
  const res=wrapNodeResponse(new ServerResponse(new IncomingMessage(new Socket())))
  let statusCode=200; const headers=new Map<string,string>()
  res.setHeader=((name:string,value:string)=>{headers.set(name.toLowerCase(),value);return res}) as ApiResponse['setHeader']
  res.status=(code:number)=>{statusCode=code;return res}; res.json=()=>res
  return {res,status:()=>statusCode,allow:()=>headers.get('allow')}
}
async function call(method:string,url:string,identity:{id:string;email:string}|null,body?:unknown){
  const out=response()
  await withOwnerAuth(handleTrainingTemplates,{config,readSession:async()=>identity})(request(method,url,body),out.res)
  return out
}

describe('Saved Routine owner API',()=>{
  beforeEach(()=>{
    Object.values(mocks).forEach(fn=>fn.mockReset())
    mocks.listTemplates.mockResolvedValue({templates:[]})
    mocks.createOwnerRoutine.mockResolvedValue({template:{id:ID}})
    mocks.reviseOwnerRoutine.mockResolvedValue({template:{id:ID}})
    mocks.archiveOwnerRoutine.mockResolvedValue({ok:true})
  })
  it('routes list/create/revise/archive through the single owner API',()=>{
    expect(matchHealthApiRoute('/api/training/templates')).toBe('training-templates')
    expect(matchHealthApiRoute(`/api/training/templates/${ID}`)).toBe('training-templates')
  })
  it('enforces owner auth and methods',async()=>{
    const owner={id:'owner-1',email:'owner@example.com'}
    expect((await call('POST','/api/training/templates',null,{})).status()).toBe(401)
    expect((await call('POST','/api/training/templates',{id:'other',email:'other@example.com'},{})).status()).toBe(403)
    expect((await call('GET','/api/training/templates',owner)).status()).toBe(200)
    expect((await call('POST','/api/training/templates',owner,{})).status()).toBe(201)
    expect((await call('PATCH',`/api/training/templates/${ID}`,owner,{})).status()).toBe(200)
    expect((await call('DELETE',`/api/training/templates/${ID}`,owner)).status()).toBe(200)
    const wrong=await call('PUT','/api/training/templates',owner)
    expect(wrong.status()).toBe(405); expect(wrong.allow()).toBe('GET, POST')
    const detailWrong=await call('POST',`/api/training/templates/${ID}`,owner)
    expect(detailWrong.status()).toBe(405); expect(detailWrong.allow()).toBe('PATCH, DELETE')
  })
})
