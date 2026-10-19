import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import { ATOMIC_PANTRY_CAPTURE_SAVE_SQL as SAVE } from '../server/nutrition/recipe-ingredients.js'
import {
  RECORD_CAPTURE_COMMITTED_SQL, RECORD_CAPTURE_PROVIDER_STATUS_SQL,
  FINISH_CAPTURE_INTERPRETATION_SQL,
} from '../server/nutrition/label-jobs.js'
import { ATOMIC_MEAL_PHOTO_LOG_SQL as LOG } from '../server/nutrition/meal.js'
import { assertPiqPostgresFixtureTarget, assertPiqPostgresFixtureSession } from '../server/piq-postgres-fixture.js'

const url=process.env.PIQ_POSTGRES_URL
if(url) assertPiqPostgresFixtureTarget(url)
const fallback='postgres://unconfigured:unconfigured@127.0.0.1:1/none'
const a=new pg.Client({connectionString:url??fallback})
const b=new pg.Client({connectionString:url??fallback})
let source=''
let mealSource=''
const schema='piq_meal_atomic'
const contents=(s:string)=>readFileSync('migrations/'+s,'utf8')
const params=(job:string,fp:string,name:string)=>[
  job,'meal_photo',randomUUID(),source,fp,fp,'nutrition_food',randomUUID(),
  '{}',name,1,'serving',100,120,10,9,3,2,100,
]
const count=async(table:'nutrition_foods'|'source_record_links'|'nutrition_entries')=>
  Number((await a.query('SELECT count(*)::int AS n FROM '+table)).rows[0].n)
