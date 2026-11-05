import {stableHash} from './store.js';
import {draftFingerprint} from './scc.js';
type Any=Record<string,any>;
export const publicationFormats=['reel','text','image'] as const;
export const publicationFormat=(row:Any)=>row.content_type==='multi_image'?'image':row.content_type??'reel';
export function publicationTime(value:unknown){return typeof value==='string'?Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value)?value.replace(' ','T')+'Z':value):NaN;}
export function publicationCadence(rows:Any[],policy:Any,now:number){
  const dates=rows.filter(r=>r.status==='published').map(r=>publicationTime(r.published_at)),confirmed24h=dates.filter(d=>d>now-86400000).length;
  const latest=dates.length?Math.max(...dates):null;
  let next=latest===null?now:latest+policy.minimumHours*3600000;
  if(confirmed24h>=policy.maxPer24Hours)next=Math.max(next,dates.filter(d=>d>now-86400000).sort((a,b)=>a-b)[confirmed24h-policy.maxPer24Hours]+86400000);
  return {confirmed24h,lastConfirmedAt:latest!==null&&Number.isFinite(latest)?new Date(latest).toISOString():null,nextEligibleAt:Number.isFinite(next)?new Date(Math.max(now,next)).toISOString():null,unknownDate:dates.some(d=>!Number.isFinite(d)),waiting:next>now};
}
export function relevantReelTags(concept:Any,existing:string,caption=''){
  const tags=existing.trim()?existing.trim().split(/\s+/):[];
  const embedded:string[]=caption.match(/#[\p{L}\p{M}\p{N}_]+/gu)??[];
  const thai=concept.languageStrategy?.captionLanguages?.includes('th')??/[\u0e00-\u0e7f]/.test(caption||concept.title||'');
  const source=String(concept.idea??'').toLowerCase(),specific=source.includes('sponge')?(thai?'#ฟองน้ำ':'#Sponge'):source.includes('donut')||source.includes('doughnut')?'#Donut':source.includes('brass key')?'#TinyKey':source.includes('stamp')?'#TinyStamp':source.includes('watering can')?(thai?'#ต้นอ่อน':'#TinySprout'):null;
  const visual=concept.category==='living_objects';
  const candidates=[specific,...(thai?[visual?'#วัตถุมีชีวิต':'#เรื่องเล่าสั้น','#แอนิเมชันAI','#เรื่องเล่าสั้น']:[visual?'#LivingObjects':'#VisualStory','#AIAnimation','#MicroStory'])].filter(Boolean) as string[];
  for(const tag of candidates){if(new Set([...tags,...embedded]).size>=3)break;if(!tags.includes(tag)&&!embedded.includes(tag))tags.push(tag);}
  if(tags.length+embedded.length>5||tags.some(t=>!/^#[\p{L}\p{M}\p{N}_]+$/u.test(t))||new Set([...tags,...embedded]).size!==tags.length+embedded.length)throw new Error('Review hashtags: at most five relevant unique tags required');
  return tags.join(' ');
}
/** A separate policy-delegated copy decision; the owner's AV review is never rewritten. */
export function publicationCopyMatches(state:Any,draft:Any){const c=state.publicationCopy;return !!c&&c.revision===draft.revision&&c.payloadHash===draftFingerprint(draft)&&c.videoId===state.videoId&&c.variantId===state.variantId&&c.sha256===state.qa?.sha256&&c.variantSha256===state.variantSha256&&c.reviewHash===stableHash(state.ownerReview??state.qa)&&c.qaHash===stableHash(state.qa)&&c.caption===draft.destinations?.[0]?.caption&&c.hashtags===draft.destinations?.[0]?.hashtags&&draft.videoId===c.videoId&&draft.destinations?.length===1&&draft.destinations[0].accountId===c.accountId&&draft.destinations[0].selectedVariantId===c.variantId&&draft.destinations[0].applyBranding===false&&draft.contentType==='reel'&&draft.scheduledAt===null;}
