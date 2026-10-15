import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './db/schema.js';
import { seedInitialData } from './db/seed.js';
import { queueService } from './services/queue.service.js';
import { uploadsDir, rendersDir } from './db/database.js';

import { accountsRouter } from './routes/accounts.routes.js';
import { publishingRouter } from './routes/publishing.routes.js';
import { brandingRouter } from './routes/branding.routes.js';
import { inboxRouter } from './routes/inbox.routes.js';
import { activityRouter } from './routes/activity.routes.js';
import { analyticsRouter } from './routes/analytics.routes.js';
import { pipelineRouter } from './routes/pipeline.routes.js';
import { bridgeRouter } from './routes/bridge.routes.js';
import { eventsRouter } from './routes/events.routes.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize SQLite schema and seed demo data
initializeDatabase();
seedInitialData();

// Start persistent background queue worker
queueService.start();

// Static video serving with HTTP Range header support for seeking
app.use('/uploads/renders', express.static(rendersDir, { acceptRanges: true }));
app.use('/uploads', express.static(uploadsDir, { acceptRanges: true }));

// API Routes
app.use('/api/accounts', accountsRouter);
app.use('/api/publishing', publishingRouter);
app.use('/api/branding', brandingRouter);
app.use('/api/inbox', inboxRouter);
app.use('/api/activity', activityRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/bridge', bridgeRouter);
app.use('/api/events', eventsRouter);

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    app: 'Social Command Center',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    timezone: 'Asia/Bangkok',
  });
});

// Production: Serve built frontend from client/dist if present
const clientDist = path.resolve(process.cwd(), 'client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.resolve(clientDist, 'index.html'));
  });
}

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('[Server] Shutting down gracefully...');
  queueService.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Server] Terminating...');
  queueService.stop();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Social Command Center API running on http://localhost:${PORT}`);
  console.log(`🎬 Video uploads serving at http://localhost:${PORT}/uploads`);
  console.log(`⚡ Timezone: Asia/Bangkok`);
  console.log(`=======================================================`);
});
