import { Router } from 'express';
import { activityRepo } from '../repositories/activity.repo.js';

export const activityRouter = Router();

activityRouter.get('/', (req, res) => {
  const { type, severity, limit } = req.query;
  const events = activityRepo.getRecentEvents({
    type: type as string,
    severity: severity as string,
    limit: Number(limit) || 50,
  });
  res.json({ events });
});

activityRouter.delete('/:id', (req, res) => {
  activityRepo.deleteEvent(req.params.id);
  res.json({ success: true });
});
