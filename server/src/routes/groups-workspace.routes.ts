import { Router, type Request, type Response, type NextFunction } from 'express';
import { groupsWorkspaceService as service } from '../services/groups-workspace.service.js';
import { groupMembershipStatuses, type GroupListFilters, type GroupMembershipStatus } from '../domain/groups.js';

export const groupsRouter=Router();
groupsRouter.use((_req:Request,res:Response,next:NextFunction)=>{
  if (!service.ready()) return res.status(503).json({error:'External Groups requires the explicit offline owner-maintenance migration'});
  next();
});
const action=(fn:(req:Request)=>object)=>(req:Request,res:Response)=>{
  try { res.json({success:true,...fn(req)}); }
  catch (error) { res.status(400).json({error:error instanceof Error?error.message:'Invalid Group request'}); }
};
function id(req:Request) { const value=req.params.id;if(typeof value!=='string') throw new Error('Group identifier required');return value; }
function filters(req:Request):GroupListFilters {
  const query=(key:string)=>{ const value=req.query[key];if(value===undefined)return undefined;if(typeof value!=='string')throw new Error(`Invalid ${key} filter`);return value; };
  const bool=(key:string)=>{const value=query(key);if(value===undefined||value==='all')return undefined;if(value==='true')return true;if(value==='false')return false;throw new Error(`Invalid ${key} filter`);};
  const membership=query('membership');if(membership&&!groupMembershipStatuses.includes(membership as GroupMembershipStatus))throw new Error('Invalid membership filter');
  return {query:query('q')||query('query'),accountId:query('accountId'),membership:membership as GroupMembershipStatus|undefined,category:query('category'),shortlisted:bool('shortlisted'),archived:bool('archived')};
}
groupsRouter.get('/',action(req=>({groups:service.list(filters(req)),automationSupported:false})));
groupsRouter.get('/reminders',action(()=>({reminders:service.reminders(),automaticPosting:false})));
groupsRouter.post('/',action(req=>({group:service.save(undefined,req.body)})));
groupsRouter.put('/:id',action(req=>({group:service.save(id(req),req.body)})));
groupsRouter.get('/:id/review',action(req=>service.review(id(req))));
groupsRouter.post('/:id/membership',action(req=>({group:service.observe(id(req),req.body)})));
groupsRouter.get('/:id/prepared',action(req=>({prepared:service.prepared(id(req))})));
groupsRouter.post('/:id/prepared',action(req=>({prepared:service.prepare(id(req),req.body)})));
groupsRouter.get('/prepared/:id/package',action(req=>service.package(id(req))));
groupsRouter.post('/prepared/:id/receipt',action(req=>({prepared:service.receipt(id(req),req.body)})));
groupsRouter.post('/prepared/:id/reminder',action(req=>({prepared:service.reminder(id(req),req.body)})));
