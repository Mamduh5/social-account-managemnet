import {Router} from 'express';
import {videoReviewService,VideoReviewService} from '../services/video-review.service.js';
export function videoReviewRouter(service:VideoReviewService=videoReviewService){const router=Router();
  router.get('/',async(_req,res)=>{try{res.json(await service.run('list'));}catch(e){res.status(503).json({error:e instanceof Error?e.message:'Review unavailable'});}});
  for(const [route,action] of [['decision','decide'],['edit','edit'],['publication-policy/preview','preview'],['publication-policy/proposal','proposal'],['publication-policy/revoke','revoke']] as const){router.post('/'+route,async(req,res)=>{try{res.json(await service.run(action,req.body));}catch(e){res.status(409).json({error:e instanceof Error?e.message:'Review action did not complete'});}});}
  return router;
}
