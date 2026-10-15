import { Router } from 'express';
import { eventService } from '../services/events.service.js';

export const eventsRouter = Router();

eventsRouter.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const clientId = `client-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  eventService.addClient(clientId, res);

  req.on('close', () => {
    eventService.removeClient(clientId);
  });
});
