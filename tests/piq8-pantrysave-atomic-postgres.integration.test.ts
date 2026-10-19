import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import { ATOMIC_PANTRY_CAPTURE_SAVE_SQL as SAVE } from '../server/nutrition/recipe-ingredients.js'
import { RECORD_CAPTURE_COMMITTED_SQL } from '../server/nutrition/label-jobs.js'
import { assertPiqPostgresFixtureTarget, assertPiqPostgresFixtureSession } from '../server/piq-postgres-fixture.js'

const url=process.env.PIQ_POSTGRES_URL
if(url) assertPiqPostgresFixtureTarget(url)
const fallback='postgres://unconfigured:unconfigured@127.0.0.1:1/none'
const a=new pg.Client({connectionString:url??fallback})
const b=new pg.Client({connectionString:url??fallback})
let source=''
const schema='piq_meal_atomic'
const contents=(s:string)=>readFileSync('migrations/'+s,'utf8')
const params=(job:string,fp:string,name:string)=>[
  job,'meal_photo',randomUUID(),source,fp,fp,'nutrition_food',randomUUID(),
  '{}',name,1,'serving',100,120,10,9,3,2,100,
]
const count=async(table:'nutrition_foods'|'source_record_links')=>
  Number((await a.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n)
const init=async()=>{const id=randomUUID();await a.query(
  "INSERT INTO nutrition_capture_jobs(home_ai_job_id,capture_kind,status) VALUES($1,'meal_photo','completed')",[id]);return id}

describe.skipIf(!url)('PIQ-8 atomic Pantry first-save on isolated real PostgreSQL',()=>{
  beforeAll(async()=>{
    if(!url)return
    await a.connect();await b.connect()
    await assertPiqPostgresFixtureSession(a)
    await assertPiqPostgresFixtureSession(b)
    await a.query('CREATE SCHEMA '+schema)
    await a.query('SET search_path TO '+schema+',public')
    await b.query('SET search_path TO '+schema+',public')
    for(const name of ['0001_health_foundation.sql','0008_nutrition.sql',
      '0010_nutrition_capture_jobs.sql','0011_nutrition_meal_photo.sql',
      '0027_nutrition_food_ai_source.sql']) await a.query(contents(name))
    const later=contents('0034_nutrition_micros_goal_archive.sql')
    const from=later.indexOf('ALTER TABLE nutrition_foods')
    const to=later.indexOf('ALTER TABLE nutrition_entries',from)
    if(from<0||to<0)throw new Error('Food sodium migration changed')
    await a.query(later.slice(from,to))
    source=String((await a.query("SELECT id FROM data_sources WHERE key='health_app'")).rows[0].id)
  },35000)
  beforeEach(async()=>{if(url)await a.query('TRUNCATE nutrition_capture_jobs,source_record_links,nutrition_entries,nutrition_foods')})
  afterAll(async()=>{if(!url)return;await b.end();await a.query('DROP SCHEMA '+schema+' CASCADE');await a.end()})

  it('two concurrent different approvals commit one capture and one food/link',async()=>{
    const id=await init()
    const responses=await Promise.all([
      a.query(SAVE,params(id,'synthetic-a','Synthetic one')),
      b.query(SAVE,params(id,'synthetic-b','Synthetic two')),
    ])
    expect(responses.map(x=>x.rows.length).sort()).toEqual([0,1])
    expect(await count('nutrition_foods')).toBe(1)
    expect(await count('source_record_links')).toBe(1)
    const job=(await a.query('SELECT status,food_id,entry_id FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[id])).rows[0]
    expect(job.status).toBe('committed')
    expect(job.entry_id).toBeNull()
    expect(job.food_id).toBe(responses.find(x=>x.rows.length>0)!.rows[0].id)
  })

  it('a completed capture finalized by Log Meal before save leaves no orphan',async()=>{
    const id=await init()
    await a.query("UPDATE nutrition_capture_jobs SET status='committed' WHERE home_ai_job_id=$1",[id])
    expect((await b.query(SAVE,params(id,'synthetic-c','Synthetic blocked'))).rows).toHaveLength(0)
    expect(await count('nutrition_foods')).toBe(0)
    expect(await count('source_record_links')).toBe(0)
  })

  it('delayed Log Meal cannot overwrite a committed Pantry-only capture',async()=>{
    const id=await init()
    const pantryId=randomUUID()
    const delayedEntryId=randomUUID()
    // Foods referenced by capture must exist; no Nutrition entry is required
    // for a Pantry-only commitment.
    await a.query("INSERT INTO nutrition_foods(id,name,catalog_kind,serving_quantity,serving_unit,calories,source_kind) VALUES($1,'Fictional Pantry','ingredient',1,'serving',100,'description_ai')",[pantryId])
    await a.query("UPDATE nutrition_capture_jobs SET status='committed',food_id=$2,entry_id=NULL WHERE home_ai_job_id=$1",[id,pantryId])
    const rejected=await b.query(RECORD_CAPTURE_COMMITTED_SQL,[id,pantryId,delayedEntryId])
    expect(rejected.rows).toHaveLength(0)
    const stored=(await a.query('SELECT status,food_id,entry_id FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[id])).rows[0]
    expect(stored).toMatchObject({status:'committed',food_id:pantryId,entry_id:null})
    // Identical lost-response retry is harmless and leaves the association.
    expect((await b.query(RECORD_CAPTURE_COMMITTED_SQL,[id,pantryId,null])).rows).toHaveLength(1)
    expect((await a.query('SELECT entry_id FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[id])).rows[0].entry_id).toBeNull()
  })

  it('commits an estimate with an entry ID but no nutrition food FK',async()=>{
    const id=await init()
    const entryId=randomUUID()
    await a.query("INSERT INTO nutrition_entries(id,log_date,timezone,food_name,serving_quantity,serving_unit,calories,source_kind) VALUES($1,'2026-10-01','America/Phoenix','Fictional estimate',1,'meal',200,'photo_ai')",[entryId])
    expect((await b.query(RECORD_CAPTURE_COMMITTED_SQL,[id,null,entryId])).rows).toHaveLength(1)
    const saved=(await a.query('SELECT status,food_id,entry_id FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[id])).rows[0]
    expect(saved).toMatchObject({status:'committed',food_id:null,entry_id:entryId})
    // Original estimated-entry response may be retried safely.
    expect((await b.query(RECORD_CAPTURE_COMMITTED_SQL,[id,null,entryId])).rows).toHaveLength(1)
    // A subsequent changed estimate cannot replace this committed entry.
    expect((await b.query(RECORD_CAPTURE_COMMITTED_SQL,[id,null,randomUUID()])).rows).toHaveLength(0)
  })

  it('a label Pantry save can still transition to logged, unlike Meal Photo',async()=>{
    const id=randomUUID()
    const foodId=randomUUID()
    const entryId=randomUUID()
    await a.query("INSERT INTO nutrition_foods(id,name,catalog_kind,serving_quantity,serving_unit,calories,source_kind) VALUES($1,'Fictional label','packaged',1,'serving',100,'photo_ai')",[foodId])
    await a.query("INSERT INTO nutrition_capture_jobs(home_ai_job_id,capture_kind,status,food_id) VALUES($1,'nutrition_label','committed',$2)",[id,foodId])
    await a.query("INSERT INTO nutrition_entries(id,log_date,timezone,food_id,food_name,serving_quantity,serving_unit,calories,source_kind) VALUES($1,'2026-10-01','America/Phoenix',$2,'Fictional label',1,'serving',100,'photo_ai')",[entryId,foodId])
    expect((await b.query(RECORD_CAPTURE_COMMITTED_SQL,[id,foodId,entryId])).rows).toHaveLength(1)
    expect((await a.query('SELECT entry_id FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[id])).rows[0].entry_id).toBe(entryId)
  })

  it('a food-name uniqueness conflict rolls back the fingerprint claim',async()=>{
    const id=await init()
    await a.query("INSERT INTO nutrition_foods(name,catalog_kind,serving_quantity,serving_unit,calories,source_kind) VALUES ('Synthetic existing','ingredient',1,'serving',120,'description_ai')")
    await expect(b.query(SAVE,params(id,'unique-fp','Synthetic existing')))
      .rejects.toMatchObject({code:'23505'})
    expect(await count('nutrition_foods')).toBe(1)
    expect(await count('source_record_links')).toBe(0)
    expect((await a.query('SELECT status FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[id])).rows[0].status).toBe('completed')
  })
})
