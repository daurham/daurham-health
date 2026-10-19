import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import pg from 'pg'
import { ATOMIC_PANTRY_CAPTURE_SAVE_SQL as SAVE } from '../server/nutrition/recipe-ingredients.js'
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
  beforeEach(async()=>{if(url)await a.query('TRUNCATE nutrition_capture_jobs,source_record_links,nutrition_foods')})
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
