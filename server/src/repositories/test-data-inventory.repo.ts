import type Database from 'better-sqlite3';
import {inspectDeletion, referencesBatch} from './test-data-deletion.repo.js';
import {getOwnerClassification} from '../services/test-data-metadata.service.js';
import {readRecordSummary} from './test-data-details.repo.js';

// These are inspection-only projections. They deliberately do not include paths,
// credentials, or a deletion eligibility decision.
const projections: Record<string, string> = {
  account: `SELECT 'account' AS type, a.id, a.name, a.updated_at AS updatedAt,
    CASE WHEN a.is_demo = 0 OR a.connector_mode <> 'simulator' OR a.external_id IS NOT NULL OR a.identity_verified_at IS NOT NULL OR a.connection_status NOT IN ('registered','disconnected') THEN 'protected' ELSE 'unknown' END AS classification,
    CASE WHEN a.is_demo = 0 OR a.connector_mode <> 'simulator' OR a.external_id IS NOT NULL OR a.identity_verified_at IS NOT NULL OR a.connection_status NOT IN ('registered','disconnected') THEN 'Real, connected, or externally identified account and its history are protected.' ELSE 'Simulator flag exists; this alone does not prove fixture provenance. Accounts and their history are read-only.' END AS protection,
    CASE WHEN EXISTS(SELECT 1 FROM publishing_destinations d WHERE d.account_id=a.id) THEN 'Publishing destinations reference this account.' ELSE 'No publishing destination found; other account relationships may exist.' END AS dependency
    FROM accounts a`,
  category: `SELECT 'category' AS type, c.id, c.name, c.created_at AS updatedAt, 'unknown' AS classification,
    'Category provenance is not recorded; categories are read-only.' AS protection,
    CASE WHEN EXISTS(SELECT 1 FROM accounts a WHERE a.category_id=c.id) OR EXISTS(SELECT 1 FROM videos v WHERE v.category_id=c.id) THEN 'Accounts or videos reference this category.' ELSE 'No account or video reference found; other relationships may exist.' END AS dependency
    FROM categories c`,
  video: `SELECT 'video' AS type, v.id, v.title AS name, v.created_at AS updatedAt, 'protected' AS classification,
    'Master media is immutable and protected; source type is not evidence of test provenance.' AS protection,
    CASE WHEN EXISTS(SELECT 1 FROM branded_videos b WHERE b.video_id=v.id) OR EXISTS(SELECT 1 FROM publishing_posts p WHERE p.video_id=v.id) THEN 'Branded variants or publishing posts reference this master.' ELSE 'No branded variant or publishing post found; the master and its file remain protected.' END AS dependency
    FROM videos v`,
  branded_video: `SELECT 'branded_video' AS type, b.id, b.preset_name AS name, b.created_at AS updatedAt, 'protected' AS classification,
    'Branding media and its master are read-only in this manager.' AS protection,
    'Master video ID: ' || b.video_id AS dependency FROM branded_videos b`,
  publishing_post: `SELECT 'publishing_post' AS type, p.id, p.title AS name, p.updated_at AS updatedAt, 'protected' AS classification,
    'Publishing jobs, schedules, and history are protected.' AS protection,
    CASE WHEN EXISTS(SELECT 1 FROM publishing_destinations d WHERE d.post_id=p.id) THEN 'Publishing destinations reference this post.' ELSE 'No publishing destination found; other relationships may exist.' END AS dependency
    FROM publishing_posts p`,
  publishing_draft: `SELECT 'publishing_draft' AS type, d.id, 'Publishing draft ' || d.id AS name, d.updated_at AS updatedAt, 'unknown' AS classification,
    'Draft provenance is not established; drafts and their history are read-only.' AS protection,
    CASE WHEN d.queued_post_id IS NOT NULL THEN 'Queued publishing post ID: ' || d.queued_post_id ELSE 'No queued post recorded; draft payload and audit may contain other relationships.' END AS dependency FROM publishing_drafts d`,
  assistant_draft: `SELECT 'assistant_draft' AS type, d.id, 'Assistant draft (' || d.kind || ')' AS name, d.updated_at AS updatedAt, 'unknown' AS classification,
    'Draft source does not establish test provenance; drafts and history are read-only.' AS protection,
    'Account ID: ' || d.account_id AS dependency FROM assistant_drafts d`,
  campaign: `SELECT 'campaign' AS type, c.id, c.name, c.updated_at AS updatedAt, 'protected' AS classification,
    'Campaigns may relate to schedules and publication history and are read-only.' AS protection,
    'Account ID: ' || c.account_id AS dependency FROM publishing_campaigns c`,
  group_plan: `SELECT 'group_plan' AS type, g.id, g.name, g.updated_at AS updatedAt, 'protected' AS classification,
    'Group plans, external identities, and related history are read-only.' AS protection,
    CASE WHEN g.account_id IS NOT NULL THEN 'Account ID: ' || g.account_id ELSE 'No account recorded on the plan; other relationships may exist.' END AS dependency FROM facebook_group_plans g`,
  group_prepared_content: `SELECT 'group_prepared_content' AS type, g.id, 'Prepared group content (' || g.kind || ')' AS name, g.updated_at AS updatedAt, 'protected' AS classification,
    'Prepared Group content and receipts are read-only.' AS protection,
    'Group plan ID: ' || g.group_id AS dependency FROM group_prepared_content g`,
};

