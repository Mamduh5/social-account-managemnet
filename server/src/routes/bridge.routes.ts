import { Router } from 'express';
import { db } from '../db/database.js';
import { bridgeConnector } from '../connectors/registry.js';

export const bridgeRouter = Router();

bridgeRouter.post('/launch-session', async (req, res) => {
  const { accountId } = req.body;
  if (!accountId) return res.status(400).json({ error: 'accountId is required' });

  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId) as any;
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const result = await bridgeConnector.launchBrowserSession(account);
  res.json(result);
});

bridgeRouter.get('/status/:accountId', async (req, res) => {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(req.params.accountId) as any;
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const health = await bridgeConnector.verifyHealth(account);
  res.json({ health });
});
