import type Database from 'better-sqlite3';
import path from 'node:path';

type Item = {type:string; id:string};
type Link = Item & {label:string};
const supported = new Set(['account','category','video','branded_video','publishing_post','publishing_draft','assistant_draft','campaign','group_plan','group_prepared_content']);
const names:Record<string,string> = {account:'accounts',category:'categories',video:'videos',branded_video:'branded_videos',publishing_post:'publishing_posts',publishing_draft:'publishing_drafts',assistant_draft:'assistant_drafts',campaign:'publishing_campaigns',group_plan:'facebook_group_plans',group_prepared_content:'group_prepared_content'};

export function readRecordSummary(db:Database.Database,item:Item) {
  if (!supported.has(item.type)) return {source:'unknown',status:'unknown'};
  const row=db.prepare('SELECT * FROM '+names[item.type]+' WHERE id=?').get(item.id) as any;
  if (!row) return {source:'unknown',status:'unknown'};
  let source=item.type==='video' ? row.source_type||'unknown' : item.type==='account' ? row.connector_mode||'unknown' : item.type==='assistant_draft' ? row.source||'unknown' : 'unknown';
  if(item.type==='publishing_post') {
    const modes=db.prepare('SELECT DISTINCT a.connector_mode AS mode FROM publishing_destinations d LEFT JOIN accounts a ON a.id=d.account_id WHERE d.post_id=? LIMIT 4').all(item.id) as {mode:string|null}[];
    source=modes.length===1?(modes[0].mode||'unknown'):modes.length>1?'mixed':'unknown';
  }
  return {
    source,
    status:item.type==='video'||item.type==='branded_video' ? 'library' : item.type==='account' ? row.connection_status||row.status||'unknown' : row.status||'unknown'
  };
}

