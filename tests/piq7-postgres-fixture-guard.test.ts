import {describe,expect,it,vi} from 'vitest'
import {readFileSync} from 'node:fs'
import {assertPiqPostgresFixtureTarget,assertPiqPostgresFixtureSession} from '../server/piq-postgres-fixture.js'

const fixture='postgres://piq:synthetic-only@localhost:5432/piq_fixture'
describe('PIQ-7 destructive database fixture guard',()=>{
  it('allows an explicitly named local disposable test target',()=>{
    expect(()=>assertPiqPostgresFixtureTarget(fixture)).not.toThrow()
    expect(()=>assertPiqPostgresFixtureTarget(fixture.replace('localhost','127.0.0.1'))).not.toThrow()
  })
  it('rejects remote, owner-like, and malformed targets',()=>{
    const invalid=[
      fixture.replace('localhost','db.example.test'),
      fixture.replace('localhost','localhost.example.test'),
      fixture.replace('localhost','127.0.0.2'),
      fixture.replace('/piq_fixture','/neondb'),
      fixture.replace('piq:','owner:'),
      fixture.replace(':5432',':5433'),
      fixture.replace('postgres:','https:'),
      fixture+'?sslmode=require',
      fixture+'#unexpected',
      fixture.replace(':synthetic-only',':'),
      '',
      'not-a-URL',
    ]
    for(const url of invalid){
      expect(()=>assertPiqPostgresFixtureTarget(url),url).toThrow(/refusing to run/)
    }
  })
  it('does not print rejected URLs or sensitive credentials',()=>{
    const secret='sensitive-test-credential'
    let message=''
    try{assertPiqPostgresFixtureTarget('postgres://owner:'+secret+'@db.example.test:5432/neondb')}
    catch(error){message=(error as Error).message}
    expect(message).toContain('refusing to run')
    expect(message).not.toContain(secret)
    expect(message).not.toContain('db.example.test')
  })
  it('checks actual server identity with a read-only query before mutations',async()=>{
    const good=vi.fn(async(sql:string)=>{
      expect(sql).toBe('SELECT current_database() AS db, current_user AS role')
      return {rows:[{db:'piq_fixture',role:'piq'}]}
    })
    await expect(assertPiqPostgresFixtureSession({query:good})).resolves.toBeUndefined()
    expect(good).toHaveBeenCalledTimes(1)
    for(const wrong of [{db:'piq_fixture',role:'owner'},{db:'neondb',role:'piq'}]){
      await expect(assertPiqPostgresFixtureSession({query:async()=>({rows:[wrong]})}))
        .rejects.toThrow(/refusing to run/)
    }
    await expect(assertPiqPostgresFixtureSession({
      query:async()=>{throw new Error('private DB connection failure details')},
    })).rejects.not.toThrow(/private DB connection/)
  })
  it('requires both destructive suites to verify target before opening clients, and identity before SQL DDL',()=>{
    for(const [path,ddl] of [
      ['tests/piq1-nutrition-postgres.integration.test.ts',"await db.query(file('migrations/0008_nutrition.sql'))"],
      ['tests/piq1-full-migration-postgres.integration.test.ts',"await client.query('CREATE SCHEMA piq_full_chain')"],
    ]){
      const source=readFileSync(path,'utf8')
      const target=source.indexOf('if (url !== undefined) assertPiqPostgresFixtureTarget(url)')
      const client=source.indexOf('new Client(')
      const start=source.indexOf('beforeAll(async () => {')
      const identity=source.indexOf('assertPiqPostgresFixtureSession(',start)
      expect(target).toBeGreaterThan(0)
      expect(client).toBeGreaterThan(target)
      expect(identity).toBeGreaterThan(start)
      expect(source.indexOf(ddl,start)).toBeGreaterThan(identity)
    }
  })
})
