import { Router } from 'express';
import { weeklyContentService as service } from '../services/weekly-content.service.js';

export const weeklyContentRouter = Router();
const wrap = (fn: (req: any) => unknown) => (req: any, res: any) => Promise.resolve().then(() => fn(req)).then(plan => res.json({ plan })).catch(error => res.status(error.message?.includes('migration') ? 503 : 400).json({ error: error.message || 'Weekly workflow held' }));
weeklyContentRouter.get('/', (_req, res, next) => { try { res.json(service.index()); } catch (error) { next(error); } });
weeklyContentRouter.post('/plans', wrap(req => service.create(req.body)));
weeklyContentRouter.get('/plans/:id', wrap(req => service.get(req.params.id)));
weeklyContentRouter.put('/plans/:id', wrap(req => service.edit(req.params.id, req.body)));
weeklyContentRouter.post('/plans/:id/collect', wrap(req => service.collect(req.params.id, req.body)));
weeklyContentRouter.post('/plans/:id/evidence', wrap(req => service.addEvidence(req.params.id, req.body)));
weeklyContentRouter.post('/plans/:id/analyze', wrap(req => service.analyze(req.params.id, req.body)));
weeklyContentRouter.post('/plans/:id/import-analysis', wrap(req => service.importAnalysis(req.params.id, req.body)));
weeklyContentRouter.post('/plans/:id/approve-planning', wrap(req => service.approvePlanning(req.params.id, req.body)));
weeklyContentRouter.post('/plans/:id/prepare', wrap(req => service.prepare(req.params.id, req.body)));
weeklyContentRouter.post('/plans/:id/materialize', wrap(req => service.materialize(req.params.id, req.body)));
weeklyContentRouter.post('/plans/:id/schedule-group', wrap(req => service.scheduleGroup(req.params.id, req.body)));
weeklyContentRouter.post('/plans/:id/outcomes', wrap(req => service.outcomes(req.params.id, req.body)));
