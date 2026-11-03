import {z} from 'zod';
import {findingSchema} from './research.js';

// Shared across executors. No destination, approval, schedule or tool commands in model output.
export const contentResultSchema=z.object({
  version:z.literal('agent-content-result.v1'),
  content:z.object({title:z.string().trim().min(1).max(300),text:z.string().trim().min(1).max(12000),hashtags:z.string().max(2000)}).strict(),
  research:z.object({topic:z.string().min(1).max(160),summary:z.string().min(1).max(1600),observedAt:z.string().datetime({offset:true}),validUntil:z.string().datetime({offset:true}),sources:z.array(z.object({url:z.string().url(),title:z.string().min(1).max(200),accessedAt:z.string().datetime({offset:true})}).strict()).min(2).max(3),uncertainty:z.string().min(1).max(800)}).strict(),
  interpretations:z.array(z.string().min(1).max(500)).max(3),
  creativeDecision:z.string().min(1).max(800),handoff:z.string().min(1).max(800),
}).strict();
export type ContentResult=z.infer<typeof contentResultSchema>;
export function validateContentResult(raw:unknown):ContentResult {
  const parsed=contentResultSchema.safeParse(raw);
  if(!parsed.success)throw new Error('content_validation: '+parsed.error.issues.map(i=>i.path.join('.')+': '+i.message).join('; '));
  if(parsed.data.content.text.includes(String.fromCharCode(92)+'n'))throw new Error('content_validation: content.text contains literal backslash-n; encode line breaks once');
  findingSchema.parse(parsed.data.research);
  const now=Date.now(),finding=parsed.data.research,observed=Date.parse(finding.observedAt),until=Date.parse(finding.validUntil);
  if(observed>now+60000||until<=now||until<=observed||until-observed>7*86400000||finding.sources.some(source=>Date.parse(source.accessedAt)>now+60000))throw new Error("content_validation: research dates must be current, not future, and fresh for at most seven days");
  return parsed.data;
}
export function contentOutputSchema(){return z.toJSONSchema(contentResultSchema);}
