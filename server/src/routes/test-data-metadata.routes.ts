import {Router, type RequestHandler} from 'express';
import {db} from '../db/database.js';
import {getOwnerClassification, getPipelineSourceFingerprint, setOwnerClassification, setPipelineHidden, listHiddenPipeline, setWatchFileHidden, listHiddenWatchFiles} from '../services/test-data-metadata.service.js';
import {eventService} from '../services/events.service.js';
import {pipelineService} from '../services/pipeline.service.js';

export const testDataMetadataRouter=Router();
const tables:Record<string,string>={account:'accounts',category:'categories',video:'videos',branded_video:'branded_videos',publishing_post:'publishing_posts',publishing_destination:'publishing_destinations',publishing_draft:'publishing_drafts',assistant_draft:'assistant_drafts',campaign:'publishing_campaigns',group_plan:'facebook_group_plans',group_prepared_content:'group_prepared_content'};
const validId=(v:unknown):v is string=>typeof v==='string' && v.length>0 && v.length<=200 && v.trim()===v && !/[\u0000-\u001f\u007f]/.test(v);
// Match the existing manager's strict same-origin mutation rule, including its loopback TLS proxy.
const sameOrigin:RequestHandler=(req,res,next)=>{
  const origin=req.headers.origin,host=req.headers.host;
  const forwarded=req.headers['x-forwarded-proto']==='https' && req.headers['x-forwarded-host']===host;
  const protocol=forwarded?'https':req.protocol;
  if((origin && origin!==`${protocol}://${host}`) || (req.headers['sec-fetch-site'] && !['same-origin','none'].includes(req.headers['sec-fetch-site']))) return res.status(403).json({error:'Same-origin request required'});
  next();
};

testDataMetadataRouter.post('/classify',sameOrigin,(req,res)=>{
  const {type,id,classification,sourceFingerprint}=req.body||{};
  if(typeof type!=='string' || (!Object.hasOwn(tables,type) && type!=='pipeline_job') || !validId(id) || !['test','keep','clear'].includes(classification)) return res.status(400).json({error:'Invalid record identity or classification'});
  try {
    const value=classification==='test'?'owner_marked_test':classification==='keep'?'owner_marked_keep':'unknown';
    db.transaction(()=>{
      if(type==='pipeline_job' && sourceFingerprint!==getPipelineSourceFingerprint(db)) throw new Error('STALE_SOURCE');
      if(type!=='pipeline_job' && !db.prepare(`SELECT 1 FROM "${tables[type]}" WHERE id=?`).get(id)) throw new Error('MISSING_RECORD');
      if(classification==='test' && getOwnerClassification(db,type,id)==='owner_marked_keep') throw new Error('KEEP_REQUIRES_CLEAR');
      setOwnerClassification(db,type,id,value);
    }).immediate();
    eventService.broadcast('cleanup:changed',{kind:'classification',type,id});
    return res.json({type,id,classification:value});
  } catch(error:any) {
    if(error?.message==='STALE_SOURCE') return res.status(409).json({error:'Pipeline source changed. Refresh discovery before marking this item.'});
    if(error?.message==='MISSING_RECORD') return res.status(404).json({error:'Record not found'});
    if(error?.message==='KEEP_REQUIRES_CLEAR') return res.status(409).json({error:'Remove the owner Keep designation before marking this record as Test.'});
    return res.status(503).json({error:'Classification could not be saved'});
  }
});

testDataMetadataRouter.get('/pipeline-hidden',(req,res)=>{
  const limit=Number(req.query.limit??20),offset=Number(req.query.offset??0);
  if(!Number.isSafeInteger(limit)||limit<1||limit>50||!Number.isSafeInteger(offset)||offset<0) return res.status(400).json({error:'Invalid pagination'});
  try {return res.json(listHiddenPipeline(db,limit,offset));}
  catch {return res.status(503).json({error:'Hidden items could not be read'});}
});

testDataMetadataRouter.post('/pipeline-hidden',sameOrigin,(req,res)=>{
  const {jobId,hidden,sourceFingerprint,legacy}=req.body||{};
  if(!validId(jobId)||typeof hidden!=='boolean'||(legacy!==undefined && typeof legacy!=='boolean')||(legacy && hidden)||(!legacy && (typeof sourceFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(sourceFingerprint)))) return res.status(400).json({error:'Invalid pipeline identity or action'});
  try {
    db.transaction(()=>{
      if(hidden && sourceFingerprint!==getPipelineSourceFingerprint(db)) throw new Error('STALE_SOURCE');
      setPipelineHidden(db,jobId,hidden,sourceFingerprint||null,!!legacy);
    }).immediate();
    eventService.broadcast('cleanup:changed',{kind:'pipeline_visibility',jobId});
    return res.json({jobId,hidden});
  } catch(error:any) {
    if(error?.message==='STALE_SOURCE') return res.status(409).json({error:'Pipeline source changed. Refresh discovery before hiding this item.'});
    return res.status(503).json({error:'Pipeline exclusion could not be saved'});
  }
});

