/** Destructive integration must never connect to a remote or owner DB. */
const blocked='PIQ PostgreSQL requires the dedicated local disposable fixture; refusing to run'

export function assertPiqPostgresFixtureTarget(raw:string):void{
  try{
    const u=new URL(raw)
    if(!['postgres:','postgresql:'].includes(u.protocol) ||
       !['localhost','127.0.0.1'].includes(u.hostname) ||
       u.port!=='5432' || u.pathname!=='/piq_fixture' ||
       decodeURIComponent(u.username)!=='piq' || !u.password ||
       u.search || u.hash) throw new Error(blocked)
  }catch{throw new Error(blocked)}
}

/** A second server-reported identity check before ANY data/schema mutations. */
export async function assertPiqPostgresFixtureSession(
  client:{query:(sql:string)=>Promise<{rows:Array<Record<string,unknown>>}>},
):Promise<void>{
  let rows:Array<Record<string,unknown>>
  try{
    rows=(await client.query('SELECT current_database() AS db, current_user AS role')).rows
  }catch{throw new Error(blocked)}
  if(rows.length!==1 || rows[0]?.db!=='piq_fixture'||rows[0]?.role!=='piq')
    throw new Error(blocked)
}
