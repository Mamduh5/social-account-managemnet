import 'dotenv/config';
import express from 'express';
import { localAccess } from './local-access.js';
import cors from 'cors';
import { connectionsRouter } from './routes/connections.routes.js';
import { indexExistingIdentities } from './services/accounts.service.js';
import { emptyCapabilities } from './connectors/registry.js';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './db/schema.js';
import { seedInitialData } from './db/seed.js';
import { queueService } from './services/queue.service.js';
import { syncService } from './services/sync.service.js';
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

// This self-hosted instance is loopback-only. Public OAuth callbacks need a separate review.
app.use(localAccess);
app.use(cors({ origin: ['http://localhost:5180', 'http://127.0.0.1:5180'] }));
app.use(express.json());

// Initialize SQLite schema and seed demo data
initializeDatabase();
if (process.env.SCC_SEED_DEMOS !== 'false') seedInitialData();
indexExistingIdentities();

// Start persistent background queue worker & sync service
queueService.start();
syncService.start();

// Static video serving with HTTP Range header support for seeking
app.use('/uploads/renders', express.static(rendersDir, { acceptRanges: true }));
app.use('/uploads', express.static(uploadsDir, { acceptRanges: true }));

// API Routes
app.use('/api/accounts', accountsRouter);
app.use('/api/connections', connectionsRouter);
app.get('/api/connectors/capabilities', (_req, res) => res.json({ capabilities: emptyCapabilities, notice: 'Actual capabilities are resolved per account by GET /api/accounts. Registration and native preparation do not grant API permissions.' }));
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
    version: '1.5.0',
    timestamp: new Date().toISOString(),
    timezone: 'Asia/Bangkok',
  });
});

// Production: Serve built frontend from client/dist if present
const clientDist = path.resolve(process.cwd(), 'client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
      return res.sendFile(path.resolve(clientDist, 'index.html'));
    }
    next();
  });
}

// Process error handling
process.on('uncaughtException', (err) => {
  console.error('[Server Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Server Unhandled Rejection]:', reason);
});

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('[Server] Shutting down gracefully...');
  queueService.stop();
  syncService.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('[Server] Terminating...');
  queueService.stop();
  syncService.stop();
  process.exit(0);
});

app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`=======================================================`);
  console.log(`🚀 Social Command Center API running on http://localhost:${PORT}`);
  console.log(`🎬 Video uploads serving at http://localhost:${PORT}/uploads`);
  console.log(`⚡ Timezone: Asia/Bangkok`);
  console.log(`=======================================================`);
});
