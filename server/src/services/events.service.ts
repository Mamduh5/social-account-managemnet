import { Response } from 'express';
import {randomUUID} from 'node:crypto';

interface Client {
  id: string;
  res: Response;
}

export interface ResourceEventMetadata {version:1;id:string;occurredAt:string;resumeSupported:false;}

export class EventService {
  private clients: Client[] = [];
  private heartbeat: NodeJS.Timeout | null = null;
  private sequence=0;
  private instance=randomUUID();
  constructor(private heartbeatMs=20000) {}

  private write(client:Client,payload:string) {
    try {
      // Do not accumulate an unbounded application buffer for a slow tab.
      // EventSource reconnects and the client resynchronizes authoritative HTTP state.
      if (client.res.destroyed || !client.res.write(payload)) {this.removeClient(client.id);client.res.end();}
    } catch {this.removeClient(client.id);try{client.res.end();}catch{}}
  }

  addClient(id: string, res: Response) {
    const client={id,res};this.clients.push(client);
    this.write(client,`retry: 1500\ndata: ${JSON.stringify({type:'connected',id,resyncRequired:true,resumeSupported:false})}\n\n`);
    if (!this.heartbeat && this.clients.length) {
      this.heartbeat=setInterval(()=>{for(const current of [...this.clients])this.write(current,': heartbeat\n\n');},this.heartbeatMs);
      this.heartbeat.unref();
    }
  }

  removeClient(id: string) {
    this.clients = this.clients.filter((c) => c.id !== id);
    if(!this.clients.length && this.heartbeat){clearInterval(this.heartbeat);this.heartbeat=null;}
  }

  closeAll(){if(this.heartbeat){clearInterval(this.heartbeat);this.heartbeat=null;}for(const client of this.clients){try{client.res.end();}catch{}}this.clients=[];}

  broadcast(event: string, data: any) {
    if(!/^[a-zA-Z0-9:_-]+$/.test(event))throw new Error('Invalid resource event name');
    const metadata:ResourceEventMetadata={version:1,id:`${this.instance}:${++this.sequence}`,occurredAt:new Date().toISOString(),resumeSupported:false};
    const body=data && typeof data==='object' && !Array.isArray(data)?{...data,_event:metadata}:{value:data,_event:metadata};
    const payload=`id: ${metadata.id}\nevent: ${event}\ndata: ${JSON.stringify(body)}\n\n`;
    for(const client of [...this.clients])this.write(client,payload);
  }
}

export const eventService = new EventService();
export const eventsService = eventService;
