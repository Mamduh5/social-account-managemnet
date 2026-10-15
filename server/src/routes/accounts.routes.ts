import { accountConnectionsRepo as registry } from '../repositories/account-connections.repo.js';
import {
  publicAccount,
  saveRegisteredAccount,
  archiveAccount,
} from '../services/accounts.service.js';
import { Router } from 'express';
import multer from 'multer';
import { saveAvatar } from '../services/avatars.service.js';
import { getConnector } from '../connectors/registry.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { activityRepo } from '../repositories/activity.repo.js';

export const accountsRouter = Router();

// Public projections never expose server credentials.
accountsRouter.get('/', (req, res) => {
  const accounts = accountsRepo.getAllAccounts(
    req.query.includeArchived === 'true'
  );
  res.setHeader('Cache-Control', 'no-store');
  res.json({ accounts: accounts.map(publicAccount) });
});
accountsRouter.post('/archive-demos', (_req, res) => {
  for (const a of accountsRepo.getAllAccounts())
    if ((a as any).is_demo) archiveAccount(a.id);
  res.json({ success: true });
});

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
}).single('avatar');
accountsRouter.post('/avatar', (req, res) => {
  avatarUpload(req, res, (error) => {
    if (error || !req.file)
      return res
        .status(400)
        .json({ error: 'Upload a PNG, JPEG or WebP avatar up to 2 MB' });
    try {
      res.json({ avatarUrl: saveAvatar(req.file.buffer) });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });
});

// --- CATEGORIES (Registered before :id to prevent route shadowing) ---

accountsRouter.get('/categories', (_req, res) => {
  const categories = accountsRepo.getAllCategories();
  res.json({ categories });
});

accountsRouter.get('/categories/all', (_req, res) => {
  const categories = accountsRepo.getAllCategories();
  res.json({ categories });
});

accountsRouter.post('/categories', (req, res) => {
  const { name, slug, description, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  // Protect against SQLite UNIQUE constraint failure by checking existing name
  const existingByName = accountsRepo.getCategoryByName(name);
  if (existingByName) {
    return res.json({
      success: true,
      id: existingByName.id,
      slug: existingByName.slug,
      existing: true,
    });
  }

  const baseSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  let finalSlug = baseSlug;

  const existingSlug = accountsRepo.getCategoryBySlug(finalSlug);
  if (existingSlug) {
    finalSlug = `${baseSlug}-${Date.now().toString(36)}`;
  }

  const id = `cat-${Date.now().toString(36)}`;

  try {
    accountsRepo.createCategory({
      id,
      name,
      slug: finalSlug,
      description: description || '',
      color: color || '#6366F1',
    });

    res.json({ success: true, id, slug: finalSlug });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

accountsRouter.put('/categories/:id', (req, res) => {
  const { name, description, color } = req.body;
  accountsRepo.updateCategory(req.params.id, { name, description, color });
  res.json({ success: true });
});

accountsRouter.delete('/categories/:id', (req, res) => {
  accountsRepo.deleteCategory(req.params.id);
  res.json({ success: true });
});

// --- ACCOUNTS BY ID ---
accountsRouter.get('/:id', (req, res) => {
  const account = accountsRepo.getAccountById(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });
  res.setHeader('Cache-Control', 'no-store');
  res.json({ account: publicAccount(account) });
});
accountsRouter.post('/', (req, res) => {
  try {
    const id = saveRegisteredAccount(req.body);
    activityRepo.logEvent({
      type: 'account_registered',
      accountId: id,
      title: 'Social account registered',
      message:
        'Public identity saved; ownership is unverified and API authorization is separate.',
      severity: 'info',
    });
    res.status(201).json({ success: true, id });
  } catch (e: any) {
    res
      .status(e.message.includes('already registered') ? 409 : 400)
      .json({ error: e.message });
  }
});
accountsRouter.put('/:id', (req, res) => {
  try {
    if (!accountsRepo.getAccountById(req.params.id))
      return res.status(404).json({ error: 'Account not found' });
    if (
      [
        'accessToken',
        'refreshToken',
        'connectorMode',
        'status',
        'healthStatus',
        'is_demo',
        'identity_verified_at',
      ].some((k) => k in req.body)
    )
      throw new Error(
        'Use the separate official authorization or browser-handoff workflow to manage connections'
      );
    saveRegisteredAccount(req.body, req.params.id);
    res.json({ success: true });
  } catch (e: any) {
    res
      .status(e.message.includes('already registered') ? 409 : 400)
      .json({ error: e.message });
  }
});
accountsRouter.delete('/:id', (req, res) => {
  try {
    archiveAccount(req.params.id);
    res.json({
      success: true,
      message: 'Account archived; history and videos preserved',
    });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});
accountsRouter.post('/:id/restore', (req, res) => {
  try {
    archiveAccount(req.params.id, false);
    res.json({ success: true });
  } catch (e: any) {
    res.status(404).json({ error: e.message });
  }
});
accountsRouter.post('/:id/reconnect', (req, res) => {
  const current = accountsRepo.getAccountById(req.params.id) as any;
  if (!current || current.archived_at)
    return res.status(404).json({ error: 'Active account not found' });
  if (!current.is_demo)
    return res
      .status(409)
      .json({
        error:
          'Official authorization required. Choose Connect API or Set Up Browser Handoff.',
      });
  accountsRepo.updateHealthStatus(
    current.id,
    'connected',
    'Demo simulator session reset'
  );
  res.json({ success: true, message: 'Demo session reset (simulated only)' });
});
accountsRouter.post('/:id/test-health', async (req, res) => {
  const account = accountsRepo.getAccountById(req.params.id) as any;
  if (!account) return res.status(404).json({ error: 'Account not found' });
  const health = await getConnector(account).verifyHealth(account);
  if (
    (accountsRepo.getAccountById(account.id) as any)?.connection_revision !==
    account.connection_revision
  )
    return res
      .status(409)
      .json({ error: 'Connection changed during health check; check again' });
  accountsRepo.updateHealthStatus(
    account.id,
    health.status,
    health.healthStatus,
    health.tokenExpiresAt
  );
  if (!account.is_demo && health.status !== 'connected') {
    registry.connectionStatus(
      account.id,
      health.status === 'expired'
        ? 'expired'
        : account.connector_mode === 'browser_bridge'
          ? 'limited'
          : 'authorization_required'
    );
  }
  res.json({ success: true, health });
});
