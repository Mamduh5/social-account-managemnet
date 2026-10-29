import type Database from 'better-sqlite3';
import {createHash} from 'node:crypto';

export type Selection = {type:string; id:string};
export type Impact = Selection & {name:string; eligible:boolean; reason:string; dependencies:string[]; rows:{table:string;id:string}[]};
const tables: Record<string,string> = {category:'categories',account:'accounts',assistant_draft:'assistant_drafts',publishing_draft:'publishing_drafts'};
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

export function inspectDeletion(db:Database.Database, item:Selection, summaryOnly=false, batchRefs?:Map<string,string[]>): {impact:Impact;snapshot:unknown} {
  const table=tables[item.type];
  if(!table) return {impact:{...item,name:item.id,eligible:false,reason:'This record type is protected or not supported for deletion.',dependencies:[],rows:[]},snapshot:null};
  const row=db.prepare(`SELECT * FROM ${ident(table)} WHERE id=?`).get(item.id) as any;
  if(!row) return {impact:{...item,name:item.id,eligible:false,reason:'Record no longer exists.',dependencies:[],rows:[]},snapshot:null};
  const name=String(row.name || (item.type==='assistant_draft'?'Assistant draft ('+row.kind+')':'Publishing draft '+item.id));
  const problems:string[]=[]; const dependencies:string[]=[]; const retained:unknown[]=[];
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
  const refs=(batchRefs || referencesBatch(db,[item])).get(JSON.stringify([item.type,item.id])) || [];
  dependencies.push(...refs.map(r=>'Referenced by '+r));
  if(refs.length) problems.push('Related database records must be preserved.');
  return {impact:{...item,name,eligible:problems.length===0,reason:problems.join(' ') || 'No protected relationships found. Owner selection does not establish fixture provenance.',dependencies,rows:problems.length?[]:[{table,id:item.id}]},snapshot:{row,refs,triggers,dependencies,problems,retained}};
}

export function deletionSnapshot(db:Database.Database, items:Selection[]) {
  const batchRefs=referencesBatch(db,items);
  const inspected=items.map(item=>inspectDeletion(db,item,false,batchRefs));
  return {records:inspected.map(v=>v.impact),fingerprint:digest(inspected.map(v=>v.snapshot))};
}

export function commitDeletion(db:Database.Database, items:Selection[], fingerprint:string, auditId:string) {
  return db.transaction(()=>{
    if(!db.pragma('foreign_keys',{simple:true})) throw new Error('FOREIGN_KEYS_DISABLED');
    const before=deletionSnapshot(db,items);
    if(before.fingerprint!==fingerprint || before.records.some(r=>!r.eligible)) throw new Error('STALE_PREVIEW');
    for(const item of items) {
      const r=db.prepare(`DELETE FROM ${ident(tables[item.type])} WHERE id=?`).run(item.id);
      if(r.changes!==1) throw new Error('STALE_PREVIEW');
    }
    if((db.pragma('foreign_key_check') as unknown[]).length) throw new Error('FOREIGN_KEY_CHECK_FAILED');
    db.prepare("INSERT INTO activity_events(id,type,title,message,severity,metadata_json) VALUES (?,?,?,?,?,?)")
      .run(auditId,'test_data_deleted','Owner deleted selected records',`Deleted ${items.length} selected records`,'warning',JSON.stringify({records:items}));
    return {deleted:items,count:items.length,auditId};
  }).immediate();
}
