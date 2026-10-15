import { Router } from 'express';
import { getConnector } from '../connectors/registry.js';
import { accountsRepo } from '../repositories/accounts.repo.js';
import { activityRepo } from '../repositories/activity.repo.js';

export const accountsRouter = Router();

// GET all accounts
accountsRouter.get('/', (_req, res) => {
  const accounts = accountsRepo.getAllAccounts();

  // Attach connector capabilities to each account
  const enriched = accounts.map((acc) => {
    const connector = getConnector(acc);
    return {
      ...acc,
      capabilities: connector.getCapabilities(),
      brandKit: acc.brand_kit_json ? JSON.parse(acc.brand_kit_json) : null,
      settings: acc.settings_json ? JSON.parse(acc.settings_json) : null,
    };
  });

  res.json({ accounts: enriched });
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
    return res.json({ success: true, id: existingByName.id, slug: existingByName.slug, existing: true });
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
  const acc = accountsRepo.getAccountById(req.params.id);
  if (!acc) return res.status(404).json({ error: 'Account not found' });

  const connector = getConnector(acc);
  res.json({
    account: {
      ...acc,
      capabilities: connector.getCapabilities(),
      brandKit: acc.brand_kit_json ? JSON.parse(acc.brand_kit_json) : null,
      settings: acc.settings_json ? JSON.parse(acc.settings_json) : null,
    },
  });
});

accountsRouter.post('/', (req, res) => {
  const { name, handle, platform, accountType, categoryId, connectorMode, accessToken, brandKit } = req.body;

  if (!name || !handle || !platform) {
    return res.status(400).json({ error: 'Name, handle, and platform are required' });
  }

  const id = `acc-${platform.substring(0, 2)}-${Date.now().toString(36)}`;
  const avatarUrl =
    platform === 'facebook'
      ? 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150'
      : 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=150';

  try {
    accountsRepo.createAccount({
      id,
      name,
      handle,
      platform,
      account_type: accountType || 'page',
      category_id: categoryId || null,
      avatar_url: avatarUrl,
      connector_mode: connectorMode || 'simulator',
      access_token: accessToken || null,
      brand_kit_json: brandKit ? JSON.stringify(brandKit) : null,
    });

    activityRepo.logEvent({
      type: 'account_connected',
      accountId: id,
      title: 'New Account Connected',
      message: `Account "${name}" (${handle}) connected under ${platform.toUpperCase()}.`,
      severity: 'info',
    });

    res.json({ success: true, id });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

accountsRouter.put('/:id', (req, res) => {
  const { name, handle, categoryId, connectorMode, accessToken, status, healthStatus } = req.body;

  try {
    accountsRepo.updateAccount(req.params.id, {
      name,
      handle,
      category_id: categoryId,
      connector_mode: connectorMode,
      access_token: accessToken,
      status,
      health_status: healthStatus,
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

accountsRouter.delete('/:id', (req, res) => {
  accountsRepo.deleteAccount(req.params.id);
  res.json({ success: true });
});

accountsRouter.post('/:id/reconnect', (req, res) => {
  const current = accountsRepo.getAccountById(req.params.id);
  if (!current) return res.status(404).json({ error: 'Account not found' });

  const refreshedExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
  accountsRepo.updateHealthStatus(
    req.params.id,
    'connected',
    'Healthy (Session Reconnected)',
    refreshedExpiresAt
  );

  activityRepo.logEvent({
    type: 'account_alert',
    accountId: req.params.id,
    title: 'Account Reconnected',
    message: `Account ${current.name} was successfully reconnected.`,
    severity: 'success',
  });

  res.json({ success: true, message: `Account ${current.name} reconnected.` });
});

accountsRouter.post('/:id/test-health', async (req, res) => {
  const account = accountsRepo.getAccountById(req.params.id);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const connector = getConnector(account);
  const health = await connector.verifyHealth(account);

  accountsRepo.updateHealthStatus(
    req.params.id,
    health.status,
    health.healthStatus,
    health.tokenExpiresAt
  );

  res.json({ success: true, health });
});
