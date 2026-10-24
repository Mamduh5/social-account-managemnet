import {Router} from 'express';
import {timingSafeEqual} from 'node:crypto';
export function runtimeControlRouter(options:{token:string;busy:()=>boolean;shutdown:()=>void}){
 const router=Router();
 router.post('/shutdown',(req,res)=>{
  const provided=Buffer.from(String(req.headers['x-scc-runtime-control']||'')),expected=Buffer.from(options.token);
  if(expected.length<32||provided.length!==expected.length||!timingSafeEqual(provided,expected))return res.status(403).json({error:'Runtime control authorization required'});
  if(options.busy())return res.status(409).json({error:'Runtime is busy; no worker or job was stopped. Wait for the existing operation to finish.'});
  res.once('finish',options.shutdown);res.status(202).json({stopping:true});
 });
 return router;
}
