import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,readFile,writeFile,rename,unlink,stat} from 'node:fs/promises';
import path from 'node:path';
import {runProcess,type ProcessRunner} from './executors.js';
import {loopbackOrigin} from './http.js';

const version='gemini-technical-qa.v1';
export async function fileSha256(file:string){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
export function pcmEvidence(bytes:Buffer){
  if(!bytes.length||bytes.length%4)throw new Error('Invalid decoded PCM');
  let squares=0,peak=0,sum=0,nonfinite=0,clipped=0,active=0,crossings=0,prior=0;
  for(let i=0;i<bytes.length;i+=4){const x=bytes.readFloatLE(i);if(!Number.isFinite(x)){nonfinite++;continue;}const a=Math.abs(x);squares+=x*x;sum+=x;peak=Math.max(peak,a);if(a>=1)clipped++;if(a>1e-4)active++;if(i&&((prior<0&&x>=0)||(prior>=0&&x<0)))crossings++;prior=x;}
  const samples=bytes.length/4,rms=Math.sqrt(squares/samples),warnings:string[]=[];
  if(!active)warnings.push('digital_silence');else if(rms<0.001)warnings.push('quiet_audio');
  if(clipped)warnings.push('decoded_full_scale_samples');if(Math.abs(sum/samples)>0.01)warnings.push('dc_offset');if(nonfinite)warnings.push('nonfinite_audio');
  return {samples,pcmSha256:createHash('sha256').update(bytes).digest('hex'),sampleRate:48000,channels:2,format:'f32le',peakDbfs:peak?20*Math.log10(peak):null,rmsDbfs:rms?20*Math.log10(rms):null,dcMean:sum/samples,nonfiniteSamples:nonfinite,fullScaleSamples:clipped,activeFraction:active/samples,zeroCrossingFraction:crossings/samples,warnings,listeningAccepted:false,notice:'Signal measurements do not establish perceptual sound quality, intended effects or speech content. Full-scale AAC samples alone do not prove audible distortion.'};
}

/** Gemini-only read-only media analysis. Branding remains SCC's existing service. */
export class GeminiMediaQa {
  constructor(readonly directory:string,readonly process:ProcessRunner=runProcess,readonly fetcher:typeof fetch=fetch,readonly clock:()=>Date=()=>new Date()){}
  async reviewEvidence(master:Record<string,any>,variant:Record<string,any>,branding:Record<string,any>){return (await import('./page-reel-review-evidence.js')).pageReviewEvidence(master,variant,branding,this.process);}
  async inspect(origin:string,media:Record<string,any>,maxBytes:number){
    return this.inspectFile(origin,media,maxBytes,false);
  }
  async inspectVariant(origin:string,media:Record<string,any>,variant:Record<string,any>,maxBytes:number){
    return this.inspectFile(origin,{...media,id:variant.id,file_size:variant.file_size,streamUrl:variant.downloadUrl,provenance:{sha256:variant.sha256}},maxBytes,true);
  }
  async verifySource(origin:string,media:Record<string,any>,maxBytes:number,variant?:Record<string,any>){
    const item=variant?{...variant,streamUrl:variant.downloadUrl,provenance:{sha256:variant.sha256}}:media;
    const base=loopbackOrigin(origin),url=new URL(item.streamUrl,base),decoded=decodeURIComponent(url.pathname);
    if(url.origin!==base||url.search||url.hash||url.username||url.password||decoded.includes('\\')||decoded.split('/').includes('..')||!decoded.startsWith(variant?'/uploads/renders/':'/uploads/')||(!variant&&decoded.startsWith('/uploads/renders/'))||!decoded.endsWith('.mp4'))throw new Error('Invalid reviewed media URL');
    const facts=await new (await import('./http.js')).JsonClient(base,{fetch:this.fetcher,timeoutMs:60000}).media(url.pathname,maxBytes);
    if(facts.sha256!==item.provenance.sha256||facts.bytes!==item.file_size)throw new Error('Reviewed source integrity differs');return facts;
  }
  private async inspectFile(origin:string,media:Record<string,any>,maxBytes:number,isVariant:boolean){
    const sha=media.provenance?.sha256,id=media.id;
    if(!/^[a-f0-9]{64}$/.test(sha??'')||!/^[A-Za-z0-9_-]{1,150}$/.test(id??'')||!Number.isSafeInteger(media.file_size)||media.file_size<1||media.file_size>maxBytes)throw new Error('Unverified or oversized Gemini master');
    const root=path.resolve(this.directory,...(isVariant?['variants',sha]:[sha])),master=path.join(root,'master.mp4'),report=path.join(root,'report.json'),sheet=path.join(root,'contact.jpg');await mkdir(root,{recursive:true});
    const existing=await readFile(report,'utf8').catch(()=>null);
    if(existing){const r=JSON.parse(existing);if(r.version!==version||r.sha256!==sha||r.videoId!==id||await fileSha256(master)!==sha||await fileSha256(sheet)!==r.contactSheet.sha256)throw new Error('Cached QA evidence differs');return r;}
    if(await stat(master).catch(()=>null)){if(await fileSha256(master)!==sha)throw new Error('Cached master integrity differs');}
    else {
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000),temporary=master+'.partial-'+randomUUID();
      try{
        const base=loopbackOrigin(origin),resource=media.streamUrl??'/api/publishing/videos/'+encodeURIComponent(id)+'/stream',url=new URL(resource,base),decoded=decodeURIComponent(url.pathname);
        if(url.origin!==base||url.username||url.password||url.search||url.hash||decoded.includes('\\')||decoded.split('/').includes('..')||(media.streamUrl&&(!decoded.startsWith(isVariant?'/uploads/renders/':'/uploads/')||(!isVariant&&decoded.startsWith('/uploads/renders/'))||!decoded.endsWith('.mp4'))))throw new Error('Invalid master stream URL');
        const response=await this.fetcher(url,{redirect:'error',signal:controller.signal});
        if(!response.ok||!response.body)throw new Error('Master stream unavailable: HTTP '+response.status);
        if(Number(response.headers.get('content-length'))>maxBytes)throw new Error('Master stream oversized');
        const parts:Buffer[]=[];let size=0;for await(const part of response.body as any){size+=part.length;if(size>maxBytes)throw new Error('Master stream exceeded byte limit');parts.push(Buffer.from(part));}
        const bytes=Buffer.concat(parts);if(size!==media.file_size||createHash('sha256').update(bytes).digest('hex')!==sha)throw new Error('Stream differs from immutable master');
        await writeFile(temporary,bytes,{flag:'wx'});await rename(temporary,master);
      }finally{clearTimeout(timer);await unlink(temporary).catch(()=>{});}
    }
    const run=async(command:string,args:string[])=>{const r=await this.process(command,args,{cwd:root,timeoutMs:60000,maxBytes:512*1024});if(r.code!==0)throw new Error('Technical tool failed: '+command);return r.stdout;};
    const probe=JSON.parse(await run('ffprobe',['-v','error','-show_streams','-show_format','-of','json',master]));
    const video=probe.streams?.find((s:any)=>s.codec_type==='video'),audio=probe.streams?.find((s:any)=>s.codec_type==='audio');
    const duration=Number(video?.duration??probe.format?.duration),geometry=Number(video?.width)*16===Number(video?.height)*9;
    if(!video||!audio||!Number.isFinite(duration)||duration<9.85||duration>10.15||!geometry)throw new Error('Gemini clip contract failed: video/audio, duration or portrait geometry');
    await run('ffmpeg',['-v','error','-xerror','-i',master,'-map','0:v:0','-map','0:a:0','-f','null','-']);
    const pcm=path.join(root,'audio.f32le');await run('ffmpeg',['-v','error','-y','-i',master,'-t','10.2','-map','0:a:0','-ac','2','-ar','48000','-c:a','pcm_f32le','-f','f32le',pcm]);
    const samples=await readFile(pcm);if(samples.length>5*1024*1024)throw new Error('PCM analysis exceeded bound');const sound=pcmEvidence(samples);await unlink(pcm);
    await run('ffmpeg',['-v','error','-y','-i',master,'-vf','fps=2,scale=180:320,tile=5x4','-frames:v','1','-update','1',sheet]);
    if(await fileSha256(master)!==sha)throw new Error('QA source changed');
    const result={version,videoId:id,sha256:sha,bytes:media.file_size,analyzedAt:this.clock().toISOString(),technicalPass:sound.nonfiniteSamples===0,fullDecode:true,duration,width:video.width,height:video.height,videoCodec:video.codec_name,audioCodec:audio.codec_name,audio:sound,contactSheet:{path:sheet,sha256:await fileSha256(sheet),sampleFps:2,maxSamples:20},artifactBytes:media.file_size+(await stat(sheet)).size,masterPath:master,visualAccepted:false,creativeAccepted:false,limitations:'Twenty ordered visual samples are prepared for review. No machine listening or creative acceptance is claimed.'};
    await writeFile(report+'.new',JSON.stringify(result));await rename(report+'.new',report);return result;
  }
}

