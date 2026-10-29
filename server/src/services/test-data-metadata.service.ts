import type Database from 'better-sqlite3';
import {createHash} from 'node:crypto';

/** Owner assertions, deliberately separate from system-verified provenance. */
export type OwnerClassification = 'owner_marked_test' | 'owner_marked_keep' | 'unknown';
const classificationPrefix = 'cleanup:classification:';
const hiddenPrefix = 'cleanup:pipeline-hidden:';
const hiddenV2Prefix = hiddenPrefix + 'v2:';
const watchHiddenPrefix = 'cleanup:watch-hidden:';
const encode = (value:string) => Buffer.from(value, 'utf8').toString('base64url');
const legacyClassificationKey = (type:string,id:string) => classificationPrefix + encode(JSON.stringify([type,id]));
const legacyHiddenKey = (jobId:string) => hiddenPrefix + encode(jobId);
const scopedHiddenKey = (source:string,jobId:string) => hiddenV2Prefix + encode(JSON.stringify([source,jobId]));
const classificationKey = (db:Database.Database,type:string,id:string,source?:string) => type==='pipeline_job'
  ? classificationPrefix + encode(JSON.stringify([type,source || getPipelineSourceFingerprint(db),id]))
  : legacyClassificationKey(type,id);

/** Hash the exact configured source so identical job IDs from other services stay distinct. */
export function getPipelineSourceFingerprint(db:Database.Database):string {
  const row=db.prepare("SELECT value FROM app_settings WHERE key='pipeline_api_url'").get() as {value:string}|undefined;
  return fingerprintPipelineSource(row?.value || process.env.PIPELINE_API_URL || 'http://localhost:8080');
}
export function fingerprintPipelineSource(source:string):string {return createHash('sha256').update(source.replace(/\/+$/,'')).digest('hex');}

export function getOwnerClassification(db:Database.Database,type:string,id:string,source?:string):OwnerClassification {
  const get=db.prepare('SELECT value FROM app_settings WHERE key=?');
  const row = (get.get(classificationKey(db,type,id,source)) || (type==='pipeline_job' ? get.get(legacyClassificationKey(type,id)) : undefined)) as {value:string}|undefined;
  if (!row) return 'unknown';
  if (row.value === 'unknown' && type === 'pipeline_job') return 'unknown';
  if (row.value !== 'owner_marked_test' && row.value !== 'owner_marked_keep') throw new Error('Invalid stored classification');
  return row.value;
}

export function setOwnerClassification(db:Database.Database,type:string,id:string,classification:OwnerClassification):void {
  const key = classificationKey(db,type,id);
  if (classification === 'unknown') {
    if(type==='pipeline_job') db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES (?,'unknown',datetime('now')) ON CONFLICT(key) DO UPDATE SET value='unknown',updated_at=excluded.updated_at").run(key);
    else db.prepare('DELETE FROM app_settings WHERE key=?').run(key);
  }
  else db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(key,classification);
}

export function isPipelineHidden(db:Database.Database,jobId:string,source=getPipelineSourceFingerprint(db)):boolean {
  const get=db.prepare('SELECT value FROM app_settings WHERE key=?');
  const scoped=get.get(scopedHiddenKey(source,jobId)) as {value:string}|undefined;
  const legacy=get.get(legacyHiddenKey(jobId)) as {value:string}|undefined;
  if ((scoped && scoped.value!=='hidden') || (legacy && legacy.value!=='hidden')) throw new Error('Invalid stored pipeline exclusion');
  return !!scoped || !!legacy;
}

export function setPipelineHidden(db:Database.Database,jobId:string,hidden:boolean,source:string|null,legacy=false):void {
  const key=legacy ? legacyHiddenKey(jobId) : scopedHiddenKey(source || getPipelineSourceFingerprint(db),jobId);
  if (hidden) db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES (?,'hidden',datetime('now')) ON CONFLICT(key) DO UPDATE SET value='hidden',updated_at=excluded.updated_at").run(key);
  else db.prepare('DELETE FROM app_settings WHERE key=?').run(key);
}

