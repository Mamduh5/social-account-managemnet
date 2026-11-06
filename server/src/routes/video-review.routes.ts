import {Router} from 'express';
import {videoReviewService,VideoReviewService} from '../services/video-review.service.js';
export function videoReviewRouter(service:VideoReviewService=videoReviewService){const router=Router();
  router.get('/reel-preparation',async(_req,res)=>{try{res.json(await service.run('reelPreparation'));}catch(e){res.status(503).json({error:e instanceof Error?e.message:'Reel preparation status unavailable'});}});
  router.get('/page-content',async(_req,res)=>{try{res.json(await service.run('pageContent'));}catch(e){res.status(503).json({error:e instanceof Error?e.message:'Preparation unavailable'});}});
  router.post('/image-policy/control',async(req,res)=>{try{res.json(await service.run('imagePolicyControl',req.body));}catch(e){res.status(409).json({error:e instanceof Error?e.message:'Image policy control unavailable'});}});
  router.post('/publication-stream/proposal',async(req,res)=>{try{res.json(await service.run('generalProposal',req.body));}catch(e){res.status(409).json({error:e instanceof Error?e.message:'Disabled proposal unavailable'});}});
  router.get('/',async(_req,res)=>{try{res.json(await service.run('list'));}catch(e){res.status(503).json({error:e instanceof Error?e.message:'Review unavailable'});}});
  router.get('/publication-status',async(req,res)=>{try{res.json(await service.run('publicationStatus',{accountId:req.query.accountId}));}catch(e){res.status(503).json({error:e instanceof Error?e.message:'Publication status unavailable'});}});
  for(const [route,action] of [['decision','decide'],['edit','edit'],['publication-policy/preview','preview'],['publication-policy/proposal','proposal'],['publication-policy/revoke','revoke'],['publication-policy/control','publicationControl']] as const){router.post('/'+route,async(req,res)=>{try{res.json(await service.run(action,req.body));}catch(e){res.status(409).json({error:e instanceof Error?e.message:'Review action did not complete'});}});}
  return router;
}
