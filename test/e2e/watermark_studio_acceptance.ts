/** Combined V1.11/branding review. Never opens the owner DB or permits provider traffic. */
import { chromium } from 'playwright';
import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

async function main() {
const output = path.resolve('.data/v111-integration/20261026/branding');
fs.mkdirSync(path.join(output, 'browser-runs'), {recursive:true});
const runDir = fs.mkdtempSync(path.join(output, 'browser-runs', 'run-'));
const clientDist = path.resolve('.data/v111-integration/20261026/client-candidate');
const base = 'http://127.0.0.1:3197';
const hash = (p:string) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
process.env.SCC_DATA_DIR = runDir;
process.env.SCC_ISOLATED_TEST = 'true';
process.env.SCC_PAUSE_WORKERS = 'true';
process.env.SCC_SEED_DEMOS = 'false';
process.env.SCC_ASSISTANT_PROVIDER_CONFIG = '';
process.env.SCC_ASSISTANT_FIXTURES = 'false';
process.env.SCC_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 43).toString('base64');
const { db, uploadsDir, rendersDir } = await import('../../server/src/db/database.js');
const { initializeDatabase } = await import('../../server/src/db/schema.js');
const { publishingRepo } = await import('../../server/src/repositories/publishing.repo.js');
initializeDatabase();
const legacy = {watermarkType:'moving_text', text:'@Legacy', movementPreset:'corner_jump', enableSignature:true, signatureText:'Saved legacy brand', boxBgOpacity:0.45};
for (const [id,name,kit] of [['brand-thai','\u0e41\u0e01\u0e49\u0e1a\u0e31\u0e04\u0e22\u0e32\u0e27\u0e46\u0e46',null],['brand-legacy','Legacy Brand',JSON.stringify(legacy)]]) {
  db.prepare(`INSERT INTO accounts (id,platform,account_type,name,handle,status,connector_mode,is_demo,connection_status,brand_kit_json) VALUES (?,'facebook','page',?,?,'disconnected','official_api',0,'disconnected',?)`).run(id,name,'@'+id,kit);
}
for(const [id,size,ratio] of [['portrait','360x640','9:16'],['landscape','640x360','16:9']]) {
 const file=path.join(uploadsDir,id+'.mp4');
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`testsrc2=s=${size}:r=12:d=2`,'-c:v','libx264','-pix_fmt','yuv420p','-y',file],{windowsHide:true});
 const [width,height]=size.split('x').map(Number);
 publishingRepo.insertVideo({id,title:id+' browser fixture',sourceType:'manual_upload',originalFilename:id+'.mp4',filePath:file,fileSize:fs.statSync(file).size,duration:2,width,height,aspectRatio:ratio});
}
const oldFile=path.join(rendersDir,'legacy-existing.mp4');
fs.copyFileSync(path.join(uploadsDir,'portrait.mp4'),oldFile);
publishingRepo.insertBrandedVideo({id:'old-variant',videoId:'portrait',presetName:'Historical saved variant',movementPreset:'corner_jump',watermarkText:'@Legacy',filePath:oldFile,fileSize:fs.statSync(oldFile).size,duration:2,width:360,height:640,aspectRatio:'9:16',brandKitJson:JSON.stringify(legacy),sha256:hash(oldFile)});
const before={masters:Object.fromEntries(['portrait','landscape'].map(id=>[id,hash(path.join(uploadsDir,id+'.mp4'))])),old:hash(oldFile),legacy:JSON.stringify(legacy)};
db.close();
const server=spawn(process.execPath,['--import','tsx','test/e2e/watermark_review_server.ts'],{cwd:process.cwd(),env:{...process.env,PORT:'3197',SCC_CLIENT_DIST:clientDist},windowsHide:true,stdio:['ignore','pipe','pipe']});
let logs=''; server.stdout.on('data',d=>logs+=d); server.stderr.on('data',d=>logs+=d);
let browser;
const results:string[]=[];
const ok=(s:string)=>{results.push(s);console.log('PASS '+s)};
try {
 for(let n=0;n<100;n++) { try{ if((await fetch(base+'/api/health')).ok)break; }catch{} await new Promise(r=>setTimeout(r,100)); }
 assert.equal((await fetch(base+'/api/health')).status,200);
 const installed=path.join(process.env.LOCALAPPDATA!, 'ms-playwright/chromium-1234/chrome-win/chrome.exe');
 browser=await chromium.launch({headless:true, ...(fs.existsSync(installed)?{executablePath:installed}:{channel:'msedge'})});
 const page=await browser.newPage({viewport:{width:1440,height:1080}});
 const errors:string[]=[]; const prohibited:string[]=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==base || (req.method()!=='GET'&&!url.pathname.startsWith('/api/branding/'))) { prohibited.push(req.method()+' '+url.pathname); return route.abort(); }
  return route.continue();
 });
 await page.goto(base);
 await page.getByRole('button',{name:'Content Calendar',exact:true}).click();
 await page.getByRole('heading',{name:/Content Calendar & Planner/}).waitFor();
 const fixtureCampaigns=await (await fetch(base+'/api/calendar/campaigns')).json() as any;
 assert.equal((fixtureCampaigns.campaigns || []).length,0,'branding review must not create or approve a campaign');
 await page.screenshot({path:path.join(runDir,'combined-calendar.png'),fullPage:true});
 ok('V1.11 calendar and Branding Studio coexist without campaign creation or approval');
 await page.getByRole('button',{name:'Branding Studio',exact:true}).click();
 await page.getByRole('button',{name:/\u0e41\u0e01\u0e49\u0e1a\u0e31\u0e04\u0e22\u0e32\u0e27\u0e46\u0e46/}).click();
 await page.getByLabel('Master Video', {exact:true}).selectOption('portrait');
 // The labels and semantic preview state are part of the branding acceptance contract.
 assert.equal(await page.getByLabel('Account Default Bottom Caption', {exact:true}).inputValue(),'\u0e41\u0e01\u0e49\u0e1a\u0e31\u0e04\u0e22\u0e32\u0e27\u0e46\u0e46');
 await page.getByLabel('Account Default Bottom Caption', {exact:true}).fill('\u0e41\u0e01\u0e49\u0e1a\u0e31\u0e04\u0e22\u0e32\u0e27\u0e46\u0e46 \u00b7 Brand 100%');
 await page.getByRole('radio',{name:'Moving Watermark + Bottom Caption',exact:true}).click();
 await page.getByLabel('Use Per-Video Caption Override', {exact:true}).check();
 await page.getByLabel('Per-Video Bottom Caption', {exact:true}).fill("\u0e41\u0e01\u0e49\u0e1a\u0e31\u0e04\u0e22\u0e32\u0e27\u0e46\u0e46 : Owner's 100%, [Brand]");
 const canvas=page.locator('canvas[data-branding-mode]');
 await page.waitForFunction(()=>document.querySelector('canvas')?.getAttribute('data-caption-text')==="\u0e41\u0e01\u0e49\u0e1a\u0e31\u0e04\u0e22\u0e32\u0e27\u0e46\u0e46 : Owner's 100%, [Brand]");
 ok('Thai and punctuation override updates live preview');
 const saveResponse=page.waitForResponse(r=>r.url().endsWith('/api/branding/kits/brand-thai')&&r.request().method()==='PUT');
 await page.getByRole('button',{name:'Save Brand Kit',exact:true}).click();
 assert.equal((await saveResponse).status(),200);
 const accounts=await (await fetch(base+'/api/accounts')).json() as any;
 assert.equal(accounts.accounts.find((a:any)=>a.id==='brand-thai').brandKit.signatureText,'\u0e41\u0e01\u0e49\u0e1a\u0e31\u0e04\u0e22\u0e32\u0e27\u0e46\u0e46 \u00b7 Brand 100%');
 ok('Saving account default excludes per-video override');
 const modes=[['No Watermark','none','false','false'],['Moving Watermark Only','moving','true','false'],['Moving Watermark + Bottom Caption','moving_and_caption','true','true'],['Bottom Caption Only','caption','false','true']];
 for(const [name,mode,moving,caption] of modes){
  await page.getByRole('radio',{name,exact:true}).click();
  assert.equal(await canvas.getAttribute('data-branding-mode'),mode);
  assert.equal(await canvas.getAttribute('data-moving-enabled'),moving);
  assert.equal(await canvas.getAttribute('data-caption-enabled'),caption);
  const pixels = await canvas.evaluate(async (element:HTMLCanvasElement) => {
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    const rgba=element.getContext('2d')!.getImageData(0,0,element.width,element.height).data;
    let ink=0,label=0,upperInk=0,lowerInk=0;
    for(let i=0;i<rgba.length;i+=4){if(rgba[i+3]){ink++;if(i/4/element.width<element.height*0.8)upperInk++;else lowerInk++;if(rgba[i]===185&&rgba[i+1]===78&&rgba[i+2]===48)label++;}}
    return {ink,label,upperInk,lowerInk};
  });
  if(mode==='none')assert.equal(pixels.ink,0,'no-watermark preview must be transparent');
  else assert.ok(pixels.ink>0);
  assert.equal(pixels.label,0,'no branding mode may draw orange panel pixels');
  if(caption==='true')assert.ok(pixels.lowerInk>0,'caption text glyphs must remain visible without a panel');
  if(mode==='caption'){assert.equal(pixels.upperInk,0,'caption-only preview has no moving pixels');assert.equal(await page.getByLabel('Font Scale',{exact:true}).isEnabled(),true,'caption-only keeps font settings editable');}
  await page.screenshot({path:path.join(runDir,mode+'-desktop.png'),fullPage:true});
 }
 ok('Four text-only modes preview correct elements with zero orange panel pixels');
 await page.getByRole('radio',{name:'Bottom Caption Only',exact:true}).click();
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/branding/render-preview')&&r.request().method()==='POST',{timeout:90000});
 await page.getByRole('button',{name:'Render Preview',exact:true}).click();
 const rendered=await responsePromise;
 assert.equal(rendered.status(),200,await rendered.text());
 const request=rendered.request().postDataJSON();
 assert.equal(request.brandKit.mode,'caption');
 assert.equal(request.brandKit.signatureText,"\u0e41\u0e01\u0e49\u0e1a\u0e31\u0e04\u0e22\u0e32\u0e27\u0e46\u0e46 : Owner's 100%, [Brand]");
 const body=await rendered.json();
 await page.getByText('FFmpeg Render Complete!',{exact:true}).waitFor();
 assert.equal((await fetch(base+body.previewUrl)).status,200);
 ok('Bottom-only real FFmpeg export uses exact preview caption and remains playable');
 const parity = await page.evaluate(async () => {
   const video=document.querySelector('video[aria-label="Master Video Live Preview"]') as HTMLVideoElement;
   const overlay=document.querySelector('canvas[data-branding-mode]') as HTMLCanvasElement;
   video.pause();
   await new Promise<void>((resolve,reject)=>{
     const timeout=window.setTimeout(()=>reject(new Error('Preview seek timed out')),5000);
     video.addEventListener('seeked',()=>{clearTimeout(timeout);resolve();},{once:true});
     video.currentTime=0.75;
   });
   await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   const composed=document.createElement('canvas');composed.width=overlay.width;composed.height=overlay.height;
   const context=composed.getContext('2d')!;context.drawImage(video,0,0);context.drawImage(overlay,0,0);
   return {preview:composed.toDataURL('image/png'),overlay:overlay.toDataURL('image/png'),width:overlay.width,height:overlay.height};
 });
 const imageBytes=(url:string)=>Buffer.from(url.split(',')[1],'base64');
 fs.writeFileSync(path.join(runDir,'preview-caption.png'),imageBytes(parity.preview));
 fs.writeFileSync(path.join(runDir,'preview-caption-overlay.png'),imageBytes(parity.overlay));
 execFileSync('ffmpeg',['-v','error','-ss','0.75','-i',body.renderedPath,'-frames:v','1','-y',path.join(runDir,'exported-caption.png')],{windowsHide:true});
 const {FFmpegService}=await import('../../server/src/services/ffmpeg.service.js');
 const filter=new FFmpegService().buildWatermarkFilter(request.brandKit,{width:parity.width,height:parity.height,aspectRatio:'9:16',duration:2,sizeBytes:0});
 execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=c=black@0:s=${parity.width}x${parity.height}:r=1:d=1,format=rgba`,'-vf',filter,'-frames:v','1','-y',path.join(runDir,'exported-caption-overlay.png')],{windowsHide:true});
 const referenceBytes=fs.readFileSync(path.join(runDir,'exported-caption-overlay.png'));
 const geometry=await page.evaluate(async({preview,exported})=>{
   const results=[];
   for(const url of [preview,exported]) {
     const img=new Image();img.src=url;await img.decode();
     const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
     const context=canvas.getContext('2d')!;context.drawImage(img,0,0);
     const rgba=context.getImageData(0,0,img.width,img.height).data;
     let minX=img.width,minY=img.height,maxX=-1,maxY=-1,ink=0;
     for(let y=0;y<img.height;y++)for(let x=0;x<img.width;x++)if(rgba[(y*img.width+x)*4+3]){ink++;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
     results.push({minX,minY,maxX,maxY,ink});
   }
   return{preview:results[0],exported:results[1]};
 },{preview:parity.overlay,exported:'data:image/png;base64,'+referenceBytes.toString('base64')});
 assert.ok(geometry.preview.ink>0&&geometry.exported.ink>0);
 for(const key of ['minX','minY','maxX','maxY'] as const)assert.ok(Math.abs(geometry.preview[key]-geometry.exported[key])<=3,`preview/export text ${key} mismatch: ${JSON.stringify(geometry)}`);
 fs.writeFileSync(path.join(runDir,'preview-export-geometry.json'),JSON.stringify(geometry,null,2));
 fs.writeFileSync(path.join(runDir,'preview-export-comparison.html'),`<!doctype html><meta charset="utf-8"><style>body{font:18px Tahoma;background:#eee;padding:24px}.row{display:flex;gap:24px}figure{margin:0}img{width:360px}figcaption{padding:12px}</style><h1>Bottom Caption Only - text-only preview and exported frame</h1><p>Same master, exact custom caption and 0.75-second timestamp. No moving watermark or orange panel.</p><div class="row"><figure><figcaption>Branding Studio live preview</figcaption><img src="preview-caption.png"></figure><figure><figcaption>Final FFmpeg export</figcaption><img src="exported-caption.png"></figure></div>`);
 const parityPage=await browser.newPage({viewport:{width:840,height:850}});
 await parityPage.goto(pathToFileURL(path.join(runDir,'preview-export-comparison.html')).href);
 await parityPage.evaluate(async()=>{await Promise.all(Array.from(document.images).map(img=>img.decode()));});
 await parityPage.screenshot({path:path.join(runDir,'preview-export-comparison.png'),fullPage:true});await parityPage.close();
 ok('Live preview and FFmpeg export match caption geometry within three pixels, with side-by-side visual proof');
 await page.getByRole('button',{name:/Legacy Brand/}).click();
 assert.equal(await page.getByLabel('Account Default Bottom Caption', {exact:true}).inputValue(),'Saved legacy brand');
 assert.equal(await page.getByLabel('Use Per-Video Caption Override', {exact:true}).isChecked(),false);
 assert.equal(await canvas.getAttribute('data-branding-mode'),'moving_and_caption');
 ok('Account switch restores unchanged legacy caption/mode and resets override');
 await page.getByRole('button',{name:/\u0e41\u0e01\u0e49\u0e1a\u0e31\u0e04\u0e22\u0e32\u0e27\u0e46\u0e46/}).click();
 await page.getByLabel('Use Per-Video Caption Override', {exact:true}).check();
 await page.getByLabel('Per-Video Bottom Caption', {exact:true}).fill('Temporary video caption');
 await page.getByLabel('Master Video', {exact:true}).selectOption('landscape');
 assert.equal(await page.getByLabel('Use Per-Video Caption Override', {exact:true}).isChecked(),false);
 ok('Video switch resets per-video override');
 await page.getByRole('radio',{name:'No Watermark',exact:true}).click();
 const noneResponse=page.waitForResponse(r=>r.url().endsWith('/api/branding/render-preview')&&r.request().method()==='POST',{timeout:90000});
 await page.getByRole('button',{name:'Render Preview',exact:true}).click();
 const none=await (await noneResponse).json();
 const downloaded=Buffer.from(await (await fetch(base+none.previewUrl)).arrayBuffer());
 assert.equal(crypto.createHash('sha256').update(downloaded).digest('hex'),before.masters.landscape);
 ok('No Watermark API download is byte-identical to original');
 await page.getByLabel('Master Video', {exact:true}).selectOption('portrait');
 await page.getByText('Historical saved variant',{exact:true}).waitFor();
 assert.equal((await fetch(base+'/uploads/renders/legacy-existing.mp4')).status,200);
 ok('Historical variant remains listed and downloadable');
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(runDir,'mobile.png'),fullPage:true});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
 ok('Mobile studio fits viewport');
 assert.deepEqual(errors,[]); assert.deepEqual(prohibited,[]);
 assert.equal(hash(oldFile),before.old);
 for(const id of ['portrait','landscape'])assert.equal(hash(path.join(uploadsDir,id+'.mp4')),before.masters[id]);
 ok('No page errors, outbound requests, or master/variant changes');
 fs.writeFileSync(path.join(runDir,'result.json'),JSON.stringify({results,before,errors,prohibited},null,2));
 console.log('Browser evidence: '+runDir);
} finally {
 await browser?.close(); server.kill(); fs.writeFileSync(path.join(runDir,'server.log'),logs);
}

}
main().catch(error=>{console.error(error);process.exitCode=1});