export const inventoryTypes = ['all', ...Object.keys(projections)] as const;
const deletableTypes=new Set(['category','video','branded_video','publishing_post','assistant_draft']);

function inventoryRecord(db:Database.Database, row:any, refs:ReturnType<typeof referencesBatch>) {
  const {dependency,...fields}=row;
  const item={type:row.type,id:row.id};
  const classification=getOwnerClassification(db,item.type,item.id);
  const summary=readRecordSummary(db,item);
  const {impact}=inspectDeletion(db,item,true,refs);
  const eligibility=classification==='owner_marked_keep'||row.type==='account'?'protected':impact.eligible?'safe':impact.review||impact.selectable?'review':deletableTypes.has(row.type)?'protected':'unsupported';
  const relationships=[dependency,...impact.dependencies];
  return {...fields,...summary,classification,eligibility,
    protection:classification==='owner_marked_keep'?'Owner marked this record Keep. Remove the designation before deletion.':impact.reason,
    dependencies:relationships.length>100?[...relationships.slice(0,100),'Additional relationships exist beyond this list.']:relationships,
    eligible:classification!=='owner_marked_keep'&&impact.eligible,
    eligibilityReason:classification==='owner_marked_keep'?'Owner marked this record Keep.':impact.reason};
}

export function readInventoryRecord(db:Database.Database,type:string,id:string) {
  const projection=projections[type];
  if(!projection) return null;
  const row=db.prepare(`SELECT * FROM (${projection}) WHERE id=?`).get(id);
  return row?inventoryRecord(db,row,referencesBatch(db,[{type,id}])):null;
}

export function readTestDataInventory(db: Database.Database, options: {type: string; search: string; limit: number; offset: number; classification?:string; source?:string; status?:string; eligibility?:string}) {
  if (!inventoryTypes.includes(options.type)) throw new Error('Unsupported record type');
  const selected = options.type === 'all' ? Object.values(projections) : [projections[options.type]];
  const pattern = `%${options.search.replace(/[\\%_]/g, '\\$&')}%`;
  const stmt=db.prepare(`SELECT * FROM (${selected.join(' UNION ALL ')}) WHERE name LIKE ? ESCAPE '\\' OR id LIKE ? ESCAPE '\\' ORDER BY type, id LIMIT ? OFFSET ?`);
  const records:any[]=[];
  let position=options.offset, scanned=0, nextOffset:number|null=null, scanIncomplete=false;
  const maxScan=500, batchSize=50;
  while(scanned<maxScan) {
    const rows=stmt.all(pattern,pattern,Math.min(batchSize,maxScan-scanned),position) as any[];
    if(!rows.length) break;
    const refs=referencesBatch(db,rows.map(row=>({type:row.type,id:row.id})));
    let stopped=false;
    for(const row of rows) {
      const record=inventoryRecord(db,row,refs);
      const matches=(!options.classification||options.classification==='all'||record.classification===options.classification)
        &&(!options.source||options.source==='all'||record.source===options.source)
        &&(!options.eligibility||options.eligibility==='all'||record.eligibility===options.eligibility)
        &&(!options.status||record.status.toLowerCase().includes(options.status.toLowerCase()));
      if(matches&&records.length===options.limit) {nextOffset=position;stopped=true;break;}
      position++;scanned++;
      if(matches) records.push(record);
    }
    if(stopped) break;
    if(rows.length<batchSize) break;
  }
  if(nextOffset===null&&scanned>=maxScan) { nextOffset=position; scanIncomplete=true; }
  return {records,hasMore:nextOffset!==null,nextOffset,scanIncomplete,limit:options.limit,offset:options.offset};
}
