import type Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {getOwnerClassification} from '../services/test-data-metadata.service.js';
import {readRecordEvidence} from './test-data-details.repo.js';

export type Selection = {type:string; id:string};
export type Impact = Selection & {name:string; eligible:boolean; selectable?:boolean; review?:boolean; reason:string; dependencies:string[]; rows:{table:string;id:string}[]};
const tables: Record<string,string> = {category:'categories',account:'accounts',assistant_draft:'assistant_drafts',publishing_draft:'publishing_drafts',publishing_post:'publishing_posts',publishing_destination:'publishing_destinations',video:'videos',branded_video:'branded_videos'};
const ident = (s:string) => '"'+s.replace(/"/g,'""')+'"';
const digest = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const terminalPosts = new Set(['failed', 'cancelled', 'completed', 'partial_failure']);
const terminalDestinations = new Set(['failed', 'cancelled', 'published']);

function scheduledProblem(row:any):boolean {
  return !!row.scheduled_at && (!Number.isFinite(Date.parse(row.scheduled_at)) || Date.parse(row.scheduled_at)>Date.now());
}

/** These are local history removals, never account or remote-platform commands. */
function destinationProblems(row:any, account:any):string[] {
  const problems:string[]=[];
  if(!account) problems.push('The destination account is missing; resolve its identity before removing history.');
  if(!terminalDestinations.has(row.status)) problems.push(`Destination is ${row.status}; active jobs and manual handoffs must be resolved before removing local history.`);
  if(row.campaign_id || row.approval_draft_id) problems.push('Campaign or approved-draft lineage must be retained.');
  if(row.submission_state) problems.push('A saved submission intent must be reconciled before removing local history.');
  const externalEvidence=!!(row.remote_post_id || row.remote_post_url || row.published_at || row.confirmation_source || row.verification_status==='confirmed');
  if(row.status!=='published' && externalEvidence) problems.push('The terminal status has remote publication evidence; reconcile the outcome before removing local history.');
  if(row.status==='published') {
    const legacySimulator=account?.is_demo===1 && account?.connector_mode==='simulator' && !externalEvidence;
    const confirmedReceipt=row.verification_status==='confirmed' && ['api','manual','simulator'].includes(row.confirmation_source)
      && !!row.remote_post_url && !!row.published_at && (row.confirmation_source!=='api' || !!row.remote_post_id);
    if(!legacySimulator && !confirmedReceipt) problems.push('Published history needs a confirmed receipt or an explicit simulator identity; uncertain publication evidence is retained.');
  }
  return problems;
}

/** Conservative reference inspection: every declared FK, ID column, and JSON value.
 * Existing assistant-draft audit rows are deliberately retained, never deleted. */
export function referencesBatch(db:Database.Database, items:Selection[]): Map<string,string[]> {
  const supported=items.filter(item=>!!tables[item.type]);
  const ids=[...new Set(supported.map(item=>item.id))];
  const result=new Map(supported.map(item=>[JSON.stringify([item.type,item.id]),[] as string[]]));
  if(!ids.length) return result;
  const slots=ids.map(()=>'?').join(',');
  const matching=(value:string)=>supported.filter(item=>item.id===value);
  const add=(item:Selection,text:string)=>result.get(JSON.stringify([item.type,item.id]))!.push(text);
  const all=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as {name:string}[];
  for(const {name} of all) {
    // Durable command receipts are tombstones, not live graph dependencies. Keep them unchanged.
    if(name==='publishing_commands') continue;
    const columns=db.pragma(`table_info(${ident(name)})`) as {name:string;type:string}[];
    const foreign=db.pragma(`foreign_key_list(${ident(name)})`) as {table:string;from:string}[];
    const names=new Set(foreign.filter(f=>Object.values(tables).includes(f.table)).map(f=>f.from));
    for(const col of columns) if (col.name.endsWith('_id') || col.name==='entity_id') names.add(col.name);
    const hasId=columns.some(c=>c.name==='id'), source=hasId?'CAST(t.id AS TEXT)':'NULL';
    for(const c of names) {
      const rows=db.prepare(`SELECT t.rowid AS rid, ${source} AS sourceId, CAST(t.${ident(c)} AS TEXT) AS value FROM ${ident(name)} t WHERE t.${ident(c)} IN (${slots}) ORDER BY t.rowid LIMIT 5051`).all(...ids) as {rid:number;sourceId:string|null;value:string}[];
      const counts=new Map<string,number>();
      for(const row of rows.slice(0,5050)) for(const item of matching(row.value)) {
        if(name===tables[item.type] && row.sourceId===item.id) continue;
        if(item.type==='assistant_draft' && name==='content_workspace_audit' && c==='entity_id') continue;
        const key=JSON.stringify([item.type,item.id]),n=counts.get(key)||0;counts.set(key,n+1);
        if(n<100) add(item,`${name} ${row.sourceId===null?'rowid '+row.rid:'ID '+row.sourceId} (${c})`);
        else if(n===100) add(item,`${name}.${c}: additional references exist`);
      }
      if(rows.length>5050) for(const item of supported) add(item,`${name}.${c}: reference limit exceeded`);
    }
    for(const col of columns.filter(c=>c.name.endsWith('_json'))) {
      const c=ident(col.name), t=ident(name);
      const malformed=db.prepare(`SELECT 1 FROM ${t} WHERE ${c} IS NOT NULL AND ${c}<>'' AND NOT json_valid(${c}) LIMIT 1`).get();
      if(malformed) { for(const item of supported) add(item,`${name}.${col.name}: malformed JSON prevents safe reference review`); continue; }
      const rows=db.prepare(`SELECT DISTINCT t.rowid AS rid, ${source} AS sourceId, j.value AS value FROM ${t} t JOIN json_tree(CASE WHEN t.${c} IS NULL OR t.${c}='' THEN 'null' ELSE t.${c} END) j WHERE j.type='text' AND j.value IN (${slots}) ORDER BY t.rowid LIMIT 5051`).all(...ids) as {rid:number;sourceId:string|null;value:string}[];
      const counts=new Map<string,number>();
      for(const row of rows.slice(0,5050)) for(const item of matching(row.value)) {
        if(name===tables[item.type] && row.sourceId===item.id) continue;
        const key=JSON.stringify([item.type,item.id]),n=counts.get(key)||0;counts.set(key,n+1);
        if(n<100) add(item,`${name} ${row.sourceId===null?'rowid '+row.rid:'ID '+row.sourceId} (${col.name})`);
        else if(n===100) add(item,`${name}.${col.name}: additional references exist`);
      }
      if(rows.length>5050) for(const item of supported) add(item,`${name}.${col.name}: reference limit exceeded`);
    }
  }
  return result;
}

function localManagedPath(filePath:unknown, directory:'uploads'|'renders'):boolean {
  if(typeof filePath!=='string' || !filePath.trim()) return false;
  const root=path.resolve(process.env.SCC_DATA_DIR || path.resolve(process.cwd(),'.data'),directory);
  const relative=path.relative(root,path.resolve(filePath));
  return !!relative && relative!=='..' && !relative.startsWith('..'+path.sep) && !path.isAbsolute(relative);
}

function selectedRef(ref:string, selected:Selection[]):boolean {
  return selected.some(source=>tables[source.type] && ref.startsWith(`${tables[source.type]} ID ${source.id} (`));
}

export function inspectDeletion(db:Database.Database, item:Selection, summaryOnly=false, batchRefs?:Map<string,string[]>, selected:Selection[]=[]): {impact:Impact;snapshot:unknown} {
  const table=tables[item.type];
  if(!table) return {impact:{...item,name:item.id,eligible:false,reason:'This record type is protected or not supported for deletion.',dependencies:[],rows:[]},snapshot:null};
  const row=db.prepare(`SELECT * FROM ${ident(table)} WHERE id=?`).get(item.id) as any;
  if(!row) return {impact:{...item,name:item.id,eligible:false,reason:'Record no longer exists.',dependencies:[],rows:[]},snapshot:null};
  const name=String(row.name || row.title || row.preset_name || (item.type==='assistant_draft'?'Assistant draft ('+row.kind+')':item.type==='publishing_destination'?'Destination '+item.id:'Publishing draft '+item.id));
  const problems:string[]=[]; const dependencies:string[]=[]; const retained:unknown[]=[];
  const classification=getOwnerClassification(db,item.type,item.id);
  if(classification==='owner_marked_keep') problems.push('Owner marked this record Keep; remove that designation first.');
  if(item.type==='video') {
    if(!['manual_upload','pipeline_import','webhook'].includes(row.source_type) || !localManagedPath(row.file_path,'uploads')) problems.push('Only locally managed SCC upload/import records are supported; file ownership is not established.');
    dependencies.push('Only the SCC library row will be removed. The master file and upstream Pipeline data remain unchanged.');
  }
  if(item.type==='branded_video') {
    if(!localManagedPath(row.file_path,'renders')) problems.push('Only SCC-managed render records are supported.');
    dependencies.push(`Master video ID ${row.video_id}; rendered file remains unchanged.`);
    const master=db.prepare('SELECT * FROM videos WHERE id=?').get(row.video_id);
    retained.push(master ?? null);
    if(!master) problems.push('The master video is missing.');
    const paths=db.prepare('SELECT id FROM publishing_destinations WHERE branded_video_path=? ORDER BY id LIMIT 101').all(row.file_path) as {id:string}[];
    if(paths.length>100) problems.push('Too many file-path references to review.');
    for(const ref of paths.slice(0,100)) if(!selected.some(v=>v.type==='publishing_destination'&&v.id===ref.id)) {
      dependencies.push(`Publishing destination ID ${ref.id} references the rendered file.`);
      problems.push('A publishing destination references this render.');
    }
    retained.push(paths);
  }
  if(item.type==='publishing_post') {
    if(!terminalPosts.has(row.status)) problems.push(`Publication is ${row.status}; only terminal local history can be removed.`);
    if(row.campaign_id) problems.push('Campaign-linked publication history must be retained.');
    if(scheduledProblem(row)) problems.push('A future or invalid schedule must be resolved before removing local history.');
    const children=db.prepare('SELECT * FROM publishing_destinations WHERE post_id=? ORDER BY id LIMIT 101').all(item.id) as any[];
    retained.push(children);
    if(children.length>100) problems.push('More than 100 destinations require a separate bounded history review.');
    for(const child of children.slice(0,100)) dependencies.push(`Publishing destination ID ${child.id}: ${child.status}; account ID ${child.account_id} remains unchanged.`);
  }
  if(item.type==='publishing_destination') {
    const account=db.prepare('SELECT * FROM accounts WHERE id=?').get(row.account_id) as any;
    const parent=db.prepare('SELECT * FROM publishing_posts WHERE id=?').get(row.post_id) as any;
    retained.push(account ?? null,parent ?? null);
    if(!parent || !terminalPosts.has(parent.status) || parent.campaign_id || scheduledProblem(parent)) problems.push('Parent publication is active, scheduled, or campaign-linked.');
    problems.push(...destinationProblems(row,account));
    dependencies.push(`Account ID ${row.account_id}, its credentials, identities and connections remain unchanged. Retry count ${row.retry_count} and publication receipts are retained in the deletion audit.`);
    if(row.remote_post_id || row.remote_post_url) dependencies.push('The confirmed remote post remains on its social platform. Its saved receipt is retained in the local deletion audit.');
  }
  if((item.type==='video'||item.type==='publishing_post') && problems.length===0) {
    const evidence=readRecordEvidence(db,item);
    retained.push(evidence);
    if(!evidence?.complete) problems.push('Dependency inspection is incomplete; deletion is unavailable.');
  }
  if(item.type==='account') {
    problems.push('Social accounts, credentials and connections are preserved. Use Accounts to archive an account; this manager never deletes accounts.');
    if(row.category_id) {dependencies.push(`Category ID ${row.category_id} remains unchanged.`); retained.push(db.prepare('SELECT * FROM categories WHERE id=?').get(row.category_id) ?? null);}
  }
  if(item.type==='publishing_draft') {
    let payload:any; try { payload=JSON.parse(row.payload_json); } catch { problems.push('Draft payload is invalid.'); }
    if(row.status!=='draft' || row.approved_revision!=null || row.queued_post_id || row.campaign_id || payload?.scheduledAt) problems.push('Approved, queued, campaign, or scheduled drafts are protected.');
    problems.push('Publishing drafts retain audit and publication lineage and cannot be deleted here.');
    if(payload) dependencies.push('Draft payload references and media remain unchanged; full payload relationship inspection is unavailable.');
  }
  if(item.type==='assistant_draft') {
    if(row.source!=='manual' || row.status!=='draft' || row.approved_revision!=null || /reply/i.test(row.kind)) problems.push('Only unapproved manual assistant drafts without reply activity can be considered; generated drafts preserve quota accounting.');
    dependencies.push(`Account ID ${row.account_id} remains unchanged.`);
    retained.push(db.prepare('SELECT * FROM accounts WHERE id=?').get(row.account_id) ?? null);
    const audits=db.prepare('SELECT * FROM content_workspace_audit WHERE entity_id=? ORDER BY id LIMIT 101').all(item.id) as {id:string;action:string}[];
    retained.push(audits);
    for(const audit of audits.slice(0,100)) dependencies.push(`Audit ${audit.id} (${audit.action}) remains unchanged.`);
    if(audits.length>100) { dependencies.push('Additional audit rows exist.'); problems.push('Too many audit rows to safely preview.'); }
    if(audits.some(a=>!['draft_created','draft_edited_approval_invalidated','draft_rejected'].includes(a.action))) problems.push('Draft has approval, export, or other protected history.');
  }
  if(summaryOnly && problems.length) {
    const known = batchRefs?.get(JSON.stringify([item.type,item.id]));
    const details = known ? known.map(ref=>'Referenced by '+ref) : ['Other relationships were not inspected for this protected record.'];
    return {impact:{...item,name,eligible:false,reason:problems.join(' '),dependencies:[...dependencies,...details],rows:[]},snapshot:{row,dependencies,problems,retained}};
  }
  const triggers=db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name=?").all(table) as {name:string}[];
  if(triggers.length) problems.push('Table triggers require separate review.');
  const allRefs=(batchRefs || referencesBatch(db,[item])).get(JSON.stringify([item.type,item.id])) || [];
  // Activity metadata is a retained audit reference, not a live foreign key. A
  // sanitized removal receipt below preserves the identity of removed resources.
  const auditRefs=allRefs.filter(ref=>['video','branded_video','publishing_post','publishing_destination'].includes(item.type)
    && /^activity_events ID .+ \(metadata_json\)$/.test(ref));
  dependencies.push(...auditRefs.map(ref=>'Audit history retained: '+ref));
  const refs=allRefs.filter(ref=>!auditRefs.includes(ref) && !selectedRef(ref,selected));
  dependencies.push(...refs.map(r=>'Referenced by '+r));
  if(refs.length) problems.push('Select the listed removable dependencies together. Unselected drafts, campaign, engagement and accounting references must be preserved.');
  let selectable=problems.length===0, review=false;
  if(summaryOnly && item.type==='publishing_post' && !selectable) {
    const graph=deletionSnapshot(db,[item]);
    selectable=graph.records.every(record=>record.eligible);
    review=selectable;
  }
  if(summaryOnly && !selectable && ['video','branded_video'].includes(item.type) && classification!=='owner_marked_keep') {
    const related=cleanupDependencies(db,[item]);
    if(related.length>0 && related.length<25) {
      const graph=deletionSnapshot(db,[item,...related]);
      selectable=graph.records.every(record=>record.eligible);
      review=selectable;
    }
  }
  return {impact:{...item,name,eligible:problems.length===0,selectable,review,reason:problems.join(' ') || 'Only the reviewed SCC records will be removed. Owner labels do not establish fixture provenance.',dependencies,rows:problems.length?[]:[{table,id:item.id}]},snapshot:{row,refs,auditRefs,triggers,dependencies,problems,retained,classification}};
}

/** Bounded suggestions only. Nothing is implicitly selected or deleted. */
export function cleanupDependencies(db:Database.Database,items:Selection[]):Selection[] {
  const selected=new Set(items.map(item=>JSON.stringify([item.type,item.id])));
  const related=new Map<string,Selection>();
  const add=(item:Selection)=>{const key=JSON.stringify([item.type,item.id]);if(!selected.has(key)) related.set(key,item);};
  for(const item of items) {
    if(item.type==='video') {
      for(const row of db.prepare('SELECT id FROM branded_videos WHERE video_id=? ORDER BY id LIMIT 26').all(item.id) as {id:string}[]) add({type:'branded_video',id:row.id});
      for(const row of db.prepare('SELECT id FROM publishing_posts WHERE video_id=? ORDER BY id LIMIT 26').all(item.id) as {id:string}[]) add({type:'publishing_post',id:row.id});
    }
  }
  for(const item of [...items,...related.values()]) if(item.type==='branded_video') {
    const variant=db.prepare('SELECT file_path FROM branded_videos WHERE id=?').get(item.id) as {file_path:string}|undefined;
    if(!variant) continue;
    for(const row of db.prepare('SELECT DISTINCT p.id FROM publishing_posts p LEFT JOIN publishing_destinations d ON d.post_id=p.id WHERE p.selected_variant_id=? OR d.selected_variant_id=? OR d.branded_video_path=? ORDER BY p.id LIMIT 26').all(item.id,item.id,variant.file_path) as {id:string}[]) add({type:'publishing_post',id:row.id});
  }
  return [...related.values()];
}

export function suggestedCleanupDependencies(db:Database.Database,items:Selection[]):(Selection & {name:string})[] {
  const related=cleanupDependencies(db,items);
  if(!related.length || items.length+related.length>25) return [];
  const snapshot=deletionSnapshot(db,[...items,...related]);
  if(snapshot.records.some(record=>!record.eligible)) return [];
  return related.map(item=>({...item,name:snapshot.records.find(record=>record.type===item.type && record.id===item.id)!.name}));
}

export function deletionSnapshot(db:Database.Database, items:Selection[]) {
  const children=new Map<string,Selection[]>();
  for(const item of items) if(item.type==='publishing_post') {
    const rows=db.prepare('SELECT id FROM publishing_destinations WHERE post_id=? ORDER BY id LIMIT 101').all(item.id) as {id:string}[];
    children.set(item.id,rows.map(row=>({type:'publishing_destination',id:row.id})));
  }
  const selected=[...items,...[...children.values()].flat()];
  const batchRefs=referencesBatch(db,selected);
  const inspected=items.map(item=>{
    if(item.type==='publishing_destination') return {impact:{...item,name:item.id,eligible:false,reason:'Select its parent post for a complete review.',dependencies:[],rows:[]},snapshot:null};
    const current=inspectDeletion(db,item,false,batchRefs,selected);
    const sub=(children.get(item.id) || []).map(child=>inspectDeletion(db,child,false,batchRefs,selected));
    if(!sub.length) return current;
    const blocked=sub.filter(result=>!result.impact.eligible);
    const dependencies=[...current.impact.dependencies,...sub.flatMap(result=>[
      `Destination ${result.impact.id}: ${result.impact.eligible?'eligible':result.impact.reason}`,
      ...result.impact.dependencies
    ])];
    const eligible=current.impact.eligible && !blocked.length;
    const rows=eligible?[...current.impact.rows,...sub.flatMap(result=>result.impact.rows)]:[];
    return {impact:{...current.impact,eligible,reason:eligible?current.impact.reason:(current.impact.eligible?'A destination is protected.':current.impact.reason),dependencies,rows},snapshot:{parent:current.snapshot,children:sub.map(result=>result.snapshot)}};
  });
  return {records:inspected.map(v=>v.impact),fingerprint:digest(inspected.map(v=>v.snapshot))};
}

export function commitDeletion(db:Database.Database, items:Selection[], fingerprint:string, auditId:string) {
  return db.transaction(()=>{
    if(!db.pragma('foreign_keys',{simple:true})) throw new Error('FOREIGN_KEYS_DISABLED');
    const before=deletionSnapshot(db,items);
    if(before.fingerprint!==fingerprint || before.records.some(r=>!r.eligible)) throw new Error('STALE_PREVIEW');
    const order:Record<string,number>={publishing_destinations:0,publishing_posts:1,branded_videos:2,videos:3};
    const rows=before.records.flatMap(record=>record.rows);
    if(new Set(rows.map(row=>JSON.stringify([row.table,row.id]))).size!==rows.length) throw new Error('STALE_PREVIEW');
    rows.sort((a,b)=>(order[a.table]??4)-(order[b.table]??4));
    const preservedHistory=rows.filter(row=>row.table==='publishing_destinations').map(row=>db.prepare(`SELECT id,post_id,account_id,status,retry_count,remote_post_id,remote_post_url,published_at,verification_status,confirmation_source,created_at,updated_at FROM publishing_destinations WHERE id=?`).get(row.id));
    const preservedPosts=rows.filter(row=>row.table==='publishing_posts').map(row=>db.prepare('SELECT id,video_id,status,scheduled_at,timezone,selected_variant_id,created_at,updated_at FROM publishing_posts WHERE id=?').get(row.id));
    const preservedMedia=rows.filter(row=>row.table==='videos').map(row=>db.prepare('SELECT id,source_type,original_filename,pipeline_job_id,created_at FROM videos WHERE id=?').get(row.id));
    for(const row of rows) {
      if(!Object.values(tables).includes(row.table)) throw new Error('STALE_PREVIEW');
      const r=db.prepare(`DELETE FROM ${ident(row.table)} WHERE id=?`).run(row.id);
      if(r.changes!==1) throw new Error('STALE_PREVIEW');
    }
    if((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('FOREIGN_KEY_CHECK_FAILED');
    db.prepare("INSERT INTO activity_events(id,type,title,message,severity,metadata_json) VALUES (?,?,?,?,?,?)")
      .run(auditId,'test_data_deleted','Owner deleted selected SCC records',`Deleted ${rows.length} local database rows; accounts, media files and external content retained`,'warning',JSON.stringify({version:2,records:items,rows,preservedHistory,preservedPosts,preservedMedia}));
    return {deleted:items,count:items.length,rowCount:rows.length,auditId};
  }).immediate();
}