export function candidateCopy(concept:Record<string,any>){
  if(concept.version==='gemini-page-concept.v1')return {language:concept.languageStrategy.captionLanguages[0],caption:concept.caption,hashtags:concept.hashtags,basis:'sourced_Page_illustration_pending_actual_owner_review',notice:'Illustrative concept copy; not actual application/event footage. Owner factual/creative/listening approval is required.'};
  const language=concept.languageStrategy?.captionLanguages?.[0]??'en';
  const captions:Record<string,string>={en:'A small moment of imagination.\nAI-generated fiction.',th:'เรื่องเล็ก ๆ ในโลกจินตนาการ\nเรื่องสมมติสร้างด้วย AI',ja:'小さな空想のひととき。\nAIで制作したフィクションです。',es:'Un pequeño momento de imaginación.\nFicción creada con IA.',pt:'Um pequeno momento de imaginação.\nFicção criada com IA.',zh:'小小的想象时刻。\nAI创作的虚构故事。'};
  const traditional=language.split('-')[0]==='zh'&&(/(?:^|-)hant(?:-|$)/i.test(language)||/^zh-(TW|HK|MO)(?:-|$)/i.test(language));
  return {language,caption:traditional?'小小的想像時刻。\nAI創作的虛構故事。':captions[language.split('-')[0]]??null,hashtags:'',basis:concept.languageStrategy?'concept_audience_and_language':'international_visual_audience_hypothesis',notice:'Content-independent fiction disclosure, pending actual visual/listening and copy review. No performance optimization is claimed.'};
}