const logged=(id:string,foodId:string|null=null,groupId:string|null=null,name='Fictional logged')=>({
  id,log_date:'2026-10-19',consumed_at:null,timezone:'America/Phoenix',
  meal:'lunch',food_id:foodId,food_name:name,brand:null,
  serving_quantity:1,serving_unit:'serving',grams:null,calories:180,
  protein:15,carbs:12,fat:6,fiber:1,sodium:60,
  source_kind:'photo_ai',notes:'Synthetic CI entry',meal_group_id:groupId,
})
const logArgs=(jobId:string,entries:ReturnType<typeof logged>[],kind:'nutrition_entry'|'nutrition_meal_group'='nutrition_entry')=>[
  jobId,mealSource,randomUUID(), 'nutrition-meal-v1-job:'+jobId,kind,
  kind==='nutrition_entry'?entries[0]!.id:entries[0]!.meal_group_id,
  '{}',JSON.stringify(entries),entries[0]!.food_id,entries[0]!.id,
]
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
      '0015_nutrition_gemini.sql','0027_nutrition_food_ai_source.sql']) await a.query(contents(name))
    const later=contents('0034_nutrition_micros_goal_archive.sql')
    const from=later.indexOf('ALTER TABLE nutrition_foods')
    const to=later.indexOf('ALTER TABLE nutrition_targets',from)
    if(from<0||to<0)throw new Error('Food sodium migration changed')
    await a.query(later.slice(from,to))
    source=String((await a.query("SELECT id FROM data_sources WHERE key='health_app'")).rows[0].id)
    mealSource=String((await a.query("SELECT id FROM data_sources WHERE key='meal_photo'")).rows[0].id)
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

  it('delayed provider status and interpretation cannot mutate a committed Pantry photo',async()=>{
    const id=await init()
    const won=await a.query(SAVE,params(id,'synthetic-immutable','Fictional immutable food'))
    expect(won.rows).toHaveLength(1)
    const previous=(await a.query(
      'SELECT status, food_id, entry_id, candidate_json, interpretation, failure_message, updated_at FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[id],
    )).rows[0]
    // Provider reports a stale completion, a stale failure and a delayed
    // model candidate, all after explicit owner approval.
    for(const status of ['completed','failed'] as const) {
      expect((await b.query(RECORD_CAPTURE_PROVIDER_STATUS_SQL,
        [id,status,'stale provider failure',JSON.stringify({unapproved:'overwrite'})])).rows)
        .toHaveLength(0)
    }
    expect((await b.query(FINISH_CAPTURE_INTERPRETATION_SQL,
      [id,'failed','late failure',JSON.stringify({unapproved:'late'}),JSON.stringify({attempt:99})],
    )).rows).toHaveLength(0)
    const current=(await a.query(
      'SELECT status, food_id, entry_id, candidate_json, interpretation, failure_message, updated_at FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[id],
    )).rows[0]
    expect(current).toEqual(previous)
    expect(await count('nutrition_foods')).toBe(1)
    expect(await count('source_record_links')).toBe(1)
  })

  it('provider updates still work for an unfinished capture and stop after an approved label',async()=>{
    const id=await init()
    const candidate={calories:123,fictional:true}
    await a.query(RECORD_CAPTURE_PROVIDER_STATUS_SQL,
      [id,'completed',null,JSON.stringify(candidate)])
    const updated=(await a.query('SELECT status,candidate_json FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[id])).rows[0]
    expect(updated).toMatchObject({status:'completed',candidate_json:candidate})
    await b.query(FINISH_CAPTURE_INTERPRETATION_SQL,
      [id,'completed',null,null,JSON.stringify({provider:'synthetic',attempt:1})])
    const interpreted=(await a.query('SELECT interpretation FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[id])).rows[0]
    expect(interpreted.interpretation).toMatchObject({provider:'synthetic',attempt:1})
    // A committed label may still have a later explicit Log Food transition,
    // but unsolicited provider analysis must not rewrite its reviewed state.
    await a.query("UPDATE nutrition_capture_jobs SET capture_kind='nutrition_label',status='committed' WHERE home_ai_job_id=$1",[id])
    expect((await b.query(FINISH_CAPTURE_INTERPRETATION_SQL,
      [id,'failed','not accepted',JSON.stringify({late:true}),JSON.stringify({attempt:2})])).rows)
      .toHaveLength(0)
    const final=(await a.query('SELECT status,candidate_json,interpretation FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[id])).rows[0]
    expect(final.status).toBe('committed')
    expect(final.candidate_json).toEqual(candidate)
    expect(final.interpretation).toMatchObject({provider:'synthetic',attempt:1})
  })

  it('atomic estimate log wins cleanly and is idempotent after finalization',async()=>{
    const job=await init()
    const row=logged(randomUUID())
    const initial=await a.query(LOG,logArgs(job,[row]))
    expect(initial.rows).toHaveLength(1)
    expect(await count('nutrition_entries')).toBe(1)
    expect(await count('source_record_links')).toBe(1)
    expect((await a.query('SELECT status,food_id,entry_id FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[job])).rows[0])
      .toMatchObject({status:'committed',food_id:null,entry_id:row.id})
    expect((await b.query(LOG,logArgs(job,[logged(randomUUID())]))).rows).toHaveLength(0)
    expect(await count('nutrition_entries')).toBe(1)
    expect(await count('source_record_links')).toBe(1)
  })

  it('competing first-time Pantry and estimate Log Meal writes exactly one result',async()=>{
    const job=await init()
    const row=logged(randomUUID())
    const settled=await Promise.all([
      a.query(LOG,logArgs(job,[row])),
      b.query(SAVE,params(job,'pantry-vs-log','Fictional race Pantry')),
    ])
    expect(settled.map(x=>x.rows.length).sort()).toEqual([0,1])
    const entryCount=await count('nutrition_entries')
    const foodCount=await count('nutrition_foods')
    expect(entryCount+foodCount).toBe(1)
    expect(await count('source_record_links')).toBe(1)
    const saved=(await a.query('SELECT status,food_id,entry_id FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[job])).rows[0]
    expect(saved.status).toBe('committed')
    if(entryCount===1)expect(saved.entry_id).toBe(row.id)
    else expect(saved.entry_id).toBeNull()
  })

  it('multiple reviewed meal components commit together, or none when Pantry already won',async()=>{
    const f1=randomUUID(),f2=randomUUID()
    await a.query("INSERT INTO nutrition_foods(id,name,catalog_kind,serving_quantity,serving_unit,calories,source_kind) VALUES($1,'Synthetic component one','ingredient',1,'serving',100,'manual'),($2,'Synthetic component two','ingredient',1,'serving',100,'manual')",[f1,f2])
    const job=await init(),group=randomUUID()
    const rows=[logged(randomUUID(),f1,group,'One'),logged(randomUUID(),f2,group,'Two')]
    expect((await a.query(LOG,logArgs(job,rows,'nutrition_meal_group'))).rows).toHaveLength(2)
    expect(await count('nutrition_entries')).toBe(2)
    expect(await count('source_record_links')).toBe(1)
    const committed=(await a.query('SELECT food_id,entry_id FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[job])).rows[0]
    expect(committed).toMatchObject({food_id:f1,entry_id:rows[0]!.id})

    const blockedJob=await init()
    await a.query("UPDATE nutrition_capture_jobs SET status='committed' WHERE home_ai_job_id=$1",[blockedJob])
    const blockedRows=[logged(randomUUID(),f1,randomUUID(),'Bad one'),logged(randomUUID(),f2,randomUUID(),'Bad two')]
    expect((await b.query(LOG,logArgs(blockedJob,blockedRows,'nutrition_meal_group'))).rows).toHaveLength(0)
    expect(await count('nutrition_entries')).toBe(2)
    expect(await count('source_record_links')).toBe(1)
  })

  it('invalid component snapshot rolls back capture, link and all entries',async()=>{
    const job=await init(),group=randomUUID()
    const valid=logged(randomUUID(),null,group,'Valid')
    const invalid={...logged(randomUUID(),null,group,'Invalid'),calories:-4}
    await expect(b.query(LOG,logArgs(job,[valid,invalid],'nutrition_meal_group')))
      .rejects.toMatchObject({code:'23514'})
    expect(await count('nutrition_entries')).toBe(0)
    expect(await count('source_record_links')).toBe(0)
    expect((await a.query('SELECT status FROM nutrition_capture_jobs WHERE home_ai_job_id=$1',[job])).rows[0].status).toBe('completed')
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
