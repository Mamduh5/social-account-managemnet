import {db} from '../db/database.js';
import {generalPostsReady} from '../db/general-posts-schema.js';
import type {DraftInput} from '../domain/general-posts.js';
export class GeneralPostsRepository {
  ready(){return generalPostsReady(db);}
  transaction<T>(fn:()=>T):T{return db.transaction(fn)();}
  list(){return db.prepare('SELECT * FROM publishing_drafts ORDER BY updated_at DESC,id').all() as any[];}
  get(id:string){return db.prepare('SELECT * FROM publishing_drafts WHERE id=?').get(id) as any;}
  save(id:string,payload:DraftInput,revision?:number){
    if(revision===undefined) db.prepare('INSERT INTO publishing_drafts (id,payload_json) VALUES (?,?)').run(id,JSON.stringify(payload));
    else {
      const r=db.prepare("UPDATE publishing_drafts SET payload_json=?,revision=revision+1,status='draft',approved_revision=NULL,approved_hash=NULL,updated_at=datetime('now') WHERE id=? AND revision=? AND status!='queued'").run(JSON.stringify(payload),id,revision);
      if(r.changes!==1) throw new Error('Draft changed; reload before editing');
    }
  }
  approve(id:string,revision:number,hash:string){
    const r=db.prepare("UPDATE publishing_drafts SET status='approved',approved_revision=?,approved_hash=?,updated_at=datetime('now') WHERE id=? AND revision=? AND status!='queued'").run(revision,hash,id,revision);
    if(r.changes!==1) throw new Error('Draft changed; reload before approval');
  }
  reject(id:string,revision:number){
    const r=db.prepare("UPDATE publishing_drafts SET status='rejected',approved_revision=NULL,approved_hash=NULL,updated_at=datetime('now') WHERE id=? AND revision=? AND status!='queued'").run(id,revision);
    if(r.changes!==1) throw new Error('Draft changed or already queued');
  }
  queued(id:string,revision:number,postId:string){
    const r=db.prepare("UPDATE publishing_drafts SET status='queued',queued_post_id=?,updated_at=datetime('now') WHERE id=? AND revision=? AND status='approved'").run(postId,id,revision);
    if(r.changes!==1) throw new Error('Draft approval is no longer current');
  }
  audit(id:string,revision:number,action:string,hash:string,detail:any={}){db.prepare('INSERT INTO publishing_draft_audit(draft_id,revision,action,payload_hash,detail_json) VALUES (?,?,?,?,?)').run(id,revision,action,hash,JSON.stringify(detail));}
  auditFor(id:string){return db.prepare('SELECT * FROM publishing_draft_audit WHERE draft_id=? ORDER BY id').all(id);}
  attach(destinationId:string,contentType:string,linkUrl:string|null,draftId:string,revision:number,attachments:{mediaId:string,altText?:string}[]){
    db.prepare('UPDATE publishing_destinations SET content_type=?,link_url=?,approval_draft_id=?,approval_revision=? WHERE id=?').run(contentType,linkUrl,draftId,revision,destinationId);
    const insert=db.prepare('INSERT INTO publishing_attachments(destination_id,position,media_id,alt_text) VALUES (?,?,?,?)');
    attachments.forEach((a,i)=>insert.run(destinationId,i,a.mediaId,a.altText||''));
  }
  setPostType(postId:string,contentType:string){db.prepare('UPDATE publishing_posts SET content_type=? WHERE id=?').run(contentType,postId);}
  attachments(destinationId:string){return db.prepare('SELECT a.*,m.file_path,m.mime_type,m.file_size,m.width,m.height,m.sha256 FROM publishing_attachments a JOIN media_images m ON a.media_id=m.id WHERE a.destination_id=? ORDER BY a.position').all(destinationId) as any[];}
  submissionStarted(destinationId:string,stage:string,attachmentId?:string){
    db.prepare('UPDATE publishing_destinations SET submission_state=? WHERE id=?').run(stage,destinationId);
    if(attachmentId) db.prepare("UPDATE publishing_attachments SET upload_state='submitting' WHERE destination_id=? AND media_id=?").run(destinationId,attachmentId);
  }
  attachmentUploaded(destinationId:string,attachmentId:string,remoteId:string){
    db.prepare("UPDATE publishing_attachments SET remote_id=?,upload_state='uploaded' WHERE destination_id=? AND media_id=?").run(remoteId,destinationId,attachmentId);
    db.prepare('UPDATE publishing_destinations SET submission_state=NULL WHERE id=?').run(destinationId);
  }
  remoteCreated(destinationId:string){db.prepare("UPDATE publishing_destinations SET submission_state='created' WHERE id=?").run(destinationId);}
  image(id:string){return db.prepare('SELECT * FROM media_images WHERE id=?').get(id) as any;}
  insertImage(row:any){db.prepare('INSERT INTO media_images (id,original_filename,file_path,mime_type,file_size,width,height,sha256) VALUES (?,?,?,?,?,?,?,?)').run(row.id,row.original_filename,row.file_path,row.mime_type,row.file_size,row.width,row.height,row.sha256);}
  images(){return db.prepare('SELECT * FROM media_images ORDER BY created_at DESC,id').all() as any[];}
}
export const generalPostsRepo=new GeneralPostsRepository();