testDataMetadataRouter.get('/watch-files',(req,res)=>{
  const limit=Number(req.query.limit??20),offset=Number(req.query.offset??0);
  const visibility=typeof req.query.visibility==='string'?req.query.visibility:'all';
  if(!Number.isSafeInteger(limit)||limit<1||limit>50||!Number.isSafeInteger(offset)||offset<0||!['all','visible','hidden'].includes(visibility)) return res.status(400).json({error:'Invalid watch inventory filters'});
  try {
    const all=pipelineService.scanWatchDirectory({includeHidden:true});
    const filtered=visibility==='all'?all:all.filter(file=>visibility==='hidden'?file.hidden:file.visibilitySupported&&!file.hidden);
    return res.json({items:filtered.slice(offset,offset+limit),limit,offset,hasMore:offset+limit<filtered.length,sourceAvailable:!!pipelineService.getWatchSourceFingerprint(),scanIncomplete:all.some(file=>!file.visibilitySupported)});
  } catch {return res.status(503).json({error:'Watch-directory inspection is unavailable; no partial list is shown.'});}
});

testDataMetadataRouter.get('/watch-hidden',(req,res)=>{
  const limit=Number(req.query.limit??20),offset=Number(req.query.offset??0);
  if(!Number.isSafeInteger(limit)||limit<1||limit>50||!Number.isSafeInteger(offset)||offset<0) return res.status(400).json({error:'Invalid pagination'});
  try {
    const currentSource=pipelineService.getWatchSourceFingerprint();
    const page=listHiddenWatchFiles(db,limit,offset);
    const files=currentSource?pipelineService.scanWatchDirectory({includeHidden:true}):[];
    const available=new Set(files.filter(file=>file.fileId&&file.sourceFingerprint).map(file=>JSON.stringify([file.sourceFingerprint,file.fileId])));
    const incomplete=files.some(file=>!file.visibilitySupported);
    return res.json({...page,items:page.items.map(item=>({...item,currentSource:item.sourceFingerprint===currentSource,
      present:item.sourceFingerprint===currentSource?(available.has(JSON.stringify([item.sourceFingerprint,item.fileId]))?true:incomplete?null:false):null}))});
  } catch {return res.status(503).json({error:'Hidden watch entries could not be inspected.'});}
});

testDataMetadataRouter.post('/watch-hidden',sameOrigin,(req,res)=>{
  const {fileId,sourceFingerprint,hidden}=req.body||{};
  if(typeof fileId!=='string'||!/^[a-f0-9]{64}$/.test(fileId)||typeof sourceFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(sourceFingerprint)||typeof hidden!=='boolean') return res.status(400).json({error:'Invalid watch-file identity or action'});
  try {
    db.transaction(()=>{
      if(hidden) {
        if(sourceFingerprint!==pipelineService.getWatchSourceFingerprint()) throw new Error('STALE_WATCH_SOURCE');
        const observed=pipelineService.scanWatchDirectory({includeHidden:true}).find(file=>file.sourceFingerprint===sourceFingerprint&&file.fileId===fileId&&file.visibilitySupported);
        if(!observed) throw new Error('STALE_WATCH_FILE');
        setWatchFileHidden(db,{fileId,sourceFingerprint,filename:observed.filename,fullPath:observed.fullPath,sizeBytes:observed.sizeBytes,modifiedAt:observed.modifiedAt},true);
      } else {
        setWatchFileHidden(db,{fileId,sourceFingerprint,filename:'',fullPath:'',sizeBytes:0,modifiedAt:''},false);
      }
    }).immediate();
    eventService.broadcast('cleanup:changed',{kind:'watch_visibility',fileId,sourceFingerprint});
    return res.json({fileId,sourceFingerprint,hidden});
  } catch(error:any) {
    if(error?.message==='STALE_WATCH_SOURCE'||error?.message==='STALE_WATCH_FILE') return res.status(409).json({error:'The watch source or file changed. Refresh discovery before hiding.'});
    return res.status(503).json({error:'Watch-file visibility could not be updated.'});
  }
});
