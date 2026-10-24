export const protectedManualDestinationIds=['dest-mvf5hdwf-19hi','dest-mvf5j24q-ub0y','dest-mvf5j24r-rw4x'];
export function assertOwnerQueueSafe(jobs:{id:string;status:string;scheduled_at?:string|null;remote_post_id?:string|null}[],awaitingIds:string[],now=Date.now()){
 if(jobs.some(j=>j.status!=='scheduled'||!j.scheduled_at||!Number.isFinite(Date.parse(j.scheduled_at))||Date.parse(j.scheduled_at)<=now||j.remote_post_id))throw new Error('Owner startup blocked: in-flight, uncertain or overdue jobs require owner reconciliation');
 if(JSON.stringify([...awaitingIds].sort())!==JSON.stringify([...protectedManualDestinationIds].sort()))throw new Error('Protected manual destinations changed; review before restoration');
}

/** Managed sign-in startup preserves ambiguous jobs rather than resetting/replaying them. */
export function publishingStartupHold(jobs:{status:string;scheduled_at?:string|null;remote_post_id?:string|null;submission_state?:string|null}[],now=Date.now()):string|null{
 if(jobs.some(j=>['preparing','branding','uploading'].includes(j.status)))return 'Publishing held: interrupted work requires reconciliation; no jobs were reset.';
 if(jobs.some(j=>j.status==='scheduled'&&(!j.scheduled_at||!Number.isFinite(Date.parse(j.scheduled_at))||Date.parse(j.scheduled_at)<=now||j.remote_post_id||j.submission_state)))return 'Publishing held: due or uncertain scheduled work requires explicit owner review.';
 return null;
}
