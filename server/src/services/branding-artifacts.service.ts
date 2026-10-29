import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {db, rendersDir} from '../db/database.js';
import {ffmpegService} from './ffmpeg.service.js';

function samePath(left: string, right: string) { return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase(); }
function containedFile(filePath: string) {
  const resolved = path.resolve(filePath), relative = path.relative(path.resolve(rendersDir), resolved);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new Error('Render file is outside the managed render directory');
  if (fs.existsSync(resolved)) {
    const actual = fs.realpathSync(resolved), root = fs.realpathSync(rendersDir), actualRelative = path.relative(root, actual);
    if (!actualRelative || actualRelative === '..' || actualRelative.startsWith('..' + path.sep) || path.isAbsolute(actualRelative) || !fs.statSync(actual).isFile()) throw new Error('Render file is not a managed regular file');
    for (const master of db.prepare('SELECT file_path FROM videos').all() as {file_path:string}[]) {
      if (samePath(master.file_path, resolved) || (fs.existsSync(master.file_path) && samePath(fs.realpathSync(master.file_path), actual))) throw new Error('A master video cannot be removed as a render');
    }
  }
  return resolved;
}

/** File moves are compensated if SQL fails; shared cache artifacts survive. */
export function deleteBrandingVariant(id: string) {
  const staged: {original:string;staged:string}[] = [];
  try {
    const result = db.transaction(() => {
      const variant = db.prepare('SELECT * FROM branded_videos WHERE id=?').get(id) as any;
      if (!variant) return null;
      const referenced = db.prepare('SELECT id FROM publishing_posts WHERE selected_variant_id=? LIMIT 1').get(id)
        || db.prepare('SELECT id FROM publishing_destinations WHERE selected_variant_id=? LIMIT 1').get(id);
      if (referenced) throw new Error('This variant is selected by publishing history or pending work; preserve it and choose an unreferenced variant');
      const draftsReady = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='publishing_drafts'").get();
      if (draftsReady) for (const draft of db.prepare('SELECT payload_json FROM publishing_drafts').all() as {payload_json:string}[]) {
        let payload: any;
        try { payload = JSON.parse(draft.payload_json); } catch { throw new Error('Draft references could not be verified; variant removal is unavailable'); }
        if (payload.selectedVariantId === id || payload.destinations?.some((destination:any) => destination.selectedVariantId === id)) throw new Error('This variant is selected by a saved publishing draft');
      }
      const candidates = [variant.file_path, variant.thumbnail_path].filter(Boolean) as string[];
      for (const candidate of candidates) {
        const resolved = containedFile(candidate);
        if (ffmpegService.isRendering(resolved)) throw new Error('This render is being generated; wait for rendering to complete');
        const shared = (db.prepare('SELECT file_path,thumbnail_path FROM branded_videos WHERE id<>?').all(id) as any[])
          .some(row => [row.file_path,row.thumbnail_path].some(value => value && samePath(value,resolved)));
        const publicationUsesFile = (db.prepare('SELECT branded_video_path FROM publishing_destinations WHERE branded_video_path IS NOT NULL').all() as any[])
          .some(row => samePath(row.branded_video_path,resolved));
        if (publicationUsesFile) throw new Error('This render is referenced by a publication or handoff and must be preserved');
        for (const pin of db.prepare("SELECT metadata_json FROM activity_events WHERE type='media_render_pinned'").all() as {metadata_json:string}[]) {
          let payload: any;
          try { payload = JSON.parse(pin.metadata_json); } catch { throw new Error('Saved render pins could not be verified; preserve this artifact.'); }
          if (typeof payload.path === 'string' && samePath(payload.path,resolved)) throw new Error('This render has a durable publication pin and must be preserved');
        }
        if (!shared && fs.existsSync(resolved)) {
          const temporary = path.join(rendersDir, `.${randomUUID()}.removed`);
          fs.renameSync(resolved,temporary);
          staged.push({original:resolved,staged:temporary});
        }
      }
      db.prepare('DELETE FROM branded_videos WHERE id=?').run(id);
      return {success:true,message:'Branded variant removed. Shared render files and master videos are preserved.'};
    }).immediate();
    // SQL is committed. A failed final unlink is retained as a hidden artifact,
    // never restored over a concurrent render or reported as a lost DB record.
    let cleanupPending=0;
    for (const file of staged) { try { fs.unlinkSync(file.staged); } catch {cleanupPending++;} }
    return result ? {...result,artifactCleanupPending:cleanupPending,
      ...(cleanupPending?{message:'Variant record removed. A staged render file remains for local disk cleanup; shared files and masters are preserved.'}:{})} : null;
  } catch (error) {
    for (const file of staged.reverse()) if (fs.existsSync(file.staged)) fs.renameSync(file.staged,file.original);
    throw error;
  }
}
