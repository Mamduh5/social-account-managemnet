import React from 'react';
import {Button} from '../common/Button';
const at=(value:string|null)=>{if(!value)return 'Unknown';const n=Date.parse(value);return Number.isFinite(n)?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Bangkok',dateStyle:'medium',timeStyle:'medium'}).format(n):'Unknown';};
export function PublicationStreams({streams,error,busy,onControl}:{streams:any[];error:string;busy:boolean;onControl:(stream:any,action:'pause'|'resume')=>void}){
  return <section className="rounded-xl border border-border p-4 text-sm space-y-4" aria-label="Independent publication streams"><h3 className="font-semibold">Publication streams · Asia/Bangkok</h3>{error&&<p role="alert">Publication status unavailable: {error}. Values are unknown until refreshed.</p>}
    {streams.map(s=><article key={s.contentType} aria-label={s.contentType==='reel'?'Reel publication status':undefined} className="space-y-2 border-t border-border pt-3">
      <h4 className="font-semibold">{s.contentType==='reel'?'Reels':s.contentType==='text'?'Text only':'Text + image'}: {s.expired?'Expired':s.enabled?'Enabled':s.paused?'Paused':'Disabled'}</h4>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-3">{[['Published today (Bangkok)',s.publishedToday],['Rolling previous 24 hours',s.confirmed24h],['Protected publication slots',s.protectedSlots],['Remaining rolling allowance',s.remaining24h],['Approved videos waiting',s.approvedWaiting],['Queued',s.queued?.length],['Uncertain',s.uncertain?.length]].map(([label,value])=><div key={String(label)}><dt className="text-xs text-slate-400">{label}</dt><dd>{error?'Unknown':value??'Unknown'}</dd></div>)}</dl>
      <p>Maximum {s.maxPer24Hours??'Not configured'} per rolling 24h · Minimum interval {s.minimumHours?`${s.minimumHours} hours`:'Not configured'}</p>
      {s.contentType==='reel'&&<><p>Last confirmed: {at(s.lastConfirmedAt)}</p><p>Next eligible publication: {error?'Unknown':at(s.nextEligibleAt)}</p><p className="text-xs text-slate-400">Calendar-day totals differ from the rolling cap. A confirmed Reel leaves that cap exactly 24 hours later. Eligibility remains subject to review, original-operation and policy checks.</p>
        {s.policyId&&<div className="flex flex-wrap items-center gap-3"><span>Page {s.policy?.graphId} · {s.policy?.expiresAt?`Expires ${at(s.policy.expiresAt)}`:'Until paused or revoked'}</span><Button disabled={busy} onClick={()=>onControl(s,s.enabled?'pause':'resume')}>{s.enabled?'Pause Reel publishing':'Resume Reel publishing'}</Button></div>}
        <p>Publication blocker: {error?'Status unavailable':s.hold??(s.pending?.length?'Original publication pending':s.expired?'Policy expired':s.paused?'Policy paused':!s.enabled?'Policy disabled':!s.historyComplete?'Publication history unavailable':s.approvedWaiting===null?'Review readiness unavailable':!s.approvedWaiting?'No approved videos waiting':s.nextEligibleAt&&Date.parse(s.nextEligibleAt)>Date.now()?'Waiting for publication interval':'None observed')}</p>{s.lastError&&<p className="text-honey-400">{s.lastError.code}{s.lastError.message?`: ${s.lastError.message}`:''}</p>}
        {s.readyHolds?.map((h:any)=><p key={h.itemId}>{h.title}: {String(h.reason).replaceAll('_',' ')}</p>)}
        {s.pending?.map((p:any)=><p key={p.postId??p.id} className="break-all">{p.uncertain?'Uncertain original':'Queued original'}: {p.postId??p.id} · {p.status}{p.error?` · ${p.error}`:''}</p>)}
        {!!s.receipts?.length&&<ul className="space-y-1">{s.receipts.map((r:any)=><li key={r.postId}><a href={r.permalink} target="_blank" rel="noreferrer" className="underline">Facebook Reel {r.postId}</a> · {at(r.publishedAt)}</li>)}</ul>}
      </>}
      <p className="text-xs text-slate-400">As of {at(s.asOf)}. {s.contentType!=='reel'?'Independent stream; recurring publication remains disabled.':''}</p>
    </article>)}
  </section>;
}
