import {createHash} from 'node:crypto';
type Any=Record<string,any>;
const version='gemini-concept-context.v1';
const bytes=(value:unknown)=>Buffer.byteLength(JSON.stringify(value),'utf8');
const digest=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function excerpt(value:unknown,limit:number){const text=typeof value==='string'?value:'';if(Buffer.byteLength(text)<=limit)return text;let result='';for(const ch of text){if(Buffer.byteLength(result+ch+' [excerpt]')>limit)break;result+=ch;}return result+' [excerpt]';}
export class GeminiContextLimit extends Error {constructor(readonly admission:Any){super('context_limit');}}

/** A model-input view only: never edits the saved task, research, Page rules,
 * language policy or production settings. Non-Gemini callers must not use it. */
export function selectGeminiConceptContext(original:Any,limit:number){
  if(original.task?.payload?.production?.version!=='gemini-concept.v1')throw new Error('Gemini concept context required');
  const view=structuredClone(original),payload=view.task.payload,feedback=payload.creatorLearning?.localFeedback??[];
  const rawBytes=bytes(original),sourcePayloadHash=digest(original.task.payload);
  // Cached concept feedback already carries these observations. The generic
  // newest-memory tail otherwise repeats QA prose and grows after task creation.
  view.knowledge=(view.knowledge??[]).filter((k:Any)=>!feedback.some((f:Any)=>typeof f.text==='string'&&f.text.length>40&&(k.text===f.text||k.text?.startsWith(f.text)||f.text.startsWith(k.text))));
  const duplicateKnowledgeRemoved=(original.knowledge?.length??0)-view.knowledge.length;
  const result=(profile:string)=>{const text=JSON.stringify(view);return {text,admission:{version,profile,sourcePayloadHash,rawBytes,selectedBytes:Buffer.byteLength(text),limit,duplicateKnowledgeRemoved,status:'ready'}};};
  if(bytes(view)<=limit)return result('deduplicated_feedback');

  if(payload.production.editorialPolicy==='page-reel-editorial.v1'){
    // Sourced concepts need Page identity/rules/voice, not account registration
    // aliases or renderer settings. Full administrative originals stay saved.
    const context=payload.pageContext;if(context){for(const key of ['brandKit','contextFingerprint','notice'])delete context[key];if(context.account)context.account=Object.fromEntries(['id','name','graphId','identityVerifiedAt'].filter(k=>context.account[k]!==undefined).map(k=>[k,context.account[k]]));}
    const facts=payload.sourceFacts;
    if(Array.isArray(facts)&&facts.length>1&&facts.every((f:Any)=>typeof f.evidence==='string')){
      const common:Any={};for(const key of ['accountId','graphId','sourceUrl','sourceDate','observedAt','validUntil','method','independentlyVerified','notice'])if(facts[0][key]!==undefined&&facts.every((f:Any)=>JSON.stringify(f[key])===JSON.stringify(facts[0][key]))){common[key]=facts[0][key];for(const f of facts)delete f[key];}
      const strings=facts.map((f:Any)=>Array.from(f.evidence) as string[]);let prefixLength=0;while(prefixLength<strings[0].length&&strings.every((s:string[])=>s[prefixLength]===strings[0][prefixLength]))prefixLength++;
      const prefix=strings[0].slice(0,prefixLength).join(''),rests=strings.map((s:string[])=>s.slice(prefixLength));let suffixLength=0;while(suffixLength<rests[0].length&&rests.every((s:string[])=>s[s.length-1-suffixLength]===rests[0][rests[0].length-1-suffixLength]))suffixLength++;
      const suffix=suffixLength?rests[0].slice(-suffixLength).join(''):'';facts.forEach((f:Any,i:number)=>{f.evidence=rests[i].slice(0,rests[i].length-suffixLength).join('');});
      payload.sourceFactsCommon=common;payload.sourceEvidenceCommon={prefix,suffix};
      const restored=facts.map((f:Any)=>({...common,...f,evidence:prefix+f.evidence+suffix}));if(restored.some((f:Any,i:number)=>Object.keys(original.task.payload.sourceFacts[i]).some(k=>JSON.stringify(f[k])!==JSON.stringify(original.task.payload.sourceFacts[i][k]))))throw Error('Concept source reconstruction differs');
    }
    payload.pageContextSelection={notice:'Page identity, rules, voice and editorial constraints retained. Registration aliases and renderer metadata omitted; full originals remain in the saved task. Facts inherit sourceFactsCommon; exact FULL evidence = sourceEvidenceCommon.prefix + fact.evidence + sourceEvidenceCommon.suffix. No source claims or provenance are omitted.'};
    if(bytes(view)>limit&&Array.isArray(payload.previous))payload.previous=payload.previous.map((x:Any)=>typeof x.idea==='string'?{...x,idea:excerpt(x.idea,256)}:x);
    if(bytes(view)<=limit)return result('page_sources_and_identity');
  }

  // Long-running histories are selected by section, not truncated as raw JSON.
  // Exact identity, Page rules/voice, requirements and all model instructions
  // stay intact. Recent titles remain an originality fence even at tight limits.
  const recent=(payload.avoidRepeating??[]).slice(-8);
  payload.avoidRepeating=recent.map((x:Any)=>({title:x.title,idea:excerpt(x.idea,256)}));
  view.knowledge=view.knowledge.slice(0,2).map((k:Any)=>({...k,text:excerpt(k.text,320)}));
  const learning=payload.creatorLearning;
  if(learning){
    learning.external=(learning.external??[]).slice(0,1).map((f:Any)=>({...f,limitations:excerpt(f.limitations,480),principles:(f.principles??[]).slice(0,4).map((p:Any)=>({...p,text:excerpt(p.text,320)})),examples:(f.examples??[]).slice(0,4).map((e:Any)=>({id:e.id,url:typeof e.url==='string'&&Buffer.byteLength(e.url)<=1024?e.url:null,...(typeof e.url==='string'&&Buffer.byteLength(e.url)>1024?{urlOmitted:true,urlHash:digest(e.url)}:{}),inspection:e.inspection,performance:e.performance,comparison:excerpt(e.comparison,160),limitations:excerpt(e.limitations,160),...(e.languageObservation?{languageObservation:e.languageObservation}:{} )}))}));
    learning.historicalHypotheses=(learning.historicalHypotheses??[]).slice(0,1).map((f:Any)=>({...f,principles:(f.principles??[]).slice(0,2).map((p:Any)=>({...p,text:excerpt(p.text,200)}))}));
    learning.localFeedback=feedback.slice(0,3).map((f:Any)=>({...f,text:excerpt(f.text,320)}));
  }
  payload.research=(payload.research??[]).slice(0,2).map((r:Any)=>({...r,summary:excerpt(r.summary,480)}));
  payload.contextSelection={version,notice:'Bounded excerpts; full originals remain in the saved task/research. Omitted evidence is unavailable, never inferred. Verification, uncertainty and language rules remain authoritative.'};
  if(bytes(view)<=limit)return result('bounded_optional_sections');
  // Drop optional examples/research as whole records, retaining finding IDs,
  // dates, provenance, verification flags, reusable principles and limitations.
  payload.research=[];view.knowledge=[];
  if(learning){learning.historicalHypotheses=[];learning.localFeedback=[];for(const f of learning.external){f.exampleReferences=f.examples.map((e:Any)=>({id:e.id,url:e.url,inspection:e.inspection,performance:e.performance}));delete f.examples;}}
  if(bytes(view)<=limit)return result('principles_and_originality');
  payload.avoidRepeating=recent.map((x:Any)=>({title:x.title}));
  if(bytes(view)<=limit)return result('recent_titles_and_principles');
  if(payload.production.editorialPolicy==='page-reel-editorial.v1'&&Array.isArray(payload.previous)){
    // Optional older action/payoff prose can grow in Thai UTF-8 even with few
    // records. Keep every title; source facts, Page rules and instructions stay exact.
    payload.previous=payload.previous.map((x:Any)=>({...x,idea:excerpt(x.idea,160),payoff:excerpt(x.payoff,128)}));
    if(bytes(view)<=limit)return result('page_recent_action_excerpts');
    payload.previous=payload.previous.map((x:Any)=>({title:x.title}));
    if(bytes(view)<=limit)return result('page_recent_titles');
  }
  // Mandatory or irreducible source context is held, not silently weakened.
  throw new GeminiContextLimit({version,profile:'mandatory_context_hold',sourcePayloadHash,rawBytes,selectedBytes:bytes(view),limit,duplicateKnowledgeRemoved,status:'context_limit'});
}
