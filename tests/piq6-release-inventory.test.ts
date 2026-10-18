import { describe, expect, it } from 'vitest'
import { BACKUP_TABLES, LATEST_SCHEMA_MIGRATION, backupTable } from '../server/backup/inventory.js'
import { listMigrationFiles } from '../server/migrate.js'
import { assessMigrationHistory } from '../server/migration-history.js'
import { restoreStatements } from '../server/backup/format.js'

const names = BACKUP_TABLES.map((table)=>table.name)
const implementation='experiment_implementations'
const revision='experiment_implementation_revisions'
const snapshot='experiment_result_comparison_snapshots'
const feedback='experiment_outcome_feedback_events'

describe('PIQ-6 release migration and owner-backup inventory', () => {
  it('pins declared backup head to the newest actual migration and preserves safe prefix upgrades',async()=>{
    const files=await listMigrationFiles()
    expect(files.at(-1)).toBe('0060_experiment_outcome_feedback_events.sql')
    expect(LATEST_SCHEMA_MIGRATION).toBe(files.at(-1))
    const applied=files.filter((filename)=>Number(filename.slice(0,4))<=56)
    const assessment=assessMigrationHistory(files,{
      historyTableExists:true,existingOtherTableCount:76,appliedMigrations:applied,
    },LATEST_SCHEMA_MIGRATION)
    expect(assessment.status).toBe('pending')
    expect(assessment.reason).toBe('PENDING')
    expect(assessment.pendingMigrations).toEqual(files.slice(-4))
    expect(assessMigrationHistory(files,{historyTableExists:true,existingOtherTableCount:79,appliedMigrations:files},LATEST_SCHEMA_MIGRATION).status).toBe('current')
  })
  it('exports owner-confirmed implementation and append-only revision provenance',()=>{
    expect(backupTable(implementation)).toMatchObject({
      backupClass:'canonical',portable:true,seeded:false,primaryKey:['experiment_id'],
    })
    expect(backupTable(revision)).toMatchObject({
      backupClass:'canonical',portable:true,seeded:false,primaryKey:['id'],
    })
    expect(backupTable(implementation)?.columns.map(x=>x.name)).toEqual([
      'experiment_id','effective_date','behavior_change','owner_confirmed_at',
    ])
    expect(backupTable(revision)?.columns.map(x=>x.name)).toEqual([
      'id','experiment_id','revision','action','effective_date','behavior_change','reason','recorded_at',
    ])
    expect(names.indexOf('experiments')).toBeLessThan(names.indexOf(implementation))
    expect(names.indexOf(implementation)).toBeLessThan(names.indexOf(revision))
  })
  it('includes the immutable comparison snapshot with all integrity fields',()=>{
    expect(backupTable(snapshot)).toMatchObject({
      backupClass:'canonical',portable:true,seeded:false,primaryKey:['experiment_result_id'],
      references:[{column:'experiment_result_id',table:'experiment_results'}],
    })
    expect(backupTable(snapshot)?.columns.map(x=>x.name)).toEqual([
      'experiment_result_id','snapshot_version','snapshot','snapshot_fingerprint','captured_at',
    ])
    expect(names.indexOf('experiment_results')).toBeLessThan(names.indexOf(snapshot))
  })
  it('retains append-only owner feedback, including withdrawals, in backup records',()=>{
    expect(backupTable(feedback)).toMatchObject({
      backupClass:'canonical',portable:true,seeded:false,primaryKey:['id'],
      references:[{column:'experiment_result_id',table:'experiment_results'}],
    })
    expect(backupTable(feedback)?.columns.map(x=>x.name)).toEqual([
      'id','experiment_result_id','version','action','unlogged_factors','owner_note',
      'comparison_fingerprint','recorded_at',
    ])
    expect(names.indexOf(feedback)).toBeGreaterThan(names.indexOf('experiment_results'))
  })
  it('fresh-DB restore inserts provenance in FK order without trying to update immutable rows',()=>{
    const results=restoreStatements({
      experiment_implementations:[{experiment_id:'00000000-0000-4000-8000-000000000001'}],
      experiment_implementation_revisions:[{id:'00000000-0000-4000-8000-000000000002'}],
      experiment_result_comparison_snapshots:[{
        experiment_result_id:'00000000-0000-4000-8000-000000000003',
        snapshot_version:'1',snapshot:'{"snapshotVersion":1}',
        snapshot_fingerprint:'a'.repeat(64),captured_at:'2026-10-17T00:00:00Z',
      }],
    })
    const index=(name:string)=>results.findIndex((statement)=>statement.text.startsWith('INSERT INTO '+name+' '))
    expect(index(implementation)).toBeGreaterThanOrEqual(0)
    expect(index(implementation)).toBeLessThan(index(revision))
    expect(index(snapshot)).toBeGreaterThan(index('experiment_results')===-1 ? index(revision) : index('experiment_results'))
    expect(results.some((statement)=>/DELETE FROM (experiment_implementations|experiment_implementation_revisions|experiment_result_comparison_snapshots)/.test(statement.text))).toBe(false)
  })
})
