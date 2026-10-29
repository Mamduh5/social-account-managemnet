import { Router } from 'express';
import { activityRepo } from '../repositories/activity.repo.js';

export const activityRouter = Router();

activityRouter.get('/', (req, res) => {
  const { type, severity } = req.query;
  const limit = Number(req.query.limit ?? 50), offset = Number(req.query.offset ?? 0);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || (severity && !['info','success','warning','error'].includes(String(severity)))) return res.status(400).json({error:'Use limit 1–100, a nonnegative offset and a valid severity.'});
  const filters = {
    type: type as string,
    severity: severity as string,
    limit, offset,
  };
  const events = activityRepo.getRecentEvents(filters);
  const total = activityRepo.getEventCount(filters);
  res.json({ events, total, limit, offset, hasMore: offset + events.length < total });
});

activityRouter.delete('/:id', (req, res) => {
  try { activityRepo.deleteEvent(req.params.id); res.json({ success: true }); }
  catch (error) { res.status(409).json({error:error instanceof Error ? error.message : 'This safety record must be retained.'}); }
});
