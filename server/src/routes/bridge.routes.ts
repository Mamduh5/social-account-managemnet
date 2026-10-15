import fs from 'node:fs';
import { publishingRepo } from '../repositories/publishing.repo.js';
import { Router } from 'express';
import { bridgeConnector } from '../connectors/registry.js';
import { accountsRepo } from '../repositories/accounts.repo.js';

export const bridgeRouter = Router();

bridgeRouter.post('/launch-session', async (req, res) => {
  const { accountId } = req.body;
  if (!accountId)
    return res.status(400).json({ error: 'accountId is required' });

  const account = accountsRepo.getAccountById(accountId);
  if (!account || (account as any).archived_at)
    return res.status(404).json({ error: 'Active account not found' });

  const result = await bridgeConnector.launchBrowserSession(account);
  res.json(result);
});

bridgeRouter.get('/status/:accountId', async (req, res) => {
  const account = accountsRepo.getAccountById(req.params.accountId);
  if (!account || (account as any).archived_at)
    return res.status(404).json({ error: 'Active account not found' });

  const health = await bridgeConnector.verifyHealth(account);
  res.json({ health });
});

// Prepared packages are destination-specific; never accept an arbitrary file path from a request.
bridgeRouter.get('/destinations/:id/package', (req, res) => {
  const dest = publishingRepo.getHandoffDestination(req.params.id);
  if (!dest || dest.status !== 'awaiting_confirmation')
    return res
      .status(409)
      .json({ error: 'Destination is not awaiting manual confirmation' });
  const account = accountsRepo.getAccountById(dest.account_id) as any;
  if (!account || account.archived_at)
    return res.status(409).json({ error: 'Account is archived' });
  res.json({
    accountId: account.id,
    accountName: account.name,
    handle: account.handle,
    platform: account.platform,
    publicUrl: account.public_url,
    caption: dest.caption,
    hashtags: dest.hashtags,
    downloadUrl: `/api/bridge/destinations/${dest.id}/download`,
    nativeUrl:
      account.platform === 'facebook'
        ? `https://business.facebook.com/latest/composer${account.external_id ? '?page_id=' + encodeURIComponent(account.external_id) : ''}`
        : 'https://www.tiktok.com/tiktokstudio/upload',
    notice:
      'Verify the signed-in native account and destination before uploading. Download and publish the prepared MP4 yourself, then record the post URL. Opening the site does not confirm publication.',
  });
});
bridgeRouter.get('/destinations/:id/download', (req, res) => {
  const dest = publishingRepo.getHandoffDestination(req.params.id);
  if (!dest || dest.status !== 'awaiting_confirmation')
    return res.status(409).json({ error: 'Prepared destination not found' });
  const account = accountsRepo.getAccountById(dest.account_id) as any;
  if (!account || account.archived_at)
    return res.status(409).json({ error: 'Account is archived' });
  const file = dest.branded_video_path || dest.original_video_path;
  if (!file || !fs.existsSync(file))
    return res.status(404).json({ error: 'Prepared MP4 is unavailable' });
  res.download(file, `${account.id}-${dest.id}.mp4`, { dotfiles: 'allow' });
});
