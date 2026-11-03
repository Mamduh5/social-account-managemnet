import {z} from 'zod';
import {AgentStore,stableHash} from './store.js';

const date=z.string().datetime({offset:true});
const publicSource=z.string().url().max(2048).refine(value=>{
  const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.hash&&u.hostname.includes('.')&&!/^(localhost|[\d.]+)$/.test(u.hostname);
},'Use a public HTTPS source without credentials or fragment');
export const findingSchema=z.object({
  topic:z.string().trim().min(1).max(200),summary:z.string().trim().min(1).max(2500),observedAt:date,validUntil:date,
  sources:z.array(z.object({url:publicSource,title:z.string().min(1).max(200),accessedAt:date,publishedAt:date.optional()}).strict()).min(1).max(5),
  uncertainty:z.string().trim().min(1).max(1000),
}).strict();
export const topicKey=(topic:string)=>topic.trim().normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase('th');

/** Compact source intake for supported agent research tools. No scraper, model, or provider polling. */
export class AgentResearch {
  constructor(readonly store:AgentStore,readonly clock:()=>Date=()=>new Date()){}
  save(raw:unknown,accountId?:string){
    const finding=findingSchema.parse(raw),now=this.clock().getTime();
    const observed=Date.parse(finding.observedAt),until=Date.parse(finding.validUntil);
    if(observed>now+60000||until<=observed||until-observed>7*86400000||finding.sources.some(s=>Date.parse(s.accessedAt)>now+60000))throw new Error('Research requires valid observation/source dates and freshness of at most seven days');
    const evidenceKey=(f:z.infer<typeof findingSchema>)=>stableHash({summary:f.summary,uncertainty:f.uncertainty,sources:f.sources.map(s=>({url:s.url,publishedAt:s.publishedAt??null})).sort((a,b)=>a.url.localeCompare(b.url))});
    const existing=this.store.listKnowledge({accountId:accountId??null,resourceId:'research:'+topicKey(finding.topic),limit:5}).find(k=>{
      if(!k.evidence||typeof k.evidence!=='object')return false;
      const {provenance,independentlyVerified,...raw}=k.evidence as Record<string,unknown>;
      const parsed=findingSchema.safeParse(raw);return parsed.success&&evidenceKey(parsed.data)===evidenceKey(finding);
    });
    if(existing)return existing; // A new access timestamp alone is not new evidence or renewed freshness.
    const resourceId='research:'+topicKey(finding.topic),id='finding:'+stableHash({accountId:accountId??null,...finding});
    return this.store.recordKnowledge({id,kind:'observation',accountId,resourceId,text:finding.summary,source:finding.sources.map(s=>s.url).join(' '),evidence:{...finding,provenance:'agent_supplied_sources',independentlyVerified:false}});
  }
  status(topic:string,accountId?:string){
    if(typeof topic!=='string'||!topic.trim()||topic.length>200)throw new Error('Supply a research topic of at most 200 characters');
    const entries=this.store.listKnowledge({accountId:accountId??null,resourceId:'research:'+topicKey(topic),limit:5});
    const findings=entries.map(k=>({id:k.id,summary:k.text,...(k.evidence as Record<string,unknown>),stale:!Number.isFinite(Date.parse((k.evidence as any)?.validUntil))||Date.parse((k.evidence as any).validUntil)<=this.clock().getTime()}));
    return {topic,findings,researchNeeded:!findings.some(f=>!f.stale),networkCalls:0,next:findings.some(f=>!f.stale)?'reuse_saved_sources':'collect_sources_with_supported_agent_tools_then_research_save',notice:'Supplied sources are not independently verified. Small samples do not establish a trend or future performance.'};
  }
}