// Only fixed table names and bound record IDs are used. Never return filesystem paths or secrets.
export function readRecordEvidence(db:Database.Database, item:Item) {
  if (!supported.has(item.type)) return null;
  const row=db.prepare('SELECT * FROM '+names[item.type]+' WHERE id=?').get(item.id) as any;
  if(!row) return null;
  const evidence:string[] = [], relationships:string[] = [], links:Link[] = [];
  let complete=true, thumbnailUrl:string|undefined;
  let source='unknown', status='unknown';
  if(item.type==='account') { source=row.connector_mode||'unknown'; status=row.connection_status||row.status||'unknown'; evidence.push('Connector: '+source, 'Connection status: '+status, 'Simulator mode does not establish test provenance.'); }
  if(item.type==='video') {
    source=row.source_type||'unknown'; status='library';
    const labels:Record<string,string>={manual_upload:'SCC upload',pipeline_import:'Pipeline import',webhook:'Webhook import'};
    evidence.push('Stored source type: '+(labels[source]||source), 'Original filename: '+(row.original_filename||'unavailable'),
      'Pipeline project/job ID: '+(row.pipeline_job_id||'not recorded'),
      'Created: '+(row.created_at||'unavailable'),
      'Duration: '+(typeof row.duration==='number' && row.duration>0 ? row.duration+' seconds' : 'unavailable'),
      'Dimensions: '+(row.width>0&&row.height>0 ? row.width+' × '+row.height : 'unavailable'),
      'Pipeline original: existence not verified by this inventory.');
    const uploads=path.resolve(process.env.SCC_DATA_DIR||path.resolve(process.cwd(),'.data'),'uploads');
    const rel=typeof row.file_path==='string'?path.relative(uploads,path.resolve(row.file_path)):'..';
    const inside=!!rel&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);
    evidence.push(inside?'An SCC uploads path is recorded; file existence and exclusive ownership are not verified here.':'SCC-local file ownership is not established by stored path metadata.');
    if(row.thumbnail_path) {
      const thumbRel=path.relative(uploads,path.resolve(row.thumbnail_path));
      if(thumbRel && !thumbRel.startsWith('..'+path.sep) && thumbRel!=='..' && !path.isAbsolute(thumbRel) && !thumbRel.includes(path.sep))
        thumbnailUrl='/uploads/'+encodeURIComponent(thumbRel);
    }
    const variants=db.prepare('SELECT id,preset_name FROM branded_videos WHERE video_id=? ORDER BY id LIMIT 51').all(item.id) as any[];
    const variantCount=(db.prepare('SELECT COUNT(*) AS n FROM branded_videos WHERE video_id=?').get(item.id) as any).n;
    relationships.push('Saved branded variants: '+variantCount);
    for(const v of variants.slice(0,50)) {relationships.push('Branded variant ID '+v.id+' ('+v.preset_name+')'); links.push({type:'branded_video',id:v.id,label:'Inspect variant '+v.id});}
    const posts=db.prepare('SELECT id,title,status,campaign_id FROM publishing_posts WHERE video_id=? ORDER BY id LIMIT 51').all(item.id) as any[];
    const postCount=(db.prepare('SELECT COUNT(*) AS n FROM publishing_posts WHERE video_id=?').get(item.id) as any).n;
    relationships.push('Publishing posts: '+postCount);
    for(const post of posts.slice(0,50)) { relationships.push('Post ID '+post.id+' — '+post.status+(post.campaign_id?' — campaign ID '+post.campaign_id:'')); links.push({type:'publishing_post',id:post.id,label:'Inspect post '+post.id}); if(post.campaign_id) links.push({type:'campaign',id:post.campaign_id,label:'Inspect campaign '+post.campaign_id}); }
    const destinations=db.prepare(`SELECT d.id,d.post_id,d.status,d.account_id,a.connector_mode FROM publishing_destinations d JOIN publishing_posts p ON p.id=d.post_id LEFT JOIN accounts a ON a.id=d.account_id WHERE p.video_id=? ORDER BY d.id LIMIT 51`).all(item.id) as any[];
    const destCount=(db.prepare('SELECT COUNT(*) AS n FROM publishing_destinations d JOIN publishing_posts p ON p.id=d.post_id WHERE p.video_id=?').get(item.id) as any).n;
    relationships.push('Publishing destinations: '+destCount);
    for(const d of destinations.slice(0,50)) {relationships.push('Destination ID '+d.id+' — '+d.status+' — '+(d.connector_mode||'connector unavailable')+' — account ID '+d.account_id);links.push({type:'account',id:d.account_id,label:'Inspect account '+d.account_id});}
    if(variantCount>50||postCount>50||destCount>50) {complete=false;relationships.push('Additional relationships exist beyond the first 50 per type.');}
    const malformed=db.prepare("SELECT 1 FROM publishing_drafts WHERE NOT json_valid(payload_json) LIMIT 1").get();
    if(malformed) {complete=false; relationships.push('Some draft payloads are invalid; draft references cannot be fully inspected.');}
    else {
      const draftCount=(db.prepare("SELECT COUNT(*) AS n FROM publishing_drafts d WHERE EXISTS (SELECT 1 FROM json_tree(d.payload_json) WHERE type='text' AND value=?)").get(item.id) as any).n;
      const drafts=db.prepare("SELECT d.id,d.status FROM publishing_drafts d WHERE EXISTS (SELECT 1 FROM json_tree(d.payload_json) WHERE type='text' AND value=?) ORDER BY d.id LIMIT 51").all(item.id) as any[];
      relationships.push('Drafts referring to this ID: '+draftCount);
      for(const d of drafts.slice(0,50)) {relationships.push('Draft ID '+d.id+' — '+d.status);links.push({type:'publishing_draft',id:d.id,label:'Inspect draft '+d.id});}
      if(draftCount>50) {complete=false;relationships.push('Additional draft references exist beyond the first 50.');}
    }
  }
  if(item.type==='branded_video') {status='library';evidence.push('Rendered variant; local file is retained when its record is removed.','Master video ID: '+row.video_id); links.push({type:'video',id:row.video_id,label:'Inspect master '+row.video_id});}
  if(item.type==='publishing_post') {
    status=row.status||'unknown'; source='publishing';
    if(row.video_id) {relationships.push('Master video ID '+row.video_id);links.push({type:'video',id:row.video_id,label:'Inspect master '+row.video_id});}
    const destinations=db.prepare('SELECT d.id,d.status,d.account_id,a.connector_mode,a.is_demo FROM publishing_destinations d LEFT JOIN accounts a ON a.id=d.account_id WHERE d.post_id=? ORDER BY d.id LIMIT 51').all(item.id) as any[];
    const count=(db.prepare('SELECT COUNT(*) AS n FROM publishing_destinations WHERE post_id=?').get(item.id) as any).n;
    relationships.push('Publishing destinations: '+count);
    for(const d of destinations.slice(0,50)) {relationships.push('Destination ID '+d.id+' — '+d.status+' — '+(d.connector_mode||'connector unavailable')+' — account ID '+d.account_id);links.push({type:'account',id:d.account_id,label:'Inspect account '+d.account_id});}
    if(count>50) {complete=false;relationships.push('Additional destinations exist beyond the first 50.');}
  }
  if(item.type==='assistant_draft'||item.type==='publishing_draft'||item.type==='campaign'||item.type==='group_plan'||item.type==='group_prepared_content') status=row.status||'unknown';
  if(item.type==='assistant_draft') source=row.source||'unknown';
  if(item.type==='category') status='category';
  return {source,status,evidence,relationships,links,complete,thumbnailUrl};
}
