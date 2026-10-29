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
    if(!['manual_upload','pipeline_import'].includes(row.source_type) || !localManagedPath(row.file_path,'uploads')) problems.push('Only locally managed SCC upload/import records are supported; file ownership is not established.');
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
    if(row.status!=='failed' || row.campaign_id || (row.scheduled_at && (!Number.isFinite(Date.parse(row.scheduled_at)) || Date.parse(row.scheduled_at)>Date.now()))) problems.push('Only terminal failed, unscheduled, non-campaign posts can be removed.');
    const children=db.prepare('SELECT * FROM publishing_destinations WHERE post_id=? ORDER BY id LIMIT 101').all(item.id) as any[];
    retained.push(children);
    if(!children.length || children.length>100) problems.push('A complete bounded set of failed simulator destinations is required.');
    for(const child of children.slice(0,100)) dependencies.push(`Publishing destination ID ${child.id}: ${child.status}; account ID ${child.account_id} remains unchanged.`);
  }
  if(item.type==='publishing_destination') {
    const account=db.prepare('SELECT * FROM accounts WHERE id=?').get(row.account_id) as any;
    const parent=db.prepare('SELECT * FROM publishing_posts WHERE id=?').get(row.post_id) as any;
    const aliases=db.prepare('SELECT platform,identity_key FROM account_identities WHERE account_id=? ORDER BY platform,identity_key LIMIT 1').all(row.account_id);
    const sessions=db.prepare('SELECT 1 FROM oauth_sessions WHERE account_id=? LIMIT 1').all(row.account_id);
    retained.push(account ?? null,parent ?? null,aliases.length,sessions.length);
    let emptyScopes=false;
    try {const scopes=JSON.parse(account?.granted_scopes_json || '[]');emptyScopes=Array.isArray(scopes)&&scopes.length===0;} catch {}
    if(!account || account.is_demo!==1 || account.connector_mode!=='simulator' || account.external_id || account.identity_verified_at || account.access_token || account.refresh_token || account.refresh_expires_at || account.public_url || Number(account.connection_revision || 0)!==0 || !['registered','disconnected'].includes(account.connection_status) || !emptyScopes || aliases.length || sessions.length)
      problems.push('Destination account is not an isolated simulator without external identity.');
    if(!parent || parent.status!=='failed' || parent.campaign_id || (parent.scheduled_at && (!Number.isFinite(Date.parse(parent.scheduled_at)) || Date.parse(parent.scheduled_at)>Date.now()))) problems.push('Parent publication is active, scheduled, or campaign-linked.');
    if(row.status!=='failed' || row.remote_post_id || row.remote_post_url || row.published_at || row.submission_state || row.confirmation_source || row.campaign_id || row.approval_draft_id || row.verification_status==='confirmed')
      problems.push('Destination has an active, external, uncertain, approved, or non-failed publication state.');
    dependencies.push(`Account ID ${row.account_id} remains unchanged; retry count ${row.retry_count} is contained in this destination row.`);
  }
  if((item.type==='video'||item.type==='publishing_post') && problems.length===0) {
    const evidence=readRecordEvidence(db,item);
    retained.push(evidence);
    if(!evidence?.complete) problems.push('Dependency inspection is incomplete; deletion is unavailable.');
  }
  if(item.type==='account') {
    if(row.is_demo!==1 || row.connector_mode!=='simulator' || row.status!=='disconnected' || !['registered','disconnected'].includes(row.connection_status) || row.external_id || row.identity_verified_at || row.access_token || row.refresh_token || row.public_url)
      problems.push('Only disconnected simulator accounts without credentials or external identity can be considered; externally identified accounts are protected.');
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
  const refs=((batchRefs || referencesBatch(db,[item])).get(JSON.stringify([item.type,item.id])) || []).filter(ref=>!selectedRef(ref,selected));
  dependencies.push(...refs.map(r=>'Referenced by '+r));
  if(refs.length) problems.push('Related database records must be preserved.');
  let selectable=problems.length===0, review=false;
  if(summaryOnly && item.type==='publishing_post' && !selectable) {
    const graph=deletionSnapshot(db,[item]);
    selectable=graph.records.every(record=>record.eligible);
    review=selectable;
  }
  if(summaryOnly && !selectable && ['video','branded_video'].includes(item.type) && classification!=='owner_marked_keep') {
    const related:Selection[] = [];
    if(item.type==='video') {
      const variants=db.prepare('SELECT id FROM branded_videos WHERE video_id=? ORDER BY id LIMIT 26').all(item.id) as {id:string}[];
      const posts=db.prepare('SELECT id FROM publishing_posts WHERE video_id=? ORDER BY id LIMIT 26').all(item.id) as {id:string}[];
      related.push(...variants.map(v=>({type:'branded_video',id:v.id})),...posts.map(v=>({type:'publishing_post',id:v.id})));
    } else {
      const posts=db.prepare('SELECT DISTINCT p.id FROM publishing_posts p LEFT JOIN publishing_destinations d ON d.post_id=p.id WHERE p.selected_variant_id=? OR d.selected_variant_id=? OR d.branded_video_path=? ORDER BY p.id LIMIT 26').all(item.id,item.id,row.file_path) as {id:string}[];
      related.push(...posts.map(v=>({type:'publishing_post',id:v.id})));
    }
    if(related.length>0 && related.length<25) {
      const graph=deletionSnapshot(db,[item,...related]);
      selectable=graph.records.every(record=>record.eligible);
      review=selectable;
    }
  }
  return {impact:{...item,name,eligible:problems.length===0,selectable,review,reason:problems.join(' ') || 'No protected relationships found. Owner selection does not establish fixture provenance.',dependencies,rows:problems.length?[]:[{table,id:item.id}]},snapshot:{row,refs,triggers,dependencies,problems,retained,classification}};
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
    for(const row of rows) {
      if(!Object.values(tables).includes(row.table)) throw new Error('STALE_PREVIEW');
      const r=db.prepare(`DELETE FROM ${ident(row.table)} WHERE id=?`).run(row.id);
      if(r.changes!==1) throw new Error('STALE_PREVIEW');
    }
    if((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('FOREIGN_KEY_CHECK_FAILED');
    db.prepare("INSERT INTO activity_events(id,type,title,message,severity,metadata_json) VALUES (?,?,?,?,?,?)")
      .run(auditId,'test_data_deleted','Owner deleted selected records',`Deleted ${rows.length} local database rows`,'warning',JSON.stringify({records:items,rows}));
    return {deleted:items,count:items.length,rowCount:rows.length,auditId};
  }).immediate();
}
