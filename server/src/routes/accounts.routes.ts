import { Router } from 'express';
import { db } from '../db/database.js';
import { getConnector } from '../connectors/registry.js';

export const accountsRouter = Router();

// GET all accounts
accountsRouter.get('/', (req, res) => {
  const accounts = db.prepare(`
    SELECT a.*, c.name as category_name, c.color as category_color, c.slug as category_slug
    FROM accounts a
    LEFT JOIN categories c ON a.category_id = c.id
    ORDER BY a.created_at ASC
  `).all() as any[];

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

// GET single account
accountsRouter.get('/:id', (req, res) => {
  const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as any;
  if (!acc) return res.status(404).json({ error: 'Account not found' });
  const connector = getConnector(acc);
  res.json({
    account: {
      ...acc,
      capabilities: connector.getCapabilities(),
      brandKit: acc.brand_kit_json ? JSON.parse(acc.brand_kit_json) : null,
    },
  });
});

// POST new account
accountsRouter.post('/', (req, res) => {
  const { categoryId, platform, accountType, name, handle, avatarUrl, connectorMode, accessToken, brandKit } = req.body;
  if (!platform || !name || !handle) {
    return res.status(400).json({ error: 'Platform, Name, and Handle are required.' });
  }

  const id = `acc-${platform === 'facebook' ? 'fb' : 'tt'}-${Date.now().toString(36)}`;
  const brandKitJson = brandKit ? JSON.stringify(brandKit) : '{}';

  db.prepare(`
    INSERT INTO accounts (
      id, category_id, platform, account_type, name, handle, avatar_url,
      connector_mode, access_token, brand_kit_json, status, health_status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'connected', 'Healthy')
  `).run(
    id,
    categoryId || null,
    platform,
    accountType || 'page',
    name,
    handle,
    avatarUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150',
    connectorMode || 'simulator',
    accessToken || null,
    brandKitJson
  );

  res.json({ success: true, id });
});

// PUT update account
accountsRouter.put('/:id', (req, res) => {
  const { categoryId, name, handle, avatarUrl, connectorMode, accessToken, brandKit, status } = req.body;
  const current = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as any;
  if (!current) return res.status(404).json({ error: 'Account not found' });

  const brandKitJson = brandKit ? JSON.stringify(brandKit) : current.brand_kit_json;

  db.prepare(`
    UPDATE accounts SET
      category_id = COALESCE(?, category_id),
      name = COALESCE(?, name),
      handle = COALESCE(?, handle),
      avatar_url = COALESCE(?, avatar_url),
      connector_mode = COALESCE(?, connector_mode),
      access_token = COALESCE(?, access_token),
      brand_kit_json = ?,
      status = COALESCE(?, status),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    categoryId !== undefined ? categoryId : current.category_id,
    name || current.name,
    handle || current.handle,
    avatarUrl || current.avatar_url,
    connectorMode || current.connector_mode,
    accessToken !== undefined ? accessToken : current.access_token,
    brandKitJson,
    status || current.status,
    req.params.id
  );

  res.json({ success: true });
});

// DELETE account
accountsRouter.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM accounts WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// POST reconnect account
accountsRouter.post('/:id/reconnect', (req, res) => {
  const current = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as any;
  if (!current) return res.status(404).json({ error: 'Account not found' });

  db.prepare(`
    UPDATE accounts
    SET status = 'connected', health_status = 'Healthy (Reconnected)', last_health_check = datetime('now')
    WHERE id = ?
  `).run(req.params.id);

  db.prepare(`
    INSERT INTO activity_events (id, type, account_id, title, message, severity)
    VALUES (?, 'account_alert', ?, 'Account Reconnected', ?, 'success')
  `).run(`act-${Date.now()}`, req.params.id, `Account ${current.name} was successfully reconnected.`);

  res.json({ success: true, message: `Account ${current.name} reconnected.` });
});

// POST test health
accountsRouter.post('/:id/test-health', async (req, res) => {
  const acc = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.id) as any;
  if (!acc) return res.status(404).json({ error: 'Account not found' });

  const connector = getConnector(acc);
  const health = await connector.verifyHealth(acc);

  db.prepare(`
    UPDATE accounts
    SET status = ?, health_status = ?, last_health_check = datetime('now')
    WHERE id = ?
  `).run(health.status, health.healthStatus, req.params.id);

  res.json({ success: true, health });
});

// --- CATEGORIES ---

// GET categories
accountsRouter.get('/categories/all', (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, count(a.id) as account_count
    FROM categories c
    LEFT JOIN accounts a ON c.id = a.category_id
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all();
  res.json({ categories });
});

// POST category
accountsRouter.post('/categories', (req, res) => {
  const { name, slug, description, color } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const finalSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const id = `cat-${Date.now().toString(36)}`;

  db.prepare(`
    INSERT INTO categories (id, name, slug, description, color)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, finalSlug, description || '', color || '#6366F1');

  res.json({ success: true, id });
});

// PUT category
accountsRouter.put('/categories/:id', (req, res) => {
  const { name, description, color } = req.body;
  db.prepare(`
    UPDATE categories SET
      name = COALESCE(?, name),
      description = COALESCE(?, description),
      color = COALESCE(?, color)
    WHERE id = ?
  `).run(name, description, color, req.params.id);
  res.json({ success: true });
});

// DELETE category
accountsRouter.delete('/categories/:id', (req, res) => {
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});
