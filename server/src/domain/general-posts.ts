import {z} from 'zod';
import {isIP} from 'node:net';
export const postTypes=['text','image','multi_image','link','reel'] as const;
export type ContentType=typeof postTypes[number];
export function publicLink(value:string):string {
  let url:URL; try {url=new URL(value);} catch {throw new Error('Enter a valid public HTTP(S) link');}
  const host=url.hostname.toLowerCase().replace(/\.$/,'');
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||!host.includes('.')||isIP(host)||isIP(host.replace(/^\[|\]$/g,''))||host==='localhost'||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host)) throw new Error('Link must use a public HTTP(S) hostname without credentials');
  return url.toString();
}
const destination=z.object({accountId:z.string().min(1).max(100),caption:z.string().max(60000).default(''),hashtags:z.string().max(2000).default(''),linkUrl:z.string().max(2048).optional(),attachments:z.array(z.object({mediaId:z.string().min(1).max(100),altText:z.string().max(1000).default('')})).max(10).default([]),selectedVariantId:z.string().nullable().optional(),applyBranding:z.boolean().optional()});
export const draftInput=z.object({title:z.string().trim().min(1).max(300),contentType:z.enum(postTypes),assistantSource:z.object({draftId:z.string().min(1).max(100),revision:z.number().int().positive()}).optional(),videoId:z.string().optional(),scheduledAt:z.string().nullable().optional(),destinations:z.array(destination).min(1).max(50)});
export type DraftInput=z.infer<typeof draftInput>;
export function normalizeDraft(raw:unknown):DraftInput {
  const data=draftInput.parse(raw);
  if(new Set(data.destinations.map(d=>d.accountId)).size!==data.destinations.length) throw new Error('Select each destination only once');
  if(data.scheduledAt) {
    if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(data.scheduledAt)||!Number.isFinite(Date.parse(data.scheduledAt))) throw new Error('Scheduled time needs an explicit timezone');
    data.scheduledAt=new Date(data.scheduledAt).toISOString();
  } else data.scheduledAt=null;
  if(data.contentType==='reel'&&!data.videoId) throw new Error('Select a video for a Reel');
  if(data.contentType!=='reel') delete data.videoId;
  for(const d of data.destinations) {
    const count=d.attachments.length;
    if((data.contentType==='image'&&count!==1)||(data.contentType==='multi_image'&&(count<2||count>10))||(!['image','multi_image'].includes(data.contentType)&&count)) throw new Error('Attachments do not match the selected post type');
    if(new Set(d.attachments.map(a=>a.mediaId)).size!==count) throw new Error('An image may appear only once per destination');
    if(data.contentType==='link') {if(!d.linkUrl) throw new Error('A link is required');d.linkUrl=publicLink(d.linkUrl);} else delete d.linkUrl;
    if(data.contentType==='text'&&!d.caption.trim()) throw new Error('Text posts require text');
    if(data.contentType!=='reel') {delete d.selectedVariantId;d.applyBranding=false;}
  }
  return data;
}
