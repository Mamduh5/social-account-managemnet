import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {uploadsDir} from '../db/database.js';
import {generalPostsRepo as repo} from '../repositories/general-posts.repo.js';
const run = promisify(execFile);
export const imageDir = path.join(uploadsDir,'images');
export function imageDto(row:any) { const {file_path, ...safe}=row; return {...safe, previewUrl:'/api/publishing/images/'+row.id+'/content'}; }
export function imageById(id:string) { return repo.image(id); }
export function verifiedImagePath(row:any):string {
  const base = fs.realpathSync(imageDir), real = fs.realpathSync(row.file_path);
  if (path.dirname(real)!==base || !fs.statSync(real).isFile()) throw new Error('Image path is outside managed storage');
  const bytes=fs.readFileSync(real);
  if(bytes.length!==row.file_size || createHash('sha256').update(bytes).digest('hex')!==row.sha256) throw new Error('Original image integrity check failed');
  return real;
}
export async function storeImage(bytes:Buffer, originalName:string) {
  if (!bytes.length || bytes.length>4*1024*1024) throw new Error('Images must be at most 4 MB');
  const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg=bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  if(!png&&!jpeg) throw new Error('Only actual JPEG and PNG images are supported');
  fs.mkdirSync(imageDir,{recursive:true});
  const id='img-'+randomUUID(), filePath=path.join(imageDir,id+(png?'.png':'.jpg'));
  fs.writeFileSync(filePath,bytes,{flag:'wx'});
  try {
    const {stdout}=await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height','-of','json',filePath],{timeout:10000,maxBuffer:65536,windowsHide:true});
    const stream=JSON.parse(stdout).streams?.[0];
    if(!stream || stream.codec_name!==(png?'png':'mjpeg') || !Number.isInteger(stream.width)||!Number.isInteger(stream.height)||stream.width<1||stream.height<1||stream.width>10000||stream.height>10000||stream.width*stream.height>40000000) throw new Error('Invalid or excessive image dimensions');
    await run('ffmpeg',['-v','error','-xerror','-i',filePath,'-frames:v','1','-f','null','-'],{timeout:15000,maxBuffer:65536,windowsHide:true});
    const sha=createHash('sha256').update(bytes).digest('hex');
    repo.insertImage({id,original_filename:path.basename(originalName).slice(0,255),file_path:filePath,mime_type:png?'image/png':'image/jpeg',file_size:bytes.length,width:stream.width,height:stream.height,sha256:sha});
    return imageDto(imageById(id));
  } catch { fs.unlinkSync(filePath); throw new Error('Image decoding or metadata validation failed'); }
}
