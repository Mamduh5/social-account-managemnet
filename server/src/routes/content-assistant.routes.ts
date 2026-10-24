import {contentWorkspaceRepo as workspaceReadiness} from '../repositories/content-workspace.repo.js';
import { Router } from 'express';
import { contentAssistantService as service } from '../services/content-assistant.service.js';
import { contentWorkspaceRepo as repo } from '../repositories/content-workspace.repo.js';

export const assistantRouter=Router();
assistantRouter.use((_req,res,next)=>{if(!workspaceReadiness.ready())return res.status(503).json({error:'V1.10 requires the explicit offline maintenance migration'});next();});
const sync=(fn:(req:any)=>any)=>(req:any,res:any)=>{try {res.json({success:true,...fn(req)});}catch(error:any){res.status(400).json({error:error.message});}};
assistantRouter.get('/status',sync(()=>service.status()));
assistantRouter.get('/profiles/:accountId',sync(req=>service.profile(req.params.accountId)));
assistantRouter.put('/profiles/:accountId',sync(req=>service.saveProfile(req.params.accountId,req.body)));
assistantRouter.get('/drafts',sync(req=>({drafts:repo.drafts(typeof req.query.accountId==='string'?req.query.accountId:undefined)})));
assistantRouter.post('/drafts',sync(req=>({draft:service.manual(req.body)})));
assistantRouter.put('/drafts/:id',sync(req=>({draft:service.edit(req.params.id,req.body)})));
assistantRouter.post('/drafts/:id/approve',sync(req=>({draft:service.review(req.params.id,req.body)})));
assistantRouter.post('/drafts/:id/reject',sync(req=>({draft:service.review(req.params.id,req.body,false)})));
assistantRouter.post('/drafts/batch-approve',sync(req=>({drafts:service.batchApprove(req.body.items)})));
assistantRouter.post('/drafts/:id/export-approved',sync(req=>service.exportApproved(req.params.id,Number(req.body.revision),req.body.accountId)));
assistantRouter.post('/drafts/:id/reviewed-text',sync(req=>service.approvedText(req.params.id,Number(req.body.revision),req.body.accountId)));
assistantRouter.get('/drafts/:id/audit',sync(req=>({audit:repo.auditTrail(req.params.id)})));
assistantRouter.post('/generate',async(req,res)=>{try {res.json({success:true,draft:await service.generate(req.body)});}catch(error:any){res.status(400).json({error:error.message});}});
assistantRouter.post('/generate-batch',async(req,res)=>{try {res.json({success:true,drafts:await service.batch(req.body.requests)});}catch(error:any){res.status(400).json({error:error.message});}});
assistantRouter.put('/limits',sync(req=>{
  const b=Number(req.body.maxBatchSize),d=Number(req.body.dailyDraftLimit);
  if (typeof req.body.paused!=='boolean' || !Number.isInteger(b) || b<1 || b>20 || !Number.isInteger(d) || d<1 || d>500) throw new Error('Limits require paused, batch size 1–20, and daily draft limit 1–500');
  return {limits:repo.updateLimits(req.body.paused,b,d),draftOnly:true,autonomousOutboundEnabled:false,automaticRepliesEnabled:false};
}));
