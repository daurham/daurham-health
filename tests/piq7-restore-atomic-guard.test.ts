import {describe, expect, it, vi} from 'vitest'
import {buildBackupArchive} from '../server/backup/format.js'
import {BACKUP_TABLES,LATEST_SCHEMA_MIGRATION} from '../server/backup/inventory.js'
import {applyRestore,restoreDestinationGuardStatements,
  assertBackupMigrationHistory,readBackupTables} from '../server/backup/database.js'
import {listMigrationFiles} from '../server/migrate.js'
import {readFileSync} from 'node:fs'
import {runtimeMigrationFiles} from '../server/backup/database.js'
import type {Sql} from '../server/db.js'

describe('PIQ-7 restore application never silently succeeds on blocked or changed destination',()=>{
  it('includes migration files for Vercel and uses the runtime working directory',async()=>{
    const config=JSON.parse(readFileSync('vercel.json','utf8')) as {
      functions?:Record<string,{includeFiles?:string|Array<string>}>
    }
    expect(config.functions?.['api/index.ts']?.includeFiles).toContain('migrations/*.sql')
    expect(await runtimeMigrationFiles()).toEqual(await listMigrationFiles())
    const source=readFileSync('server/backup/database.ts','utf8')
    expect(source).toContain("path.join(process.cwd(),'migrations')")
    expect(source).not.toContain("path.join(path.dirname(fileURLToPath(import.meta.url)),'../../migrations')")
    // CI validates packaging configuration, not runtime filesystem proof.
  })
  it('refuses an export if any historic migration differs despite matching count and latest',async()=>{
    const expected=await listMigrationFiles()
    expect(()=>assertBackupMigrationHistory(expected,expected)).not.toThrow()
    const altered=expected.map((filename,i)=>i===53?'0054_tampered_middle.sql':filename)
    expect(altered).toHaveLength(expected.length)
    expect(altered.at(-1)).toBe(LATEST_SCHEMA_MIGRATION)
    expect(()=>assertBackupMigrationHistory(altered,expected)).toThrow('Backup refused')
    expect(()=>assertBackupMigrationHistory(expected.slice(1),expected)).toThrow('Backup refused')
    const query=vi.fn(async(sql:string)=>{
      if(sql==='SELECT filename FROM schema_migrations ORDER BY filename')
        return altered.map(filename=>({filename}))
      return []
    })
    const fake={
      transaction:async(callback:(txn:{query:typeof query})=>Promise<unknown>[]) =>
        Promise.all(callback({query})),
    } as unknown as Sql
    await expect(readBackupTables(fake)).rejects.toThrow('Backup refused')
    expect(query).toHaveBeenCalledWith('SELECT filename FROM schema_migrations ORDER BY filename')
    query.mockImplementation(async(sql:string)=>{
      if(sql==='SELECT filename FROM schema_migrations ORDER BY filename')
        return expected.map(filename=>({filename}))
      return []
    })
    const intact=await readBackupTables(fake)
    expect(intact.schemaMigration).toBe(LATEST_SCHEMA_MIGRATION)
    expect(intact.rowsByTable).toMatchObject({})
  })
  it('locks ALL backed-up tables, limits lock wait and checks destination/schema in transaction',async()=>{
    const expected=await listMigrationFiles()
    const guard=restoreDestinationGuardStatements(expected)
    expect(guard).toHaveLength(3)
    expect(guard[0]?.text).toContain('lock_timeout')
    const lock=guard[1]?.text??''
    expect(lock).toContain('ACCESS EXCLUSIVE MODE')
    expect(lock).toContain('schema_migrations')
    for(const table of BACKUP_TABLES){
      expect(lock).toContain(table.name)
      if(!table.seeded)expect(guard[2]?.text).toContain('EXISTS (SELECT 1 FROM '+table.name+' LIMIT 1)')
    }
    expect(guard[2]?.text).toContain('PIQ_RESTORE_SCHEMA_CHANGED')
    expect(guard[2]?.text).toContain('PIQ_RESTORE_DESTINATION_NOT_EMPTY')
    expect(guard[2]?.text).toContain(LATEST_SCHEMA_MIGRATION)
    expect(guard[2]?.text).toContain('array_agg(filename ORDER BY filename)')
    for(const name of expected)expect(guard[2]?.text).toContain("'"+name+"'")
    expect(()=>restoreDestinationGuardStatements(expected.slice(1))).toThrow('migration manifest')
    expect(()=>restoreDestinationGuardStatements(expected.map((name,i)=>i===12?'0013_fake.sql':name)))
      .not.toThrow() // the live database still rejects this nonmatching expected list
  })
  it('throws on a blocked preflight instead of reporting a false successful restore',async()=>{
    const backup=buildBackupArchive({
      profile:'full',createdAt:'2026-10-18T00:00:00.000Z',
      schemaMigration:LATEST_SCHEMA_MIGRATION,appVersionOrCommit:'synthetic',
      rowsByTable:{},
    })
    let txCalls=0
    const sql={
      query:vi.fn(async()=>[{filename:LATEST_SCHEMA_MIGRATION}]),
      transaction:vi.fn(async(callback: (txn:{query:(q:string)=>Promise<unknown>})=>Promise<unknown>[])=>{
        txCalls++
        const responses=callback({query:async(q:string)=>{
          if(!q.includes('COUNT(*)'))throw Error('Unexpected SQL')
          return [{count:1}]
        }})
        return Promise.all(responses)
      }),
    } as unknown as Sql
    await expect(applyRestore(sql,backup)).rejects.toThrow(/Restore refused:.*already has 1 rows/)
    expect(txCalls).toBe(1)
  })
  it('does not swallow an INSERT-transaction error or return committed success',async()=>{
    const backup=buildBackupArchive({
      profile:'full',createdAt:'2026-10-18T00:00:00.000Z',
      schemaMigration:LATEST_SCHEMA_MIGRATION,appVersionOrCommit:'synthetic',
      rowsByTable:{},
    })
    let txCalls=0
    const sql={
      query:async()=>[{filename:LATEST_SCHEMA_MIGRATION}],
      transaction:async(callback:(txn:{query:(q:string)=>Promise<unknown>})=>Promise<unknown>[])=>{
        txCalls++
        const queries:string[]=[]
        const result=callback({query:async(q:string)=>{
          queries.push(q)
          if(txCalls===2)throw new Error('PIQ_RESTORE_DESTINATION_NOT_EMPTY')
          return [{count:0}]
        }})
        if(txCalls===2){
          expect(queries[0]).toContain('SET LOCAL lock_timeout')
          expect(queries[1]).toContain('LOCK TABLE schema_migrations')
          expect(queries[2]).toContain('PIQ_RESTORE_DESTINATION_NOT_EMPTY')
        }
        return Promise.all(result)
      },
    } as unknown as Sql
    await expect(applyRestore(sql,backup)).rejects.toThrow('PIQ_RESTORE_DESTINATION_NOT_EMPTY')
    expect(txCalls).toBe(2)
  })
})
