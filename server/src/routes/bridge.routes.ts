import { Router } from 'express';
import { bridgeConnector } from '../connectors/registry.js';
import { accountsRepo } from '../repositories/accounts.repo.js';

export const bridgeRouter = Router();

bridgeRouter.post('/launch-session', async (req, res) => {
  const { accountId } = req.body;
  if (!accountId) return res.status(400).json({ error: 'accountId is required' });

  const account = accountsRepo.getAccountById(accountId);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const result = await bridgeConnector.launchBrowserSession(account);
  res.json(result);
});

bridgeRouter.get('/status/:accountId', async (req, res) => {
  const account = accountsRepo.getAccountById(req.params.accountId);
  if (!account) return res.status(404).json({ error: 'Account not found' });

  const health = await bridgeConnector.verifyHealth(account);
  res.json({ health });
});