export function listHiddenPipeline(db:Database.Database,limit:number,offset:number) {
  const currentSource=getPipelineSourceFingerprint(db);
  const rows = db.prepare('SELECT key,value FROM app_settings WHERE key >= ? AND key < ? ORDER BY key LIMIT ? OFFSET ?')
    .all(hiddenPrefix,hiddenPrefix+'~',limit+1,offset) as {key:string;value:string}[];
  const items = rows.slice(0,limit).map(row=>{
    if (row.value !== 'hidden') throw new Error('Invalid stored pipeline exclusion');
    const legacy=!row.key.startsWith(hiddenV2Prefix);
    const encoded=row.key.slice((legacy?hiddenPrefix:hiddenV2Prefix).length);
    const decoded=Buffer.from(encoded,'base64url').toString('utf8');
    if (!decoded || encode(decoded)!==encoded) throw new Error('Invalid stored pipeline identity');
    let jobId:string,sourceFingerprint:string|null;
    if(legacy) {jobId=decoded;sourceFingerprint=null;}
    else {
      const identity=JSON.parse(decoded);
      if(!Array.isArray(identity)||identity.length!==2||typeof identity[0]!=='string'||!/^[a-f0-9]{64}$/.test(identity[0])||typeof identity[1]!=='string'||!identity[1]) throw new Error('Invalid stored pipeline identity');
      [sourceFingerprint,jobId]=identity;
    }
    return {jobId,sourceFingerprint,legacy,currentSource:legacy||sourceFingerprint===currentSource,ownerClassification:getOwnerClassification(db,'pipeline_job',jobId,sourceFingerprint || currentSource)};
  });
  return {items,limit,offset,hasMore:rows.length>limit};
}

export interface HiddenWatchEntry {
  sourceFingerprint:string; fileId:string; filename:string; fullPath:string;
  sizeBytes:number; modifiedAt:string;
}
const watchKey=(source:string,id:string)=>watchHiddenPrefix+encode(JSON.stringify([source,id]));
export function isWatchFileHidden(db:Database.Database,source:string,id:string):boolean {
  const row=db.prepare('SELECT value FROM app_settings WHERE key=?').get(watchKey(source,id)) as {value:string}|undefined;
  if(!row) return false;
  const value=JSON.parse(row.value) as HiddenWatchEntry;
  if(value.sourceFingerprint!==source || value.fileId!==id) throw new Error('Invalid stored watch exclusion');
  return true;
}
export function setWatchFileHidden(db:Database.Database,entry:HiddenWatchEntry,hidden:boolean):void {
  const key=watchKey(entry.sourceFingerprint,entry.fileId);
  if(hidden) db.prepare("INSERT INTO app_settings(key,value,updated_at) VALUES (?,?,datetime('now')) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").run(key,JSON.stringify(entry));
  else db.prepare('DELETE FROM app_settings WHERE key=?').run(key);
}
export function listHiddenWatchFiles(db:Database.Database,limit:number,offset:number):{items:HiddenWatchEntry[];limit:number;offset:number;hasMore:boolean} {
  const rows=db.prepare('SELECT key,value FROM app_settings WHERE key >= ? AND key < ? ORDER BY key LIMIT ? OFFSET ?')
    .all(watchHiddenPrefix,watchHiddenPrefix+'~',limit+1,offset) as {key:string;value:string}[];
  const items=rows.slice(0,limit).map(row=>{
    const entry=JSON.parse(row.value) as HiddenWatchEntry;
    if(!entry || !/^[a-f0-9]{64}$/.test(entry.sourceFingerprint) || !/^[a-f0-9]{64}$/.test(entry.fileId)
      || typeof entry.filename!=='string' || typeof entry.fullPath!=='string' || !Number.isFinite(entry.sizeBytes)
      || typeof entry.modifiedAt!=='string' || row.key!==watchKey(entry.sourceFingerprint,entry.fileId)) throw new Error('Invalid stored watch exclusion');
    return entry;
  });
  return {items,limit,offset,hasMore:rows.length>limit};
}
