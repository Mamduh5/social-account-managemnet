import {Router} from 'express';
import {operatorWorkspaceService as service} from '../services/operator-workspace.service.js';
export const operatorRouter=Router();
const wrap=(fn:any)=>(req:any,res:any)=>Promise.resolve().then(()=>fn(req,res)).catch((e:any)=>res.status(e.message?.includes('migration')?503:400).json({error:e.message || 'Operator request failed'}));
operatorRouter.get('/pages/:id/context',wrap((req:any,res:any)=>res.json(service.context(req.params.id))));
operatorRouter.post('/plans',wrap((req:any,res:any)=>res.json(service.prepare(req.body))));
