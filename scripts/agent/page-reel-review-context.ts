import {stableHash} from './store.js';
type Any=Record<string,any>;
export class PageReviewContextLimit extends Error {constructor(readonly admission:Any){super('context_limit');}}
/** Lossless model-input factoring only; saved tasks, scope hashes and QA decisions never change. */
export function selectPageReviewContext(original:Any,limit:number){
 if(original.task?.kind!=='review_video'||original.task?.payload?.pageReelReview?.version!=='page-reel-machine-review.v1')throw new Error('Exact Page Reel review context required');
 const size=(x:unknown)=>Buffer.byteLength(JSON.stringify(x),'utf8'),rawBytes=size(original),sourcePayloadHash=stableHash(original.task.payload);
 const admission=(profile:string,selectedBytes:number)=>({version:'page-reel-review-context.v1',profile,sourcePayloadHash,rawBytes,selectedBytes,limit,status:selectedBytes<=limit?'ready':'context_limit'});
 if(rawBytes<=limit)return {text:JSON.stringify(original),admission:admission('unchanged',rawBytes)};
 const view=structuredClone(original),p=view.task.payload.pageReelReview,references:Any={};
 for(const key of ['caption','hashtags','editorial'])if(p.concept?.[key]!==undefined&&p[key]!==undefined&&stableHash(p.concept[key])===stableHash(p[key])){delete p.concept[key];references['concept.'+key]=key;}
 const facts=p.sourceFacts;
 if(Array.isArray(facts)&&facts.length>1&&facts.every((f:Any)=>typeof f.evidence==='string')){
  const common:Any={};for(const key of ['accountId','graphId','sourceUrl','sourceDate','observedAt','validUntil','method','independentlyVerified'])if(facts[0][key]!==undefined&&facts.every((f:Any)=>stableHash(f[key])===stableHash(facts[0][key]))){common[key]=facts[0][key];for(const f of facts)delete f[key];}
  const strings=facts.map((f:Any)=>Array.from(f.evidence) as string[]);let prefixLength=0;
  while(prefixLength<strings[0].length&&strings.every((s:string[])=>s[prefixLength]===strings[0][prefixLength]))prefixLength++;
  const prefix=strings[0].slice(0,prefixLength).join(''),rests=strings.map((s:string[])=>s.slice(prefixLength));let suffixLength=0;
  while(suffixLength<rests[0].length&&rests.every((s:string[])=>s[s.length-1-suffixLength]===rests[0][rests[0].length-1-suffixLength]))suffixLength++;
  const suffix=suffixLength?rests[0].slice(-suffixLength).join(''):'';
  facts.forEach((f:Any,i:number)=>{f.evidence=rests[i].slice(0,rests[i].length-suffixLength).join('');});
  p.sourceFactsCommon=common;p.sourceEvidenceCommon={prefix,suffix};
  references.sourceFacts='Each fact inherits sourceFactsCommon fields. Its FULL evidence is sourceEvidenceCommon.prefix + fact.evidence + sourceEvidenceCommon.suffix. Literal lossless shared text, not excerpts; verification and uncertainty are unchanged.';
  const reconstructed=facts.map((f:Any)=>({...common,...f,evidence:prefix+f.evidence+suffix}));if(stableHash(reconstructed)!==stableHash(original.task.payload.pageReelReview.sourceFacts))throw new Error('Source evidence reconstruction differs');
 }
 p.modelInputReferences=references;
 const selectedBytes=size(view);if(selectedBytes>limit)throw new PageReviewContextLimit(admission('mandatory_context_hold',selectedBytes));
 return {text:JSON.stringify(view),admission:admission('lossless_duplicate_factoring',selectedBytes)};
}
