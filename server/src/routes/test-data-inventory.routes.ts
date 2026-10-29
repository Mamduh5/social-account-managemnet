import {Router, type RequestHandler} from 'express';
import {randomUUID} from 'node:crypto';
import {db} from '../db/database.js';
import {inventoryTypes, readTestDataInventory, readInventoryRecord} from '../repositories/test-data-inventory.repo.js';
import {readRecordEvidence} from '../repositories/test-data-details.repo.js';
import {commitDeletion, deletionSnapshot, suggestedCleanupDependencies, type Selection} from '../repositories/test-data-deletion.repo.js';
import {eventService} from '../services/events.service.js';

export const testDataInventoryRouter = Router();
const previews=new Map<string,{items:Selection[];fingerprint:string;expires:number;auditId:string}>();
// This route requires an exact same-origin browser request, including scheme and port.
// The managed loopback HTTPS proxy preserves Host and overwrites forwarded proto/host.
const sameOrigin:RequestHandler=(req,res,next)=>{
  const origin=req.headers.origin, host=req.headers.host;
  const forwarded=req.headers['x-forwarded-proto']==='https' && req.headers['x-forwarded-host']===host;
  const protocol=forwarded?'https':req.protocol;
  if((origin && origin!==`${protocol}://${host}`) || (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']))) return res.status(403).json({error:'Same-origin request required'});
  next();
};

testDataInventoryRouter.post('/preview',sameOrigin,(req,res)=>{
  const raw=req.body?.records;
  if(!Array.isArray(raw) || raw.length<1 || raw.length>25 || raw.some((r:any)=>!r || typeof r.type!=='string' || !inventoryTypes.includes(r.type) || r.type==='all' || typeof r.id!=='string' || r.id.length<1 || r.id.length>200 || r.id.trim()!==r.id) || new Set(raw.map((r:any)=>JSON.stringify([r.type,r.id]))).size!==raw.length) return res.status(400).json({error:'Select 1 to 25 distinct valid records'});
  const items:Selection[]=raw.map((r:any)=>({type:r.type,id:r.id}));
  try {
    const snapshot=deletionSnapshot(db,items), previewId=randomUUID();
    for(const [key,value] of previews) if(value.expires<Date.now()) previews.delete(key);
    if(previews.size>=200) previews.delete(previews.keys().next().value!);
    const auditId='test-data-deletion-'+randomUUID(),canDelete=snapshot.records.every(r=>r.eligible);
    previews.set(previewId,{items,fingerprint:snapshot.fingerprint,expires:Date.now()+5*60*1000,auditId});
    return res.json({previewId,records:snapshot.records,suggestedRecords:canDelete?[]:suggestedCleanupDependencies(db,items),total:canDelete?snapshot.records.reduce((n,r)=>n+r.rows.length,0):0,canDelete,unchanged:['All social accounts, credentials, identities and connections are retained.','Unselected protected records and existing audit/accounting history are retained.','All local media files, Pipeline data, and social-platform content are retained.'],additionalChanges:canDelete?[`One deletion-history row will be added to activity_events with ID ${auditId}; publication receipts and retry counts are retained there.`]:[],reversible:false,confirmationPhrase:'DELETE'});
  } catch {return res.status(503).json({error:'Unable to verify all database relationships; deletion is unavailable.'});}
});

testDataInventoryRouter.post('/delete',sameOrigin,(req,res)=>{
  if(typeof req.body?.previewId!=='string' || req.body?.confirmation!=='DELETE') return res.status(400).json({error:'A valid preview and confirmation phrase are required'});
  const preview=previews.get(req.body.previewId); previews.delete(req.body.previewId);
  if(!preview || preview.expires<Date.now()) return res.status(409).json({error:'Preview expired or was already used. Review the selection again.'});
  try {const result=commitDeletion(db,preview.items,preview.fingerprint,preview.auditId);eventService.broadcast('cleanup:changed',{kind:'deletion'});return res.json(result);}
  catch(error:any) {
    if(error?.message==='STALE_PREVIEW') return res.status(409).json({error:'Records or dependencies changed. Review the selection again.'});
    return res.status(503).json({error:'Deletion could not be completed. The transaction was rolled back.'});
  }
});
testDataInventoryRouter.get('/detail', (req,res) => {
  const type=typeof req.query.type==='string'?req.query.type:'';
  const id=typeof req.query.id==='string'?req.query.id:'';
  if(!inventoryTypes.includes(type)||type==='all'||!id||id.length>200||id.trim()!==id) return res.status(400).json({error:'A valid record type and ID are required'});
  try {
    const record=readInventoryRecord(db,type,id), details=readRecordEvidence(db,{type,id});
    if(!record||!details) return res.status(404).json({error:'Record not found'});
    const relationships=[...new Set([...details.relationships,...record.dependencies])];
    const complete=details.complete && !relationships.some(value=>/additional relationships exist|additional references exist|reference limit exceeded|not inspected|malformed JSON/i.test(value));
    return res.json({record,evidence:details.evidence,relationships,links:details.links,complete,thumbnailUrl:details.thumbnailUrl});
  } catch {return res.status(503).json({error:'Unable to inspect this record and its relationships'});}
});
testDataInventoryRouter.get('/', (req, res) => {
  const type = typeof req.query.type === 'string' ? req.query.type : 'all';
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const classification=typeof req.query.classification==='string'?req.query.classification:'all';
  const source=typeof req.query.source==='string'?req.query.source:'all';
  const eligibility=typeof req.query.eligibility==='string'?req.query.eligibility:'all';
  const status=typeof req.query.status==='string'?req.query.status.trim():'';
  const limit = Number(req.query.limit ?? 20), offset = Number(req.query.offset ?? 0);
  if (!inventoryTypes.includes(type) || search.length > 200 || status.length>100 || !['all','confirmed_demo','owner_marked_test','owner_marked_keep','unknown'].includes(classification) || !['all','unknown','manual_upload','pipeline_import','webhook','simulator','official_api','browser_bridge','publishing','mixed','manual','provider','fixture'].includes(source) || !['all','safe','review','protected','unsupported'].includes(eligibility) || !Number.isSafeInteger(limit) || limit < 1 || limit > 50 || !Number.isSafeInteger(offset) || offset < 0) {
    return res.status(400).json({error: 'Invalid inventory filters or pagination'});
  }
  try { return res.json(readTestDataInventory(db, {type, search, limit, offset,classification,source,status,eligibility})); }
  catch { return res.status(503).json({error: 'Inventory unavailable: the required database schema may be missing or incompatible. No partial inventory is shown.'}); }
});
