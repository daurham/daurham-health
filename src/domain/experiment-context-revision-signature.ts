import { experimentEvidenceFingerprint } from './experiment-results.js'

/** Revision identities only: no health-profile content, goal targets, or PHI.
 * A stable hash detects link changes, new goal versions and status changes.
 */
export type ContextRevisionSignature={seal:string;linkedGoalCount:0|1}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const epoch=/^\d{1,13}(?:\.\d{1,6})?$/
const isUuid=(x:unknown):x is string=>typeof x==='string'&&uuid.test(x)
const isEpoch=(x:unknown):x is string=>typeof x==='string'&&epoch.test(x)

export async function computeContextRevisionSignature(rows:unknown):Promise<ContextRevisionSignature|null>{
  if(!Array.isArray(rows)||rows.length!==1)return null
  const r=rows[0] as Record<string,unknown>
  if(!r||typeof r!=='object'||Array.isArray(r)||!isEpoch(r.profile_updated_at))return null
  const profileUpdatedAt=r.profile_updated_at
  if(r.goal_id===null){
    if(r.linked_version_id!==null||r.link_created_at!==null||
       r.goal_updated_at!==null||r.goal_status!==null||
       r.goal_archived_at!==null||r.current_version_id!==null)return null
    const seal=await experimentEvidenceFingerprint({
      domain:'piq6-context-revision-baseline-v1',profileUpdatedAt,linkedGoal:null,
    })
    return {seal,linkedGoalCount:0}
  }
  if(!isUuid(r.goal_id)||!isUuid(r.linked_version_id)||!isUuid(r.current_version_id)||
     !isEpoch(r.link_created_at)||!isEpoch(r.goal_updated_at)||
     (r.goal_status!=='active'&&r.goal_status!=='paused'&&r.goal_status!=='completed')||
     (r.goal_archived_at!==null&&!isEpoch(r.goal_archived_at)))return null
  const seal=await experimentEvidenceFingerprint({
    domain:'piq6-context-revision-baseline-v1',profileUpdatedAt,
    linkedGoal:{
      goalId:r.goal_id.toLowerCase(),pinnedVersionId:r.linked_version_id.toLowerCase(),
      currentVersionId:r.current_version_id.toLowerCase(),
      linkedAt:r.link_created_at,goalUpdatedAt:r.goal_updated_at,
      goalStatus:r.goal_status,goalArchivedAt:r.goal_archived_at,
    },
  })
  return {seal,linkedGoalCount:1}
}
