import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db, uploadsDir } from '../db/database.js';
import { ffmpegService } from './ffmpeg.service.js';
import { publishingRepo } from '../repositories/publishing.repo.js';

/** Finalize only this request's staged bytes; failed uploads cannot leave library orphans. */
export async function finalizeManualUpload(file: { path: string; originalname: string; size: number }, title: string, categoryId: string | null) {
  const stagedRoot = path.resolve(uploadsDir, '.incoming');
  const staged = path.resolve(file.path);
  if (path.dirname(staged) !== stagedRoot || !fs.lstatSync(staged).isFile()) throw new Error('Invalid upload staging file.');
  const videoId = `vid-${randomUUID()}`;
  const destination = path.join(uploadsDir, path.basename(staged));
  const stagedThumb = path.join(stagedRoot, `${videoId}_thumb.jpg`);
  const thumbnail = path.join(uploadsDir, `${videoId}_thumb.jpg`);
  const owned = new Set<string>([staged, stagedThumb]);
  try {
    if (categoryId && !db.prepare('SELECT 1 FROM categories WHERE id=?').get(categoryId)) throw new Error('Select an existing category.');
    const metadata = await ffmpegService.probeVideo(staged);
    await ffmpegService.generateThumbnail(staged, stagedThumb);
    db.transaction(() => {
      fs.copyFileSync(staged, destination, fs.constants.COPYFILE_EXCL); owned.add(destination);
      if (fs.existsSync(stagedThumb)) { fs.copyFileSync(stagedThumb, thumbnail, fs.constants.COPYFILE_EXCL); owned.add(thumbnail); }
      publishingRepo.insertVideo({ id: videoId, title, sourceType: 'manual_upload', originalFilename: file.originalname,
        filePath: destination, fileSize: file.size, duration: metadata.duration, width: metadata.width, height: metadata.height,
        aspectRatio: metadata.aspectRatio, thumbnailPath: owned.has(thumbnail) ? thumbnail : null, categoryId });
    })();
    owned.delete(destination); owned.delete(thumbnail);
    return { success: true, videoId, title, duration: metadata.duration, aspectRatio: metadata.aspectRatio };
  } finally {
    for (const filePath of owned) { try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch { /* Only request-owned artifacts; a later maintenance review may retry. */ } }
  }
}
