import type {AgentJob} from './store.js';

/** Slots and retained bytes are independent. Archival never frees media storage. */
export function productionInventory(jobs:AgentJob[],config:{maxBacklogItems:number;maxBacklogBytes:number;reservationBytes:number}){
  const retained=jobs.filter(j=>j.state.terminalArchive||j.state.phase==='archived'||j.state.phase!=='published'&&(j.state.phase!=='failed'||!!j.state.media));
  const archived=retained.filter(j=>!!j.state.terminalArchive||j.state.phase==='archived');
  const active=retained.filter(j=>!j.state.terminalArchive&&j.state.phase!=='archived');
  const bytesOf=(j:AgentJob)=>{
    const s=j.state as Record<string,any>,values=[s.media?.bytes??(s.terminalArchive||s.phase==='archived'?config.maxBacklogBytes:['queued','planning','generating','recovering'].includes(String(s.phase))?config.reservationBytes:0),s.technicalQa?.artifactBytes??0,s.ownerVariantQa?.artifactBytes??0,s.candidateVariantBytes??0];
    return values.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)?values.reduce((a,b)=>a+b,0):config.maxBacklogBytes;
  };
  const bytes=retained.reduce((n,j)=>n+bytesOf(j),0);
  return {items:active.length,archivedItems:archived.length,bytes,archivedBytes:archived.reduce((n,j)=>n+bytesOf(j),0),full:active.length>=config.maxBacklogItems||bytes+config.reservationBytes>config.maxBacklogBytes};
}
