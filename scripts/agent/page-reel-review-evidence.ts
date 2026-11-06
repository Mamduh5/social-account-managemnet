import path from 'node:path';
import {readFile,writeFile,mkdir,unlink,stat} from 'node:fs/promises';
import {fileSha256} from './gemini-media-qa.js';
import {getBrandingLayout} from '../../server/src/domain/branding-layout.js';
import {stableHash} from './store.js';
import {runProcess,type ProcessRunner} from './executors.js';
type Any=Record<string,any>;
export const pageEvidenceVersion='page-reel-evidence.v2';
export const reviewTimes=[0.5,3.5,6.5,9.5];
/** Pixel differences localize an overlay; they do NOT recognize text or certify legibility. */
export function overlayEvidence(master:Buffer,variant:Buffer,width:number,height:number,safe:Any){
 if(master.length!==width*height||variant.length!==master.length)throw Error('Frame evidence geometry differs');
 let x0=width,y0=height,x1=-1,y1=-1,count=0;
 for(let i=0;i<master.length;i++)if(Math.abs(master[i]-variant[i])>=50){const x=i%width,y=Math.floor(i/width);x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);count++;}
 const present=count>=8,bounds=present?{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1}:null;
 return {changedPixels:count,bounds,localized:!!bounds&&bounds.height<=100&&bounds.width<=width*0.8,insideSafeArea:!!bounds&&x0>=safe.left&&y0>=safe.top&&x1<width-safe.right&&y1<height-safe.bottom};
}
export function temporalOverlayEvidence(samples:Any[]){const localized=samples.length===4&&samples.every(s=>s.localized),positions=new Set(samples.filter(s=>s.bounds).map(s=>Math.round(s.bounds.x/20)+':'+Math.round(s.bounds.y/20)));
 return {localizedSamples:samples.filter(s=>s.localized).length,safeSamples:samples.filter(s=>s.localized&&s.insideSafeArea).length,movementObserved:localized&&positions.size>=2,legibility:'requires_visual_review',notice:'Thresholded master/variant frame differences; compression or scene changes can make localization inconclusive. No OCR, text identity, continuous visibility or creative PASS is inferred.'};}
/** Read-only, bounded supplements to existing ordered sheets. Never alters source media. */
export async function pageReviewEvidence(master:Any,variant:Any,branding:Any,process:ProcessRunner=runProcess){
 const kit=branding.brandKit;
 if(!master.fullDecode||!variant.fullDecode||!kit||branding.sha256!==variant.sha256||master.width!==variant.width||master.height!==variant.height||master.width>2160||master.height>3840||Math.abs(master.duration-10)>.15)throw Error('Verified Page branding and exact technical media required');
 if(await fileSha256(master.masterPath)!==master.sha256||await fileSha256(variant.masterPath)!==variant.sha256)throw Error('Review media changed');
 const root=path.join(path.dirname(variant.masterPath),'review-v2'),report=path.join(root,'evidence.json'),sourceHash=stableHash({version:pageEvidenceVersion,master:master.sha256,variant:variant.sha256,branding});await mkdir(root,{recursive:true});
 const existing=await readFile(report,'utf8').catch(()=>null);
 if(existing){const r=JSON.parse(existing);if(r.sourceHash!==sourceHash||r.version!==pageEvidenceVersion||r.images?.length!==3||r.images.some((i:Any,n:number)=>i.path!==path.join(root,['review-native.jpg','review-mobile.jpg','review-branding.jpg'][n])))throw Error('Review evidence source changed');for(const i of r.images)if(await fileSha256(i.path)!==i.sha256)throw Error('Review evidence changed');return r;}
 const run=async(args:string[])=>{const r=await process('ffmpeg',['-v','error','-nostdin','-y',...args],{cwd:root,timeoutMs:60000,maxBytes:131072});if(r.code!==0)throw Error('Review frame extraction failed: '+String(r.code));};
 const layout=getBrandingLayout(kit,{width:master.width,height:master.height,aspectRatio:'9:16'}),samples:Any[]=[];
 for(const [index,t] of reviewTimes.entries()){
  const files=['master','variant'].map(role=>path.join(root,role+'-'+index+'.gray'));
  try{for(const [j,source] of [master,variant].entries())await run(['-ss',String(t),'-i',source.masterPath,'-frames:v','1','-pix_fmt','gray','-f','rawvideo',files[j]]);
   const sample=overlayEvidence(await readFile(files[0]),await readFile(files[1]),master.width,master.height,layout.safeArea);samples.push({t,...sample});
   await run(['-ss',String(t),'-i',variant.masterPath,'-vf','scale=360:640','-frames:v','1','-q:v','2','-update','1',path.join(root,'mobile-'+index+'.jpg')]);
   // Native crop retains the actual text pixels. An inconclusive localization uses the whole frame.
   const crop=sample.localized?`crop=iw:100:0:${Math.max(0,Math.min(master.height-100,sample.bounds!.y-20))}`:`scale=${master.width}:100:force_original_aspect_ratio=decrease,pad=${master.width}:100:0:0`;
   await run(['-ss',String(t),'-i',variant.masterPath,'-vf',crop+`,pad=${master.width}:140:0:30:color=black`,'-frames:v','1','-update','1',path.join(root,'crop-'+index+'.jpg')]);
  }finally{for(const f of files)await unlink(f).catch(()=>{});}
 }
 const native=path.join(root,'review-native.jpg'),mobile=path.join(root,'review-mobile.jpg'),strip=path.join(root,'review-branding.jpg');
 await run(['-ss','9.5','-i',variant.masterPath,'-frames:v','1','-q:v','2','-update','1',native]);
 await run(['-framerate','1','-i',path.join(root,'mobile-%d.jpg'),'-vf','tile=2x2:nb_frames=4','-frames:v','1','-q:v','2','-update','1',mobile]);
 await run(['-framerate','1','-i',path.join(root,'crop-%d.jpg'),'-vf','tile=1x4:nb_frames=4','-frames:v','1','-q:v','2','-update','1',strip]);
 const images=[];for(const f of [native,mobile,strip]){const bytes=(await stat(f)).size;if(bytes>3*1024**2)throw Error('Review image oversized');images.push({path:f,sha256:await fileSha256(f)});}
 for(let i=0;i<4;i++)for(const role of ['crop','mobile'])await unlink(path.join(root,role+'-'+i+'.jpg'));
 if(await fileSha256(master.masterPath)!==master.sha256||await fileSha256(variant.masterPath)!==variant.sha256)throw Error('Review media changed');
 const result={version:pageEvidenceVersion,sourceHash,masterSha256:master.sha256,variantSha256:variant.sha256,images,times:reviewTimes,samples,watermark:temporalOverlayEvidence(samples),artifactBytes:(await Promise.all(images.map(i=>stat(i.path)))).reduce((a,b)=>a+b.size,0),limitations:'Existing 20-frame sheets plus final native frame, four 360px mobile frames, four native branding crops. Supplements are sampled evidence, not full-video playback or listening.'};
 await writeFile(report,JSON.stringify(result),{flag:'wx'});return result;
}
