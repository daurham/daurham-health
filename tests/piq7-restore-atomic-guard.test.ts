import {describe, expect, it, vi} from 'vitest'
import {buildBackupArchive} from '../server/backup/format.js'
import {BACKUP_TABLES,LATEST_SCHEMA_MIGRATION} from '../server/backup/inventory.js'
import {applyRestore,restoreDestinationGuardStatements} from '../server/backup/database.js'
import type {Sql} from '../server/db.js'

describe('PIQ-7 restore application never silently succeeds on blocked or changed destination',()=>{
  it('locks ALL backed-up tables, limits lock wait and checks destination/schema in transaction',()=>{
    const guard=restoreDestinationGuardStatements()
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
